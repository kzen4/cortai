"""Reenquadramento: acha o rosto a 5 fps, suaviza e gera keyframes da janela de corte (SPEC §8, etapa 7).
Coordenadas: x/y = centro da janela, normalizados (0–1) no quadro original; t relativo ao início do corte."""
import threading
from pathlib import Path

import cv2
import numpy as np

from .util import ROOT, Emit, check, write_json

SAMPLE_FPS = 5
DET_W = 640
MODEL = ROOT / "models" / "face_detection_yunet_2023mar.onnx"


def detect_track(cap, fps: float, t0: float, t1: float, det, cancel: threading.Event) -> list[tuple[float, float | None, float | None]]:
    """(t relativo, cx, cy) por amostra; None quando não há rosto. Escolhe o maior rosto (V1: quem fala)."""
    cap.set(cv2.CAP_PROP_POS_MSEC, t0 * 1000)
    step = max(1, round(fps / SAMPLE_FPS))
    out, k = [], 0
    while True:
        t = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000
        if t > t1 or not cap.grab():
            break
        if k % step == 0:
            check(cancel)
            ok, frame = cap.retrieve()
            if not ok:
                break
            h, w = frame.shape[:2]
            s = DET_W / w
            small = cv2.resize(frame, (DET_W, round(h * s)))
            det.setInputSize((small.shape[1], small.shape[0]))
            _, faces = det.detect(small)
            if faces is not None and len(faces):
                x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])[:4]
                out.append((t - t0, (x + fw / 2) / small.shape[1], (y + fh / 2) / small.shape[0]))
            else:
                out.append((t - t0, None, None))
        k += 1
    return out


def keyframes(track, dead_zone: float = 0.06, smooth_s: float = 1.2) -> list[dict]:
    """Preenche buracos, suaviza (média móvel) e só move a câmera quando o rosto sai da zona morta."""
    if not track:
        return [{"t": 0, "x": 0.5, "y": 0.5, "zoom": 1, "ease": "smooth", "auto": True}]
    ts = np.array([p[0] for p in track])
    xs = np.array([np.nan if p[1] is None else p[1] for p in track], dtype=float)
    ys = np.array([np.nan if p[2] is None else p[2] for p in track], dtype=float)
    if np.all(np.isnan(xs)):
        xs[:], ys[:] = 0.5, 0.5
    for arr in (xs, ys):  # sem rosto: repete o último visto (ou o próximo, no começo)
        valid = ~np.isnan(arr)
        arr[:] = np.interp(np.arange(len(arr)), np.flatnonzero(valid), arr[valid])
    win = max(1, round(smooth_s * SAMPLE_FPS))
    kernel = np.ones(win) / win
    pad = lambda a: np.pad(a, (win // 2, win - 1 - win // 2), mode="edge")  # noqa: E731
    xs, ys = np.convolve(pad(xs), kernel, "valid"), np.convolve(pad(ys), kernel, "valid")

    kfs = [{"t": 0.0, "x": float(xs[0]), "y": float(ys[0])}]
    for t, x, y in zip(ts, xs, ys):
        last = kfs[-1]
        if abs(x - last["x"]) > dead_zone or abs(y - last["y"]) > dead_zone:
            # move em ~0,4 s até a nova posição
            kfs.append({"t": float(max(last["t"], t - 0.4)), "x": last["x"], "y": last["y"]})
            kfs.append({"t": float(t), "x": float(x), "y": float(y)})
    return [{**k, "t": round(k["t"], 3), "x": round(k["x"], 4), "y": round(k["y"], 4), "zoom": 1, "ease": "smooth", "auto": True} for k in kfs]


def reframe(project_dir: str, source: str, clips: list[dict], emit: Emit, cancel: threading.Event) -> dict:
    out_path = Path(project_dir) / "analysis" / "reframe.json"
    det = cv2.FaceDetectorYN.create(str(MODEL), "", (DET_W, DET_W), 0.7)
    cap = cv2.VideoCapture(source)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    result: dict[str, list[dict]] = {}
    try:
        for n, c in enumerate(clips):
            result[c["id"]] = keyframes(detect_track(cap, fps, c["in"], c["out"], det, cancel))
            emit(progress=(n + 1) / len(clips), clip=n + 1, clips=len(clips))
    finally:
        cap.release()
    write_json(out_path, result)
    return {"clips": len(result)}
