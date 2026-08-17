// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// varre_multiproduto.mjs — último mutirão: para cada município sem folha, testa os CAMINHOS de todos os produtos
// que já sabemos coletar, em vários prefixos de host e portas. É a junção de três técnicas que renderam no RS:
// varredura host×porta ([[pnigp-varredura-host-porta-onpremise]]), caminho do módulo certo
// ([[pnigp-modulo-vs-host-fornecedor]]) e prova pela TELA, não pelo produto ([[pnigp-tela-certa-nao-e-so-ter-tabela]]).
//
// Uso: UF=RS node scripts/varre_multiproduto.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "RS";
const CONC = Number(process.env.CONC || 6);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36" };
const so = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// caminho → produto → como provar que é a tela da folha
const SONDAS = [
  { produto: "multi24", cam: "/multi24/sistemas/transparencia/?secao=servidores_salarios", ok: (t) => /servidores_salarios|Remunera/i.test(t) },
  { produto: "sys523", cam: "/sys523/publico/remuneracao.xhtml", ok: (t) => /ui-datatable-data/.test(t) && /nome do servidor|proventos/i.test(t) },
  { produto: "citta", cam: "/transparencia/api/public/pessoal/unidades", ok: (t) => /^\s*\[/.test(t) && t.length > 10 },
  { produto: "dbseller", cam: "/api/folha_pagamentos/getAnos/1", ok: (t) => /^\s*[[{]/.test(t) },
  { produto: "admrh", cam: "/rhsysportaltransp/api/lov/referencia?busca=&page=1", ok: (t) => /"dados"/.test(t) },
  { produto: "tche", cam: "/TransparenciaJavaEnvironment/com.tche.transparencia.wfolha", ok: (t) => /folha/i.test(t) && t.length > 5000 },
  { produto: "scpi", cam: "/transparencia/", ok: (t) => /SCPI|Fiorilli/i.test(t) },
  { produto: "govbr", cam: "/pronimtb/index.asp?acao=10&item=8", ok: (t) => /DW_LC131/.test(t) },
];
const PREFIXOS = ["transparencia", "portal", "sistema", "sistemas", "www", "rh", "grp", "servidor"];
const PORTAS = ["", ":8079", ":8080", ":8181", ":8443", ":8089"];

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const c = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (c) partes.push(`select distinct left(cod_ibge::text,6) i from ${t} where cod_ibge is not null`);
}
// só os que NÃO têm produto identificado — para os outros já há caminho conhecido
const muns = (await q(`select m.cod_ibge, m.nome, m.uf from municipios_br m
  where m.uf=$1 and left(m.cod_ibge,6) not in (${partes.join(" union ")})
    and not exists (select 1 from folha_portal_candidato c where c.cod_ibge = m.cod_ibge)
  order by m.nome`, [UF])).rows;
console.log(`[multi] ${muns.length} municípios sem produto · ${PREFIXOS.length}×${PORTAS.length}×${SONDAS.length} combinações`);

let achados = 0, i = 0;
for (let k = 0; k < muns.length; k += CONC) {
  await Promise.all(muns.slice(k, k + CONC).map(async (m) => {
    const s = so(m.nome);
    for (const pre of PREFIXOS) {
      for (const porta of PORTAS) {
        const base = `https://${pre}.${s}.rs.gov.br${porta}`;
        for (const sonda of SONDAS) {
          try {
            const r = await fetch(base + sonda.cam, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(7000) });
            if (!r.ok) continue;
            const t = await r.text();
            if (!sonda.ok(t)) continue;
            achados++;
            console.log(`⭐ ${m.nome.padEnd(24)} ${sonda.produto.padEnd(9)} ${base}${sonda.cam.slice(0, 40)}`);
            await q(`insert into folha_portal_candidato (cod_ibge, municipio, uf, produto, url, achado_via)
              values ($1,$2,$3,$4,$5,'varredura multiproduto')
              on conflict (cod_ibge, url) do update set produto=excluded.produto, achado_em=now()`,
              [m.cod_ibge, m.nome, m.uf, sonda.produto, base + sonda.cam]);
            return;
          } catch { /* próxima */ }
        }
      }
    }
  }));
  i += Math.min(CONC, muns.length - k);
  process.stdout.write(`   ${i}/${muns.length} · ${achados} achados\r`);
}
console.log(`\n[multi] ${achados} portais achados`);
await db.end();
