import json
import os
import queue
import threading
from pathlib import Path
from typing import Any, Callable

from fastapi.responses import StreamingResponse

ROOT = Path(__file__).resolve().parent.parent  # engine/


class Cancelled(Exception):
    pass


Emit = Callable[..., None]


def stream(work: Callable[[Emit, threading.Event], Any]) -> StreamingResponse:
    """Roda `work` numa thread e devolve o progresso como NDJSON (uma linha por evento).
    Se o cliente desconectar (Main cancelou), `cancel` é ligado e o trabalho para no próximo checkpoint."""
    q: queue.Queue = queue.Queue()
    cancel = threading.Event()

    def run():
        try:
            result = work(lambda **ev: q.put(ev), cancel)
            q.put({"done": True, "result": result})
        except Cancelled:
            q.put({"cancelled": True})
        except Exception as e:  # noqa: BLE001 — o erro vai para o Main mostrar ao usuário
            q.put({"error": f"{type(e).__name__}: {e}"})
        finally:
            q.put(None)

    threading.Thread(target=run, daemon=True).start()

    def gen():
        try:
            while (ev := q.get()) is not None:
                yield json.dumps(ev, ensure_ascii=False) + "\n"
        finally:
            cancel.set()

    return StreamingResponse(gen(), media_type="application/x-ndjson")


def check(cancel: threading.Event) -> None:
    if cancel.is_set():
        raise Cancelled()


def read_json(p: Path) -> Any:
    return json.loads(p.read_text(encoding="utf-8"))


def write_json(p: Path, data: Any) -> None:
    """Escrita atômica: um crash no meio nunca deixa um JSON pela metade (a fila retoma pelo arquivo)."""
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, p)


def models_config() -> dict:
    return read_json(ROOT / "models.json")
