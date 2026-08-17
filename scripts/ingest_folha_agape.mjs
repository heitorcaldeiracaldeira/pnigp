// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_agape.mjs — folha nominal dos portais **Ágape** (Ágape Consultoria; CodeIgniter, rotas /transparencia/rh/*).
//
// O produto vive no domínio da própria prefeitura (não tem host de fornecedor), e por isso a sonda por subdomínio
// nunca o veria — foi o diagnóstico profundo que o revelou, pela gramática de URL idêntica em municípios distintos
// (`/transparencia/rh/servidores`, `/rh/cargos_e_salarios`, `/rh/totalizacao_folha_uo`) e pelo rodapé "Ágape".
// É o caso clássico de [[pnigp-portal-proprio-e-white-label]]. No ES: Marataízes e Atílio Vivácqua.
//
// ⭐ DUAS VIAS, e são complementares — nenhuma sozinha responde o que o Heitor pede:
//  1. **CADASTRO** — `/rh/servidores_download/csv?comp_ano=AAAA` gera o arquivo e devolve uma PÁGINA com o link
//     ("ARQUIVO GERADO COM SUCESSO / CLIQUE AQUI"): são 2 saltos, não um download direto. CSV `;` com aspas, 32
//     campos: matrícula, nome, **secretaria**, **cargo**, `salariocargo` (o vencimento DO CARGO, na tabela),
//     regime, jornada, admissão, lotação, local de trabalho, situação.
//     🚨 A coluna `total_rendimentos` do CSV vem **VAZIA** em todas as linhas — quem acreditar no nome do campo
//     grava a folha inteira sem valor pago e não vê erro nenhum ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
//  2. **RENDIMENTOS** — `/rh/rendimento/{matricula}/{cnpj}?comp_ano=AAAA&contrato=N` devolve o ANO INTEIRO de uma
//     vez (12 meses × Remuneração Básica / Gratificações / Total de Vencimentos / Descontos / Líquido). Uma
//     requisição por servidor, mas rende 12 competências — é o que traz o valor PAGO.
//
// 🚨 O número no rendimento vem em formato MISTO na mesma tabela ("R$ 1,570.19" americano ao lado de "R$ 0,00"
// brasileiro). Fixar um dos dois multiplica ou divide por 1000. A regra usada: manda o ÚLTIMO separador.
//
// Uso: node scripts/ingest_folha_agape.mjs        · SEM_RENDIMENTO=1 só o cadastro · SO=marataizes · ANO=2026
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const ANO = process.env.ANO ? +process.env.ANO : new Date().getFullYear();
const SEM_RENDIMENTO = process.env.SEM_RENDIMENTO === "1";
const CONC = +(process.env.CONC || 4);

const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", accept: "*/*", "accept-language": "pt-BR,pt;q=0.9" };
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const dec = (b) => { const u = b.toString("utf8"); return /�/.test(u.slice(0, 4000)) ? b.toString("latin1") : u; };
const texto = (h) => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

// 🚨 número em formato MISTO: "1,570.19" (americano) e "1.570,19"/"0,00" (brasileiro) convivem na mesma tabela.
// Quem manda é o ÚLTIMO separador — ele é o decimal; o outro é milhar.
function num(v) {
  if (v == null) return null;
  const s = String(v).replace(/R\$|\s/g, "").trim();
  if (!s || s === "-") return null;
  const p = s.lastIndexOf("."), c = s.lastIndexOf(",");
  let t;
  if (p < 0 && c < 0) t = s;
  else if (c > p) t = s.replace(/\./g, "").replace(",", ".");
  else t = s.replace(/,/g, "");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function navegador() {
  const c = new Map();
  const H = () => [...c].map(([k, v]) => `${k}=${v}`).join("; ");
  return async (url, ref, tentativas = 3) => {
    for (let t = 0; t < tentativas; t++) {
      try {
        const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(180000),
          headers: { ...UA, ...(H() ? { cookie: H() } : {}), ...(ref ? { referer: ref } : {}) } });
        for (const sc of (r.headers.getSetCookie?.() || [])) { const kv = sc.split(";")[0]; const i = kv.indexOf("="); if (i > 0) c.set(kv.slice(0, i), kv.slice(i + 1)); }
        return { st: r.status, texto: dec(Buffer.from(await r.arrayBuffer())) };
      } catch (e) { if (t === tentativas - 1) throw e; await dorme(2000 * (t + 1)); }
    }
  };
}

await q(`create table if not exists folha_agape_portal (
  cod_ibge text primary key, municipio text, uf text, base_url text, ativo boolean default true
)`);
await q(`create table if not exists folha_servidores_agape (
  cod_ibge text, municipio text, uf text, entidade text, competencia text,
  matricula text, nome text, secretaria text, cargo text, profissao text, regime text, jornada text,
  lotacao text, local_trabalho text, situacao text, data_admissao text, data_demissao text,
  salario_cargo numeric, bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_agape_mun on folha_servidores_agape (cod_ibge, competencia)`);
await q(`create table if not exists folha_agape_coleta (
  cod_ibge text, ano int, municipio text, linhas int, com_valor int, situacao text, detalhe text,
  em timestamptz default now(), primary key (cod_ibge, ano)
)`);

const SEMENTE = [
  ["3203320", "Marataízes", "ES", "https://marataizes.es.gov.br/transparencia"],
  ["3200706", "Atílio Vivácqua", "ES", "https://www.pmav.es.gov.br/transparencia"],
  // Piúma tinha 15 servidores no banco (via Betha) para 1.352 vínculos na RAIS — o conferidor apontou, e o
  // diagnóstico mostrou que o portal dela é Ágape, num CAMINHO (`/portal/transparencia`), não num subdomínio.
  ["3204203", "Piúma", "ES", "https://www.piuma.es.gov.br/portal/transparencia"],
];
for (const [cod, mun, uf, url] of SEMENTE) {
  await q(`insert into folha_agape_portal (cod_ibge,municipio,uf,base_url) values ($1,$2,$3,$4)
           on conflict (cod_ibge) do update set base_url=excluded.base_url`, [cod, mun, uf, url]);
}

const alvos = (await q(`select * from folha_agape_portal where ativo
  ${SO ? "and (municipio ilike '%'||$1||'%' or cod_ibge=$1)" : ""} order by municipio`, SO ? [SO] : [])).rows;
console.log(`[agape] ${alvos.length} portais · ano ${ANO}`);

// CSV com aspas e ';' — parser tolerante a ';' dentro de aspas
function csvLinhas(txt) {
  const linhas = [];
  let campo = "", reg = [], aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (aspas) {
      if (ch === '"' && txt[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === ";") { reg.push(campo); campo = ""; }
    else if (ch === "\n") { reg.push(campo); linhas.push(reg); reg = []; campo = ""; }
    else if (ch !== "\r") campo += ch;
  }
  if (campo || reg.length) { reg.push(campo); linhas.push(reg); }
  return linhas.filter((r) => r.some((x) => x !== ""));
}

const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// ── rendimentos: um GET por servidor devolve os 12 meses ────────────────────────────────────────────────────────
function serieRendimento(html) {
  const trs = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((m) => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((x) => texto(x[1])));
  const acha = (re) => trs.find((c) => c.length > 12 && re.test(c[0] || ""));
  const venc = acha(/total de vencimentos/i), desc = acha(/total de descontos/i), liq = acha(/total l[íi]quido/i);
  const meses = [];
  for (let i = 0; i < 12; i++) {
    const b = venc ? num(venc[i + 1]) : null, d = desc ? num(desc[i + 1]) : null, l = liq ? num(liq[i + 1]) : null;
    if ((b || 0) > 0 || (l || 0) > 0) meses.push({ i, bruto: b, descontos: d, liquido: l });
  }
  return meses;
}

for (const a of alvos) {
  console.log(`\n══ ${a.municipio} — ${a.base_url}`);
  const nav = navegador();
  const marca = (situacao, detalhe, linhas = 0, comValor = 0) =>
    q(`insert into folha_agape_coleta (cod_ibge,ano,municipio,linhas,com_valor,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,now())
       on conflict (cod_ibge,ano) do update set linhas=excluded.linhas, com_valor=excluded.com_valor,
         situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, ANO, a.municipio, linhas, comValor, situacao, detalhe]);
  try {
    const lista = `${a.base_url}/rh/servidores`;
    const pgLista = (await nav(lista)).texto;
    // 🚨 O PARÂMETRO DO DOWNLOAD MUDA DE INSTALAÇÃO PARA INSTALAÇÃO: em Marataízes é `?comp_ano=2026`, em Atílio
    // Vivácqua é `?situacao=Ativo` — e passar o parâmetro do outro devolve **"Database Error" (HTTP 500)**. Não
    // inventar a query: usar a que a PRÓPRIA página publica ([[pnigp-coletor-ok-sem-dado-sete-causas]], defeito
    // nº 4 — parâmetro do primeiro portal virando constante).
    const doPortal = (pgLista.match(/href=["']([^"']*rh\/servidores_download\/csv[^"']*)["']/i) || [])[1];
    // 🚨 o `?` pendurado sem query (como Piúma publica) faz o portal devolver a página sem o link do arquivo
    const urlCsv = doPortal ? new URL(doPortal.replace(/&amp;/g, "&").replace(/\?$/, ""), a.base_url).href
                            : `${a.base_url}/rh/servidores_download/csv?comp_ano=${ANO}`;
    console.log(`  download: ${urlCsv.replace(a.base_url, "")}`);
    // 1º salto: gera o arquivo. 2º salto: baixa o link que a página devolve.
    const g = await nav(urlCsv, lista);
    const link = (g.texto.match(/href=["']([^"']*uploads\/temp\/[^"']+)["']/i) || [])[1];
    if (!link) console.log(`  (exportação devolveu ${g.st} · ${g.texto.length} bytes sem link)`);

    // ── caminho A: o CSV (quando a exportação do portal funciona) ────────────────────────────────────────────────
    let cadastro = [];
    if (link) {
      const csv = (await nav(new URL(link, a.base_url).href, lista)).texto;
      const linhas = csvLinhas(csv);
      const cab = (linhas[0] || []).map((c) => c.trim().toLowerCase());
      const ix = (n) => cab.indexOf(n);
      const C = {
        matricula: ix("matricula"), nome: ix("nome"), secretaria: ix("secretaria"), cargo: ix("cargo"),
        salario: ix("salariocargo"), profissao: ix("profissao"), regime: ix("regime"), jornada: ix("jornada"),
        admissao: ix("admissao"), demissao: ix("demissao"), lotacao: ix("lotacao"), local: ix("local_trabalho"),
        situacao: ix("situacao"), contrato: ix("contrato"),
      };
      const pega = (r, i) => (i >= 0 && i < r.length ? (r[i] || "").trim() || null : null);
      cadastro = linhas.slice(1).map((r) => ({
        matricula: pega(r, C.matricula), nome: pega(r, C.nome), secretaria: pega(r, C.secretaria),
        cargo: pega(r, C.cargo), profissao: pega(r, C.profissao), regime: pega(r, C.regime),
        jornada: pega(r, C.jornada), lotacao: pega(r, C.lotacao), local_trabalho: pega(r, C.local),
        situacao: pega(r, C.situacao), data_admissao: pega(r, C.admissao), data_demissao: pega(r, C.demissao),
        salario_cargo: num(pega(r, C.salario)), contrato: pega(r, C.contrato) || "0", cnpj: null, ano: String(ANO),
      })).filter((x) => x.matricula || x.nome);
    }

    // ── caminho B: a LISTAGEM paginada, quando a exportação está quebrada ───────────────────────────────────────
    // 🚨 Em Atílio Vivácqua as três exportações (csv/txt/xml) devolvem **"Database Error" HTTP 500** — defeito no
    // servidor do próprio portal, não na chamada. A tela de listagem, porém, funciona: 20 por página, offset na
    // URL (`/rh/servidores/{offset}`). E o link de cada servidor traz o `comp_ano` e o `contrato` DELE — que não
    // são o ano corrente (variam de 2012 a 2026). Forçar `comp_ano=2026` devolve "Erro" na ficha: o ano tem de
    // sair do link publicado.
    if (!cadastro.length) {
      console.log("  exportação indisponível — indo pela LISTAGEM paginada");
      const vistos = new Map();
      const qs = doPortal && doPortal.includes("situacao") ? "?situacao=Ativo" : "";
      for (let off = 0; off < 20000; off += 20) {
        // a 1ª página é a própria tela (`/rh/servidores`); `/rh/servidores/0` não existe em toda instalação
        const pg = (await nav(off === 0 ? `${a.base_url}/rh/servidores${qs}` : `${a.base_url}/rh/servidores/${off}${qs}`, lista)).texto;
        const trs = [...pg.matchAll(/<tr class=['"]treegrid-[^'"]*['"]>([\s\S]*?)<\/tr>/gi)];
        if (!trs.length) break;
        const antes = vistos.size;
        // 🚨 mapear PELO CABEÇALHO: a ordem das colunas muda por instalação (Piúma tem uma coluna de data entre
        // matrícula e nome que Atílio não tem — índice fixo lê a data como nome).
        const cabTr = (pg.match(/<thead[\s\S]*?<\/thead>/i) || [""])[0];
        const cab = [...cabTr.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((x) => texto(x[1]).toLowerCase());
        const iCol = (re) => cab.findIndex((x) => re.test(x));
        const cMat = iCol(/matr[íi]cula/), cNome = iCol(/nome|servidor/), cCargo = iCol(/cargo/),
              cFun = iCol(/fun[çc][ãa]o|profiss/), cEnt = iCol(/entidade|unidade|[óo]rg[ãa]o/), cSit = iCol(/situa/);
        for (const t of trs) {
          const tds = [...t[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => texto(x[1]));
          // a URL do rendimento tem DUAS formas: com entidade (`/rendimento/{mat}/{ent}?comp_ano=&contrato=`) e
          // seca (`/rendimento/{mat}`). Inventar a que falta devolve erro — aceitar as duas.
          const rend = t[1].match(/\/rh\/rendimento\/(\d+)(?:\/([\w.-]+))?(?:\?comp_ano=(\d{4}))?(?:&(?:amp;)?contrato=([^'"&\s]*))?/i);
          if (!rend) continue;
          const pega = (i) => (i >= 0 && i < tds.length ? tds[i] || null : null);
          const bruto = pega(cNome) || "";
          const nome = bruto.replace(/^.*?(Ficha Funcional|Licenças|Passagens|Alimentação)[^>]*>\s*/s, "").trim();
          const chave = `${rend[1]}|${rend[4] || "0"}`;
          if (vistos.has(chave)) continue;
          vistos.set(chave, {
            matricula: rend[1], nome: nome || bruto || null, cargo: pega(cCargo), secretaria: null,
            profissao: pega(cFun), regime: null, jornada: null, lotacao: pega(cEnt), local_trabalho: null,
            situacao: pega(cSit), data_admissao: null, data_demissao: null, salario_cargo: null,
            contrato: rend[4] || "0", cnpj: rend[2] || null, ano: rend[3] || String(ANO),
          });
        }
        // 🚨 além do fim, o CodeIgniter costuma repetir a ÚLTIMA página em vez de devolver vazio — sem esta
        // trava o laço vai até o teto do offset gastando milhares de requisições por nada.
        if (vistos.size === antes) break;
        if (off % 400 === 0) process.stdout.write(`\r   … ${vistos.size} servidores listados`);
      }
      console.log("");
      cadastro = [...vistos.values()];
    }
    if (!cadastro.length) { await marca("vazio", "nem exportação nem listagem devolveram servidores"); console.log("  ✖ sem cadastro"); continue; }
    console.log(`  cadastro: ${cadastro.length} servidores · ${cadastro.filter((x) => x.secretaria).length} com secretaria · ${cadastro.filter((x) => x.cargo).length} com cargo`);

    // o identificador da entidade sai da própria listagem — mas NEM TODA instalação tem: em Piúma a rota é
    // `/rh/rendimento/{matricula}` seca, sem entidade. Montar a URL com um id inventado devolve erro.
    const cnpjs = [...new Set([...pgLista.matchAll(/\/rh\/rendimento\/\d+\/([\w.-]+)/g)].map((m) => m[1]))];
    const cnpj = cnpjs[0];
    console.log(`  entidades vistas na listagem: ${cnpjs.join(", ") || "(nenhuma)"}`);

    const regs = [];
    const push = (c, comp, v) => regs.push({
      cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, entidade: c.lotacao || null, competencia: comp,
      matricula: c.matricula, nome: c.nome, secretaria: c.secretaria, cargo: c.cargo, profissao: c.profissao,
      regime: c.regime, jornada: c.jornada, lotacao: c.lotacao, local_trabalho: c.local_trabalho,
      situacao: c.situacao, data_admissao: c.data_admissao, data_demissao: c.data_demissao,
      salario_cargo: c.salario_cargo, bruto: v?.bruto ?? null, descontos: v?.descontos ?? null, liquido: v?.liquido ?? null,
      _hash: crypto.createHash("md5").update([a.cod_ibge, comp, c.matricula, c.nome, c.cargo].join("¦")).digest("hex"),
    });

    const rota = (c, tela) => {
      const ano = c.ano || String(ANO), ent = c.cnpj || cnpj;
      return ent ? `${a.base_url}/rh/${tela}/${c.matricula}/${ent}?comp_ano=${ano}&contrato=${c.contrato}`
                 : `${a.base_url}/rh/${tela}/${c.matricula}?comp_ano=${ano}`;
    };
    if (SEM_RENDIMENTO) {
      for (const c of cadastro) push(c, `${ANO}00`, null);   // sem competência: é o cadastro do exercício
    } else {
      let feitos = 0, comValor = 0;
      const fila = [...cadastro];
      const trabalhador = async () => {
        while (fila.length) {
          const c = fila.pop();
          const ano = c.ano || String(ANO), ent = c.cnpj || cnpj;
          try {
            // quando o cadastro veio da listagem, falta a lotação — ela está na FICHA ("Unidade"/"Lotação")
            if (!c.secretaria) {
              const f = await nav(rota(c, "ficha"), lista);
              const campo = (re) => { const m = f.texto.replace(/<\/t[dh]>/gi, "¦").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").match(re); return m ? m[1].replace(/¦/g, "").trim() || null : null; };
              c.secretaria = campo(/Unidade:\s*¦?\s*([^¦]{2,80})/i) || campo(/Lota[çc][ãa]o:\s*¦?\s*([^¦]{2,80})/i);
              c.lotacao = c.lotacao || campo(/Lota[çc][ãa]o:\s*¦?\s*([^¦]{2,80})/i);
            }
            const r = await nav(rota(c, "rendimento"), lista);
            const serie = serieRendimento(r.texto);
            if (serie.length) { comValor++; for (const m of serie) push(c, `${ano}${String(m.i + 1).padStart(2, "0")}`, m); }
            else push(c, `${ano}00`, null);
          } catch { push(c, `${ano}00`, null); }
          if (++feitos % 250 === 0) console.log(`   … ${feitos}/${cadastro.length} fichas (${comValor} com valor)`);
        }
      };
      await Promise.all(Array.from({ length: CONC }, trabalhador));
      console.log(`  rendimentos: ${comValor} de ${cadastro.length} servidores com série mensal`);
    }

    // grava
    const m = new Map(); for (const r of regs) m.set(r._hash, r);
    const todos = [...m.values()];
    for (let i = 0; i < todos.length; i += 500) {
      const p = todos.slice(i, i + 500); const c = (f) => p.map((x) => x[f]);
      await q(`insert into folha_servidores_agape
        (cod_ibge,municipio,uf,entidade,competencia,matricula,nome,secretaria,cargo,profissao,regime,jornada,
         lotacao,local_trabalho,situacao,data_admissao,data_demissao,salario_cargo,bruto,descontos,liquido,_hash)
        select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
          $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[],$16::text[],$17::text[],
          $18::numeric[],$19::numeric[],$20::numeric[],$21::numeric[],$22::text[])
        on conflict (_hash) do update set bruto=excluded.bruto, descontos=excluded.descontos,
          liquido=excluded.liquido, salario_cargo=excluded.salario_cargo, _coletado_em=now()`,
        [c("cod_ibge"), c("municipio"), c("uf"), c("entidade"), c("competencia"), c("matricula"), c("nome"),
         c("secretaria"), c("cargo"), c("profissao"), c("regime"), c("jornada"), c("lotacao"), c("local_trabalho"),
         c("situacao"), c("data_admissao"), c("data_demissao"), c("salario_cargo"), c("bruto"), c("descontos"),
         c("liquido"), c("_hash")]);
    }
    const comValor = todos.filter((r) => r.bruto > 0).length;
    await marca("ok", null, todos.length, comValor);
    console.log(`  ✔ ${todos.length.toLocaleString("pt-BR")} linhas gravadas · ${comValor.toLocaleString("pt-BR")} com valor pago`);
  } catch (e) {
    await marca("erro", String(e?.cause?.message || e.message).slice(0, 200));
    console.log(`  ✖ ${String(e?.cause?.message || e.message).slice(0, 120)}`);
  }
}
await db.end();
