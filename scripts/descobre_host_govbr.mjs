// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_host_govbr.mjs — acha o HOST REAL do portal GovBR/PRONIM lendo o site do município.
//
// POR QUÊ (23/ago/2026): o coletor de dados abertos do GovBR fechou 227 municípios como `sem_api` — "sem módulo
// de dados abertos". Não era isso: `radar_portal` guarda o **site institucional** do município
// (`abadiadosdourados.mg.gov.br`), e o módulo mora no portal do sistema (`webapp1-{slug}.cidade360.cloud`).
// Apontar o coletor para o site institucional procura a API no lugar errado
// ([[pnigp-govbr-dadosabertos-api]], [[pnigp-fornecedor-e-host-nao-erp]]).
//
// 🚨 DERIVAR O HOST NÃO FUNCIONA: testei `webapp1-{slug}.cidade360.cloud` em 10 municípios e **1** respondeu.
//    O host varia (prefixo, sufixo, domínio próprio) e só o site do município sabe qual é — é a mesma lei do
//    [[pnigp-catalogo-ja-tinha-a-camara]]: o dado está publicado, falta PEDIR no lugar certo.
//
// ⭐ MEDIDO ANTES DE ESCREVER: varri os 381 registros `sem_api` e li 312 sites — **146 têm assinatura de GovBR**
//    no HTML. Os demais usam outro produto (34 portaldeservicos, 6 ipm, 4 scpi, 3 siplanweb, 3 memory…) e
//    estavam classificados como `govbr` no radar por engano; este script NÃO os toca, só relata.
//
// Uso: node scripts/descobre_host_govbr.mjs            (só relata)
//      APLICAR=1 node scripts/descobre_host_govbr.mjs  (grava url_erp em radar_portal)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const APLICAR = process.env.APLICAR === "1";
const CONC = Number(process.env.CONC || 6);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36" };

// hosts do produto. 🚨 NÃO aceitar caminho de asset (webfonts/, static/): o CDN do fornecedor não é a
//    instalação do município ([[pnigp-radar-tem-camara-para-os-5570]]).
const RE_HOST = /https?:\/\/([a-z0-9][a-z0-9-]*\.(?:cidade360\.cloud|govbr\.cloud))/gi;

const alvos = (await q(`select distinct on (cod_ibge) cod_ibge, municipio, uf, detalhe
   from folha_govbrda_coleta where situacao = 'sem_api' order by cod_ibge, em desc`)).rows;
console.log(`[govbr/host] ${alvos.length} municípios com sem_api · concorrência ${CONC}`);

const achados = [], semAssinatura = [], soCamara = [];
const testados = new Set();
const ANO = Number(process.env.ANO || new Date().getFullYear());
for (let i = 0; i < alvos.length; i += CONC) {
  await Promise.all(alvos.slice(i, i + CONC).map(async (a) => {
    const base = String(a.detalhe || "").match(/https?:\/\/[^\s]+/);
    if (!base) return;
    try {
      const r = await fetch(base[0], { headers: UA, redirect: "follow", signal: AbortSignal.timeout(25000) });
      if (!r.ok) return;
      const t = await r.text();
      const brutos = [...new Set([...t.matchAll(RE_HOST)].map((m) => m[1].toLowerCase()))];
      // 🚨 duas recusas, achadas na primeira execução:
      //    · `cdn.` / `static.` / `assets.` é o CDN DO FORNECEDOR, não a instalação do município — mesma
      //      armadilha das assinaturas vindas de `webfonts/` ([[pnigp-radar-tem-camara-para-os-5570]]);
      //    · `cm-` é CÂMARA MUNICIPAL. Gravar como portal da prefeitura apontaria o coletor do EXECUTIVO para
      //      o legislativo — o erro que custou 2 prefeituras falsas hoje ([[pnigp-guarda-poder-volume-rais]]).
      //      Fica registrado à parte: é alvo legítimo, do outro poder.
      // 🚨 a lista de prefixos não bastou: `cidade360imagens-oci.cidade360.cloud` passou. Agora recusa por
      //    QUALQUER pedaço que denuncie asset (imagens, cdn, static, media), em qualquer posição do host.
      // 🚨 segunda correção: `cidade360imagens-oci` passou porque "imagens" vinha depois de DÍGITO, e eu
      //    exigia ponto ou hífen antes. Palavra de asset em QUALQUER posição do host basta para recusar.
      const hosts = brutos.filter((h) => !/(cdn|static|assets?|imagens?|img|files|media|fonts|upload)/.test(h)
                                      && !/^cm-/.test(h));
      const daCamara = brutos.filter((h) => /^cm-/.test(h));
      if (hosts.length) { achados.push({ ...a, host: hosts[0], quantos: hosts.length, camara: daCamara[0] || null }); return; }
      if (daCamara.length) { soCamara.push({ ...a, host: daCamara[0] }); return; }

      // ⭐⭐ SEGUNDA ESTRATÉGIA (23/ago): quando o site não cita o host do sistema, SEGUIR O LINK DE
      //    TRANSPARÊNCIA e testar /dadosabertos/ onde ele cair. O portal costuma viver em domínio próprio
      //    (`transparencia.{mun}.{uf}.gov.br`) e o módulo responde lá do mesmo jeito — o que identifica o
      //    produto é a ROTA, não o host ([[pnigp-rota-identifica-o-produto-nao-o-host]]).
      const links = [...new Set([...t.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]))]
        .filter((h) => /transpar/i.test(h)).slice(0, 4);
      for (const l of links) {
        let alvo = null;
        try { alvo = new URL(l, base[0]).origin; } catch { continue; }
        if (!alvo || testados.has(alvo)) continue;
        testados.add(alvo);
        try {
          const rr = await fetch(`${alvo}/dadosabertos/dbdestino/buscarEntidadesAreaGestaoPessoas/${ANO}`,
            { headers: { ...UA, accept: "application/json" }, signal: AbortSignal.timeout(20000) });
          if (rr.ok) {
            const j = await rr.json().catch(() => null);
            if (Array.isArray(j) && j.length) {
              achados.push({ ...a, host: alvo.replace(/^https?:\/\//, ""), quantos: 1, via: "link de transparência" });
              return;
            }
          }
        } catch { /* não é aqui */ }
      }
      semAssinatura.push(a);
    } catch { /* site fora do ar não é ausência de portal */ }
  }));
  if (i % (CONC * 10) === 0) process.stdout.write(`   ${i}/${alvos.length} · ${achados.length} hosts\r`);
}

console.log(`\n⭐ ${achados.length} hosts de GovBR achados no site do município`);
console.log(`   ${semAssinatura.length} sem assinatura de GovBR — provavelmente OUTRO produto, não mexer aqui`);
if (soCamara.length) {
  console.log(`
🏛️ ${soCamara.length} onde o ÚNICO host GovBR é o da CÂMARA (prefixo cm-) — alvo do legislativo, não do executivo:`);
  console.table(soCamara.slice(0, 10).map((x) => ({ uf: x.uf, municipio: x.municipio, host: x.host })));
}
console.table(achados.slice(0, 12).map((x) => ({ uf: x.uf, municipio: x.municipio, host: x.host })));

if (!APLICAR) { console.log("\n(só relatório — APLICAR=1 grava url_erp em radar_portal)"); await db.end(); process.exit(0); }

let n = 0;
for (const a of achados) {
  const r = await q(`update radar_portal
       set url_erp = $2, erp = 'govbr',
           erp_via = 'host do portal lido no site do município (descobre_host_govbr)'
     where cod_ibge = $1 and unidade_gestora ilike 'Prefeitura%'`, [a.cod_ibge, "https://" + a.host]);
  n += r.rowCount;
}
console.log(`\n✅ ${n} linhas do radar com o host real do portal`);
await db.end();
