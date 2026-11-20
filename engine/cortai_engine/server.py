"""Sidecar do Cortaí: FastAPI em 127.0.0.1, porta escolhida pelo Main, token no header.
Trabalhos longos respondem NDJSON (uma linha de progresso por evento; a última traz done/error/cancelled).
ponytail: NDJSON por HTTP em vez de WebSocket; mesmo efeito, menos código."""
import argparse
import os

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

from . import analyze, reframe, transcribe
from .ollama import DEFAULT_URL
from .util import models_config, stream

VERSION = "0.1.0"


class TranscribeReq(BaseModel):
    dir: str
    model: str
    language: str = "auto"


class AnalyzeReq(BaseModel):
    dir: str
    llm: str
    settings: dict
    ollamaUrl: str = DEFAULT_URL


class ReframeReq(BaseModel):
    dir: str
    source: str
    clips: list[dict]


class ModelReq(BaseModel):
    name: str


def create_app(token: str) -> FastAPI:
    def auth(x_cortai_token: str | None = Header(default=None)):
        if x_cortai_token != token:
            raise HTTPException(status_code=401, detail="token inválido")

    app = FastAPI(title="cortai-engine", version=VERSION, dependencies=[Depends(auth)])

    @app.get("/health")
    def health():
        return {"ok": True, "version": VERSION, "pid": os.getpid()}

    @app.get("/models")
    def models():
        cfg = models_config()
        return {**cfg, "whisperInstalled": [n for n in cfg["whisper"] if transcribe.installed(n)]}

    @app.post("/models/whisper")
    def whisper_download(r: ModelReq):
        return stream(lambda emit, cancel: transcribe.download(r.name, emit, cancel))

    @app.post("/transcribe")
    def do_transcribe(r: TranscribeReq):
        return stream(lambda emit, cancel: transcribe.transcribe(r.dir, r.model, r.language, emit, cancel))

    @app.post("/analyze")
    def do_analyze(r: AnalyzeReq):
        return stream(lambda emit, cancel: analyze.analyze(r.dir, r.llm, r.settings, emit, cancel, r.ollamaUrl))

    @app.post("/reframe")
    def do_reframe(r: ReframeReq):
        return stream(lambda emit, cancel: reframe.reframe(r.dir, r.source, r.clips, emit, cancel))

    return app


def main() -> None:
    import uvicorn

    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, required=True)
    args = p.parse_args()
    token = os.environ["CORTAI_TOKEN"]
    uvicorn.run(create_app(token), host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
