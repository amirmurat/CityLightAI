import json
import threading
import subprocess
import os
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import sqlite3
from .process import process, DATA, RUNS, ROOT

app = FastAPI(title="CityLightAI", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"], allow_methods=["GET", "POST"], allow_headers=["Content-Type"])
job = {"status": "idle"}
lock = threading.Lock()


@app.get("/api/status")
def status():
    return {"job": job, "assets_ready": (DATA / "intersection.mp4").exists() and (DATA / "yolox_s.onnx").exists(), "run_ready": (RUNS / "latest.json").exists()}


@app.get("/api/run")
def run():
    path = RUNS / "latest.json"
    if not path.exists(): raise HTTPException(404, "No inference run yet")
    return json.loads(path.read_text())


@app.get("/api/calibration")
def calibration():
    return json.loads((DATA / "calibration.json").read_text())


@app.get("/api/video")
def video():
    return FileResponse(DATA / "intersection.mp4", media_type="video/mp4")


@app.get("/api/chain")
def chain():
    path = RUNS / "chain.json"
    config = json.loads((DATA / "program.json").read_text())
    if path.exists():
        result = json.loads(path.read_text())
        if result.get('run_id') == run()['metadata']['run_id']:
            return result
    return {"status": "not_published", "receipts": [], "program_id": config['program_id']}


@app.get("/api/evidence/{sequence}")
def evidence(sequence: int):
    records = run()["evidence"]
    if sequence < 0 or sequence >= len(records): raise HTTPException(404)
    return records[sequence]


@app.post("/api/process")
def start(request: Request):
    origin = request.headers.get('origin')
    if origin and origin not in ("http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:8000", "http://localhost:8000"):
        raise HTTPException(403, "Untrusted request origin")
    with lock:
        if job["status"] in ("running", "publishing"): raise HTTPException(409, "A run is already in progress")
        job.clear(); job.update(status="running")
    def worker():
        try:
            result = process(lambda p: job.update(p))
            job.update(status="publishing", run_id=result["metadata"]["run_id"])
            try:
                command = [os.environ.get('CITYLIGHT_NODE', 'node'), str(ROOT / 'node_modules' / 'tsx' / 'dist' / 'cli.mjs'), 'scripts/chain.ts', 'publish']
                completed = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=180)
                if completed.returncode:
                    raise RuntimeError((completed.stderr or completed.stdout)[-700:])
                published = json.loads((RUNS/'chain.json').read_text())
                with sqlite3.connect(RUNS/'audit.db') as db:
                    for receipt in published['receipts']:
                        db.execute("UPDATE outbox SET status='finalized', signature=?, receipt=? WHERE run_id=? AND sequence=?", (receipt['signature'], receipt['address'], result['metadata']['run_id'], receipt['sequence']))
                job.update(status='complete', publication='finalized')
            except Exception as e:
                job.update(status='complete', publication='pending', publication_error=str(e))
        except Exception as e:
            job.update(status="error", error=str(e))
    threading.Thread(target=worker, daemon=True).start()
    return job


if (ROOT / 'dist').exists():
    app.mount('/', StaticFiles(directory=ROOT/'dist', html=True), name='dashboard')
