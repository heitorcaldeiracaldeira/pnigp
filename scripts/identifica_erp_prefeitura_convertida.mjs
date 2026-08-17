// Roda o identificador de ERP por ASSINATURA sobre as prefeituras que `descobre_prefeitura_de_camara.mjs`
// recuperou. Elas nasceram fora do fluxo normal: o Radar só tinha o portal da CÂMARA, então nunca passaram
// pelo `identifica_erp_por_pagina`. Sem este passo elas ficam com portal conhecido e ERP desconhecido —
// visíveis e inúteis. Faz os 2 saltos (home → link de transparência), como o identificador original.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { pool, withRetry } from "./_cadprev.mjs";
import { identifica, linkTransparencia, baixa } from "./_erp_assinaturas.mjs";

const db = pool();
const q = withRetry(db);
const CONC = Number(process.env.CONC || 5);

await q(`alter table prefeitura_de_camara add column if not exists erp text`);
await q(`alter table prefeitura_de_camara add column if not exists url_erp text`);
await q(`alter table prefeitura_de_camara add column if not exists erp_via text`);
await q(`alter table prefeitura_de_camara add column if not exists checado_em timestamptz`);

const alvos = (await q(`select cod_ibge, municipio, uf, url_prefeitura from prefeitura_de_camara
  where checado_em is null order by uf, municipio`)).rows;
console.log(`[erp/convertidas] ${alvos.length} prefeituras a identificar · concorrência ${CONC}`);

let achados = 0, feitos = 0;
for (let i = 0; i < alvos.length; i += CONC) {
  await Promise.all(alvos.slice(i, i + CONC).map(async (a) => {
    let erp = null, urlErp = null, via = "sem_resposta";
    const html = await baixa(a.url_prefeitura);
    if (html) {
      let id = identifica(html);
      via = "assinatura";
      if (!id.erp) {                                  // 2º salto: segue o link de transparência
        const alvo = linkTransparencia(html, a.url_prefeitura);
        if (alvo && !/\.gov\.br\/?$/i.test(alvo)) {
          const h2 = await baixa(alvo);
          if (h2) { id = identifica(h2); via = "assinatura-2salto"; }
        }
      }
      erp = id.erp || null; urlErp = id.url || null;
      if (!erp) via = "nao_identificado";
    }
    await q(`update prefeitura_de_camara set erp=$2, url_erp=$3, erp_via=$4, checado_em=now() where cod_ibge=$1`,
      [a.cod_ibge, erp, urlErp, via]);
    if (erp) { achados++; console.log(`  ✔ ${a.municipio.padEnd(26)} ${erp}  (${via})`); }
  }));
  feitos += Math.min(CONC, alvos.length - i);
  process.stdout.write(`   ${feitos}/${alvos.length} · ${achados} com ERP\r`);
}
console.log(`\n[erp/convertidas] ${achados} de ${alvos.length} identificados`);
console.table((await q(`select coalesce(erp,'(não identificado)') erp, uf, count(*)::int n
  from prefeitura_de_camara group by 1,2 order by 3 desc`)).rows);
await db.end();
