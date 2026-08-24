// Materializa "quem já tem folha" — a view com 65 fontes é cara demais para servir de filtro em varredura
// (a sondagem de MG ficou minutos parada antes da primeira linha). Rodar antes de sondar uma UF.
//
// 🚨 SEM TEMP TABLE: sobre o pooler do Neon ela não sobrevive entre statements
// ([[pnigp-temp-table-sobre-pool]]) — a primeira versão deste script usou uma e a tabela terminou com
// 8.079 linhas para uma view de 4.045. Reconstrói-se num único comando, dentro de uma transação.
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool();
const q = withRetry(db);
await q(`create table if not exists aux_mun_com_folha (cod_ibge text primary key)`);
await q(`begin`);
await q(`delete from aux_mun_com_folha`);
await q(`insert into aux_mun_com_folha (cod_ibge)
         select distinct cod_ibge from vw_folha_municipal_brasil
          where fonte <> 'rais' and cod_ibge is not null
         on conflict do nothing`);
await q(`commit`);
const r = (await q(`select count(*)::int n, count(*) filter (where length(cod_ibge)<>7)::int fora from aux_mun_com_folha`)).rows[0];
console.log(`aux_mun_com_folha: ${r.n} municípios com folha (${r.fora} com código fora do padrão de 7 dígitos)`);
await db.end();
