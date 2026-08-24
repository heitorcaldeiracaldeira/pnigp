// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// corrige_fila_camara_assembleia.mjs — tira da fila das câmaras o que é ASSEMBLEIA LEGISLATIVA estadual.
//
// 🚨 O radar mapeou `al.ap.leg.br`, `al.se.leg.br`, `al.rr.leg.br`, `al.rn.leg.br` como "portal" das capitais
//    Macapá, Aracaju, Boa Vista e Natal. `al.{uf}.leg.br` é a ASSEMBLEIA do ESTADO — colher de lá gravaria a
//    folha de deputados estaduais dentro de um MUNICÍPIO. É a mesma família do erro que trouxe a folha da
//    câmara para dentro da prefeitura ([[pnigp-entidade-espelho-infla-folha]]), com o sinal trocado.
//    Também sai a Câmara dos Deputados / Senado (`camara.leg.br`, `senado.leg.br`).
//
// Não apaga o município da fila: apaga a URL ERRADA e registra por quê — o alvo continua a ser procurado.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool();
const q = withRetry(db);

const RE_ERRADA = "^https?://(www\\.)?(al|ale|alesc|alerj|almg|alep|alba|alema)\\.[a-z]{2}\\.leg\\.br|" +
                  "^https?://(www\\.)?(camara|senado|congressonacional)\\.leg\\.br";

const antes = (await q(`select cod_ibge, uf, municipio, url_camara from folha_camara_fila
  where url_camara ~* $1 or url_camara_2 ~* $1`, [RE_ERRADA])).rows;
console.table(antes);

await q(`alter table folha_camara_fila add column if not exists url_recusada text`);
const r = await q(`update folha_camara_fila
  set url_recusada = coalesce(url_camara, url_camara_2),
      url_camara = null, url_camara_2 = null, erp_camara = null, url_erp_camara = null,
      erp_via = 'recusada: assembleia legislativa estadual, não é câmara municipal', checado_em = null
  where url_camara ~* $1 or url_camara_2 ~* $1`, [RE_ERRADA]);
console.log(`${r.rowCount} URLs de ASSEMBLEIA removidas da fila das câmaras`);
await db.end();
