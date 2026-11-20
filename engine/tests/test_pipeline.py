from cortai_engine import analyze, reframe, segment


def mk_words(n, dur=0.4, gap=0.05, punct_every=10):
    words, t = [], 0.0
    for i in range(n):
        text = f"palavra{i}" + ("." if (i + 1) % punct_every == 0 else "")
        words.append({"i": i, "text": text, "start": round(t, 3), "end": round(t + dur, 3), "conf": 1})
        t += dur + gap
    return words


def test_frases_quebram_na_pontuacao_e_cobrem_tudo():
    words = mk_words(95)
    s = segment.sentences(words)
    assert s[0]["wordEnd"] == 9 and s[1]["wordStart"] == 10
    assert s[-1]["wordEnd"] == 94
    assert sum(x["wordEnd"] - x["wordStart"] + 1 for x in s) == 95


def test_janelas_cobrem_e_se_sobrepoem():
    s = segment.sentences(mk_words(2000))  # ~15 min
    w = segment.windows(s, size=180, overlap=30)
    assert w[0][0] == 0 and w[-1][1] == len(s) - 1
    for (a0, a1), (b0, _) in zip(w, w[1:]):
        assert b0 <= a1 and b0 > a0  # sobrepõe e avança
        assert s[a1]["end"] - s[a0]["start"] <= 180


def clip(a, b, hook=80):
    return analyze.LlmClip(start_sentence=a, end_sentence=b, title="T", hook="h", description="d",
                           hashtags=["#a", "b c"], scores=analyze.Scores(hook=hook, value=80, standalone=80, ending=80),
                           reason="r", keywords=["k"])


def test_refine_respeita_duracao_e_tira_conectivo():
    words = mk_words(400)
    words[50]["text"] = "Então"  # 1ª palavra da frase 5
    s = segment.sentences(words)
    r = analyze.refine(clip(5, 5), s, words, 20, 60, 999)
    assert r is not None
    assert 20 - 1 <= r["out"] - r["in"] <= 60 + 1
    assert r["wordStart"] == 51  # pulou o "Então"
    assert r["hashtags"] == ["a", "bc"]


def test_dedupe_mantem_maior_nota():
    a = {"in": 0, "out": 60, "score": 70}
    b = {"in": 10, "out": 70, "score": 90}
    c = {"in": 100, "out": 150, "score": 50}
    assert [x["score"] for x in analyze.dedupe([a, b, c])] == [90, 50]


def test_keyframes_zona_morta_e_sem_rosto():
    still = [(i / 5, 0.5 + (0.01 if i % 2 else 0), 0.4) for i in range(50)]
    assert len(reframe.keyframes(still)) == 1  # tremidinha não move a câmera
    moved = still + [(10 + i / 5, 0.8, 0.4) for i in range(50)]
    k = reframe.keyframes(moved)
    assert len(k) >= 3 and abs(k[-1]["x"] - 0.8) < 0.05
    none = [(i / 5, None, None) for i in range(10)]
    assert reframe.keyframes(none)[0]["x"] == 0.5
