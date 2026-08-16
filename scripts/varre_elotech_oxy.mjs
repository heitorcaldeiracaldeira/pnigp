// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// varre_elotech_oxy.mjs — procura o portal Elotech nos municípios ainda sem folha, nas DUAS gerações de host:
//   `{slug}.oxy.elotech.com.br`  (novo, achado em Bento Gonçalves/RS)
//   `{slug}.eloweb.net`          (clássico, que o Radar já mapeia no PR)
// A API é a mesma nos dois — `/portaltransparencia-api/api/entidades` responde JSON sem sessão e serve de prova
// de vida. Ver [[pnigp-cr2-elotech-folha-norte-parana]] e o coletor `ingest_folha_elotech.mjs`.
//
// Uso: UF=RS node scripts/varre_elotech_oxy.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "RS";
const CONC = Number(process.env.CONC || 10);
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)", accept: "application/json" };
const so = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

await q(`create table if not exists elotech_portal (
  cod_ibge text primary key, municipio text, uf text, slug text, host text, entidades int,
  achado_em timestamptz default now()
)`);

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const c = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (c) partes.push(`select distinct left(cod_ibge::text,6) i from ${t} where cod_ibge is not null`);
}
const muns = (await q(`select cod_ibge, nome, uf from municipios_br
  where uf=$1 and left(cod_ibge,6) not in (${partes.join(" union ")}) order by nome`, [UF])).rows;
console.log(`[elotech] ${muns.length} municípios ${UF} sem folha`);

async function prova(host) {
  try {
    const r = await fetch(`https://${host}/portaltransparencia-api/api/entidades`,
      { headers: UA, signal: AbortSignal.timeout(12000) });
    if (!r.ok) return null;
    const j = await r.json();
    const arr = Array.isArray(j) ? j : (j.content || []);
    return arr.length ? arr : null;
  } catch { return null; }
}

let achados = 0, i = 0;
for (let k = 0; k < muns.length; k += CONC) {
  await Promise.all(muns.slice(k, k + CONC).map(async (m) => {
    const s = so(m.nome);
    for (const host of [`${s}.oxy.elotech.com.br`, `${s}.eloweb.net`]) {
      const ents = await prova(host);
      if (!ents) continue;
      // 🚨 CONFERIR A UF, NÃO SÓ O NOME: `sarandi.oxy.elotech.com.br` e `cruzeirodosul.eloweb.net` respondem —
      // e são de SARANDI/PR e CRUZEIRO DO SUL/PR, homônimos dos do RS. Só o nome deixaria entrar a folha de
      // outro estado inteiro no lugar da certa. O JSON de /entidades traz `cidade` e `uf`; exigir os dois.
      const cidade = so(ents[0]?.cidade || ents[0]?.nome || "");
      const ufPortal = String(ents[0]?.uf || "").trim().toUpperCase();
      if (ufPortal && ufPortal !== m.uf) {
        console.log(`   ✖ ${m.nome} → ${host} é de ${ents[0]?.cidade}/${ufPortal}, não ${m.uf} — homônimo, ignorado`);
        continue;
      }
      if (cidade && !cidade.includes(s) && !s.includes(cidade)) {
        console.log(`   ✖ ${m.nome} → ${host} responde, mas é de "${ents[0]?.cidade || ents[0]?.nome}" — ignorado`);
        continue;
      }
      achados++;
      console.log(`⭐ ${m.nome.padEnd(28)} → ${host}  (${ents.length} entidades)`);
      await q(`insert into elotech_portal (cod_ibge, municipio, uf, slug, host, entidades)
        values ($1,$2,$3,$4,$5,$6) on conflict (cod_ibge) do update set host=excluded.host,
        entidades=excluded.entidades, achado_em=now()`, [m.cod_ibge, m.nome, m.uf, s, host, ents.length]);
      return;
    }
  }));
  i += Math.min(CONC, muns.length - k);
  process.stdout.write(`   ${i}/${muns.length} · ${achados} achados\r`);
}
console.log(`\n[elotech] ${achados} portais achados`);
await db.end();
