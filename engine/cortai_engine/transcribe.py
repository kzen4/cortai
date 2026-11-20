import gc
import os
import sys
import threading
from pathlib import Path

from . import segment
from .util import Emit, check, models_config, write_json

_dlls_done = False


def _cuda_dlls() -> None:
    """No Windows o CTranslate2 procura cuBLAS/cuDNN no PATH: aponta para as DLLs dos pacotes nvidia-*."""
    global _dlls_done
    if _dlls_done or sys.platform != "win32":
        return
    _dlls_done = True
    base = Path(sys.prefix) / "Lib" / "site-packages" / "nvidia"
    for b in base.glob("*/bin"):
        os.add_dll_directory(str(b))
        os.environ["PATH"] = str(b) + os.pathsep + os.environ["PATH"]


def repo_for(name: str) -> str:
    return models_config()["whisper"].get(name, {}).get("repo", name)


def installed(name: str) -> bool:
    from huggingface_hub import snapshot_download

    try:
        snapshot_download(repo_for(name), local_files_only=True)
        return True
    except Exception:  # noqa: BLE001
        return False


def download(name: str, emit: Emit, cancel: threading.Event) -> None:
    """Baixa o modelo no cache do Hugging Face (retoma downloads parciais e confere o hash dos arquivos)."""
    from huggingface_hub import HfApi, snapshot_download
    from huggingface_hub.constants import HF_HUB_CACHE

    repo = repo_for(name)
    total = sum(s.size or 0 for s in HfApi().model_info(repo, files_metadata=True).siblings or [])
    blobs = Path(HF_HUB_CACHE) / f"models--{repo.replace('/', '--')}" / "blobs"
    stop = threading.Event()

    def watch():  # ponytail: progresso = bytes já no cache (inclui .incomplete); sem depender do tqdm interno
        while not stop.wait(0.5):
            got = sum(f.stat().st_size for f in blobs.glob("*")) if blobs.exists() else 0
            emit(progress=min(1.0, got / max(total, 1)), bytes=got, total=total)

    threading.Thread(target=watch, daemon=True).start()
    try:
        # ponytail: cancelar só vale entre arquivos (o hub não tem abort); o .incomplete é retomado depois
        snapshot_download(repo)
        check(cancel)
    finally:
        stop.set()


def load(name: str):
    _cuda_dlls()
    from faster_whisper import WhisperModel

    try:
        return WhisperModel(repo_for(name), device="cuda", compute_type="float16"), "cuda"
    except Exception:  # noqa: BLE001 — sem GPU NVIDIA ou sem driver: CPU
        return WhisperModel(repo_for(name), device="cpu", compute_type="int8"), "cpu"


def transcribe(project_dir: str, model: str, language: str, emit: Emit, cancel: threading.Event) -> dict:
    d = Path(project_dir)
    out = d / "analysis" / "transcript.json"
    if out.exists():
        return {"skipped": True}
    emit(stage="loading")
    m, device = load(model)
    try:
        segments, info = m.transcribe(
            str(d / "cache" / "audio.wav"),
            language=None if language == "auto" else language,
            word_timestamps=True,
            vad_filter=True,
            condition_on_previous_text=False,  # evita laços de repetição em áudios longos
        )
        words: list[dict] = []
        for seg in segments:
            check(cancel)
            for w in seg.words or []:
                text = w.word.strip()
                if text:
                    words.append({"i": len(words), "text": text, "start": round(w.start, 3),
                                  "end": round(w.end, 3), "conf": round(w.probability, 3)})
            emit(progress=min(1.0, seg.end / max(info.duration, 1)), words=len(words), device=device)
    finally:
        del m
        gc.collect()  # libera a VRAM antes do LLM entrar
    transcript = {"language": info.language, "words": words, "sentences": segment.sentences(words)}
    write_json(out, transcript)
    return {"words": len(words), "language": info.language, "device": device}
