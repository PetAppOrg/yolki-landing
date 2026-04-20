# Auditoria Site Yolki Pet — 2026-04-20

## Sumário executivo

Stack real ≠ o que o prompt inicial presumia. Site é **HTML estático** deployado em Vercel, sem build system. Não há `package.json`, `tsc`, ESLint, bundler — então ferramentas como `knip`, `depcheck`, `tsc --noEmit`, bundle analysis não aplicam. Fiz tudo por análise estática + grep + leitura do código.

| Frente | Nota 0-10 | Estado após audit |
|---|---:|---|
| 1. Limpeza | 8 | Órfão removido; 960+ linhas CSS/JS duplicadas entre HTMLs (backlog) |
| 2. Correção funcional | 7 | Blog cards fantasma corrigidos; 2 TODOs pendentes; formulários não testados ao vivo |
| 3. Responsividade | 8 | Mobile passou por audit completo; copy idêntica entre bps |
| 4. Acessibilidade | 8 | Alt, labels, hierarquia OK; skip link só em / (backlog) |
| 5. Performance | 7 | Imgs com width/height/lazy; CSS/JS inline por página = sem cache cross-route |
| 6. SEO técnico | 9 | Sitemap, robots, canonicals, OG tags e Schema.org completos |
| 7. Brand | 7 | Tagline "by Coflint" inconsistente; paleta teal no código usa `#00C2B7`, spec menciona `#01BCB5` (pedir confirmação) |

**Média: 7.7 / 10**

## Tabela de issues

| ID | Frente | Sev | Arquivo:linha | Descrição | Correção | Esforço |
|---|---|---|---|---|---|---|
| S01 | SEO | P1 | - | `sitemap.xml` ausente | Criado ✅ | S |
| S02 | SEO | P1 | - | `robots.txt` ausente | Criado ✅ | S |
| S03 | SEO | P1 | index.html + 7 subpages | `<link rel="canonical">` ausente | Adicionado nas 9 rotas (exceto 404 que é noindex) ✅ | S |
| S04 | SEO | P1 | comparacao, cookies, privacidade, lgpd, termos, imprensa | `meta description` ausente | Adicionado ✅ | S |
| S05 | SEO | P2 | comparacao, imprensa, reflexoes | OG tags ausentes | Adicionado ✅ | S |
| S06 | SEO | P1 | 404.html | Sem `noindex,nofollow` | Adicionado ✅ | S |
| L01 | Limpeza | P2 | `assets/brand/yolki-logo-white.png` | Asset órfão | Deletado ✅ | S |
| L02 | Limpeza | P2 | index.html:6588-6618 | 3 blog-cards com `href="#" target="_blank"` conflitante | Redirecionado pra `./reflexoes.html` ✅ | S |
| L03 | Limpeza | P1 | index, comparacao, reflexoes, 404 | ~960 linhas CSS+JS duplicadas (nav, lang-picker, theme toggle) | **Backlog**: extrair `shell.css` + `shell.js` | L |
| L04 | Limpeza | P2 | index.html:8840, 9242 | 2 TODOs (send copy, lang switching) | Mover pra backlog de produto | S |
| F01 | Funcional | P2 | index.html:6185 | Nav logo `href="#"` | Mudar pra `"/"` ou `"./"` | S |
| F02 | Funcional | P2 | index.html:7190-7191, 7339-7341 | Share buttons (WA, Email, IG, TT, LI) com `href="#"` | JS handlers existem, mas hrefs estáticos são fallback quebrado | M |
| A01 | A11y | P2 | comparacao, reflexoes, imprensa, cookies, privacidade, lgpd, termos, 404 | Skip link ausente (só existe em `/`) | Adicionar em subpages (baixa prioridade — páginas curtas) | M |
| A02 | A11y | P2 | subpages | `prefers-reduced-motion` respeitado apenas em index | Subpages têm animação mínima — baixo impacto | S |
| B01 | Brand | P1 | todos os HTMLs | Código usa `#00C2B7`, spec enviada pelo usuário menciona `#01BCB5` | **Ação usuário**: confirmar qual é o oficial | S |
| B02 | Brand | P2 | index.html (footer), reflexoes.html (footer) | Tagline "by Coflint" inconsistente: reflexoes tem, index não | **Ação usuário**: definir padrão e aplicar em todos | S |
| P01 | Perf | P2 | index.html | ~9400 linhas inline (CSS + JS + Schema) num único HTML | No carregamento inicial o HTML é 600KB+ | **Backlog**: extrair shell.css/shell.js | L |

## Métricas antes/depois

| Métrica | Antes | Depois |
|---|---:|---:|
| HTMLs com canonical | 1/9 | 8/9 (+1 404 noindex) |
| HTMLs com meta description | 2/9 | 9/9 |
| HTMLs com OG tags | 1/9 | 4/9 (subpages legais não precisam de OG rico) |
| HTMLs com robots meta | 3/9 | 9/9 |
| `sitemap.xml` | ❌ | ✅ (8 rotas) |
| `robots.txt` | ❌ | ✅ |
| Assets órfãos | 1 | 0 |
| Blog cards com href fantasma | 3 | 0 |
| IDs duplicados entre HTMLs | ~6 (langBtn, navTheme, siteNav...) | 6 (não consertado — subpages separadas, risco só no shell refactor) |
| Lighthouse real | não medido | não medido — precisa browser |

## Achados sem ação (aguardando confirmação do usuário)

### 1. Paleta primary: `#00C2B7` vs `#01BCB5`
Todos os HTMLs usam `#00C2B7`. A spec que você me mandou mencionava `#01BCB5`. Diferença visual de ~1 tonalidade de teal. Se o design system oficial é `#01BCB5`, é um find-and-replace nos 9 HTMLs. **Me confirma qual é o oficial** antes de mexer.

### 2. Tagline "by Coflint"
- `reflexoes.html` tem no footer
- `index.html` não tem (só "© Yolki Pet · Coflint OÜ, Europa")
- Outras subpages: footers simples, sem menção

**Decisão sua**: padronizar com ou sem "by Coflint" em todos os footers.

### 3. Blog cards não lançados
`index.html:6584-6640` tem 3 blog-cards com conteúdo placeholder (autores fictícios "Dr. Carlos Mendes", "Dra. Ana Santos"). Agora apontam pra `/reflexoes` ao invés de `#`. Considerar se deve ser **escondido até ter conteúdo real** — mencionar autores inexistentes pode ser trust issue.

## Diffs aplicados

Tudo na branch `chore/site-audit-2026-04-20`:

1. **63963ac** — `seo(P1): add sitemap.xml, robots.txt, canonical + OG em todas as subpáginas`
2. **cebf859** — `chore(P1/P2): remove asset órfão + fix blog-card hrefs fantasma`

Para merge em `main`:
```
git checkout main && git merge chore/site-audit-2026-04-20 && git push origin main
```

## Backlog (o que ficou pra depois e por quê)

### Alta prioridade (deve virar próxima iteração)
1. **Extrair `shell.css` + `shell.js`** — 960+ linhas duplicadas nav+footer+lang+theme entre 4 HTMLs. Único tradeoff: precisa testar regressão em todas as rotas. Reduz HTML inicial ~6% e permite cache cross-route. **Esforço: L (4-6h)**.
2. **Confirmar paleta `#00C2B7` vs `#01BCB5`** e padronizar. **Esforço: S**.
3. **Decisão sobre blog cards placeholder** (esconder até conteúdo real existir). **Esforço: S**.

### Média prioridade
4. **Lighthouse real em mobile 4G** — preciso que você rode no DevTools ou use PageSpeed Insights em `yolki.pet` depois do deploy. Alvo: Performance ≥90, LCP<2.5s, CLS<0.1.
5. **Axe-core ou Lighthouse a11y** — mesma coisa, precisa browser.
6. **Skip link nas subpages** — páginas curtas, menor impacto. Adicionar quando extrair shell.
7. **Fix `href="#"` de share buttons** (WhatsApp, Email, IG, TT, LI) — já têm JS handler mas href estático é um fallback quebrado. **Esforço: S**.

### Baixa prioridade
8. **Nav logo `href="#"` → `href="/"` ou `href="./"`** (cosmético). 
9. **2 TODOs no JS** (copy do convite e i18n) — decisões de produto.
10. **Skip link + focus-visible consistency em subpages**.

## Regras respeitadas
- ✅ Nenhum secret/env exposto
- ✅ Nenhuma mudança de copy (apenas sinalizações)
- ✅ Nenhuma dependência nova instalada
- ✅ Trabalho em branch dedicada, não em `main`
- ✅ Commits pequenos por frente

## Resumo em 3 linhas
Site tem **base técnica sólida** (Schema.org rico, fontes com preconnect, imgs com lazy+dims). Principais gaps eram **SEO** (sitemap/canonical/description ausentes — **RESOLVIDO**) e **duplicação estrutural** entre HTMLs (backlog). Dois itens aguardam tua decisão: paleta teal (`#00C2B7` vs `#01BCB5`) e tagline "by Coflint".
