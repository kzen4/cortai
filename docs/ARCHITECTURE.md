# Arquitetura do Cortaí

Resumo do que já existe. A especificação completa está em [SPEC.md](SPEC.md).

## Processos

```
Renderer (React, sem Node/FS) ──window.cortai (preload tipado)──▶ Main (Electron)
                                                                   ├─ sidecar Python (FastAPI 127.0.0.1, porta livre + token)
                                                                   ├─ ffmpeg (spawn)
                                                                   └─ protocolo cortai-media:// (vídeos locais, com Range)
```

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, CSP restritiva no `index.html`.
- Janela sem moldura (`titleBarStyle: 'hidden'`). Os botões da janela são os **nativos**
  (`titleBarOverlay` no Windows/Linux, semáforo no macOS), não desenhados à mão.
- O Main sobe o motor (`engine/`) com uma porta livre e um token aleatório (`CORTAI_TOKEN`),
  consulta `/health` a cada 2 s, reinicia se o processo cair e encerra ao sair do app.
  O status vai ao renderer pelo evento `engine:status` (indicador "Motor" na sidebar).

## Decisão de render (Fase 0) — **Canvas** (`drawOverlay`)

POC: o mesmo clipe de 30 s (1080×1920, 30 fps, legenda estilo "Hormozi" com palavra ativa em
destaque e animação pop) exportado pelos dois caminhos. Tela: **Lab de render** no app.

| | Canvas (`drawOverlay` numa janela oculta → RGBA → ffmpeg `overlay`) | ASS/libass (`subtitles=`) |
|---|---|---|
| Fidelidade ao preview | **Idêntica** (é o mesmo código e o mesmo `.ttf`) | Diferente: o libass mede o tamanho da fonte pelas métricas verticais (texto ~35% menor com o mesmo valor) e a escala do pop empurra as palavras vizinhas |
| Tempo (RTX 3050 6 GB, NVENC) | 21,3 s → **12,7–14 s** após reaproveitar quadros iguais | 2,4–4,1 s |
| Corte de 60 s (estimado) | ~26 s (meta da SPEC: < 30 s) ✅ | ~5–8 s |
| Cards, emojis, barra de progresso, motions | Mesmo código, qualquer coisa que o Canvas desenhe | Limitado ao que o ASS expressa; cards ficariam em outro sistema |

**Escolha: Canvas.** O risco nº 1 do projeto é preview ≠ export, e só o Canvas elimina isso por
construção. O ASS ganha em velocidade, mas exigiria compensar métricas por fonte e reimplementar
cada animação em tags ASS, e mesmo assim não cobre os cards.

Como funciona:
1. `src/renderer/overlay/drawOverlay.ts` — **única** função de desenho (preview e export).
   Tudo é proporcional à altura 1920, então o preview pequeno tem a mesma composição.
2. `overlayKey(input, t)` devolve uma chave do que seria desenhado; quadros com a mesma chave
   não são redesenhados nem atravessam o IPC (o Main repete o último buffer no pipe do ffmpeg).
3. Vídeo base (corte + crop + escala) vem de um filtergraph do ffmpeg; o overlay entra via
   `-f rawvideo -pix_fmt rgba -i pipe:0` + `overlay`.
4. Encoder: `h264_nvenc` → `h264_videotoolbox` → `libx264` (o primeiro que funcionar).

Próximos ganhos se precisar de mais velocidade (medir antes):
- mandar só a faixa da legenda (bounding box) em vez do quadro 1080×1920 inteiro;
- trocar `getImageData` por `VideoFrame`/`OffscreenCanvas` num worker;
- testes de snapshot de quadros (preview × export) no CI — ver risco "Fidelidade do render" na SPEC.

## Fase 1 — pipeline automático

```
Início/Modal ─▶ projects:create ─▶ fila (SQLite) ─▶ ingest ─▶ transcribe ─▶ analyze ─▶ reframe ─▶ finalize
                                                  (Main)    (motor)       (motor+Ollama) (motor)   (Main)
Resultados ─▶ clips:export ─▶ fila (pista render) ─▶ renderClip (ffmpeg + drawOverlay) ─▶ Vídeos/Cortaí/<projeto>/
```

| Decisão | Por quê |
|---|---|
| **`node:sqlite`** em vez de better-sqlite3 | Vem no Node do Electron 45; nenhum módulo nativo para recompilar. |
| **NDJSON por HTTP** (`/transcribe`, `/analyze`, `/reframe`, `/models/whisper`) em vez de WebSocket | Mesmo efeito (progresso em fluxo), menos código. Cancelar = abortar o fetch; o motor para no próximo checkpoint. |
| **Motor instalado com `uv sync`** (o app baixa o `uv` se faltar) em vez de PyInstaller | O uv baixa o Python 3.11 e as libs (CUDA incluso) para a pasta do app, sem terminal. Marcador `engine/.venv/.cortai-ok` = hash do `uv.lock`. |
| **Whisper no cache do Hugging Face** | Retoma downloads e confere hashes sozinho; modelos que o usuário já tem aparecem como "já instalado". Progresso = bytes no cache. |
| **Ollama** como LLM (sobe `ollama serve` escondido se estiver parado) | Decisão da SPEC §14. Saída estruturada com `format: <JSON schema>`; `num_ctx` 4096 (cabe inteiro em GPU de 6 GB: ~27 s por janela de 3 min). |
| **Título, descrição e hashtags na mesma chamada da análise** | A SPEC prevê uma etapa "metadados" separada; juntar evita uma 2ª passada do LLM. A etapa `finalize` grava os `clips/<id>.json`. |
| **YuNet (OpenCV)** para rosto, em vez de MediaPipe | Modelo de 230 KB (`engine/models/`), só depende do OpenCV. Zona morta + média móvel = câmera estável. |
| **Encoder** NVENC → VideoToolbox → QSV → AMF → MF → OpenH264 → x264 | A build LGPL do FFmpeg (BtbN) não tem x264. |
| Fila com 2 pistas (pipeline 1 por vez, render 1 por vez) | GPU única; o render usa uma janela oculta de overlay por vez. |

Retomada: cada etapa grava o artefato em disco (`.part` + renomear; JSON atômico; análise salva por janela em
`analysis/windows/<n>.json`). Ao fechar, a fila não marca erro: a etapa fica `running` e volta para `queued`
na próxima abertura.

Medido (RTX 3050 6 GB, vídeo de 45 min, Whisper medium + qwen2.5-coder:7b): proxy+áudio 1:40, transcrição ~2 min,
análise ~10 min (20 janelas), reenquadramento ~1 min; export ~2× tempo real por corte.

Tipos novos (fora da seção 10 da SPEC, só de infraestrutura): `ComponentState`, `Settings`, `SetupInfo`, `Job`,
`ProjectSummary`, `SourceInfo`, `FoundClip` em `src/shared/types.ts`. Os tipos da seção 10 não mudaram.

## Fase 2 — editor

**Três tempos** (`src/shared/timeline.ts`, testado): `clip.in/out/cuts` em segundos do original; "rel" = desde
`clip.in` (keyframes de enquadramento); "out" = vídeo final sem os cortes. `keptSegments`, `relToOut`,
`outToRel` e `outputWords` são a única conta de tempo usada pela prévia, pela timeline, pelos cards e pelo export.

**Prévia = export.** `overlay/composite.ts` (`drawBase`) desenha o quadro base com `cropRect`, a mesma conta
que `main/ffmpeg/graph.ts` transforma em filtro `crop`; o blur do fundo usa o mesmo sigma em pixels do export
(`ctx.filter` blur × `gblur`). Legenda: o mesmo `drawOverlay`.

**Export com edição:** um `trim`/`atrim` por trecho mantido (keyframes deslocados pelo início de cada trecho),
`concat`, depois `volume`/`loudnorm` e o overlay. Zoom é por clipe (o `crop` do ffmpeg só varia x/y por quadro).

**Desempenho do editor:** um único `requestAnimationFrame` lê o `<video>` (proxy 540p), pula os cortes e avisa
os assinantes (canvas da prévia, playhead, palavra ativa). Nada disso passa pelo estado do React por quadro;
a transcrição só re-renderiza quando muda a palavra ativa.

**Histórico:** instantâneos do clipe com junção de arrastes do mesmo controle (`editor/history.ts`, testado);
salvamento automático 500 ms depois da última mudança.

## Pastas (até agora)

```
src/main/        index.ts (IPC) · protocol.ts · db.ts · paths.ts · projects.ts · poc.ts
                 components/ (download.ts, index.ts = gerenciador) · engine/sidecar.ts · ffmpeg/ (render.ts, graph.ts) · jobs/ (queue.ts, runners.ts)
src/preload/     index.ts (window.cortai)
src/renderer/    app/ (App, Titlebar, Sidebar, data.ts) · components/ (ui.tsx, ProjectCard, ErrorBoundary)
                 editor/ (Editor, TranscriptPanel, Preview, Timeline, Inspector, history.ts)
                 screens/ (Setup, Home, GenerateModal, Processing, Results, Projects, Exports, Lab, ComingSoon) · overlay/ · styles/ · i18n/
src/shared/      types.ts · timeline.ts · captions.ts · clipWords.ts · reframe.ts · templates.ts · poc.ts · constants.ts
engine/          cortai_engine/ (server, transcribe, segment, analyze, ollama, reframe, util) · prompts/analyze.md · models.json · models/ (YuNet) · tests/
resources/fonts/ Montserrat-ExtraBold.ttf (OFL) — mesma fonte no preview e no export
```

## Templates e brand kits (2026-11-20)
- Ficam nas configurações (SQLite), não em pastas: logo e fontes como data URL. Motivo: imagem de `cortai-media://` deixaria o canvas
  do export "tainted" (getImageData falha) e o `.cortai-template` vira um JSON só (SPEC pedia zip; zipar só se houver asset grande, ex.: intro/outro).
- Logo/CTA são desenhados pelo mesmo `drawOverlay` (prévia = export). Template é copiado no corte; brand kit é referenciado (`brandKitId`).

