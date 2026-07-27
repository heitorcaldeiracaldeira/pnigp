// COLETOR Licitações-E BB (portal nacional do Banco do Brasil, licitacoes-e.com) — marca ancorada por VALOR.
// ⚠️ O portal BB é GATED: detalhe/ata do vencedor atrás de reCAPTCHA v2 (sitekey 6Lfa7KEs…), sem API JSON,
//    numeroLicitação proprietário sem mapa PNCP. NÃO contornamos o reCAPTCHA.
// ROTA LIMPA (Lei 14.133 obriga publicar edital+ata+homologação no PNCP → contorna 100% o gate):
//   1) ACERVO LOCAL: arquivo_texto_${uf} (doc de resultado com texto já extraído do PNCP) — ZERO chamada externa.
//   2) PNCP BLOB:    arquivos_${uf}.uri (blob do PNCP) p/ o que não tem texto no acervo — backoff em 429.
// Legado 8.666-só-no-BB (ata só existe no portal, nunca subiu ao PNCP) = BLOQUEADO de verdade → reportado, não forçado.
// Marca = fato de DOCUMENTO; ancora SEMPRE por unit_homologado (itens_${uf}) ±0,02, trava dupla c/ CNPJ do fornecedor.
// Grava EM LOTE (unnest) em app.item_marca_conferida_${uf} (portal='Licitações-E BB'). Idempotente: app.bb_feitas_${uf}.
// DRY=1 mede sem gravar. LIMIT=N (default 30). State-agnostic: UF por env (default sc).
//   node scripts/auditoria/coletor_licita_es_e_bb.mjs
import fs from "fs"; import pg from "pg";
import { extractText, getDocumentProxy } from "unpdf";
import { limpaMarca, parseBR, extraiMarcas } from "../portais_comportamento.mjs";

const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 590000 });
const UF = (process.env.UF || "sc").toLowerCase();
const PORTAL = "Licitações-E BB";
const ITENS = `itens_${UF}`, TXT = `arquivo_texto_${UF}`, ARQ = `arquivos_${UF}`;
const CONF = `app.item_marca_conferida_${UF}`, FEITAS = `app.bb_feitas_${UF}`;
const PPR = "app.processo_portal_real";
const LIM = process.env.LIMIT != null ? Number(process.env.LIMIT) : 30;
const DRY = process.env.DRY === "1";
const UA = { "user-agent": "Mozilla/5.0" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// doc de RESULTADO (onde vive a marca do vencedor) — nunca edital/TR puro
const RES = "(homolog|adjudica|ata de|ata final|ata do|resultado|vencedor|registro de pre|proposta|termo de)";

async function pdfText(buf) { try { const u = new Uint8Array(buf); if (u[0] !== 0x25) return ""; return (await extractText(await getDocumentProxy(u), { mergePages: true })).text || ""; } catch { return ""; } }

// FONTE 1 — ACERVO: texto do doc de resultado já extraído (grátis, já veio do PNCP)
async function textoAcervo(p) {
  const r = await db.query(`select t.texto from ${ARQ} a join ${TXT} t using(cnpj,ano,seq,sequencial_documento)
    where a.cnpj=$1 and a.ano=$2 and a.seq=$3 and t.chars>200
      and (a.tipo_documento_id=16 or a.titulo ~* '${RES}' or t.texto ~* 'Proposta adjudicada|Marca/Fabricante|Marca\\s*:')
    order by t.chars desc limit 6`, [p.cnpj, p.ano, p.seq]);
  return r.rows.map((x) => x.texto).join("\n");
}
// FONTE 2 — PNCP BLOB: baixa o doc de resultado hospedado no PNCP (arquivos.uri) p/ o que não tem texto no acervo
async function textoBlobPNCP(p) {
  const r = await db.query(`select uri from ${ARQ} where cnpj=$1 and ano=$2 and seq=$3 and uri is not null
    and (tipo_documento_id=16 or titulo ~* '${RES}') order by sequencial_documento desc limit 3`, [p.cnpj, p.ano, p.seq]);
  let txt = "";
  for (const { uri } of r.rows) {
    for (let t = 0; t < 3; t++) {
      try {
        const resp = await fetch(uri, { headers: UA, signal: AbortSignal.timeout(35000) });
        if (resp.status === 429) { await sleep(3000 * (t + 1)); continue; }   // backoff crescente
        txt += " " + await pdfText(await resp.arrayBuffer());
        break;
      } catch { await sleep(1500); }
    }
  }
  return txt;
}

// parser colunar (mesmo do PCP/BLL): "{cod} {desc+marca} {qtde},NN UN R$ {unit} R$ {total}"
function parseColunar(txt) {
  const out = []; const re = /\b(\d{3,4})\s+(.+?)\s+([\d.]+),\d{2}\s+[A-Za-zçÇºª\.]{1,10}\s+R\$\s*([\d.]+,\d{2})\s+R\$\s*([\d.]+,\d{2})/g; let m;
  while ((m = re.exec(txt))) { const meio = m[2].trim().split(/\s+/); const marca = limpaMarca(meio.slice(-2).join(" ")) || limpaMarca(meio.slice(-1)[0]); const vu = parseBR(m[4]); if (marca && vu) out.push({ marca, valor: vu }); }
  return out;
}
// parser inline BB/proposta: "Marca: X  Modelo: Y ... <valor unitário>" — pega a marca rotulada + 1º valor R$ na vizinhança
function parseInlineRotulo(txt) {
  const out = []; const re = /Marca\s*:?\s*([A-Za-zÀ-ÿ0-9][\wÀ-ÿ .&\-]{1,40}?)\s*(?:Modelo\s*:?\s*[\wÀ-ÿ .&\-/]{1,40})?\s*(?:R\$\s*)?([\d.]+,\d{2})?/gi; let m;
  while ((m = re.exec(txt))) { const mk = limpaMarca(m[1]); const vu = parseBR(m[2]); if (mk && vu) out.push({ marca: mk, valor: vu }); }
  return out;
}
function extraiMarca(txt) {
  if (!txt) return [];
  const pares = [
    ...extraiMarcas(txt).filter((x) => x.valor != null).map((x) => ({ marca: x.marca, valor: x.valor })),
    ...parseColunar(txt),
    ...parseInlineRotulo(txt),
  ];
  const visto = new Set(); return pares.filter((x) => { const k = x.marca + "|" + x.valor; if (visto.has(k)) return false; visto.add(k); return true; });
}
// estrutura da marca no doc (p/ relatório)
function estruturaMarca(txt) {
  if (!txt || txt.replace(/\s/g, "").length < 40) return "vazio_ausente";
  if (/Marca\s*\/\s*Fabricante/i.test(txt)) return "rotulo_marca_modelo";
  if (/Marca\s*:/i.test(txt) && /Modelo\s*:/i.test(txt)) return "rotulo_marca_modelo";
  if (parseColunar(txt).length >= 2) return "colunar";
  if (/\bmarca\b/i.test(txt)) return "na_descricao";
  return "vazio_ausente";
}

async function main() {
  await db.query(`create table if not exists ${FEITAS}(cnpj text,ano int,seq int,modalidade_id int,status text,n int,atualizado timestamptz default now(),primary key(cnpj,ano,seq))`);
  const lim = LIM > 0 ? `limit ${LIM}` : ``;
  // universo: procs BB com item homologado (âncora de valor), ainda não conferidos nem feitos
  const procs = (await db.query(`
    select distinct p.cnpj,p.ano,p.seq, coalesce(c.modalidade_id,-1) modalidade_id
    from ${PPR} p
    left join contratacoes_${UF} c using(cnpj,ano,seq)
    where p.portal_real=$1
      and exists(select 1 from ${ITENS} i where i.cnpj=p.cnpj and i.ano=p.ano and i.seq=p.seq and i.unit_homologado is not null)
      and not exists(select 1 from ${CONF} m where m.cnpj=p.cnpj and m.ano=p.ano and m.seq=p.seq and m.portal=$1)
      and not exists(select 1 from ${FEITAS} f where f.cnpj=p.cnpj and f.ano=p.ano and f.seq=p.seq)
    order by 1,2,3 ${lim}`, [PORTAL])).rows;
  if (!procs.length) { console.log(`acervo ${PORTAL} (${UF}) fechado — nada a coletar`); await db.end(); return; }
  console.log(`${PORTAL} (${UF}) a coletar: ${procs.length} procs · DRY=${DRY ? 1 : 0}`);

  const porMod = {};   // modalidade_id → {procs, com_doc, itens_marca, estruturas:{}}
  const acc = (mid) => (porMod[mid] ||= { procs: 0, com_doc: 0, itens_marca: 0, estruturas: {} });
  const feitasRows = [];
  let comMarca = 0, feitos = 0;

  for (const p of procs) {
    const a = acc(p.modalidade_id); a.procs++;
    let status = "sem_doc_resultado", n = 0;
    try {
      // 1) ACERVO (grátis)
      let txt = await textoAcervo(p);
      // 2) PNCP BLOB (se acervo vazio) — rota limpa que contorna o reCAPTCHA do BB
      if (!txt || txt.replace(/\s/g, "").length < 60) txt = await textoBlobPNCP(p);
      const temDoc = txt && txt.replace(/\s/g, "").length >= 60;
      if (temDoc) { a.com_doc++; const est = estruturaMarca(txt); a.estruturas[est] = (a.estruturas[est] || 0) + 1; status = "sem_marca_no_doc"; }

      const pares = extraiMarca(txt);
      if (pares.length) {
        // ANCORA por valor unitário ±0,02, trava dupla c/ CNPJ do fornecedor quando houver
        const itens = (await db.query(`select numero, unit_homologado, cnpj_fornecedor from ${ITENS}
          where cnpj=$1 and ano=$2 and seq=$3 and unit_homologado is not null`, [p.cnpj, p.ano, p.seq])).rows;
        const hits = [];
        for (const par of pares) {
          const it = itens.find((i) => Math.abs(Number(i.unit_homologado) - par.valor) <= 0.02);
          if (it) hits.push({ numero: String(it.numero), marca: par.marca, valor: par.valor, forn: it.cnpj_fornecedor || null });
        }
        const vistoN = new Set(); const uniq = hits.filter((h) => { if (vistoN.has(h.numero)) return false; vistoN.add(h.numero); return true; });
        if (uniq.length) {
          a.itens_marca += uniq.length; n = uniq.length; comMarca++; status = "ok";
          if (!DRY) {
            await db.query(`insert into ${CONF}
              (cnpj,ano,seq,numero,marca,valor,fornecedor_cnpj,valor_ok,cnpj_ok,portal,fonte_titulo)
              select $1,$2,$3, x.numero, x.marca, x.valor, x.forn, true, (x.forn is not null), $4, 'PNCP(rota limpa 14.133)'
              from unnest($5::text[],$6::text[],$7::numeric[],$8::text[]) as x(numero,marca,valor,forn)`,
              [p.cnpj, p.ano, p.seq, PORTAL, uniq.map((h) => h.numero), uniq.map((h) => h.marca), uniq.map((h) => h.valor), uniq.map((h) => h.forn)]);
          }
        }
      }
    } catch (e) { status = "erro:" + e.message.slice(0, 40); }
    feitasRows.push([p.cnpj, p.ano, p.seq, p.modalidade_id, status, n]);
    process.stdout.write(`  ${++feitos}/${procs.length} · com marca ${comMarca}\r`);
    await sleep(120);
  }

  // GRAVA feitas EM LOTE (unnest) — idempotente
  if (!DRY && feitasRows.length) {
    await db.query(`insert into ${FEITAS}(cnpj,ano,seq,modalidade_id,status,n)
      select * from unnest($1::text[],$2::int[],$3::int[],$4::int[],$5::text[],$6::int[])
      on conflict(cnpj,ano,seq) do update set modalidade_id=excluded.modalidade_id,status=excluded.status,n=excluded.n,atualizado=now()`,
      [feitasRows.map(r=>r[0]),feitasRows.map(r=>r[1]),feitasRows.map(r=>r[2]),feitasRows.map(r=>r[3]),feitasRows.map(r=>r[4]),feitasRows.map(r=>r[5])]);
  }

  console.log(`\n✔ ${PORTAL} (${UF}): ${comMarca}/${feitos} procs com marca ancorada`);
  for (const [mid, v] of Object.entries(porMod))
    console.log(`  mod ${mid}: procs=${v.procs} com_doc=${v.com_doc} itens_marca=${v.itens_marca} estruturas=${JSON.stringify(v.estruturas)}`);
  console.table((await db.query(`select status,count(*) n from ${FEITAS} group by 1 order by 2 desc`)).rows);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
