"""Pontuação por LLM, ajuste de limites e deduplicação (SPEC §8, etapas 4–6 + metadados)."""
import threading
from pathlib import Path

from pydantic import BaseModel, Field, ValidationError

from . import ollama, segment
from .util import ROOT, Emit, check, read_json, write_json

CONNECTIVES = {"e", "mas", "então", "aí", "daí", "porque", "tipo", "né", "ou", "que", "só", "and", "but", "so", "because"}
WEIGHTS = {"hook": 0.30, "value": 0.30, "standalone": 0.25, "ending": 0.15}
PAD = 0.15  # respiro antes/depois do corte


class Scores(BaseModel):
    hook: int = Field(ge=0, le=100)
    value: int = Field(ge=0, le=100)
    standalone: int = Field(ge=0, le=100)
    ending: int = Field(ge=0, le=100)


class LlmClip(BaseModel):
    start_sentence: int
    end_sentence: int
    title: str
    hook: str
    description: str
    hashtags: list[str]
    scores: Scores
    reason: str
    keywords: list[str]


class LlmOut(BaseModel):
    clips: list[LlmClip]


def score(s: dict) -> int:
    return round(sum(s[k] * w for k, w in WEIGHTS.items()))


def fmt_time(t: float) -> str:
    return f"{int(t // 60)}:{int(t % 60):02d}"


def refine(c: LlmClip, sents: list[dict], words: list[dict], tmin: float, tmax: float, duration: float) -> dict | None:
    """Encaixa em frases inteiras, respeita a duração alvo e não começa com conectivo."""
    i0 = max(0, min(c.start_sentence, len(sents) - 1))
    i1 = max(i0, min(c.end_sentence, len(sents) - 1))
    span = lambda a, b: sents[b]["end"] - sents[a]["start"]  # noqa: E731
    while span(i0, i1) < tmin and i1 + 1 < len(sents) and span(i0, i1 + 1) <= tmax:
        i1 += 1
    while span(i0, i1) > tmax and i1 > i0:
        i1 -= 1
    if span(i0, i1) < tmin * 0.6:
        return None
    ws, we = sents[i0]["wordStart"], sents[i1]["wordEnd"]
    while ws < we and words[ws]["text"].lower().strip(",.!?…") in CONNECTIVES:
        ws += 1
    return {
        "in": round(max(0.0, words[ws]["start"] - PAD), 3),
        "out": round(min(duration, words[we]["end"] + PAD), 3),
        "wordStart": ws, "wordEnd": we,
        "title": c.title.strip()[:60], "hook": c.hook.strip(), "description": c.description.strip(),
        "hashtags": [h.strip().lstrip("#").replace(" ", "") for h in c.hashtags if h.strip()][:5],
        "scores": c.scores.model_dump(), "score": score(c.scores.model_dump()),
        "reason": c.reason.strip(), "keywords": [k.strip() for k in c.keywords if k.strip()][:5],
    }


def dedupe(clips: list[dict]) -> list[dict]:
    """Trechos sobrepostos (> 50% do menor): fica o de maior nota."""
    kept: list[dict] = []
    for c in sorted(clips, key=lambda c: -c["score"]):
        if all(min(c["out"], k["out"]) - max(c["in"], k["in"]) <= 0.5 * min(c["out"] - c["in"], k["out"] - k["in"]) for k in kept):
            kept.append(c)
    return kept


def pick(clips: list[dict], max_clips, duration: float) -> list[dict]:
    if max_clips != "auto":
        return clips[: int(max_clips)]
    good = [c for c in clips if c["score"] >= 65]
    cap = max(5, round(duration / 180))  # ~1 corte a cada 3 min de vídeo
    return (good if len(good) >= 5 else clips[:5])[:cap]


def analyze(project_dir: str, llm: str, settings: dict, emit: Emit, cancel: threading.Event, ollama_url: str = ollama.DEFAULT_URL) -> dict:
    d = Path(project_dir)
    tr = read_json(d / "analysis" / "transcript.json")
    words, all_sents = tr["words"], tr["sentences"]
    duration = read_json(d / "project.json")["source"]["duration"]
    rng = settings.get("range") or [0, duration]
    tmin, tmax = settings["targetDuration"] if settings.get("targetDuration", "auto") != "auto" else (20, 90)
    # só as frases dentro do intervalo escolhido; o índice global é mantido para o LLM e para o refine
    idx = [k for k, s in enumerate(all_sents) if s["start"] >= rng[0] and s["end"] <= rng[1]]
    focus = f"\nO usuário pediu foco em: {settings['prompt'].strip()}\n" if settings.get("prompt") else ""
    template = (ROOT / "prompts" / "analyze.md").read_text(encoding="utf-8")
    schema = LlmOut.model_json_schema()
    wins = segment.windows([all_sents[k] for k in idx])
    found: list[dict] = []

    for n, (a, b) in enumerate(wins):
        check(cancel)
        cache = d / "analysis" / "windows" / f"{n}.json"
        if cache.exists():
            clips = read_json(cache)
        else:
            lines = "\n".join(
                f"[{idx[k]}] ({fmt_time(all_sents[idx[k]]['start'])}) "
                + " ".join(w["text"] for w in words[all_sents[idx[k]]["wordStart"]: all_sents[idx[k]]["wordEnd"] + 1])
                for k in range(a, b + 1)
            )
            prompt = (template.replace("{target_min}", str(tmin)).replace("{target_max}", str(tmax))
                      .replace("{focus}", focus).replace("{language}", tr["language"]).replace("{sentences}", lines))
            clips = []
            for _attempt in range(2):  # JSON inválido: tenta de novo uma vez
                try:
                    out = LlmOut.model_validate_json(ollama.chat_json(llm, prompt, schema, ollama_url))
                    clips = [r for c in out.clips if idx[a] <= c.start_sentence <= idx[b]
                             and (r := refine(c, all_sents, words, tmin, tmax, duration))]
                    break
                except ValidationError:
                    continue
            write_json(cache, clips)
        found.extend(clips)
        emit(progress=(n + 1) / len(wins), window=n + 1, windows=len(wins),
             clips=[{"title": c["title"], "score": c["score"]} for c in clips])

    ollama.unload(llm, ollama_url)
    final = pick(dedupe(found), settings.get("maxClips", "auto"), rng[1] - rng[0])
    write_json(d / "analysis" / "candidates.json", final)
    return {"clips": len(final)}
