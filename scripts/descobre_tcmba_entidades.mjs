// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_tcmba_entidades.mjs — catálogo de MUNICÍPIOS × ENTIDADES do TCM-BA.
//
// POR QUÊ: o TCM-BA é o único lugar onde os 417 municípios da Bahia existem juntos com folha NOMINAL e SALÁRIO.
// A consulta é por (entidade, ano, mês) — então o catálogo de entidades É a fila de coleta.
// `/municipios` e `/entidades` são endpoints abertos; só exigem o cabeçalho Origin do próprio site.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool();
const q = withRetry(db);
const H = {
  origin: "https://www.tcm.ba.gov.br",
  referer: "https://www.tcm.ba.gov.br/controle-social/pessoal/",
  "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)",
};
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

await q(`create table if not exists tcmba_entidade (
  cod_ibge text, cd_entidade text, ds_entidade text, municipio text, populacao int,
  em timestamptz default now(), primary key (cod_ibge, cd_entidade))`);

const muns = await (await fetch("https://webservice.tcm.ba.gov.br/municipios", { headers: H })).json();
console.log(`[tcmba] ${muns.length} municípios no catálogo do tribunal`);

let total = 0, semEnt = 0;
for (let i = 0; i < muns.length; i++) {
  const m = muns[i];
  const cod = String(m.cdMunicipio).trim();
  let ents = [];
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(`https://webservice.tcm.ba.gov.br/entidades?cdMunicipio=${encodeURIComponent(m.cdMunicipio)}`, { headers: H });
      ents = await r.json(); break;
    } catch { await dorme(1500 * (t + 1)); }
  }
  if (!ents?.length) { semEnt++; continue; }
  for (const e of ents) {
    await q(`insert into tcmba_entidade (cod_ibge,cd_entidade,ds_entidade,municipio,populacao)
             values ($1,$2,$3,$4,$5) on conflict (cod_ibge,cd_entidade) do update
             set ds_entidade=excluded.ds_entidade, municipio=excluded.municipio, populacao=excluded.populacao`,
      [cod, String(e.cdEntidade).trim(), String(e.dsEntidade).trim(), String(m.nmMunicipio).trim(), Number(m.populacao) || null]);
  }
  total += ents.length;
  if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${muns.length} · ${total} entidades`);
  await dorme(120);
}
console.log(`\n[tcmba] ${total} entidades em ${muns.length - semEnt} municípios (${semEnt} sem entidade)`);
console.table((await q(`select count(distinct cod_ibge)::int municipios, count(*)::int entidades from tcmba_entidade`)).rows);
console.log("\nTipos de entidade (amostra do que a fila terá):");
console.table((await q(`select case
    when ds_entidade ilike 'Prefeitura%' then 'Prefeitura'
    when ds_entidade ilike 'C_mara%'     then 'Câmara'
    when ds_entidade ilike '%Previd%' or ds_entidade ilike '%IPREV%' or ds_entidade ilike '%Instituto%Prev%' then 'Previdência'
    when ds_entidade ilike 'Fund%'       then 'Fundação/Fundo'
    else 'Outras' end tipo, count(*)::int n
  from tcmba_entidade group by 1 order by 2 desc`)).rows);
await db.end();
