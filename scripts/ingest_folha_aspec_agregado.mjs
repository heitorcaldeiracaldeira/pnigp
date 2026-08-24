// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_aspec_agregado.mjs — a folha do ASPEC/GovernoTransparente: PA e AP, por ÓRGÃO, CARGO e VÍNCULO.
//
// De onde vieram os alvos: [[pnigp-catalogo-rnr-cr2-bubble]] — a Data API do portal CR2 entrega 79 links dessa
// plataforma, 63 do Pará e 14 do Amapá, com o IBGE embutido na rota `{IBGE7}{NN}` (NN = entidade).
//
// 🚨 O QUE ESTA FONTE **NÃO** DÁ: folha nominal com valor. A tela "Funcionários" é CADASTRO — matrícula, nome,
// CPF mascarado, vínculo, cargo, departamento, admissão, situação, carga horária — e **nenhuma remuneração**.
// Nome sem valor não é folha ([[pnigp-lista-sem-valor-nao-e-folha]]), então o nominal daqui não entra em
// `folha_servidores_*`. O que ela DÁ, e é bom: o valor **por órgão** — que é a folha por secretaria declarada
// pela própria fonte, sem dicionário no meio ([[pnigp-folha-por-secretaria-pendente]]) — e por cargo e vínculo.
//
// 🚨 Município fora da plataforma responde **HTTP 500**, não 404 e não soft-200: testei 8 municípios do PA que
// não estão no catálogo e todos deram 500 com 3.525 bytes. O catálogo é a lista completa, não uma amostra.
//
// Uso: node scripts/ingest_folha_aspec_agregado.mjs   ·   SO=Abel   ·   COMP=202606   ·   CONC=4
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const COMP = process.env.COMP || null;
const CONC = +(process.env.CONC || 4);
const REFAZ = process.env.REFAZ === "1";
const B = "https://folha.governotransparente.com.br";
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  accept: "text/html,*/*", "accept-language": "pt-BR,pt;q=0.9" };

const pega = async (u, ms = 90000) => {
  for (const t of [0, 1]) {
    try {
      const r = await fetch(u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(ms) });
      return { st: r.status, t: await r.text() };
    } catch (e) { if (t) return { st: 0, t: "", erro: String(e?.cause?.message || e.message).slice(0, 45) };
      await new Promise((s) => setTimeout(s, 1500)); }
  }
};
const st = (h) => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
  .replace(/&aacute;/gi, "á").replace(/&eacute;/gi, "é").replace(/&iacute;/gi, "í").replace(/&oacute;/gi, "ó")
  .replace(/&uacute;/gi, "ú").replace(/&atilde;/gi, "ã").replace(/&otilde;/gi, "õ").replace(/&ccedil;/gi, "ç")
  .replace(/&ecirc;/gi, "ê").replace(/&acirc;/gi, "â").replace(/&ocirc;/gi, "ô").replace(/\s+/g, " ").trim();
const num = (v) => { const s = String(v || "").replace(/[R$\s.]/g, "").replace(",", ".");
  const n = parseFloat(s); return Number.isFinite(n) ? n : null; };
const maiorTabela = (h) => [...h.matchAll(/<table[\s\S]*?<\/table>/gi)].map((m) => m[0]).sort((a, b) => b.length - a.length)[0] || "";
const linhas = (T) => [...T.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) =>
  [...m[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => st(c[1])));

await q(`create table if not exists folha_agregada_aspec (
  cod_fonte text, cod_ibge text, municipio text, uf text, entidade text, competencia text,
  dimensao text,                -- orgao | cargo | vinculo
  cod text, nome text, funcionarios int, provento numeric, desconto numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_aspec_mun on folha_agregada_aspec (cod_ibge, competencia, dimensao)`);
// 🚨 nome PRÓPRIO da tabela: já existia um `folha_aspec_coleta` do trabalho de EMPENHO por secretaria, com outro
// esquema — e `create table if not exists` não avisa, só deixa passar e o insert quebra depois com
// "column cod_fonte does not exist". Colisão de nome é falha silenciosa ([[pnigp-catalogo-ok-nao-significa-gravou]]).
await q(`create table if not exists folha_aspec_pessoal_coleta (
  cod_fonte text primary key, cod_ibge text, municipio text, uf text, entidade text, competencia text,
  orgaos int, cargos int, vinculos int, funcionarios int, folha numeric,
  situacao text, detalhe text, em timestamptz default now())`);

// 🚨 UMA LINHA POR ENTIDADE, não por município: `distinct on (cod_fonte)` (o IBGE de 7 dígitos) colapsava
// prefeitura e câmara na mesma chave e ficava com a CÂMARA — Abel Figueiredo entrou com 15 funcionários da
// câmara no lugar dos 424 da prefeitura ([[pnigp-radar-aponta-camara-ou-consorcio]]). A chave é a ROTA inteira
// `{IBGE7}{NN}`, e o sufixo NN distingue prefeitura (01), fundos e câmara.
// 🚨 UMA LINHA POR ENTIDADE, nao por municipio: agrupar pelo IBGE de 7 digitos colapsava prefeitura e camara
// na mesma chave e ficava com a CAMARA -- Abel Figueiredo entrou com 15 funcionarios da camara no lugar dos
// 424 da prefeitura ([[pnigp-radar-aponta-camara-ou-consorcio]]). A chave e a ROTA inteira {IBGE7}{NN}: o
// sufixo NN distingue prefeitura (01), fundos e camara.
// A extracao da rota fica em JS de proposito: regex dentro de template literal que vira SQL e armadilha de
// escape -- o mesmo padrao funcionava solto e devolvia zero linhas aqui dentro.
const bruto = (await q(`select cod_fonte, cod_ibge, municipio, uf, link, ano
  from folha_catalogo_rnr where produto='aspec' and link like '%governotransparente%'
  order by ano desc nulls last`)).rows;
const porRota = new Map();
for (const r of bruto) {
  const rota = (r.link.match(/governotransparente\.com\.br\/(\d+)/) || [])[1];
  if (!rota || porRota.has(rota)) continue;
  if (SO && !(String(r.municipio || "").toLowerCase().includes(SO.toLowerCase()) || rota.startsWith(SO))) continue;
  porRota.set(rota, { ...r, rota });
}
const alvos = [...porRota.values()].sort((a, b) => a.rota.localeCompare(b.rota));
const feitos = REFAZ ? new Set()
  : new Set((await q(`select cod_fonte from folha_aspec_pessoal_coleta where situacao='ok'`)).rows.map((r) => r.cod_fonte));
const fila = alvos.filter((a) => !feitos.has(a.cod_fonte));
console.log(`[aspec] ${alvos.length} entes no catálogo · ${fila.length} na fila`);

// o código da rota é {IBGE7}{NN}; o catálogo guarda só os 7 primeiros, então o resto vem do próprio link
const rotaDe = (a) => (a.link.match(/governotransparente\.com\.br\/(\d+)/) || [])[1];

let okN = 0, vazio = 0, erro = 0, totalLinhas = 0;
const fifo = [...fila];
await Promise.all(Array.from({ length: CONC }, async () => {
  while (fifo.length) {
    const a = fifo.shift();
    const rota = a.rota || rotaDe(a);
    const marca = (situacao, detalhe, comp = null, d = {}) =>
      q(`insert into folha_aspec_pessoal_coleta (cod_fonte,cod_ibge,municipio,uf,entidade,competencia,orgaos,cargos,
           vinculos,funcionarios,folha,situacao,detalhe,em)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
         on conflict (cod_fonte) do update set competencia=excluded.competencia, orgaos=excluded.orgaos,
           cargos=excluded.cargos, vinculos=excluded.vinculos, funcionarios=excluded.funcionarios,
           folha=excluded.folha, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
        [rota, a.cod_ibge, a.municipio, a.uf, d.entidade || null, comp, d.orgaos || 0, d.cargos || 0,
         d.vinculos || 0, d.funcionarios || 0, d.folha || null, situacao, detalhe]);
    try {
      // 1. as competências disponíveis estão linkadas na própria tela de funcionários
      const idx = await pega(`${B}/${rota}/foff/listar-por/funcionariosresumo`);
      if (idx.st !== 200) { erro++; await marca("erro", `HTTP ${idx.st || idx.erro}`); continue; }
      const entidade = (st(idx.t).match(/Setor Pessoal\s+(.{4,70}?)\s+-->/) || [])[1] || null;
      // 🚨 `202699` é o 13º, não um mês — entra na lista de links e não pode virar competência de referência.
      const comps = [...new Set([...idx.t.matchAll(/funcionariosresumo\/(\d{6})/g)].map((m) => m[1]))]
        .filter((c) => c.slice(4) !== "99" && +c.slice(4) >= 1 && +c.slice(4) <= 12).sort().reverse();
      if (!comps.length) { vazio++; await marca("vazio", "nenhuma competência publicada", null, { entidade }); continue; }

      // 2. COMPETÊNCIA MAIS CHEIA, não a mais recente: o mês corrente vem parcial
      //    ([[pnigp-competencia-mais-cheia-nao-a-recente]]). Mede as 3 mais novas pelo total por órgão.
      const candidatas = COMP ? [COMP] : comps.slice(0, 3);
      let melhor = null;
      for (const c of candidatas) {
        const r = await pega(`${B}/${rota}/foff/listar-por/orgaos/${c}`);
        if (r.st !== 200) continue;
        const ls = linhas(maiorTabela(r.t)).filter((x) => x.length >= 6 && /^\d+$/.test(x[0]));
        const fun = ls.reduce((s, x) => s + (+x[2] || 0), 0);
        if (!melhor || fun > melhor.fun) melhor = { comp: c, fun, orgaos: ls };
      }
      if (!melhor || !melhor.orgaos.length) { vazio++; await marca("vazio", `sem linhas em ${candidatas.join("/")}`, null, { entidade }); continue; }

      // 3. as três dimensões da competência escolhida
      const regs = [];
      const junta = (dimensao, ls) => { for (const x of ls) regs.push({
        cod_fonte: rota, cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, entidade,
        competencia: melhor.comp, dimensao, cod: x[0], nome: x[1], funcionarios: +x[2] || null,
        provento: num(x[3]), desconto: num(x[4]), liquido: num(x[5]),
        _hash: crypto.createHash("md5").update([rota, melhor.comp, dimensao, x[0], x[1]].join("¦")).digest("hex") }); };
      junta("orgao", melhor.orgaos);
      const conta = { orgaos: melhor.orgaos.length, cargos: 0, vinculos: 0 };
      for (const [dim, rt] of [["cargo", "cargos"], ["vinculo", "vinculos"]]) {
        const r = await pega(`${B}/${rota}/foff/listar-por/${rt}/${melhor.comp}`);
        if (r.st !== 200) continue;
        const ls = linhas(maiorTabela(r.t)).filter((x) => x.length >= 6 && /^\d+$/.test(x[0]));
        junta(dim, ls); conta[rt] = ls.length;
      }
      for (let i = 0; i < regs.length; i += 300) {
        const p = regs.slice(i, i + 300); const c = (f) => p.map((z) => z[f]);
        await q(`insert into folha_agregada_aspec (cod_fonte,cod_ibge,municipio,uf,entidade,competencia,dimensao,
             cod,nome,funcionarios,provento,desconto,liquido,_hash)
           select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],
             $8::text[],$9::text[],$10::int[],$11::numeric[],$12::numeric[],$13::numeric[],$14::text[])
           on conflict (_hash) do update set funcionarios=excluded.funcionarios, provento=excluded.provento,
             desconto=excluded.desconto, liquido=excluded.liquido, _coletado_em=now()`,
          [c("cod_fonte"), c("cod_ibge"), c("municipio"), c("uf"), c("entidade"), c("competencia"), c("dimensao"),
           c("cod"), c("nome"), c("funcionarios"), c("provento"), c("desconto"), c("liquido"), c("_hash")]);
      }
      const folha = melhor.orgaos.reduce((s, x) => s + (num(x[3]) || 0), 0);
      totalLinhas += regs.length; okN++;
      await marca("ok", null, melhor.comp, { entidade, ...conta, funcionarios: melhor.fun, folha });
      console.log(`  ✔ ${(a.uf + " " + (a.municipio || rota)).padEnd(26)} ${String(entidade || "").slice(0, 26).padEnd(27)} ${melhor.comp} · ${conta.orgaos} órgãos · ${conta.cargos} cargos · ${melhor.fun} func. · R$ ${Math.round(folha).toLocaleString("pt-BR")}`);
    } catch (e) { erro++; await marca("erro", String(e.message).slice(0, 180)); console.log(`  ✖ ${a.municipio || rota}: ${String(e.message).slice(0, 70)}`); }
  }
}));
console.log(`\n[aspec] ${totalLinhas} linhas agregadas · ${okN} entes ok · ${vazio} vazios · ${erro} com erro`);
await db.end();
