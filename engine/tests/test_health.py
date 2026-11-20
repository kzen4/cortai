from fastapi.testclient import TestClient

from cortai_engine.server import create_app


def test_health_exige_token():
    c = TestClient(create_app("seg"))
    assert c.get("/health").status_code == 401
    r = c.get("/health", headers={"X-Cortai-Token": "seg"})
    assert r.status_code == 200 and r.json()["ok"] is True
