// ANÁLISE PARA A DECISÃO DE RELIGAR O "PNIGP Enriquece Item Documento".
//   node scripts/analise_religar_enriquecimento.mjs
//
// A tarefa foi desligada em 08/ago por ordem do Heitor, quando o enriquecimento produzia descrição
// recortada no lugar errado. Desde então o método mudou: os quatro recortes concorrem e vence o que mede
// melhor no documento (`escolhe_recorte.mjs`). Religar ou não é decisão dele — este script só entrega os
// números que a sustentam, e é explícito sobre o que NÃO sabe.
//
// A pergunta não é "melhorou?". É: SE ELA RODAR AMANHÃ, sobre o que ela roda, e com que qualidade?
// Porque a tarefa pega processo INÉDITO — e o inédito é justamente o que ainda não foi re-extraído.
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Client({ connectionString: U, ssl: { rejectUnauthorized: false }, statement_timeout: 900000 });
await db.connect();
const q = async (n, s) => { const r = await db.query(s); console.log(`\n### ${n}`); console.table(r.rows); return r.rows; };

const normP = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const STOP = new Set("para com sem por que dos das uma tipo cor material medida unidade produto item lote".split(" "));
const sig = (s) => normP(s).split(" ").filter((w) => w.length >= 4 && !STOP.has(w));

// 1) QUALIDADE: o que o método novo produziu × o que ficou do antigo, na mesma base
const linhas = (await db.query(`
  select descricao_api api, descricao_documento doc,
         (metodo ~ 'recorte:') novo
    from app.item_enriquecimento
   where descricao_documento is not null and descricao_api is not null
   order by random() limit 120000`)).rows;
const cont = { novo: { n: 0, comeco: 0, contem: 0, nada: 0 }, velho: { n: 0, comeco: 0, contem: 0, nada: 0 } };
for (const x of linhas) {
  const sa = sig(x.api); if (sa.length < 2) continue;
  const c = x.novo ? cont.novo : cont.velho;
  c.n++;
  const d = normP(x.doc);
  const achou = sa.slice(0, 3).filter((w) => d.includes(w)).length;
  const pos = d.indexOf(sa[0]);
  if (pos >= 0 && pos <= Math.max(20, d.length * 0.25)) c.comeco++;
  if (achou >= 2) c.contem++;
  if (achou === 0) c.nada++;
}
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : "—");
console.log("\n### 1) QUALIDADE — método novo (roteador) × método antigo (janela)");
console.table([
  { metodo: "NOVO (roteador)", itens: cont.novo.n, comeca_certo: pct(cont.novo.comeco, cont.novo.n), contem_2: pct(cont.novo.contem, cont.novo.n), nao_contem_nada: pct(cont.novo.nada, cont.novo.n) },
  { metodo: "antigo (janela)", itens: cont.velho.n, comeca_certo: pct(cont.velho.comeco, cont.velho.n), contem_2: pct(cont.velho.contem, cont.velho.n), nao_contem_nada: pct(cont.velho.nada, cont.velho.n) },
]);

// 2) SOBRE O QUE A TAREFA RODARIA: o inédito é o que ainda não tem geometria?
await q("2) O QUE A TAREFA PEGARIA SE RELIGASSE (processos inéditos)", `
  with ined as (
    select f.cnpj, f.ano, f.seq from app.fila_enriquecimento f
     where not exists (select 1 from app.item_enriquecimento e
       where e.cnpj=f.cnpj and e.ano=f.ano and e.seq=f.seq))
  select count(*) processos_ineditos,
         count(*) filter (where exists (select 1 from public.arquivo_texto_sc t
           where t.cnpj=i.cnpj and t.ano=i.ano and t.seq=i.seq and t.layout_v=1)) COM_geometria,
         count(*) filter (where not exists (select 1 from public.arquivo_texto_sc t
           where t.cnpj=i.cnpj and t.ano=i.ano and t.seq=i.seq and t.layout_v=1)) SEM_geometria
    from ined i`);

// 3) QUAL MÉTODO VENCE — o roteador funciona porque o tipo de documento decide
await q("3) MÉTODO VENCEDOR por tipo de documento", `
  select coalesce(substring(metodo from 'recorte:([a-z_]+)'),'(antigo)') recorte,
         coalesce(fonte_documento,'(sem)') documento, count(*) itens
    from app.item_enriquecimento where metodo ~ 'recorte:'
   group by 1,2 order by 3 desc limit 14`);

// 4) O QUE AINDA FALTA — a re-extração é o teto do que dá para melhorar
await q("4) RE-EXTRAÇÃO: quanto do texto-fonte ainda é fluxo", `
  select case when layout_v=1 then 'com geometria' else 'ainda achatado' end estado, count(*) docs
    from public.arquivo_texto_sc
   where tipo_documento in ('Edital','Termo de Referência','Estudo Técnico Preliminar','Projeto Básico','DFD','Anexo')
   group by 1 order by 2 desc`);

await q("5) COBERTURA atual do enriquecimento", `
  select (select count(*) from public.itens_sc) itens_totais,
         (select count(*) from app.item_enriquecimento) enriquecidos,
         (select count(*) from app.item_enriquecimento where metodo ~ 'recorte:') pelo_metodo_novo,
         (select count(*) from app.fila_enriquecimento) fila`);

console.log(`
═══ COMO LER ═══
· Se o NOVO mede melhor que o antigo, o método não é mais o motivo para manter desligada.
· Se o INÉDITO é majoritariamente SEM geometria, religar hoje faz a tarefa rodar sobre texto em fluxo —
  onde o roteador cai sempre na janela e o ganho não aparece. Nesse caso o critério de religar não é a
  qualidade do método, é o avanço da re-extração.
· O item 4 é o teto: enquanto houver documento achatado, há ganho esperando, e não é de código.`);
await db.end();
