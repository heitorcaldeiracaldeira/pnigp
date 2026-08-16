// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// varre_scpi_hospedado.mjs — acha o SCPI (Fiorilli) hospedado em domínio de terceiro nos municípios sem folha.
//
// ⭐ POR QUE existe: o portal de Xangri-lá abre com título "SCPI 9.0 - Transparência" e rodapé "Fiorilli", mas
// mora em `xangrila.msgestaopublica.app.br` — o diagnóstico rotulou o produto como "?" e o coletor SCPI, que já
// existia, nunca foi apontado para lá ([[pnigp-plataforma-rotulo-vs-sistema]]).
// 🚨 O domínio MIGROU: os endereços gravados em `.msgestaopublica.com.br:8079` já não resolvem; o vivo é
// `.msgestaopublica.app.br` sem porta. Um host que morreu não quer dizer produto ausente.
//
// Prova de vida: a home do /transparencia/ traz "SCPI" no <title> ou "Fiorilli" no rodapé.
// Uso: UF=RS node scripts/varre_scpi_hospedado.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "RS";
const CONC = Number(process.env.CONC || 8);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36" };
const so = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

await q(`create table if not exists portal_produto (
  cod_ibge text, municipio text, uf text, produto text, url text, achado_em timestamptz default now(),
  primary key (cod_ibge, produto)
)`);
// a tabela já existia de outra rodada, com colunas diferentes — completar sem quebrar o que há
for (const c of ["municipio text", "uf text", "url text", "achado_em timestamptz default now()"]) {
  await q(`alter table portal_produto add column if not exists ${c}`);
}

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const c = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (c) partes.push(`select distinct left(cod_ibge::text,6) i from ${t} where cod_ibge is not null`);
}
const muns = (await q(`select cod_ibge, nome, uf from municipios_br
  where uf=$1 and left(cod_ibge,6) not in (${partes.join(" union ")}) order by nome`, [UF])).rows;
console.log(`[scpi-host] ${muns.length} municípios ${UF} sem folha`);

const MOLDES = [
  (s) => `https://${s}.msgestaopublica.app.br/transparencia/`,
  (s) => `https://${s}.msgestaopublica.com.br:8079/transparencia/`,
  (s) => `http://pm${s}.rcmsuporte.com.br:8079/transparencia/`,
  (s) => `https://transparencia.${s}.rs.gov.br:8079/transparencia/`,
];
async function prova(url) {
  try {
    const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    let t = buf.toString("utf8");
    if (t.includes("�")) t = buf.toString("latin1");
    if (!/SCPI|Fiorilli/i.test(t)) return null;
    const nome = (t.match(/PREFEITURA MUNICIPAL DE ([^<\n]{3,50})/i) || [])[1] || "";
    return { nome: nome.trim(), versao: (t.match(/SCPI\s*[\d.]+/i) || [])[0] || "SCPI" };
  } catch { return null; }
}

let achados = 0, i = 0;
for (let k = 0; k < muns.length; k += CONC) {
  await Promise.all(muns.slice(k, k + CONC).map(async (m) => {
    const s = so(m.nome);
    for (const molde of MOLDES) {
      const url = molde(s);
      const p = await prova(url);
      if (!p) continue;
      // 🚨 confere o nome declarado — o host pode ser de outro município ([[pnigp-homonimo-uf-guarda-de-contaminacao]])
      if (p.nome && !so(p.nome).includes(s) && !s.includes(so(p.nome))) {
        console.log(`   ✖ ${m.nome} → ${url} declara "${p.nome}" — ignorado`);
        continue;
      }
      achados++;
      console.log(`⭐ ${m.nome.padEnd(26)} → ${url}  (${p.versao})`);
      // a tabela veio de outra rodada e não tem chave única — apagar e inserir em vez de ON CONFLICT
      await q(`delete from portal_produto where cod_ibge=$1 and produto='scpi'`, [m.cod_ibge]);
      await q(`insert into portal_produto (cod_ibge, municipio, uf, produto, url, achado_em)
        values ($1,$2,$3,'scpi',$4,now())`, [m.cod_ibge, m.nome, m.uf, url]);
      return;
    }
  }));
  i += Math.min(CONC, muns.length - k);
  process.stdout.write(`   ${i}/${muns.length} · ${achados} achados\r`);
}
console.log(`\n[scpi-host] ${achados} portais SCPI achados`);
await db.end();
