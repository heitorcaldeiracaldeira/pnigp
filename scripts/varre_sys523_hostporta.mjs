// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// varre_sys523_hostporta.mjs — procura a TELA DE FOLHA do sys523/CECAM nos municípios sem folha, combinando
// prefixos de host e PORTAS ALTAS. O produto vive on-premise no domínio do próprio município e a porta varia
// muito: 8080, 8089, 8181, 8282, 8443 ([[pnigp-varredura-host-porta-onpremise]]).
//
// ⭐ A prova é a TELA CERTA, não o produto: `remuneracao.xhtml` com cabeçalho de servidor. Outras telas do mesmo
// portal (licitacoes.xhtml) também trazem `ui-datatable-data` e enganam quem só testa "tem dataTable"
// ([[pnigp-tela-certa-nao-e-so-ter-tabela]]).
//
// Uso: UF=RS node scripts/varre_sys523_hostporta.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "RS";
const CONC = Number(process.env.CONC || 6);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36" };
const so = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const PORTAS = [8181, 8089, 8282, 8080, 8443, 8081, 9090];
const PREFIXOS = ["sistema", "portal", "transparencia", "sistemas", "www"];

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const c = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (c) partes.push(`select distinct left(cod_ibge::text,6) i from ${t} where cod_ibge is not null`);
}
const muns = (await q(`select cod_ibge, nome, uf from municipios_br
  where uf=$1 and left(cod_ibge,6) not in (${partes.join(" union ")}) order by nome`, [UF])).rows;
console.log(`[sys523-host] ${muns.length} municípios ${UF} sem folha · ${PREFIXOS.length}×${PORTAS.length} combinações`);

async function prova(url) {
  try {
    const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const t = await r.text();
    if (!/ui-datatable-data/.test(t)) return null;
    if (!/nome do servidor|proventos|remunera/i.test(t)) return null;
    const tot = (t.match(/Registros:\s*[\d.]+\s*-\s*[\d.]+\s*\/\s*([\d.]+)/) || [])[1] || "?";
    const lic = (t.match(/Licenciado para:\s*([^<\n]{5,60})/i) || [])[1] || "";
    return { total: tot, licenciado: lic.trim() };
  } catch { return null; }
}

let achados = 0, i = 0;
for (let k = 0; k < muns.length; k += CONC) {
  await Promise.all(muns.slice(k, k + CONC).map(async (m) => {
    const s = so(m.nome);
    for (const pre of PREFIXOS) {
      for (const porta of PORTAS) {
        const url = `https://${pre}.${s}.rs.gov.br:${porta}/sys523/publico/remuneracao.xhtml`;
        const p = await prova(url);
        if (!p) continue;
        // 🚨 o "Licenciado para" diz de QUEM é o portal — barra host de vizinho
        if (p.licenciado && !so(p.licenciado).includes(s)) {
          console.log(`   ✖ ${m.nome} → ${url} licenciado para "${p.licenciado}" — ignorado`);
          continue;
        }
        achados++;
        console.log(`⭐ ${m.nome.padEnd(24)} → ${pre}.${s}.rs.gov.br:${porta}  (${p.total} registros · ${p.licenciado})`);
        await q(`insert into folha_portal_candidato (cod_ibge, municipio, uf, produto, url, achado_via)
          values ($1,$2,$3,'sys523',$4,'varredura host x porta')
          on conflict (cod_ibge, url) do update set produto='sys523', achado_em=now()`,
          [m.cod_ibge, m.nome, m.uf, url]);
        return;
      }
    }
  }));
  i += Math.min(CONC, muns.length - k);
  process.stdout.write(`   ${i}/${muns.length} · ${achados} achados\r`);
}
console.log(`\n[sys523-host] ${achados} telas de folha achadas`);
await db.end();
