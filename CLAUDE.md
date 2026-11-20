# Cortaí — guia para o agente

App desktop open source (Electron) que transforma vídeos longos em cortes verticais virais, 100% local:
transcrição (faster-whisper) → momentos virais por LLM local (Ollama) → reenquadramento no rosto →
legendas animadas → editor completo → export MP4. Usuário final **nunca** usa terminal.

- Especificação completa: `docs/SPEC.md` (PDF original: `Cortai-Planejamento.pdf`).
- Arquitetura e decisões já tomadas: `docs/ARCHITECTURE.md`.
- **Seção 10 da SPEC = fonte da verdade** → `src/shared/types.ts`. Mudou um? Atualize o outro.
- Siga o roadmap (SPEC §12) em ordem; não avance de fase sem os critérios de aceite.

## Regras

- Escreva para o usuário em **português do Brasil**. UI sempre via i18n (`src/renderer/i18n/pt-BR.json` + `en.json`).
- Cores/fontes/raios só pelos tokens (`src/renderer/styles/tokens.css`, mapeados no Tailwind em `globals.css`).
  Texto sobre `primary` é sempre `on-primary` (preto). Verde-limão = ação principal; violeta = IA.
- Ícones Lucide, traço 1.75, `aria-hidden` quando decorativos; botão só com ícone leva `aria-label`.
  Todo campo de formulário leva ícone à esquerda e rótulo visível.
- Renderer não acessa Node/FS: tudo passa por `window.cortai` (`src/preload/index.ts`). Vídeos locais
  via `window.cortai.mediaUrl(path)` (protocolo `cortai-media://`, com Range).
- Legendas/cards: **uma única** implementação em `src/renderer/overlay/drawOverlay.ts`, usada no
  preview e no export (decisão registrada em ARCHITECTURE.md). Não criar caminho paralelo.
- Estilo do código: mínimo que funciona; atalhos deliberados marcados com `// ponytail:` + teto e upgrade.

## Comandos

```bash
npm install                 # se o Electron não baixar: node node_modules/electron/install.js
npm run engine:setup        # cria engine/.venv (uv, Python 3.11) — necessário para o motor ficar verde
npm run dev                 # abre o app (use `npx electron-vite dev -w` para recarregar o main também)
npm run typecheck           # tsc
npm test                    # vitest (src/**/*.test.ts)
npm run engine:test         # pytest do motor
npm run build               # build de produção em out/
# Lab de render (POC da Fase 0) fica fora do menu; para ver: set VITE_LAB=1 && npm run dev
npm run dist                # instalador Windows → dist/Cortai-Setup-<versão>.exe (electron-builder.yml)
```

Dados: banco e componentes em `%APPDATA%/Cortaí/`, projetos em `~/Cortai/projects/<id>/` (SPEC §10.1),
cortes exportados em `Vídeos/Cortaí/<projeto>/`. Ferramentas: a baixada pelo app (`components/bin`) tem
prioridade sobre a do PATH. Modelos e perfis: `engine/models.json`; prompt da análise: `engine/prompts/analyze.md`.

## Estado do roadmap

- [x] **Fase 0** — Electron + React + Tailwind/tokens, janela sem moldura, sidebar recolhível, i18n,
  sidecar Python com `/health` (indicador verde), POC de render (Canvas × ASS) e decisão registrada, CI.
- [x] **Fase 1** — assistente + gerenciador de componentes (download com pausa/retomada/SHA-256), importação
  (arquivo, vários arquivos, link via yt-dlp), modal de geração, fila SQLite que retoma, pipeline completo
  (Whisper → Ollama → YuNet), Processamento com cortes em tempo real, Resultados (grade, prévia, seleção,
  painel editável), Exportações (.mp4 + .srt + .txt). Aceite verificado com vídeo de 45 min fechando o app no meio.
- [x] **Fase 2** — editor: transcrição sincronizada (Delete corta/recoloca, duplo clique corrige, contexto ±30 s
  para estender), prévia 60 fps com o mesmo desenho do export (`overlay/composite.ts` + `drawOverlay`),
  timeline (onda, cortes hachurados, keyframes, aparar com ímã, legenda, zoom Ctrl+roda), enquadramento
  por keyframes (arrastar/setas, seguir rosto, fixar, centralizar), layouts rosto/fundo desfocado/fundo de cor,
  zoom, 8 templates + 6 animações, desfazer/refazer, salvamento automático, atalhos (?). Export com cortes
  (trechos concatenados), layout, zoom e loudnorm -14 LUFS (`main/ffmpeg/graph.ts`). Aceite verificado
  (frase apagada, palavra corrigida, template e enquadramento → export igual à prévia).
  Timeline estilo Flow Me (2026-11-20): barra com dividir (S), dividir e apagar à esq./dir. (Q/W), silenciar (M,
  `clip.muted` → volume=0 no export e vídeo mudo na prévia), duplicar (Ctrl+D), copiar/colar no playhead (Ctrl+C/V),
  selecionar tudo (Ctrl+A), apagar (Delete), marcador (B, `clip.bookmarks`), ímã (N) e ripple (prefs em localStorage
  `cortai.timeline`), zoom −/slider/+. Duplo clique na legenda da prévia edita o texto (vira `wordEdits`; palavra
  apagada some só da legenda). **Lista de edição** (`shared/timeline.ts`): `clip.order` = itens {a, b (s do original),
  g (cópia), muted} na ordem em que tocam; cada item = um pedaço da timeline. **Cada cópia é um vídeo independente**:
  duplicar/colar cria cópia nova (g novo) que começa com as edições da original e depois tem as próprias correções de
  legenda e enquadramento/zoom em `clip.copies[g]` (g 0 = `clip.wordEdits`/`clip.reframe`); ler com `forCopy`, gravar com
  `inCopy`. A transcrição mostra/edita a cópia sob o playhead (selo "Cópia N"; `cutWords`/`restoreWords`); silenciar é por
  pedaço. Corte antigo (in/out + `cuts` + `splits`) vira lista ao abrir no editor (`normalizeClip`). Tudo passa por
  `clipPieces()`/`editList()` (prévia, legendas, export); o relógio do editor guarda o pedaço atual (`idx`) porque o mesmo
  instante do original pode tocar 2×. Fora de propósito: congelar quadro (desativado no próprio Flow Me), cenas, extrair áudio, editor de curva.
- [x] **Fase 3** — lançamento v0.1 (2026-11-20; falta só publicar):
  - Instalador Windows: `npm run dist` → `Cortai-Setup-<v>.exe` (~112 MB, NSIS assistido em pt-BR, por usuário, sem
    admin, atalhos, não apaga dados ao desinstalar). Leva só o app; o assistente de primeiro uso (Componentes) confere
    cada item e baixa o que falta (nada de dependências no repositório). Instalado: código do motor em
    `resources/engine`, venv em `%APPDATA%\Cortaí\components\engine-venv` (`paths.ts`). Ícone: `python scripts/gerar-icone.py`.
    Testado ao vivo instalado: instala, abre, componentes, motor instalado pelo assistente, editor, duplicar; e
    atualização 0.0.1 → 0.1.0 por cima mantendo o motor. Gotcha: winCodeSign do electron-builder falha ao extrair
    (symlinks do macOS) → extrair o .7z com `7za x -snld` em `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0`.
  - Atualização automática: `src/main/updater.ts` (electron-updater 6.3.9, GitHub Releases; procura ao abrir e a cada
    6 h, baixa sozinho, botão "Reiniciar e atualizar" na barra de título; em dev não faz nada).
  - Release: `.github/workflows/release.yml` (tag `v*` → build + `electron-builder --publish always`).
  - E2E: `e2e/caminho-feliz.spec.ts` (Playwright `_electron`, projeto sintético em `CORTAI_HOME`, sem modelos) no CI
    (`ci.yml` job e2e, windows-latest, 1 retentativa). `npm run build && npm run e2e`.
  - README com GIF (`docs/assets/demo.gif`, gravado por `DEMO=1 npx playwright test demo` + `python scripts/montar-gif.py`,
    vídeo sintético do ffmpeg, nada de conteúdo do usuário), site em `site/` (GitHub Pages via `.github/workflows/site.yml`),
    modelos de issue/PR em `.github/`, licença AGPL-3.0.
  - **Próximo passo (publicação, só com ok do usuário):** (1) criar o repositório `kzen4/cortai` **privado** (o usuário
    pediu para NÃO publicar ainda); (2) Settings → Actions → General → Workflow permissions: Read and write; (3) 1º commit
    (nada commitado até hoje; sem node_modules/dist/venv — já no .gitignore) e push; (4) no dia do lançamento: tornar
    público, Settings → Pages → Source: GitHub Actions (Pages grátis só em repo público) e subir a tag `v0.1.0`.
    Tentativa de fazer pelo Chrome em 2026-11-20: a extensão Claude in Chrome estava ativa, mas as ferramentas não
    carregaram nesta sessão nem após `/chrome` → reiniciar com `claude --chrome` e conferir antes de prometer.
  - Fora: assinatura de código (SmartScreen avisa; só quando houver tração), macOS/Linux (instalador só Windows por ora).
- [ ] Fase 4 (V1) · Fase 5 (V2).

Fase 2 medida: corte de 3 min tocando a ~120 fps (tela 120 Hz), 0/270 quadros de vídeo perdidos; volume -14,7 LUFS
(loudnorm em 2 passadas). Pendências: layouts "tela dividida" e "tela + rosto" (precisam de 2 rostos/diarização, V1);
emojis automáticos; zoom é um só por clipe (o crop do ffmpeg não muda de tamanho por quadro).

Pendências conhecidas da Fase 1: macOS não testado (URLs prontas); Ollama no macOS abre a página de download;
~~motor fora do asar~~ (resolvido na Fase 3); notas do LLM generosas
(calibrar prompt com conjunto de avaliação, SPEC §14); layout "tela + rosto" para vídeos com webcam no canto.

Decisões: licença **AGPL-3.0** (decidida pelo usuário em 2026-11-20; `LICENSE`, `package.json`). Repositório: github.com/kzen4/cortai (site: kzen4.github.io/cortai). Em aberto: nome/domínio próprio.
