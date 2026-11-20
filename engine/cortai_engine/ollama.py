"""Cliente mínimo do Ollama. ponytail: um provedor só; extrair interface quando entrar llama.cpp/API (V1)."""
import httpx

DEFAULT_URL = "http://127.0.0.1:11434"


def chat_json(model: str, prompt: str, schema: dict, url: str = DEFAULT_URL) -> str:
    body = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "format": schema,  # saída estruturada: o Ollama força o JSON a seguir o schema
        "stream": False,
        "think": False,
        "options": {"temperature": 0.3, "num_ctx": 4096},
        "keep_alive": "5m",
    }
    r = httpx.post(f"{url}/api/chat", json=body, timeout=600)
    if r.status_code == 400 and "think" in r.text:  # modelos sem modo de raciocínio recusam o campo
        body.pop("think")
        r = httpx.post(f"{url}/api/chat", json=body, timeout=600)
    r.raise_for_status()
    return r.json()["message"]["content"]


def unload(model: str, url: str = DEFAULT_URL) -> None:
    """Tira o modelo da VRAM (máquinas com pouca memória de vídeo)."""
    try:
        httpx.post(f"{url}/api/generate", json={"model": model, "keep_alive": 0}, timeout=30)
    except httpx.HTTPError:
        pass
