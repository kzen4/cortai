"""Palavras → frases → janelas candidatas. `wordEnd` é inclusivo."""
import re

END = re.compile(r"[.!?…]$")


def sentences(words: list[dict], max_gap: float = 0.8, max_words: int = 40) -> list[dict]:
    out, start = [], 0
    for k, w in enumerate(words):
        last = k == len(words) - 1
        gap = 0 if last else words[k + 1]["start"] - w["end"]
        if last or END.search(w["text"]) or gap > max_gap or k - start + 1 >= max_words:
            out.append({"start": words[start]["start"], "end": w["end"], "wordStart": start, "wordEnd": k})
            start = k + 1
    return out


def windows(sents: list[dict], size: float = 180, overlap: float = 30) -> list[tuple[int, int]]:
    """Janelas de ~`size` s (índices de frase, fim inclusivo) com `overlap` s de sobreposição."""
    out, i = [], 0
    while i < len(sents):
        j = i
        while j + 1 < len(sents) and sents[j + 1]["end"] - sents[i]["start"] <= size:
            j += 1
        out.append((i, j))
        if j == len(sents) - 1:
            break
        nxt = j
        while nxt > i and sents[j]["end"] - sents[nxt]["start"] < overlap:
            nxt -= 1
        i = max(nxt, i + 1)
    return out
