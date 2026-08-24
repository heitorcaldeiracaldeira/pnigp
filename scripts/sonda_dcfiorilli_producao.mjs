// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// sonda_dcfiorilli_producao.mjs — acha o host de PRODUÇÃO dos municípios que ficaram apontados para o ambiente
// de TREINAMENTO da Fiorilli (`{uf}contreina{N}.dcfiorilli.com.br`).
//
// 🚨 34 municípios (28 PI, 6 MA) foram mapeados para `picontreina*/macontreina*`. Eles SÃO clientes Fiorilli — o
// host de treino só existe porque a implantação existe — mas o dado ali é falso ([[pnigp-sonda-soft404-falso-positivo]]).
// O host de produção segue outro padrão, o mesmo de `colinasp.dcfiorilli.com.br` (Colina/SP): {slug}{uf}.
//
// Uso: node scripts/sonda_dcfiorilli_producao.mjs        (APLICAR=1 grava em fiorilli_portal)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const APLICAR = process.env.APLICAR === "1";
const CONC = Number(process.env.CONC || 6);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" };
const PORTAS = (process.env.PORTAS || "879,8079,5656").split(",");
const eSCPI = (t) => /SCPI\s*9\.0|ProcessaDados|frmPaginaAspx/i.test(t);
const sem = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const alvos = (await q(`select cod_ibge, municipio, uf, host from folha_scpi_coleta
  where situacao='ambiente_treinamento' order by uf, municipio`)).rows;
console.log(`[dcfiorilli-prod] ${alvos.length} municípios presos no ambiente de treino`);

const variantes = (nome, uf) => {
  const sg = uf.startsWith("Pia") ? "pi" : uf.startsWith("Maran") ? "ma" : sem(uf).slice(0, 2);
  const cheio = sem(nome);                                  // alagoinhadopiaui
  const curto = sem(nome.replace(/\s+d[oae]s?\s+.*$/i, "")); // alagoinha
  return [...new Set([`${cheio}${sg}`, `${curto}${sg}`, `pm${curto}${sg}`, cheio, curto])]
    .map((s) => `${s}.dcfiorilli.com.br`);
};

let ok = 0;
for (let k = 0; k < alvos.length; k += CONC) {
  await Promise.all(alvos.slice(k, k + CONC).map(async (a) => {
    for (const host of variantes(a.municipio, a.uf)) {
      for (const porta of PORTAS) {
        const url = `https://${host}:${porta}/transparencia/`;
        try {
          const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(12000) });
          if (!r.ok) continue;
          const t = await r.text();
          if (!eSCPI(t)) continue;
          // exigir que a instância NOMEIE o município — o dcfiorilli tem wildcard de DNS e um host errado
          // responde a página de outro cliente ([[pnigp-entidade-espelho-infla-folha]])
          const nomeia = new RegExp(sem(a.municipio).slice(0, 9), "i").test(sem(t));
          ok += nomeia ? 1 : 0;
          console.log(`${nomeia ? "⭐" : "⚠️ "} ${a.municipio.padEnd(26)}/${a.uf.slice(0, 2)} → ${url}${nomeia ? "" : "  (NÃO nomeia o município — descartado)"}`);
          if (nomeia && APLICAR) {
            await q(`insert into fiorilli_portal (cod_ibge, municipio, uf, base_url, detalhe, em)
              values ($1,$2,$3,$4,'produção dcfiorilli achada por variante de slug (saiu do ambiente de treino)',now())
              on conflict (cod_ibge) do update set base_url=excluded.base_url, detalhe=excluded.detalhe, em=now()`,
              [a.cod_ibge, a.municipio, a.uf, url]);
          }
          if (nomeia) return;
        } catch { /* host/porta inexistente */ }
      }
    }
  }));
}
console.log(`\n[dcfiorilli-prod] ${ok}/${alvos.length} com host de produção confirmado${APLICAR ? " (gravado)" : " (simulação)"}`);
await db.end();
