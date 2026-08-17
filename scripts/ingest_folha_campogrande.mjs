// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_campogrande.mjs — Campo Grande/MS (28.046 vínculos na RAIS), o maior alvo isolado de MT+MS.
//
// PORTAL: `sig-transparencia.campogrande.ms.gov.br/servidores/consulta` — Laravel, POST com `_token` (CSRF).
// ⭐ O form tem um hidden `download` e **`download=csv` devolve o dump inteiro** (7,3 MB, 40.131 registros):
//    rn;situacao;matricula;vinculo;nomefun;cpf;codigo_cargo;tipo_nome_cargo;tipo_nome_funcao;tipo_admissao;
//    mes_ano;nome_secretaria;datadmissao;desligamento;horassem_cargo;horassem_funcao
//    ⚠️ `download=1|true|excel|pdf` devolvem HTML — só o literal `csv` funciona.
//
// ⚠️ O QUE ESTE COLETOR TRAZ: município · secretaria · cargo · vínculo · carga horária · admissão — **sem valor**.
//    A remuneração existe, mas só na tela "Detalhar" de cada servidor
//    (`/servidores/detalhe/{ano}/{mes}/{matricula}/{vinculo}/{codCargo}/{SECRETARIA}/{cpf}`), e o CSV traz o
//    **CPF mascarado** — o CPF inteiro só aparece no link dentro da lista HTML (15 por página, ~2.700 páginas).
//    Por isso o valor é uma SEGUNDA passada (VALOR=1), cara e retomável, não parte desta.
//
// 🚨 COMPETÊNCIA: 2026 está VAZIO no portal — a mais recente com dados é 12/2025. O coletor procura a mais
//    cheia para trás ([[pnigp-competencia-mais-cheia-nao-a-recente]]), em vez de fixar o mês corrente.
// 🚨 O host tem certificado que o Node recusa: "fetch failed" genérico não é site fora do ar.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool(); const q = withRetry(db);
const COD = "5002704", MUN = "Campo Grande", UF = "MS";
const URL = "https://sig-transparencia.campogrande.ms.gov.br/servidores/consulta";

await q(`create table if not exists folha_servidores_campogrande (
  cod_ibge text, municipio text, uf text, competencia text,
  nome text, cpf_masc text, matricula text, vinculo_num text, codigo_cargo text,
  cargo text, funcao text, secretaria text, tipo_admissao text, situacao text,
  data_admissao text, desligamento text, horas_semanais text,
  bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_cg_mun on folha_servidores_campogrande (cod_ibge)`);
await q(`create table if not exists folha_campogrande_coleta (
  competencia text primary key, linhas int, com_valor int, situacao text, detalhe text, em timestamptz default now()
)`);

const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, locale: "pt-BR",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(5000);

// ⭐ competência mais CHEIA: varre para trás e fica com a maior — não com a primeira que responder
const baixa = (ano, mes) => page.evaluate(async ({ ano, mes }) => {
  const token = document.querySelector("input[name=_token]").value;
  const fd = new URLSearchParams({ _token: token, page: "1", download: "csv", situacao: "", competencia: mes,
    ano, matricula: "", cpf: "", nome: "", nome_secretaria: "", tipo_nome_cargo: "", tipo_nome_funcao: "" });
  const r = await fetch(location.pathname, { method: "POST", body: fd, headers: { "content-type": "application/x-www-form-urlencoded" } });
  const ct = r.headers.get("content-type") || "";
  const t = await r.text();
  return /csv/i.test(ct) ? t : "";
}, { ano, mes });

const hoje = new Date();
let melhor = null, testados = 0;
for (let k = 1; k <= 24 && testados < 3; k++) {
  const d = new Date(hoje); d.setDate(1); d.setMonth(hoje.getMonth() - k);
  const ano = String(d.getFullYear()), mes = String(d.getMonth() + 1).padStart(2, "0");
  const csv = await baixa(ano, mes);
  const n = csv ? csv.split(/\r?\n/).length - 1 : 0;
  if (n > 10) { testados++; if (!melhor || n > melhor.n) melhor = { csv, n, comp: `${mes}/${ano}`, ano, mes }; }
}
await browser.close();
if (!melhor) { console.log("[campogrande] nenhuma competência com dados"); await db.end(); process.exit(1); }
console.log(`[campogrande] competência mais cheia: ${melhor.comp} · ${melhor.n.toLocaleString("pt-BR")} registros`);

// ── parse do CSV (separador ';', campos entre aspas podem conter ';') ──────────────────────────────────────
const linhas = melhor.csv.split(/\r?\n/).filter((l) => l.trim());
const cab = linhas[0].split(";").map((c) => c.trim());
const campo = (c, nome) => { const i = cab.indexOf(nome); return i >= 0 ? (c[i] ?? "").replace(/^"|"$/g, "").trim() || null : null; };
const parse = (linha) => {
  const out = []; let cur = "", aspas = false;
  for (const ch of linha) {
    if (ch === '"') { aspas = !aspas; continue; }
    if (ch === ";" && !aspas) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur); return out;
};

const regs = [];
for (const l of linhas.slice(1)) {
  const c = parse(l);
  if (c.length < 8) continue;
  const mat = campo(c, "matricula"), vinc = campo(c, "vinculo");
  regs.push({
    cod_ibge: COD, municipio: MUN, uf: UF, competencia: `${melhor.mes}-${melhor.ano}`,
    nome: campo(c, "nomefun"), cpf_masc: campo(c, "cpf"), matricula: mat, vinculo_num: vinc,
    codigo_cargo: campo(c, "codigo_cargo"), cargo: campo(c, "tipo_nome_cargo"), funcao: campo(c, "tipo_nome_funcao"),
    secretaria: campo(c, "nome_secretaria"), tipo_admissao: campo(c, "tipo_admissao"), situacao: campo(c, "situacao"),
    data_admissao: campo(c, "datadmissao"), desligamento: campo(c, "desligamento"),
    horas_semanais: campo(c, "horassem_cargo"),
    bruto: null, descontos: null, liquido: null,
    _hash: crypto.createHash("md5").update([COD, melhor.comp, mat, vinc, campo(c, "codigo_cargo")].join("|")).digest("hex"),
  });
}
const uniq = [...new Map(regs.map((r) => [r._hash, r])).values()];
console.log(`[campogrande] ${uniq.length.toLocaleString("pt-BR")} registros únicos`);

const LOTE = 700;
for (let i = 0; i < uniq.length; i += LOTE) {
  const p = uniq.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
  await q(`insert into folha_servidores_campogrande
    (cod_ibge,municipio,uf,competencia,nome,cpf_masc,matricula,vinculo_num,codigo_cargo,cargo,funcao,secretaria,
     tipo_admissao,situacao,data_admissao,desligamento,horas_semanais,bruto,descontos,liquido,_hash)
    select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
      $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[],$16::text[],$17::text[],
      $18::numeric[],$19::numeric[],$20::numeric[],$21::text[])
    on conflict (_hash) do update set secretaria=excluded.secretaria, cargo=excluded.cargo, _coletado_em=now()`,
    [c("cod_ibge"), c("municipio"), c("uf"), c("competencia"), c("nome"), c("cpf_masc"), c("matricula"),
     c("vinculo_num"), c("codigo_cargo"), c("cargo"), c("funcao"), c("secretaria"), c("tipo_admissao"),
     c("situacao"), c("data_admissao"), c("desligamento"), c("horas_semanais"),
     c("bruto"), c("descontos"), c("liquido"), c("_hash")]);
}
await q(`insert into folha_campogrande_coleta (competencia, linhas, com_valor, situacao, detalhe, em)
  values ($1,$2,0,'ok','CSV da lista (sem valor: exige 2ª passada ficha a ficha)',now())
  on conflict (competencia) do update set linhas=excluded.linhas, situacao='ok', em=now()`, [melhor.comp, uniq.length]);

console.table((await q(`select competencia, situacao, count(*) n from folha_servidores_campogrande group by 1,2 order by 3 desc`)).rows);
console.table((await q(`select secretaria, count(*) n from folha_servidores_campogrande
  where situacao='ATIVO' group by 1 order by 2 desc limit 8`)).rows);
await db.end();
