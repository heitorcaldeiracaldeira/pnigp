// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_camara_ancweb.mjs — folha das CÂMARAS do AMAZONAS publicada em PLANILHA (ANC/ancweb).
//
// ⭐ Achado em 22/ago/2026 pelo diagnóstico com navegador: 8 câmaras do AM usam `transparencia-am.com.br/a{N}g{M}/`
// e a folha não está numa tela — está num ARQUIVO, num padrão de URL enumerável:
//     `ancweb.com.br/{MUNICIPIO}/CM/FOLHA_REMUNERACAO/{ANO}/FOLPAG-{MM}-{AAAA}.XLS`
// (`/CM/` é câmara; o mesmo padrão com `/PM/` é prefeitura). Vem em DOC, PDF, RTF, TXT e XLS — o XLS é o único
// que se lê sem OCR ([[pnigp-folha-publicada-em-pdf-de-relatorio]] é o caso irmão, e ali só havia PDF).
//
// O QUE O ARQUIVO TEM: é a folha ANALÍTICA — matrícula, nome, cargo, carga horária, data de admissão, cada
// RUBRICA (salário base, quinquênio, previdência) e os totais Vencimentos / Descontos / Líquido por servidor.
//
// 🚨 O PORTAL EXPÕE DADO SENSÍVEL QUE NÃO DEVERIA: **CPF INTEIRO, banco, agência e conta corrente** de cada
//    servidor. Este coletor NÃO grava banco/agência/conta, e MASCARA o CPF no padrão do projeto
//    (`***.468.542-**`) — o miolo basta como chave de homônimo ([[pnigp-cpf-mascarado-chave-de-pessoa]],
//    [[pnigp-pep-miolo-do-cpf-e-a-chave]]). Replicar a exposição seria ampliá-la; a decisão de guardar o CPF
//    completo é do Heitor, não minha.
//
// Uso: node scripts/ingest_folha_camara_ancweb.mjs      · SO=Fonte · ANO=2025 · REFAZ=1
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import XLSX from "xlsx";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
// 🚨 UA DE ROBÔ LEVA 406 NESTE PORTAL — e 406 pareceu "câmara sem folha" em 6 das 8 (a primeira passou porque
//    eu a tinha baixado antes, com outro agente). O mesmo endereço responde 200 com UA de navegador.
//    Ausência de resposta não é ausência de dado ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
const UA = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

await q(`create table if not exists folha_servidores_ancweb (
  cod_ibge text, municipio text, uf text, poder text, entidade text, competencia text,
  matricula text, nome text, cpf_masc text, cargo text, secretaria text, departamento text,
  carga_horaria text, data_admissao text, bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_ancweb_mun on folha_servidores_ancweb (cod_ibge, competencia)`);
await q(`create table if not exists folha_ancweb_coleta (
  cod_ibge text, poder text, municipio text, uf text, arquivo text, competencia text, linhas int,
  situacao text, detalhe text, em timestamptz default now(), primary key (cod_ibge, poder))`);

const money = (s) => {
  const t = String(s ?? "").replace(/[R$\s ]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(t); return Number.isFinite(n) && t !== "" ? n : null;
};
// 🚨 mascara o CPF que a fonte publica inteiro — guarda o MIOLO, que é o que identifica sem expor
const mascara = (cpf) => {
  const d = String(cpf || "").replace(/\D/g, "");
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : null;
};

async function baixa(url, bin = false) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(90000) });
      if (r.ok) return bin ? Buffer.from(await r.arrayBuffer()) : await r.text();
    } catch { /* retry */ }
    await new Promise((s) => setTimeout(s, 2000 * (t + 1)));
  }
  return null;
}

// ── o parser da folha ANALÍTICA ────────────────────────────────────────────────────────────────────────────────
// O relatório é paginado em abas (Page1…PageN) e cada servidor ocupa um bloco:
//   "17 - CLEIA CORREA MARQUES" … Cargo: … Adm.: …   |   "Banco: … CPF: … PIS/PASEP: …"   |   rubricas
//   "Base Prev: … Base IRRF: …" + [Vencimentos, Descontos, Líquido] ← é ESTA linha que fecha o servidor
function extrai(buf, ctx) {
  const wb = XLSX.read(buf, { type: "buffer" });
  const regs = [];
  let secretaria = null, departamento = null;
  for (const aba of wb.SheetNames) {
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, raw: false });
    let atual = null;
    for (const l of linhas) {
      const txt = (l || []).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      if (!txt) continue;
      const mSec = txt.match(/Secretaria:\s*[\d.]+\s+(.+)/i);
      if (mSec) { secretaria = mSec[1].trim(); continue; }
      const mDep = txt.match(/Departamento:\s*[\d.]+\s+(.+)/i);
      if (mDep) { departamento = mDep[1].trim(); continue; }
      // cabeçalho do servidor: "NN - NOME" no início da célula
      const mServ = txt.match(/^(\d{1,6})\s*-\s*([A-ZÀ-Ú][A-ZÀ-Ú' .]{4,})/);
      if (mServ) {
        const cargo = (txt.match(/Cargo:\s*([^|]+?)\s*(?:CH Mensal|Adm\.|$)/i) || [])[1];
        atual = { ...ctx, matricula: mServ[1], nome: mServ[2].replace(/\s+/g, " ").trim(),
                  cargo: cargo ? cargo.replace(/\s+/g, " ").trim() : null,
                  secretaria, departamento,
                  carga_horaria: (txt.match(/CH Mensal:\s*([0-9A-Za-z]+)/i) || [])[1] || null,
                  data_admissao: (txt.match(/Adm\.:\s*([\d/]+)/i) || [])[1] || null,
                  cpf_masc: null, bruto: null, descontos: null, liquido: null };
        continue;
      }
      // ── LAYOUT B (Jutaí, Maraã, Tonantins, Anori): tabela com cabeçalho "Matrícula | Nome do Trabalhador |
      //    Admissão | Cargo" e fechamento na linha seguinte a "Proventos … Descontos … Líquido".
      //    🚨 É o MESMO fornecedor com outra versão do relatório: tratar um só layout deixou 4 das 8 câmaras
      //    como "sem servidor reconhecido", que parece "não publica" e é parser incompleto
      //    ([[pnigp-ipm-item-e-rotina-variam]]).
      const cel = (l || []).map((x) => (x == null ? "" : String(x).trim()));
      const mB = cel[1] && /^\d{1,6}-\d$/.test(cel[1]) && cel[2] && /[A-ZÀ-Ú]{4,}/.test(cel[2]);
      if (mB) {
        atual = { ...ctx, matricula: cel[1], nome: cel[2].replace(/\s+/g, " ").trim(),
                  cargo: (cel.find((x) => /^\d{3,4}\s*-\s*[A-ZÀ-Ú]/.test(x)) || "").replace(/^\d+\s*-\s*/, "") || null,
                  secretaria, departamento, carga_horaria: null,
                  data_admissao: (cel.find((x) => /^\d{2}\/\d{2}\/\d{4}$/.test(x)) || null),
                  cpf_masc: null, bruto: null, descontos: null, liquido: null };
        continue;
      }
      if (atual && /^Base FGTS/i.test(txt)) { atual._esperandoTotais = true; continue; }
      if (atual && atual._esperandoTotais) {
        const nums = cel.filter((x) => /^[\d.]+,\d{2}$/.test(x));
        if (nums.length >= 3) {
          atual.bruto = money(nums[nums.length - 3]);
          atual.descontos = money(nums[nums.length - 2]);
          atual.liquido = money(nums[nums.length - 1]);
          atual._hash = crypto.createHash("md5")
            .update([ctx.cod_ibge, ctx.competencia, atual.matricula, atual.nome].join("¦")).digest("hex");
          delete atual._esperandoTotais;
          if (atual.bruto || atual.liquido) regs.push(atual);
          atual = null;
        }
        continue;
      }
      if (!atual) continue;
      // ⚠️ a linha do banco traz o CPF INTEIRO — pega-se o CPF (mascarado) e DESCARTA-SE banco/agência/conta
      const mCpf = txt.match(/CPF:\s*([\d.\-]{11,14})/i);
      if (mCpf) { atual.cpf_masc = mascara(mCpf[1]); continue; }
      // a linha de fechamento do servidor tem os três totais nas últimas células preenchidas
      if (/Base Prev:/i.test(txt)) {
        const nums = (l || []).filter((x) => x != null && /^[\d.]+,\d{2}$/.test(String(x).trim()));
        if (nums.length >= 3) {
          atual.bruto = money(nums[nums.length - 3]);
          atual.descontos = money(nums[nums.length - 2]);
          atual.liquido = money(nums[nums.length - 1]);
        }
        atual._hash = crypto.createHash("md5")
          .update([ctx.cod_ibge, ctx.competencia, atual.matricula, atual.nome].join("¦")).digest("hex");
        if (atual.bruto || atual.liquido) regs.push(atual);
        atual = null;
      }
    }
  }
  return regs;
}

// ── alvos: as câmaras que o diagnóstico apontou para o transparencia-am ────────────────────────────────────────
const alvos = (await q(`select d.cod_ibge, d.municipio, d.uf, coalesce(d.url_pessoal, d.url_visitada) url
  from folha_diagnostico_camara d
 where d.produto = 'transparencia-am (novo)'
   ${SO ? "and d.municipio ilike '%'||$1||'%'" : ""}
 order by d.municipio`, SO ? [SO] : [])).rows;
const feitos = process.env.REFAZ === "1" ? new Set()
  : new Set((await q(`select cod_ibge from folha_ancweb_coleta where situacao='ok' and poder='legislativo'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[ancweb] ${alvos.length} câmaras do AM · ${fila.length} na fila`);

let total = 0, ok = 0, vazio = 0;
for (const a of fila) {
  const marca = (situacao, detalhe, arquivo = null, comp = null, linhas = 0) =>
    q(`insert into folha_ancweb_coleta (cod_ibge,poder,municipio,uf,arquivo,competencia,linhas,situacao,detalhe,em)
       values ($1,'legislativo',$2,$3,$4,$5,$6,$7,$8,now())
       on conflict (cod_ibge,poder) do update set arquivo=excluded.arquivo, competencia=excluded.competencia,
         linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, arquivo, comp, linhas, situacao, detalhe]);
  const html = await baixa(a.url);
  if (!html) { await marca("erro", "portal não respondeu"); continue; }
  // ⭐ os links do arquivo estão na própria página; o mais recente vence (FOLPAG-MM-AAAA)
  const xls = [...new Set([...html.matchAll(/https?:\/\/[^"'\s]*FOLHA_REMUNERACAO[^"'\s]*FOLPAG-(\d{2})-(\d{4})\.XLS/gi)]
    .map((m) => ({ url: m[0], comp: `${m[2]}${m[1]}` })))].sort((x, y) => y.comp.localeCompare(x.comp));
  if (!xls.length) { await marca("vazio", "nenhum FOLPAG .XLS na página"); vazio++; continue; }
  const alvo = xls[0];
  const buf = await baixa(alvo.url, true);
  if (!buf) { await marca("erro", `download falhou: ${alvo.url.slice(-40)}`); continue; }
  let regs = [];
  try {
    regs = extrai(buf, { cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, poder: "legislativo",
                         entidade: `Câmara Municipal de ${a.municipio}`, competencia: alvo.comp });
  } catch (e) { await marca("erro", `planilha ilegível: ${String(e.message).slice(0, 60)}`); continue; }
  if (!regs.length) { await marca("vazio", `planilha ${alvo.comp} sem servidor reconhecido`, alvo.url, alvo.comp); vazio++; continue; }
  // 🚨 o relatório repete o servidor entre abas/páginas: sem deduplicar por `_hash`, o Postgres recusa o lote
  //    inteiro com "ON CONFLICT DO UPDATE command cannot affect row a second time".
  const porHash = new Map();
  for (const r of regs) porHash.set(r._hash, r);
  regs = [...porHash.values()];
  const c = (f) => regs.map((x) => x[f]);
  await q(`insert into folha_servidores_ancweb
    (cod_ibge,municipio,uf,poder,entidade,competencia,matricula,nome,cpf_masc,cargo,secretaria,departamento,
     carga_horaria,data_admissao,bruto,descontos,liquido,_hash)
    select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
      $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::numeric[],$16::numeric[],
      $17::numeric[],$18::text[])
    on conflict (_hash) do update set bruto=coalesce(excluded.bruto, folha_servidores_ancweb.bruto),
      descontos=coalesce(excluded.descontos, folha_servidores_ancweb.descontos),
      liquido=coalesce(excluded.liquido, folha_servidores_ancweb.liquido),
      cpf_masc=coalesce(excluded.cpf_masc, folha_servidores_ancweb.cpf_masc), _coletado_em=now()`,
    [c("cod_ibge"), c("municipio"), c("uf"), c("poder"), c("entidade"), c("competencia"), c("matricula"),
     c("nome"), c("cpf_masc"), c("cargo"), c("secretaria"), c("departamento"), c("carga_horaria"),
     c("data_admissao"), c("bruto"), c("descontos"), c("liquido"), c("_hash")]);
  await marca("ok", `planilha analítica`, alvo.url, alvo.comp, regs.length);
  total += regs.length; ok++;
  console.log(`  ✔ ${a.uf} ${a.municipio}: ${regs.length} servidores (${alvo.comp})`);
}
console.log(`\n[ancweb] ${total} servidores · ${ok} câmaras ok · ${vazio} vazias`);
await db.end();
