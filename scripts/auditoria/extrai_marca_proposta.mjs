// EXTRAI MARCA das PROPOSTAS — a marca é vedada no edital (art. 41) mas OBRIGATÓRIA na proposta do fornecedor.
// TODOS os fornecedores apresentam proposta → marca do VENCEDOR (ancora por valor = conferida) + marcas dos
// CONCORRENTES (não ancoram = corpus de participantes). Formato: "Marca: X" inline. Grava em app.item_marca_padrao
// (valor-ancorado na consolidação). node scripts/auditoria/extrai_marca_proposta.mjs
import fs from "fs"; import pg from "pg";
import { limpaMarca, parseBR } from "../portais_comportamento.mjs";
const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 590000 });
const UF = (process.env.UF || "sc").toLowerCase();
const PADRAO = `app.item_marca_padrao_${UF}`, FEITAS = `app.marca_proposta_feitas_${UF}`;
const LIM = process.env.LIMIT != null ? Number(process.env.LIMIT) : 0;

// pares {marca,valor} da proposta: "Marca: X" + o 1º valor N,NN logo após
function extraiProposta(texto) {
  const out = []; let m;
  const re = /marca\s*:?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9\-\/\.& ]{1,25})/gi;
  while ((m = re.exec(texto))) {
    const marca = limpaMarca(m[1]);
    if (!marca) continue;
    const janela = texto.slice(m.index, m.index + 90);
    const mv = janela.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/);  // valor N,NN (BR)
    out.push({ marca, valor: mv ? parseBR(mv[1]) : null });
  }
  return out;
}

async function main() {
  await db.query(`create table if not exists ${PADRAO}(cnpj text,ano int,seq int,marca text,valor numeric,padrao text,atualizado timestamptz default now())`);
  await db.query(`create table if not exists ${FEITAS}(cnpj text,ano int,seq int,primary key(cnpj,ano,seq))`);
  const lim = LIM > 0 ? `limit ${LIM}` : ``;
  const procs = (await db.query(`
    select distinct a.cnpj,a.ano,a.seq
    from arquivos_sc a join arquivo_texto_sc t using(cnpj,ano,seq,sequencial_documento)
    where a.titulo ~* 'proposta' and t.chars>500 and t.texto ~* 'marca'
      and exists(select 1 from itens_${UF} i where i.cnpj=a.cnpj and i.ano=a.ano and i.seq=a.seq and i.unit_homologado is not null)
      and not exists(select 1 from ${FEITAS} f where f.cnpj=a.cnpj and f.ano=a.ano and f.seq=a.seq)
    ${lim}`)).rows;
  console.log(`propostas a processar: ${procs.length}`);
  let pares = 0;
  for (const p of procs) {
    const docs = (await db.query(`select t.texto from arquivos_sc a join arquivo_texto_sc t using(cnpj,ano,seq,sequencial_documento)
      where a.cnpj=$1 and a.ano=$2 and a.seq=$3 and a.titulo ~* 'proposta' and t.chars>500`, [p.cnpj, p.ano, p.seq])).rows;
    const rows = []; for (const d of docs) for (const par of extraiProposta(d.texto)) if (par.valor != null) rows.push(par);
    // dedup por marca+valor no processo (várias propostas repetem)
    const vistos = new Set(); const uniq = rows.filter((r) => { const k = r.marca + "|" + r.valor; if (vistos.has(k)) return false; vistos.add(k); return true; });
    // grava em lote (marca+valor, padrao='P')
    if (uniq.length) {
      const vals = []; const ph = uniq.map((r, i) => `($${i * 5 + 1},$${i * 5 + 2},$${i * 5 + 3},$${i * 5 + 4},$${i * 5 + 5})`).join(",");
      uniq.forEach((r) => vals.push(p.cnpj, p.ano, p.seq, r.marca, r.valor));
      await db.query(`insert into ${PADRAO}(cnpj,ano,seq,marca,valor) values ${ph}`, vals);
      // marca o padrao como 'P' (proposta) nas linhas recém-inseridas
      await db.query(`update ${PADRAO} set padrao='P' where cnpj=$1 and ano=$2 and seq=$3 and padrao is null`, [p.cnpj, p.ano, p.seq]);
      pares += uniq.length;
    }
    await db.query(`insert into ${FEITAS}(cnpj,ano,seq) values($1,$2,$3) on conflict do nothing`, [p.cnpj, p.ano, p.seq]);
  }
  console.log(`pares de proposta gravados: ${pares} → rode consolida_marca.mjs`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
