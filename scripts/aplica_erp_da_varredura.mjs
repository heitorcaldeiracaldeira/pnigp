// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// aplica_erp_da_varredura.mjs — leva o ERP que a VARREDURA POR SITE descobriu para o `radar_portal`, que é de
// onde os coletores tiram alvo. Sem esta ponte, a descoberta fica parada numa tabela que ninguém consulta.
//
// 🚨 SÓ PREENCHE ONDE ESTÁ VAZIO. O Radar é fonte externa (ATRICON) e o que ele afirma não é sobrescrito — se
// ele diz "fiorilli" e a varredura diz outra coisa, isso é divergência para investigar, não para apagar em
// silêncio. A origem fica em `erp_via='varredura_site'`, para sempre dar para separar o que é nosso do que é dele.
//
// Uso: node scripts/aplica_erp_da_varredura.mjs        (só mede)
//      APLICA=1 UF=MG node scripts/aplica_erp_da_varredura.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool(); const q = withRetry(db);
const APLICA = process.env.APLICA === "1";
const UF = process.env.UF || null;

const novos = (await q(`select v.cod_ibge, v.municipio, v.uf, v.erp, v.url_pessoal, v.url_transparencia
  from folha_verificacao_site v
  join radar_portal r on r.cod_ibge = v.cod_ibge and r.unidade_gestora ilike 'Prefeitura%'
  where v.erp is not null and (r.erp is null or btrim(r.erp) = '')
  ${UF ? "and v.uf = $1" : ""}
  group by 1,2,3,4,5,6`, UF ? [UF] : [])).rows;

console.log(`${novos.length} municípios com ERP descoberto pela varredura e VAZIO no Radar`);
const porErp = new Map();
for (const n of novos) porErp.set(n.erp, (porErp.get(n.erp) || 0) + 1);
console.table([...porErp].sort((a, b) => b[1] - a[1]).map(([erp, n]) => ({ erp, municipios: n })));

if (!APLICA) { console.log("\n(medição apenas — use APLICA=1 para gravar)"); await db.end(); process.exit(0); }
// 🚨 O RÓTULO DE ERP SOZINHO NÃO BASTA. `identifica()` casa assinatura em QUALQUER ponto do HTML — rodapé, banner,
// link para outro sistema. Aplicar sem conferir levou 62 de 163 municípios (38%) para o ERP errado: São José do
// Peixe/PI recebeu "govbr" com a URL apontando para o Radar do TCE-MT, e Olímpio Noronha/MG virou "govbr" sendo
// siplanweb. A URL DO ITEM DE PESSOAL tem que corroborar o rótulo — senão é palpite com cara de medição.
const CORROBORA = {
  govbr: /govbr|cidade360|pronim/i, fiorilli: /fiorilli|scpi|AcessoIndividual/i,
  portaltp: /portaltp/i, memory: /memory\.com\.br|ilai/i, aspec: /governotransparente/i,
  cr2: /cr2|portalcr2/i, betha: /betha/i, ipm: /atende\.net|ipm/i, instar: /instar/i,
  abaco: /abaco|transparencia\.[a-z]+\.[a-z]{2}\.gov\.br/i, prefmoderna: /prefeituramoderna/i,
  cecam2: /cecam/i, el: /\/el\//i, mpweb: /mpweb/i,
};
const coerente = (erp, url) => {
  if (!url || !/^https?:\/\//i.test(url)) return false;              // "javascript: void(0)" não é endereço
  if (/tce\.|tribunal|atricon/i.test(url)) return false;             // portal de tribunal não é o do município
  const re = CORROBORA[erp];
  return re ? re.test(url) : true;
};
let n = 0, descartados = 0;
for (const x of novos) {
  const urlX = x.url_pessoal || x.url_transparencia || null;
  if (!coerente(x.erp, urlX)) { descartados++; continue; }
  const url = x.url_pessoal || x.url_transparencia || null;
  const r = await q(`update radar_portal set erp = $1, erp_via = 'varredura_site',
      url_erp = coalesce(nullif(btrim(url_erp),''), $2), checado_em = now()
    where cod_ibge = $3 and unidade_gestora ilike 'Prefeitura%'
      and (erp is null or btrim(erp) = '')`, [x.erp, url, x.cod_ibge]);
  n += r.rowCount;
}
console.log(`\n${n} linhas do Radar preenchidas com erp_via='varredura_site'`);
console.table((await q(`select erp, count(*) n from radar_portal where erp_via='varredura_site' group by 1 order by 2 desc limit 12`)).rows);
await db.end();
