// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// enumera_scpi_catalogo.mjs — ENUMERA os catálogos de revenda da Fiorilli por slug de município, em vez de
// depender do link estar no site institucional.
//
// 🚨 POR QUE ENUMERAR: a varredura por link só acha quem LINKA. Em PI/MA a maioria dos sites é o CMS
// `administracaopublica.com.br` e não linka o portal da folha — 283 sites renderam 3 alvos no aossoftware.
// Mas os hosts de revenda expõem um CAMINHO PREVISÍVEL por município (`/pm{slug}/`), o que os torna um
// CATÁLOGO ENUMERÁVEL — mesma natureza do ELMAR/PublicSoft ([[pnigp-elmar-catalogo-ctx-enumeravel]]).
//
// Hosts conhecidos: transparencia.aossoftware.com.br (PMAVELINOLOPES, pmipirangadopi)
//                   transparencia.adtrcloud.com.br  (pmmagalhaesdealmeida)
//
// A prova exigida continua sendo a mesma: assinatura do SCPI **e** o município NOMEADO na página.
//
// Uso: UFS="Piauí,Maranhão" APLICAR=1 node scripts/enumera_scpi_catalogo.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UFS = (process.env.UFS || "Piauí,Maranhão").split(",");
const APLICAR = process.env.APLICAR === "1";
const CONC = Number(process.env.CONC || 10);
const HOSTS = (process.env.HOSTS || "transparencia.aossoftware.com.br,transparencia.adtrcloud.com.br").split(",");
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" };

const eSCPI = (t) => /SCPI\s*9\.0|ProcessaDados\(|frmPaginaAspx/i.test(t);
const sem = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// variações de slug que os dois catálogos usam: pm+nome cheio, pm+nome sem o sufixo de ESTADO, pm+nome+uf
//
// 🚨 SÓ PODAR SUFIXO DE ESTADO. Podar qualquer "do/dos/da/das …" transformava "São Pedro dos Crentes"/MA em
// `pmsaopedro` — o mesmo slug de "São Pedro do Piauí". Os dois casaram com a MESMA página, que declara apenas
// "PREFEITURA MUNICIPAL DE SÃO PEDRO". Sufixo que distingue município não é ruído
// ([[pnigp-homonimo-uf-guarda-de-contaminacao]]).
const SUFIXO_UF = /\s+d[oae]s?\s+(piaui|piauí|maranhao|maranhão|goias|goiás|minas|sul|norte)\s*$/i;
const slugs = (nome, uf) => {
  const sg = uf.startsWith("Pia") ? "pi" : uf.startsWith("Maran") ? "ma" : sem(uf).slice(0, 2);
  const cheio = sem(nome);
  const curto = sem(nome.replace(SUFIXO_UF, ""));
  return [...new Set([`pm${cheio}`, `pm${curto}`, `pm${curto}${sg}`, `pm${cheio}${sg}`, cheio, curto])];
};

const alvos = (await q(`select cod_ibge, municipio, uf from radar_portal
  where erp is null and unidade_gestora ilike 'Prefeitura%' and uf = any($1::text[])
  order by municipio`, [UFS])).rows;
console.log(`[catálogo] ${alvos.length} municípios × ${HOSTS.length} hosts\n`);

let ok = 0, i = 0;
for (let k = 0; k < alvos.length; k += CONC) {
  await Promise.all(alvos.slice(k, k + CONC).map(async (a) => {
    const chave = sem(a.municipio).slice(0, 9);
    for (const host of HOSTS) {
      for (const s of slugs(a.municipio, a.uf)) {
        const url = `https://${host}/${s}/`;
        try {
          const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(12000) });
          if (!r.ok) continue;
          const t = await r.text();
          if (!eSCPI(t) || !new RegExp(chave, "i").test(sem(t))) continue;
          ok++;
          console.log(`⭐ ${a.municipio.padEnd(26)}/${a.uf.slice(0, 2)} → ${url}`);
          if (APLICAR) {
            await q(`insert into fiorilli_portal (cod_ibge, municipio, uf, base_url, detalhe, em)
              values ($1,$2,$3,$4,'SCPI por enumeração de catálogo de revenda Fiorilli — município nomeado na página',now())
              on conflict (cod_ibge) do update set base_url=excluded.base_url, detalhe=excluded.detalhe, em=now()`,
              [a.cod_ibge, a.municipio, a.uf, url]);
          }
          return;
        } catch { /* slug inexistente */ }
      }
    }
  }));
  i += Math.min(CONC, alvos.length - k);
  process.stdout.write(`   ${i}/${alvos.length} · ${ok} achados\r`);
}
console.log(`\n[catálogo] ${ok} municípios achados por enumeração${APLICAR ? " (gravado)" : " (simulação)"}`);
await db.end();
