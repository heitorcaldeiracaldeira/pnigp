// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_am_anc.mjs — folha nominal dos municípios do AM que usam o portal **ANC** (`transparencia-am.com.br`,
// arquivos em `ancweb.com.br`). É o segundo bloco do Amazonas, e alcança municípios que NÃO estão no portal da
// AAM (Beruri, Itapiranga, Jutaí, Tonantins…). Ver [[pnigp-am-aam-folha-analitica-pdf]].
//
// O CAMINHO:
//   · cada ente é uma URL `transparencia-am.com.br/a{ID}g106/` (g106 = "FOLHA - REMUNERAÇÃO");
//   · a página lista os meses e, para cada um, **PDF e XLS** com URL direta em
//     `ancweb.com.br/{MUNICIPIO}/{PM|CM}/FOLHA_REMUNERACAO/{ano}/FOLPAG-{mm}-{ano}.XLS`;
//   · ⭐ o XLS é planilha BINÁRIA de verdade (BIFF/OLE2), com uma aba por página do relatório
//     (Page1…PageN) e colunas fixas: Mat. · Nome · Admissão · Cargo · Proventos · TotalDescontos · Total Líquido.
//     Itapiranga 03/2026: 32 abas, **874 servidores**.
//
// ⚠️ O relatório da ANC **não traz secretaria** — entrega 4 dos 5 campos (município, cargo, salário, nome).
// 🚨 NÃO montar a URL do arquivo por adivinhação: o nome da pasta nem sempre é o nome do município
// (JUTAI deu 404 no palpite e existe na listagem). Ler o href que a própria página publica.
//
// Uso: DESCOBRE=1 node scripts/ingest_folha_am_anc.mjs   (varre os IDs e cadastra os entes)
//      node scripts/ingest_folha_am_anc.mjs              (coleta os cadastrados)   · SO=itapiranga · REFAZ=1
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import * as XLSX from "xlsx";
import { pool, withRetry } from "./_cadprev.mjs";
import { extractText, getDocumentProxy } from "unpdf";
import { parsePdfTexto } from "./_folha_pdf_parsers.mjs";

const db = pool();
const q = withRetry(db);
const B = "https://transparencia-am.com.br";
const SO = process.env.SO || null;
const REFAZ = process.env.REFAZ === "1";
const DESCOBRE = process.env.DESCOBRE === "1";
const FAIXA = (process.env.FAIXA || "2100-2300").split("-").map(Number);
const CONC = +(process.env.CONC || 6);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", accept: "*/*", "accept-language": "pt-BR,pt;q=0.9" };
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const chave = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const num = (v) => {
  if (v == null) return null;
  const s = String(v).replace(/[R$\s]/g, "").trim();
  if (!s || s === "-") return null;
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const pega = async (u, ms = 120000) => {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(ms) });
      const b = Buffer.from(await r.arrayBuffer());
      return { st: r.status, buf: b, n: b.length, t: b.toString("latin1") };
    } catch (e) { if (t === 2) return { st: 0, buf: Buffer.alloc(0), n: 0, t: "", erro: String(e?.cause?.message || e.message).slice(0, 50) }; await dorme(2500 * (t + 1)); }
  }
};

await q(`create table if not exists am_anc_ente (
  ancid int primary key, pasta text, tipo text, cod_ibge text, municipio text, uf text, em timestamptz default now()
)`);
await q(`create table if not exists folha_servidores_amanc (
  cod_ibge text, municipio text, uf text, entidade text, competencia text,
  matricula text, nome text, cargo text, secretaria text, data_admissao text,
  bruto numeric, descontos numeric, liquido numeric, arquivo text,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`alter table folha_servidores_amanc add column if not exists secretaria text`);
await q(`create index if not exists ix_folha_amanc_mun on folha_servidores_amanc (cod_ibge, competencia)`);
await q(`create table if not exists folha_amanc_coleta (
  cod_ibge text primary key, ancid int, municipio text, competencia text,
  servidores int, situacao text, detalhe text, em timestamptz default now()
)`);

// ── DESCOBERTA: quem é cada `a{ID}` ─────────────────────────────────────────────────────────────────────────────
// ⭐ O truque: a página do ente não diz o nome dele, mas as URLs dos arquivos sim
// (`ancweb.com.br/ITAPIRANGA/PM/…`). O ID vira ente lendo o primeiro arquivo listado.
if (DESCOBRE) {
  const munsAM = (await q(`select cod_ibge, nome from municipios_br where uf='AM'`)).rows
    .map((m) => ({ ...m, k: chave(m.nome) }));
  const ids = [];
  for (let i = FAIXA[0]; i <= FAIXA[1]; i++) ids.push(i);
  let achados = 0;
  const fila = [...ids];
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (fila.length) {
      const id = fila.shift();
      const p = await pega(`${B}/a${id}g106/`, 40000);
      if (p.st !== 200) continue;
      const m = p.t.match(/ANCWEB\.COM\.BR\/([A-Z0-9_-]+)\/(PM|CM)\//i);
      if (!m) continue;
      const pasta = m[1].toUpperCase(), tipo = m[2].toUpperCase();
      const mun = munsAM.find((x) => x.k === chave(pasta));
      await q(`insert into am_anc_ente (ancid,pasta,tipo,cod_ibge,municipio,uf) values ($1,$2,$3,$4,$5,'AM')
               on conflict (ancid) do update set pasta=excluded.pasta, tipo=excluded.tipo,
                 cod_ibge=excluded.cod_ibge, municipio=excluded.municipio`,
        [id, pasta, tipo, mun?.cod_ibge || null, mun?.nome || null]);
      achados++;
      console.log(`  a${id} → ${pasta} (${tipo}) ${mun ? "✔ " + mun.nome : "— fora do AM ou nome não casou"}`);
    }
  }));
  console.log(`\n[anc] descoberta: ${achados} entes na faixa ${FAIXA[0]}-${FAIXA[1]}`);
}

// ── COLETA ──────────────────────────────────────────────────────────────────────────────────────────────────────
const MESES = { "01": 1, "02": 2, "03": 3, "04": 4, "05": 5, "06": 6, "07": 7, "08": 8, "09": 9, 10: 10, 11: 11, 12: 12 };

// Lê o XLS (uma aba por página do relatório). 🚨 O portal da ANC tem MAIS DE UM LAYOUT e mapear coluna por
// POSIÇÃO FIXA só funcionaria no primeiro que eu vi:
//   · Itapiranga — "Relação dos Funcionarios": Mat. · Nome · Admissão · Cargo · Proventos · TotalDescontos · Líquido
//   · Tonantins  — "Folha Sintética": tem seções `Secretaria:` / `Departamento:` / `Divisão:` e as colunas
//                  Matric · Nome · Cargo · Rem. Básica · Outros Rend · Total Rend · Descontos · … · Líquido
// ⭐ Este é o único dos dois que traz SECRETARIA. Por isso o cabeçalho é procurado em qualquer coluna e as
// colunas são mapeadas PELO NOME.
function leXls(buf) {
  const wb = XLSX.read(buf, { type: "buffer" });
  const regs = [];
  let competencia = null;
  for (const aba of wb.SheetNames) {
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, raw: false, defval: "" })
      .map((l) => l.map((c) => String(c).replace(/\s+/g, " ").trim()));
    let col = null, secretaria = null;
    for (const l of linhas) {
      const junta = l.join(" ").trim();
      if (!competencia) {
        const m = junta.match(/Refer[êe]ncia:\s*(\d{2})\s*de\s*(\d{4})/i)
              || junta.match(/M[êe]s\/Ano\s*(\d{2})\/(\d{4})/i)
              || junta.match(/^(Janeiro|Fevereiro|Mar[çc]o|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\/(\d{4})/i);
        if (m) {
          const MES = { janeiro: "01", fevereiro: "02", marco: "03", março: "03", abril: "04", maio: "05", junho: "06",
            julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12" };
          competencia = /^\d{2}$/.test(m[1]) ? `${m[2]}${m[1]}` : `${m[2]}${MES[m[1].toLowerCase()]}`;
        }
      }
      const sec = junta.match(/Secretaria:\s*(.{3,70}?)(?:\s+Departamento:|$)/i);
      if (sec) { secretaria = sec[1].trim(); continue; }
      // 🚨 3º layout (Beruri, Novo Aripuanã): "Remuneração Mensal", **sem coluna de matrícula** e com `Setor`.
      // Exigir `Mat.` no cabeçalho zerava esses municípios inteiros. A âncora é NOME + (CARGO ou PROVENTOS).
      const acha = (re) => l.findIndex((c) => re.test(c));
      const iNome = acha(/^nome$/i), iCargo = acha(/^cargo/i), iProv = acha(/proventos|total rend/i);
      if (iNome >= 0 && (iCargo >= 0 || iProv >= 0)) {
        col = { mat: acha(/^(mat\.?|matric\.?|matr[íi]cula)$/i), nome: iNome, adm: acha(/admiss/i), cargo: iCargo,
          setor: acha(/^(setor|lota[çc][ãa]o|unidade)/i), vinculo: acha(/v[íi]nculo/i),
          prov: iProv >= 0 ? iProv : acha(/^(proventos|total rend)/i),
          desc: acha(/^(totaldescontos|descontos)$/i), liq: acha(/^(total\s*)?l[íi]quido/i) };
        continue;
      }
      if (!col) continue;
      const mat = col.mat >= 0 ? l[col.mat] : null;
      const nome = col.nome >= 0 ? l[col.nome] : null;
      const prov = col.prov >= 0 ? num(l[col.prov]) : null;
      if (!nome || /^nome$/i.test(nome)) continue;             // linha vazia ou repetição do cabeçalho
      if (col.mat >= 0 && !/^\d+$/.test(mat || "")) continue;   // no layout com matrícula, ela é obrigatória
      if (prov == null) continue;                               // sem valor não é linha de servidor
      const vinc = col.vinculo >= 0 ? l[col.vinculo] || "" : "";
      const dtVinc = (vinc.match(/(\d\d\/\d\d\/\d{4})/) || [])[1] || null;
      regs.push({ matricula: mat || null, nome, cargo: col.cargo >= 0 ? l[col.cargo] || null : null,
        data_admissao: (col.adm >= 0 ? l[col.adm] : null) || dtVinc,
        secretaria: secretaria || (col.setor >= 0 ? l[col.setor] || null : null),
        bruto: prov, descontos: col.desc >= 0 ? num(l[col.desc]) : null, liquido: col.liq >= 0 ? num(l[col.liq]) : null });
    }
  }
  return { competencia, regs };
}

const alvos = (await q(`select * from am_anc_ente where tipo='PM' and cod_ibge is not null
  ${SO ? "and (pasta ilike '%'||$1||'%' or municipio ilike '%'||$1||'%')" : ""} order by municipio`, SO ? [SO] : [])).rows;
const feitos = REFAZ ? new Set() : new Set((await q(`select cod_ibge from folha_amanc_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[anc] ${alvos.length} prefeituras cadastradas · ${fila.length} na fila`);

let totalGeral = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe, comp = null, servs = 0) =>
    q(`insert into folha_amanc_coleta (cod_ibge,ancid,municipio,competencia,servidores,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,now())
       on conflict (cod_ibge) do update set ancid=excluded.ancid, competencia=excluded.competencia,
         servidores=excluded.servidores, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.ancid, a.municipio, comp, servs, situacao, detalhe]);
  try {
    const pg = await pega(`${B}/a${a.ancid}g106/`, 60000);
    if (pg.st !== 200) { await marca("erro", `página HTTP ${pg.st || pg.erro}`); console.log(`  ✖ ${a.municipio}: HTTP ${pg.st}`); continue; }
    // os XLS que a PRÓPRIA página publica (não adivinhar caminho)
    const todosXls = [...new Set([...pg.t.matchAll(/https?:\/\/[^"'\s]*ANCWEB\.COM\.BR\/[^"'\s]*\.XLS/gi)].map((m) => m[0]))];
    // 🚨 NÃO ordenar por string: em Beruri o "maior" alfabético é `TERCEIRIZADOS-2026-06-08.XLS` (18 KB, uma
    // aba, lista de terceirizados) e o coletor lia esse em vez do `FOLPAG-06-2026.XLS`. Filtra a folha e ordena
    // pela COMPETÊNCIA lida do nome.
    const xls = todosXls
      .map((u) => { const m = u.match(/FOLPAG-(\d{2})-(\d{4})/i); return m ? { u, comp: `${m[2]}${m[1]}` } : null; })
      .filter(Boolean).sort((x, y) => y.comp.localeCompare(x.comp)).map((x) => x.u);
    if (!xls.length) console.log(`  · ${a.municipio}: sem XLS de folha — vai pelo PDF`);
    // competência mais cheia, não a mais recente: baixa os DOIS mais recentes e fica com o de mais servidores.
    const ordenado = xls.slice(0, 2);   // vazio quando o ente só publica PDF
    let melhor = null;
    for (const u of ordenado) {
      const d = await pega(u, 300000);
      if (d.st !== 200 || d.n < 5000) continue;
      let lido; try { lido = leXls(d.buf); } catch { continue; }
      if (lido.regs.length && (!melhor || lido.regs.length > melhor.regs.length)) melhor = { ...lido, url: u };
    }
    // 🚨 PLANO B — o PDF. Nem todo ente da ANC publica planilha: Jutaí só tem PDF (e de 2019), e em São
    // Sebastião do Uatumã / Novo Aripuanã o XLS não abre. O PDF passa pela bateria compartilhada, a mesma que lê
    // os portais da AAM e do Diretório Digital — layout de folha se repete entre fornecedores.
    if (!melhor) {
      const pdfs = todosXls.length ? [] : [];
      const listaPdf = [...new Set([...pg.t.matchAll(/https?:\/\/[^"'\s]*ANCWEB\.COM\.BR\/[^"'\s]*\.PDF/gi)].map((m) => m[0]))]
        .map((u) => { const mm = u.match(/FOLPAG-(\d{2})-(\d{4})/i); return mm ? { u, comp: `${mm[2]}${mm[1]}` } : null; })
        .filter(Boolean).sort((x, y) => y.comp.localeCompare(x.comp)).slice(0, 3);
      for (const cand of listaPdf) {
        const d = await pega(cand.u, 300000);
        if (d.st !== 200 || d.n < 5000) continue;
        let texto = "";
        try {
          const pdf = await getDocumentProxy(new Uint8Array(d.buf), { useSystemFonts: false });
          texto = (await extractText(pdf, { mergePages: true })).text;
        } catch { continue; }
        const r0 = parsePdfTexto(texto);
        console.log(`   PDF ${cand.comp}: ${r0.regs.length} servidores (${r0.layout || "-"})`);
        if (r0.regs.length && (!melhor || r0.regs.length > melhor.regs.length)) {
          melhor = { regs: r0.regs, competencia: r0.competencia || cand.comp, url: cand.u };
        }
        if (melhor && melhor.regs.length >= 300) break;
      }
    }
    if (!melhor) { await marca("vazio", `${xls.length} XLS + PDFs, nada legível`); console.log(`  ✖ ${a.municipio}: nada legível`); continue; }
    const mesArq = (melhor.url.match(/FOLPAG-(\d{2})-(\d{4})/i) || []);
    const comp = melhor.competencia || (mesArq[2] ? `${mesArq[2]}${mesArq[1]}` : null);
    const regs = melhor.regs.map((r) => ({
      ...r, cod_ibge: a.cod_ibge, municipio: a.municipio, uf: "AM", entidade: "PREFEITURA", competencia: comp,
      arquivo: melhor.url.split("/").pop(),
      _hash: crypto.createHash("md5").update([a.cod_ibge, comp, r.matricula, r.nome, r.cargo].join("¦")).digest("hex"),
    }));
    const m = new Map(); for (const r of regs) m.set(r._hash, r);
    const todos = [...m.values()];
    for (let k = 0; k < todos.length; k += 500) {
      const p = todos.slice(k, k + 500); const c = (f) => p.map((x) => x[f]);
      await q(`insert into folha_servidores_amanc
        (cod_ibge,municipio,uf,entidade,competencia,matricula,nome,cargo,secretaria,data_admissao,bruto,descontos,liquido,arquivo,_hash)
        select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
          $9::text[],$10::text[],$11::numeric[],$12::numeric[],$13::numeric[],$14::text[],$15::text[])
        on conflict (_hash) do update set bruto=excluded.bruto, descontos=excluded.descontos,
          liquido=excluded.liquido, secretaria=coalesce(excluded.secretaria, folha_servidores_amanc.secretaria),
          _coletado_em=now()`,
        [c("cod_ibge"), c("municipio"), c("uf"), c("entidade"), c("competencia"), c("matricula"), c("nome"),
         c("cargo"), c("secretaria"), c("data_admissao"), c("bruto"), c("descontos"), c("liquido"), c("arquivo"), c("_hash")]);
    }
    totalGeral += todos.length;
    await marca("ok", null, comp, todos.length);
    console.log(`  ✔ [${i + 1}/${fila.length}] ${a.municipio}: ${todos.length} servidores · ${comp} · ${todos.filter((r) => r.bruto > 0).length} com valor`);
    await dorme(600);
  } catch (e) {
    await marca("erro", String(e?.cause?.message || e.message).slice(0, 200));
    console.log(`  ✖ ${a.municipio}: ${String(e.message).slice(0, 90)}`);
  }
}
console.log(`\n[anc] ${totalGeral.toLocaleString("pt-BR")} servidores gravados`);
await db.end();
