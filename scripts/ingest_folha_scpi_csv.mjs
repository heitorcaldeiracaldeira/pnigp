// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_scpi_csv.mjs — folha nominal do SCPI 9.0 por HTTP puro, via EXPORTAÇÃO CSV. Sem navegador.
//
// ⭐ POR QUE ESTE COLETOR EXISTE, se já havia um de SCPI: o antigo dirige um Playwright e espera um iframe.
// Em 33 municípios ele morria com "iframe Servidores nao carregou" — o iframe existe (`Home.aspx`), mas o
// caminho pelo navegador é frágil e caro. A tela `Servidores.ASPX` é alcançável direto, e a própria página
// tem botão de exportar: um POST devolve o ANO INTEIRO em CSV (Bastos/SP: 8.190 linhas, 1,6 MB, num request).
//
// ⭐ E O FIORILLI É ISTO AQUI. O portal rotulado "fiorilli" no Radar responde "SCPI 9.0 - Transparência":
// `bastossp.dcfiorilli.com.br:879` e `naap2.naap.app.br:885` são a mesma tela de Maués. O host é DC Sistemas +
// Fiorilli — fornecedor é HOST, não ERP ([[pnigp-fornecedor-e-host-nao-erp]]).
//
// A CADEIA:
//   1. GET  {base}/                     → cookie de sessão. 🚨 sem ele, Servidores.ASPX devolve HTTP 500.
//   2. GET  {base}/Servidores.ASPX      → os ~48 campos ocultos do ASP.NET (__VIEWSTATE & cia).
//   3. POST {base}/Servidores.ASPX      → ocultos + Opcao1=rbListagemServidoresAtivos + TipoRef=rbTipoRefMensal
//                                         + cmbMes_VI/cmbMes + btnExportarCSV.x/.y
//      🚨 `btnExportarCSV` é <input type=image>: sem as COORDENADAS `.x`/`.y` o ASP.NET não vê o clique e
//         devolve a página de novo, não o arquivo.
//
// O CSV vem em latin1, separado por ";", e traz uma linha por servidor POR MÊS ("Folha Mensal - Janeiro"),
// com Unidade e Divisão — a secretaria declarada pela fonte, sem dicionário no meio.
//
// Uso: node scripts/ingest_folha_scpi_csv.mjs        (todos os hosts conhecidos que ainda não deram certo)
//      BASE=https://bastossp.dcfiorilli.com.br:879/transparencia/ MUN=Bastos UF=SP node scripts/...
//      SO=Bastos   ·   REFAZ=1   ·   CONC=3
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { Agent } from "undici";
import { pool, withRetry } from "./_cadprev.mjs";

// 🚨 SCPI é ON-PREMISE: roda no servidor da própria prefeitura, com certificado auto-assinado, expirado ou
// emitido para outro nome. 32 dos 57 erros da primeira rodada foram TLS ("unable to verify the first
// certificate", "certificate has expired", erro de SSL routines) — nada disso é indisponibilidade do dado.
// Aqui a leitura é pública e só de leitura, então o certificado não é a garantia que importa: a prova é o
// conteúdo. Sem esta agente, um terço dos municípios fica invisível por causa de um certificado vencido.
const inseguro = new Agent({ connect: { rejectUnauthorized: false } });

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const CONC = +(process.env.CONC || 3);
const REFAZ = process.env.REFAZ === "1";
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,*/*;q=0.8", "accept-language": "pt-BR,pt;q=0.9" };
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const num = (v) => { const s = String(v || "").replace(/[R$\s.]/g, "").replace(",", ".").trim();
  if (!s || s === "-") return null; const n = parseFloat(s); return Number.isFinite(n) ? n : null; };
const chave = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function sessao() {
  const jar = new Map();
  return async (u, o = {}) => {
    const h = { ...UA, ...(o.headers || {}) };
    if (jar.size) h.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    try {
      const r = await fetch(u, { ...o, headers: h, redirect: "follow", dispatcher: inseguro,
        signal: AbortSignal.timeout(o.timeout || 180000) });
      for (const c of r.headers.getSetCookie?.() || []) { const [kv] = c.split(";"); const i = kv.indexOf("="); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
      const b = Buffer.from(await r.arrayBuffer());
      return { st: r.status, buf: b, ct: r.headers.get("content-type") || "" };
    } catch (e) { return { st: 0, buf: Buffer.alloc(0), ct: "", erro: String(e?.cause?.message || e.message).slice(0, 60) }; }
  };
}

await q(`create table if not exists folha_servidores_scpicsv (
  cod_ibge text, municipio text, uf text, host text, competencia text, referencia text,
  matricula text, contrato text, nome text, data_admissao text, data_desligamento text,
  cargo text, vinculo text, unidade text, secretaria text,
  proventos numeric, descontos numeric, liquido numeric, carga_horaria text,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_scpicsv_mun on folha_servidores_scpicsv (cod_ibge, competencia)`);
await q(`create table if not exists folha_scpicsv_coleta (
  host text primary key, cod_ibge text, municipio text, uf text, base text, competencia text,
  linhas int, meses int, situacao text, detalhe text, em timestamptz default now())`);

// ── alvos: os hosts que o coletor de navegador NÃO conseguiu, começando pelos que falharam no iframe ───────────
let alvos;
if (process.env.BASE) {
  const m = (await q(`select cod_ibge, nome, uf from municipios_br where lower(nome)=lower($1) ${process.env.UF ? "and uf=$2" : ""} limit 1`,
    process.env.UF ? [process.env.MUN, process.env.UF] : [process.env.MUN])).rows[0] || {};
  alvos = [{ cod_ibge: m.cod_ibge, municipio: m.nome || process.env.MUN, uf: m.uf || process.env.UF,
    base: process.env.BASE.replace(/\/*$/, "/"), host: new URL(process.env.BASE).host }];
} else {
  alvos = (await q(`select s.cod_ibge, m.nome municipio, m.uf, s.host, s.situacao, s.detalhe
    from folha_scpi_coleta s join municipios_br m on m.cod_ibge = s.cod_ibge
    where s.host is not null and s.situacao <> 'ok'
    ${SO ? "and m.nome ilike '%'||$1||'%'" : ""}
    order by (s.detalhe ilike '%iframe%') desc, m.nome`, SO ? [SO] : [])).rows
    .map((a) => ({ ...a, base: `https://${a.host.replace(/^https?:\/\//, "")}/transparencia/` }));

  // ⭐ SEGUNDA FONTE DE ALVOS: a varredura por site (`folha_verificacao_site`) abre o portal de cada município e
  // guarda a URL do item de pessoal. Foi ela que revelou a família `{slug}.scpiweb.com.br` — hosts que nenhuma
  // varredura por IP/porta acharia, porque cada prefeitura hospeda no próprio nome
  // ([[pnigp-descobre-portal-pelo-site-oficial]], [[pnigp-verificacao-publicacao-por-site]]).
  const daVarredura = (await q(`select v.cod_ibge, v.municipio, v.uf,
      coalesce(v.url_pessoal, v.url_transparencia) url
    from folha_verificacao_site v
    where coalesce(v.url_pessoal, v.url_transparencia) is not null
      and (v.erp = 'fiorilli' or coalesce(v.url_pessoal, v.url_transparencia) ~* 'scpi|dcfiorilli|AcessoIndividual')
    ${SO ? "and v.municipio ilike '%'||$1||'%'" : ""}`, SO ? [SO] : [])).rows;
  // ⭐ TERCEIRA FONTE: a varredura `{slug}.scpiweb.com.br` (`descobre_scpiweb.mjs`). O host é DERIVADO do nome
  // do município — foi assim que Mucajaí, Alto Alegre, Pacaraima e Rorainópolis apareceram sem que nenhuma
  // outra sonda os tivesse encontrado.
  const daFamilia = (await q(`select cod_ibge, municipio, uf, host, url from scpiweb_descoberto
    where situacao='achado' ${SO ? "and municipio ilike '%'||$1||'%'" : ""}`, SO ? [SO] : [])).rows;

  const vistos = new Set(alvos.map((a) => a.host));
  for (const d of daFamilia) {
    if (vistos.has(d.host)) continue;
    vistos.add(d.host);
    alvos.push({ cod_ibge: d.cod_ibge, municipio: d.municipio, uf: d.uf, host: d.host, base: d.url });
  }
  for (const v of daVarredura) {
    let u; try { u = new URL(v.url); } catch { continue; }
    if (vistos.has(u.host)) continue;
    vistos.add(u.host);
    // 🚨 O CAMINHO DA URL É PARTE DO ENDEREÇO, não enfeite. Jogar fora a pasta e montar `https://host/transparencia/`
    // quebrou 36 municípios do Piauí: em `sistemas.boahora.pi.gov.br/pmboahora/` e em
    // `portal.transparenciagov.cloud/buritidoslopes/` a instalação vive numa PASTA POR ENTIDADE, e a raiz do host
    // devolve a página padrão do IIS — 701 bytes de "IIS Windows Server", que o coletor aceitava como base boa.
    // Aqui a base é o DIRETÓRIO da URL que a varredura mediu: tira o arquivo (Default.aspx) e a query, mantém a pasta.
    const dir = u.pathname.replace(/[^/]*$/, "");
    alvos.push({ cod_ibge: v.cod_ibge, municipio: v.municipio, uf: v.uf, host: u.host,
      base: `${u.protocol}//${u.host}${dir || "/"}` });
  }
}
const feitos = REFAZ ? new Set() : new Set((await q(`select host from folha_scpicsv_coleta where situacao='ok'`)).rows.map((r) => r.host));
const fila = alvos.filter((a) => !feitos.has(a.host));
console.log(`[scpicsv] ${alvos.length} alvos · ${fila.length} na fila`);

const LOTE = 800;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f] ?? null);
    await q(`insert into folha_servidores_scpicsv
      (cod_ibge,municipio,uf,host,competencia,referencia,matricula,contrato,nome,data_admissao,data_desligamento,
       cargo,vinculo,unidade,secretaria,proventos,descontos,liquido,carga_horaria,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[],$16::numeric[],
        $17::numeric[],$18::numeric[],$19::text[],$20::text[])
      on conflict (_hash) do update set proventos=excluded.proventos, descontos=excluded.descontos,
        liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("host"), c("competencia"), c("referencia"), c("matricula"),
       c("contrato"), c("nome"), c("data_admissao"), c("data_desligamento"), c("cargo"), c("vinculo"),
       c("unidade"), c("secretaria"), c("proventos"), c("descontos"), c("liquido"), c("carga_horaria"), c("_hash")]);
  }
}

// o CSV vem em latin1 e com ";" — e o cabeçalho VARIA de instalação para instalação, então as colunas são
// achadas pelo RÓTULO, nunca pela posição ([[pnigp-rotulo-de-coluna-varia-lei]]).
function parseCsv(buf) {
  const txt = buf.toString("latin1");
  const linhas = txt.split(/\r?\n/).filter((L) => L.trim());
  if (linhas.length < 2) return { cab: [], regs: [] };
  const cab = linhas[0].split(";").map((x) => chave(x.replace(/^"|"$/g, "")));
  const idx = (re) => cab.findIndex((c) => re.test(c));
  const col = {
    referencia: idx(/^referencia/), matricula: idx(/matricula/), contrato: idx(/contrato/), nome: idx(/^nome/),
    adm: idx(/admiss/), deslig: idx(/desligamento/), cargo: idx(/^cargo/), vinculo: idx(/vinculo/),
    unidade: idx(/unidade/), divisao: idx(/divisao|lotacao|secretaria/),
    prov: idx(/provento|bruto|vencimento/), desc: idx(/desconto/), liq: idx(/liquido/), carga: idx(/carga/),
  };
  // 🚨 SEM COLUNA DE NOME = FOLHA ANONIMIZADA, não folha vazia. Boa Hora/PI publica 391 linhas com proventos,
  // cargo, vínculo, divisão e unidade — e nenhum nome. Devolver "vazio" aqui manda o coletor tentar os 12 meses
  // à toa e grava um veredito falso. O certo é dizer o que é ([[pnigp-lista-sem-valor-nao-e-folha]]).
  if (col.nome < 0 && col.prov >= 0) return { cab, regs: [], anonimizada: true };
  if (col.nome < 0 || col.prov < 0) return { cab, regs: [] };
  const regs = [];
  for (const L of linhas.slice(1)) {
    const p = L.split(";");
    const nome = (p[col.nome] || "").replace(/^"|"$/g, "").trim();
    if (!nome) continue;
    const g = (i) => (i >= 0 ? (p[i] || "").replace(/^"|"$/g, "").trim() || null : null);
    regs.push({ referencia: g(col.referencia), matricula: g(col.matricula), contrato: g(col.contrato), nome,
      data_admissao: g(col.adm), data_desligamento: g(col.deslig), cargo: g(col.cargo), vinculo: g(col.vinculo),
      unidade: g(col.unidade), secretaria: g(col.divisao) || g(col.unidade),
      proventos: num(g(col.prov)), descontos: num(g(col.desc)), liquido: num(g(col.liq)), carga_horaria: g(col.carga) });
  }
  return { cab, regs };
}

// "Folha Mensal - Janeiro" → 01. Sem mês reconhecido, a competência fica nula em vez de chutar.
const mesDe = (ref) => {
  const k = chave(ref);
  const i = MESES.findIndex((m) => k.includes(chave(m)));
  return i >= 0 ? String(i + 1).padStart(2, "0") : null;
};

let ok = 0, falhou = 0, totalLinhas = 0;
const fifo = [...fila];
await Promise.all(Array.from({ length: CONC }, async () => {
  while (fifo.length) {
    const a = fifo.shift();
    const marca = (situacao, detalhe, comp = null, linhas = 0, meses = 0) =>
      q(`insert into folha_scpicsv_coleta (host,cod_ibge,municipio,uf,base,competencia,linhas,meses,situacao,detalhe,em)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
         on conflict (host) do update set competencia=excluded.competencia, linhas=excluded.linhas,
           meses=excluded.meses, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
        [a.host, a.cod_ibge, a.municipio, a.uf, a.base, comp, linhas, meses, situacao, detalhe]);
    try {
      // 🚨 HOST NÃO BASTA, PRECISA DE PORTA E CAMINHO. O SCPI é on-premise e cada instalação escolhe a sua:
      // Bastos atende em :879, Maués em :921, Serrita em :885, e muitos em :8079. Fixar um só devolvia 404 em
      // 22 municípios ([[pnigp-varredura-host-porta-onpremise]]). Tenta os candidatos até um responder a tela.
      const nav = sessao();
      const semPorta = a.host.replace(/^https?:\/\//, "").replace(/:\d+$/, "");
      const temPorta = /:\d+$/.test(a.host.replace(/^https?:\/\//, ""));
      const hosts = temPorta ? [a.host.replace(/^https?:\/\//, "")]
        : [semPorta, `${semPorta}:879`, `${semPorta}:8079`, `${semPorta}:885`, `${semPorta}:921`, `${semPorta}:8080`];
      // 🚨 A BASE MEDIDA VEM PRIMEIRO. O montador de candidatos reconstruía tudo a partir do host e jogava fora
      // a pasta que a varredura tinha medido — o conserto do caminho não chegava a ser usado. O que foi observado
      // no site vale mais que qualquer molde ([[pnigp-descobre-portal-pelo-site-oficial]]).
      const bases = [];
      if (a.base) bases.push(a.base);
      for (const h of hosts) for (const proto of ["https", "http"]) for (const cam of ["/transparencia/", "/Transparencia/", "/"])
        bases.push(`${proto}://${h}${cam}`);
      let home = null, base = null;
      for (const cand of bases) {
        const r = await nav(cand, { timeout: 45000 });
        if (r.st === 200 && /SCPI/i.test(r.buf.toString("latin1").slice(0, 8000))) { home = r; base = cand; break; }
        // 🚨 a raiz do host costuma devolver a PÁGINA PADRÃO DO IIS (701 bytes, "IIS Windows Server"): é 200 e
        // não é portal nenhum. Aceitá-la como plano B fazia o coletor seguir e morrer em Servidores.ASPX 404.
        const corpo = r.buf.toString("latin1");
        if (!home && r.st === 200 && r.buf.length > 1500 && !/IIS Windows Server/i.test(corpo)) { home = r; base = cand; }
      }
      if (!home || home.st !== 200) { falhou++; await marca("erro", `nenhum dos ${bases.length} candidatos respondeu`); console.log(`  ✖ ${String(a.municipio).padEnd(26)} nenhum candidato respondeu`); continue; }
      a.base = base;
      const pg = await nav(a.base + "Servidores.ASPX", { timeout: 120000 });
      if (pg.st !== 200) { falhou++; await marca("erro", `Servidores.ASPX HTTP ${pg.st || pg.erro}`); console.log(`  ✖ ${String(a.municipio).padEnd(26)} Servidores.ASPX ${pg.st || pg.erro}`); continue; }
      const html = pg.buf.toString("latin1");
      const campos = new URLSearchParams();
      for (const m of html.matchAll(/<input[^>]+type=["']hidden["'][^>]*>/gi)) {
        const n = (m[0].match(/name=["']([^"']+)/) || [])[1];
        const v = (m[0].match(/value=["']([^"']*)/) || [])[1] || "";
        if (n) campos.set(n, v);
      }
      if (!campos.has("__VIEWSTATE")) { falhou++; await marca("erro", "sem __VIEWSTATE — não é SCPI"); console.log(`  ✖ ${String(a.municipio).padEnd(26)} não parece SCPI`); continue; }
      // 🚨 O MÊS DA TELA NEM SEMPRE TEM DADO. Em Caroebe/RR o mês que a página traz por padrão devolve um CSV
      // só com cabeçalho — 0 KB de dado. Não é portal sem folha: é mês vazio. Recua mês a mês até render,
      // e o `rbPesqTodas` entra como última tentativa (traz o ano inteiro de uma vez).
      const mesPadrao = campos.get("cmbMes_VI") || String(new Date().getMonth() + 1).padStart(2, "0");
      const ordem = [mesPadrao, ...Array.from({ length: 12 }, (_, i) => String(12 - i).padStart(2, "0"))]
        .filter((m, i, arr) => arr.indexOf(m) === i);
      let csv = null, regs = [], usouTodas = false, anonimizada = false;
      for (const tentativa of [...ordem.map((m) => ({ mes: m, tipo: "rbTipoRefMensal" })), { mes: mesPadrao, tipo: "rbPesqTodas" }]) {
        campos.set("Opcao1", "rbListagemServidoresAtivos");
        campos.set("TipoRef", tentativa.tipo);
        campos.set("cmbMes_VI", tentativa.mes);
        campos.set("cmbMes", MESES[+tentativa.mes - 1] || "Julho");
        campos.set("btnExportarCSV.x", "10");
        campos.set("btnExportarCSV.y", "10");
        const r2 = await nav(a.base + "Servidores.ASPX", { method: "POST", body: campos.toString(), timeout: 300000,
          headers: { "content-type": "application/x-www-form-urlencoded", referer: a.base + "Servidores.ASPX" } });
        if (r2.st !== 200 || !/csv|excel|octet/i.test(r2.ct)) { csv = csv || r2; continue; }
        csv = r2;
        const p2 = parseCsv(r2.buf);
        if (p2.anonimizada) { anonimizada = true; break; }   // nenhum mês vai trazer nome: o layout não tem
        if (p2.regs.length) { regs = p2.regs; usouTodas = tentativa.tipo === "rbPesqTodas"; break; }
      }
      if (!csv || csv.st !== 200 || !/csv|excel|octet/i.test(csv.ct)) {
        falhou++; await marca("erro", `exportação devolveu ${csv?.st} ${String(csv?.ct).slice(0, 40)}`);
        console.log(`  ✖ ${String(a.municipio).padEnd(26)} export ${csv?.st} ${String(csv?.ct).slice(0, 30)}`); continue;
      }
      if (anonimizada) {
        falhou++;
        await marca("publica_sem_nome", "o portal exporta a folha COM VALOR e SEM COLUNA DE NOME — anonimizada, não é folha nominal");
        console.log(`  ⊘ ${String(a.municipio).padEnd(26)} publica sem nome (anonimizada)`); continue;
      }
      if (!regs.length) { falhou++; await marca("vazio", `CSV chega, mas nenhum dos 12 meses tem linha de servidor`); console.log(`  · ${String(a.municipio).padEnd(26)} todos os meses vazios`); continue; }
      // 🚨 uma linha por servidor POR MÊS: guardar tudo é a série, mas a competência de cada linha vem da
      // própria referência — misturar meses numa competência só contaria a mesma pessoa doze vezes.
      const ano = new Date().getFullYear();
      const comRegs = regs.map((r) => {
        const mm = mesDe(r.referencia);
        const competencia = mm ? `${ano}${mm}` : null;
        return { ...r, cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, host: a.host, competencia,
          _hash: crypto.createHash("md5").update([a.host, competencia, r.matricula, r.contrato, r.nome, r.cargo].join("¦")).digest("hex") };
      });
      await grava(comRegs);
      const meses = new Set(comRegs.map((r) => r.competencia).filter(Boolean)).size;
      const cheia = [...comRegs.reduce((m, r) => m.set(r.competencia, (m.get(r.competencia) || 0) + 1), new Map())]
        .sort((x, y) => y[1] - x[1])[0];
      totalLinhas += comRegs.length; ok++;
      await marca("ok", null, cheia?.[0] || null, comRegs.length, meses);
      console.log(`  ✔ ${String(a.municipio).padEnd(26)} ${String(comRegs.length).padStart(6)} linhas · ${meses} meses · mais cheio ${cheia?.[0]} (${cheia?.[1]})`);
    } catch (e) { falhou++; await marca("erro", String(e.message).slice(0, 180)); console.log(`  ✖ ${a.municipio}: ${String(e.message).slice(0, 70)}`); }
  }
}));
console.log(`\n[scpicsv] ${totalLinhas.toLocaleString("pt-BR")} linhas · ${ok} municípios ok · ${falhou} falharam`);
await db.end();
