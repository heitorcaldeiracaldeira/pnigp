// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_erp_municipal.mjs — qual ERP cada município usa, medido pelo portal que responde.
//
// Varre as receitas de _erp_receitas.mjs contra os 5.570 municípios e grava em `erp_portal_municipal`.
// É o levantamento que o Heitor pediu ("os ERPs que os municípios mais usam por estado") e, ao mesmo tempo, a
// lista de alvos de cada coletor de folha.
//
// ⚠️ Um município pode ter MAIS DE UM ERP (contabilidade num, folha noutro) — a chave é (cod_ibge, erp), então
// isso é registrado, não escondido. E o portal responder não garante que ele publique folha: quem prova isso é
// o coletor, marcando em folha_<erp>_coleta.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
import { RECEITAS, testa } from "./_erp_receitas.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;
const ERPS = (process.env.ERPS || "").split(",").map((s) => s.trim()).filter(Boolean);
const CONC = Number(process.env.CONC || 16);

await q(`create table if not exists erp_portal_municipal (
  cod_ibge text, erp text, slug text, url text, titulo text,
  achado_em timestamptz default now(), primary key (cod_ibge, erp)
)`);
await q(`create table if not exists erp_varredura (
  cod_ibge text, erp text, testado_em timestamptz default now(), achou boolean,
  primary key (cod_ibge, erp)
)`);

const receitas = RECEITAS.filter((r) => !ERPS.length || ERPS.includes(r.erp));
const muns = (await q(`select cod_ibge, nome, uf from municipios_br ${UF ? "where uf = $1" : ""}
  order by uf, nome`, UF ? [UF] : [])).rows;
console.log(`[erp] ${muns.length} municípios × ${receitas.length} receitas: ${receitas.map((r) => r.erp).join(", ")}`);

for (const receita of receitas) {
  // já testados ficam registrados mesmo quando não acham — senão a varredura repete o negativo a cada rodada
  const feitos = new Set((await q(`select cod_ibge from erp_varredura where erp=$1`, [receita.erp])).rows.map((r) => r.cod_ibge));
  const fila = muns.filter((m) => !feitos.has(m.cod_ibge));
  console.log(`\n[${receita.erp}] ${fila.length} a testar (${feitos.size} já testados)`);
  let achou = 0, n = 0;

  for (let i = 0; i < fila.length; i += CONC) {
    const bloco = fila.slice(i, i + CONC);
    const res = await Promise.all(bloco.map(async (m) => ({ m, r: await testa(receita, m.nome, m.uf) })));
    n += bloco.length;
    const ok = res.filter((x) => x.r);
    if (ok.length) {
      await q(`insert into erp_portal_municipal (cod_ibge, erp, slug, url)
        select * from unnest($1::text[],$2::text[],$3::text[],$4::text[])
        on conflict (cod_ibge, erp) do update set slug=excluded.slug, url=excluded.url, achado_em=now()`,
        [ok.map((x) => x.m.cod_ibge), ok.map(() => receita.erp), ok.map((x) => x.r.slug), ok.map((x) => x.r.url)]);
      achou += ok.length;
    }
    await q(`insert into erp_varredura (cod_ibge, erp, achou)
      select * from unnest($1::text[],$2::text[],$3::boolean[])
      on conflict (cod_ibge, erp) do update set testado_em=now(), achou=excluded.achou`,
      [res.map((x) => x.m.cod_ibge), res.map(() => receita.erp), res.map((x) => !!x.r)]);
    if (i % (CONC * 25) === 0) process.stdout.write(`   ${n}/${fila.length} · ${achou} portais\r`);
  }
  console.log(`\n[${receita.erp}] ${achou} portais`);
}

console.log("\n═══ ERP por município, por UF ═══");
console.table((await q(`select p.erp, m.uf, count(*) municipios from erp_portal_municipal p
  join municipios_br m on m.cod_ibge = p.cod_ibge group by 1,2 order by 3 desc limit 25`)).rows);
console.log("═══ total por ERP ═══");
console.table((await q(`select erp, count(*) municipios, count(distinct left(cod_ibge,2)) ufs
  from erp_portal_municipal group by 1 order by 2 desc`)).rows);

await db.end();
