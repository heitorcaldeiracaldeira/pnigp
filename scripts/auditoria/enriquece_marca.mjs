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
import { limpaMarca, parseBR, extraiMarcas } from "../portais_comportamento.mjs";
import { buscaDoPortal, buscaPeloLink, RECEITA } from "./receitas_portais.mjs";
const USAR_LINK = process.env.USAR_LINK === "1";   // usa linkSistemaOrigem do PNCP (rate-limited) p/ descobrir a origem
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

// ---------- FONTES do doc de resultado (texto) — 3 níveis, do mais barato ao direto ----------
// 1) ACERVO: doc de resultado com texto já extraído (grátis) + texto amplo p/ resolver id do portal
async function textoAcervo(p) {
  const r = await db.query(`select a.titulo, t.texto, t.chars from ${ARQ} a join ${TXT} t using(cnpj,ano,seq,sequencial_documento)
    where a.cnpj=$1 and a.ano=$2 and a.seq=$3 and t.chars>400 order by t.chars desc limit 8`, [p.cnpj, p.ano, p.seq]);
  const resultado = r.rows.filter((x) => new RegExp(RES_REGEX, "i").test(x.titulo || "") || /Proposta adjudicada|Marca\/Fabricante/i.test(x.texto)).map((x) => x.texto).join("\n");
  const todo = r.rows.map((x) => x.texto).join("\n");   // p/ extrair a URL/id do portal no edital
  return { resultado, todo };
}
// 3) PNCP UNIVERSAL: baixa o doc de resultado hospedado no PNCP (arquivos_sc.uri) — tudo veio de algum lugar e ESTÁ no PNCP
async function viaPNCP(p) {
  const r = await db.query(`select uri from ${ARQ} where cnpj=$1 and ano=$2 and seq=$3 and titulo ~* '${RES_REGEX}' and uri is not null order by sequencial_documento desc limit 3`, [p.cnpj, p.ano, p.seq]);
  let txt = "";
  for (const { uri } of r.rows) {
    try { const buf = new Uint8Array(await (await fetch(uri, { signal: AbortSignal.timeout(30000) })).arrayBuffer());
      if (buf[0] === 0x25) txt += " " + ((await extractText(await getDocumentProxy(buf), { mergePages: true })).text || ""); } catch {}
  }
  return txt;
}

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
  // ESTÁGIO 1+2: FILA = TODO proc homologado sem marca (tudo veio de algum lugar e ESTÁ no PNCP → sempre alcançável).
  // A origem (portal_real) escolhe a RECEITA DIRETA quando conhecida; onde não conheço, via PNCP universal (o doc está lá).
  const lim = LIM > 0 ? `limit ${LIM}` : "";
  const procs = (await db.query(`
    select distinct i.cnpj,i.ano,i.seq, p.portal_real
    from ${ITENS} i
    left join ${PPR} p using(cnpj,ano,seq)
    where i.unit_homologado is not null ${FILTRO_PORTAL ? `and p.portal_real=$1` : ""}
      and not exists(select 1 from ${CONF} c where c.cnpj=i.cnpj and c.ano=i.ano and c.seq=i.seq)
      and not exists(select 1 from ${FEITAS} f where f.cnpj=i.cnpj and f.ano=i.ano and f.seq=i.seq)
    ${lim}`, FILTRO_PORTAL ? [FILTRO_PORTAL] : [])).rows;
  console.log(`FILA: ${procs.length} procs homologados (TODOS — cada um veio de algum lugar e ESTÁ no PNCP)`);
  let comMarca = 0, paresTot = 0; const porFonte = {};
  for (const p of procs) {
    const portal = p.portal_real; let status = "sem_marca", n = 0, fonte = "-";
    try {
      const ac = await textoAcervo(p);
      // 1) ACERVO — doc de resultado com texto já extraído (grátis, já veio do PNCP)
      let pares = extraiMarca(ac.resultado); if (pares.length) fonte = "acervo";
      // 2) PNCP — baixa a ata hospedada no PNCP (arquivos_sc.uri). Tudo DEVERIA estar aqui
      if (!pares.length) {
        const tx = await viaPNCP(p);
        const pp = extraiMarca(tx); if (pp.length) { pares = pp; fonte = "pncp"; }
      }
      // 3) NÃO achou no PNCP → traz ONDE FOI FEITO (origem já roteada) e BUSCA o doc no portal
      if (!pares.length && RECEITA[portal]) {
        const tx = await buscaDoPortal(portal, ac.todo, p.cnpj, p.ano, p.seq, { usarPNCP: false });
        const pp = extraiMarca(tx); if (pp.length) { pares = pp; fonte = "portal:" + portal; }
      }
      // 3b) origem NÃO roteada e PNCP falhou → descobre onde foi feito pelo linkSistemaOrigem e busca lá
      if (!pares.length && USAR_LINK && !RECEITA[portal]) {
        const r = await buscaPeloLink(p.cnpj, p.ano, p.seq);
        const pp = extraiMarca(r.texto); if (pp.length) { pares = pp; fonte = "link:" + r.portal; }
      }
      if (pares.length) {
        const via = portal || "pncp";
        const vals = []; const ph = pares.map((r, i) => `($${i * 5 + 1},$${i * 5 + 2},$${i * 5 + 3},$${i * 5 + 4},$${i * 5 + 5})`).join(",");
        pares.forEach((r) => vals.push(p.cnpj, p.ano, p.seq, r.marca, r.valor));
        await db.query(`delete from ${PADRAO} where cnpj=$1 and ano=$2 and seq=$3 and padrao=$4`, [p.cnpj, p.ano, p.seq, via]);
        await db.query(`insert into ${PADRAO}(cnpj,ano,seq,marca,valor) values ${ph}`, vals);
        await db.query(`update ${PADRAO} set padrao=$4 where cnpj=$1 and ano=$2 and seq=$3 and padrao is null`, [p.cnpj, p.ano, p.seq, via]);
        n = pares.length; paresTot += n; comMarca++; status = "ok";
      }
    } catch (e) { status = "erro:" + e.message.slice(0, 40); }
    porFonte[fonte] = (porFonte[fonte] || 0) + 1;
    await marcaFeito(p, portal || "(sem rota)", fonte, status, n);
    process.stdout.write(`  ${comMarca} com marca · ${paresTot} pares\r`);
  }
  console.log(`\n✔ ${comMarca}/${procs.length} procs com marca · ${paresTot} pares`);
  console.log("por fonte:", JSON.stringify(porFonte));
  await db.end();
  console.log("→ rode consolida_marca.mjs p/ ancorar por valor (trava dupla) → conferida");
}
async function marcaFeito(p, portal, arq, status, n) {
  await db.query(`insert into ${FEITAS}(cnpj,ano,seq,portal,arquetipo,status,n) values($1,$2,$3,$4,$5,$6,$7)
    on conflict(cnpj,ano,seq) do update set portal=$4,arquetipo=$5,status=$6,n=$7,atualizado=now()`, [p.cnpj, p.ano, p.seq, portal, arq, status, n]);
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
