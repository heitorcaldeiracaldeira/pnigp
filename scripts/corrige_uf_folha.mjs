// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// corrige_uf_folha.mjs — a UF por EXTENSO nas tabelas de folha.
//
// 🚨 Cinco coletores gravaram 'Goiás', 'São Paulo', 'Minas Gerais', 'Tocantins', 'Rondônia', 'Piauí', 'Roraima',
//    'Mato Grosso' na coluna `uf` — ~190 mil linhas. Qualquer agrupamento por estado ganha um bucket FANTASMA que
//    não casa com nada. A `vw_folha_municipal_brasil` já ficou imune (só aceita sigla de 2 letras e, fora disso,
//    deriva do IBGE), mas o dado cru continua errado para quem lê a tabela direto — inclusive o contador nacional.
//
// A sigla vem do cod_ibge, que não varia. Onde não houver cod_ibge de 7 dígitos, a linha fica como está: melhor
// um valor esquisito e visível do que um chute.
//
// Uso: node scripts/corrige_uf_folha.mjs            (relatório, não escreve)
//      APLICA=1 node scripts/corrige_uf_folha.mjs   (corrige)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const APLICA = process.env.APLICA === "1";

// ⚠️ dependência declarada: `uf_por_ibge` é criada por fix_view_folha_brasil.mjs. Falhar aqui, alto, é melhor do
//    que redefinir a função num segundo lugar e as duas divergirem depois.
if (!Number((await q(`select count(*) n from pg_proc where proname = 'uf_por_ibge'`)).rows[0].n)) {
  console.log("uf_por_ibge não existe no banco — rode antes: node scripts/fix_view_folha_brasil.mjs");
  process.exit(1);
}

const tabs = (await q(`select table_name t from information_schema.columns
  where table_schema='public' and table_name like 'folha_servidores_%' and column_name='uf'
  group by 1 having bool_or(column_name='uf') order by 1`)).rows.map((r) => r.t);

let total = 0, tocadas = 0;
for (const t of tabs) {
  const tem = (await q(`select count(*) n from information_schema.columns
    where table_name=$1 and column_name='cod_ibge'`, [t])).rows[0];
  if (!Number(tem.n)) continue;
  const r = (await q(`select uf, count(*) n from ${t}
     where uf is not null and btrim(uf) !~ '^[A-Za-z]{2}$' group by 1 order by 2 desc`)).rows;
  if (!r.length) continue;
  tocadas++;
  const n = r.reduce((a, x) => a + Number(x.n), 0);
  total += n;
  console.log(`${t.padEnd(34)} ${String(n).padStart(7)} linhas · ${r.map((x) => `"${x.uf}"=${x.n}`).join(" · ").slice(0, 110)}`);
  if (APLICA) {
    const u = await q(`update ${t} set uf = uf_por_ibge(cod_ibge)
      where uf is not null and btrim(uf) !~ '^[A-Za-z]{2}$'
        and cod_ibge is not null and length(btrim(cod_ibge)) = 7 and uf_por_ibge(cod_ibge) is not null`);
    console.log(`  ✔ ${u.rowCount} corrigidas`);
  }
}
console.log(`\n${tocadas} tabelas · ${total.toLocaleString("pt-BR")} linhas com UF por extenso${APLICA ? " (corrigidas)" : " — rode com APLICA=1"}`);
await db.end();
