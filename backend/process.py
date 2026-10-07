import json
import secrets
import sqlite3
import time
from dataclasses import asdict
from pathlib import Path
import cv2
from .vision import Detector, Tracker
from .controller import Controller, Policy
from .evidence import canonical, digest, file_hash

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
RUNS = DATA / "runs"


def process(progress=lambda x: None):
    config = json.loads((DATA / "calibration.json").read_text())
    model = DATA / "yolox_s.onnx"; video = DATA / "intersection.mp4"
    if not model.exists() or not video.exists():
        raise FileNotFoundError("Run scripts/download-assets.ps1 first")
    detector = Detector(model); tracker = Tracker(); policy = Policy(); controller = Controller(policy)
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise RuntimeError("Cannot decode video")
    fps = cap.get(cv2.CAP_PROP_FPS); total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if fps <= 0 or total <= 0:
        raise ValueError("Invalid video timing metadata")
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)); height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration_ms = int(total / fps * 1000)
    run_id = secrets.token_hex(16)
    RUNS.mkdir(parents=True, exist_ok=True)
    metadata = {"schema": 1, "run_id": run_id, "intersection": config["intersection"], "source_mode": "recorded_video", "video_sha256": file_hash(video), "model_sha256": file_hash(model), "calibration_sha256": file_hash(DATA / "calibration.json"), "policy": asdict(policy), "width": width, "height": height, "duration_ms": duration_ms}
    metadata["controller_sha256"] = file_hash(ROOT / "backend" / "controller.py")
    metadata["perception_sha256"] = file_hash(ROOT / "backend" / "vision.py")
    metadata["policy_hash"] = digest({k: metadata[k] for k in ("policy", "model_sha256", "calibration_sha256", "controller_sha256", "perception_sha256")})
    frames = []; evidence = []; started = time.perf_counter(); index = 0
    stride = max(1, round(fps * config["sample_interval_ms"] / 1000))
    try:
        while True:
            ok, frame = cap.read()
            if not ok: break
            if index % stride == 0:
                now_ms = round(index / fps * 1000)
                detections, latency = detector.detect_regions(frame, config['zones'])
                tracked, approaches = tracker.update(detections, now_ms, config["zones"], width, height)
                decision = controller.step(now_ms, approaches, now_ms)
                record = {"time_ms": now_ms, "detections": tracked, "approaches": approaches, "decision": decision, "inference_ms": latency}
                frames.append(record)
                if decision["transition"] and decision["phase"].endswith("GREEN") or not evidence:
                    bundle = {"schema": 1, "sequence": len(evidence), "run": metadata, "observation": record}
                    evidence.append({"bundle": bundle, "hash": digest(bundle)})
                progress({"processed_ms": now_ms, "duration_ms": duration_ms, "frames": len(frames)})
            index += 1
    finally:
        cap.release()
    if not frames: raise RuntimeError("No frames were processed")
    result = {"metadata": metadata, "frames": frames, "evidence": evidence, "processing_ms": int((time.perf_counter()-started)*1000)}
    path = RUNS / f"{run_id}.json"
    for destination in (path, RUNS / "latest.json"):
        temporary = destination.with_suffix('.tmp')
        temporary.write_text(json.dumps(result), encoding='utf-8')
        temporary.replace(destination)
    with sqlite3.connect(RUNS / "audit.db") as db:
        db.execute("CREATE TABLE IF NOT EXISTS outbox (run_id TEXT, sequence INTEGER, hash TEXT, evidence TEXT, status TEXT DEFAULT 'pending', signature TEXT, receipt TEXT, PRIMARY KEY(run_id,sequence))")
        for item in evidence:
            db.execute("INSERT INTO outbox(run_id,sequence,hash,evidence) VALUES (?,?,?,?)", (run_id,item["bundle"]["sequence"],item["hash"],canonical(item["bundle"]).decode()))
    return result


if __name__ == "__main__":
    result = process(lambda p: print(f"{p['processed_ms']/1000:.1f}/{p['duration_ms']/1000:.1f}s", flush=True))
    print(json.dumps({"run_id": result["metadata"]["run_id"], "samples": len(result["frames"]), "receipts": len(result["evidence"]), "processing_ms": result["processing_ms"]}))
