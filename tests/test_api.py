from fastapi.testclient import TestClient
from backend.app import app


def test_untrusted_origin_cannot_start_a_job():
    response=TestClient(app).post('/api/process',headers={'Origin':'https://untrusted.example'})
    assert response.status_code==403


def test_negative_evidence_index_is_not_python_wraparound():
    response=TestClient(app).get('/api/evidence/-1')
    assert response.status_code==404
