#!/usr/bin/env node
// Gera versões em inglês dos HTMLs do site em /en/.
// Fonte da verdade: PT-BR nos HTMLs da raiz.
// Uso: npm run translate [--dry] [--force]
//   --dry: só lista strings a traduzir, não chama Claude nem escreve arquivos
//   --force: ignora cache, re-traduz tudo

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const EN_DIR = resolve(ROOT, "en");
const CACHE_PATH = resolve(ROOT, ".translations-cache.json");

const PAGES = [
  "index.html",
  "comparacao.html",
  "cookies.html",
  "imprensa.html",
  "lgpd.html",
  "privacidade.html",
  "reflexoes.html",
  "termos.html",
  "404.html",
];

const TRANSLATABLE_ATTRS = ["alt", "title", "aria-label", "placeholder"];
const TRANSLATABLE_META = new Set([
  "description",
  "og:title",
  "og:description",
  "og:site_name",
  "twitter:title",
  "twitter:description",
  "apple-mobile-web-app-title",
]);

const SKIP_TEXT_PARENTS = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "code",
  "pre",
]);

const argv = process.argv.slice(2);
const args = new Set(argv);
const DRY = args.has("--dry");
const FORCE = args.has("--force");
const LIMIT = (() => {
  const i = argv.indexOf("--limit");
  return i >= 0 ? parseInt(argv[i + 1], 10) : null;
})();

const sha1 = (s) => createHash("sha1").update(s).digest("hex").slice(0, 12);

const isMeaningful = (s) => {
  const t = s.trim();
  if (!t) return false;
  // só símbolos / pontuação / números
  if (!/[\p{L}]/u.test(t)) return false;
  // emoji só
  if (/^[\p{Emoji_Presentation}\s]+$/u.test(t)) return false;
  return true;
};

async function loadCache() {
  if (!existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(await readFile(CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

async function saveCache(cache) {
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n", "utf8");
}

// Percorre o DOM cheerio e devolve lista de "slots" a traduzir.
// Cada slot tem: { kind, get(), set(value), text }
function collectSlots($) {
  const slots = [];

  // <title>
  $("title").each((_, el) => {
    const text = $(el).text();
    if (isMeaningful(text)) {
      slots.push({
        kind: "title",
        text,
        set: (v) => $(el).text(v),
      });
    }
  });

  // <meta name|property="...">
  $("meta").each((_, el) => {
    const $el = $(el);
    const key = $el.attr("name") || $el.attr("property");
    if (!key || !TRANSLATABLE_META.has(key)) return;
    const content = $el.attr("content");
    if (content && isMeaningful(content)) {
      slots.push({
        kind: `meta[${key}]`,
        text: content,
        set: (v) => $el.attr("content", v),
      });
    }
  });

  // atributos traduzíveis em qualquer elemento
  $("*").each((_, el) => {
    if (el.type !== "tag") return;
    const $el = $(el);
    for (const attr of TRANSLATABLE_ATTRS) {
      const val = $el.attr(attr);
      if (val && isMeaningful(val)) {
        slots.push({
          kind: `attr[${attr}]`,
          text: val,
          set: (v) => $el.attr(attr, v),
        });
      }
    }
  });

  // text nodes
  const walk = (node) => {
    if (!node) return;
    if (node.type === "text") {
      const raw = node.data;
      if (!raw) return;
      // preserva whitespace original: traduz só o miolo
      const m = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
      if (!m) return;
      const [, leading, middle, trailing] = m;
      if (!isMeaningful(middle)) return;
      slots.push({
        kind: "text",
        text: middle,
        set: (v) => {
          node.data = leading + v + trailing;
        },
      });
      return;
    }
    if (node.type === "tag") {
      if (SKIP_TEXT_PARENTS.has(node.name)) {
        // exceção: JSON-LD tem strings traduzíveis
        if (node.name === "script" && node.attribs?.type === "application/ld+json") {
          // deixa pra fase JSON-LD (abaixo)
        }
        return;
      }
      if (node.children) {
        for (const child of node.children) walk(child);
      }
    }
  };
  $.root().each((_, root) => {
    if (root.children) for (const c of root.children) walk(c);
  });

  // JSON-LD
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    // coleta strings traduzíveis por caminho, aplica ao final
    const JSONLD_KEYS = new Set(["name", "description", "headline", "alternativeHeadline"]);
    const stringSlots = [];
    const visit = (obj, path = []) => {
      if (Array.isArray(obj)) {
        obj.forEach((v, i) => visit(v, [...path, i]));
      } else if (obj && typeof obj === "object") {
        for (const [k, v] of Object.entries(obj)) {
          if (JSONLD_KEYS.has(k) && typeof v === "string" && isMeaningful(v)) {
            stringSlots.push({ path: [...path, k], text: v });
          } else {
            visit(v, [...path, k]);
          }
        }
      }
    };
    visit(parsed);
    for (const s of stringSlots) {
      slots.push({
        kind: `jsonld[${s.path.join(".")}]`,
        text: s.text,
        set: (v) => {
          let ref = parsed;
          for (let i = 0; i < s.path.length - 1; i++) ref = ref[s.path[i]];
          ref[s.path[s.path.length - 1]] = v;
          $(el).text(JSON.stringify(parsed, null, 2));
        },
      });
    }
  });

  return slots;
}

async function main() {
  const cache = await loadCache();
  console.log(`[translate] dry=${DRY} force=${FORCE}`);
  console.log(`[translate] cache tem ${Object.keys(cache).length} entradas`);

  const perFile = [];
  let totalSlots = 0;
  const uniquePt = new Map(); // hash -> text

  for (const page of PAGES) {
    const path = resolve(ROOT, page);
    if (!existsSync(path)) {
      console.log(`[skip] ${page} não existe`);
      continue;
    }
    const html = await readFile(path, "utf8");
    const $ = cheerio.load(html, { decodeEntities: false });
    const slots = collectSlots($);
    perFile.push({ page, $, slots });
    totalSlots += slots.length;
    for (const s of slots) {
      const h = sha1(s.text);
      if (!uniquePt.has(h)) uniquePt.set(h, s.text);
    }
  }

  console.log(`[translate] ${totalSlots} slots no total, ${uniquePt.size} strings únicas`);

  const toTranslate = [];
  for (const [h, text] of uniquePt) {
    if (!FORCE && cache[h]) continue;
    toTranslate.push({ hash: h, text });
  }
  console.log(`[translate] ${toTranslate.length} strings novas/alteradas a traduzir`);

  if (DRY) {
    for (const { text } of toTranslate.slice(0, 20)) {
      console.log(`  - ${text.slice(0, 100)}`);
    }
    if (toTranslate.length > 20) console.log(`  ... +${toTranslate.length - 20}`);
    return;
  }

  // traduz em batches
  const BATCH_SIZE = 25;
  const effective = LIMIT ? toTranslate.slice(0, LIMIT * BATCH_SIZE) : toTranslate;
  if (LIMIT) console.log(`[translate] limit=${LIMIT} batches (${effective.length} strings)`);
  for (let i = 0; i < effective.length; i += BATCH_SIZE) {
    const batch = effective.slice(i, i + BATCH_SIZE);
    const idx = Math.floor(i / BATCH_SIZE) + 1;
    const total = Math.ceil(effective.length / BATCH_SIZE);
    console.log(`[translate] batch ${idx}/${total} (${batch.length} strings)...`);
    const result = await translateBatch(batch);
    for (const { hash } of batch) {
      if (result[hash]) cache[hash] = result[hash];
      else console.warn(`  [warn] sem tradução pro hash ${hash}`);
    }
    // salva a cada batch pra não perder progresso
    await saveCache(cache);
  }

  console.log(`[translate] cache agora tem ${Object.keys(cache).length} entradas`);

  // aplica traduções e escreve /en/*.html
  await mkdir(EN_DIR, { recursive: true });
  for (const { page, $, slots } of perFile) {
    let missing = 0;
    for (const slot of slots) {
      const h = sha1(slot.text);
      const en = cache[h];
      if (!en) {
        missing++;
        continue;
      }
      slot.set(en);
    }
    applyEnglishPageTweaks($, page);
    const out = resolve(EN_DIR, page);
    await writeFile(out, $.html(), "utf8");
    console.log(`[en] ${page} escrito (${slots.length} slots, ${missing} sem tradução)`);
  }

  // sincroniza hreflang nos HTMLs PT (idempotente)
  for (const page of PAGES) {
    const p = resolve(ROOT, page);
    if (!existsSync(p)) continue;
    const html = await readFile(p, "utf8");
    const $pt = cheerio.load(html, { decodeEntities: false });
    syncHreflangPt($pt, page);
    await writeFile(p, $pt.html(), "utf8");
  }
  console.log(`[pt] hreflang sincronizado em ${PAGES.length} arquivos`);
}

function hreflangPaths(page) {
  const pageNoExt = page.replace(/\.html$/, "");
  const isIndex = page === "index.html";
  return {
    pt: isIndex ? "/" : `/${pageNoExt}`,
    en: isIndex ? "/en/" : `/en/${pageNoExt}`,
  };
}

function syncHreflangPt($, page) {
  const { pt, en } = hreflangPaths(page);
  const BASE = "https://yolki.pet";
  $('link[rel="alternate"][hreflang]').remove();
  $("head").append(
    `\n<link rel="alternate" hreflang="pt-BR" href="${BASE}${pt}">` +
      `\n<link rel="alternate" hreflang="en" href="${BASE}${en}">` +
      `\n<link rel="alternate" hreflang="x-default" href="${BASE}${pt}">`,
  );
}

// Ajustes estruturais: lang, canonical, hreflang, JSON-LD inLanguage.
function applyEnglishPageTweaks($, page) {
  const pageNoExt = page.replace(/\.html$/, "");
  const isIndex = page === "index.html";
  const ptPath = isIndex ? "/" : `/${pageNoExt}`;
  const enPath = isIndex ? "/en/" : `/en/${pageNoExt}`;
  const BASE = "https://yolki.pet";

  $("html").attr("lang", "en");

  // canonical aponta pra versão EN
  const canonical = $('link[rel="canonical"]');
  if (canonical.length) canonical.attr("href", `${BASE}${enPath}`);

  // remove hreflang antigos, recria
  $('link[rel="alternate"][hreflang]').remove();
  const head = $("head");
  head.append(
    `\n<link rel="alternate" hreflang="pt-BR" href="${BASE}${ptPath}">` +
      `\n<link rel="alternate" hreflang="en" href="${BASE}${enPath}">` +
      `\n<link rel="alternate" hreflang="x-default" href="${BASE}${ptPath}">`,
  );

  // Links internos: re-prefixa href absolutos (/pagina.html) pra /en/...
  const PREFIX_EXEMPT = /^\/(assets\/|manifest\.webmanifest|sw\.js|robots\.txt|sitemap\.xml|favicon|api\/)/;
  $("a[href]").each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href");
    if (!href || !href.startsWith("/")) return;
    if (PREFIX_EXEMPT.test(href)) return;
    $el.attr("href", href === "/" ? "/en/" : "/en" + href);
  });

  // Seletor de idioma: marca EN ativo, desmarca PT, troca label #langCurrent
  $('.lang-menu button[data-lang]').each((_, el) => {
    const $el = $(el);
    const lang = $el.attr("data-lang");
    if (lang === "en") $el.addClass("active");
    else $el.removeClass("active");
  });
  $(".js-lang-current").text("EN");

  // JSON-LD: inLanguage e @id com /en/
  $('script[type="application/ld+json"]').each((_, el) => {
    let parsed;
    try {
      parsed = JSON.parse($(el).text());
    } catch {
      return;
    }
    const fixInLanguage = (obj) => {
      if (Array.isArray(obj)) obj.forEach(fixInLanguage);
      else if (obj && typeof obj === "object") {
        if (obj.inLanguage === "pt-BR") obj.inLanguage = "en";
        for (const v of Object.values(obj)) fixInLanguage(v);
      }
    };
    fixInLanguage(parsed);
    $(el).text(JSON.stringify(parsed, null, 2));
  });
}

async function translateBatch(batch) {
  const input = Object.fromEntries(batch.map((b) => [b.hash, b.text]));
  const prompt = `Translate the Brazilian Portuguese (pt-BR) strings below into American English (en-US) for the Yolki Pet landing page — a pet health and longevity app.

Rules:
- Keep "Yolki" and "Yolki Pet" as-is (brand names).
- Preserve numbers, currencies, emojis, punctuation, and HTML entities exactly.
- Tone: friendly, warm, clear, professional. Concise. UI labels stay short.
- Return a JSON object mapping each input key (hash) to the translated string.

Input:
${JSON.stringify(input, null, 2)}`;

  const schema = {
    type: "object",
    properties: Object.fromEntries(batch.map((b) => [b.hash, { type: "string" }])),
    required: batch.map((b) => b.hash),
    additionalProperties: false,
  };

  return await runClaude(prompt, schema);
}

function runClaude(prompt, schema) {
  return new Promise((resolveP, rejectP) => {
    const args = ["-p", "--model", "haiku", "--output-format", "json"];
    if (schema) args.push("--json-schema", JSON.stringify(schema));
    const child = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", rejectP);
    child.on("close", (code) => {
      if (code !== 0) {
        rejectP(new Error(`claude exit ${code}: ${stderr}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        if (parsed.is_error) {
          rejectP(new Error(`claude error: ${parsed.result || parsed.api_error_status}`));
          return;
        }
        if (schema) {
          if (!parsed.structured_output) {
            rejectP(new Error(`claude sem structured_output. result=${parsed.result}`));
            return;
          }
          resolveP(parsed.structured_output);
        } else {
          resolveP(parsed.result);
        }
      } catch (err) {
        rejectP(new Error(`parse falhou: ${err.message}\n${stdout.slice(0, 500)}`));
      }
    });
    child.stdin.end(prompt);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
