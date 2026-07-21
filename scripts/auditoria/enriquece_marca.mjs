// ENRIQUECE MARCA — orquestrador ÚNICO por ARQUÉTIPO (não por portal). É a ESPINHA do enriquecimento de marca.
// Estrutura (5 estágios), toda idempotente e dirigida por evento ([[pnigp-modulo-auditoria]] · ao_homologar):
//   1) FILA      — procs homologados SEM marca conferida (de app.fetch_fila / universo roteado).
//   2) ROTA      — portal_real (reroteia_dominio, por DOMÍNIO; bolsa>ERP). ERP nunca é destino.
//   3) DESPACHO  — pelo ARQUÉTIPO do portal (não pelo nome). 15 portais → 4 handlers + fallback PNCP universal:
//        · relatorio_gerado (PCP, Licitanet)      → gera+poll → doc
//        · arquivo_blob     (BLL/BNC, Licitar Dig)→ lista+baixa blob
//        · doc_no_acervo    (Compras.gov, etc)    → já em arquivo_texto (grátis)
//        · gated/pncp       (ComprasBR/BBMNET/BB) → baixa a ata do PNCP (a lei obriga publicar lá → contorna gate)
//   4) EXTRAI    — marca do doc (A/B/colunar/comprasnet), SEM API (marca é fato de documento).
//   5) ANCORA    — grava item_marca_padrao(padrao=portal); consolida_marca ancora por valor (trava dupla) → conferida.
// node scripts/auditoria/enriquece_marca.mjs   (LIMIT=N leva · ARQ=<arquetipo> só um · PORTAL=<nome> só um)
import fs from "fs"; import pg from "pg"; import { execSync } from "child_process";
import { extractText, getDocumentProxy } from "unpdf";
import { PORTAIS, limpaMarca, parseBR, extraiMarcas } from "../portais_comportamento.mjs";
const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 590000 });
const UF = (process.env.UF || "sc").toLowerCase();
const ITENS = `itens_${UF}`, TXT = `arquivo_texto_${UF}`, ARQ = `arquivos_${UF}`;
const PADRAO = `app.item_marca_padrao_${UF}`, CONF = `app.item_marca_conferida_${UF}`, FEITAS = `app.enriq_marca_feitas_${UF}`;
const PPR = "app.processo_portal_real";
const LIM = process.env.LIMIT != null ? Number(process.env.LIMIT) : 50;
const FILTRO_ARQ = process.env.ARQ || null, FILTRO_PORTAL = process.env.PORTAL || null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RES_REGEX = "(homolog|ata de|ata final|adjudica|resultado|vencedor|registro de pre|proposta)";

// arquétipo do portal (o motor central: portal → arquétipo). Fallback = via PNCP (universal p/ bolsa gated).
function arquetipoDe(portal) {
  const p = PORTAIS[portal];
  if (!p || p.tipo === "erp" || p.tipo === "federal") return null;   // ERP nunca é destino; federal fora de escopo
  return p.arquetipo || "gated";
}

// ---------- HANDLERS por arquétipo (retornam TEXTO do doc de resultado) ----------
// doc já no acervo (o mais barato — grátis): pega o doc de resultado com texto já extraído
async function docNoAcervo(p) {
  const r = await db.query(`select t.texto from ${ARQ} a join ${TXT} t using(cnpj,ano,seq,sequencial_documento)
    where a.cnpj=$1 and a.ano=$2 and a.seq=$3 and (a.titulo ~* '${RES_REGEX}' or t.texto ~* 'Proposta adjudicada|Marca/Fabricante')
      and t.chars>500 order by t.chars desc limit 3`, [p.cnpj, p.ano, p.seq]);
  return r.rows.map((x) => x.texto).join("\n");
}
// via PNCP (universal p/ bolsa gated): baixa o doc de resultado hospedado no PNCP (arquivos_sc.uri) e extrai texto
async function viaPNCP(p) {
  const r = await db.query(`select uri from ${ARQ} where cnpj=$1 and ano=$2 and seq=$3 and titulo ~* '${RES_REGEX}' and uri is not null order by sequencial_documento desc limit 3`, [p.cnpj, p.ano, p.seq]);
  let txt = "";
  for (const { uri } of r.rows) {
    try { const buf = new Uint8Array(await (await fetch(uri, { signal: AbortSignal.timeout(30000) })).arrayBuffer());
      if (buf[0] === 0x25) txt += " " + ((await extractText(await getDocumentProxy(buf), { mergePages: true })).text || ""); } catch {}
  }
  return txt;
}
// relatorio_gerado / arquivo_blob: por ora delegam aos coletores CRACKED específicos (PCP, BLL, Licitar Digital,
// Licitanet) — cada um tem sua receita headless; aqui só marcamos que o despacho é por eles (a ser fiado no wiring).
const HANDLER = {
  doc_no_acervo: docNoAcervo,
  gated:         viaPNCP,       // bolsa gated → a ata está no PNCP
  arquivo_blob:  docNoAcervo,   // TODO wiring direto (BLL ProcessFiles / Licitar Digital S3); acervo/PNCP cobre o grosso
  relatorio_gerado: viaPNCP,    // TODO wiring direto (PCP report / Licitanet); PNCP cobre onde a ata foi publicada
};

// ---------- EXTRAÇÃO de marca (A/B/colunar) — reusa extraiMarcas + colunar do doc ----------
function parseColunar(txt) {
  const out = []; const re = /\b(\d{3,4})\s+(.+?)\s+([\d.]+),\d{2}\s+[A-Za-zçÇºª\.]{1,10}\s+R\$\s*([\d.]+,\d{2})\s+R\$\s*([\d.]+,\d{2})/g; let m;
  while ((m = re.exec(txt))) { const meio = m[2].trim().split(/\s+/); const marca = limpaMarca(meio.slice(-2).join(" ")) || limpaMarca(meio.slice(-1)[0]); const vu = parseBR(m[4]); if (marca && vu) out.push({ marca, valor: vu }); }
  return out;
}
function extraiMarca(txt) {
  if (!txt) return [];
  const pares = [...extraiMarcas(txt).filter((x) => x.valor != null).map((x) => ({ marca: x.marca, valor: x.valor })), ...parseColunar(txt)];
  const visto = new Set(); return pares.filter((x) => { const k = x.marca + "|" + x.valor; if (visto.has(k)) return false; visto.add(k); return true; });
}

async function main() {
  await db.query(`create table if not exists ${FEITAS}(cnpj text,ano int,seq int,portal text,arquetipo text,status text,n int,atualizado timestamptz default now(),primary key(cnpj,ano,seq))`);
  // ESTÁGIO 1+2: FILA = procs homologados, roteados (portal real), sem marca conferida, não feitos
  const lim = LIM > 0 ? `limit ${LIM}` : "";
  const procs = (await db.query(`
    select distinct p.cnpj,p.ano,p.seq,p.portal_real
    from ${PPR} p
    where p.portal_real is not null ${FILTRO_PORTAL ? `and p.portal_real=$1` : ""}
      and exists(select 1 from ${ITENS} i where i.cnpj=p.cnpj and i.ano=p.ano and i.seq=p.seq and i.unit_homologado is not null)
      and not exists(select 1 from ${CONF} c where c.cnpj=p.cnpj and c.ano=p.ano and c.seq=p.seq)
      and not exists(select 1 from ${FEITAS} f where f.cnpj=p.cnpj and f.ano=p.ano and f.seq=p.seq)
    ${lim}`, FILTRO_PORTAL ? [FILTRO_PORTAL] : [])).rows;
  console.log(`FILA: ${procs.length} procs · dispatch por arquétipo`);
  let comMarca = 0, paresTot = 0; const porArq = {};
  for (const p of procs) {
    const portal = p.portal_real, arq = arquetipoDe(portal);
    porArq[arq || "erp/fora"] = (porArq[arq || "erp/fora"] || 0) + 1;
    if (!arq) { await marcaFeito(p, portal, "erp_ou_fora", "sem_destino", 0); continue; }
    if (FILTRO_ARQ && arq !== FILTRO_ARQ) continue;
    let status = "sem_doc", n = 0;
    try {
      const txt = await (HANDLER[arq] || viaPNCP)(p);
      const pares = extraiMarca(txt);
      if (pares.length) {
        const vals = []; const ph = pares.map((r, i) => `($${i * 5 + 1},$${i * 5 + 2},$${i * 5 + 3},$${i * 5 + 4},$${i * 5 + 5})`).join(",");
        pares.forEach((r) => vals.push(p.cnpj, p.ano, p.seq, r.marca, r.valor));
        await db.query(`delete from ${PADRAO} where cnpj=$1 and ano=$2 and seq=$3 and padrao=$4`, [p.cnpj, p.ano, p.seq, portal]);
        await db.query(`insert into ${PADRAO}(cnpj,ano,seq,marca,valor) values ${ph}`, vals);
        await db.query(`update ${PADRAO} set padrao=$4 where cnpj=$1 and ano=$2 and seq=$3 and padrao is null`, [p.cnpj, p.ano, p.seq, portal]);
        n = pares.length; paresTot += n; comMarca++; status = "ok";
      } else status = txt ? "sem_marca_no_doc" : "sem_doc";
    } catch (e) { status = "erro:" + e.message.slice(0, 40); }
    await marcaFeito(p, portal, arq, status, n);
    process.stdout.write(`  ${comMarca} com marca · ${paresTot} pares\r`);
  }
  console.log(`\n✔ ${comMarca}/${procs.length} procs com marca · ${paresTot} pares`);
  console.log("dispatch por arquétipo:", JSON.stringify(porArq));
  await db.end();
  console.log("→ rode consolida_marca.mjs p/ ancorar por valor (trava dupla) → conferida");
}
async function marcaFeito(p, portal, arq, status, n) {
  await db.query(`insert into ${FEITAS}(cnpj,ano,seq,portal,arquetipo,status,n) values($1,$2,$3,$4,$5,$6,$7)
    on conflict(cnpj,ano,seq) do update set portal=$4,arquetipo=$5,status=$6,n=$7,atualizado=now()`, [p.cnpj, p.ano, p.seq, portal, arq, status, n]);
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
