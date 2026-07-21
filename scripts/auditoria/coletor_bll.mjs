// COLETOR BLL/BNC (Lance Eletrônico) — marca do portal de origem. CRACKED headless (jul/2026, [[pnigp-portais-endpoints-publicos]]):
//   PNCP API → linkSistemaOrigem (bllcompras.com/Process/ProcessView?param1=[gkz]…) → GET ProcessView (HTML) →
//   extrai o id do ProcessFiles do onclick doAction(...,'ProcessFiles',['<id>']) → GET ProcessFiles (JSON {html}) →
//   blobs em lanceeletronico.blob.core.windows.net/processfiles/{hash}.pdf|.zip → baixa doc de RESULTADO (ata/atas.zip) →
//   unpdf/adm-zip → extrai marca (A/B + colunar), ancora por valor → item_marca_padrao (padrao='BLL').
// ⚠️ Só procs com linkSistemaOrigem preenchido (subconjunto) são alcançáveis; e só os que têm doc de RESULTADO rendem marca.
// ⚠️ O passo linkSistemaOrigem usa a API PNCP (rate-limited) — NÃO rodar junto do coletor PCP (brigam pela mesma API).
// Idempotente (app.bll_feitas_${uf}). LIMIT=N leva; LIMIT=0 acervo. node scripts/auditoria/coletor_bll.mjs
import fs from "fs"; import pg from "pg"; import { execSync } from "child_process";
import AdmZip from "adm-zip";
import { extractText, getDocumentProxy } from "unpdf";
import { limpaMarca, parseBR, extraiMarcas } from "../portais_comportamento.mjs";
const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 590000 });
const UF = (process.env.UF || "sc").toLowerCase();
const PADRAO = `app.item_marca_padrao_${UF}`, FEITAS = `app.bll_feitas_${UF}`, CONF = `app.item_marca_conferida_${UF}`;
const PORTAL = (process.env.PORTAL || "BLL").toUpperCase();   // BLL ou BNC (mesma plataforma Lance Eletrônico)
const HOST = PORTAL === "BNC" ? "bnccompras.com" : "bllcompras.com";
const LIM = process.env.LIMIT != null ? Number(process.env.LIMIT) : 30;
const CONC = Number(process.env.CONC || 2);
const UA = { "user-agent": "Mozilla/5.0" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// PNCP linkSistemaOrigem (rate-limited) → URL do portal (ProcessView) se for do HOST; senão null; 'RATE' se persistir 429
async function portalLink(cnpj, ano, seq) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(`https://pncp.gov.br/api/consulta/v1/orgaos/${cnpj}/compras/${ano}/${seq}`, { signal: AbortSignal.timeout(25000) });
      if (r.status === 429) { await sleep(4000 * (t + 1)); continue; }
      const j = await r.json().catch(() => null);
      const link = j?.linkSistemaOrigem || "";
      return link.includes(HOST) ? link : null;
    } catch { await sleep(2000); }
  }
  return "RATE";
}
// ProcessView (HTML) → id do ProcessFiles → ProcessFiles (JSON {html}) → [{nome,url}] dos blobs
async function arquivos(pvUrl) {
  const html = await (await fetch(pvUrl, { headers: UA, signal: AbortSignal.timeout(25000) })).text();
  const m = html.match(/ProcessFiles'\s*,\s*\[\s*'([^']+)'/);
  if (!m) return [];
  const pf = `https://${HOST}/Process/ProcessFiles?param1=` + encodeURIComponent(m[1]);
  const t = await (await fetch(pf, { headers: { ...UA, "x-requested-with": "XMLHttpRequest" }, signal: AbortSignal.timeout(25000) })).text();
  let j = null; try { j = JSON.parse(t); } catch {}
  const body = j?.html || t;
  // pares (nome do arquivo, url do blob) — o nome costuma vir antes/depois do href
  const urls = [...body.matchAll(/https?:\/\/[^"'\s)]+\.(pdf|zip)/gi)].map((x) => x[0]);
  const nomes = [...body.matchAll(/>([^<>]{3,60}\.(?:pdf|zip|PDF|ZIP))</g)].map((x) => x[1]);
  return urls.map((url, i) => ({ url, nome: nomes[i] || url.split("/").pop() }));
}
// texto de um doc (pdf direto ou zip com pdfs)
async function docTexto(url) {
  try {
    const buf = Buffer.from(await (await fetch(url, { headers: UA, signal: AbortSignal.timeout(40000) })).arrayBuffer());
    if (buf[0] === 0x50 && buf[1] === 0x4b) {            // ZIP (PK)
      let txt = "";
      for (const e of new AdmZip(buf).getEntries()) {
        if (!/\.pdf$/i.test(e.entryName)) continue;
        const d = e.getData();
        if (d[0] === 0x25) txt += " " + ((await extractText(await getDocumentProxy(new Uint8Array(d)), { mergePages: true })).text || "");
      }
      return txt;
    }
    if (buf[0] === 0x25) return (await extractText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: true })).text || "";  // PDF (%)
    return "";
  } catch { return ""; }
}
// parser colunar (mesmo do PCP): "{cod} {desc+modelo+marca} {qtde},NN UN R$ {unit} R$ {total}"
function parseColunar(txt) {
  const out = []; const re = /\b(\d{3,4})\s+(.+?)\s+([\d.]+),\d{2}\s+[A-Za-zçÇºª\.]{1,10}\s+R\$\s*([\d.]+,\d{2})\s+R\$\s*([\d.]+,\d{2})/g; let m;
  while ((m = re.exec(txt))) { const meio = m[2].trim().split(/\s+/); const marca = limpaMarca(meio.slice(-2).join(" ")) || limpaMarca(meio.slice(-1)[0]); const vu = parseBR(m[4]); if (marca && vu) out.push({ marca, valor: vu }); }
  return out;
}
function extraiTudo(txt) {
  const pares = [...extraiMarcas(txt).filter((p) => p.valor != null).map((p) => ({ marca: p.marca, valor: p.valor })), ...parseColunar(txt)];
  const visto = new Set(); return pares.filter((p) => { const k = p.marca + "|" + p.valor; if (visto.has(k)) return false; visto.add(k); return true; });
}
// só docs de RESULTADO (onde vive a marca) — nunca edital/TR/ETP
const ehResultado = (nome) => /ata|resultad|homolog|adjudic|vencedor|classific|proposta/i.test(nome);

async function main() {
  await db.query(`create table if not exists ${PADRAO}(cnpj text,ano int,seq int,marca text,valor numeric,padrao text,atualizado timestamptz default now())`);
  await db.query(`create table if not exists ${FEITAS}(cnpj text,ano int,seq int,status text,n int,atualizado timestamptz default now(),primary key(cnpj,ano,seq))`);
  const lim = LIM > 0 ? `limit ${LIM}` : ``;
  const procs = (await db.query(`
    select distinct p.cnpj,p.ano,p.seq from app.processo_portal_real p
    where p.portal_real='${PORTAL}'
      and exists(select 1 from itens_${UF} i where i.cnpj=p.cnpj and i.ano=p.ano and i.seq=p.seq and i.unit_homologado is not null)
      and not exists(select 1 from ${CONF} c where c.cnpj=p.cnpj and c.ano=p.ano and c.seq=p.seq)
      and not exists(select 1 from ${FEITAS} f where f.cnpj=p.cnpj and f.ano=p.ano and f.seq=p.seq)
    ${lim}`)).rows;
  if (procs.length === 0) { console.log(`acervo ${PORTAL} fechado — nada a coletar`); await db.end(); return; }
  console.log(`${PORTAL} a coletar: ${procs.length} · concorrência ${CONC} · host ${HOST}`);
  let comMarca = 0, paresTot = 0, feitos = 0, rateSeguidos = 0, parar = false;

  async function processa(p) {
    let status = "sem_link", n = 0;
    const link = await portalLink(p.cnpj, p.ano, p.seq);
    if (link === "RATE") { if (++rateSeguidos >= 6) parar = true; await sleep(6000); return; }
    rateSeguidos = 0;
    if (link) {
      const arqs = (await arquivos(link)).filter((a) => ehResultado(a.nome));
      status = arqs.length ? "sem_marca_no_doc" : "sem_doc_resultado";
      const pares = [];
      for (const a of arqs) { const txt = await docTexto(a.url); if (txt) pares.push(...extraiTudo(txt)); }
      const visto = new Set(); const uniq = pares.filter((r) => { const k = r.marca + "|" + r.valor; if (visto.has(k)) return false; visto.add(k); return true; });
      if (uniq.length) {
        const vals = []; const ph = uniq.map((r, i) => `($${i * 5 + 1},$${i * 5 + 2},$${i * 5 + 3},$${i * 5 + 4},$${i * 5 + 5})`).join(",");
        uniq.forEach((r) => vals.push(p.cnpj, p.ano, p.seq, r.marca, r.valor));
        await db.query(`insert into ${PADRAO}(cnpj,ano,seq,marca,valor) values ${ph}`, vals);
        await db.query(`update ${PADRAO} set padrao='${PORTAL}' where cnpj=$1 and ano=$2 and seq=$3 and padrao is null`, [p.cnpj, p.ano, p.seq]);
        n = uniq.length; paresTot += n; comMarca++; status = "ok";
      }
    }
    await db.query(`insert into ${FEITAS}(cnpj,ano,seq,status,n) values($1,$2,$3,$4,$5) on conflict(cnpj,ano,seq) do update set status=excluded.status,n=excluded.n`, [p.cnpj, p.ano, p.seq, status, n]);
    process.stdout.write(`  ${++feitos}/${procs.length} · com marca ${comMarca} · pares ${paresTot}\r`);
  }

  let idx = 0;
  async function worker(w) { await sleep(w * 600); while (idx < procs.length && !parar) { const p = procs[idx++]; try { await processa(p); } catch {} await sleep(500); } }
  await Promise.all(Array.from({ length: CONC }, (_, w) => worker(w)));

  if (parar) console.log(`\nrate limit persistente — parei (idempotente; retoma depois)`);
  console.log(`\n✔ ${PORTAL}: ${comMarca}/${feitos} procs com marca · ${paresTot} pares`);
  console.table((await db.query(`select status, count(*) n from ${FEITAS} group by 1 order by 2 desc`)).rows);
  const rest = Number((await db.query(`
    select count(*) n from (
      select distinct p.cnpj,p.ano,p.seq from app.processo_portal_real p
      where p.portal_real='${PORTAL}'
        and exists(select 1 from itens_${UF} i where i.cnpj=p.cnpj and i.ano=p.ano and i.seq=p.seq and i.unit_homologado is not null)
        and not exists(select 1 from ${CONF} c where c.cnpj=p.cnpj and c.ano=p.ano and c.seq=p.seq)
        and not exists(select 1 from ${FEITAS} f where f.cnpj=p.cnpj and f.ano=p.ano and f.seq=p.seq)) t`)).rows[0].n);
  await db.end();
  if (!parar && rest === 0 && feitos > 0) {
    console.log(`\n🏁 acervo ${PORTAL} fechado → rodando consolida_marca`);
    try { execSync(`"${process.execPath}" scripts/auditoria/consolida_marca.mjs`, { stdio: "inherit" }); } catch (e) { console.error("consolida falhou:", e.message); }
  }
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
