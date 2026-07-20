// REPERTÓRIO DE DOCUMENTOS por PORTAL × MODALIDADE × TIPO — o que cada plataforma efetivamente gera.
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const U = fs.readFileSync(path.join(__dirname,"..",".env.local"),"utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString:U, ssl:{rejectUnauthorized:false}, max:2, statement_timeout:590000 });
const q = (s)=>db.query(s).then(r=>r.rows);
// portal × modalidade × tipo_documento: nº processos distintos, nº docs
const rows = await q(`
  SELECT c.plataforma, c.modalidade, a.tipo_documento_id tid, a.tipo_documento,
         count(DISTINCT (a.cnpj,a.ano,a.seq)) procs, count(*) docs
  FROM contratacoes_sc c
  JOIN arquivos_sc a ON a.cnpj=c.cnpj AND a.ano=c.ano AND a.seq=c.seq
  WHERE c.plataforma IS NOT NULL
  GROUP BY 1,2,3,4`);
// total processos por portal×modalidade (denominador)
const tot = await q(`
  SELECT c.plataforma, c.modalidade, count(DISTINCT (c.cnpj,c.ano,c.seq)) procs
  FROM contratacoes_sc c JOIN arquivos_sc a ON a.cnpj=c.cnpj AND a.ano=c.ano AND a.seq=c.seq
  WHERE c.plataforma IS NOT NULL GROUP BY 1,2`);
const den = {}; for (const t of tot) den[t.plataforma+'|'+t.modalidade]=+t.procs;
// organizar
const M = {};
for (const r of rows){ const k=r.plataforma+'|'+r.modalidade; (M[k]=M[k]||[]).push(r); }
const out=[];
const portais = [...new Set(rows.map(r=>r.plataforma))].sort();
for (const p of portais){
  out.push(`\n########## ${p} ##########`);
  const mods=[...new Set(rows.filter(r=>r.plataforma===p).map(r=>r.modalidade))];
  // ordenar modalidade por volume
  mods.sort((a,b)=>(den[p+'|'+b]||0)-(den[p+'|'+a]||0));
  for (const m of mods){
    const d=den[p+'|'+m]||0; if (d<50) continue;
    out.push(`\n  ── ${m}  (${d.toLocaleString()} processos c/ doc) ──`);
    const items=M[p+'|'+m].sort((x,y)=>+y.procs-+x.procs);
    for (const it of items){
      const pct=d?(100*it.procs/d).toFixed(0):'0';
      out.push(`     [${String(it.tid).padStart(2)}] ${(it.tipo_documento||'?').slice(0,42).padEnd(42)} ${String(it.procs).padStart(7)} proc (${pct.padStart(3)}%)  ${it.docs} docs`);
    }
  }
}
fs.writeFileSync(path.join(__dirname,"..","logs","repertorio_portais.log"), out.join("\n"));
console.log("OK — "+portais.length+" portais, "+rows.length+" combinações portal×modalidade×tipo → logs/repertorio_portais.log");
await db.end();
