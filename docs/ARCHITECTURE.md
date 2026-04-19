# Yolki Landing — Guia de Arquitetura

> Documento técnico que explica **qual stack cada parte usa**, **o que acontece em cada ação do usuário** e **como mexer em cada peça** sem quebrar nada.

Última atualização: 2026-04-17

---

## 1. Visão geral do stack

| Camada | Tecnologia | Onde vive |
|---|---|---|
| **Frontend** | HTML + CSS + JS vanilla (um único `index.html`) | Repositório GitHub `PetAppOrg/yolki-landing` |
| **Página de blog** | Mesma stack — arquivo separado `blog.html` | Mesmo repo |
| **Hosting** | *(ainda a definir — GitHub Pages ou Vercel)* | — |
| **DNS** | Hostinger (domínio `yolki.pet`) | hpanel.hostinger.com |
| **Backend** | Supabase (Postgres + RPCs + Vault + pg_net) | Projeto `yolki-waitlist` em `sa-east-1` |
| **Email marketing** | Loops.so (subdomínio `updates.yolki.pet`) | app.loops.so |
| **Analytics (futuro)** | PostHog (já com MCP configurado) | — |

**Filosofia:** zero build step, zero framework. Edit → commit → deploy.

---

## 2. Arquivos principais

```
yolki-landing/
├── index.html          # Landing principal (tudo inline: HTML, CSS, JS)
├── blog.html           # Página dedicada de conteúdo
├── yolki-logo.svg      # Logo principal
├── yolki-logo-white.png
├── hero-video.mp4      # Vídeo do hero
├── video-cover.jpg
├── pricing-bg.jpg
└── docs/
    └── ARCHITECTURE.md # Este arquivo
```

**Nada de node_modules, webpack, ou framework.** O `index.html` tem ~4.300 linhas com tudo embutido (ver seção 7 de melhorias futuras).

---

## 3. Supabase — estrutura do banco

**Projeto:** `yolki-waitlist` (id `evfzrtgmuhosvbtbihcg`)  
**URL:** `https://evfzrtgmuhosvbtbihcg.supabase.co`  
**Publishable key** (segura em frontend): `sb_publishable_fudNkYqIArYsrgw26UNysw_3njzf_w-`

### Tabela `waitlist`
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID (pk) | Auto-gerado |
| `email` | TEXT UNIQUE | Chave natural |
| `name` | TEXT | Nome completo |
| `city` | TEXT | Opcional |
| `referral_code` | TEXT UNIQUE | Código único gerado no signup (ex: `a7b3c9d1`) |
| `referred_by` | TEXT | Código de quem convidou (se houver) |
| `referrals_count` | INTEGER | Incrementado automaticamente quando alguém se cadastra com seu código |
| `source` | TEXT | `'main'` (form do waitlist) ou `'exit-intent'` (popup) |
| `created_at` | TIMESTAMPTZ | Auto |

**RLS:** habilitado. Anon só pode **inserir via RPC**, não consegue SELECT direto. Todos os reads passam por funções `SECURITY DEFINER`.

### RPCs expostas (`sbClient.rpc('nome', {...})`)

#### `join_waitlist(p_name, p_email, p_city, p_referred_by, p_source)`
- Insert atômico. Se email já existe, retorna os dados dessa entrada.
- Gera `referral_code` único automaticamente.
- Se veio com `p_referred_by`, incrementa `referrals_count` do referrer.
- Retorna: `{ success, position, referral_code, referrals_count, name, source }`

#### `get_waitlist_count()`
- Total de inscritos. Usado no futuro para proof bar do hero (hoje hardcoded em `+247`).

#### `get_waitlist_position(p_email)`
- Consulta posição de quem já se cadastrou (para returning visitor).
- Retorna: `{ found, position, referral_code, referrals_count, name }`

### Como a "posição" é calculada
```
position = (quem entrou antes + 1) - (seus convites × 10)
```
Cada convite sobe o usuário 10 posições. `GREATEST(1, ...)` garante que nunca fica negativo.

### Trigger: `on_waitlist_insert_loops`
Dispara **após** cada INSERT na tabela. Usa `pg_net.http_post` (async) para chamar a API do Loops com o evento correto baseado em `source`:
- `source = 'main'` → evento `waitlist_signup`
- `source = 'exit-intent'` → evento `newsletter_subscribe`

A API key do Loops fica no **Supabase Vault** (criptografada) — nunca no frontend nem nos commits.

---

## 4. Loops.so — email sequences

**Conta:** franz@coflint.com  
**Sending domain:** `updates.yolki.pet` (DKIM, SPF e MX já verificados via DNS no Hostinger)  
**API key:** armazenada no **Supabase Vault** (chave `loops_api_key`)

### Eventos esperados (você precisa criar no dashboard Loops)
| Event name | Quando dispara | Quantos emails |
|---|---|---|
| `waitlist_signup` | User cadastra no form principal | 4 (dia 0, 3, 10, 21) |
| `newsletter_subscribe` | User cadastra via exit-intent | 1 (dia 0 — "5 dicas") |

### Contact fields enviados
- `firstName` (primeiro nome de `name`)
- `lastName` (resto do `name`)
- `email`
- Event properties: `referral_code`, `referred_by`, `city`, `source`

### Como adicionar/editar emails
1. app.loops.so → **Loops** (menu)
2. Selecionar ou criar loop triggered por evento
3. Adicionar/editar emails — suporta template variables tipo `{{firstName}}`, `{{eventProperties.referral_code}}`

### Como rotacionar a API key (se vazar)
1. Loops → Settings → API → revoke old key
2. Create new key
3. Abra o SQL Editor do Supabase, rode:
```sql
UPDATE vault.secrets
  SET secret = 'NOVA_KEY_AQUI'
  WHERE name = 'loops_api_key';
```
Pronto, trigger volta a funcionar.

---

## 5. O que acontece em cada ação do usuário

### Usuário cadastra no waitlist (form principal)
```
1. User preenche form (name, email, city)
2. Frontend lê referredBy de localStorage (se veio via ?r=)
3. JS chama sbClient.rpc('join_waitlist', {..., p_source: 'main'})
4. Supabase insert atômico:
   - cria row com referral_code único
   - se referredBy, incrementa referrals_count do referrer
5. Trigger on_waitlist_insert_loops dispara:
   - busca API key no Vault
   - chama Loops API com eventName='waitlist_signup'
6. Loops automaticamente:
   - cria/atualiza contato
   - dispara sequência de 4 emails
7. Frontend mostra success state com posição + link de referral
```

### Usuário compartilha link `yolki.pet/?r=abc123`
```
1. Outro user clica no link
2. Landing carrega, JS lê ?r= e salva em localStorage
3. Se esse user submete o form, referredBy é enviado
4. Supabase incrementa referrals_count do referrer original
5. Referrer não é notificado (poderia ser um enhancement futuro via Loops event)
```

### Usuário tenta sair (exit-intent)
```
1. User scrolla >300px (arma o listener)
2. Mouse cruza topo da janela
3. Modal aparece: "Espera aí, receba 5 dicas"
4. Cookie yolki_exit_intent=1 por 7 dias (não mostra de novo)
5. Se email, chama join_waitlist com p_source='exit-intent'
6. Trigger manda evento newsletter_subscribe pro Loops
7. Loops envia 1 email (sequência diferente do waitlist)
```

### Returning visitor (já cadastrou)
```
1. Page load mostra o form normalmente (sem persistência local)
2. Se a pessoa reenviar, a RPC join_waitlist dedupa por email no servidor
   e devolve a posição/referral_code atualizados
3. Ranking e contagem de indicações vivem só no Supabase
```

---

## 6. Como mexer em cada parte

### Mudar headline/CTA/preço na landing
1. `index.html` — use Cmd+F pra achar o texto
2. Edit no GitHub ou local
3. Commit + push → site atualiza (dependendo do hosting)

### Adicionar nova seção
1. CSS: adicione antes do `@media (max-width: 768px)` no `<style>`
2. HTML: adicione a `<section>` onde fizer sentido (a ordem visual é a ordem no HTML)
3. Atualize o `nav-center-menu` se quiser atalho

### Mudar os emails do Loops
**Não precisa deploy.** Só mexe no dashboard do Loops. Mudanças são imediatas.

### Mexer em quantas posições um convite sobe
Atualmente `10`. Mude no RPC `join_waitlist`, linha:
```sql
position_value := GREATEST(1, (earlier_count + 1) - (new_row.referrals_count * 10));
```
E também no frontend (texto da success state): "você sobe 10 posições".

### Ocultar/mostrar o blog no home
- Ocultar: `<section class="section-blog" id="conteudo" style="display:none;">`
- Mostrar: remova o `style` e o nav link apontará pra `#conteudo` em vez de `blog.html`

---

## 7. Limitações atuais + melhorias futuras

### Débitos técnicos conhecidos
- **Todo inline no `index.html`** — sem build step, CSS+JS vive junto com HTML. Em algum ponto vai querer separar.
- **Imagens em base64** embutidas. Pesam no payload. Melhor migrar pra arquivos reais com lazy load.
- **Nenhum analytics** — você ainda não sabe quanta gente clica em quê.
- **Contador de waitlist hardcoded** ("+247 tutores") — quando tiver 50+ inscritos reais, trocar por chamada pra `get_waitlist_count()`.
- **`display:none` em seções "removidas"** (blog no home, benefícios antigos) — não quebra nada mas polui o DOM. Deletar quando certeza.

### Próximos Sprints (do plano UX)
- Sprint 5: analytics (PostHog) + A/B tests + performance (Lighthouse)
- Item 19 do Sprint 4: criar eventos + loops no dashboard do Loops (infra tá pronta, só falta conteúdo)

---

## 8. Contatos e acessos

| Serviço | Login | Onde | Observação |
|---|---|---|---|
| GitHub | — | `github.com/PetAppOrg/yolki-landing` | Push direto pra main |
| Supabase | franz@coflint.com | app.supabase.com → org "Coflint Org" → project `yolki-waitlist` | Credenciais em `sa-east-1` |
| Loops.so | franz@coflint.com | app.loops.so | Sending domain `updates.yolki.pet` |
| Hostinger | — | hpanel.hostinger.com | DNS de `yolki.pet` |
| Email de contato | hello@yolki.pet | — | Alias pro seu email principal |

---

## 9. Emergências comuns

### "Os emails não estão chegando"
1. Ver no Supabase se a row entrou: `SELECT * FROM waitlist ORDER BY created_at DESC LIMIT 5`
2. Ver se o trigger rodou: `SELECT * FROM net._http_response ORDER BY created DESC LIMIT 5`
   - `status_code = 200` → Loops recebeu, problema é no Loops (ver dashboard)
   - `status_code = 401` → API key inválida/revogada (regenerar e atualizar Vault)
   - `error_msg != NULL` → rede ou sintaxe do body errada
3. Ver no Loops dashboard → Events → se o evento chegou
4. Ver no Loops → Loops → se a sequência está "Published" (não Draft)

### "A landing não está atualizando depois do deploy"
- Check cache do CDN/browser (Cmd+Shift+R)
- Confirmar que push foi aceito (`git log origin/main`)

### "Status de cadastro aparece errado para um usuário"
A landing não guarda mais nada no localStorage sobre a waitlist — a posição vem direto da RPC `join_waitlist` a cada submit. Se o número estiver errado, a verdade está no banco:
```sql
SELECT * FROM waitlist WHERE email = 'email@exemplo.com';
```
Se a pessoa tiver um código de referral preso no navegador (`yolki_ref`, setado via `?r=CODIGO`), limpe em DevTools → Application → Local Storage.

---

## 10. Glossário rápido

- **RPC**: Remote Procedure Call — funções do Postgres chamáveis via HTTP
- **RLS**: Row Level Security — Postgres decide quais rows o requester pode ver/alterar
- **SECURITY DEFINER**: função roda com permissões do dono (bypassa RLS controladamente)
- **pg_net**: extensão do Postgres pra HTTP calls (async) direto do banco
- **Vault**: tabela especial do Supabase pra guardar secrets criptografados
- **DKIM/SPF/DMARC**: registros DNS que comprovam que o email veio mesmo do seu domínio (evitam spam)
