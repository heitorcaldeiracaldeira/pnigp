// procura em AL o mesmo portal próprio de São Sebastião: `transparencia.{slug}.al.gov.br/servidores/folhas/servidores/`
// (PHP + DataTables server-side). Prova = a grade existir com os selects `entidade` e `processamento`.
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool(); const q = withRetry(db);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" };
const so = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const UF = process.env.UF || "AL";
const CONC = Number(process.env.CONC || 8);

const partes = [];
for (const t of (await q(`select table_name t from information_schema.tables
  where table_schema='public' and table_name like 'folha_servidores_%'`)).rows)
  if ((await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t.t])).rowCount)
    partes.push(`select distinct left(cod_ibge::text,6) i from ${t.t} where cod_ibge is not null`);
const muns = (await q(`select cod_ibge, nome from municipios_br
  where uf=$1 and left(cod_ibge,6) not in (${partes.join(" union ")}) order by nome`, [UF])).rows;
console.log(`[folhas/${UF}] ${muns.length} municípios sem folha`);

const testa = async (host) => {
  try {
    const r = await fetch(`http://${host}/servidores/folhas/servidores/`, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const t = await r.text();
    // a grade só conta se tiver os DOIS selects e as colunas da folha
    if (!/id=["']entidade["']/i.test(t) || !/id=["']processamento["']/i.test(t)) return null;
    if (!/matr[íi]cula/i.test(t) || !/l[íi]quido/i.test(t)) return null;
    return (t.match(/<option[^>]*value=["']\d{4}-\d{2}-\d{2}/g) || []).length;
  } catch { return null; }
};

let achados = 0;
for (let k = 0; k < muns.length; k += CONC) {
  await Promise.all(muns.slice(k, k + CONC).map(async (m) => {
    const s = so(m.nome);
    for (const host of [`transparencia.${s}.${UF.toLowerCase()}.gov.br`, `transparencia.pm${s}.${UF.toLowerCase()}.gov.br`]) {
      const n = await testa(host);
      if (n == null) continue;
      achados++;
      console.log(`⭐ ${m.nome.padEnd(28)} → ${host} (${n} competências)`);
      await q(`insert into portal_real_descoberto (cod_ibge, erp_radar, municipio, uf, url_site, url_portal_real, fornecedor, em)
        values ($1,'portal_proprio',$2,$3,null,$4,'portal_folhas_datatables',now())`,
        [m.cod_ibge, m.nome, UF, `http://${host}/servidores/folhas/servidores/`]);
      return;
    }
  }));
  process.stdout.write(`   ${Math.min(k + CONC, muns.length)}/${muns.length} · ${achados} achados\r`);
}
console.log(`\n[folhas/${UF}] ${achados} portais no mesmo padrão de São Sebastião`);
await db.end();
