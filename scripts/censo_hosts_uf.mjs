// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// censo_hosts_uf.mjs — QUEM ATENDE A FOLHA DE CADA MUNICÍPIO, pelos hosts REAIS lidos dos sites oficiais.
//
// Generalização do `censo_pi_hosts.mjs`, que no Piauí revelou que o estado tinha QUATRO telas diferentes e
// um portal multi-inquilino inteiro (10 municípios) que nenhuma varredura por caminho adivinhado achava.
//
// 🚨 A LEI QUE ELE APLICA: **host inventado não é ausência de portal.** A primeira sonda do PI chutou
//    `transparencia.{slug}.pi.gov.br` e colheu 88 ENOTFOUND + 63 timeout — 151 municípios que "não publicavam"
//    e publicavam. Aqui os hosts vêm de `site_municipal_links`, que é leitura, não chute.
//
// Faz três coisas numa passada:
//   1. classifica cada host por família de ERP/produto (o host não mente; o rótulo do portal, sim);
//   2. testa as ROTAS DE DADOS já conhecidas da campanha (v2 DevExpress, folha-pagamento, JSF, servidores);
//   3. grava tudo em `host_censo_uf` para o coletor decidir depois.
//
// Uso: UF=RO node scripts/censo_hosts_uf.mjs   ·   CONC=12
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { Agent, setGlobalDispatcher } from "undici";
import { pool, withRetry } from "./_cadprev.mjs";
import { SG_UF as UF } from "./_uf.mjs";

// ⚠️ family:4 é obrigatório: sem ele metade destes hosts dá ECONNREFUSED no Node e abre no navegador
// ([[pnigp-fetch-node-ipv6-econnrefused]]).
setGlobalDispatcher(new Agent({ connect: { timeout: 20000, rejectUnauthorized: false, family: 4 },
  headersTimeout: 45000, bodyTimeout: 90000 }));

const db = pool(); const q = withRetry(db);
const CONC = Number(process.env.CONC || 12);
const H = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  accept: "text/html,application/json" };

// família pelo HOST — [[pnigp-fornecedor-e-host-nao-erp]]
const FAMILIAS = [
  [/betha/i, "betha"], [/elotech|oxy\./i, "elotech"], [/dcfiorilli|fiorilli/i, "fiorilli"],
  [/portaltp|epublica/i, "portaltp"], [/ipm|atende\.net/i, "ipm"], [/publicsoft|smarapd/i, "smarapd"],
  [/memory|ilai/i, "memory"], [/govbr|pronim/i, "govbr"], [/instar/i, "instar"],
  [/cr2\.co|portalcr2|cr2transparencia|cr2site/i, "cr2"], [/adtrcloud/i, "adtr"],
  [/layoutsistemas|layoutonline/i, "layout"], [/portaldocontribuinte|\bkds\b/i, "kds"],
  [/administracaotransparente|portaltransparencia\/faces/i, "admtransp"],
  [/qualitysistemas/i, "quality"], [/tenosoft|equiplano/i, "equiplano"],
  [/municipioonline|genesis/i, "municipioonline"], [/siplan/i, "siplan"],
  [/transparenciamunicipal|itransparencia/i, "itransparencia"], [/scpi|sigmix/i, "scpi"],
  [/rhsys/i, "rhsys"], [/datapublic/i, "datapublic"], [/nucleogov|sgservidores/i, "nucleogov"],
  [/7focus/i, "7focus"], [/consfolha/i, "consfolha"], [/agili/i, "agili"], [/aspec|governotransparente/i, "aspec"],
  // ⚠️ hosts que NÃO são portal do município — não gastar sonda neles
  [/radardatransparencia|radar\.tce|atricon|portaldatransparencia\.gov\.br|\.leg\.br|vlibras|gov\.br\/pt-br/i, "IGNORAR"],
];
const familia = (h) => (FAMILIAS.find(([re]) => re.test(h)) || [, null])[1];

// rotas de dados que a campanha já aprendeu a ler — testadas contra o host do município
const ROTAS = [
  { nome: "v2_json", url: (h) => `https://${h}/v2/servidores.json?skip=0&take=1&requireTotalCount=true`, json: true },
  { nome: "folha_pagamento", url: (h) => `https://${h}/transparencia/folha-pagamento` },
  { nome: "servidores_cms", url: (h) => `https://${h}/transparencia/servidores` },
  { nome: "jsf_admtransp", url: (h) => `https://${h}/portaltransparencia/faces/v2/recursos_humanos/folha_pagamento_listar.xhtml` },
];

await q(`create table if not exists host_censo_uf (
  uf text, cod_ibge text, municipio text, host text, familia text,
  rota text, http int, linhas int, tem_valor boolean, cabecalho text,
  detalhe text, em timestamptz default now(), primary key (cod_ibge, host))`);

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const ok = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (ok) partes.push(`select distinct left(cod_ibge::text,7) c from ${t}`);
}
const rows = (await q(`
  with col as (${partes.join(" union ")})
  select m.cod_ibge, m.nome municipio,
         array_agg(distinct split_part(split_part(split_part(l,'|',2),'//',2),'/',1)) hosts
    from municipios_br m
    join site_municipal_links s on s.cod_ibge=m.cod_ibge
    cross join lateral jsonb_array_elements_text(s.links) l
    left join col c on c.c=m.cod_ibge
   where m.uf=$1 and c.c is null
   group by 1,2 order by 2`, [UF])).rows;
console.log(`[censo/${UF}] ${rows.length} municípios sem folha e com site lido`);

const sem = (s) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

async function testa(host, rota) {
  try {
    const r = await fetch(rota.url(host), { headers: H, redirect: "follow", signal: AbortSignal.timeout(30000) });
    if (r.status >= 400) return { http: r.status, detalhe: `HTTP ${r.status}` };
    const t = await r.text();
    if (rota.json) {
      let j; try { j = JSON.parse(t); } catch { return { http: r.status, detalhe: "nao-json" }; }
      const arr = Array.isArray(j) ? j : j.data || [];
      const x = arr[0] || {};
      const val = Object.entries(x).find(([k]) => /remunera|salario|liquid|bruto|valor|vencim/i.test(k));
      if (!val) return { http: r.status, detalhe: "json sem valor" };
      return { http: r.status, linhas: j.totalCount ?? arr.length, tem_valor: true, cab: Object.keys(x).join(",") };
    }
    // ⚠️ a prova é a LINHA, não o 200 — e o cabeçalho pode vir em <th> OU em <div> (DevExpress)
    const ths = [...t.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => sem(m[1])).filter(Boolean);
    const divs = [...t.matchAll(/datagrid-text-content[^>]*>([^<]{2,40})</gi)].map((m) => sem(m[1]));
    const cab = [...new Set([...ths, ...divs])];
    const trs = ((t.split(/<tbody/i)[1] || "").match(/<tr/gi) || []).length;
    const marcaJsf = /filtrosLL|tbPrincipal/.test(t);
    if (!trs && !marcaJsf && !cab.length) return { http: r.status, detalhe: "sem tabela" };
    const valor = /R\$\s?[\d.]+,\d{2}/.test(t) || cab.some((x) => /remuner|l[íi]quid|bruto|sal[áa]rio|vencim/i.test(x));
    return { http: r.status, linhas: trs, tem_valor: valor, cab: cab.slice(0, 12).join(" | "),
      detalhe: marcaJsf ? "portal JSF (tabela carrega por AJAX)" : null };
  } catch (e) { return { http: null, detalhe: (e.cause?.code || e.name || e.message).toString().slice(0, 26) }; }
}

let i = 0, achados = 0;
async function trab() {
  while (i < rows.length) {
    const m = rows[i++];
    const hosts = (m.hosts || []).filter((h) => h && !h.includes(" ") && familia(h) !== "IGNORAR");
    for (const h of hosts) {
      const f = familia(h);
      let melhor = null;
      // só vale sondar rota de dados em host do próprio ente; host de fornecedor tem catálogo próprio
      if (/\.gov\.br$|\.gov\.br:/i.test(h)) {
        for (const rota of ROTAS) {
          const r = await testa(h, rota);
          if (r.linhas || r.tem_valor || /JSF/.test(r.detalhe || "")) { melhor = { rota: rota.nome, ...r }; break; }
          if (!melhor) melhor = { rota: null, ...r };
        }
      } else melhor = { rota: null, detalhe: `host de fornecedor (${f || "?"})` };
      if (melhor?.tem_valor) { achados++; console.log(`  ⭐ ${m.municipio} · ${h} · ${melhor.rota} · ${melhor.linhas || "?"} linhas COM VALOR`); }
      await q(`insert into host_censo_uf (uf,cod_ibge,municipio,host,familia,rota,http,linhas,tem_valor,cabecalho,detalhe,em)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()) on conflict (cod_ibge,host) do update set
        familia=excluded.familia, rota=excluded.rota, http=excluded.http, linhas=excluded.linhas,
        tem_valor=excluded.tem_valor, cabecalho=excluded.cabecalho, detalhe=excluded.detalhe, em=now()`,
        [UF, m.cod_ibge, m.municipio, h, f, melhor?.rota || null, melhor?.http || null, melhor?.linhas || 0,
         !!melhor?.tem_valor, melhor?.cab || null, melhor?.detalhe || null]);
    }
    if (i % 10 === 0) console.log(`   ${i}/${rows.length} · ${achados} hosts com valor`);
  }
}
await Promise.all(Array.from({ length: CONC }, trab));

console.log("\n── famílias de ERP identificadas (municípios distintos):");
console.table((await q(`select coalesce(familia,'(host próprio/desconhecido)') familia, count(distinct cod_ibge) municipios
  from host_censo_uf where uf=$1 group by 1 order by 2 desc limit 20`, [UF])).rows);
console.log("── rotas de dados que responderam:");
console.table((await q(`select coalesce(rota,'(nenhuma)') rota, count(*) hosts, count(distinct cod_ibge) municipios,
  count(*) filter (where tem_valor) com_valor from host_censo_uf where uf=$1 group by 1 order by 2 desc`, [UF])).rows);
console.log("── por que os demais não responderam:");
console.table((await q(`select detalhe, count(*) n from host_censo_uf where uf=$1 and not tem_valor
  group by 1 order by 2 desc limit 12`, [UF])).rows);
await db.end();
