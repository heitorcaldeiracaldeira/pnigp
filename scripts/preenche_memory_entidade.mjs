// A entidade do iLAI já vem embutida na URL descoberta: ilai.memory.com.br/#/entidades/login/97MJGH/1/
// ou #/97R635/1/share?resource=... — extrair daí evita uma segunda varredura de 75 sites.
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool();
const q = withRetry(db);
const linhas = (await q(`select cod_ibge, municipio, uf, url_portal_real from portal_real_descoberto
  where url_portal_real ilike '%memory.com.br%'`)).rows;
// 🚨 são TRÊS formatos de URL para o mesmo identificador de entidade — extrair só o primeiro deixava 25 de fora:
//   ilai.memory.com.br/#/entidades/login/9DY8SD/1/        (SPA)
//   sistemaweb.memory.com.br:81/issqn/.../?municipio=98P80D
//   lai.memory.com.br/esic/999RZ1
const PADROES = [
  /#\/(?:entidades\/login\/)?([0-9A-Z]{5,8})\/\d/,
  /[?&]municipio=([0-9A-Z]{5,8})\b/i,
  /\/esic\/([0-9A-Z]{5,8})\b/i,
];
let n = 0;
for (const x of linhas) {
  let ent = null;
  for (const re of PADROES) { const m = x.url_portal_real.match(re); if (m) { ent = m[1]; break; } }
  if (!ent) continue;
  await q(`insert into memory_entidade (cod_ibge, entidade) values ($1,$2)
    on conflict (cod_ibge) do update set entidade=coalesce(memory_entidade.entidade, excluded.entidade)`,
    [x.cod_ibge, ent]);
  n++;
}
console.log(`entidades preenchidas: ${n} de ${linhas.length} URLs memory`);
console.log("total com entidade:", (await q(`select count(*) filter (where entidade is not null)::int c from memory_entidade`)).rows[0].c);
await db.end();
