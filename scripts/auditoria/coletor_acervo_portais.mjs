// COLETOR DE ACERVO — marca dos 5 portais de API-viva (PCP/BLL/BNC/Licitar/Licitanet) pelo DOC DE RESULTADO já no
// ACERVO do PNCP (arquivo_texto_${uf}). ROTA LIMPA: a bolsa 14.133 publica edital+ata+homologação no PNCP; a marca
// vem do doc espelhado — SEM API viva, SEM captcha, SEM login. Filtra por PK do proc (nunca varre o acervo 12GB).
//
// Unifica os parsers provados (formatos variam por portal):
//   A) COLUNAR c/ CNPJ  — "{CNPJ} {valor} Vencedor {marca modelo}" (AZ/BLL/BNC) e "{desc} {MARCA} R$ {unit} R$ {total}".
//   B) RÓTULO posicional — "Marca/Fabricante: M" | "Marca: M" (+ Modelo em qualquer ordem), ancorado ao valor+CNPJ perto.
// TRAVA DUPLA: unit_homologado (±0,02) + cnpj_fornecedor. Nunca por posição/ordem. Grava item_marca_conferida
// (portal = portal_real). Idempotente (app.acervo_portais_feitas_${uf}, PK cnpj,ano,seq). State-agnostic (UF env).
//   PORTAL="BLL" node scripts/auditoria/coletor_acervo_portais.mjs   (vazio = os 5)  ·  LIMIT=N · DRY=1
import fs from "fs"; import pg from "pg";
import { limpaMarca, parseBR } from "../portais_comportamento.mjs";
const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 590000 });
const UF = (process.env.UF || "sc").toLowerCase();
const CONF = `app.item_marca_conferida_${UF}`, FEITAS = `app.acervo_portais_feitas_${UF}`;
const ALVO = process.env.PORTAL ? [process.env.PORTAL] : ["Portal de Compras Públicas", "BLL", "BNC", "Licitar Digital", "Licitanet"];
const LIM = process.env.LIMIT != null ? Number(process.env.LIMIT) : 0;
const DRY = process.env.DRY === "1";
const GENERICA = /^(pr[oó]pri[ao]?|diversas?|diversos?|v[aá]ri[ao]s?|sem marca|nacional|generic[ao]?|s\/?\s*marca|nd|na)$/i;
const RESRE = "(a.titulo ~* 'ata|homolog|adjudic|vencedor|resultad|proposta|contrato|julgamento' or a.tipo_documento ~* 'ata|homolog|adjudic|resultad|proposta|contrato|julgamento|registro de pre')";
const cnpjNorm = (s) => String(s || "").replace(/\D/g, "");

// A1) colunar ata: "{CNPJ} {valor} Vencedor {marca modelo}"
function parseColunarCnpj(txt) {
  const out = []; const re = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\s+([\d.]+,\d{2,4})\s*(?:Vencedor|Adjudicad[oa]|Classificad[oa])?\s*([A-Za-zÀ-ÿ0-9][\s\S]{0,60}?)(?=\s+[A-ZÀ-Ÿ][A-Za-zÀ-ÿ&.\/ -]{1,40}?\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\s+Lote\s|\s+Item\s|\s+Classificad|\s+Desclassificad|$)/g;
  let m;
  while ((m = re.exec(txt))) {
    const cnpj = cnpjNorm(m[1]); const valor = parseBR(m[2]);
    const blob = m[3].split(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|[\d.]+,\d{4}|\bN\/C\b/)[0].replace(/\s+/g, " ").trim();
    const toks = blob.split(" ").filter(Boolean);
    const marca = limpaMarca(toks[0]) || limpaMarca(toks.slice(0, 2).join(" "));
    if (valor != null && marca) out.push({ cnpj, valor, marca, modelo: toks.slice(1).join(" ").slice(0, 60) || null });
  }
  return out;
}
// A2) colunar contrato: "{cod} {qtde} {un} {desc MARCA} R$ {unit} R$ {total}" (sem CNPJ na linha)
function parseColunarValor(txt) {
  const out = []; const re = /\b(\d{1,4})\s+([\d.,]+)\s+([A-Za-zçÇºª\/.]{1,15})\s+(.+?)\s+R\$\s*([\d.]+,\d{2})\s+R\$\s*([\d.]+,\d{2})/g;
  let m;
  while ((m = re.exec(txt))) {
    const meio = m[4].trim().split(/\s+/);
    const marca = limpaMarca(meio.slice(-1)[0]) || limpaMarca(meio.slice(-2).join(" "));
    const vu = parseBR(m[5]);
    if (marca && vu != null) out.push({ cnpj: null, valor: vu, marca, modelo: null });
  }
  return out;
}
// B) rótulo posicional: blocos {pos, marca, modelo} — "Marca/Fabricante:" | "Marca:" nas 2 ordens
function blocosMarca(t) {
  const out = []; const re = /Marca(?:\/Fabricante)?:\s*(.+?)(?=\s*(?:Modelo\/vers|Modelo\b|Descri|Valor\b|Fabricante|Marca(?:\/Fabricante)?:|Item\s|R\$|$))/gi; let m;
  while ((m = re.exec(t))) {
    const marca = limpaMarca(m[1]); if (!marca) continue;
    const win = t.slice(Math.max(0, m.index - 90), m.index + 120);
    const modelo = (win.match(/Modelo\/?(?:vers[aã]o)?:\s*(.+?)(?:\s{2,}|Marca|Descri|Valor|Material:|$)/i)?.[1] || "").replace(/\s+/g, " ").trim().slice(0, 55) || null;
    out.push({ pos: m.index, marca, modelo });
  }
  return out;
}
function valores(t) { const out = []; const re = /R?\$?\s*([\d.]+,\d{2,4})/gi; let m; while ((m = re.exec(t))) { const v = parseBR(m[1]); if (v != null && v > 0) out.push({ pos: m.index, valor: v }); } return out; }
function cnpjPerto(t, pos) { const j = t.slice(Math.max(0, pos - 400), pos + 400); const m = j.match(/\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/); return m ? cnpjNorm(m[1]) : null; }

async function main() {
  const q = async (s, p) => (await db.query(s, p)).rows;
  await db.query(`create table if not exists ${FEITAS}(cnpj text,ano int,seq int,portal text,status text,n int,atualizado timestamptz default now(),primary key(cnpj,ano,seq))`);
  for (const PORTAL of ALVO) {
    const lim = LIM > 0 ? `limit ${LIM}` : ``;
    const procs = await q(`
      select distinct p.cnpj,p.ano,p.seq from app.processo_portal_real p
      where p.portal_real=$1
        and exists(select 1 from itens_${UF} i where i.cnpj=p.cnpj and i.ano=p.ano and i.seq=p.seq and i.unit_homologado is not null)
        and exists(select 1 from arquivo_texto_${UF} a where a.cnpj=p.cnpj and a.ano=p.ano and a.seq=p.seq and a.excluido_em is null and ${RESRE})
        and not exists(select 1 from ${CONF} c where c.cnpj=p.cnpj and c.ano=p.ano and c.seq=p.seq and c.portal=$1)
        and not exists(select 1 from ${FEITAS} f where f.cnpj=p.cnpj and f.ano=p.ano and f.seq=p.seq)
      ${lim}`, [PORTAL]);
    if (!procs.length) { console.log(`${PORTAL}: nada a coletar`); continue; }
    console.log(`\n${PORTAL} a coletar: ${procs.length}${DRY ? " (DRY)" : ""}`);
    let comMarca = 0, itensTot = 0, reais = 0, feitos = 0;
    const CONC = 4; let idx = 0;
    async function worker() {
      while (idx < procs.length) {
        const p = procs[idx++];
        try {
          const docs = await q(`select a.titulo, a.texto from arquivo_texto_${UF} a where a.cnpj=$1 and a.ano=$2 and a.seq=$3 and a.excluido_em is null and ${RESRE} order by (a.titulo ~* 'ata|homolog|resultad|julgamento|vencedor') desc, a.chars desc limit 4`, [p.cnpj, p.ano, p.seq]);
          const txt = docs.map(d => d.texto || "").join("\n"); const tituloFonte = docs[0]?.titulo || "resultado";
          const triplos = [...parseColunarCnpj(txt), ...parseColunarValor(txt)];
          const blocos = blocosMarca(txt), vals = valores(txt);
          const itens = await q(`select numero, unit_homologado, cnpj_fornecedor from itens_${UF} where cnpj=$1 and ano=$2 and seq=$3 and unit_homologado is not null`, [p.cnpj, p.ano, p.seq]);
          const usados = new Set(); const hits = [];
          for (const it of itens) {
            const uh = Number(it.unit_homologado); if (!(uh > 0) || usados.has(it.numero)) continue;
            const cf = cnpjNorm(it.cnpj_fornecedor);
            // A: triplo por valor + CNPJ
            let cand = triplos.find(t => Math.abs(t.valor - uh) <= 0.02 && (!t.cnpj || !cf || t.cnpj === cf));
            let marca = null, modelo = null, cnpj_ok = false;
            if (cand) { marca = cand.marca; modelo = cand.modelo; cnpj_ok = !!cand.cnpj; }
            else {
              // B: posicional — valor casa, bloco de marca mais próximo, CNPJ perto
              const hv = vals.filter(v => Math.abs(v.valor - uh) <= 0.02);
              let melhor = null, dist = 1e9, posV = -1;
              for (const h of hv) for (const b of blocos) { const d = Math.abs(b.pos - h.pos); if (d < dist && d < 400) { dist = d; melhor = b; posV = h.pos; } }
              if (melhor) {
                const cd = cnpjPerto(txt, melhor.pos);
                if (cd && cf && cd !== cf) { melhor = null; }
                else { marca = melhor.marca; modelo = melhor.modelo; cnpj_ok = !!cd; }
              }
            }
            if (marca) { usados.add(it.numero); hits.push({ numero: String(it.numero), marca, modelo, valor: uh, forn: it.cnpj_fornecedor, cnpj_ok }); }
          }
          let status = triplos.length || blocos.length ? "sem_ancora" : "sem_marca", n = 0;
          if (hits.length) {
            status = "ok"; n = hits.length; comMarca++; itensTot += n; reais += hits.filter(h => !GENERICA.test(h.marca)).length;
            if (!DRY) await db.query(`insert into ${CONF}(cnpj,ano,seq,numero,marca,modelo,valor,fornecedor_cnpj,cnpj_ok,valor_ok,marca_generica,portal,fonte_titulo)
              select $1,$2,$3, x.numero,x.marca,x.modelo,x.valor,x.forn,x.cnpj_ok,true,x.gen,$4,$5
              from unnest($6::text[],$7::text[],$8::text[],$9::numeric[],$10::text[],$11::bool[],$12::bool[]) as x(numero,marca,modelo,valor,forn,cnpj_ok,gen)
              on conflict do nothing`,
              [p.cnpj, p.ano, p.seq, PORTAL, tituloFonte, hits.map(h => h.numero), hits.map(h => h.marca), hits.map(h => h.modelo), hits.map(h => h.valor), hits.map(h => h.forn || null), hits.map(h => h.cnpj_ok), hits.map(h => GENERICA.test(h.marca))]);
          }
          if (!DRY) await db.query(`insert into ${FEITAS}(cnpj,ano,seq,portal,status,n) values($1,$2,$3,$4,$5,$6) on conflict(cnpj,ano,seq) do update set status=excluded.status,n=excluded.n,portal=excluded.portal`, [p.cnpj, p.ano, p.seq, PORTAL, status, n]);
          process.stdout.write(`  ${++feitos}/${procs.length} · procs c/ marca ${comMarca} · itens ${itensTot} · real ${reais}\r`);
        } catch {}
      }
    }
    await Promise.all(Array.from({ length: CONC }, worker));
    console.log(`\n✔ ${PORTAL}: ${comMarca}/${feitos} procs · ${itensTot} itens · ${reais} marca real`);
  }
  await db.end();
}
main().catch(e => { console.error("ERRO:", e.message); process.exit(1); });
