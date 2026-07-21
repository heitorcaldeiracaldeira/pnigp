// COLETOR PCP — marca dos PORTAIS DE ORIGEM (Portal de Compras Públicas). CRACKED headless ([[pnigp-portais-endpoints-publicos]]):
//   PNCP API → linkSistemaOrigem → codigoLicitacao → gera relatório (POST+poll) → PDF → parser colunar → ancora por valor.
//   Vencedor = marca do vencedor (→ item_marca_padrao, via 'PCP') · PropostaEletronica = concorrentes (→ item_marca_candidata).
// Idempotente (app.pcp_feitas_${uf}). LIMIT=N p/ leva; LIMIT=0 = todos os PCP-roteados sem marca. node scripts/auditoria/coletor_pcp.mjs
import fs from "fs"; import pg from "pg"; import { execSync } from "child_process";
import { extractText, getDocumentProxy } from "unpdf";
import { limpaMarca, parseBR } from "../portais_comportamento.mjs";
const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 590000 });
const UF = (process.env.UF || "sc").toLowerCase();
const PADRAO = `app.item_marca_padrao_${UF}`, FEITAS = `app.pcp_feitas_${UF}`, CONF = `app.item_marca_conferida_${UF}`;
const LIM = process.env.LIMIT != null ? Number(process.env.LIMIT) : 30;
const CONC = Number(process.env.CONC || 3);   // workers concorrentes (relatório em host separado tolera; pcpId tem backoff 429)
const GEN = "https://conteudo.api.portaldecompraspublicas.com.br/v1/arquivo/download";
const H = { "content-type": "application/json", "referer": "https://www.portaldecompraspublicas.com.br/" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// linkSistemaOrigem da API PNCP → codigoLicitacao (último número da URL do PCP). Retry no 429 (rate limit)
async function pcpId(cnpj, ano, seq) {
  for (let tent = 0; tent < 4; tent++) {
    try {
      const r = await fetch(`https://pncp.gov.br/api/consulta/v1/orgaos/${cnpj}/compras/${ano}/${seq}`, { signal: AbortSignal.timeout(25000) });
      if (r.status === 429) { await sleep(4000 * (tent + 1)); continue; }   // rate limit → espera e retenta
      const j = await r.json().catch(() => null);
      const link = j?.linkSistemaOrigem || "";
      if (!/portaldecompraspublicas/i.test(link)) return null;
      const m = link.match(/(\d{4,})\/?$/) || link.match(/-(\d{5,})/);
      return m ? m[1] : null;
    } catch { await sleep(2000); }
  }
  return "RATE";  // sinaliza rate-limit persistente (não marca feito)
}
// gera o relatório (POST + poll) → URL do PDF
async function relatorio(param) {
  let j = await (await fetch(GEN, { method: "POST", headers: H, body: JSON.stringify({ codigoGeradorArquivo: 0, codigoTipoGerador: 2, codigoUsuarioEntidade: 10, parametros: param, reprocessar: false }) })).json();
  for (let i = 0; i < 15; i++) {
    await sleep(1200);
    j = await (await fetch(GEN, { method: "POST", headers: H, body: JSON.stringify({ codigoGeradorArquivo: j.codigoGeradorArquivo, codigoTipoGerador: 2, codigoUsuarioEntidade: 10, parametros: param, reprocessar: false }) })).json();
    if (j.codigoSituacao === 4 && j.url) return j.url;
    if (j.erro) return null;
  }
  return null;
}
async function pdfTexto(url) {
  try { const buf = new Uint8Array(await (await fetch(url, { signal: AbortSignal.timeout(30000) })).arrayBuffer());
    if (buf[0] !== 0x25) return ""; return (await extractText(await getDocumentProxy(buf), { mergePages: true })).text || ""; } catch { return ""; }
}
// parser colunar: "{codigo} {desc} {Modelo} {Marca} {qtde},NN UN R$ {unit} R$ {total}"; marca = últimos tokens antes da qtde
function parseTabela(txt) {
  const out = [];
  const re = /\b(\d{3,4})\s+(.+?)\s+([\d.]+),\d{2}\s+[A-Za-zçÇºª\.]{1,10}\s+R\$\s*([\d.]+,\d{2})\s+R\$\s*([\d.]+,\d{2})/g;
  let m;
  while ((m = re.exec(txt))) {
    const meio = m[2].trim().split(/\s+/);              // desc + modelo + marca
    const marca = limpaMarca(meio.slice(-2).join(" ")) || limpaMarca(meio.slice(-1)[0]);
    const vu = parseBR(m[4]);
    if (marca && vu) out.push({ marca, valor: vu });
  }
  return out;
}

async function main() {
  await db.query(`create table if not exists ${PADRAO}(cnpj text,ano int,seq int,marca text,valor numeric,padrao text,atualizado timestamptz default now())`);
  await db.query(`create table if not exists ${FEITAS}(cnpj text,ano int,seq int,pcp_id text,status text,n int,atualizado timestamptz default now(),primary key(cnpj,ano,seq))`);
  const lim = LIM > 0 ? `limit ${LIM}` : ``;
  const procs = (await db.query(`
    select distinct p.cnpj,p.ano,p.seq from app.processo_portal_real p
    where p.portal_real='Portal de Compras Públicas'
      and exists(select 1 from itens_${UF} i where i.cnpj=p.cnpj and i.ano=p.ano and i.seq=p.seq and i.unit_homologado is not null)
      and not exists(select 1 from app.item_marca_conferida_${UF} c where c.cnpj=p.cnpj and c.ano=p.ano and c.seq=p.seq)
      and not exists(select 1 from ${FEITAS} f where f.cnpj=p.cnpj and f.ano=p.ano and f.seq=p.seq)
    ${lim}`)).rows;
  if (procs.length === 0) { console.log(`acervo PCP fechado — nada a coletar (consolida já rodou na leva que fechou)`); await db.end(); return; }
  console.log(`PCP a coletar: ${procs.length} · concorrência ${CONC}`);
  let comMarca = 0, paresTot = 0, feitos = 0, rateSeguidos = 0, parar = false;

  // processa 1 proc (pcpId → relatório → parser → grava). Reaproveitável pelos workers.
  async function processa(p) {
    let status = "sem_id", n = 0, id = null;
    id = await pcpId(p.cnpj, p.ano, p.seq);
    if (id === "RATE") { if (++rateSeguidos >= 6) parar = true; await sleep(6000); return; }  // rate persistente → drena e para
    rateSeguidos = 0;
    if (id) {
      const url = await relatorio(`Vencedor,${id}`);
      const txt = url ? await pdfTexto(url) : "";
      const pares = txt ? parseTabela(txt) : [];
      if (pares.length) {
        const vals = []; const ph = pares.map((r, i) => `($${i * 5 + 1},$${i * 5 + 2},$${i * 5 + 3},$${i * 5 + 4},$${i * 5 + 5})`).join(",");
        pares.forEach((r) => vals.push(p.cnpj, p.ano, p.seq, r.marca, r.valor));
        await db.query(`insert into ${PADRAO}(cnpj,ano,seq,marca,valor) values ${ph}`, vals);
        await db.query(`update ${PADRAO} set padrao='PCP' where cnpj=$1 and ano=$2 and seq=$3 and padrao is null`, [p.cnpj, p.ano, p.seq]);
        n = pares.length; paresTot += n; comMarca++; status = "ok";
      } else status = url ? "sem_marca_no_pdf" : "sem_relatorio";
    }
    await db.query(`insert into ${FEITAS}(cnpj,ano,seq,pcp_id,status,n) values($1,$2,$3,$4,$5,$6) on conflict(cnpj,ano,seq) do update set status=excluded.status,n=excluded.n`, [p.cnpj, p.ano, p.seq, id, status, n]);
    process.stdout.write(`  ${++feitos}/${procs.length} · com marca ${comMarca} · pares ${paresTot}\r`);
  }

  // pool de CONC workers puxando de um índice compartilhado
  let idx = 0;
  async function worker(w) {
    await sleep(w * 500);  // escalona o arranque pra não estourar a API PNCP de uma vez
    while (idx < procs.length && !parar) { const p = procs[idx++]; try { await processa(p); } catch (e) { /* segue */ } await sleep(400); }
  }
  await Promise.all(Array.from({ length: CONC }, (_, w) => worker(w)));

  if (parar) console.log(`\nrate limit persistente — parei (idempotente; a task relança e retoma)`);
  console.log(`\n✔ PCP: ${comMarca}/${feitos} procs com marca · ${paresTot} pares`);
  console.table((await db.query(`select status, count(*) n from ${FEITAS} group by 1 order by 2 desc`)).rows);

  // fechou o acervo? (esta leva drenou tudo e NÃO parou por rate) → consolida AUTOMÁTICO, aqui (event-driven, sem polling)
  const rest = Number((await db.query(`
    select count(*) n from (
      select distinct p.cnpj,p.ano,p.seq from app.processo_portal_real p
      where p.portal_real='Portal de Compras Públicas'
        and exists(select 1 from itens_${UF} i where i.cnpj=p.cnpj and i.ano=p.ano and i.seq=p.seq and i.unit_homologado is not null)
        and not exists(select 1 from ${CONF} c where c.cnpj=p.cnpj and c.ano=p.ano and c.seq=p.seq)
        and not exists(select 1 from ${FEITAS} f where f.cnpj=p.cnpj and f.ano=p.ano and f.seq=p.seq)) t`)).rows[0].n);
  await db.end();
  if (!parar && rest === 0 && feitos > 0) {
    console.log(`\n🏁 acervo PCP fechado → rodando consolida_marca (ancora as marcas 'PCP' por valor → conferida)`);
    try { execSync(`"${process.execPath}" scripts/auditoria/consolida_marca.mjs`, { stdio: "inherit" }); }
    catch (e) { console.error("consolida_marca falhou:", e.message); }
  }
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
