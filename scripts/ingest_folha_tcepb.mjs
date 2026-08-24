// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_tcepb.mjs — folha NOMINAL dos 223 municípios da PARAÍBA, direto dos dados abertos do TCE-PB.
//
// ⭐ O TCE-PB publica os servidores em ZIP/CSV aberto, sem captcha e sem sessão:
//    por município : https://download.tce.pb.gov.br/dados-abertos/dados-por-municipio/{codTCE}/servidores/servidores-{ano}.zip
//    consolidado   : https://download.tce.pb.gov.br/dados-abertos/dados-consolidados/servidores/servidores-{ano}.zip  (~93 MB)
//    O `codTCE` é 1..223, numeração PRÓPRIA do tribunal (não é IBGE). A lista nome↔código sai do bundle do SPA
//    `dados-abertos.tce.pb.gov.br/assets/index-*.js` — fonte, não chute.
//    ⛔ `sagrescidadao.tce.pb.gov.br` está atrás de CAPTCHA (Cloudflare Turnstile). Este caminho dispensa isso.
//
// CSV `;`: nome_municipio · codigo_unidade_gestora · descricao_unidade_gestora · cpf_cnpj · nome_servidor ·
//          tipo_cargo · descricao_cargo · valor_vantagem · data_admissao · matricula · ano_mes
//
// 🚨 O CSV é UTF-8 COM BOM. Lê-lo como latin-1 gravou 94 mil linhas de mojibake ("CÃ¢mara ... Ãgua Branca") —
//    consertado depois por `corrige_encoding_tcepb.mjs`. Ler como UTF-8 e só remover o BOM.
// ⚠️ Traz TODAS as unidades gestoras: prefeitura, câmara, fundos, institutos e autarquias. São entidades
//    distintas do mesmo município (não espelhos), então somam — mas `unidade_gestora` fica gravada para quem
//    precisar separar o executivo. Ver [[pnigp-entidade-espelho-infla-folha]].
// ⚠️ `valor_vantagem` é a vantagem paga no mês, não o vencimento contratual.
//
// Uso: ANO=2026 node scripts/ingest_folha_tcepb.mjs   ·   SO=Sousa para um município   ·   REFAZ=1 reprocessa
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import fs from "fs"; import os from "os"; import path from "path"; import crypto from "crypto";
import { extrai } from "./descompacta.mjs";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };
const ANO = process.env.ANO || String(new Date().getFullYear());
const SO = process.env.SO || null;
const REFAZ = process.env.REFAZ === "1";
const BASE = "https://download.tce.pb.gov.br/dados-abertos";

await q(`create table if not exists folha_servidores_tcepb (
  cod_ibge text, municipio text, uf text default 'PB', competencia text,
  unidade_gestora text, codigo_unidade text, secretaria text,
  nome text, cpf_masc text, matricula text, cargo text, vinculo text, data_admissao text, bruto numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_tcepb_mun on folha_servidores_tcepb (cod_ibge, competencia)`);
// ⚠️ a PK é só `cod_tce` (uma linha por município, o ano é atributo) — não (cod_tce, ano).
await q(`create table if not exists folha_tcepb_coleta (
  cod_tce text primary key, cod_ibge text, municipio text, ano text, competencia text, linhas int,
  situacao text, detalhe text, em timestamptz default now()
)`);

// ── nome do CSV → cod_ibge. `municipios_br` traz 37 nomes com sufixo de UF e nomes REVOGADOS pelo IBGE
//    ([[pnigp-municipios-br-nomes-revogados]]) — normalizar dos dois lados e mapear os apelidos.
const chave = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toUpperCase().replace(/\s+[A-Z]{2}$/, "").replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
const APELIDOS = { "2513653": ["JOCA CLAUDINO"], "2516409": ["TACIMA"] };
const porNome = new Map();
for (const m of (await q(`select cod_ibge, nome from municipios_br where uf='PB'`)).rows) {
  porNome.set(chave(m.nome), m.cod_ibge);
  for (const a of APELIDOS[m.cod_ibge] || []) porNome.set(chave(a), m.cod_ibge);
}

const money = (s) => {
  const t = String(s ?? "").trim(); if (!t) return null;
  const n = +t.replace(/\./g, "").replace(",", ".");
  return Number.isFinite(n) ? n : null;
};
const txt = (s) => { const v = String(s ?? "").trim().replace(/^"+|"+$/g, "").trim(); return v && v !== "-" ? v : null; };

// 🚨 `split(";")` ignora as aspas do CSV. Em Passagem o cargo vem como
//    `"00001125 - PSICOLOGO - CONTRATADO (A); ..."` — com `;` DENTRO do campo — e todas as colunas seguintes
//    deslocam: a matrícula caiu na competência (`000000000060439`) e o valor virou null. Foram só 2 linhas em
//    1,5 milhão, mas o defeito é do parser, não do dado.
function campos(linha) {
  const out = []; let cur = ""; let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') { if (aspas && linha[i + 1] === '"') { cur += '"'; i++; } else aspas = !aspas; continue; }
    if (c === ";" && !aspas) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

// a lista oficial nome↔código vive no bundle do SPA de dados abertos
async function listaMunicipios() {
  const home = await (await fetch("https://dados-abertos.tce.pb.gov.br/", { headers: UA, signal: AbortSignal.timeout(40000) })).text();
  const js = (home.match(/src="([^"]+\.js)"/) || [])[1];
  if (!js) throw new Error("bundle do SPA não encontrado — o portal mudou");
  const src = await (await fetch("https://dados-abertos.tce.pb.gov.br" + js, { headers: UA, signal: AbortSignal.timeout(90000) })).text();
  const arr = [...src.matchAll(/\{"codigoMunicipio":"(\d+)","nomeMunicipio":"([^"]+)"\}/g)]
    .map((m) => ({ cod_tce: m[1], nome: m[2] }));
  if (!arr.length) throw new Error("lista de municípios não encontrada no bundle");
  return [...new Map(arr.map((a) => [a.cod_tce, a])).values()];
}

const LOTE = 2000;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_tcepb
      (cod_ibge,municipio,uf,competencia,unidade_gestora,codigo_unidade,secretaria,nome,cpf_masc,matricula,cargo,vinculo,data_admissao,bruto,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::numeric[],$15::text[])
      on conflict (_hash) do update set bruto=excluded.bruto, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("competencia"), c("unidade_gestora"), c("codigo_unidade"),
       c("secretaria"), c("nome"), c("cpf_masc"), c("matricula"), c("cargo"), c("vinculo"), c("data_admissao"),
       c("bruto"), c("_hash")]);
  }
}

const municipios = (await listaMunicipios()).filter((m) => !SO || chave(m.nome).includes(chave(SO)));
const feitos = REFAZ ? new Set()
  : new Set((await q(`select cod_tce from folha_tcepb_coleta where ano = $1 and situacao = 'ok'`, [ANO])).rows.map((r) => r.cod_tce));
const fila = municipios.filter((m) => !feitos.has(m.cod_tce));
console.log(`[tce-pb] ano ${ANO} · ${municipios.length} municípios · ${fila.length} na fila`);

let totalGeral = 0, ok = 0, vazios = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const cod_ibge = porNome.get(chave(a.nome)) || null;
  const marca = (situacao, detalhe, linhas = 0, comp = null) =>
    q(`insert into folha_tcepb_coleta (cod_tce,cod_ibge,municipio,ano,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_tce) do update set
       cod_ibge=excluded.cod_ibge, ano=excluded.ano, competencia=excluded.competencia, linhas=excluded.linhas,
       situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_tce, cod_ibge, a.nome, ANO, comp, linhas, situacao, detalhe]);
  if (!cod_ibge) { await marca("sem_ibge", "nome do CSV não casou com municipios_br"); falhas++;
    console.log(`  ⚠️ ${a.nome}: sem cod_ibge`); continue; }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tcepb-"));
  try {
    const url = `${BASE}/dados-por-municipio/${a.cod_tce}/servidores/servidores-${ANO}.zip`;
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(180000) });
    if (!r.ok) { await marca("sem_arquivo", `HTTP ${r.status}`); vazios++; continue; }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.slice(0, 2).toString() !== "PK") { await marca("sem_arquivo", "resposta não é ZIP"); vazios++; continue; }
    fs.writeFileSync(path.join(tmp, "s.zip"), buf);
    extrai(path.join(tmp, "s.zip"), tmp);
    const csv = fs.readdirSync(tmp).find((f) => /\.csv$/i.test(f));
    if (!csv) { await marca("sem_arquivo", "ZIP sem CSV"); vazios++; continue; }

    // 🚨 UTF-8 com BOM — ler como latin-1 aqui foi o que produziu 94 mil linhas de mojibake
    const raw = fs.readFileSync(path.join(tmp, csv)).toString("utf8").replace(/^﻿/, "");
    const linhas = raw.split(/\r?\n/).filter((l) => l.includes(";"));
    if (linhas.length < 2) { await marca("vazio", "CSV sem linhas"); vazios++; continue; }
    const head = campos(linhas[0]).map((h) => h.trim().toLowerCase().replace(/^﻿/, ""));
    const ix = (re) => head.findIndex((h) => re.test(h));
    const I = { cug: ix(/codigo_unidade/), ug: ix(/descricao_unidade/), cpf: ix(/cpf/), nome: ix(/nome_servidor/),
      tipo: ix(/tipo_cargo/), cargo: ix(/descricao_cargo/), val: ix(/valor/), adm: ix(/data_admissao/),
      mat: ix(/matricula/), comp: ix(/ano_mes/) };
    if (I.nome < 0) { await marca("layout", `cabeçalho inesperado: ${head.join(",").slice(0, 90)}`); falhas++; continue; }

    const regs = []; const comps = new Set();
    for (const l of linhas.slice(1)) {
      const c = campos(l);
      const nome = txt(c[I.nome]); if (!nome) continue;
      const comp = txt(c[I.comp]); if (comp) comps.add(comp);
      const ug = txt(c[I.ug]);
      regs.push({ cod_ibge, municipio: a.nome, uf: "PB", competencia: comp,
        unidade_gestora: ug, codigo_unidade: txt(c[I.cug]), secretaria: ug,
        nome, cpf_masc: txt(c[I.cpf]), matricula: txt(c[I.mat]), cargo: txt(c[I.cargo]),
        vinculo: txt(c[I.tipo]), data_admissao: txt(c[I.adm]), bruto: money(c[I.val]),
        // a matrícula repete entre unidades gestoras: a UG entra na chave
        _hash: crypto.createHash("md5").update([cod_ibge, comp, c[I.cug], c[I.mat], nome, c[I.cargo]].join("¦")).digest("hex") });
    }
    if (!regs.length) { await marca("vazio", "CSV sem servidores"); vazios++; continue; }
    await grava(regs);
    totalGeral += regs.length; ok++;
    const ultima = [...comps].sort().pop() || null;
    await marca("ok", `${comps.size} competências no arquivo`, regs.length, ultima);
    console.log(`  [${i + 1}/${fila.length}] ${a.nome}: ${regs.length} linhas · ${comps.size} competências (até ${ultima})`);
  } catch (e) {
    await marca("falha", String(e.message).slice(0, 160)); falhas++;
    console.log(`  ✖ ${a.nome}: ${String(e.message).slice(0, 70)}`);
  } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
}
console.log(`\n[tce-pb] ${totalGeral.toLocaleString("pt-BR")} linhas · ${ok} ok · ${vazios} sem arquivo · ${falhas} falhas`);
await db.end();
