// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_betha_portais.mjs — o DIRETÓRIO nacional de portais Betha: quantos municípios, em que estados.
//
// Responde à pergunta "quantos municípios conseguimos o dado" pelo lado da Betha. Atenção ao denominador: a
// listagem é de PORTAIS, não de municípios — o mesmo município aparece como prefeitura, câmara, fundo municipal,
// autarquia, consórcio. Quem conta município é `codigoIbge` distinto ([[pnigp-atas-extracao-estudo]]).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
import { paginar } from "./_betha.mjs";

const db = pool();
const q = withRetry(db);

await q(`create table if not exists betha_portal (
  id           int primary key,
  nome         text,
  municipio    text,
  uf           text,
  cod_ibge     text,
  hash         text,        -- identificador do portal na URL (#/{hash}) e chave de qualquer consulta
  entidades    jsonb,
  _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_betha_portal_uf on betha_portal (uf)`);
await q(`create index if not exists ix_betha_portal_ibge on betha_portal (cod_ibge)`);

console.log("lendo o diretório nacional de portais…");
const portais = await paginar("/auth/portais", {
  limit: 100,
  aoProgredir: (n, t) => process.stdout.write(`   ${n}/${t}\r`),
});
console.log(`\n${portais.length} portais`);

for (let i = 0; i < portais.length; i += 500) {
  const p = portais.slice(i, i + 500);
  await q(`insert into betha_portal (id,nome,municipio,uf,cod_ibge,hash,entidades)
    select * from unnest($1::int[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::jsonb[])
    on conflict (id) do update set nome=excluded.nome, municipio=excluded.municipio, uf=excluded.uf,
      cod_ibge=excluded.cod_ibge, hash=excluded.hash, entidades=excluded.entidades, _coletado_em=now()`,
    [p.map((x) => x.id), p.map((x) => x.nome), p.map((x) => x.municipio), p.map((x) => x.uf),
     p.map((x) => (x.codigoIbge ? String(x.codigoIbge) : null)), p.map((x) => x.hash),
     p.map((x) => JSON.stringify(x.portalEntidades || []))]);
}

console.log("\n═══ portais × MUNICÍPIOS distintos, por UF ═══");
console.table((await q(`
  select uf, count(*) portais, count(distinct cod_ibge) municipios,
         round(count(*)::numeric / nullif(count(distinct cod_ibge),0), 1) portais_por_municipio
    from betha_portal group by 1 order by 3 desc`)).rows);

console.log("═══ total ═══");
console.table((await q(`select count(*) portais, count(distinct cod_ibge) municipios, count(distinct uf) ufs
  from betha_portal`)).rows);

// quanto isso representa do país e de cada estado
console.log("═══ cobertura sobre o total de municípios do estado ═══");
console.table((await q(`
  with b as (select uf, count(distinct cod_ibge) n from betha_portal group by 1),
       t as (select uf, count(*) n from municipios_br group by 1)
  select t.uf, t.n municipios_uf, coalesce(b.n,0) com_betha,
         round(100.0*coalesce(b.n,0)/t.n,1) pct
    from t left join b on b.uf=t.uf where coalesce(b.n,0) > 0 order by 4 desc`)).rows);

await db.end();
