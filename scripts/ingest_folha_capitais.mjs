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
