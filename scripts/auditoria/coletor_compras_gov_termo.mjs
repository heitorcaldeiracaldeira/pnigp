// EXTRATOR AUTÔNOMO Compras.gov — marca do vencedor pelo TERMO DE HOMOLOGAÇÃO (acervo PNCP), TODAS as modalidades.
// Sem humano, sem captcha: o comprasnet publica no PNCP o "Relatório - Termo de Homologação" (já em arquivo_texto_${UF}),
// que traz, por participante, o padrão RÓTULO:  "Marca/Fabricante: <M>  Modelo/versão: <X> ... R$ <V> (unitário)".
// A via rica (comprasnet /public/.../propostas) é captcha-interativo → INVIÁVEL sem humano (não burlamos). Esta é a via limpa.
// Âncora por VALOR (unit_homologado ±0,02): pega o bloco de marca cujo valor bate com o homologado = o do VENCEDOR.
// Teto medido (SC, 23/jul): 740 procs têm o Termo no acervo; 437 mencionam marca. Grava app.item_marca_conferida_${UF} portal='Compras.gov'.
// Idempotente (app.comprasgov_termo_feitas_${UF}). State-agnostic (UF por env). node scripts/auditoria/coletor_compras_gov_termo.mjs (LIMIT=N DRY=1)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = (process.env.UF || "sc").toLowerCase();
const LIMIT = process.env.LIMIT != null ? Number(process.env.LIMIT) : 0;
const CONC = Number(process.env.CONC || 5);
const DRY = process.env.DRY === "1";
const ITENS = `itens_${UF}`, TXT = `arquivo_texto_${UF}`, CONF = `app.item_marca_conferida_${UF}`, FEITAS = `app.comprasgov_termo_feitas_${UF}`;
// título de doc de RESULTADO: homologação/adjudicação/julgamento/relatório/ata/relatorio-dispensa/CONTRATO (o contrato reafirma a marca, captcha-free no acervo)
const RES_TITULO = "homolog|adjudica|julgamento|relat[oó]rio|relatorio|dispensa|ata de|contrato";
const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 590000 });
const q = (s, p) => db.query(s, p);
const brToNum = (s) => { const n = parseFloat(String(s).replace(/\./g, "").replace(",", ".")); return isFinite(n) ? n : null; };
const NOISE = /^(sem marca|marca pr|n[aã]o|nao inform|generic|propri|diversos?|v[aá]rios?|conforme|material|servi|-+|\.+|não realizado|nao realizado|desclassif|inabilit)$/i;
function limpaMarca(s) { let c = String(s || "").replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, ""); if (c.length < 2 || c.length > 55 || !/[a-zà-ÿ]{2}/i.test(c) || NOISE.test(c)) return null; return c; }

// coleta blocos {pos, marca, modelo} — rótulos "Marca/Fabricante:" (pregão/julgamento) OU "Marca:" (contrato); 2 ordens (Marca antes/depois de Modelo)
function blocosMarca(t) {
  const out = []; const re = /Marca(?:\/Fabricante)?:\s*(.+?)(?=\s*(?:Modelo\/vers|Modelo\b|Descri|Valor\b|Fabricante|Marca(?:\/Fabricante)?:|Item\s|R\$|$))/gi; let m;
  while ((m = re.exec(t))) {
    const marca = limpaMarca(m[1]); if (!marca) continue;
    const win = t.slice(Math.max(0, m.index - 90), m.index + 120);
    const modelo = (win.match(/Modelo\/vers[aã]o:\s*(.+?)(?:\s{2,}|Marca\/Fabricante|Descri|Valor|Material:|$)/i)?.[1] || "").replace(/\s+/g, " ").trim().slice(0, 55) || null;
    out.push({ pos: m.index, marca, modelo });
  }
  return out;
}
// coleta {pos, valor} de qualquer "R$ V,dd" (com ou sem "(unitário)"); o valor certo é filtrado depois pela âncora ±0,02
function valores(t) {
  const out = []; const re = /R\$\s*([\d.]+,\d{2,4})/gi; let m;
  while ((m = re.exec(t))) { const v = brToNum(m[1]); if (v != null && v > 0) out.push({ pos: m.index, valor: v }); }
  return out;
}
// CNPJ (14 díg) próximo de uma posição
function cnpjPerto(t, pos) { const jan = t.slice(Math.max(0, pos - 400), pos + 400); const m = jan.match(/\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/); return m ? m[1].replace(/\D/g, "") : null; }

async function main() {
  await q(`create table if not exists ${FEITAS}(cnpj text,ano int,seq int,status text,n int,atualizado timestamptz default now(),primary key(cnpj,ano,seq))`);
  const lim = LIMIT > 0 ? `limit ${LIMIT}` : "";
  const procs = (await q(`
    select distinct a.cnpj,a.ano,a.seq
    from app.processo_portal_real p join ${TXT} a using(cnpj,ano,seq)
    where p.portal_real='Compras.gov' and a.titulo ~* $1 and a.texto ~* 'Marca/Fabricante|Marca *:'
      and exists(select 1 from ${ITENS} i where i.cnpj=a.cnpj and i.ano=a.ano and i.seq=a.seq and i.unit_homologado is not null)
      and not exists(select 1 from ${FEITAS} f where f.cnpj=a.cnpj and f.ano=a.ano and f.seq=a.seq)
    ${lim}`, [RES_TITULO])).rows;
  if (!procs.length) { console.log("nada a coletar (Compras.gov termo)"); await db.end(); return; }
  console.log(`Compras.gov/termo: ${procs.length} procs${DRY ? " · DRY" : ""}`);
  let feitos = 0, comMarca = 0, itensMarca = 0;

  async function processa(p) {
    const docs = (await q(`select texto from ${TXT} where cnpj=$1 and ano=$2 and seq=$3 and titulo ~* $4 and texto ~* 'Marca/Fabricante|Marca *:' order by chars desc limit 3`, [p.cnpj, p.ano, p.seq, RES_TITULO])).rows;
    const t = docs.map((d) => d.texto).join("\n");
    const blocos = blocosMarca(t), vals = valores(t);
    const itens = (await q(`select numero, unit_homologado, cnpj_fornecedor from ${ITENS} where cnpj=$1 and ano=$2 and seq=$3 and unit_homologado is not null`, [p.cnpj, p.ano, p.seq])).rows;
    const grava = []; const usados = new Set();
    for (const it of itens) {
      const uh = Number(it.unit_homologado); if (!(uh > 0)) continue;
      // posições onde o valor bate com o homologado
      const hits = vals.filter((v) => Math.abs(v.valor - uh) <= 0.02);
      let melhor = null, dist = 1e9;
      for (const h of hits) for (const b of blocos) { const d = Math.abs(b.pos - h.pos); if (d < dist && d < 400) { dist = d; melhor = b; } }
      if (melhor && !usados.has(it.numero)) {
        const cnpjDoc = cnpjPerto(t, melhor.pos);
        // trava CNPJ quando ambos existem
        if (cnpjDoc && it.cnpj_fornecedor && cnpjDoc !== String(it.cnpj_fornecedor).replace(/\D/g, "")) continue;
        usados.add(it.numero); grava.push({ numero: it.numero, marca: melhor.marca, modelo: melhor.modelo, valor: uh, forn: it.cnpj_fornecedor });
      }
    }
    let status = grava.length ? "ok" : (blocos.length ? "sem_ancora" : "sem_marca");
    if (grava.length && !DRY) {
      await q(`insert into ${CONF}(cnpj,ano,seq,numero,marca,modelo,valor,fornecedor_cnpj,valor_ok,cnpj_ok,portal,fonte_titulo)
        select $1,$2,$3, x.numero, x.marca, x.modelo, x.valor, x.forn, true, true, 'Compras.gov', 'Termo de Homologacao'
        from unnest($4::text[],$5::text[],$6::text[],$7::numeric[],$8::text[]) as x(numero,marca,modelo,valor,forn)
        on conflict (cnpj,ano,seq,numero) do nothing`,
        [p.cnpj, p.ano, p.seq, grava.map((g) => String(g.numero)), grava.map((g) => g.marca), grava.map((g) => g.modelo), grava.map((g) => g.valor), grava.map((g) => g.forn || null)]);
    }
    if (!DRY) await q(`insert into ${FEITAS}(cnpj,ano,seq,status,n) values($1,$2,$3,$4,$5) on conflict(cnpj,ano,seq) do update set status=excluded.status,n=excluded.n`, [p.cnpj, p.ano, p.seq, status, grava.length]);
    if (grava.length) { comMarca++; itensMarca += grava.length; }
    process.stdout.write(`  ${++feitos}/${procs.length} · procs c/ marca ${comMarca} · itens ${itensMarca}\r`);
  }

  let idx = 0;
  await Promise.all(Array.from({ length: CONC }, async () => { while (idx < procs.length) { const p = procs[idx++]; try { await processa(p); } catch {} } }));
  console.log(`\n✔ Compras.gov/termo: ${comMarca}/${feitos} procs com marca · ${itensMarca} itens (âncora por valor + rótulo Marca/Fabricante)`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
