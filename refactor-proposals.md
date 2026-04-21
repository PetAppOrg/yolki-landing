# Refactor proposals — visual risk > none

Refatorações com ganho real identificadas na Phase 1 (2026-04-21) **não aplicadas**
na Phase 2 por terem risco visual/comportamental não-zero. Cada item listado abaixo
deve ser discutido individualmente antes de implementar.

Legenda: risco visual **low** = improvável mas precisa check rápido; **needs-verification** = precisa teste explícito.

---

## P3 · Fontes async (non-blocking)

**O que é.** Hoje `<link rel="stylesheet" href="fonts.googleapis.com/...">` bloqueia o render. Proposta: trocar por `<link rel="preload" as="style" onload="this.rel='stylesheet'">` + `<noscript>` fallback.

**Ganho.** 100-300 ms de LCP em conexões lentas (mobile 3G/4G). Fontes já têm `display=swap` então sistema-font aparece primeiro.

**Risco visual (low).** Por fração de segundo o título pode renderizar em fallback system-font até Poppins carregar, depois faz swap. Comportamento visual **já acontece hoje** graças ao `display=swap` — a diferença é que o swap pode ocorrer um pouco mais tarde. Em telas rápidas ninguém percebe.

**Verificação.** Lighthouse mobile (slow 4G) antes/depois. Comparar screencast em 3 pontos: 200ms, 500ms, 1s. FOUT deve ser imperceptível.

**Onde.** index.html:20, reflexoes.html:20, comparacao.html:22, 404.html:8, termos.html:11, privacidade.html:11, cookies.html:12, lgpd.html:11, imprensa.html:19.

---

## P4 · `<video preload="auto">` → `"metadata"`

**O que é.** O `<video id="heroVideo" preload="auto">` baixa os 5.39 MB do MP4 antes do usuário ver o vídeo. Proposta: `preload="metadata"` (baixa só os bytes do container + 1 frame ~100 KB). O IntersectionObserver existente dispara `video.play()` ao entrar na viewport, o que força o download a partir daí.

**Ganho.** −5 MB no first visit de usuários que fazem bounce antes do video-reveal.

**Risco visual (needs-verification).** O "auto-preview" mudo após 2s pode atrasar alguns ms porque o stream precisa baixar 1-2 segundos de vídeo para o primeiro frame já estar pronto. Provavelmente invisível, mas se o timing atual estiver calibrado visualmente, trocar pode causar "flicker" de frame cover.

**Verificação.** Carregar página, scrollar até `section-video`, medir tempo entre entrada na viewport e primeiro frame mudo tocando. Comparar.

**Onde.** index.html:6565.

---

## P5 · `srcset`/`<picture>` para fotos reusadas em múltiplos contextos

**O que é.** Fotos 800×1200 são usadas em 3 contextos: testemunhos (~180×220), orbital (~170×230), floating-cards (32-102px). Gerar `*-thumb.webp` em 400×600 para os 2 contextos menores.

**Ganho.** ~500 KB no carregamento inicial (floating-cards começam a carregar eagerly).

**Risco visual (needs-verification).** Compressão de 400px pode diferir ligeiramente do resize do browser. Em retina (2×DPR) um floating-card de 68px pede 136px de fonte — 400px fica com sharpness de sobra.

**Verificação.** Side-by-side das floating-cards em desktop retina + mobile. Olho nu não deve distinguir.

**Onde.** index.html:7376-7393 (18 refs em floating-cards), 7709-7717 (9 refs no orbital JS).

**Complexidade.** Precisa gerar os thumbs (sips ou sharp) e atualizar todas as refs.

---

## P7 · Pausar `requestAnimationFrame` do Matter.js offscreen

**O que é.** Depois que `.jars-section` entra na viewport, o loop RAF roda indefinidamente mesmo quando o usuário scroll-away. Proposta: usar IntersectionObserver para chamar `cancelAnimationFrame(w.rafId)` quando seção sai da viewport e `requestAnimationFrame(render)` quando volta.

**Ganho.** Redução de CPU/bateria em mobile durante scroll longo. Não mexe em LCP/CLS, mas mexe em INP e experiência térmica.

**Risco visual (needs-verification).** Se o usuário scrolla para longe e volta, as pills estarão exatamente onde estavam (física parada). Pode parecer "travado" vs. o comportamento atual onde a simulação continuou. Em Matter.js com `enableSleeping: true` (já está) as pills param naturalmente depois de alguns segundos, então provavelmente indistinguível na prática.

**Verificação.** Scroll até `.jars-section`, esperar todas as pills caírem, scrollar 3 viewports pra baixo, esperar 30s, scrollar de volta. Comparar antes/depois.

**Onde.** index.html handler do `.jars-section` (linhas ~9740-9810).

---

## C3 · Extrair shell.css + shell.js (nav, footer, lang-picker, theme-toggle)

**O que é.** ~960 linhas de CSS+JS estão duplicadas entre `index.html`, `comparacao.html`, `reflexoes.html`, `404.html`. Extrair para `/assets/shell.css` + `/assets/shell.js` permite cache cross-route via o `Cache-Control: immutable` adicionado no commit 3 da Phase 2.

**Ganho.** ~30-60 KB comprimidos (1 vez, depois cached em todas as páginas).

**Risco visual (needs-verification).** Refator em 4 páginas simultâneas. Qualquer divergência sutil entre as cópias atuais do shell é apagada — precisa de diff minucioso. Também, CSS inline tem prioridade de source-order vs externo: se há regra em `.nav-*` que depende da posição no `<style>` pra ter precedence, pode quebrar.

**Verificação.** Screenshot das 4 páginas em 3 viewports (mobile/tablet/desktop) + dark/light theme antes e depois. Comparar pixel-diff.

**Esforço.** L (4-6h com verificação).

**Alternativa mais leve.** Se o shell é idêntico entre páginas, extrair apenas o JS (mais fácil de validar) e deixar o CSS duplicado. Ganho menor mas risco mínimo.

---

## A1 · Deduplicar logo PNG + SVG

**O que é.** Nav carrega `yolki-logo.png` (12 KB) + `yolki-logo.svg` (9.8 KB), um pra cada tema. Se ambos são visualmente o mesmo desenho (SVG vetorial e PNG raster dele), substituir o PNG por filtro CSS aplicado ao SVG economiza 12 KB.

**Ganho.** −12 KB (1 request inteira).

**Risco visual (needs-verification).** Preciso confirmar se o PNG é literalmente o raster do SVG ou se tem tratamento visual distinto (sombras suaves, anti-alias pixel-perfect, variação de cor). Se for o mesmo desenho, um `<img>` SVG com `filter: invert(1)` em dark theme basta. Mas às vezes o PNG é preferido pela hinting melhor em tamanhos pequenos.

**Verificação.** Abrir os dois lado a lado em Figma/Photoshop em 40px (tamanho real da nav). Se pixel-identical → consolidar. Se diferem → manter como está.

**Onde.** index.html:6449-6450 (outros HTMLs podem ter refs similares).

---

## A2 · WebM/VP9 como fallback primário pro hero-video.mp4

**O que é.** Só temos MP4 (H.264). Oferecer `<source src="hero-video.webm" type="video/webm">` antes do MP4 permite Chrome/Firefox baixarem VP9 (~40% menor para qualidade equivalente).

**Ganho.** De 5.39 MB → ~3.2 MB em browsers modernos (~60% do tráfego mobile).

**Risco visual (none em teoria).** VP9 dá imagem visualmente equivalente se codificado bem. Mas compressão diferente pode introduzir artefatos distintos em cenas de movimento rápido.

**Verificação.** Comparar frame-a-frame em pontos críticos (cortes, close-ups, logo aparecendo). Se nenhum artefato visível → shipe.

**Onde.** index.html:6565-6567.

**Complexidade.** Precisa ffmpeg + re-encode + A/B visual review.

---

## A5 · SVGO em `yolki-logo.svg` e `yolki-mascot.svg`

**O que é.** Rodar `svgo` nos 2 SVGs. Não foi aplicado na Phase 2 porque **não há Node instalado neste ambiente** (requisito pra `npx svgo`).

**Ganho.** Estimado ~1-3 KB total (SVGs já parecem minificados — sem declarações XML, sem comments).

**Risco visual (low).** SVGO com config default pode remover atributos que alguns browsers usam. Geralmente inocente, mas requer visual diff.

**Para aplicar.** `brew install node && npx svgo assets/brand/yolki-logo.svg assets/brand/yolki-mascot.svg --multipass`.

---

## P6 · Recomprimir `pricing-bg.jpg` (2000×1124 → 1200×674)

**O que é.** O JPG tem 2000px de largura, usado como background de seção. Reduzir para 1200px mantém qualidade em retina 1.5× (que cobre a maioria).

**Ganho.** 58 KB → ~25-30 KB.

**Risco visual (low).** Em tela 4K ultra-wide, pode aparecer um pouco menos crisp. Aceitável?

**Verificação.** Comparar em monitor 27" 4K.

**Onde.** `assets/ui/pricing-bg.jpg` referenciado em CSS `.pricing-bg` ou similar.

---

## A6 · Maskable PNG 512×512 dedicado

**O que é.** `manifest.webmanifest` declara `yolki-logo.svg` como `any` e `maskable`. Maskable spec exige safe zone de 80% central — o logo provavelmente não está desenhado com isso em mente. Usuários instalando PWA podem ver logo cortado ou com muita margem.

**Ganho.** Apenas cosmético em PWA installs.

**Risco visual (low).** A versão atual pode já estar aceitável — depende do padding interno do SVG.

**Verificação.** Usar [maskable.app](https://maskable.app) com o SVG atual. Se preview com mask não fica bom → gerar PNG 512×512 específico.

---

## P10 · Deduplicar SVG icons inline (`<symbol>` + `<use>`)

**O que é.** Ícones (check, mail, arrow, WhatsApp) repetidos 10-20× inline. Mover pra um único `<svg><defs><symbol id="ic-check">...</symbol>...</defs></svg>` no topo do body, substituir ocorrências por `<svg><use href="#ic-check"/></svg>`.

**Ganho.** ~5-10 KB HTML bruto (gzip mitiga muito). Deploy cacheado = ganho desprezível.

**Risco visual (needs-verification).** `<use>` de SVG tem algumas quirks em Safari antigo e comportamento diferente com `currentColor` herdado. Sem regressão em browsers modernos (>Safari 15).

**Verificação.** Ícones em browsers reais.

**Prioridade.** Baixa (ganho marginal comprimido).

---

## C5 · Mover inline `onclick` do hamburger para event listener

**O que é.** Linha `<button ... onclick="var m=document.getElementById('ykMenu');...">` mistura inline JS com o resto do código. Inconsistência estilística, não performance.

**Ganho.** 0.

**Risco visual (needs-verification).** Se o listener for registrado após o DOMContentLoaded e o usuário tocar no botão rapidamente, primeiro tap pode ser perdido. Em prática, imperceptível.

**Verificação.** Tap rápido no hamburger em mobile em 3G simulado.

**Prioridade.** Muito baixa.

---

## D2 · Content-Security-Policy via Vercel headers

**O que é.** Nenhum CSP hoje. Adicionar via `vercel.json` com lista permissiva de sources (self + jsdelivr + cdnjs + fonts.googleapis + supabase).

**Ganho.** Segurança (mitiga XSS injetado via DB).

**Risco visual (needs-verification).** CSP estrito pode quebrar inline styles, inline scripts, event handlers. Começar em report-only (`Content-Security-Policy-Report-Only`) por algumas semanas é a forma segura.

**Verificação.** Monitorar relatórios por 1 semana, ajustar sources, depois mover pra enforcing.

---

## D5 · Versionamento automático do Service Worker

**O que é.** `CACHE = 'yolki-v7'` hoje é manual. Qualquer deploy que esqueça de incrementar serve asset stale do cache do SW.

**Ganho.** Confiabilidade de deploy.

**Risco visual (none se bem feito, needs-verification se mal feito).** Pode impactar experiência offline.

**Como.** Pipeline CI injeta SHA do commit em `sw.js`. Como o site não tem pipeline CI além do deploy do Vercel, precisa build step. Alternativa: Vercel Build Command simples (`node -e "..."`).

**Prioridade.** Baixa até o site ter uso recorrente real.

---

## Não-findings (revisitados)

- **Realtime Supabase channel (N4)**: já guarda atrás de `if (!els.length || !window.sbClient) return;`. OK.
- **`console.error/warn`**: só em error handlers reais. OK.
- **Matter.js lazy-load**: já bem feito via IntersectionObserver. Só falta o pause offscreen (P7).
- **`assets/app/preview-*.webp`**: referenciados, não órfãos.
