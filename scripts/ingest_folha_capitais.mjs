// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_capitais.mjs — folha das CAPITAIS, uma a uma.
//
// POR QUÊ separado: capital não usa ERP de prateleira — tem portal sob medida. Nenhum coletor por bloco de
// fornecedor as alcança, e por isso só 4 das 27 tinham folha (todas parciais: Cuiabá com 54 de 54.290). Somadas,
// as capitais têm ~1 milhão de servidores municipais — mais que todo o resto da base. Aqui cada uma é um caso,
// registrado em COLETORES abaixo. O mapa de portais/rotas sai de `capital_portal` (descobre_capitais.mjs).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)", accept: "application/json" };
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_servidores_capital (
  cod_ibge text, municipio text, uf text, competencia text,
  matricula text, nome text, cargo text, secretaria text, lotacao text, vinculo text,
  bruto numeric, descontos numeric, liquido numeric, fonte text,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_cap_mun on folha_servidores_capital (cod_ibge, competencia)`);
await q(`create table if not exists folha_capital_coleta (
  cod_ibge text primary key, municipio text, uf text, competencia text, linhas int,
  situacao text, detalhe text, em timestamptz default now()
)`);

const grava = async (regs) => {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += 1000) {
    const p = arr.slice(i, i + 1000); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_capital
      (cod_ibge,municipio,uf,competencia,matricula,nome,cargo,secretaria,lotacao,vinculo,bruto,descontos,liquido,fonte,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::numeric[],$12::numeric[],$13::numeric[],$14::text[],$15::text[])
      on conflict (_hash) do update set liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("competencia"), c("matricula"), c("nome"), c("cargo"),
       c("secretaria"), c("lotacao"), c("vinculo"), c("bruto"), c("descontos"), c("liquido"), c("fonte"), c("_hash")]);
  }
  return arr.length;
};

const money = (s) => {
  if (s == null) return null;
  const t = String(s).replace(/R\$|\s|\./g, "").replace(",", ".");
  const n = +t; return Number.isFinite(n) ? n : null;
};

// ── um coletor por capital ──────────────────────────────────────────────────────────────────────────────────────
const COLETORES = {
  // RIO DE JANEIRO — CSV mensal com a base consolidada dos últimos 60 meses, COM remuneração.
  // O caminho até ele: portal → /servidor-municipal/remuneracao/ → iframe jeap.rio.rj.gov.br/contrachequeapi/
  // transparencia → lista de arquivos `contrachequedoc.rio.gov.br/repositorio/ArquivoTC{AAAAMM}.csv`.
  // 354 mil linhas em 07/2026 (ativos + inativos + pensionistas, separados por TIPO_FOLHA). Latin-1, `;`.
  // Colunas: NOME · MATRICULA · SIGLA_UA · TIPO_FOLHA · REMUNERAÇÃO BRUTA · descontos… · REMUNERAÇÃO LÍQUIDA
  "3304557": async ({ cod_ibge, municipio, uf }) => {
    const hoje = new Date();
    for (let k = 0; k <= 6; k++) {
      const d = new Date(hoje); d.setDate(1); d.setMonth(hoje.getMonth() - k);
      const comp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
      // ⚠️ sem `accept: application/json` aqui: o repositório de CSV recusa esse cabeçalho
      const r = await fetch(`https://contrachequedoc.rio.gov.br/repositorio/ArquivoTC${comp}.csv`,
        { headers: { "user-agent": UA["user-agent"] }, signal: AbortSignal.timeout(300000) }).catch(() => null);
      if (!r || !r.ok) continue;
      const txt = new TextDecoder("iso-8859-1").decode(await r.arrayBuffer());
      const linhas = txt.split(/\r?\n/).filter((l) => l.trim());
      if (linhas.length < 2) continue;
      const cab = linhas[0].split(";").map((c) => c.trim().toUpperCase());
      const ix = (re) => cab.findIndex((c) => re.test(c));
      const col = { nome: ix(/^NOME/), matricula: ix(/MATRICULA/), ua: ix(/SIGLA_UA|UNIDADE/), tipo: ix(/TIPO_FOLHA/),
        bruta: ix(/BRUTA/), liquida: ix(/L[ÍI]QUIDA/) };
      const regs = [];
      for (const l of linhas.slice(1)) {
        const c = l.split(";");
        const nome = (c[col.nome] || "").trim();
        if (!nome) continue;
        // descontos = bruta - líquida (o CSV traz as parcelas separadas, não o total)
        const bruto = money(c[col.bruta]), liq = money(c[col.liquida]);
        regs.push({
          cod_ibge, municipio, uf, competencia: comp,
          matricula: (c[col.matricula] || "").trim(), nome, cargo: null,
          secretaria: (c[col.ua] || "").trim(), lotacao: (c[col.ua] || "").trim(),
          vinculo: (c[col.tipo] || "").trim(),
          bruto, descontos: bruto != null && liq != null ? +(bruto - liq).toFixed(2) : null, liquido: liq,
          fonte: "csv contrachequedoc",
          _hash: crypto.createHash("md5").update([cod_ibge, comp, c[col.matricula], nome, c[col.tipo], c[col.ua], c[col.bruta]].join("¦")).digest("hex"),
        });
      }
      return { regs, comp, detalhe: `CSV ${linhas.length - 1} linhas · com remuneração` };
    }
    return { regs: [], comp: null, detalhe: "nenhum CSV disponível nos últimos 7 meses" };
  },

  // SÃO PAULO — CKAN de dados abertos. O portal `transparencia.prefeitura.sp.gov.br` recusa conexão do navegador
  // headless (mas responde a HTTP puro); o caminho bom é o CKAN:
  //   /api/3/action/package_show?id=remuneracao-servidores-prefeitura-de-sao-paulo → 236 recursos (SIGPEC)
  // A URL do CSV tem hash — NÃO é previsível, então o recurso mais recente é sempre resolvido pela API.
  // 128 mil linhas em 202607, com remuneração e unidade.
  "3550308": async ({ cod_ibge, municipio, uf }) => {
    const CK = "https://dados.prefeitura.sp.gov.br/api/3/action";
    const j = await (await fetch(`${CK}/package_show?id=remuneracao-servidores-prefeitura-de-sao-paulo`,
      { headers: { ...UA }, signal: AbortSignal.timeout(90000) })).json();
    const recs = (j?.result?.resources || [])
      .filter((x) => /csv/i.test(x.format) && /remunera/i.test(x.name))
      .sort((a, b) => String(b.last_modified || b.created).localeCompare(String(a.last_modified || a.created)));
    if (!recs.length) return { regs: [], comp: null, detalhe: "CKAN sem CSV de remuneração" };
    const alvo = recs[0];
    const comp = (alvo.url.match(/folha_(\d{6})/) || [])[1] || null;
    const r = await fetch(alvo.url, { headers: { "user-agent": UA["user-agent"] }, redirect: "follow", signal: AbortSignal.timeout(300000) });
    const txt = new TextDecoder("iso-8859-1").decode(await r.arrayBuffer());
    const linhas = txt.split(/\r?\n/).filter((l) => l.trim());
    const cab = linhas[0].split(";").map((c) => c.trim().toLowerCase());
    const ix = (re) => cab.findIndex((c) => re.test(c));
    const col = { nome: ix(/nome completo/), cargo: ix(/cargo base/), comissao: ix(/cargo em comiss/),
      mes: ix(/remunera[çc][ãa]o do m[êe]s/), bruta: ix(/remunera[çc][ãa]o bruta/), unidade: ix(/^unidade/), jornada: ix(/jornada/) };
    const regs = [];
    for (const l of linhas.slice(1)) {
      const c = l.split(";");
      const nome = (c[col.nome] || "").trim();
      if (!nome) continue;
      const cargo = [(c[col.cargo] || "").trim(), (c[col.comissao] || "").trim()].filter((x) => x && x !== " ").join(" / ");
      regs.push({
        cod_ibge, municipio, uf, competencia: comp, matricula: null, nome, cargo: cargo || null,
        secretaria: (c[col.unidade] || "").trim(), lotacao: (c[col.unidade] || "").trim(),
        vinculo: (c[col.jornada] || "").trim(),
        bruto: money(c[col.bruta]), descontos: null, liquido: money(c[col.mes]), fonte: "ckan sigpec",
        // o valor entra no hash: sem ele, quem tem dois vínculos (mesmo cargo, mesma unidade) virava uma linha só —
        // eram 8.553 linhas a menos em 07/2026. A competência já está no hash e o recurso do CKAN é imutável.
        _hash: crypto.createHash("md5").update([cod_ibge, comp, nome, cargo, c[col.unidade], c[col.bruta], c[col.mes]].join("¦")).digest("hex"),
      });
    }
    return { regs, comp, detalhe: `CKAN ${linhas.length - 1} linhas · com remuneração` };
  },

  // FORTALEZA — CKAN de dados abertos, dataset `servidores` ("Relatório de Informações de Servidores da PMF").
  // 🚨 O portal da transparência NÃO serve: a API `/api/agentes-folha/lista` lista 50 mil agentes mas sem valor, e
  // a ficha individual `/api/agentes-folha/{ano}/{mes}/{id}` responde HTTP 500 em TODAS as competências testadas
  // (12/2024 a 07/2026) — a tela exibe "Dados do servidor não localizado" e R$ 0,00. O dado COMPLETO está no CKAN,
  // e é o mais rico entre as capitais: além de proventos/descontos/líquido, traz CBO, grau de instrução, regime
  // jurídico e previdenciário, data de admissão e carga horária.
  // ⚠️ Valores vêm com zeros à esquerda ("000004767,07") e os campos com padding de espaços.
  // ⚠️ Ordenar os recursos pela COMPETÊNCIA do nome do arquivo (relacao_AAAAMM.csv), não pela URL: por URL o
  // "mais recente" saía como 2025/03.
  "2304400": async ({ cod_ibge, municipio, uf }) => {
    const CK = "https://dados.fortaleza.ce.gov.br/api/3/action";
    const j = await (await fetch(`${CK}/package_show?id=servidores`, { headers: UA, signal: AbortSignal.timeout(90000) })).json();
    const recs = (j?.result?.resources || [])
      .map((x) => ({ ...x, comp: (String(x.url).match(/relacao_(\d{6})\.csv/i) || [])[1] }))
      .filter((x) => x.comp)
      .sort((a, b) => b.comp.localeCompare(a.comp));
    if (!recs.length) return { regs: [], comp: null, detalhe: "CKAN sem relacao_AAAAMM.csv" };
    const alvo = recs[0];
    const r = await fetch(alvo.url, { headers: { "user-agent": UA["user-agent"] }, redirect: "follow", signal: AbortSignal.timeout(300000) });
    const txt = new TextDecoder("iso-8859-1").decode(await r.arrayBuffer());
    const linhas = txt.split(/\r?\n/).filter((l) => l.trim());
    const cab = linhas[0].split(";").map((c) => c.trim().toUpperCase());
    const ix = (re) => cab.findIndex((c) => re.test(c));
    const col = { orgao: ix(/ORGAO|ENTIDADE/), nome: ix(/SERVIDOR/), vinculo: ix(/TIPO DE VINCULO/),
      admissao: ix(/DATA DE ADMISSAO/), situacao: ix(/SITUACAO FUNCIONAL/), cargo: ix(/^\d*-?\s*CARGO/),
      proventos: ix(/PROVENTOS/), descontos: ix(/DESCONTOS/), liquido: ix(/LIQUIDO/) };
    const lim = (v) => (v == null ? null : String(v).trim().replace(/^0+(?=\d)/, "") || null);
    const regs = [];
    for (const l of linhas.slice(1)) {
      const c = l.split(";");
      const nome = (c[col.nome] || "").trim();
      if (!nome) continue;
      regs.push({
        cod_ibge, municipio, uf, competencia: alvo.comp, matricula: null, nome,
        cargo: (c[col.cargo] || "").trim(), secretaria: (c[col.orgao] || "").trim(), lotacao: (c[col.orgao] || "").trim(),
        vinculo: (c[col.vinculo] || "").trim(),
        bruto: money(lim(c[col.proventos])), descontos: money(lim(c[col.descontos])), liquido: money(lim(c[col.liquido])),
        fonte: "ckan pmf",
        _hash: crypto.createHash("md5").update([cod_ibge, alvo.comp, nome, c[col.cargo], c[col.orgao], c[col.proventos]].join("¦")).digest("hex"),
      });
    }
    return { regs, comp: alvo.comp, detalhe: `CKAN ${linhas.length - 1} linhas · com remuneração, CBO e regime` };
  },

  // BELO HORIZONTE — CKAN `dados.pbh.gov.br`. O portal (prefeitura.pbh.gov.br/transparencia/servidores, e a rota
  // de remuneração tem TYPO no caminho: /transparencia/sevidores/remuneracao) é um HUB que só devolve links; os
  // arquivos moram no CKAN. São DOIS datasets que juntos formam a folha nominal:
  //   relatorio-do-funcionalismo-publico-administracao-direta   (~45,9 mil — prefeitura e secretarias)
  //   relatorio-do-funcionalismo-publico-administracao-indireta (~7,5 mil — BHTRANS, BELOTUR, SUDECAP, autarquias…)
  // ⚠️ NÃO somar o dataset de estagiários: eles já vêm dentro da indireta com VÍNCULO="ESTAGIÁRIO".
  // ⚠️ Existe um dataset chamado "Folha de Pagamento PBH Ativos" — nome promissor, mas são ~55 linhas/mês
  //    (só os agentes políticos). É armadilha; o relatório de funcionalismo é o que tem a folha inteira.
  // ⚠️ Decimal é PONTO ("8217.76") — o money() global apaga o ponto como separador de milhar; usar moedaPonto().
  // ⚠️ Campos entre aspas em parte dos meses e o cabeçalho varia de acento/aspas entre competências → ler por regex.
  // A competência sai do NOME do recurso ("06/2026 - …"), nunca da URL (que é um UUID do CKAN).
  "3106200": async ({ cod_ibge, municipio, uf }) => {
    const CK = "https://dados.pbh.gov.br/api/3/action";
    // ⚠️ o ponto é SEMPRE decimal aqui — inclusive com 1 ou 3 casas ("958.232" é R$ 958,23, não 958 mil).
    // Tratar ponto seguido de 3 dígitos como milhar inflava um estagiário para R$ 958.232,00. Medido em 06/2026:
    // 48.171 valores com 2 casas, 4.143 com 1 casa, 966 inteiros, 1 com 3 casas, 53 vazios. Zero no formato BR.
    const moedaPonto = (s) => { const t = String(s ?? "").replace(/["\s]/g, ""); if (!t) return null; const n = +t; return Number.isFinite(n) ? n : null; };
    const campos = (l) => {                                    // CSV com aspas opcionais
      const out = []; let cur = "", dentro = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (ch === '"') { if (dentro && l[i + 1] === '"') { cur += '"'; i++; } else dentro = !dentro; }
        else if (ch === ";" && !dentro) { out.push(cur); cur = ""; }
        else cur += ch;
      }
      out.push(cur); return out.map((x) => x.trim());
    };
    const MESES = { janeiro: "01", fevereiro: "02", marco: "03", "março": "03", abril: "04", maio: "05", junho: "06",
      julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12" };
    const compDe = (r) => {
      let m = String(r.name).match(/(\d{2})[\/\-_ ](\d{4})/); if (m) return `${m[2]}${m[1]}`;
      m = `${r.name} ${r.url}`.toLowerCase().match(new RegExp(`(${Object.keys(MESES).join("|")})[_\\- ]*(\\d{4})`));
      return m ? `${m[2]}${MESES[m[1]]}` : null;
    };
    const baixa = async (id, camada) => {
      const j = await (await fetch(`${CK}/package_show?id=${id}`, { headers: UA, signal: AbortSignal.timeout(90000) })).json();
      const recs = (j?.result?.resources || []).filter((x) => /csv/i.test(x.format))
        .map((x) => ({ ...x, comp: compDe(x) })).filter((x) => x.comp).sort((a, b) => b.comp.localeCompare(a.comp));
      if (!recs.length) return { regs: [], comp: null };
      const alvo = recs[0];
      const r = await fetch(alvo.url, { headers: { "user-agent": UA["user-agent"] }, redirect: "follow", signal: AbortSignal.timeout(300000) });
      const buf = Buffer.from(await r.arrayBuffer());
      let txt = new TextDecoder("utf-8").decode(buf);
      if (/�/.test(txt.slice(0, 4000))) txt = new TextDecoder("iso-8859-1").decode(buf);
      const linhas = txt.split(/\r?\n/).filter((l) => l.trim());
      const cab = campos(linhas[0]).map((c) => c.toUpperCase());
      const ix = (re) => cab.findIndex((c) => re.test(c));
      const col = { entidade: ix(/ENTIDADE/), nome: ix(/^NOME/), orgao: ix(/^[ÓO]RG[ÃA]O/), lotacao: ix(/LOTA[ÇC][ÃA]O/),
        vinculo: ix(/V[ÍI]NCULO/), cargo: ix(/CARGO/), rem: ix(/REMUNERA[ÇC][ÃA]O/) };
      if (col.nome < 0 || col.rem < 0) return { regs: [], comp: alvo.comp };  // sem nome ou sem valor não serve
      const regs = [];
      for (const l of linhas.slice(1)) {
        const c = campos(l);
        const nome = c[col.nome] || "";
        if (!nome) continue;
        const orgao = c[col.orgao] || c[col.entidade] || "";
        regs.push({
          cod_ibge, municipio, uf, competencia: alvo.comp, matricula: null, nome,
          cargo: c[col.cargo] || null, secretaria: orgao || null, lotacao: c[col.lotacao] || orgao || null,
          vinculo: c[col.vinculo] || null,
          bruto: moedaPonto(c[col.rem]), descontos: null, liquido: null, fonte: `ckan pbh ${camada}`,
          // o valor entra no hash: sem ele, 1.354 linhas sumiam — quem tem DOIS vínculos (professor com dois cargos
          // iguais na mesma escola) vira uma linha só. A competência já está no hash e cada mês é imutável no CKAN,
          // então incluir o valor não gera duplicata em recoleta.
          _hash: crypto.createHash("md5").update([cod_ibge, alvo.comp, nome, c[col.cargo], orgao, c[col.lotacao], c[col.rem]].join("¦")).digest("hex"),
        });
      }
      return { regs, comp: alvo.comp };
    };
    const direta = await baixa("relatorio-do-funcionalismo-publico-administracao-direta", "direta");
    const indireta = await baixa("relatorio-do-funcionalismo-publico-administracao-indireta", "indireta");
    const regs = [...direta.regs, ...indireta.regs];
    const comp = direta.comp || indireta.comp;
    return { regs, comp,
      detalhe: `CKAN ${direta.regs.length} direta (${direta.comp}) + ${indireta.regs.length} indireta (${indireta.comp}) · com remuneração` };
  },

  // RECIFE — CKAN `dados.recife.pe.gov.br`, dataset `servidores`, recurso "Relação dos Servidores e salários".
  // O arquivo é ANUAL e acumula todos os meses do ano (266 mil linhas em 2026 = jan…jun) — filtrar a competência
  // mais recente pelas colunas `asalseanoo`/`asalsemess`, senão a base ganha 6 cópias de cada servidor.
  // Cabeçalho em código de sistema legado (34 campos): nsalsenome=nome, csalsematr=matrícula, nsalsecarg=cargo,
  // nsalsefunc=função, nsalseempr=órgão/empresa, nsalsecate=categoria, esalseunidade=unidade, eslserlotacao=lotação,
  // vsalseprov=proventos, vsalsedtot=descontos, vsalseliqd=líquido, eselsesituacao=Ativo/Desligado.
  // ⚠️ O decimal alterna DENTRO DA MESMA LINHA: vsalsedrrf="2252.72" ao lado de vsalsedtot="2252,72". Medido em
  //    06/2026: vírgula com 1-2 casas e inteiro dominam, zero ocorrência de milhar ("1.234,56") — então a regra é
  //    "tem vírgula? vírgula é o decimal; senão o ponto é". Nunca tratar ponto como separador de milhar aqui.
  // Traz aposentados (7.857) e pensionistas (2.476) junto, como o Rio: coletados também, separáveis por `vinculo`.
  "2611606": async ({ cod_ibge, municipio, uf }) => {
    const CK = "https://dados.recife.pe.gov.br/api/3/action";
    const j = await (await fetch(`${CK}/package_show?id=servidores`, { headers: UA, signal: AbortSignal.timeout(90000) })).json();
    const recs = (j?.result?.resources || []).filter((x) => /csv/i.test(x.format) && /salários|salarios/i.test(x.name))
      .map((x) => ({ ...x, ano: (String(x.name).match(/(20\d{2})/) || [])[1] })).filter((x) => x.ano)
      .sort((a, b) => b.ano.localeCompare(a.ano));
    if (!recs.length) return { regs: [], comp: null, detalhe: "CKAN sem CSV de servidores e salários" };
    const alvo = recs[0];
    const r = await fetch(alvo.url, { headers: { "user-agent": UA["user-agent"] }, redirect: "follow", signal: AbortSignal.timeout(300000) });
    const bufR = Buffer.from(await r.arrayBuffer());
    let txt = new TextDecoder("utf-8").decode(bufR);
    if (/�/.test(txt.slice(0, 4000))) txt = new TextDecoder("iso-8859-1").decode(bufR);
    const linhas = txt.split(/\r?\n/).filter((l) => l.trim());
    const cab = linhas[0].split(";").map((c) => c.trim());
    const ix = (n) => cab.indexOf(n);
    const col = { ano: ix("asalseanoo"), mes: ix("asalsemess"), matricula: ix("csalsematr"), nome: ix("nsalsenome"),
      empresa: ix("nsalseempr"), categoria: ix("nsalsecate"), cargo: ix("nsalsecarg"), funcao: ix("nsalsefunc"),
      unidade: ix("esalseunidade"), lotacao: ix("eslserlotacao"), prov: ix("vsalseprov"), desc: ix("vsalsedtot"),
      liq: ix("vsalseliqd"), situacao: ix("eselsesituacao") };
    if (col.nome < 0 || col.prov < 0) return { regs: [], comp: null, detalhe: "cabeçalho do CSV mudou de nome" };
    const moeda = (s) => {                                     // vírgula manda; sem vírgula, o ponto é o decimal
      let t = String(s ?? "").trim(); if (!t) return null;
      t = /,/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t;
      const n = +t; return Number.isFinite(n) ? n : null;
    };
    const corpo = linhas.slice(1).map((l) => l.split(";"));
    const comps = [...new Set(corpo.map((c) => `${c[col.ano]}${String(c[col.mes]).padStart(2, "0")}`))].sort();
    const comp = comps[comps.length - 1];
    const regs = [];
    for (const c of corpo) {
      if (`${c[col.ano]}${String(c[col.mes]).padStart(2, "0")}` !== comp) continue;
      const nome = (c[col.nome] || "").trim();
      if (!nome) continue;
      const funcao = (c[col.funcao] || "").trim();
      const cargo = [(c[col.cargo] || "").trim(), /SEM INFORMACAO/i.test(funcao) ? "" : funcao].filter(Boolean).join(" / ");
      const sit = (c[col.situacao] || "").trim();
      regs.push({
        cod_ibge, municipio, uf, competencia: comp, matricula: (c[col.matricula] || "").trim() || null, nome,
        cargo: cargo || null, secretaria: (c[col.empresa] || "").trim() || null,
        lotacao: (c[col.unidade] || c[col.lotacao] || "").trim() || null,
        vinculo: [(c[col.categoria] || "").trim(), sit && sit !== "Ativo" ? sit : ""].filter(Boolean).join(" · ") || null,
        bruto: moeda(c[col.prov]), descontos: moeda(c[col.desc]), liquido: moeda(c[col.liq]), fonte: "ckan recife",
        _hash: crypto.createHash("md5").update([cod_ibge, comp, c[col.matricula], nome, cargo, c[col.empresa]].join("¦")).digest("hex"),
      });
    }
    return { regs, comp, detalhe: `CKAN ${alvo.ano} · ${regs.length} de ${corpo.length} linhas (competência ${comp} de ${comps.length} no arquivo) · com remuneração` };
  },

  // SALVADOR — não tem CKAN. Tem um gerador de extração em `apitmptransparencia.salvador.ba.gov.br`, alcançado
  // pela tela "Pessoal em Dados Abertos". O caminho:
  //   GET  /api/dadosAbertos/obterCategorias           → categoria "Pessoal", subcategoria 11 = Remuneração
  //   GET  /api/dadosAbertos/obterCampos?subCategoriaId=11 → as 24 colunas (é daqui que sai o pedido, nada fixado)
  //   POST /api/dadosAbertos {dataInicio,dataFim,colunas,filtros:[],formato:"csv"} → CSV em text/plain (~10 MB, ~55s)
  // 🚨 A grid da tela de Remuneração (`POST /api/remuneracao/gridDetalhada`) NÃO traz valor — só nome, cargo,
  //    órgão, lotação, situação, vínculo. Mesma armadilha de Fortaleza: quem parar na grid conclui que Salvador
  //    não publica salário. O valor só sai por esta extração.
  // ⚠️ dataInicio = dataFim = o PRIMEIRO dia do mês; o CSV volta com a data do último dia na coluna "Data".
  // ⚠️ CSV com aspas E espaço depois do `;`, decimal em vírgula, linha terminada em `;`.
  "2927408": async ({ cod_ibge, municipio, uf }) => {
    const API = "https://apitmptransparencia.salvador.ba.gov.br/api";
    const H = { ...UA, "content-type": "application/json", accept: "application/json, text/plain, */*",
      origin: "https://transparencia.salvador.ba.gov.br", referer: "https://transparencia.salvador.ba.gov.br/" };
    const campos = await (await fetch(`${API}/dadosAbertos/obterCampos?subCategoriaId=11`, { headers: H, signal: AbortSignal.timeout(90000) })).json();
    const colunas = (campos || []).map((c) => ({ valor: c.campo, atributo: c.descricao, tabela: c.tabela }));
    if (!colunas.length) return { regs: [], comp: null, detalhe: "catálogo de campos vazio" };
    const trinca = (l) => {                                    // aspas + espaço após o separador
      const out = []; let cur = "", dentro = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (ch === '"') dentro = !dentro;
        else if (ch === ";" && !dentro) { out.push(cur.trim()); cur = ""; }
        else cur += ch;
      }
      out.push(cur.trim()); return out;
    };
    const moeda = (s) => { const t = String(s ?? "").replace(/\s/g, ""); if (!t) return null;
      const n = +(/,/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t); return Number.isFinite(n) ? n : null; };
    const hoje = new Date();
    for (let k = 0; k <= 6; k++) {                             // recuo: a competência do mês corrente pode não ter fechado
      const d = new Date(hoje); d.setDate(1); d.setMonth(hoje.getMonth() - k);
      const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      const r = await fetch(`${API}/dadosAbertos`, { method: "POST", headers: H, signal: AbortSignal.timeout(600000),
        body: JSON.stringify({ dataInicio: dia, dataFim: dia, colunas, filtros: [], formato: "csv" }) }).catch(() => null);
      if (!r || !r.ok) continue;
      const bufS = Buffer.from(await r.arrayBuffer());
      let txt = new TextDecoder("utf-8").decode(bufS);
      if (/�/.test(txt.slice(0, 4000))) txt = new TextDecoder("iso-8859-1").decode(bufS);
      const linhas = txt.split(/\r?\n/).filter((l) => l.trim());
      if (linhas.length < 2) continue;
      const cab = trinca(linhas[0]).map((c) => c.toUpperCase());
      const ix = (re) => cab.findIndex((c) => re.test(c));
      const col = { nome: ix(/^NOME/), cargo: ix(/^CARGO/), orgao: ix(/^[ÓO]RG[ÃA]O/), lotacao: ix(/LOTA[ÇC][ÃA]O/),
        matricula: ix(/MATR[ÍI]CULA/), vinculo: ix(/V[ÍI]NCULO/), situacao: ix(/SITUA[ÇC][ÃA]O/), tipo: ix(/^TIPO/),
        data: ix(/^DATA$/), total: ix(/REMUNERA[ÇC][ÃA]O TOTAL/), desc: ix(/TOTAL DESCONTOS/),
        liq: ix(/REMUNERA[ÇC][ÃA]O AP[ÓO]S/) };
      if (col.nome < 0 || col.total < 0) return { regs: [], comp: null, detalhe: "cabeçalho da extração mudou" };
      const comp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
      const regs = [];
      for (const l of linhas.slice(1)) {
        const c = trinca(l);
        const nome = (c[col.nome] || "").trim();
        if (!nome) continue;
        regs.push({
          cod_ibge, municipio, uf, competencia: comp, matricula: c[col.matricula] || null, nome,
          cargo: c[col.cargo] || null, secretaria: c[col.orgao] || null, lotacao: c[col.lotacao] || null,
          vinculo: [c[col.vinculo], c[col.tipo]].filter((x) => x && x !== "-").join(" · ") || null,
          bruto: moeda(c[col.total]), descontos: moeda(c[col.desc]), liquido: moeda(c[col.liq]), fonte: "extração dadosAbertos salvador",
          _hash: crypto.createHash("md5").update([cod_ibge, comp, c[col.matricula], nome, c[col.cargo], c[col.orgao], c[col.total]].join("¦")).digest("hex"),
        });
      }
      return { regs, comp, detalhe: `extração ${(bufS.length / 1048576).toFixed(1)} MB · ${linhas.length - 1} linhas · com remuneração, descontos e líquido` };
    }
    return { regs: [], comp: null, detalhe: "extração vazia nos últimos 7 meses" };
  },

  // MANAUS — portal GeneXus com dialeto próprio (não é o srv.br de [[pnigp-genexus-srvbr-scraper]]):
  //   POST /transparencia/servlet/transparencia.getlancamentos
  //   servico=SERVIDORES_PESSOAL&cliente=23&exercicio=AAAA&mes=M&numero=0&criterio=%&registros=N&pagina=1
  // A tela pagina de 12 em 12, mas `registros` é livre: 200000 devolve os ~34 mil de uma vez (38 MB, ~1 min).
  // O envelope é {registros: <total>, servidores: [...]} e cada item traz bruta, líquida e todos os descontos.
  // ⚠️ A resposta inclui o CPF COMPLETO de cada servidor — não é gravado aqui (a tabela não tem essa coluna e
  //    não há razão de negócio para guardá-lo).
  // ⚠️ Valores vêm com padding de espaços e no formato BR: "        22.000,00".
  "1302603": async ({ cod_ibge, municipio, uf }) => {
    const U = "https://transparencia.manaus.am.gov.br/transparencia/servlet/transparencia.getlancamentos";
    const H = { ...UA, "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      accept: "application/json, text/javascript, */*", referer: "https://transparencia.manaus.am.gov.br/transparencia/v2/" };
    const moedaBR = (s) => { const t = String(s ?? "").replace(/\s/g, ""); if (!t) return null;
      const n = +t.replace(/\./g, "").replace(",", "."); return Number.isFinite(n) ? n : null; };
    const pede = (ano, mes, n, pagina = 1) => fetch(U, { method: "POST", headers: H, signal: AbortSignal.timeout(600000),
      body: new URLSearchParams({ servico: "SERVIDORES_PESSOAL", cliente: "23", numero: "0", exercicio: String(ano),
        formato: "", mes: String(mes), objeto: "", criterio: "%", registros: String(n), pagina: String(pagina) }).toString() }).catch(() => null);
    // 🚨 o mês CORRENTE vem parcial (07/2026 devolvia 8.228 contra 33.975 de 06/2026) — a mesma armadilha do
    // MegaSoft e do GeneXus srv.br. Não basta "primeiro mês não-vazio": tem que ser o mês MAIS CHEIO.
    // `registros` no envelope é só o eco do pedido, não o total — mas `pagina` além do fim devolve lista vazia,
    // então dá para medir o tamanho de cada mês por busca binária com registros=1 (~17 respostas minúsculas,
    // 45s por mês) em vez de baixar 38 MB só para contar.
    const conta = async (ano, mes) => {
      const tem = async (p) => { const r = await pede(ano, mes, 1, p); if (!r || !r.ok) return false;
        const j = await r.json().catch(() => null); return (j?.servidores || []).length > 0; };
      if (!(await tem(1))) return 0;
      let lo = 1, hi = 2;
      while (await tem(hi)) { lo = hi; hi *= 2; if (hi > 500000) break; }
      while (lo + 1 < hi) { const m = Math.floor((lo + hi) / 2); if (await tem(m)) lo = m; else hi = m; }
      return lo;
    };
    const hoje = new Date();
    const candidatos = [];
    for (let k = 0; k <= 3; k++) {
      const d = new Date(hoje); d.setDate(1); d.setMonth(hoje.getMonth() - k);
      const n = await conta(d.getFullYear(), d.getMonth() + 1);
      if (n > 0) candidatos.push({ ano: d.getFullYear(), mes: d.getMonth() + 1, n });
    }
    if (!candidatos.length) return { regs: [], comp: null, detalhe: "SERVIDORES_PESSOAL vazio nos últimos 7 meses" };
    candidatos.sort((a, b) => b.n - a.n || `${b.ano}${b.mes}`.localeCompare(`${a.ano}${a.mes}`));
    {
      const { ano, mes } = candidatos[0];
      const r = await pede(ano, mes, 200000);
      if (!r || !r.ok) return { regs: [], comp: null, detalhe: "mês mais cheio recusou o pedido completo" };
      const j = await r.json().catch(() => null);
      const arr = j?.servidores || [];
      const comp = `${ano}${String(mes).padStart(2, "0")}`;
      const regs = arr.filter((s) => (s.ServNomeComp || "").trim()).map((s) => ({
        cod_ibge, municipio, uf, competencia: comp, matricula: (s.ServMatricula || "").trim() || null,
        nome: (s.ServNomeComp || "").trim(), cargo: (s.CargoDsc || "").trim() || null,
        secretaria: (s.SecNome || "").trim() || null, lotacao: (s.LotNome || "").trim() || null,
        vinculo: [(s.TipoVincDesc || "").trim(), (s.CargoTipoDsc || "").trim()].filter(Boolean).join(" · ") || null,
        bruto: moedaBR(s.FolhaVlrRemBruta), liquido: moedaBR(s.FolhaVlrRemLiq),
        descontos: (() => { const b = moedaBR(s.FolhaVlrRemBruta), l = moedaBR(s.FolhaVlrRemLiq);
          return b != null && l != null ? +(b - l).toFixed(2) : null; })(),
        fonte: "genexus manaus",
        _hash: crypto.createHash("md5").update([cod_ibge, comp, s.ServMatricula, s.ServNomeComp, s.CargoDsc, s.SecNome].join("¦")).digest("hex"),
      }));
      return { regs, comp,
        detalhe: `getlancamentos ${arr.length} registros · mês mais cheio de ${candidatos.length} sondados (${candidatos.map((c) => `${c.mes}/${String(c.ano).slice(2)}:${c.n}`).join(" ")}) · com bruta, líquida e descontos` };
    }
  },

  // GOIÂNIA — portal BSIT (JSF/RichFaces) em `goiania.bsit-br.com.br`, chegando pela categoria "Recursos Humanos"
  // da transparência → "Folha de Pagamento Detalhada" (`employee-transparency-simplified.jsf`).
  // A tela tem botão "Gerar CSV", e o fluxo são DOIS POSTs na mesma sessão:
  //   1) AJAXREQUEST=_viewRoot … &employeeSearchForm:generateCSV=…   (prepara o arquivo)
  //   2) …&employeeSearchForm:generateFile=true&…:downloadAnalyticFile=…  (devolve o CSV)
  // ⭐ Deixar `institutions` VAZIO devolve as 48 instituições de uma vez (50 mil linhas). Não precisa iterar —
  //    e de fato o filtro por instituição vem ignorado no replay, devolvendo sempre o mesmo recorte.
  // ⚠️ Separador é VÍRGULA (não `;`), com aspas nos monetários: `"R$ 5.204,47"`. Encoding ISO-8859-1.
  // ⚠️ `reference` (MM/AAAA) vem preenchido com o mês corrente, que pode estar em aberto — mesma armadilha de
  //    Manaus, então os últimos meses são medidos e vence o mais cheio.
  "5208707": async ({ cod_ibge, municipio, uf }) => {
    const BASE = "http://goiania.bsit-br.com.br/portal/employee-transparency-simplified.jsf";
    const r0 = await fetch(BASE, { headers: { "user-agent": UA["user-agent"], accept: "text/html" }, signal: AbortSignal.timeout(120000) });
    const html = await r0.text();
    const cookie = (r0.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
    const vs = (html.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/) || [])[1] || "j_id1";
    const H = { "user-agent": UA["user-agent"], "content-type": "application/x-www-form-urlencoded; charset=UTF-8", cookie, referer: BASE };
    const baixa = async (referencia) => {
      const campos = { employeeSearchForm: "employeeSearchForm", "employeeSearchForm:institutions": "",
        "employeeSearchForm:reference": referencia, "employeeSearchForm:registration": "", "employeeSearchForm:payrollTypeId": "",
        "employeeSearchForm:name": "", "employeeSearchForm:position": "", "employeeSearchForm:admissionType": "",
        "employeeSearchForm:generateFile": "false", "javax.faces.ViewState": vs };
      await fetch(BASE, { method: "POST", headers: H, signal: AbortSignal.timeout(600000),
        body: new URLSearchParams({ AJAXREQUEST: "_viewRoot", ...campos, "employeeSearchForm:generateCSV": "employeeSearchForm:generateCSV" }).toString() }).catch(() => null);
      const r = await fetch(BASE, { method: "POST", headers: H, signal: AbortSignal.timeout(600000),
        body: new URLSearchParams({ ...campos, "employeeSearchForm:generateFile": "true", "employeeSearchForm:downloadAnalyticFile": "employeeSearchForm:downloadAnalyticFile" }).toString() }).catch(() => null);
      if (!r || !r.ok) return null;
      const b = Buffer.from(await r.arrayBuffer());
      let t = new TextDecoder("utf-8").decode(b); if (/�/.test(t.slice(0, 3000))) t = new TextDecoder("iso-8859-1").decode(b);
      const L = t.split(/\r?\n/).filter((x) => x.trim());
      return L.length > 1 && /MATRICULA/i.test(L[0]) ? L : null;
    };
    const hoje = new Date();
    let melhor = null, medidos = [];
    for (let k = 0; k <= 3; k++) {
      const d = new Date(hoje); d.setDate(1); d.setMonth(hoje.getMonth() - k);
      const ref = `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
      const L = await baixa(ref);
      if (!L) continue;
      medidos.push(`${ref}:${L.length - 1}`);
      if (!melhor || L.length > melhor.L.length) melhor = { L, comp: `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}` };
    }
    if (!melhor) return { regs: [], comp: null, detalhe: "CSV vazio nos últimos 4 meses" };
    const campos = (l) => {                                    // separador VÍRGULA, com aspas
      const out = []; let cur = "", dentro = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (ch === '"') dentro = !dentro;
        else if (ch === "," && !dentro) { out.push(cur.trim()); cur = ""; }
        else cur += ch;
      }
      out.push(cur.trim()); return out;
    };
    const moeda = (s) => { const t = String(s ?? "").replace(/R\$|\s/g, ""); if (!t) return null;
      const n = +t.replace(/\./g, "").replace(",", "."); return Number.isFinite(n) ? n : null; };
    const cab = campos(melhor.L[0]).map((c) => c.toUpperCase());
    const ix = (re) => cab.findIndex((c) => re.test(c));
    const col = { matricula: ix(/MATRICULA/), nome: ix(/^NOME/), cargo: ix(/CARGO/), local: ix(/LOCAL_TRABALHO/),
      folha: ix(/TIPO_FOLHA/), admissao: ix(/TIPO_ADMISSAO/), prov: ix(/VALOR_PROVENTOS/), desc: ix(/VALOR_DESCONTOS/),
      liq: ix(/VALOR_LIQUIDO/) };
    if (col.nome < 0 || col.prov < 0) return { regs: [], comp: null, detalhe: "cabeçalho do CSV mudou" };
    const regs = [];
    for (const l of melhor.L.slice(1)) {
      const c = campos(l);
      const nome = (c[col.nome] || "").trim();
      if (!nome) continue;
      regs.push({
        cod_ibge, municipio, uf, competencia: melhor.comp, matricula: c[col.matricula] || null, nome,
        cargo: c[col.cargo] || null, secretaria: c[col.local] || null, lotacao: c[col.local] || null,
        vinculo: [c[col.admissao], c[col.folha]].filter(Boolean).join(" · ") || null,
        bruto: moeda(c[col.prov]), descontos: moeda(c[col.desc]), liquido: moeda(c[col.liq]), fonte: "bsit goiania",
        _hash: crypto.createHash("md5").update([cod_ibge, melhor.comp, c[col.matricula], nome, c[col.cargo], c[col.folha], c[col.prov]].join("¦")).digest("hex"),
      });
    }
    return { regs, comp: melhor.comp, detalhe: `CSV BSIT ${melhor.L.length - 1} linhas · mês mais cheio (${medidos.join(" ")}) · com proventos, descontos e líquido` };
  },

  // CURITIBA — portal de dados abertos próprio (não é CKAN), conjunto "Relações de servidores, cargos e encargos".
  // 🚨 O portal da transparência é um beco: `meta4/servidores.aspx` tem a grid com bruta e líquida, mas é ASP.NET
  //    WebForms com VIEWSTATE de 15 KB, 10 linhas por página e SEM exportação — seriam milhares de postbacks.
  //    (E `transparencia.curitiba.pr.gov.br` sem `www.` derruba a conexão; só o host com `www.` responde.)
  // O caminho bom: GET /ConjuntoDado/DownloadArquivos/?conjuntoDadoChave=…&conjuntoDadoExtensao=… devolve um JSON
  // com uma TABELA HTML listando um CSV por mês em `mid-dadosabertos.curitiba.pr.gov.br`. As URLs são descobertas
  // daí — não montadas à mão.
  // 🚨 Alguns meses são PUBLICADOS VAZIOS (272 bytes: 07/2026 e 01/2026). Escolher pelo tamanho, não pela data.
  // ⚠️ O arquivo é por EVENTO do contracheque (184 mil linhas para ~28 mil servidores): cada rubrica é uma linha e
  //    os totais vêm repetidos. Agrupar por servidor e ficar com TOT_VANTAGENS/TOTAL_DESCONTOS/TOTAL_LIQUIDO.
  // ⚠️ A 2ª linha do CSV é um separador visual de traços (`----;-----;…`) — descartar.
  // ⚠️ Decimal é PONTO. Não há matrícula: a identidade é nome+cargo+lotação.
  "4106902": async ({ cod_ibge, municipio, uf }) => {
    const CH = "cb9cbeb2-1c2c-48ba-a632-25edcb766744", EXT = "377f4e23-0e4f-4f11-954f-ae06ba689558";
    const H = { "user-agent": UA["user-agent"], accept: "application/json",
      referer: `https://dadosabertos.curitiba.pr.gov.br/conjuntodado/detalhe/?chave=${CH}` };
    const j = await (await fetch(`https://dadosabertos.curitiba.pr.gov.br/ConjuntoDado/DownloadArquivos/?conjuntoDadoChave=${CH}&conjuntoDadoExtensao=${EXT}`,
      { headers: H, signal: AbortSignal.timeout(300000) })).json().catch(() => null);
    const tabela = j?.tabela || "";
    const arquivos = [...tabela.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => m[1]).map((tr) => {
      const url = (tr.match(/https:\/\/[^'"]*Base_de_Dados\.csv/) || [])[0];
      const tam = (tr.match(/>\s*([\d.,]+)\s*(MB|KB|B)\s*</) || []).slice(1);
      const dia = (String(url || "").match(/(\d{4})-(\d{2})-\d{2}_/) || []).slice(1);
      if (!url || !dia.length) return null;
      const mb = tam[1] === "MB" ? parseFloat(String(tam[0]).replace(".", "").replace(",", ".")) : tam[1] === "KB" ? parseFloat(tam[0]) / 1024 : 0.0001;
      return { url, ano: dia[0], mesArquivo: dia[1], mb };
    }).filter(Boolean).filter((x) => x.mb > 1)                 // 🚨 os publicados vazios têm 272 B
      .sort((a, b) => `${b.ano}${b.mesArquivo}`.localeCompare(`${a.ano}${a.mesArquivo}`));
    if (!arquivos.length) return { regs: [], comp: null, detalhe: "nenhum CSV não-vazio no conjunto" };
    const alvo = arquivos[0];
    const r = await fetch(alvo.url, { headers: { "user-agent": UA["user-agent"] }, redirect: "follow", signal: AbortSignal.timeout(900000) });
    if (!r.ok) return { regs: [], comp: null, detalhe: `CSV recusou: HTTP ${r.status}` };
    const bufC = Buffer.from(await r.arrayBuffer());
    let txt = new TextDecoder("utf-8").decode(bufC);
    if (/�/.test(txt.slice(0, 4000))) txt = new TextDecoder("iso-8859-1").decode(bufC);
    const linhas = txt.split(/\r?\n/).filter((l) => l.trim() && !/^[-;\s]+$/.test(l));
    const cab = linhas[0].split(";").map((c) => c.replace(/"/g, "").trim().toUpperCase());
    const ix = (re) => cab.findIndex((c) => re.test(c));
    const col = { nome: ix(/^NOME/), cargo: ix(/^CARGO$/), comissao: ix(/CARGO_COMISSAO/), mes: ix(/^MES$/), ano: ix(/^ANO$/),
      lotacao: ix(/LOTACAO/), desc: ix(/TOTAL_DESCONTOS/), liq: ix(/TOTAL_LIQUIDO/), vant: ix(/TOT_VANTAGENS/) };
    if (col.nome < 0 || col.vant < 0) return { regs: [], comp: null, detalhe: "cabeçalho do CSV mudou" };
    const num = (s) => { const t = String(s ?? "").replace(/["\s]/g, ""); if (!t) return null;
      const n = +(/,/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t); return Number.isFinite(n) ? n : null; };
    // uma linha por EVENTO → agrupar por servidor
    const porServidor = new Map();
    let comp = null;
    for (const l of linhas.slice(1)) {
      const c = l.split(";");
      const nome = (c[col.nome] || "").trim();
      const mes = (c[col.mes] || "").trim(), ano = (c[col.ano] || "").trim();
      if (!nome || !/^\d+$/.test(mes) || !/^\d{4}$/.test(ano)) continue;
      comp = `${ano}${mes.padStart(2, "0")}`;
      const cargo = [(c[col.cargo] || "").trim(), (c[col.comissao] || "").trim()].filter(Boolean).join(" / ");
      const lot = (c[col.lotacao] || "").trim();
      const chave = [nome, cargo, lot, c[col.vant], c[col.liq]].join("¦");
      if (!porServidor.has(chave)) porServidor.set(chave, { nome, cargo, lot, vant: c[col.vant], desc: c[col.desc], liq: c[col.liq], comp });
    }
    const regs = [...porServidor.values()].map((s) => ({
      cod_ibge, municipio, uf, competencia: s.comp, matricula: null, nome: s.nome,
      cargo: s.cargo || null, secretaria: s.lot || null, lotacao: s.lot || null, vinculo: null,
      bruto: num(s.vant), descontos: num(s.desc), liquido: num(s.liq), fonte: "dados abertos curitiba",
      _hash: crypto.createHash("md5").update([cod_ibge, s.comp, s.nome, s.cargo, s.lot, s.vant].join("¦")).digest("hex"),
    }));
    return { regs, comp,
      detalhe: `CSV ${(bufC.length / 1048576).toFixed(1)} MB · ${linhas.length - 1} linhas de evento → ${regs.length} servidores · ${arquivos.length} meses não-vazios no conjunto` };
  },

  // BOA VISTA — o portal é CR2 (`portalcr2.com.br/entidade/boa-vista`), mas NÃO é o CR2 clássico do Pará.
  // 🚨 A regra do foff_id de [[pnigp-cr2-elotech-folha-norte-parana]] NÃO vale aqui: `folha.governotransparente
  //    .com.br/{ibge}01/...` devolve HTTP 500 em todas as variantes (IBGE6+01 e IBGE7+01). E a API Bubble
  //    `portalcr2.com.br/api/1.1/obj/relacao_nominal_remuneracao` (707 registros) não tem Boa Vista.
  // O caminho real: CR2 → "Relação Nominal de Remuneração" → botão "Acessar" → abre um Cloudflare Worker:
  //   https://sip-proxy-transparencia.code-evandrojr.workers.dev/api/servidores?pagina=N&porPagina=100
  // ⭐ A LISTAGEM JÁ TRAZ `remuneracao_atual` — não precisa da ficha individual, apesar de a tela dizer que a
  //    remuneração é "carregada sob demanda" (o botão "Ver remuneração" é só a UI escondendo o campo que já veio).
  // ⚠️ `porPagina` é teto 100 no servidor: pedir 20000 devolve 100. São ~153 páginas para 15.221 servidores.
  // A competência sai de `ultimaSincronizacao` do próprio envelope.
  "1400100": async ({ cod_ibge, municipio, uf }) => {
    const B = "https://sip-proxy-transparencia.code-evandrojr.workers.dev";
    const H = { ...UA, accept: "application/json", referer: B + "/" };
    const pega = async (pagina) => {
      for (let t = 1; t <= 3; t++) {
        const r = await fetch(`${B}/api/servidores?pagina=${pagina}&porPagina=100`, { headers: H, signal: AbortSignal.timeout(180000) }).catch(() => null);
        if (r?.ok) { const j = await r.json().catch(() => null); if (j) return j; }
        await dorme(3000 * t);
      }
      return null;
    };
    const p1 = await pega(1);
    if (!p1?.resultados?.length) return { regs: [], comp: null, detalhe: "API do worker não respondeu" };
    const total = +p1.total || 0;
    const paginas = Math.ceil(total / 100);
    const sinc = String(p1.ultimaSincronizacao || "");
    const comp = sinc ? `${sinc.slice(0, 4)}${sinc.slice(5, 7)}` : null;
    const todos = [...p1.resultados];
    for (let p = 2; p <= paginas; p++) {
      const j = await pega(p);
      if (!j?.resultados?.length) break;
      todos.push(...j.resultados);
      await dorme(300);
    }
    const regs = todos.filter((s) => (s.nome || "").trim()).map((s) => ({
      cod_ibge, municipio, uf, competencia: comp, matricula: (s.matricula || s.registro || "").trim() || null,
      nome: s.nome.trim(), cargo: (s.cargo || "").trim() || null,
      secretaria: (s.unidade || "").trim() || null, lotacao: (s.local_trabalho || s.unidade || "").trim() || null,
      vinculo: (s.vinculo || "").trim() || null,
      bruto: money(s.remuneracao_atual), descontos: null, liquido: null, fonte: "worker cr2 boa vista",
      _hash: crypto.createHash("md5").update([cod_ibge, comp, s.entidade, s.registro, s.matricula, s.nome, s.cargo].join("¦")).digest("hex"),
    }));
    return { regs, comp, detalhe: `API ${todos.length} de ${total} · ${paginas} páginas · sincronizado em ${sinc.slice(0, 10)} · com remuneração` };
  },

  // NATAL — portal próprio (`www2.natal.rn.gov.br/transparencia`) com API REST de apoio e ficha individual.
  //   GET  /transparenciaapi/folha_pagamentos/getAnos/{instituicao}         → anos
  //   GET  /transparenciaapi/folha_pagamentos/getMeses/{ano}/{instituicao}  → meses
  //   POST /transparencia/servidores-folha.php                              → HTML com a lista INTEIRA embutida
  //   GET  /transparenciaapi/folha_pagamentos/view/{id}                     → a ficha, onde está o VALOR
  // 🚨 O POST só devolve dados com `pesquisaFolhas=pesquisaFolhas` e `demitidos=false` — sem esses dois campos
  //    (que não aparecem na URL, só no submit do form) a resposta vem com 48 KB e ZERO linha. É a mesma lei do
  //    Elotech/Betha: o app manda mais do que a URL mostra.
  // ⭐ A lista NÃO é paginada no servidor: as 5,6 mil linhas vêm embutidas no HTML como
  //    `{"cell":[matrícula,nome,cargo,lotação],"id":N}` e o DataTables só as renderiza no cliente.
  // ⚠️ São 7 instituições (prefeitura, previdência, autarquias) — iterar todas, senão fica só a prefeitura.
  // ⚠️ A ficha traz CPF mascarado; não é gravado.
  "2408102": async ({ cod_ibge, municipio, uf }) => {
    const B = "https://www2.natal.rn.gov.br";
    // ⚠️ as rotas /transparenciaapi só respondem JSON com `x-requested-with: XMLHttpRequest`; sem ele devolvem a
    //    página HTML e o coletor conclui "nenhuma instituição devolveu servidores".
    const H = { "user-agent": UA["user-agent"], accept: "*/*", referer: `${B}/transparencia/servidores.php`,
      "x-requested-with": "XMLHttpRequest" };
    const dec2 = (b) => { let t = new TextDecoder("utf-8").decode(b); if (/�/.test(t.slice(0, 4000))) t = new TextDecoder("iso-8859-1").decode(b); return t; };
    const gj = async (p) => { const r = await fetch(B + p, { headers: H, signal: AbortSignal.timeout(120000) }).catch(() => null);
      if (!r?.ok) return null; return r.json().catch(() => null); };
    // instituições saem da própria tela
    const home = await fetch(`${B}/transparencia/servidores.php`, { headers: H, signal: AbortSignal.timeout(120000) }).then((r) => r.text()).catch(() => "");
    const bloco = (home.match(/<select[^>]*id="FiltroInstituicao"[\s\S]*?<\/select>/i) || [""])[0];
    const insts = [...bloco.matchAll(/<option[^>]*value=["'](\d+)["'][^>]*>([^<]+)/gi)].map((m) => ({ v: m[1], t: m[2].trim() }));
    if (!insts.length) return { regs: [], comp: null, detalhe: "não achei as instituições na tela" };
    const lista = [];
    let comp = null;
    for (const inst of insts) {
      const anos = await gj(`/transparenciaapi/folha_pagamentos/getAnos/${inst.v}`);
      const ano = Object.keys(anos || {}).sort().pop();
      if (!ano) continue;
      const meses = await gj(`/transparenciaapi/folha_pagamentos/getMeses/${ano}/${inst.v}`);
      const mes = Object.keys(meses || {}).map(Number).sort((a, b) => a - b).pop();
      if (!mes) continue;
      const r = await fetch(`${B}/transparencia/servidores-folha.php`, { method: "POST", redirect: "follow", signal: AbortSignal.timeout(300000),
        headers: { ...H, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ instituicao: inst.v, ano, mes: String(mes), cargo: "", lotacao: "", vinculo: "",
          matricula: "", demitidos: "false", nome: "", pesquisaFolhas: "pesquisaFolhas" }).toString() }).catch(() => null);
      if (!r?.ok) continue;
      const html = dec2(Buffer.from(await r.arrayBuffer()));
      const achados = [...html.matchAll(/\{"cell":\[([^\]]*)\],"id":"(\d+)"\}/g)].map((m) => {
        let cel; try { cel = JSON.parse("[" + m[1] + "]"); } catch { return null; }
        return { matricula: cel[0], nome: cel[1], cargo: cel[2], lotacao: cel[3], id: m[2], inst: inst.t };
      }).filter(Boolean);
      comp = `${ano}${String(mes).padStart(2, "0")}`;
      lista.push(...achados);
      await dorme(500);
    }
    if (!lista.length) return { regs: [], comp: null, detalhe: "nenhuma instituição devolveu servidores" };
    // as fichas, com concorrência limitada (o valor só existe aqui)
    const num = (s) => { const t = String(s ?? "").replace(/[^\d,.-]/g, ""); if (!t) return null;
      const n = +t.replace(/\./g, "").replace(",", "."); return Number.isFinite(n) ? n : null; };
    const ficha = async (id) => {
      for (let t = 1; t <= 3; t++) {
        const r = await fetch(`${B}/transparenciaapi/folha_pagamentos/view/${id}`, { headers: { ...H, "x-requested-with": "XMLHttpRequest" }, signal: AbortSignal.timeout(90000) }).catch(() => null);
        if (r?.ok) {
          const t2 = dec2(Buffer.from(await r.arrayBuffer())).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&eacute;/g, "é").replace(/\s+/g, " ");
          const pega = (re) => { const m = t2.match(re); return m ? num(m[1]) : null; };
          return { base: pega(/Sal[áa]rio Base:\s*([\d.,]+)/i), bruto: pega(/Total Bruto\s*([\d.,]+)/i),
            desc: pega(/Total Descontos?\s*([\d.,]+)/i), liq: pega(/(?:Total )?L[íi]quido\s*([\d.,]+)/i) };
        }
        await dorme(1500 * t);
      }
      return null;
    };
    const CONC = 5;
    const valores = new Map();
    for (let i = 0; i < lista.length; i += CONC) {
      const lote = lista.slice(i, i + CONC);
      const res = await Promise.all(lote.map((s) => ficha(s.id)));
      lote.forEach((s, k) => { if (res[k]) valores.set(s.id, res[k]); });
      if ((i + CONC) % 500 < CONC) console.log(`    natal: ${Math.min(i + CONC, lista.length)}/${lista.length} fichas`);
      await dorme(200);
    }
    const regs = lista.map((s) => {
      const v = valores.get(s.id) || {};
      return { cod_ibge, municipio, uf, competencia: comp, matricula: s.matricula || null, nome: s.nome,
        cargo: s.cargo || null, secretaria: s.lotacao || null, lotacao: s.lotacao || null, vinculo: s.inst || null,
        bruto: v.bruto ?? v.base ?? null, descontos: v.desc ?? null, liquido: v.liq ?? null, fonte: "portal natal",
        _hash: crypto.createHash("md5").update([cod_ibge, comp, s.id, s.matricula, s.nome].join("¦")).digest("hex") };
    });
    const comValor = regs.filter((r) => r.bruto != null).length;
    return { regs, comp, detalhe: `${insts.length} instituições · ${lista.length} servidores · ${comValor} com remuneração (ficha a ficha)` };
  },

  // CUIABÁ — GeneXus, mas de DIALETO diferente do de Manaus (lá era `servlet/transparencia.getlancamentos`; aqui
  // é `servlet/aapi*`). O caminho: `aapimenu` → menu "Servidores" (/servidor) → `aapisubmenuall?/servidor,0,,1`
  // → submenu "REMUNERAÇÃO SERVIDORES ATIVOS" (nome `ativos`) → tela `#/servidor/ativos`, que consulta:
  //   POST /portaltransparencia/servlet/aapiservidorativo   (multipart, DOIS campos JSON)
  //     pagination = {"currentPage":N,"recordsPerPage":1000,"totalRecords":0,"columnOrder":""}
  //     filters    = {"FolhaAno":"2026","FolhaMesIni":"6","FolhaMesFim":"6", …}
  // ⚠️ `recordsPerPage` aceita 1000 mas 50000 devolve VAZIO — paginar de mil em mil.
  // ⚠️ A rota `/portaltransparencia/servidor/ativos` dá 404: o portal é SPA, o caminho real tem `/transparencia/#/`.
  // ⚠️ Sem filtro de ano a base tem 438 mil linhas (todos os anos); com ano, 219 mil (todos os meses e tipos de
  //    folha). Cada servidor aparece MAIS DE UMA VEZ no mês — salário, férias, 13º — separados por `FolhaTipoDsc`.
  // ⚠️ Nomes vêm com padding gigante de espaços. E o CPF vem COMPLETO na resposta: não é gravado.
  "5103403": async ({ cod_ibge, municipio, uf }) => {
    const U = "http://transparencia.cuiaba.mt.gov.br/portaltransparencia/servlet/aapiservidorativo";
    const H = { "user-agent": UA["user-agent"], accept: "application/json, text/plain, */*",
      referer: "http://transparencia.cuiaba.mt.gov.br/portaltransparencia/transparencia/" };
    const pede = async (filtros, porPagina, pagina = 0) => {
      for (let t = 1; t <= 3; t++) {
        const fd = new FormData();
        fd.append("pagination", JSON.stringify({ currentPage: pagina, recordsPerPage: porPagina, totalRecords: 0, columnOrder: "" }));
        fd.append("filters", JSON.stringify({ FolhaOrgaoNome: "", FolhaLotacaoNome: "", FolhaNome: "", FolhaCPF: "",
          FolhaMatricula: "", FolhaSituacaoFunc: "", FolhaAno: "", FolhaMesIni: "", FolhaMesFim: "", ...filtros }));
        const r = await fetch(U, { method: "POST", headers: H, body: fd, signal: AbortSignal.timeout(300000) }).catch(() => null);
        if (r?.ok) { const j = await r.json().catch(() => null); const e = Array.isArray(j) ? j[0] : j; if (e) return e; }
        await dorme(3000 * t);
      }
      return null;
    };
    // mês mais cheio dentro do ano corrente (o mês em aberto vem menor — mesma regra de Manaus e Goiânia)
    const hoje = new Date();
    const ano = String(hoje.getFullYear());
    const medidas = [];
    for (let m = 1; m <= 12; m++) {
      const x = await pede({ FolhaAno: ano, FolhaMesIni: String(m), FolhaMesFim: String(m) }, 1);
      const n = +(x?.totalRecords || 0);
      if (n > 0) medidas.push({ m, n });
      await dorme(150);
    }
    if (!medidas.length) return { regs: [], comp: null, detalhe: `sem registros em ${ano}` };
    medidas.sort((a, b) => b.n - a.n);
    const { m: mes, n: total } = medidas[0];
    const comp = `${ano}${String(mes).padStart(2, "0")}`;
    const todos = [];
    for (let p = 0; p * 1000 < total; p++) {
      const x = await pede({ FolhaAno: ano, FolhaMesIni: String(mes), FolhaMesFim: String(mes) }, 1000, p);
      if (!x?.registers?.length) break;
      todos.push(...x.registers);
      await dorme(250);
    }
    const lim = (s) => String(s ?? "").replace(/\s+/g, " ").trim() || null;
    const regs = todos.filter((s) => lim(s.FolhaNome)).map((s) => ({
      cod_ibge, municipio, uf, competencia: comp, matricula: s.FolhaMatricula ? String(s.FolhaMatricula) : null,
      nome: lim(s.FolhaNome), cargo: lim(s.FolhaCargo), secretaria: lim(s.FolhaOrgaoNome), lotacao: lim(s.FolhaLotacaoNome),
      vinculo: [lim(s.FolhaSituacaoFuncDsc), lim(s.FolhaTipoDsc)].filter(Boolean).join(" · ") || null,
      bruto: +s.FolhaVlrBruta || null, descontos: +s.FolhaVlrDescTotal || null, liquido: +s.FolhaVlrLiquida || null,
      fonte: "genexus cuiaba",
      _hash: crypto.createHash("md5").update([cod_ibge, comp, s.FolhaId].join("¦")).digest("hex"),
    }));
    return { regs, comp,
      detalhe: `${todos.length} de ${total} linhas de folha · mês mais cheio de ${medidas.length} (${medidas.slice(0, 4).map((x) => `${x.m}:${x.n}`).join(" ")}) · com bruta, líquida e descontos` };
  },

  // MACEIÓ — JSF/PrimeFaces (`transparencia.maceio.al.gov.br/.../servidores.faces?i=4`) com DataExporter.
  // Fluxo: GET (cookie + ViewState) → POST ajax "Consultar" (ano/mês) → POST comum com o id do exportador CSV.
  // ⭐ O CSV traz a folha inteira do mês (29,8 mil linhas em 07/2026) com Vencimento, Benefícios, Comissão,
  //    Redutor, Eventuais, Hora, Previdência, IRRF e Remuneração Bruta.
  // ⚠️ Os ids `j_idtNN` são gerados pelo JSF e MUDAM a cada versão da página — descobrir pelo `title="Exportar
  //    dados para CSV"` e pelo texto do botão Consultar, nunca fixar (foi a lei do DESCOBRIR-não-FIXAR).
  // ⚠️ Pelo navegador a consulta devolvia "Nenhum resultado" — o replay HTTP funciona. Não insistir na UI.
  // ⚠️ Um servidor com dois vínculos aparece em DUAS linhas (mesmo CPF, cargos diferentes) — é a folha, não erro.
  "2704302": async ({ cod_ibge, municipio, uf }) => {
    const B = "https://www.transparencia.maceio.al.gov.br/transparencia/pages/servidores.faces";
    const dec2 = (b) => { let t = new TextDecoder("utf-8").decode(b); if (/�/.test(t.slice(0, 4000))) t = new TextDecoder("iso-8859-1").decode(b); return t; };
    const r0 = await fetch(`${B}?i=4`, { headers: { "user-agent": UA["user-agent"], accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(120000) }).catch(() => null);
    if (!r0?.ok) return { regs: [], comp: null, detalhe: "portal não abriu" };
    const html = dec2(Buffer.from(await r0.arrayBuffer()));
    const cookie = (r0.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
    const vs = (html.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/) || [])[1];
    const idCsv = (html.match(/title="Exportar dados para CSV"[^>]*onclick="[^"]*\{'(form-servidores:[^']+)'/i) || [])[1];
    // ⚠️ casar "id=… Consultar" solto pega o elemento ANTERIOR (j_idt78 em vez de j_idt79, e aí a consulta volta
    //    com 0 registros). Varrer os <button> inteiros e ficar com o que REALMENTE contém "Consultar".
    const idConsultar = [...html.matchAll(/<button[^>]*id="(form-servidores:j_idt\d+)"[^>]*>([\s\S]{0,400}?)<\/button>/gi)]
      .find((m) => /Consultar/i.test(m[2]))?.[1];
    if (!vs || !idCsv) return { regs: [], comp: null, detalhe: "não achei ViewState ou o id do exportador CSV" };
    const H = { "user-agent": UA["user-agent"], cookie, "content-type": "application/x-www-form-urlencoded; charset=UTF-8", referer: `${B}?i=4` };
    // ⚠️ `form-servidores:formDownload` é um campo que o form envia sempre; sem ele a consulta volta com 0 registros
    //    (mais um caso da lei "o app manda mais do que a URL mostra").
    const base = (ano, mes) => ({ "form-servidores": "form-servidores", "form-servidores:selectMes": String(mes),
      "form-servidores:selectAno": String(ano), "form-servidores:nomeServidores": "", "form-servidores:cpfServidores": "",
      "form-servidores:selectNaturezaServidores": "", "form-servidores:formDownload": "form-servidores:formDownload",
      "javax.faces.ViewState": vs });
    const consulta = async (ano, mes) => {
      const r = await fetch(`${B}?i=4`, { method: "POST", signal: AbortSignal.timeout(300000),
        headers: { ...H, "faces-request": "partial/ajax", "x-requested-with": "XMLHttpRequest" },
        body: new URLSearchParams({ "javax.faces.partial.ajax": "true", "javax.faces.source": idConsultar || "form-servidores:j_idt79",
          "javax.faces.partial.execute": "@all",
          "javax.faces.partial.render": "form-servidores:msg-servidores form-servidores:tabela-servidores form-servidores:tabela-servidores-dt",
          [idConsultar || "form-servidores:j_idt79"]: idConsultar || "form-servidores:j_idt79", ...base(ano, mes) }).toString() }).catch(() => null);
      if (!r?.ok) return 0;
      const t = dec2(Buffer.from(await r.arrayBuffer()));
      return +(String((t.match(/(\d[\d.]*)\s*registros?/i) || [])[1] || "0").replace(/\./g, "")) || 0;
    };
    const hoje = new Date();
    const medidas = [];
    for (let k = 0; k <= 3; k++) {
      const d = new Date(hoje); d.setDate(1); d.setMonth(hoje.getMonth() - k);
      const n = await consulta(d.getFullYear(), d.getMonth() + 1);
      if (n > 0) medidas.push({ ano: d.getFullYear(), mes: d.getMonth() + 1, n });
      await dorme(400);
    }
    if (!medidas.length) return { regs: [], comp: null, detalhe: "nenhuma competência com registros" };
    medidas.sort((a, b) => b.n - a.n);
    const { ano, mes } = medidas[0];
    await consulta(ano, mes);                                 // o exportador exporta o resultado CORRENTE
    const rc = await fetch(`${B}?i=4`, { method: "POST", headers: H, redirect: "follow", signal: AbortSignal.timeout(600000),
      body: new URLSearchParams({ ...base(ano, mes), [idCsv]: idCsv }).toString() }).catch(() => null);
    if (!rc?.ok) return { regs: [], comp: null, detalhe: "exportador CSV não respondeu" };
    const buf = Buffer.from(await rc.arrayBuffer());
    const linhas = dec2(buf).split(/\r?\n/).filter((l) => l.trim());
    if (linhas.length < 2) return { regs: [], comp: null, detalhe: "CSV veio vazio" };
    const campos = (l) => { const out = []; let cur = "", dentro = false;
      for (let i = 0; i < l.length; i++) { const ch = l[i];
        if (ch === '"') dentro = !dentro; else if (ch === ";" && !dentro) { out.push(cur.trim()); cur = ""; } else cur += ch; }
      out.push(cur.trim()); return out; };
    const cab = campos(linhas[0]).map((c) => c.toUpperCase());
    const ix = (re) => cab.findIndex((c) => re.test(c));
    const col = { nome: ix(/SERVIDOR/), orgao: ix(/SECRETARIA|[ÓO]RG[ÃA]O/), cargo: ix(/CARGO/), vinculo: ix(/V[ÍI]NCULO/),
      bruta: ix(/REMUNERA[ÇC][ÃA]O BRUTA/), prev: ix(/PREVID[ÊE]NCIA/), irrf: ix(/IRRF/), ref: ix(/REFER[ÊE]NCIA/) };
    if (col.nome < 0 || col.bruta < 0) return { regs: [], comp: null, detalhe: "cabeçalho do CSV mudou" };
    const moeda = (s) => { const t = String(s ?? "").replace(/[^\d,.-]/g, ""); if (!t) return null;
      const n = +t.replace(/\./g, "").replace(",", "."); return Number.isFinite(n) ? n : null; };
    const comp = `${ano}${String(mes).padStart(2, "0")}`;
    const regs = [];
    for (const l of linhas.slice(1)) {
      const c = campos(l);
      const nome = (c[col.nome] || "").trim();
      if (!nome) continue;
      const desc = (moeda(c[col.prev]) || 0) + (moeda(c[col.irrf]) || 0);
      regs.push({
        cod_ibge, municipio, uf, competencia: comp, matricula: null, nome, cargo: c[col.cargo] || null,
        secretaria: c[col.orgao] || null, lotacao: c[col.orgao] || null, vinculo: c[col.vinculo] || null,
        bruto: moeda(c[col.bruta]), descontos: desc || null,
        liquido: moeda(c[col.bruta]) != null ? +(moeda(c[col.bruta]) - desc).toFixed(2) : null,
        fonte: "jsf maceio",
        _hash: crypto.createHash("md5").update([cod_ibge, comp, nome, c[col.cargo], c[col.orgao], c[col.bruta]].join("¦")).digest("hex"),
      });
    }
    return { regs, comp,
      detalhe: `CSV ${(buf.length / 1048576).toFixed(1)} MB · ${linhas.length - 1} linhas · mês mais cheio (${medidas.map((m) => `${m.mes}:${m.n}`).join(" ")}) · com bruta, previdência e IRRF` };
  },

  // JOÃO PESSOA — API REST na PORTA 8080 (`transparencia.joaopessoa.pb.gov.br:8080/servidores`).
  // 🚨 As rotas que aparecem na home são todas AGREGADAS (`total-vinculos`, `tabela-vinculos-secretaria`,
  //    `tabela-vinculos-cargo`) e enganam: parecem ser tudo o que existe. A NOMINAL só aparece na tela
  //    `#/servidores/listagem` ("Folha de Pagamento" / "Detalhes dos Servidores"):
  //      GET /servidores/tabelao-filtragem?limit=N&offset=0&ano=AAAA
  //    devolvendo `{result:[…], result_length}` com nome, matrícula, cargo, secretaria, tipo de contratação e
  //    **bruto e líquido**. ⚠️ Rotas inexistentes respondem 500 (não 404), então sondar às cegas não distingue.
  // ⭐ `limit=200000` devolve o ANO INTEIRO de uma vez (150 mil linhas = 6 meses empilhados) — agrupar por
  //    `mes_ano_referencia` e ficar com o mês mais cheio, como em Recife.
  // ⚠️ CPF vem mascarado na origem (`XXX298874XX`); não é gravado.
  "2507507": async ({ cod_ibge, municipio, uf }) => {
    const B = "https://transparencia.joaopessoa.pb.gov.br:8080/servidores";
    const H = { ...UA, accept: "application/json", referer: "https://transparencia.joaopessoa.pb.gov.br/" };
    const ano = String(new Date().getFullYear());
    let j = null;
    for (let t = 1; t <= 3; t++) {
      const r = await fetch(`${B}/tabelao-filtragem?limit=200000&offset=0&ano=${ano}`, { headers: H, signal: AbortSignal.timeout(600000) }).catch(() => null);
      if (r?.ok) { j = await r.json().catch(() => null); if (j?.result?.length) break; }
      await dorme(4000 * t);
    }
    if (!j?.result?.length) return { regs: [], comp: null, detalhe: `tabelao-filtragem sem dados em ${ano}` };
    const porMes = {};
    for (const s of j.result) { const m = String(s.mes_ano_referencia || "").slice(0, 7); if (m) porMes[m] = (porMes[m] || 0) + 1; }
    const ordenado = Object.entries(porMes).sort((a, b) => b[1] - a[1]);
    if (!ordenado.length) return { regs: [], comp: null, detalhe: "sem mes_ano_referencia nos registros" };
    const [mesTop] = ordenado[0];
    const comp = mesTop.replace("-", "");
    const regs = j.result.filter((s) => String(s.mes_ano_referencia || "").startsWith(mesTop) && String(s.nome_servidor || "").trim())
      .map((s) => ({
        cod_ibge, municipio, uf, competencia: comp, matricula: String(s.matricula || "").trim() || null,
        nome: String(s.nome_servidor).trim(), cargo: String(s.cargo || s.mascara_cargo || "").trim() || null,
        secretaria: String(s.secretaria || "").trim() || null, lotacao: String(s.secretaria || "").trim() || null,
        vinculo: String(s.tipo_contratacao || "").trim() || null,
        bruto: Number.isFinite(+s.bruto) ? +s.bruto : null, descontos: (Number.isFinite(+s.bruto) && Number.isFinite(+s.liquido)) ? +(+s.bruto - +s.liquido).toFixed(2) : null,
        liquido: Number.isFinite(+s.liquido) ? +s.liquido : null, fonte: "api joao pessoa",
        _hash: crypto.createHash("md5").update([cod_ibge, comp, s.id, s.matricula, s.nome_servidor].join("¦")).digest("hex"),
      }));
    return { regs, comp,
      detalhe: `API ${j.result.length} linhas do ano · mês mais cheio ${mesTop} (${ordenado.slice(0, 4).map(([m, n]) => `${m.slice(5)}:${n}`).join(" ")}) · com bruto e líquido` };
  },

  // PORTO ALEGRE — resolvida pelo RELATÓRIO, não pela navegação.
  // 🚨 O caminho óbvio é uma armadilha cara: a lista pagina de 23 em 23 (1.489 páginas) e o valor só aparece na
  //    ficha individual, uma por servidor — 34 mil requisições que, medidas, rendiam 2,2/min (≈258 h) porque o
  //    servidor recusa acesso repetido. Ver [[pnigp-capitais-goiania-curitiba-poa]].
  // ⭐ O portal tem um RELATÓRIO que exporta tudo de uma vez. O botão chama `invokePrint(action, acao, params)`,
  //    e `popupScript.js` revela que a URL final é `{action}?{params}&acao={CSV|XLS|HTML}`:
  //      GET /portalpmpa/fpRemuneracaoRelatorio.do?perform=run&…&acao=CSV   → 8 MB, 34.237 linhas, ~30 s
  // 🚨 **O relatório precisa de uma PESQUISA ativa na mesma sessão** (o Struts guarda o resultado na sessão);
  //    sem ela vem só o cabeçalho.
  // 🚨 **E os parâmetros NÃO podem ser a string `null`** — que é exatamente o que o botão do próprio portal manda
  //    (`criterioNomeServidor=null&secretariaSelecionada=null…`). Com `null` o CSV volta VAZIO; com strings
  //    vazias, vem a folha inteira. O export do site provavelmente está quebrado por isso.
  // Colunas: Competência, Nome, Órgão, Órgão de exercício, Cargo, Referência, Tipo de folha, Matrícula,
  // Remuneração básica bruta, Gratificação natalina, Férias, Outras eventuais, Abate teto, IRRF, Previdência
  // oficial, Seguro, Remuneração após deduções obrigatórias, Demais deduções, Salário família, Jetons, Diárias,
  // Demais verbas indenizatórias, Nível do posto de confiança.
  "4314902": async ({ cod_ibge, municipio, uf }) => {
    const RAIZ = "https://portaltransparenciapmpa.procempa.com.br/portalpmpa";
    const dec2 = (b) => { let t = new TextDecoder("utf-8").decode(b); if (/�/.test(t.slice(0, 4000))) t = new TextDecoder("iso-8859-1").decode(b); return t; };
    const tenta = async (fn, n = 4) => { for (let i = 1; i <= n; i++) { const r = await fn().catch(() => null); if (r) return r; await dorme(7000 * i); } return null; };
    const r0 = await tenta(() => fetch(`${RAIZ}/fpRemuneracaoPesquisa.do?viaMenu=true`, { headers: { "user-agent": UA["user-agent"] }, signal: AbortSignal.timeout(120000) }));
    if (!r0) return { regs: [], comp: null, detalhe: "portal não abriu" };
    const h0 = dec2(Buffer.from(await r0.arrayBuffer()));
    const cookie = (r0.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
    const U = new URL((h0.match(/action="([^"]+)"/) || [])[1] || "/portalpmpa/fpRemuneracaoPesquisa.do", `${RAIZ}/`).href;
    const H = { "user-agent": UA["user-agent"], cookie, referer: `${RAIZ}/fpRemuneracaoPesquisa.do?viaMenu=true` };
    // as competências vêm do próprio combo (formato 01/MM/AAAA)
    const combo = (h0.match(/<select[^>]*name="competenciaSelecionadaAsString"[\s\S]*?<\/select>/i) || [""])[0];
    const comps = [...combo.matchAll(/value="(\d{2}\/\d{2}\/\d{4})"/g)].map((m) => m[1]);
    if (!comps.length) return { regs: [], comp: null, detalhe: "não achei o combo de competências" };
    const pesquisa = (competencia) => tenta(async () => {
      const r = await fetch(U, { method: "POST", headers: { ...H, "content-type": "application/x-www-form-urlencoded" },
        redirect: "follow", signal: AbortSignal.timeout(300000),
        body: new URLSearchParams({ perform: "view", actionForward: "success", strutsFormName: "fpRemuneracaoPesquisaForm",
          user: "", dominio: "", validate: "true", printPerform: "", pesquisar: "true", chave: "", msgProcempa: "",
          "defaultSearch.pageSize": "23", "defaultSearch.currentPage": "1", "defaultSearch.orderField": "", "defaultSearch.orderDirection": "",
          empresaSelecionada: "0", secretariaSelecionada: "", tipoFolhaSelecionada: "MENSAL",
          competenciaSelecionadaAsString: competencia, criterioNomeServidor: "" }).toString() });
      return dec2(Buffer.from(await r.arrayBuffer()));
    }, 3);
    const relatorio = (competencia) => tenta(async () => {
      // ⚠️ strings VAZIAS, nunca "null"
      const qs = new URLSearchParams({ perform: "run", criterioFuncao: "", empresaSelecionada: "0", criterioNomeServidor: "",
        criterioCpf: "", competenciaSelecionadaAsString: competencia, tipoFolhaSelecionada: "MENSAL",
        secretariaSelecionada: "", criterioCargo: "", acao: "CSV" }).toString();
      const r = await fetch(`${RAIZ}/fpRemuneracaoRelatorio.do?${qs}`, { headers: H, redirect: "follow", signal: AbortSignal.timeout(900000) });
      return Buffer.from(await r.arrayBuffer());
    }, 3);
    // mês mais cheio entre as competências recentes
    let melhor = null;
    for (const c of comps.slice(0, 3)) {
      const busca = await pesquisa(c);
      const pags = ((busca || "").match(/<select[^>]*id="currentPage"[\s\S]*?<\/select>/i) || [""])[0].match(/<option/g)?.length || 0;
      if (!pags) continue;
      await dorme(1500);
      const buf = await relatorio(c);
      const linhas = buf ? dec2(buf).split(/\r?\n/).filter((l) => l.trim()) : [];
      if (linhas.length > 2 && (!melhor || linhas.length > melhor.linhas.length)) melhor = { comp: c, linhas, buf };
      if (melhor && melhor.comp === c && comps.indexOf(c) === 0) break;   // a mais recente já veio cheia
      await dorme(2000);
    }
    if (!melhor) return { regs: [], comp: null, detalhe: "relatório vazio nas competências testadas" };
    const campos = (l) => { const out = []; let cur = "", dentro = false;
      for (let i = 0; i < l.length; i++) { const ch = l[i];
        if (ch === '"') dentro = !dentro; else if (ch === ";" && !dentro) { out.push(cur.trim()); cur = ""; } else cur += ch; }
      out.push(cur.trim()); return out; };
    // a 1ª linha do arquivo é um título ("FpRemuneracao [1]:"); o cabeçalho real é a 2ª
    const iCab = melhor.linhas.findIndex((l) => /Compet[êe]ncia/i.test(l) && /Nome/i.test(l));
    if (iCab < 0) return { regs: [], comp: null, detalhe: "cabeçalho do relatório mudou" };
    const cab = campos(melhor.linhas[iCab]).map((c) => c.toUpperCase());
    const ix = (re) => cab.findIndex((c) => re.test(c));
    const col = { comp: ix(/COMPET/), nome: ix(/^NOME/), orgao: ix(/^[ÓO]RG[ÃA]O$/), exerc: ix(/EXERC[ÍI]CIO/),
      cargo: ix(/CARGO/), tipo: ix(/TIPO DE FOLHA/), matricula: ix(/MATR[ÍI]CULA/), nivel: ix(/N[ÍI]VEL/),
      bruta: ix(/B[ÁA]SICA BRUTA/), natal: ix(/NATALINA/), ferias: ix(/F[ÉE]RIAS/), event: ix(/EVENTUAIS/),
      liq: ix(/AP[ÓO]S DEDU/) };
    if (col.nome < 0 || col.bruta < 0) return { regs: [], comp: null, detalhe: "colunas de nome/valor não encontradas" };
    const moeda = (s) => { const t = String(s ?? "").replace(/[^\d,.-]/g, ""); if (!t) return null;
      const n = +t.replace(/\./g, "").replace(",", "."); return Number.isFinite(n) ? n : null; };
    const comp = `${melhor.comp.slice(6)}${melhor.comp.slice(3, 5)}`;
    const regs = [];
    for (const l of melhor.linhas.slice(iCab + 1)) {
      const c = campos(l);
      const nome = (c[col.nome] || "").trim();
      if (!nome) continue;
      const proventos = [col.bruta, col.natal, col.ferias, col.event].map((i) => (i >= 0 ? moeda(c[i]) || 0 : 0)).reduce((a, b) => a + b, 0);
      const liq = moeda(c[col.liq]);
      regs.push({
        cod_ibge, municipio, uf, competencia: comp, matricula: c[col.matricula] || null, nome,
        cargo: c[col.cargo] || null, secretaria: c[col.exerc] || c[col.orgao] || null, lotacao: c[col.orgao] || null,
        vinculo: [c[col.orgao], c[col.tipo]].filter(Boolean).join(" · ") || null,
        bruto: proventos || null, descontos: proventos && liq != null ? +(proventos - liq).toFixed(2) : null, liquido: liq,
        fonte: "relatorio procempa",
        _hash: crypto.createHash("md5").update([cod_ibge, comp, c[col.matricula], nome, c[col.cargo], c[col.bruta]].join("¦")).digest("hex"),
      });
    }
    return { regs, comp,
      detalhe: `relatório CSV ${(melhor.buf.length / 1048576).toFixed(1)} MB · ${melhor.linhas.length - iCab - 1} linhas · UMA requisição (a ficha a ficha levaria ~258 h)` };
  },

  // VITÓRIA — portal do produto "TransparenciaWeb" (ASP.NET), com um WEB SERVICE JSON por trás:
  //   GET https://wstransparencia.vitoria.es.gov.br/api/pessoal?exercicio=AAAA&periodo=tp{Mês}
  // ⭐ Devolve a folha inteira (17 MB, 36 mil linhas) sem paginar e sem sessão.
  // ⚠️ É por RUBRICA, não por servidor: cada verba é uma linha, com `Tipo` V (vantagem) ou D (desconto).
  //    Agregar por matrícula: bruto = Σ(V), descontos = Σ(D), líquido = bruto − descontos.
  // 🚨 O link "exportar para texto" da tela (`Pessoal.Servidor.RelatorioCSV.ashx`) devolve HTML, não CSV — depende
  //    de sessão ASP.NET. O caminho é o web service, que a tela usa em "download da base de dados".
  // ⚠️ `periodo` é o nome do mês em português com prefixo `tp` (tpJulho, tpJunho…), não número.
  "3205309": async ({ cod_ibge, municipio, uf }) => {
    const MES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const H = { ...UA, accept: "application/json", referer: "https://transparencia.vitoria.es.gov.br/" };
    const pega = async (ano, mes) => {
      for (let t = 1; t <= 3; t++) {
        const r = await fetch(`https://wstransparencia.vitoria.es.gov.br/api/pessoal?exercicio=${ano}&periodo=tp${MES[mes - 1]}`,
          { headers: H, signal: AbortSignal.timeout(600000) }).catch(() => null);
        if (r?.ok) { const j = await r.json().catch(() => null); if (Array.isArray(j)) return j; }
        await dorme(4000 * t);
      }
      return null;
    };
    const hoje = new Date();
    let melhor = null; const medidas = [];
    for (let k = 0; k <= 3; k++) {
      const d = new Date(hoje); d.setDate(1); d.setMonth(hoje.getMonth() - k);
      const arr = await pega(d.getFullYear(), d.getMonth() + 1);
      if (!arr?.length) continue;
      const n = new Set(arr.map((x) => x.Matricula)).size;
      medidas.push(`${d.getMonth() + 1}:${n}`);
      if (!melhor || n > melhor.n) melhor = { arr, n, ano: d.getFullYear(), mes: d.getMonth() + 1 };
      if (k === 0 && n > 5000) break;                       // o mês corrente já veio cheio
      await dorme(1500);
    }
    if (!melhor) return { regs: [], comp: null, detalhe: "web service sem dados nos últimos 4 meses" };
    const comp = `${melhor.ano}${String(melhor.mes).padStart(2, "0")}`;
    const porServidor = new Map();
    for (const x of melhor.arr) {
      const nome = String(x.ServidorNome || "").trim();
      if (!nome) continue;
      const k = `${x.Matricula}¦${nome}`;
      if (!porServidor.has(k)) porServidor.set(k, { ...x, nome, v: 0, d: 0 });
      const s = porServidor.get(k);
      const val = +x.Valor || 0;
      if (String(x.Tipo).toUpperCase() === "D") s.d += val; else s.v += val;
    }
    const regs = [...porServidor.values()].map((s) => ({
      cod_ibge, municipio, uf, competencia: comp, matricula: String(s.Matricula || "").trim() || null, nome: s.nome,
      cargo: String(s.CargoNome || "").trim() || null, secretaria: String(s.LotacaoNome || "").trim() || null,
      lotacao: String(s.LotacaoNome || "").trim() || null,
      vinculo: [String(s.QuadroNome || "").trim(), String(s.PlanoCargos || "").trim()].filter(Boolean).join(" · ") || null,
      bruto: +s.v.toFixed(2) || null, descontos: +s.d.toFixed(2) || null, liquido: +(s.v - s.d).toFixed(2) || null,
      fonte: "ws transparenciaweb vitoria",
      _hash: crypto.createHash("md5").update([cod_ibge, comp, s.Matricula, s.nome, s.CargoNome].join("¦")).digest("hex"),
    }));
    return { regs, comp,
      detalhe: `web service ${melhor.arr.length} rubricas → ${regs.length} servidores · mês mais cheio (${medidas.join(" ")}) · com vantagens e descontos` };
  },

  // PALMAS — NucleoGov (confirma por `static.nucleogov.com.br`), mas um TERCEIRO dialeto:
  //   POST /api  com  multi_request=true&params={"q":{"ano":null,"mes":null,"order":{},"limit":"0, N",
  //                                               "acao":"sgservidores/listar"}}
  // (os outros dois já conhecidos são `servidores_cnt/listar` e `mgservidores` — ver ingest_folha_nucleogov.mjs)
  // ⭐ Resposta `{q:{total, dados:[…]}}` com salario_base, proventos, descontos, liquido, situacao_servidor,
  //    orgao, lotacao, local_trabalho, vinculo, carga_horaria, data_admissao — tudo preenchido.
  // ⚠️ `limit` é LIMIT do SQL: "offset, quantidade". Com ano/mes nulos ele devolve a competência corrente.
  // ⚠️ `tipo` distingue a folha (Normal, Complementar 1, Complementar 2…) — um servidor pode ter mais de uma linha.
  "1721000": async ({ cod_ibge, municipio, uf }) => {
    const B = "https://acessoainformacao.palmas.to.gov.br/api";
    const H = { "user-agent": UA["user-agent"], "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      accept: "application/json, text/javascript, */*", "x-requested-with": "XMLHttpRequest",
      referer: "https://acessoainformacao.palmas.to.gov.br/cidadao/transparencia/sgservidores" };
    const pede = async (offset, quant) => {
      for (let t = 1; t <= 3; t++) {
        const r = await fetch(B, { method: "POST", headers: H, signal: AbortSignal.timeout(600000),
          body: new URLSearchParams({ multi_request: "true",
            params: JSON.stringify({ q: { ano: null, mes: null, order: {}, limit: `${offset}, ${quant}`, acao: "sgservidores/listar" } }) }).toString() }).catch(() => null);
        if (r?.ok) { const j = await r.json().catch(() => null); if (j?.q?.dados) return j.q; }
        await dorme(4000 * t);
      }
      return null;
    };
    const p1 = await pede(0, 2000);
    if (!p1?.dados?.length) return { regs: [], comp: null, detalhe: "sgservidores/listar não respondeu" };
    const total = +p1.total || p1.dados.length;
    const todos = [...p1.dados];
    for (let off = 2000; off < total; off += 2000) {
      const p = await pede(off, 2000);
      if (!p?.dados?.length) break;
      todos.push(...p.dados);
      await dorme(300);
    }
    const num = (s) => { const n = +String(s ?? "").replace(",", "."); return Number.isFinite(n) ? n : null; };
    const comps = {};
    for (const s of todos) { const c = `${s.ano}${String(s.mes).padStart(2, "0")}`; comps[c] = (comps[c] || 0) + 1; }
    const comp = Object.entries(comps).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const regs = todos.filter((s) => String(s.nome || "").trim() && `${s.ano}${String(s.mes).padStart(2, "0")}` === comp).map((s) => ({
      cod_ibge, municipio, uf, competencia: comp, matricula: String(s.matricula || "").trim() || null,
      nome: String(s.nome).trim(), cargo: [s.cargo, s.funcao].filter((x) => String(x || "").trim()).join(" / ") || null,
      secretaria: String(s.orgao || "").trim() || null, lotacao: String(s.lotacao || s.local_trabalho || "").trim() || null,
      vinculo: [s.vinculo, s.situacao_servidor, s.tipo].filter((x) => String(x || "").trim()).join(" · ") || null,
      bruto: num(s.proventos) ?? num(s.salario_base), descontos: num(s.descontos), liquido: num(s.liquido),
      fonte: "nucleogov palmas",
      _hash: crypto.createHash("md5").update([cod_ibge, comp, s.matricula, s.nome, s.cargo, s.tipo, s.proventos].join("¦")).digest("hex"),
    }));
    return { regs, comp, detalhe: `API ${todos.length} de ${total} linhas · competência ${comp} · com proventos, descontos e líquido` };
  },

  // MACAPÁ — CR2 CLÁSSICO (`folha.governotransparente.com.br`), diferente de Boa Vista (que virou Cloudflare Worker).
  // Caminho: portal → `portalcr2.com.br/relacao-remuneracao/relacao-nominal-remuneracao-macapa` → uma linha por
  // ENTIDADE, cada uma com seu `foff_id`.
  // 🚨 **O `foff_id` NÃO deriva do IBGE** — Macapá é 1600303 e os ids são 1600105xx. A regra "IBGE6+01" de
  //    [[pnigp-cr2-elotech-folha-norte-parana]] não vale; os ids têm de ser lidos da página do CR2.
  // 🚨 Competência `202599` existe e é a opção "ano/todos" — filtrar mês 01-12 (armadilha já registrada).
  // A folha é FRAGMENTADA por entidade: prefeitura 5.021 + saúde 11.483 + educação 7.305 + assistência 735 +
  // CTMAC 347 + CMM 141 ≈ 25 mil. Coletar só a prefeitura perderia 80%.
  // O valor está numa `div.hide` dentro do <tr> — Total Proventos / Total Descontos / Líquido (idem ingest_folha_cr2).
  "1600303": async ({ cod_ibge, municipio, uf }) => {
    const dec2 = (b) => { let t = new TextDecoder("utf-8").decode(b); if (/�/.test(t.slice(0, 4000))) t = new TextDecoder("iso-8859-1").decode(b); return t; };
    const limpaHtml = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
      .replace(/&iacute;/g, "í").replace(/&aacute;/g, "á").replace(/&eacute;/g, "é").replace(/\s+/g, " ").trim();
    const num = (s) => { const t = String(s ?? "").replace(/[^\d,.-]/g, ""); if (!t) return null;
      const n = +t.replace(/\./g, "").replace(",", "."); return Number.isFinite(n) ? n : null; };
    // ⚠️ a página do CR2 é Bubble (SPA): os links NÃO estão no HTML estático. Os foff_id saem da API Bubble
    //    `obj/relacao_nominal_remuneracao` (707 registros, campo `linkRNR`), paginada por cursor.
    //    Descoberta em dois passos: achar o registro que cita Macapá → pegar o PREFIXO de 6 dígitos do foff dele
    //    → todos os foff com o mesmo prefixo são as entidades do município. Nada fixado à mão.
    const bubble = [];
    for (let cursor = 0, i = 0; i < 30; i++) {
      const r = await fetch(`https://www.portalcr2.com.br/api/1.1/obj/relacao_nominal_remuneracao?cursor=${cursor}&limit=100`,
        { headers: { ...UA, accept: "application/json" }, signal: AbortSignal.timeout(90000) }).catch(() => null);
      if (!r?.ok) break;
      const j = await r.json().catch(() => null);
      const res = j?.response?.results || [];
      bubble.push(...res);
      if (!res.length || !j?.response?.remaining) break;
      cursor += res.length;
    }
    const comFoff = bubble.map((x) => ({ desc: String(x.descricao || ""), foff: (String(x.linkRNR || "").match(/governotransparente\.com\.br\/(\d{6,12})\//) || [])[1] })).filter((x) => x.foff);
    const ancora = comFoff.find((x) => /macap[áa]|CTMAC|SEMED|SEMSA|SEMAS/i.test(x.desc));
    if (!ancora) return { regs: [], comp: null, detalhe: "não achei Macapá na API Bubble do CR2" };
    const prefixo = ancora.foff.slice(0, 6);
    const foffs = [...new Set(comFoff.filter((x) => x.foff.startsWith(prefixo)).map((x) => x.foff))];
    if (!foffs.length) return { regs: [], comp: null, detalhe: "nenhum foff_id com o prefixo de Macapá" };
    const hoje = new Date();
    const regs = [];
    let comp = null, detalhes = [];
    for (const foff of foffs) {
      for (let k = 0; k <= 3; k++) {
        const d = new Date(hoje); d.setDate(1); d.setMonth(hoje.getMonth() - k);
        const c = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
        const r = await fetch(`https://folha.governotransparente.com.br/${foff}/foff/listar-por/funcionariosresumo/${c}`,
          { headers: { "user-agent": UA["user-agent"] }, redirect: "follow", signal: AbortSignal.timeout(300000) }).catch(() => null);
        if (!r?.ok) continue;
        const html = dec2(Buffer.from(await r.arrayBuffer()));
        const trs = [...html.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi)].map((m) => m[0])
          .filter((tr) => /class="hide"/i.test(tr) && /Matr[íi]cula/i.test(tr));
        if (!trs.length) continue;
        comp = comp || c;
        let n = 0;
        for (const tr of trs) {
          const cels = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => limpaHtml(m[1].replace(/<div class="hide"[\s\S]*/i, "")));
          const b = limpaHtml((tr.match(/<div class="hide"[\s\S]*?<\/tr>/i) || [tr])[0]);
          const nome = (cels.find((x) => /^[A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{6,}$/.test(x)) || cels[1] || "").trim();
          if (!nome) continue;
          const pega = (re) => { const m = b.match(re); return m ? m[1].trim() : null; };
          regs.push({
            cod_ibge, municipio, uf, competencia: c, matricula: (cels[0] || "").trim() || null, nome,
            cargo: pega(/Cargo[:\s]+([^|]{2,60}?)(?:Refer|Lota|Depart|Data|$)/i),
            secretaria: pega(/Lota[çc][ãa]o[:\s]+([^|]{2,60}?)(?:Depart|Data|Situa|$)/i),
            lotacao: pega(/Departamento[:\s]+([^|]{2,60}?)(?:Data|Situa|$)/i),
            vinculo: pega(/V[íi]nculo[:\s]+([^|]{2,40}?)(?:Cargo|Refer|$)/i),
            bruto: num((b.match(/Total Proventos[^R\d]*R?\$?\s*([\d.,]+)/i) || [])[1]),
            descontos: num((b.match(/Total Descontos[^R\d]*R?\$?\s*([\d.,]+)/i) || [])[1]),
            liquido: num((b.match(/L[íi]qui[^R\d]*R?\$?\s*([\d.,]+)/i) || [])[1]),
            fonte: `cr2 macapa ${foff}`,
            _hash: crypto.createHash("md5").update([cod_ibge, c, foff, cels[0], nome].join("¦")).digest("hex"),
          });
          n++;
        }
        detalhes.push(`${foff}:${n}`);
        break;
      }
      await dorme(600);
    }
    if (!regs.length) return { regs: [], comp: null, detalhe: `${foffs.length} entidades, nenhuma com linhas` };
    return { regs, comp, detalhe: `${foffs.length} entidades CR2 (${detalhes.join(" ")}) · com proventos, descontos e líquido` };
  },

  // RIO BRANCO — portal JSF próprio (`transparencia.riobranco.ac.gov.br/portal-transparencia/servidor/`) com
  // export "Dados Abertos → CSV" que baixa `webscv.csv`.
  // ⭐ O CSV traz Servidor (matrícula/vínculo-NOME), Tipo de Folha, Admissão, Cargo, Vínculo, CH, Vencimento Base,
  //    Outras Verbas, Salário Bruto, Descontos e Salário Líquido.
  // 🚨 Sem filtrar, vêm TODOS os exercícios (71.835 linhas desde 2010). Selecionar ano e mês antes de exportar.
  // ⚠️ O export é `mojarra.jsfcljs` (JSF) — só dispara pelo navegador; por HTTP puro não sai arquivo.
  // ⚠️ O campo "Servidor" concatena `matrícula/vínculo-NOME` — separar no primeiro hífen.
  "1200401": async ({ cod_ibge, municipio, uf }) => {
    const { chromium } = await import("playwright");
    const fsp = await import("node:fs");
    const tmp = `${process.env.TEMP || "/tmp"}/pnigp_riobranco`;
    fsp.mkdirSync(tmp, { recursive: true });
    const br2 = await chromium.launch({ headless: true, args: ["--ignore-certificate-errors"] });
    const ctx2 = await br2.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true, userAgent: UA["user-agent"] });
    const page = await ctx2.newPage();
    let arquivo = null;
    page.on("download", async (d) => { const p = `${tmp}/rb.csv`; await d.saveAs(p).catch(() => {}); arquivo = p; });
    try {
      await page.goto("https://transparencia.riobranco.ac.gov.br/portal-transparencia/servidor/", { waitUntil: "networkidle", timeout: 150000 });
      await page.waitForTimeout(8000);
      // exercício e mês são <select> JSF cujos ids mudam — achar pelo CONTEÚDO das opções
      const alvos = await page.evaluate(() => {
        const out = {};
        for (const s of document.querySelectorAll("select")) {
          const txt = [...s.options].map((o) => o.text.trim());
          if (txt.some((t) => /^20\d\d$/.test(t)) && !out.ano) out.ano = { id: s.id, ops: [...s.options].map((o) => ({ v: o.value, t: o.text.trim() })) };
          else if (txt.some((t) => /^Janeiro$/i.test(t)) && !out.mes) out.mes = { id: s.id, ops: [...s.options].map((o) => ({ v: o.value, t: o.text.trim() })) };
        }
        return out;
      });
      if (!alvos.ano || !alvos.mes) { await br2.close(); return { regs: [], comp: null, detalhe: "não achei os selects de ano/mês" }; }
      const anos = alvos.ano.ops.filter((o) => /^20\d\d$/.test(o.t)).sort((a, b) => b.t.localeCompare(a.t));
      const hoje = new Date();
      let melhorAno = anos.find((a) => a.t === String(hoje.getFullYear())) || anos[0];
      // ⚠️ os ids JSF têm `:` — usar seletor por atributo, nunca `#id` (e `CSS.escape` não existe no Node)
      await page.selectOption(`select[id="${alvos.ano.id}"]`, melhorAno.v).catch(() => {});
      await page.waitForTimeout(4000);
      // 🚨 mês MAIS CHEIO, não o primeiro que responde: o mês corrente vem parcial (agosto deu 126 linhas
      //    contra dezenas de milhares dos fechados) — mesma armadilha de Manaus, Goiânia e Cuiabá.
      // 🚨 o JSF perde o estado depois do 1º download (só o primeiro mês gera arquivo) — RECARREGAR a página e
      //    reselecionar ano+mês a cada competência.
      let comp = null, melhorBuf = null, medidas = [];
      for (let k = 0; k <= 4; k++) {
        const d = new Date(hoje); d.setDate(1); d.setMonth(hoje.getMonth() - k);
        if (String(d.getFullYear()) !== melhorAno.t) continue;
        const mesOp = alvos.mes.ops.find((o) => +o.v === d.getMonth() + 1);
        if (!mesOp) continue;
        if (k > 0) {
          await page.goto("https://transparencia.riobranco.ac.gov.br/portal-transparencia/servidor/", { waitUntil: "networkidle", timeout: 150000 }).catch(() => {});
          await page.waitForTimeout(6000);
          await page.selectOption(`select[id="${alvos.ano.id}"]`, melhorAno.v).catch(() => {});
          await page.waitForTimeout(4000);
        }
        await page.selectOption(`select[id="${alvos.mes.id}"]`, mesOp.v).catch(() => {});
        await page.waitForTimeout(5000);
        arquivo = null;
        const dl = page.waitForEvent("download", { timeout: 240000 }).catch(() => null);
        await page.getByText("CSV", { exact: true }).first().click({ timeout: 25000 }).catch(() => {});
        await dl; await page.waitForTimeout(4000);
        if (!arquivo || !fsp.existsSync(arquivo)) { medidas.push(`${d.getMonth() + 1}:—`); continue; }
        const b = fsp.readFileSync(arquivo);
        const n = b.toString("latin1").split(/\r?\n/).filter((l) => l.trim()).length - 1;
        medidas.push(`${d.getMonth() + 1}:${n}`);
        if (!melhorBuf || n > melhorBuf.n) { melhorBuf = { b, n }; comp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`; }
      }
      await br2.close();
      if (!melhorBuf || !comp) return { regs: [], comp: null, detalhe: "o export CSV não veio" };
      const buf = melhorBuf.b;
      let txt = new TextDecoder("utf-8").decode(buf);
      if (/�/.test(txt.slice(0, 4000))) txt = new TextDecoder("iso-8859-1").decode(buf);
      const linhas = txt.split(/\r?\n/).filter((l) => l.trim());
      const campos = (l) => { const out = []; let cur = "", dentro = false;
        for (let i = 0; i < l.length; i++) { const ch = l[i];
          if (ch === '"') dentro = !dentro; else if (ch === "," && !dentro) { out.push(cur.trim()); cur = ""; } else cur += ch; }
        out.push(cur.trim()); return out; };
      const cab = campos(linhas[0]).map((c) => c.toUpperCase());
      const ix = (re) => cab.findIndex((c) => re.test(c));
      const col = { serv: ix(/SERVIDOR/), folha: ix(/TIPO DE FOLHA/), adm: ix(/ADMISS/), cargo: ix(/CARGO/),
        vinculo: ix(/V[ÍI]NCULO/), bruto: ix(/BRUTO/), desc: ix(/DESCONTO/), liq: ix(/L[ÍI]QU/) };
      if (col.serv < 0 || col.bruto < 0) return { regs: [], comp: null, detalhe: "cabeçalho do CSV mudou" };
      const moeda = (s) => { const t = String(s ?? "").replace(/[^\d,.-]/g, ""); if (!t) return null;
        const n = +t.replace(/\./g, "").replace(",", "."); return Number.isFinite(n) ? n : null; };
      const regs = [];
      for (const l of linhas.slice(1)) {
        const c = campos(l);
        const bruto = (c[col.serv] || "").trim();
        if (!bruto) continue;
        const corte = bruto.indexOf("-");
        const matricula = corte > 0 ? bruto.slice(0, corte).trim() : null;
        const nome = (corte > 0 ? bruto.slice(corte + 1) : bruto).trim();
        if (!nome) continue;
        regs.push({
          cod_ibge, municipio, uf, competencia: comp, matricula, nome,
          cargo: (c[col.cargo] || "").replace(/\s+/g, " ").trim() || null, secretaria: null, lotacao: null,
          vinculo: [(c[col.vinculo] || "").trim(), (c[col.folha] || "").trim()].filter(Boolean).join(" · ") || null,
          bruto: moeda(c[col.bruto]), descontos: moeda(c[col.desc]), liquido: moeda(c[col.liq]),
          fonte: "jsf rio branco",
          _hash: crypto.createHash("md5").update([cod_ibge, comp, matricula, nome, c[col.folha], c[col.bruto], c[col.desc]].join("¦")).digest("hex"),
        });
      }
      return { regs, comp, detalhe: `CSV ${(buf.length / 1048576).toFixed(1)} MB · ${linhas.length - 1} linhas · mês mais cheio (${medidas.join(" ")}) · com bruto, descontos e líquido` };
      // (fim de Rio Branco)
    } catch (e) {
      await br2.close().catch(() => {});
      return { regs: [], comp: null, detalhe: `erro: ${String(e.message).slice(0, 70)}` };
    }
  },

  // TERESINA — API JSON própria, apesar de a página avisar "os arquivos das publicações estão em formato PDF"
  // (esse aviso é da seção de Documentos, não da consulta):
  //   POST /transparencia/servidores/?page=N&page_size=M
  //   body: {"ano":{"operator":"=","value":2026},"mes":{"operator":"=","value":7}}
  // 🚨 **O filtro usa formato com OPERADOR** — `{"ano":2026}` simples é IGNORADO e a API devolve os 4,9 MILHÕES
  //    de registros do histórico inteiro (desde 2020). Sem o formato certo, a coleta traria lixo.
  // ⭐ Campos de valor separados: valorfixo, valorvariavel, valorfuncao, valordiversos, valoreventual,
  //    valorindenizacao, valorredutor, valorirpf, valorprevidencia, **valorliquido**.
  // ⚠️ `page_size` aceita 5000. ⚠️ `cpf` vem null (já anonimizado na origem).
  "2211001": async ({ cod_ibge, municipio, uf }) => {
    const B = "https://transparencia.teresina.pi.gov.br/transparencia/servidores/";
    const H = { "user-agent": UA["user-agent"], accept: "application/json", "content-type": "application/json",
      referer: "https://transparencia.teresina.pi.gov.br/servidores" };
    const pede = async (ano, mes, page, size) => {
      for (let t = 1; t <= 3; t++) {
        const r = await fetch(`${B}?page=${page}&page_size=${size}`, { method: "POST", headers: H, signal: AbortSignal.timeout(300000),
          body: JSON.stringify({ ano: { operator: "=", value: ano }, mes: { operator: "=", value: mes } }) }).catch(() => null);
        if (r?.ok) { const j = await r.json().catch(() => null); if (j?.data) return j; }
        await dorme(3000 * t);
      }
      return null;
    };
    const hoje = new Date();
    const medidas = [];
    let melhor = null;
    for (let k = 0; k <= 3; k++) {
      const d = new Date(hoje); d.setDate(1); d.setMonth(hoje.getMonth() - k);
      const j = await pede(d.getFullYear(), d.getMonth() + 1, 1, 1);
      const n = +(j?.total || 0);
      if (n > 0) { medidas.push(`${d.getMonth() + 1}:${n}`); if (!melhor || n > melhor.n) melhor = { ano: d.getFullYear(), mes: d.getMonth() + 1, n }; }
      await dorme(400);
    }
    if (!melhor) return { regs: [], comp: null, detalhe: "sem registros nos últimos 4 meses" };
    const todos = [];
    for (let p = 1; (p - 1) * 5000 < melhor.n; p++) {
      const j = await pede(melhor.ano, melhor.mes, p, 5000);
      if (!j?.data?.length) break;
      todos.push(...j.data);
      await dorme(250);
    }
    const num = (s) => { const n = +String(s ?? "").replace(",", "."); return Number.isFinite(n) ? n : null; };
    const comp = `${melhor.ano}${String(melhor.mes).padStart(2, "0")}`;
    const regs = todos.filter((s) => String(s.nome || "").trim()).map((s) => {
      const proventos = ["valorfixo", "valorvariavel", "valorfuncao", "valordiversos", "valoreventual", "valorindenizacao"]
        .map((k) => num(s[k]) || 0).reduce((a, b) => a + b, 0);
      const desc = ["valorirpf", "valorprevidencia", "valorredutor", "valoreventual_desconto"]
        .map((k) => num(s[k]) || 0).reduce((a, b) => a + b, 0);
      return { cod_ibge, municipio, uf, competencia: comp, matricula: String(s.matricula || "").trim() || null,
        nome: String(s.nome).trim(), cargo: String(s.cargo || "").trim() || null,
        secretaria: String(s.sigla_orgao || "").trim() || null, lotacao: String(s.orgaoLotacao || "").trim() || null,
        vinculo: String(s.Quadro || "").trim() || null,
        bruto: +proventos.toFixed(2) || null, descontos: +desc.toFixed(2) || null, liquido: num(s.valorliquido),
        fonte: "api teresina",
        _hash: crypto.createHash("md5").update([cod_ibge, comp, s.id, s.matricula, s.nome].join("¦")).digest("hex") };
    });
    return { regs, comp,
      detalhe: `API ${todos.length} de ${melhor.n} · mês mais cheio (${medidas.join(" ")}) · com fixo, variável, função e líquido` };
  },

  // BRASÍLIA / GDF — ZIP anual com um CSV por mês, nominal e com BRUTO/LÍQUIDO.
  // ⚠️ O DF acumula competência estadual e municipal: são 263 mil linhas (ativos + aposentados + pensionistas),
  //    não uma prefeitura. Fica marcado em `vinculo` pela coluna SITUAÇÃO.
  // O caminho: tela `#/servidores/remuneracao` → botão "Dados Abertos" → `#/downloads#downloadServidores`
  // → `arquivos/Remuneracao_{ANO}.zip`. A API `/api/remuneracao` também serve o mesmo dado, mas trava a página
  // em 150 registros (pede size=500 e recebe 150) — seriam 1.758 requisições contra um ZIP.
  // 🚨 A API exige o header `x-client-id` (identificador público da aplicação, o mesmo que o site manda).
  // Latin-1, `;`, decimal com vírgula. CPF vem mascarado na origem (`***107321**`).
  "5300108": async ({ cod_ibge, municipio, uf }) => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const readline = await import("node:readline");
    const { execFileSync } = await import("node:child_process");
    const TMP = path.join(process.env.TEMP || "/tmp", `folha_df_${process.pid}`);
    fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
    const lim = (v) => { const t = String(v ?? "").trim(); return t && t !== "-" ? t : null; };
    try {
      const H = { "user-agent": UA["user-agent"], referer: "https://www.transparencia.df.gov.br/" };
      const hoje = new Date();
      let zip = null, ano = null;
      for (const a of [hoje.getFullYear(), hoje.getFullYear() - 1]) {
        const r = await fetch(`https://www.transparencia.df.gov.br/arquivos/Remuneracao_${a}.zip`,
          { headers: H, signal: AbortSignal.timeout(1800000) }).catch(() => null);
        if (!r?.ok) continue;
        const b = Buffer.from(await r.arrayBuffer());
        if (b.length < 1e6) continue;
        zip = path.join(TMP, `r${a}.zip`).replace(/\\/g, "/"); fs.writeFileSync(zip, b); ano = a; break;
      }
      if (!zip) return { regs: [], comp: null, detalhe: "ZIP anual de remuneração indisponível" };
      const ps = (cmd) => execFileSync("powershell", ["-NoProfile", "-Command", cmd], { encoding: "utf8", maxBuffer: 64e6 });
      const entradas = ps(`Add-Type -A System.IO.Compression.FileSystem;` +
        `$z=[IO.Compression.ZipFile]::OpenRead('${zip}'); $z.Entries | % { "{0}|{1}" -f $_.FullName,$_.Length }; $z.Dispose()`)
        .trim().split(/\r?\n/).map((l) => { const [n, s] = l.split("|"); return { n, s: +s }; })
        // só a folha consolidada; `Remuneracao_Detalhamento_*` é a mesma folha aberta por rubrica (2,5× maior)
        .filter((e) => /Remuneracao_\d{4}_\d{2}\.csv$/i.test(e.n));
      if (!entradas.length) return { regs: [], comp: null, detalhe: `ZIP ${ano} sem CSV mensal consolidado` };
      // ⚠️ mês mais CHEIO, não o mais recente — e dezembro infla por causa do 13º
      const ord = [...entradas].sort((a, b) => b.s - a.s);
      const semDez = ord.filter((e) => !/_12\.csv$/i.test(e.n));
      const alvo = (semDez[0] && semDez[0].s >= ord[0].s * 0.9) ? semDez[0] : ord[0];
      const mes = alvo.n.match(/_(\d{2})\.csv$/i)[1];
      const comp = `${ano}${mes}`;
      const csv = path.join(TMP, "folha.csv").replace(/\\/g, "/");
      ps(`Add-Type -A System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead('${zip}');` +
        `$e=$z.Entries | ? { $_.FullName -eq '${alvo.n}' };` +
        `[IO.Compression.ZipFileExtensions]::ExtractToFile($e,'${csv}',$true); $z.Dispose()`);
      const regs = [];
      let cab = null, ix = {};
      const rl = readline.createInterface({ input: fs.createReadStream(csv, { encoding: "latin1" }), crlfDelay: Infinity });
      for await (const linha of rl) {
        if (!linha.trim()) continue;
        const c = linha.split(";");
        if (!cab) { // ler as colunas pelo CABEÇALHO, nunca por posição fixa
          cab = c.map((x) => x.trim().toUpperCase());
          const acha = (re) => cab.findIndex((x) => re.test(x));
          ix = { nome: acha(/^NOME/), orgao: acha(/^[ÓO]RG[ÃA]O$/), cargo: acha(/^CARGO/), funcao: acha(/^FUN[ÇC][ÃA]O/),
            sit: acha(/^SITUA[ÇC][ÃA]O/), mat: acha(/^MATR[ÍI]CULA/), bruto: acha(/^BRUTO/), liq: acha(/^L[ÍI]QUIDO/) };
          if (ix.nome < 0 || ix.bruto < 0) { cab = null; continue; }
          continue;
        }
        const nome = lim(c[ix.nome]);
        if (!nome) continue;
        const bruto = money(c[ix.bruto]), liquido = money(c[ix.liq]);
        regs.push({ cod_ibge, municipio, uf, competencia: comp, matricula: lim(c[ix.mat]), nome,
          cargo: lim(c[ix.cargo]), secretaria: lim(c[ix.orgao]), lotacao: lim(c[ix.orgao]),
          vinculo: [lim(c[ix.sit]), lim(c[ix.funcao])].filter(Boolean).join(" · ") || null,
          bruto, descontos: bruto != null && liquido != null ? +(bruto - liquido).toFixed(2) : null, liquido,
          fonte: "dados abertos gdf",
          // o valor entra no hash: sem ele, dois vínculos do mesmo servidor no mesmo mês colapsam em uma linha
          _hash: crypto.createHash("md5").update([cod_ibge, comp, c[ix.mat], nome, c[ix.cargo], c[ix.bruto]].join("¦")).digest("hex") });
      }
      const porSit = {};
      for (const r of regs) { const k = (r.vinculo || "").split(" · ")[0] || "?"; porSit[k] = (porSit[k] || 0) + 1; }
      const resumo = Object.entries(porSit).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}:${v}`).join(" ");
      return { regs, comp,
        detalhe: `ZIP ${ano} · ${entradas.length} meses · escolhido ${alvo.n.split("/").pop()} (${(alvo.s / 1048576).toFixed(0)} MB) · ${resumo} · GDF acumula estado+município` };
    } finally { fs.rmSync(TMP, { recursive: true, force: true }); }
  },
};

const alvos = (await q(`select cod_ibge, municipio, uf from capital_portal
  ${SO ? "where municipio ilike '%'||$1||'%'" : ""} order by municipio`, SO ? [SO] : [])).rows
  .filter((a) => COLETORES[a.cod_ibge]);
console.log(`[capitais] ${Object.keys(COLETORES).length} com coletor · ${alvos.length} na fila`);

let ok = 0, falhas = 0, totalGeral = 0;
for (const a of alvos) {
  try {
    const { regs, comp, detalhe } = await COLETORES[a.cod_ibge](a);
    if (!regs.length) {
      await q(`insert into folha_capital_coleta (cod_ibge,municipio,uf,situacao,detalhe,em) values ($1,$2,$3,'vazio',$4,now())
        on conflict (cod_ibge) do update set situacao='vazio', detalhe=excluded.detalhe, em=now()`, [a.cod_ibge, a.municipio, a.uf, detalhe]);
      falhas++; console.log(`  ✖ ${a.uf} ${a.municipio}: ${detalhe}`); continue;
    }
    const n = await grava(regs);
    totalGeral += n; ok++;
    await q(`insert into folha_capital_coleta (cod_ibge,municipio,uf,competencia,linhas,situacao,detalhe,em)
      values ($1,$2,$3,$4,$5,'ok',$6,now()) on conflict (cod_ibge) do update set competencia=excluded.competencia,
      linhas=excluded.linhas, situacao='ok', detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, comp, n, detalhe]);
    console.log(`  ${a.uf} ${a.municipio}: ${n.toLocaleString("pt-BR")} servidores (${comp}) — ${detalhe}`);
  } catch (e) {
    falhas++;
    await q(`insert into folha_capital_coleta (cod_ibge,municipio,uf,situacao,detalhe,em) values ($1,$2,$3,'erro',$4,now())
      on conflict (cod_ibge) do update set situacao='erro', detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, String(e.message).slice(0, 150)]);
    console.log(`  ✖ ${a.uf} ${a.municipio}: ${String(e.message).slice(0, 80)}`);
  }
}
console.log(`\n[capitais] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} ok · ${falhas} falhas`);
await db.end();
