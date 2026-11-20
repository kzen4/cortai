# Cortaí — Especificação (SPEC)

> Transcrição do planejamento original (`Cortai-Planejamento.pdf`, v1.0, nov/2026). A seção 10 é a fonte da verdade;
> se o modelo de dados mudar no código, atualize aqui também.

Cortaí.
Planejamento de Produto
e Especificação Técnica
Transforma vídeos longos em cortes verticais virais, 100% local,
com IA, editor completo e tudo feito pela interface. Open
source.
Documento para desenvolvimento via Claude Code
v1.0 · Novembro de 2026

## 0. Como usar este documento

Este documento é a especificação completa do Cortaí. Ele foi escrito para ser lido por um agente de
código (Claude Code) e por humanos. As regras para o agente:
1. Siga o roadmap da seção 12 em ordem. Cada fase tem critérios de aceite. Não avance de fase
sem que os critérios passem.
2. A seção 10 (modelo de dados) é a fonte da verdade. Interfaces TypeScript e o formato do
project.json devem ser implementados como estão. Se precisar mudar, atualize também
docs/SPEC.md no repositório.
3. Nada exige terminal para o usuário final. Toda instalação de dependência (FFmpeg, modelos,
runtime Python, LLM) acontece pela interface, com barra de progresso. Ver seção 4.1.
4. Tudo roda localmente por padrão. Integrações em nuvem (APIs de LLM) são opcionais e
desligadas por padrão.
5. A identidade visual (seção 3) vira design tokens em src/renderer/styles/tokens.css antes de
qualquer tela ser construída.
6. Comece criando CLAUDE.md na raiz com um resumo deste documento, a estrutura de pastas e os
comandos de build/test.
Sumário
- 1. Visão do produto
- 2. Público, posicionamento e diferenciais
- 3. Identidade visual
- 4. Funcionalidades (completo)
- 5. Fluxo do usuário
- 6. Telas e detalhes de interface
- 7. Editor (detalhamento)
- 8. Pipeline de IA
- 9. Arquitetura técnica
- 10. Modelo de dados
- 11. Estrutura de pastas
- 12. Roadmap e critérios de aceite
- 13. Open source: licença, README e lançamento
- 14. Riscos e decisões em aberto

## 1. Visão do produto

Cortaí (de "corta aí") é um aplicativo desktop open source, feito em Electron, que pega um vídeo
longo (podcast, live, aula, entrevista, vlog) e gera automaticamente vários cortes curtos verticais
prontos para TikTok, Reels e YouTube Shorts, com legendas animadas, reenquadramento automático
no rosto de quem fala, título e nota de potencial viral.
A experiência de entrada lembra o Opus Clip: você arrasta o vídeo, escolhe poucas opções e recebe
uma grade de cortes ranqueados. A diferença é que, em vez de um editor limitado na nuvem, o Cortaí
tem um editor completo estilo Flow Me: timeline multipista, edição pelo texto da transcrição, cards e
motions, legendas estilizadas e ajustes finos de enquadramento.
Frase do produto (tagline): "Seus vídeos longos viram cortes virais. No seu computador, de
graça, sem upload."
Em inglês: "Turn long videos into viral shorts. Locally. Free. No uploads."
Princípios
Local-first: transcrição, análise, reenquadramento e renderização rodam na máquina do usuário.
Nenhum vídeo sai do computador.
Zero terminal: o usuário nunca precisa abrir um prompt de comando. Instalação, download de
modelos e atualizações acontecem pela interface.
Automático primeiro, editável sempre: a IA faz 90% do trabalho; o editor permite corrigir
qualquer detalhe.
Rápido de verdade: usa GPU NVIDIA (CUDA) quando disponível, com fallback em CPU.
PT-BR de primeira classe: interface em português e inglês desde o início; transcrição e IA
afinadas para português (vícios de linguagem, gírias, emojis).

## 2. Público, posicionamento e diferenciais

Público
Dor
O que o Cortaí resolve
Podcasters e criadores
Horas de conteúdo, sem tempo
para cortar
Gera 10 a 30 cortes por episódio em minutos
Editores freelancers
Ferramentas pagas por
minuto/assinatura
Ferramenta gratuita e ilimitada, com editor
profissional e exportação em lote
Agências e social
media
Vários clientes, identidades
diferentes
Brand kits e templates por cliente
Professores e
infoprodutores
Aulas longas pouco
aproveitadas
Cortes de "pílulas" educativas com legenda
Devs e entusiastas de
IA local
Querem alternativas abertas
Código aberto, extensível, roda com Ollama
Diferenciais frente a ferramentas pagas
Gratuito, sem limite de minutos e sem marca d'água.
Privacidade: o vídeo nunca é enviado para servidor.
Editor de verdade (timeline multipista + edição por texto), não apenas trocar legenda.
Templates e cards exportáveis/importáveis em JSON (comunidade pode compartilhar estilos).
Prompts editáveis: o usuário pode dizer "procure momentos engraçados" ou "procure dicas
práticas".

## 3. Identidade visual


### 3.1 Conceito

Energia de estúdio de criação à noite: interface escura, contraste alto e um acento verde-limão
elétrico que representa o "corte" (ação principal). Um violeta secundário representa a IA (análise,
sugestões, pontuação). A sensação deve ser de ferramenta profissional e rápida, com um toque
brasileiro no nome e no tom de voz, sem cair em clichês verde-amarelo.
Importante: o Cortaí pode lembrar o Opus Clip na estrutura (fluxo de importar → grade de cortes
→ editor), mas não deve copiar logo, cores, ícones, textos ou layout pixel a pixel. Toda a
identidade abaixo é própria.

### 3.2 Logo

Ícone: quadrado arredondado escuro com um triângulo de "play" em verde-limão, cortado na
diagonal por um traço violeta (o corte). Logotipo: "Cortaí" em Sora ExtraBold, com o ponto final em
verde-limão. Versões necessárias: ícone do app (256, 512, 1024 px, .ico e .icns), logotipo horizontal
claro e escuro, favicon para o site do projeto. O SVG da capa deste documento serve de ponto de
partida.

### 3.3 Paleta de cores

bg
#0B0B0F
surface
#15151C
surface-2
#1E1E28
border
#2A2A36
text
#F4F4F6
text-muted
#9A9AAB
primary (Corte)
#C6F432
ai (Violeta IA)
#8B5CF6
warning
#FF7A2F
danger
#FF4D6D
success
#2DD4BF
score gradient
#8B5CF6→#C6F432
Texto sobre primary é sempre #0B0B0F (preto), nunca branco.
O verde-limão é reservado para ações principais (Gerar cortes, Exportar), playhead, seleção ativa
e notas altas. Não usar como cor de fundo grande.
O violeta aparece em tudo que é "IA": badges de sugestão, botão "Reanalisar", trechos
destacados pela IA na transcrição.
Cores das trilhas na timeline: vídeo #3B82F6 , legendas #C6F432 , cards/textos #8B5CF6 ,
áudio/música #2DD4BF , efeitos/zoom #FF7A2F .
Tema claro: opcional na v1 (não é prioridade). Prever tokens para não precisar refatorar.

### 3.4 Tipografia

Uso
Fonte
Pesos
Tamanhos
Títulos, números
grandes, logo
Sora
600, 700,
800
20 / 24 / 32 / 40 px
Interface (texto, botões,
inputs)
Inter
400, 500,
600
12 / 13 / 14 / 16 px
(base 13 px)
Timecodes, valores
técnicos
JetBrains Mono
400, 500
11 / 12 px
Legendas nos vídeos
(embutidas)
Montserrat, Anton, Bebas Neue, Poppins,
Archivo Black, Inter
variados
definidos pelo
template
Todas as fontes são OFL (livres) e vão empacotadas no app em resources/fonts . O usuário pode
adicionar fontes próprias (.ttf/.otf) pela tela de Brand Kit.

### 3.5 Forma, espaçamento e movimento

Grid de 4 px. Espaçamentos: 4, 8, 12, 16, 24, 32, 48.
Raios: 6 px (inputs, chips), 10 px (botões, cards pequenos), 16 px (painéis, cards de clipe), 24 px
(modais).
Sombras: quase nenhuma; profundidade por camadas de surface . Elementos em foco ganham
borda primary 1.5 px e um glow suave 0 0 0 4px rgba(198,244,50,.15) .
Ícones: Lucide (MIT), traço 1.75 px, tamanho 16/20 px.
Animações: 150 ms para hover, 220 ms para painéis, curva cubic-bezier(.2,.8,.2,1) . Barras
de progresso com shimmer violeta. Respeitar "reduzir movimento" do sistema.
Janela: frameless com barra de título customizada (área de arraste, botões de janela à direita no
Windows e à esquerda no macOS). Tamanho mínimo 1280×760.

### 3.6 Tom de voz

Direto, animado e brasileiro, sem gíria forçada. Exemplos: botão principal "Gerar cortes"; estado
vazio "Arraste um vídeo aqui e deixa que a gente corta"; sucesso "12 cortes prontos. Bora postar?";
erro "Não consegui ler esse arquivo. Ele pode estar corrompido ou num formato que ainda não
suportamos." Em inglês, o mesmo tom: "Drop a video. We'll do the cutting."

## 4. Funcionalidades (lista completa)

Legenda de prioridade: MVP primeira versão pública · V1 logo após o lançamento · V2 futuro.

### 4.1 Instalação e configuração (tudo pela interface)

MVP Instalador Windows (.exe NSIS) e macOS (.dmg); Linux (.AppImage) em V1. Auto-update
via electron-updater + GitHub Releases.
MVP Assistente de primeira execução: detecta GPU (NVIDIA/CUDA, Apple Silicon, só CPU),
RAM e espaço em disco, e recomenda um perfil (Leve, Equilibrado, Máximo).
MVP Gerenciador de componentes: baixa e verifica (SHA-256) FFmpeg, o motor de IA (sidecar
Python empacotado), modelos Whisper e o modelo de linguagem, com progresso, pausa,
retomada e tamanho estimado.
MVP Motor de LLM: usa Ollama se já estiver instalado; se não, oferece baixar e iniciar o Ollama
pela interface, ou usar o llama.cpp embutido (decisão na seção 14).
V1 Chaves de API opcionais (OpenAI, Anthropic, Gemini, Groq) para quem preferir nuvem,
guardadas com safeStorage do Electron.
MVP Tela de diagnóstico: versões, uso de GPU, logs, botão "Copiar relatório" para abrir issue no
GitHub.

### 4.2 Importação

MVP Arrastar e soltar arquivos (mp4, mov, mkv, webm, m4v) ou escolher pelo seletor. Vários
arquivos viram vários projetos em fila.
MVP Colar link (YouTube e outros sites suportados pelo yt-dlp), com aviso de que o usuário deve
ter direitos sobre o conteúdo.
MVP Pré-visualização do vídeo importado: miniatura, duração, resolução, FPS, tamanho.
V1 Importar arquivo de áudio + imagem estática (podcasts só de áudio) com visual de
"audiograma".
V1 Pasta monitorada: todo vídeo novo numa pasta escolhida entra na fila automaticamente.
V2 Gravações multicâmera (duas ou mais fontes sincronizadas pelo áudio).

### 4.3 Configuração da geração (antes de processar)

MVP Idioma do vídeo (auto-detectar ou escolher).
MVP Duração alvo dos cortes: Automático, <30 s, 30–60 s, 60–90 s, 90 s–3 min.
MVP Quantidade: Automático (pela qualidade) ou número fixo (5–50).
MVP Formato: 9:16, 1:1, 4:5, 16:9.
MVP Template de legenda (galeria visual com preview animado).
MVP Intervalo do vídeo a processar (ex.: pular a abertura de 5 minutos).
V1 Campo "O que procurar?" (prompt livre) e atalhos: Engraçado, Polêmico, Dicas práticas,
Histórias, Frases de impacto.
V1 Palavras-chave obrigatórias (ex.: só cortes que mencionem "investimento").
V1 Brand kit aplicado automaticamente.

### 4.4 Processamento com IA

MVP Transcrição com faster-whisper e timestamps por palavra.
MVP Detecção de momentos virais por LLM, com nota 0–100 e justificativa.
MVP Ajuste fino dos limites do corte (começa e termina em frase completa, sem cortar palavra).
MVP Reenquadramento automático 9:16 seguindo o rosto de quem fala.
MVP Título, gancho (hook) e descrição com hashtags para cada corte.
MVP Fila de processamento com progresso por etapa, tempo estimado, cancelar e retomar após
fechar o app.
V1 Remoção de silêncios e de vícios de linguagem ("é…", "tipo", "né", "hum").
V1 Identificação de falantes (diarização) para trocar o enquadramento entre pessoas.
V1 Destaque automático de palavras-chave e emojis na legenda.
V1 Zoom "punch-in" automático em frases de impacto.
V2 B-roll automático a partir da biblioteca local do usuário (busca semântica por CLIP).
V2 Tradução e legenda em outro idioma; dublagem.

### 4.5 Resultados

MVP Grade de cortes ordenada pela nota, cada card com preview em loop ao passar o mouse,
nota, título, duração, justificativa.
MVP Ações por corte: Editar, Exportar, Duplicar, Excluir, Favoritar.
MVP Seleção múltipla e exportação em lote.
V1 Filtros: nota mínima, duração, favoritos, falante; busca por texto falado.
V1 "Criar corte manual": marcar entrada/saída no vídeo original.

### 4.6 Editor (ver seção 7)

MVP Preview com player, timeline multipista, painel de transcrição editável, painel de
propriedades.
MVP Ajustar entrada/saída, cortar trechos pelo texto, editar texto das legendas, trocar estilo.
MVP Ajustar enquadramento (keyframes de posição/zoom), modo de layout (rosto único, tela
dividida, fundo desfocado).
MVP Desfazer/refazer ilimitado, salvamento automático.
V1 Cards e motions (textos animados, CTAs, lower thirds, emojis, barra de progresso) com
biblioteca de presets.
V1 Música de fundo com ducking automático, efeitos sonoros (whoosh, pop).
V1 Sobreposição de imagens/vídeos (logo, B-roll manual).

### 4.7 Exportação

MVP MP4 H.264/AAC, 1080×1920 (ou conforme formato), 30/60 fps, com encoder por GPU
(NVENC, VideoToolbox) e fallback x264.
MVP Presets: TikTok, Reels, Shorts, Alta qualidade, Arquivo leve.
MVP Exportar também .srt e um .txt com título, descrição e hashtags.
MVP Fila de exportação com progresso; abrir pasta ao terminar; notificação do sistema.
V1 Exportar projeto para outros editores (XML para Premiere/DaVinci, FCPXML).
V2 Publicação direta (YouTube, TikTok) via OAuth do próprio usuário.

### 4.8 Brand kits e templates

MVP Templates de legenda pré-prontos (mínimo 8) e criação de templates próprios.
V1 Brand kit: logo, cores, fontes, posição da marca d'água, CTA final padrão, intro/outro.
V1 Importar/exportar templates e brand kits como .cortai-template (JSON + assets zipados).
V2 Galeria comunitária de templates (repositório GitHub separado, baixados pela interface).

### 4.9 Geral

MVP Interface em PT-BR e inglês (i18next), detectando o idioma do sistema.
MVP Atalhos de teclado documentados (tela "Atalhos", tecla ? ).
MVP Telemetria: nenhuma por padrão. Relatórios de erro só com consentimento explícito.
V2 Sistema de plugins (novos efeitos, provedores de IA, exportadores).

## 5. Fluxo do usuário

```
 ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
 │ 1ª EXECUÇÃO  │──▶│    INÍCIO    │──▶│ CONFIGURAR   │──▶│ PROCESSANDO  │
 │ Assistente + │   │ Arrastar ou  │   │ Duração, nº, │   │ Etapas com   │
 │ downloads    │   │ colar link   │   │ formato, leg.│   │ progresso    │
 └──────────────┘   └──────────────┘   └──────────────┘   └──────┬───────┘
                                                                  │
                    ┌──────────────┐   ┌──────────────┐   ┌──────▼───────┐
                    │  EXPORTAÇÃO  │◀──│    EDITOR    │◀──│  RESULTADOS  │
                    │ Fila + pasta │   │ Ajustes      │   │ Grade de     │
                    │ + legendas   │   │ manuais      │   │ cortes + nota│
                    └──────────────┘   └──────────────┘   └──────────────┘
```
Caminho feliz (meta: menos de 5 cliques até o primeiro corte exportado)
1. Usuário arrasta podcast-ep42.mp4 na tela Início.
2. Modal "Configurar" abre com padrões inteligentes. Clica em Gerar cortes.
3. Tela de processamento mostra etapas; ele pode minimizar e voltar depois (notificação ao
terminar).
4. Grade com 14 cortes. Passa o mouse para ver previews. Seleciona os 5 melhores.
5. Clica em Exportar 5. Arquivos aparecem na pasta de saída.
Caminho com edição
Na grade, clica em Editar no corte. No editor, apaga uma frase pela transcrição, corrige uma palavra
da legenda, ajusta o enquadramento num trecho em que a câmera errou, adiciona um card "Siga
para mais" no final e exporta.

## 6. Telas e detalhes de interface


### 6.1 Estrutura global

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ◆ Cortaí                       [ busca  ⌘K ]               ⚙  ─  □  ✕     │ ← barra de título
├────────┬───────────────────────────────────────────────────────────────────┤
│ ⌂ Início│                                                                  │
│ ▣ Projetos                                                                 │
│ ✦ Templates                     CONTEÚDO DA TELA                           │
│ ◎ Brand kits                                                               │
│ ⇩ Exportações                                                              │
│        │                                                                   │
│ ────── │                                                                   │
│ GPU ●  │                                                                   │
│ Fila 2 │                                                                   │
└────────┴───────────────────────────────────────────────────────────────────┘
```
Sidebar de 220 px, recolhível para 64 px (só ícones). Item ativo com barra lateral primary de 3
px.
Rodapé da sidebar: indicador de GPU (verde = CUDA ativo, amarelo = CPU) e mini-status da fila
com contador.
Ctrl/⌘+K abre a paleta de comandos (buscar projetos, ações, configurações).
No editor, a sidebar some automaticamente para dar espaço.

### 6.2 Assistente de primeira execução

```
┌──────────────────────────────────────────────────────────────┐
│                        ◆ Cortaí.                             │
│           Vamos preparar tudo. Leva uns minutinhos.          │
│                                                              │
│   Seu computador                                             │
│   ✓ NVIDIA RTX (CUDA)    ✓ 16 GB RAM    ✓ 120 GB livres      │
│                                                              │
│   Perfil recomendado:  ( ) Leve  (●) Equilibrado  ( ) Máximo │
│                                                              │
│   Componentes                                    Tamanho     │
│   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  FFmpeg ................. ✓  85 MB       │
│   ▓▓▓▓▓▓▓▓▓░░░░░░░  Motor de IA ............ 54% 1.1 GB     │
│   ░░░░░░░░░░░░░░░░  Whisper large-v3-turbo .  –  1.6 GB      │
│   ░░░░░░░░░░░░░░░░  LLM (Qwen 2.5 7B) ......  –  4.7 GB      │
│                                                              │
│   [ Mudar pasta dos modelos ]            [ Pausar ] [ ▶ ]    │
└──────────────────────────────────────────────────────────────┘
```
Perfis: Leve (Whisper small, LLM 3B, para CPU/notebook fraco), Equilibrado (large-v3-turbo +
LLM 7–8B), Máximo (large-v3 + LLM 14B ou maior, com diarização).
O usuário pode pular e usar o app enquanto o resto baixa; ações que dependem do modelo ficam
desabilitadas com tooltip explicando.

### 6.3 Início

```
┌────────────────────────────────────────────────────────────────────────┐
│  Bom dia, Taissir                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │          ⇪  Arraste um vídeo aqui e deixa que a gente corta      │  │
│  │                                                                  │  │
│  │   [ ⛓ Cole um link do YouTube...                ] [Gerar cortes]│  │
│  │                 ou  [ Escolher arquivo ]                         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  Recentes                                               Ver todos →    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                   │
│  │ ▶ thumb  │ │ ▶ thumb  │ │ ▓▓▓░ 62% │ │ ▶ thumb  │                   │
│  │ Ep. 42   │ │ Live 10/11│ │ Aula 3   │ │ Entrev.  │                  │
│  │ 14 cortes│ │ 22 cortes│ │Transcrev.│ │ 9 cortes │                   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘                   │
└────────────────────────────────────────────────────────────────────────┘
```
A zona de soltar ocupa a largura toda, borda tracejada border ; ao arrastar um arquivo por cima, a
borda vira primary com glow e o texto muda para "Solta aí!".
O botão "Gerar cortes" fica inativo até haver link ou arquivo.
Cards de projeto em processamento mostram progresso e etapa atual.

### 6.4 Modal "Configurar geração"

```
┌─────────────────────────────────────────────────────────────┐
│ podcast-ep42.mp4 · 1h 12min · 1920×1080 · 30 fps        ✕   │
│ ┌──────────────────────┐   Idioma        [ Detectar auto ▾] │
│ │                      │   Duração       [Auto][<30s][30-60]│
│ │     ▶ preview        │                 [60-90][90s-3m]    │
│ │                      │   Quantidade    [ Automático ▾ ]   │
│ └──────────────────────┘   Formato       [9:16][1:1][4:5]   │
│ Processar: 00:00 ━━━━●━━━━━━━━━━━●━━ 1:12:04                │
│                                                             │
│ ✦ O que procurar? (opcional)                                │
│ [ Momentos engraçados e histórias pessoais...            ]  │
│ (Engraçado) (Polêmico) (Dicas) (Histórias) (Frases)         │
│                                                             │
│ Estilo de legenda                                           │
│ [ Hormozi ][ Karaokê ][ Minimal ][ Neon ][ Caixa ] →        │
│                                                             │
│ Estimativa: ~6 min na sua GPU          [ ✦ Gerar cortes ]   │
└─────────────────────────────────────────────────────────────┘
```
Os templates de legenda são mini-previews animados (cada um mostra uma frase de exemplo
com a animação real).
A estimativa de tempo usa um benchmark rápido feito no assistente inicial.
"Lembrar estas escolhas" salva como padrão.

### 6.5 Processamento

```
┌──────────────────────────────────────────────────────────────┐
│  Cortando o Ep. 42…                              ~4 min      │
│                                                              │
│   ✓ Preparando áudio                               0:08      │
│   ✓ Transcrevendo (12.430 palavras)                1:52      │
│   ◐ Procurando momentos virais   ▓▓▓▓▓▓▓░░░  7/12 trechos    │
│   ○ Reenquadrando rostos                                     │
│   ○ Gerando títulos e legendas                               │
│                                                              │
│  Já encontrados:  [Corte 92] [Corte 88] [Corte 81] ...       │
│                                                              │
│  [ Minimizar e continuar usando ]           [ Cancelar ]     │
└──────────────────────────────────────────────────────────────┘
```
Cortes aparecem em tempo real conforme são encontrados (streaming), reduzindo a sensação de
espera.
Se o app for fechado, a fila retoma na etapa onde parou (cada etapa salva seu resultado em
disco).

### 6.6 Resultados

```
┌────────────────────────────────────────────────────────────────────────┐
│ ← Ep. 42   14 cortes · ordenado por nota ▾   [Filtros] [✓ Selecionar]  │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│ │┌────────┐│ │┌────────┐│ │┌────────┐│ │┌────────┐│ │┌────────┐│       │
│ ││        ││ ││        ││ ││        ││ ││        ││ ││        ││       │
│ ││  9:16  ││ ││  9:16  ││ ││  9:16  ││ ││  9:16  ││ ││  9:16  ││       │
│ ││ preview││ ││ preview││ ││ preview││ ││ preview││ ││ preview││       │
│ │└────────┘│ │└────────┘│ │└────────┘│ │└────────┘│ │└────────┘│       │
│ │ ◉ 92     │ │ ◉ 88     │ │ ◉ 81     │ │ ◉ 77     │ │ ◉ 74     │       │
│ │"O erro que│ │"Ninguém  │ │"Quanto eu│ │ ...      │ │ ...      │      │
│ │ quase..." │ │ conta..."│ │ ganhei"  │ │          │ │          │      │
│ │ 0:47  ★ ✎ ⇩││ 0:58     │ │ 1:12     │ │          │ │          │     │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                  [ ⇩ Exportar selecionados (3) ]       │
└────────────────────────────────────────────────────────────────────────┘
```
Nota viral: anel circular com gradiente violeta→limão. 85+ = "Alto potencial", 70–84 = "Bom", <70
= "Médio".
Hover sobre o card: toca o preview em loop sem som (som ao clicar). Clique no card abre um
painel lateral com detalhes: justificativa da IA ("Gancho forte nos 3 primeiros segundos, história
pessoal, final com conclusão clara"), notas por critério (Gancho, Emoção, Valor, Tendência),
transcrição, título e descrição editáveis.
Barra de ação flutuante aparece quando há seleção múltipla.

### 6.7 Exportações

Lista de trabalhos de renderização com miniatura, preset, progresso, velocidade (ex.: "4,2× tempo
real"), botões Abrir pasta, Reexportar, Cancelar. Histórico de exportações por projeto.

### 6.8 Templates e Brand kits

Galeria de templates de legenda e cards com preview animado. Editor de template com controles:
fonte, tamanho, cor do texto, cor de destaque, contorno, sombra, fundo (caixa), posição vertical,
animação de entrada por palavra (pop, bounce, fade, typewriter, highlight), quantidade de palavras
por linha, caixa alta, emojis automáticos. Brand kit: logo, posição, opacidade, paleta, fontes, CTA
final.

### 6.9 Configurações

Abas: Geral (idioma, pasta de projetos, pasta de saída), IA (perfil, modelos instalados com tamanho e
botão remover, motor LLM, chaves de API opcionais, prompts avançados editáveis), Desempenho
(GPU, threads, encoder de vídeo, uso máximo de VRAM), Atalhos, Armazenamento (limpar cache,
proxies), Sobre (versão, licença, links do GitHub, checar atualizações).

## 7. Editor (detalhamento)

Inspirado no fluxo do Flow Me: tudo editável, com a transcrição como espinha dorsal e cards/motions
definidos em JSON reaproveitáveis.
```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ← Resultados   "O erro que quase me quebrou"   ◉ 92   ↶ ↷   Salvo ✓  [⇩ Exportar]│
├──────────────────────┬───────────────────────────────┬───────────────────────────┤
│ TRANSCRIÇÃO   [busca]│                               │ PROPRIEDADES              │
│                      │        ┌───────────┐          │ [Legenda][Layout][Card]   │
│ 00:03 Eu quase       │        │           │          │ [Áudio][Clipe]            │
│ ~~quebrei~~ perdi    │        │  PREVIEW  │          │                           │
│ tudo em 2019. ✦      │        │   9:16    │          │ Template   [Hormozi ▾]    │
│ E o erro foi         │        │           │          │ Fonte      [Montserrat ▾] │
│ ░tipo░ simples.      │        │  ┌─────┐  │          │ Tamanho    ━━━●━━  72     │
│                      │        │  │rosto│  │          │ Cor        ■ #FFFFFF      │
│ 00:11 Eu achava que… │        │  └─────┘  │          │ Destaque   ■ #C6F432      │
│                      │        │ QUASE PERDI│         │ Contorno   ━●━━━━  6      │
│ ✦ = destaque da IA   │        │   TUDO    │          │ Posição Y  ━━━━━●  78%    │
│ ░ = vício (remover?) │        └───────────┘          │ Palavras/linha [ 3 ▾]     │
│                      │  ⏮  ◀  ▶  ▶▶   00:12 / 00:47  │ Animação   [Pop ▾]        │
│                      │  [Ajustar enquadramento ⌖]    │ ☑ Emojis   ☑ CAIXA ALTA   │
├──────────────────────┴───────────────────────────────┴───────────────────────────┤
│ 0:00      0:05      0:10      0:15      0:20      0:25      0:30      0:35       │
│          ▼ playhead                                                              │
│ ▣ Vídeo  ████████████████│████████████████████████│██████████████████  ⌖ ⌖ ⌖     │
│ T Legenda [Eu quase][perdi][tudo em][2019][E o erro][foi simples]...             │
│ ✦ Cards                          [ Gancho ]                    [ Siga ▸ ]        │
│ ⚡ Efeitos        [zoom 1.2×]              [zoom]                                │
│ ♪ Música  ▁▂▂▃▂▂▁▂▃▂▂▁▂▂▃▂▂▁▂▂▃▂▂▁▂▃▂▂▁▂ (ducking)                                │
│                                                         [−] ━━●━━ [+]  zoom      │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 7.1 Painel de transcrição (esquerda)

Texto agrupado em parágrafos por falante, com timecode clicável (pula o player para o ponto).
A palavra sendo falada fica realçada em tempo real durante a reprodução.
Editar o vídeo pelo texto: selecionar palavras e apertar Delete remove aquele trecho do corte
(aparece riscado; Ctrl+Z desfaz). Arrastar seleção para fora do início/fim encurta o corte.
Corrigir legenda: duplo clique numa palavra edita só o texto (não mexe no tempo).
Vícios de linguagem e silêncios longos aparecem sublinhados; botão "Remover todos os vícios" e
"Remover silêncios > 0,5 s".
Expansão: botão "Mostrar contexto" exibe 30 s antes/depois do corte em cinza, permitindo
estender o corte com um clique.

### 7.2 Preview (centro)

Renderização em tempo real no navegador: <video> com proxy 540p + camada de
legendas/cards em canvas/DOM, sincronizadas por requestVideoFrameCallback . O resultado
final do export deve ser visualmente idêntico (ver 9.4).
Modo Ajustar enquadramento: mostra o vídeo original 16:9 com a "janela" 9:16 por cima; o
usuário arrasta/redimensiona a janela e cria keyframes. Botões: "Seguir rosto automaticamente",
"Fixar aqui", "Centralizar".
Layouts: Rosto único, Dois rostos (tela dividida em cima/embaixo), Original com fundo desfocado,
Original com fundo de cor, Tela + rosto (para vídeos de tela/tutorial).
Guias de áreas seguras (onde a interface do TikTok/Reels cobre o vídeo), ativáveis com G .
Clicar numa legenda ou card no preview seleciona o item e abre suas propriedades; arrastar
move a posição.

### 7.3 Timeline (embaixo)

Trilhas: Vídeo, Legenda, Cards/Textos, Efeitos, Overlays (imagens/logo), Música, SFX. Cores
conforme seção 3.3.
Onda sonora no clipe de vídeo; miniaturas em zoom alto.
Operações: dividir ( S ), apagar ( Del ), arrastar bordas (trim), mover, snap magnético em palavras,
playhead e outros itens.
Keyframes de enquadramento aparecem como losangos (⌖) na trilha de vídeo.
Zoom com Ctrl+scroll ; scroll horizontal com Shift+scroll .
Biblioteca da timeline: virtualizada para lidar com milhares de palavras sem travar.

### 7.4 Painel de propriedades (direita)

Aba
Controles
Legenda
Template, fonte, tamanho, cores (texto, destaque, contorno, fundo), sombra, posição, palavras por
linha, animação, caixa alta, emojis automáticos, palavras-chave destacadas (lista editável).
Layout
Formato (9:16, 1:1, 4:5, 16:9), modo de layout, suavização do rastreamento de rosto, zoom base,
cor/blur do fundo.
Card
Quando um card está selecionado: texto, preset, cores, fonte, animação de entrada/saída, duração,
posição. Biblioteca de presets: Gancho (título no topo nos 3 primeiros segundos), Lower third, CTA
"Siga", Contador, Lista numerada, Emoji pop, Barra de progresso, Seta/destaque.
Áudio
Volume da fala, normalização (-14 LUFS), redução de ruído (V1), música (biblioteca local ou arquivo),
volume, ducking, fade in/out, efeitos sonoros automáticos em cortes.
Clipe
Título, descrição, hashtags (com botão ✦ Regenerar), notas e justificativa da IA, entrada/saída
numérica.

### 7.5 Atalhos principais

Ação
Atalho
Ação
Atalho
Play/Pause
Espaço
Dividir no playhead
S
Voltar/avançar 1 quadro
← / →
Marcar entrada/saída
I / O
Voltar/avançar palavra
Alt+← / →
Desfazer/refazer
Ctrl+Z / Ctrl+Shift+Z
J / K / L (shuttle)
J K L
Exportar
Ctrl+E
Áreas seguras
G
Paleta de comandos
Ctrl+K

## 8. Pipeline de IA

```
 vídeo ─▶ [1 Ingestão] ─▶ [2 Áudio 16k] ─▶ [3 Transcrição] ─▶ [4 Segmentação]
                │                                                   │
                ▼                                                   ▼
         [proxy 540p +                                     [5 Pontuação LLM]
          miniaturas]                                               │
                                                                    ▼
 [9 Render] ◀─ [8 Metadados] ◀─ [7 Reenquadramento] ◀─ [6 Ajuste de limites]
```
Etapa
Ferramenta
Detalhes

## 1. Ingestão

FFprobe, yt-dlp
Lê metadados; baixa link; gera proxy 540p (H.264, keyframe a
cada 1 s) para edição fluida e sprites de miniaturas para a
timeline.

## 2. Áudio

FFmpeg
Extrai WAV mono 16 kHz; normaliza volume.

## 3. Transcrição

faster-whisper
(CTranslate2) + VAD
Silero
word_timestamps=True ; modelo conforme perfil; float16 na
GPU, int8 na CPU. Salva transcript.json com palavras,
início, fim e confiança. Em V1, diarização com pyannote ou
alternativa leve.

## 4. Segmentação

Python
Agrupa palavras em frases (pontuação + pausas); cria janelas
candidatas de 2–4 min com sobreposição de 30 s; detecta
cenas com PySceneDetect para ajudar nos limites.

## 5. Pontuação

LLM local
(Ollama/llama.cpp)
Para cada janela, o LLM devolve JSON (validado por schema)
com trechos candidatos: início e fim por índice de frase, título,
gancho, notas por critério, justificativa. Saída estruturada via
format: json /gramática. Deduplicação de trechos
sobrepostos, mantendo o de maior nota.

## 6. Limites

Python
Começo e fim encaixam em início/fim de frase; respeita duração
alvo; adiciona 0,15 s de respiro; evita começar com conectivos
("e", "mas", "então").
7.
Reenquadramento
MediaPipe Face
Detection (ou YOLO-
face) + OpenCV
Amostra 5 fps, detecta rostos, escolhe o rosto ativo (maior e/ou
com movimento de boca; em V1, cruzando com a diarização),
suaviza com filtro (One Euro / média móvel) e gera keyframes
de corte. Detecta 2 pessoas para layout dividido.

## 8. Metadados

LLM
Título curto (≤ 60 caracteres), descrição, 3–5 hashtags,
palavras-chave para destaque na legenda, sugestões de emoji.

## 9. Render

FFmpeg + gerador de
legendas
Ver 9.4.

### 8.1 Critérios de pontuação (prompt base)

Gancho (30%): os primeiros 3 segundos prendem a atenção? Pergunta, afirmação forte, número,
conflito.
Valor/Emoção (30%): ensina algo, emociona, faz rir ou gera identificação.
Autonomia (25%): faz sentido sem o resto do vídeo (sem "como eu disse antes").
Fechamento (15%): termina com conclusão, punchline ou frase de efeito.
Os prompts ficam em engine/prompts/*.md , versionados, com placeholders, e são editáveis pelo
usuário em Configurações → IA → Prompts avançados (com botão "Restaurar padrão").
```
// Formato de saída esperado do LLM (validado com Pydantic no motor)
{
  "clips": [
    {
      "start_sentence": 41, "end_sentence": 58,
      "title": "O erro que quase me quebrou",
      "hook": "Eu quase perdi tudo em 2019.",
      "scores": { "hook": 95, "value": 88, "standalone": 92, "ending": 85 },
      "reason": "Abre com confissão forte, história pessoal, fecha com lição clara.",
      "keywords": ["perdi tudo", "2019", "erro"]
    }
  ]
}
```

### 8.2 Modelos padrão por perfil

Perfil
Whisper
LLM
Requisitos sugeridos
Leve
small
Qwen 2.5 3B / Llama 3.2 3B (Q4)
CPU, 8 GB RAM
Equilibrado
large-v3-turbo
Qwen 2.5 7B / Llama 3.1 8B (Q4)
GPU 6–8 GB VRAM, 16 GB RAM
Máximo
large-v3
Qwen 2.5 14B (Q4) ou maior
GPU 12 GB+ VRAM, 32 GB RAM
Na hora da implementação, revisar quais modelos abertos estão melhores em português e em saída
JSON; manter a lista em engine/models.json para trocar sem mudar código. A transcrição e o LLM
não devem ocupar a GPU ao mesmo tempo: descarregar o Whisper antes de chamar o LLM em
máquinas com pouca VRAM.

## 9. Arquitetura técnica


### 9.1 Stack

Camada
Tecnologia
Shell
desktop
Electron (versão estável atual) + electron-vite + electron-builder + electron-updater
Interface
React + TypeScript (strict) + Tailwind CSS (tokens da seção 3) + Radix UI (acessibilidade) +
Lucide
Estado
Zustand (com middleware de histórico para desfazer/refazer, via patches do Immer)
Animação de
UI
Framer Motion
i18n
i18next (pt-BR, en)
Banco local
SQLite via better-sqlite3 (índice de projetos, fila, histórico) + arquivos JSON por projeto
Motor de IA
Python 3.11, empacotado com PyInstaller (ou python-build-standalone) como sidecar baixável;
FastAPI + WebSocket em 127.0.0.1 com porta aleatória e token
Vídeo
FFmpeg/FFprobe (build LGPL com NVENC), binários baixados pelo gerenciador de
componentes
Testes
Vitest (unidade), Playwright for Electron (E2E), pytest (motor)
Qualidade
ESLint, Prettier, Ruff, mypy, Husky + lint-staged, GitHub Actions (build multiplataforma)

### 9.2 Processos

```
┌─────────────────────────── Electron ────────────────────────────┐
│  Renderer (React)  ◀── contextBridge (preload, tipado) ──▶ Main  │
│  - telas, editor, preview                         - janelas      │
│  - NÃO acessa Node/FS                             - SQLite       │
│                                                   - fila (jobs)  │
│                                                   - downloads    │
│                                                   - FFmpeg spawn │
└───────────────────────────────────────────────────────┬─────────┘
                                                        │ HTTP + WS (localhost, token)
                                         ┌──────────────▼──────────────┐
                                         │  Motor Python (sidecar)      │
                                         │  /transcribe /analyze        │
                                         │  /reframe /metadata /health  │
                                         │  eventos de progresso via WS │
                                         └──────────────┬──────────────┘
                                                        │
                                              Ollama / llama.cpp (LLM)
```
Segurança Electron: contextIsolation: true , nodeIntegration: false , sandbox: true , CSP
restritiva, protocolo customizado cortai-media:// para servir vídeos locais ao renderer.
A API do preload é um objeto tipado único ( window.cortai ) com namespaces: projects , jobs ,
engine , components , export , settings , dialog .
O Main inicia o sidecar sob demanda, monitora /health , reinicia em caso de crash e encerra
junto com o app.

### 9.3 Fila de jobs

Implementada no Main, persistida em SQLite. Cada job tem tipo ( ingest , transcribe , analyze ,
reframe , metadata , render ), status, progresso, artefato de saída e erro. Jobs dependentes formam
um grafo por projeto. Concorrência: 1 job de GPU por vez; renders podem rodar em paralelo limitado
(configurável). Ao reabrir o app, jobs running voltam para queued e retomam a partir do último
artefato salvo.

### 9.4 Renderização (preview igual ao export)

Risco principal do projeto: legendas e cards precisam ficar idênticos no preview e no vídeo final.
Abordagem recomendada:
1. Uma única implementação de desenho de legendas e cards em TypeScript sobre Canvas 2D
( drawOverlay(ctx, project, time) ), usada no preview.
2. No export, uma janela offscreen do Electron executa o mesmo drawOverlay quadro a quadro,
gerando PNGs RGBA (ou streaming de frames brutos via pipe) que o FFmpeg sobrepõe ao vídeo
reenquadrado com overlay .
3. O vídeo base (corte + crop com keyframes + escala + fundo desfocado) é montado com um
filtergraph do FFmpeg gerado a partir do project.json .
4. Alternativa a avaliar na fase 0: legendas em ASS/libass para velocidade, com cards via overlay.
Escolher após prova de conceito medindo fidelidade e velocidade.
Meta de desempenho: exportar um corte de 60 s em 1080×1920 em menos de 30 s numa GPU
NVIDIA de entrada.

## 10. Modelo de dados


### 10.1 Estrutura em disco de um projeto

```
~/Cortai/projects/<projectId>/
  project.json          # metadados, configurações de geração, lista de clipes
  source/               # vídeo original (ou link simbólico) + proxy 540p
  cache/audio.wav
  cache/thumbs/sprite_*.jpg
  analysis/transcript.json
  analysis/faces.json   # detecções por quadro amostrado
  analysis/candidates.json
  clips/<clipId>.json   # edição completa de cada clipe (timeline)
  exports/
```

### 10.2 Tipos principais (TypeScript, src/shared/types.ts )

```
export type AspectRatio = '9:16' | '1:1' | '4:5' | '16:9';
export interface Word { i: number; text: string; start: number; end: number;
  conf: number; speaker?: string; filler?: boolean }
export interface Transcript { language: string; words: Word[];
  sentences: { start: number; end: number; wordStart: number; wordEnd: number }[] }
export interface Project {
  id: string; name: string; createdAt: string; updatedAt: string;
  source: { path: string; url?: string; duration: number; width: number;
            height: number; fps: number; proxyPath?: string };
  generation: GenerationSettings;
  status: 'importing' | 'processing' | 'ready' | 'error';
  clipIds: string[];
}
export interface GenerationSettings {
  language: 'auto' | string; targetDuration: 'auto' | [number, number];
  maxClips: 'auto' | number; aspect: AspectRatio; captionTemplateId: string;
  range?: [number, number]; prompt?: string; requiredKeywords?: string[];
  brandKitId?: string; // sem = o kit padrão (se não houver, nenhum); '' = nenhum
}
export interface Clip {
  id: string; projectId: string; title: string; description: string;
  hashtags: string[]; score: number;
  scores: { hook: number; value: number; standalone: number; ending: number };
  reason: string; favorite: boolean;
  in: number; out: number;            // segundos no vídeo original
  cuts: [number, number][];           // trechos removidos (edição por texto)
  order?: EditItem[];                 // lista de edição: pedaços na ordem em que tocam (pode repetir trechos)
  copies?: Record<number, CopyEdits>; // edições próprias de cada cópia g >= 1 (a 0 usa wordEdits/reframe)
  splits?: number[];                  // legado: divisões antes de existir order
  muted?: [number, number][];         // legado: trechos silenciados (hoje é EditItem.muted)
  bookmarks?: number[];               // marcadores da timeline (segundos no original; só visual)
  wordEdits: Record<number, string>;  // índice da palavra -> texto corrigido
  brandKitId?: string;                // brand kit aplicado (logo, CTA, fontes); resolvido na prévia e no export
  cta?: { text: string; positionY: number }; // CTA do próprio corte (vazio = o do kit); vence o do kit
  layout: LayoutSettings; reframe: ReframeKeyframe[];
  caption: CaptionStyle; tracks: Track[]; audio: AudioSettings;
}
export interface EditItem { a: number; b: number; g: number; muted?: boolean; frame?: PieceFrame; // a, b = segundos do original; g = cópia
  keys?: ReframeKeyframe[]; // movimento próprio do pedaço (t em segundos do ORIGINAL); vence frame e os keyframes da cópia
  zoom?: number }           // zoom próprio do pedaço; sem ele, o da cópia
/** Enquadramento fixo de um pedaço (centro da janela, 0–1 no original); sem ele, segue os keyframes da cópia. */
export interface PieceFrame { x: number; y: number }
export interface CopyEdits { wordEdits: Record<number, string>; reframe: ReframeKeyframe[] }
export interface ReframeKeyframe { t: number; x: number; y: number;
  zoom: number; ease: 'linear' | 'smooth'; auto: boolean }
export interface LayoutSettings { aspect: AspectRatio;
  mode: 'single' | 'split' | 'blur-bg' | 'color-bg' | 'screen-face';
  smoothing: number; bgColor?: string; bgBlur?: number;
  webcam?: { x: number; y: number; w: number } } // tela + webcam: centro (0–1) e largura (fração) da janela no original
/** Template de legenda próprio (os prontos ficam em shared/templates.ts). */
export interface CaptionTemplate { id: string; name: string; style: CaptionStyle }
/** Brand kit (V1): arquivos guardados como data URL (logo/fontes pequenos; exporta/importa como um JSON só). */
export interface BrandKit {
  id: string; name: string; templateId?: string; palette: string[];
  fonts: { family: string; data: string }[];
  logo?: { data: string; position: 'tl' | 'tr' | 'bl' | 'br'; size: number; opacity: number }; // size = fração da largura
  cta?: { text: string; seconds: number; color: string; bg: string; font: string; positionY: number }; // CTA final: últimos `seconds`
}
export interface CaptionStyle {
  templateId: string; font: string; size: number; color: string;
  highlightColor: string; strokeColor: string; strokeWidth: number;
  shadow?: { color: string; blur: number; x: number; y: number };
  box?: { color: string; radius: number; padding: number };
  positionY: number; wordsPerLine: number; uppercase: boolean;
  animation: 'none' | 'pop' | 'bounce' | 'fade' | 'typewriter' | 'highlight';
  emojis: boolean; keywords: string[];
}
export type Track =
  | { id: string; kind: 'card'; items: CardItem[] }
  | { id: string; kind: 'effect'; items: EffectItem[] }
  | { id: string; kind: 'overlay'; items: OverlayItem[] }
  | { id: string; kind: 'music' | 'sfx'; items: AudioItem[] };
export interface CardItem { id: string; preset: string; start: number;
  end: number; props: Record<string, unknown>;  // texto, cores, posição...
  enter: AnimationSpec; exit: AnimationSpec }
export interface AnimationSpec { type: string; duration: number; easing: string }
export interface EffectItem { id: string; type: 'zoom' | 'shake' | 'flash';
  start: number; end: number; intensity: number }
export interface OverlayItem { id: string; src: string; start: number;
  end: number; x: number; y: number; w: number; h: number; opacity: number }
export interface AudioItem { id: string; src: string; start: number;
  end: number; volume: number; fadeIn: number; fadeOut: number; duck?: boolean }
export interface AudioSettings { speechGain: number; normalizeLufs?: number;
  denoise: boolean }
```
Cards como JSON: cada preset de card vive em resources/cards/<preset>.json (no mesmo espírito
do cards.json do Flow Me), descrevendo camadas, propriedades editáveis e animações. Isso
permite reaproveitar e compartilhar cards entre projetos e com a comunidade.
Todo arquivo JSON tem "schemaVersion" e um módulo de migrações ( src/shared/migrations ) para
manter compatibilidade entre versões.

## 11. Estrutura de pastas do repositório

```
cortai/
├─ CLAUDE.md                 # resumo para o agente: comandos, convenções
├─ README.md  README.pt-BR.md  LICENSE  CONTRIBUTING.md  CODE_OF_CONDUCT.md
├─ docs/  SPEC.md  ARCHITECTURE.md  screenshots/  demo.gif
├─ .github/  workflows/ (ci.yml, release.yml)  ISSUE_TEMPLATE/
├─ package.json  electron.vite.config.ts  electron-builder.yml  tsconfig*.json
├─ resources/
│  ├─ icons/  fonts/  cards/  caption-templates/  sfx/  music/
├─ src/
│  ├─ main/                  # processo principal Electron
│  │  ├─ index.ts  window.ts  protocol.ts  ipc/  db/
│  │  ├─ jobs/ (queue.ts, runners/)   ffmpeg/ (filtergraph.ts, render.ts)
│  │  ├─ components/ (download, verify, registry)   engine/ (sidecar.ts)
│  ├─ preload/  index.ts     # window.cortai tipado
│  ├─ renderer/
│  │  ├─ app/ (router, layout, sidebar, titlebar)
│  │  ├─ screens/ (Onboarding, Home, Generate, Processing, Results,
│  │  │            Editor, Exports, Templates, BrandKits, Settings)
│  │  ├─ editor/ (Transcript, Preview, Timeline, Inspector, store/)
│  │  ├─ overlay/  drawOverlay.ts  captions/  cards/  # usado no preview E no export
│  │  ├─ components/ui/  (Button, Input, Slider, Modal, Tabs, ScoreRing...)
│  │  ├─ styles/ tokens.css  globals.css
│  │  └─ i18n/ pt-BR.json en.json
│  └─ shared/  types.ts  schemas.ts (zod)  migrations/  constants.ts
├─ engine/                   # motor Python
│  ├─ pyproject.toml  cortai_engine/
│  │  ├─ server.py  transcribe.py  segment.py  analyze.py  reframe.py
│  │  ├─ metadata.py  llm/ (ollama.py, llamacpp.py, openai_compat.py)
│  ├─ prompts/  models.json  tests/
└─ scripts/  build-engine.py  fetch-dev-binaries.ts
```
Para desenvolvimento, scripts/fetch-dev-binaries.ts baixa FFmpeg e prepara o venv do motor; o
desenvolvedor pode usar terminal, mas o usuário final nunca.

## 12. Roadmap e critérios de aceite


#### Fase 0 — Fundação e provas de conceito

Repositório, CI, Electron + React + Tailwind com tokens, janela frameless, sidebar, i18n.
Sidecar Python mínimo com /health , iniciado e encerrado pelo Main.
POC de render: um clipe de 30 s com legenda animada, comparando Canvas offscreen vs ASS.
Aceite: npm run dev abre a janela; o indicador do motor fica verde; a POC gera um MP4 com
legenda idêntica ao preview, e a decisão de render está registrada em docs/ARCHITECTURE.md .

#### Fase 1 — Pipeline automático (sem editor)

Assistente de primeira execução e gerenciador de componentes.
Importação (arquivo e link), modal de configuração, fila de jobs persistente.
Transcrição, segmentação, pontuação com LLM, ajuste de limites, reenquadramento, metadados.
Tela de processamento com streaming de resultados e tela de resultados com grade.
Exportação com um template de legenda.
Aceite: numa máquina limpa, instalar o app, concluir o assistente sem terminal, arrastar um vídeo de
30 min e obter pelo menos 5 cortes exportados com legenda e rosto enquadrado; fechar o app no
meio do processamento e retomar.

#### Fase 2 — Editor (MVP)

Layout do editor, preview com overlay, transcrição sincronizada, edição por texto, timeline com
trilhas de vídeo e legenda.
Painel Legenda e Layout, modo Ajustar enquadramento com keyframes.
8 templates de legenda; desfazer/refazer; salvamento automático; atalhos.
Aceite: apagar uma frase pela transcrição, corrigir uma palavra, mudar o estilo e o enquadramento, e
o export refletir tudo exatamente; editor fluido (60 fps no preview) com corte de 3 min.

#### Fase 3 — Lançamento público (v0.1)

Instaladores assinados quando possível, auto-update, README com GIF, site simples (GitHub
Pages), templates de issue.
Testes E2E do caminho feliz no CI.

#### Fase 4 — V1

Cards e motions com presets JSON, música e SFX com ducking, remoção de vícios e silêncios,
diarização e layout dividido, prompt "O que procurar", brand kits, filtros, corte manual, exportação
XML, Linux, chaves de API opcionais.

#### Fase 5 — V2

B-roll semântico, tradução/dublagem, galeria comunitária, plugins, publicação direta, multicâmera.

## 13. Open source: licença, README e lançamento


### 13.1 Licença

Recomendação: AGPL-3.0 se a intenção for impedir que alguém transforme o projeto em SaaS
fechado; MIT se a prioridade for adoção máxima e contribuições. Para um projeto que você talvez
queira monetizar depois (versão Pro, serviço de edição), AGPL + possibilidade de licença comercial é
uma combinação comum. Decisão em aberto (seção 14).
Atenção às licenças das dependências: FFmpeg deve ser uma build LGPL (sem componentes GPL,
como x264, se a licença do app for MIT; com AGPL/GPL isso fica mais simples); modelos de IA têm
licenças próprias (verificar a de cada LLM e da diarização). Gerar a lista de licenças de terceiros na
tela Sobre.

### 13.2 README (estrutura)

1. Logo + tagline + badges (release, downloads, licença, Discord).
2. GIF de 10–15 s: arrastar vídeo → grade de cortes → editor → export.
3. Botões grandes de download por sistema operacional.
4. Recursos em lista curta com emojis; comparação com ferramentas pagas (tabela honesta, sem
citar marcas de forma pejorativa).
5. Requisitos de hardware; FAQ; roadmap; como contribuir; agradecimentos (Whisper, FFmpeg,
Ollama...).

### 13.3 Lançamento

Preparar 3 vídeos de demonstração gerados pelo próprio Cortaí (metalinguagem viraliza).
Show HN, r/LocalLLaMA, r/selfhosted, r/podcasting, r/NewTubers, Product Hunt, X/Twitter,
TabNews, grupos de editores BR.
Abrir issues "good first issue" (novos templates de legenda, traduções) para atrair contribuidores
no dia do lançamento.
Discord ou GitHub Discussions para a comunidade.

## 14. Riscos e decisões em aberto

Tema
Risco / decisão
Recomendação
Tamanho do
download
Motor + modelos passam de 5 GB
Instalador pequeno (~150 MB) e downloads sob
demanda por perfil.
LLM embutido vs
Ollama
Ollama é fácil mas é outra
instalação; llama.cpp embutido dá
mais controle
MVP: usar Ollama (instalar pela interface); abstrair
em llm/ para trocar depois.
Fidelidade do
render
Preview diferente do export frustra o
usuário
Mesma função de desenho para ambos (9.4);
testes de snapshot de quadros.
Qualidade da
escolha de cortes
LLMs pequenos erram em PT-BR
Conjunto de avaliação com 10 vídeos anotados
manualmente; medir antes de trocar
prompt/modelo.
Download por link
Termos de uso das plataformas e
direitos autorais
Aviso claro; recurso pensado para conteúdo do
próprio usuário.
Assinatura de
código
Windows SmartScreen e macOS
Gatekeeper assustam usuários
Documentar no README; buscar
certificado/notarização quando houver tração.
Licença
MIT vs AGPL
Decidir antes do primeiro commit público.
Nome
Disponibilidade de "Cortaí" (GitHub,
domínio, marca)
Verificar antes de publicar; alternativas: Cortex
Clip, Talho, Recorte.
Próximo passo no Claude Code: "Leia este PDF, crie o CLAUDE.md e o docs/SPEC.md com base
nele e execute a Fase 0. Ao final, me mostre a POC de render e a decisão registrada."
