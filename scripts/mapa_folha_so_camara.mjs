// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// mapa_folha_so_camara.mjs — os municípios que contam como "prefeitura com folha" e cuja ÚNICA folha que temos
// é a da CÂMARA.
//
// POR QUÊ: o veto por poder (`_folha_filtros.mjs`) tira da manchete do executivo quem tem o RÓTULO de câmara na
// entidade. Não alcança quem só tem a câmara como FONTE — o coletor foi apontado para o portal da câmara e o
// rótulo não denuncia. Esses municípios entram na manchete nacional dizendo que a PREFEITURA publica folha
// quando ela não publica ([[pnigp-31-municipios-so-tem-folha-da-camara]]).
//
// ⚖️ 22/ago/2026 o Heitor decidiu TIRÁ-LOS da manchete do executivo — a manchete passa a medir "o município
//    publica a folha do EXECUTIVO", que é a leitura que mantém válida a comparação com a RAIS do executivo.
//
// A RÉGUA (cruza as duas camadas, não confia em rótulo):
//   um município entra se TODAS as suas linhas nominais do EXECUTIVO também estão na camada da CÂMARA
//   (mesma fonte, mesma competência, mesma pessoa). Se sobra uma linha que a câmara não reivindica, ele fica.
//
// 🚨 A régua SÓ vale com a view da câmara limpa. Rodada em 22/ago sobre a view antiga deu 62 municípios, e ~20
//    deles eram falso positivo da evidência ([[pnigp-ente-manda-sobre-setor]]) — Naque entrava porque 487
//    servidores da PREFEITURA estavam na camada da câmara. Reconstruir a view ANTES de reconstruir esta tabela.
//
// ✅ CONFERIDO contra a RAIS por natureza jurídica: os 61 têm de 1% a 5% do efetivo que a RAIS declara para a
//    prefeitura e batem com o que ela declara para o legislativo (Araraquara 173 pessoas: 122% da RAIS da
//    câmara, 2% da RAIS da prefeitura). É a prova de que é câmara, e não subcoleta do executivo.
//
// Uso: node scripts/mapa_folha_so_camara.mjs          (só relata)
//      APLICAR=1 node scripts/mapa_folha_so_camara.mjs   (grava aux_mun_so_camara)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const APLICAR = process.env.APLICAR === "1";

const r = await q(`
 with e as (select cod_ibge, uf, municipio, fonte, competencia, nome
              from vw_folha_municipal_brasil
             where cod_ibge is not null and fonte <> 'rais' and nome is not null and nome <> ''),
      c as (select cod_ibge, fonte, competencia, nome from vw_folha_camara_brasil
             where cod_ibge is not null and nome is not null and nome <> ''),
      j as (select e.cod_ibge, max(e.uf) uf, max(e.municipio) municipio,
                   count(*)::int linhas, count(*) filter (where c.nome is not null)::int cam,
                   count(distinct e.nome)::int pessoas, string_agg(distinct e.fonte, ',') fontes
              from e left join c on c.cod_ibge = e.cod_ibge and c.fonte = e.fonte
                                and c.competencia = e.competencia and c.nome = e.nome
             group by e.cod_ibge),
      leg as (select lpad(cod_ibge6,6,'0') k, count(*) filter (where ativo_3112)::int n
                from folha_rais_municipal where ano = (select max(ano) from folha_rais_municipal)
                 and natureza_cod = '1066' group by 1),
      exe as (select lpad(cod_ibge6,6,'0') k, count(*) filter (where ativo_3112)::int n
                from folha_rais_municipal where ano = (select max(ano) from folha_rais_municipal)
                 and natureza_cod <> '1066' group by 1)
 select j.cod_ibge, j.uf, j.municipio, j.pessoas, j.fontes,
        coalesce(leg.n,0) rais_camara, coalesce(exe.n,0) rais_prefeitura,
        case when coalesce(exe.n,0) > 0 then round(100.0*j.pessoas/exe.n)::int end pct_da_prefeitura
   from j left join leg on leg.k = left(j.cod_ibge,6)
          left join exe on exe.k = left(j.cod_ibge,6)
  where j.cam = j.linhas order by j.uf, j.municipio`);

const porUf = {};
for (const x of r.rows) porUf[x.uf] = (porUf[x.uf] || 0) + 1;
console.log(`${r.rowCount} municípios cuja ÚNICA folha é a da CÂMARA`);
console.log("por UF:", Object.entries(porUf).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · "));

// 🚨 quem tem MUITA gente para o porte da prefeitura não é câmara — seria subcoleta do executivo mal
//    classificada. Nenhum caso em 23/ago, mas a guarda fica: acusar em vez de tirar da manchete por engano.
const duvidosos = r.rows.filter((x) => x.pct_da_prefeitura != null && x.pct_da_prefeitura > 30);
if (duvidosos.length) {
  console.log(`\n🚨 ${duvidosos.length} com mais de 30% do efetivo da prefeitura — CONFERIR antes de tirar:`);
  console.table(duvidosos);
}
console.table(r.rows.slice(0, 20));

if (!APLICAR) { console.log("\n(só relatório — APLICAR=1 grava aux_mun_so_camara)"); await db.end(); process.exit(0); }
await q(`create table if not exists aux_mun_so_camara (
  cod_ibge text primary key, uf text, municipio text, pessoas int, fontes text,
  rais_camara int, rais_prefeitura int, pct_da_prefeitura int, em timestamptz default now())`);
await q(`begin`);
await q(`delete from aux_mun_so_camara`);
for (const x of r.rows) {
  await q(`insert into aux_mun_so_camara (cod_ibge,uf,municipio,pessoas,fontes,rais_camara,rais_prefeitura,pct_da_prefeitura)
           values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (cod_ibge) do nothing`,
    [x.cod_ibge, x.uf, x.municipio, x.pessoas, x.fontes, x.rais_camara, x.rais_prefeitura, x.pct_da_prefeitura]);
}
await q(`commit`);
console.log(`\n✅ aux_mun_so_camara: ${r.rowCount} municípios gravados`);
await db.end();
