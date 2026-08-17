// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_abase.mjs — folha nominal COM salário do bloco `abase`, 43 municípios do RS (o maior bloco novo).
//
// Achado em 15/ago/2026 rodando `descobre_portal_real.mjs` (ERP=NULO) nos municípios que ainda faltavam: 303 de
// 455 revelaram portal real, e `transparencia.abase.com.br` sozinho respondeu por 43 ([[pnigp-rs-mapa-folha-497]]).
//
// O portal é `transparencia.abase.com.br/{tela}/{TOKEN}`, onde o TOKEN identifica o município (como o hash do
// Betha). A API é pública e documentada: `apitransparencia.abase.com.br` (o próprio portal linka o Swagger).
//
// A ROTA (DataTables server-side, POST form-urlencoded):
//   POST /Usuario/ContratosFolhaPagamento/ListaValoresContratoFuncionario
//        draw · start · length · token · jsonData
//   GET  /Usuario/ContratosFolhaPagamento/TotalizadorValoresContratoFuncionario?token&jsonData
//        → {total_brutor, total_liquido, cargos, colaboradores}  ⭐ é a PROVA contra o que foi gravado
//
// 🚨 O `jsonData` tem três campos que NÃO são adivinháveis e sem os quais a API responde **200 com zero linhas**:
//    `mes` é ARRAY (["7"], não "7") · `rec_execucao: "5"` · e o `token` vai também NO BODY, não só na URL.
//    Foi preciso capturar a requisição INTEIRA do app e só então simplificar — a mesma lição do `sortBy=null`
//    da Betha ([[pnigp-betha-folha-nominal-nacional]]).
//
// 🚨 O HOST É COMPARTILHADO por todos os municípios e devolve HTTP 429 sob rajada: 43 municípios × 6 sondagens
//    sem pausa derrubaram 35 deles. Precisa de passada LENTA e dedicada, como o Portal TP
//    ([[pnigp-portaltp-epublica-folha]]). E 429 NUNCA pode virar "vazio" — bloqueio não é ausência de dado.
//
// Cada registro: cont_matricula · nome · situacao · estb_descricao (entidade) · car_descricao (CARGO) ·
// fca_descricao (função) · sec_descricao (SECRETARIA) · rec_periodo (AAAAMM) · cal_valor · hhor_jornadasemanal.
//
// Uso: UF=RS node scripts/ingest_folha_abase.mjs        (PAUSA / PAUSA_MUN / SONDAS ajustam o throttle)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";
import { COD_UF } from "./_uf.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;
const SO = process.env.SO || null;
const REFAZ = process.env.REFAZ === "1";
const API = "https://apitransparencia.abase.com.br";
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "content-type": "application/x-www-form-urlencoded; charset=UTF-8", referer: "https://transparencia.abase.com.br/" };
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const PAUSA = Number(process.env.PAUSA || 3000);          // entre requisições
const PAUSA_MUN = Number(process.env.PAUSA_MUN || 5000);  // entre municípios
const SONDAS = Number(process.env.SONDAS || 3);           // competências a sondar (1 requisição cada)

await q(`create table if not exists folha_servidores_abase (
  cod_ibge text, municipio text, uf text, entidade text, competencia text,
  matricula text, nome text, cargo text, funcao text, secretaria text, situacao text,
  jornada numeric, valor numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_abase_mun on folha_servidores_abase (cod_ibge, competencia)`);
// a tela B devolve CPF COMPLETO — guardar só mascarado
await q(`alter table folha_servidores_abase add column if not exists cpf_masc text`);
await q(`create table if not exists folha_abase_coleta (
  cod_ibge text primary key, municipio text, uf text, token text, competencia text,
  linhas int, declarado int, situacao text, detalhe text, em timestamptz default now()
)`);

// ⚠️ o token vem da URL descoberta e pode estar HTML-escapado (`&#199;`), URL-encoded (`%C3%87`) ou com a QUERY
// STRING da tela colada no fim (`PY73sijHPX4=?&mes=&ano=2022&...`) — cortar tudo a partir do `?`.
const desescapa = (s) => {
  let v = String(s || "").split("?")[0];
  try { v = decodeURIComponent(v); } catch { /* já decodificado */ }
  return v.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&").trim();
};

// 🚨 `portal_real_descoberto.uf` vem em DOIS formatos: sigla ("RS") quando a linha nasceu de
// `site_municipal_derivado`, e nome por extenso ("Rio Grande do Sul") quando veio do Radar. Filtrar por um só
// formato pegou 12 de 43 municípios — o resto ficou invisível. O filtro seguro é pelo PREFIXO do cod_ibge.
// ⭐ portais descobertos + candidatos achados lendo o site oficial (descobre_portal_pelo_site.mjs)
const alvos = (await q(`
  select distinct on (cod_ibge) cod_ibge, municipio, uf, url from (
    select p.cod_ibge, p.municipio, p.uf, p.url_portal_real url
      from portal_real_descoberto p where p.fornecedor ~ 'abase'
     union
    select c.cod_ibge, c.municipio, c.uf, c.url
      from folha_portal_candidato c where c.produto = 'abase'
  ) x
   where true ${UF ? "and left(cod_ibge,2) = $1" : ""} ${SO ? `and municipio ilike '%'||$${UF ? 2 : 1}||'%'` : ""}
   order by cod_ibge, length(url)`, [UF ? COD_UF : null, SO].filter(Boolean))).rows;
const feitos = new Set(REFAZ ? [] : (await q(`select cod_ibge from folha_abase_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[abase] ${alvos.length} portais · ${feitos.size} já feitos · ${fila.length} na fila`);

const jsonData = (ano, mes) => JSON.stringify({ entidade: "0", ano: String(ano), mes: [String(mes)],
  rec_execucao: "5", tfunc_id: null, hco_tipocontrato: null, situacao: null, pes_id: null, car_id: null,
  hco_regimetrab: null, prm_totaliza_por_agrupadores: false });

// ⭐ O ABASE TEM DUAS TELAS DE FOLHA, com APIs diferentes — e o município usa uma OU outra:
//   A) `/folha-de-pagamento-contratos/{token}` → Usuario/ContratosFolhaPagamento/ListaValoresContratoFuncionario
//   B) `/folha-de-pagamento/{token}`           → Usuario/Cargos_salarios/ListaFolhaPagamento  (+ `tipo_folha=3`)
// Eu só conhecia a A. Nos 22 municípios da tela B a API A responde **200 com erro interno 400**, o que eu tinha
// lido como bloqueio de IP — e não era: era a tela errada. A B ainda é MAIS RICA (traz `secretaria`).
// 🚨 `tipo_folha=3` é obrigatório e não é adivinhável: sem ele a resposta é 200 com `recordsTotal: 0`.
const cpfMasc = (s) => {
  const d = String(s || "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.***.***-${d.slice(9)}` : null;
};
async function listaB(token, ano, mes, start = 0, length = 5000) {
  const corpo = new URLSearchParams({ draw: "1", start: String(start), length: String(length),
    tipo_folha: "3", entidade: "0", token, mes: String(mes), ano: String(ano),
    situacao: "", nome: "", cargo: "", secretaria: "", tipoFuncionario: "", dataAdmissao: "" });
  for (let t = 0; t < 4; t++) {
    const r = await fetch(`${API}/Usuario/Cargos_salarios/ListaFolhaPagamento`,
      { method: "POST", body: corpo, headers: UA, signal: AbortSignal.timeout(120000) });
    if (r.status === 429) { await dorme(20000 * (t + 1)); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    await dorme(PAUSA);
    return r.json();
  }
  throw new Error("HTTP 429 persistente (tela B)");
}

async function lista(token, ano, mes, start = 0, length = 2000) {
  const corpo = new URLSearchParams({ draw: "1", start: String(start), length: String(length),
    "order[0][column]": "0", "order[0][dir]": "asc", "search[value]": "", "search[regex]": "false",
    token, jsonData: jsonData(ano, mes) });
  for (let t = 0; t < 6; t++) {
    const r = await fetch(`${API}/Usuario/ContratosFolhaPagamento/ListaValoresContratoFuncionario`,
      { method: "POST", body: corpo, headers: UA, signal: AbortSignal.timeout(120000) });
    // backoff LONGO: com 8s o 429 continuou vindo em 35 de 43 municípios — o host pede dezenas de segundos
    if (r.status === 429) { await dorme(20000 * (t + 1)); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    await dorme(PAUSA);
    return r.json();
  }
  throw new Error("HTTP 429 persistente após 6 tentativas");
}
async function totalizador(token, ano, mes) {
  const u = `${API}/Usuario/ContratosFolhaPagamento/TotalizadorValoresContratoFuncionario?token=${encodeURIComponent(token)}&jsonData=${encodeURIComponent(jsonData(ano, mes))}`;
  const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(90000) }).catch(() => null);
  return r?.ok ? (await r.json())?.data : null;
}

let totalGeral = 0, ok = 0, falhas = 0;
const hoje = new Date();
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const token = desescapa((a.url.match(/abase\.com\.br\/[a-z-]+\/(.+)$/i) || [])[1]);
  const marca = (situacao, detalhe, competencia = null, linhas = 0, declarado = 0) =>
    q(`insert into folha_abase_coleta (cod_ibge,municipio,uf,token,competencia,linhas,declarado,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
       on conflict (cod_ibge) do update set token=excluded.token, competencia=excluded.competencia,
         linhas=excluded.linhas, declarado=excluded.declarado, situacao=excluded.situacao,
         detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, token, competencia, linhas, declarado, situacao, detalhe]);
  try {
    if (!token) { await marca("erro", "token não extraído da URL"); falhas++; continue; }
    // competência MAIS CHEIA entre as recentes — não a mais recente ([[pnigp-sinsoft-citta-crackeados-rs]])
    // ⚠️ erro de REDE não pode virar "vazio": se todas as sondagens falharam, o município sai como ERRO —
    // que é retentável — em vez de "não publica", que é conclusão.
    // tenta as DUAS telas e fica com a que responder — B primeiro, porque traz secretaria
    let melhor = null, erros = 0, ultimoErro = null, tela = null;
    for (const [nomeTela, fn] of [["B", listaB], ["A", lista]]) {
      for (let k = 0; k < SONDAS; k++) {
        const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - k, 1));
        const ano = d.getUTCFullYear(), mes = d.getUTCMonth() + 1;
        let j = null;
        try { j = await fn(token, ano, mes, 0, 1); }
        catch (e) { erros++; ultimoErro = String(e.message).slice(0, 60); continue; }
        const n = j?.recordsTotal ?? 0;
        if (n && (!melhor || n > melhor.n)) { melhor = { ano, mes, n }; tela = nomeTela; }
      }
      if (melhor) break;
    }
    if (!melhor && erros) { await marca("erro", `todas as sondagens falharam · ${ultimoErro}`); falhas++; continue; }
    if (!melhor) { await marca("vazio", "as competências recentes responderam com zero linhas"); falhas++; continue; }

    const j = await (tela === "B" ? listaB : lista)(token, melhor.ano, melhor.mes, 0, Math.max(5000, melhor.n + 50));
    const dados = j?.data || [];
    const tot = await totalizador(token, melhor.ano, melhor.mes);
    const competencia = `${melhor.ano}${String(melhor.mes).padStart(2, "0")}`;

    // os dois formatos de registro (tela A e tela B) normalizados no mesmo esquema
    const regs = dados.map((s) => {
      const ehB = s.salario !== undefined || s.tipo_Funcionario !== undefined;
      const nome = (s.nome ?? "").trim() || null;
      return {
        cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, competencia,
        entidade: ehB ? (s.tipo_Funcionario ?? "").trim() || null : s.estb_descricao ?? null,
        matricula: ehB ? (s.codigo != null ? String(s.codigo) : null)
                       : (s.cont_matricula != null ? String(s.cont_matricula) : null),
        nome,
        cargo: ((ehB ? s.cargo : s.car_descricao) ?? "").trim() || null,
        funcao: ((ehB ? s.descricaoCargo : s.fca_descricao) ?? "")?.trim() || null,
        secretaria: ((ehB ? s.secretaria : s.sec_descricao) ?? "")?.trim() || null,
        situacao: ((ehB ? s.situacao : (s.situacao != null ? String(s.situacao) : null)) ?? "")?.toString().trim() || null,
        jornada: ehB ? (s.cargaHoraria ?? null) : (s.hhor_jornadasemanal ?? null),
        valor: ehB ? (s.salario ?? null) : (s.cal_valor ?? null),
        cpf_masc: ehB ? cpfMasc(s.cpf) : null,
        _hash: crypto.createHash("md5")
          .update([a.cod_ibge, competencia, s.codigo ?? s.cont_id, s.cont_matricula ?? "", nome, s.salario ?? s.cal_valor].join("|"))
          .digest("hex"),
      };
    }).filter((x) => x.nome);
    if (!regs.length) { await marca("vazio", `recordsTotal=${melhor.n} mas data veio vazio`, competencia); falhas++; continue; }

    const pp = [...new Map(regs.map((x) => [x._hash, x])).values()];
    if (REFAZ) await q(`delete from folha_servidores_abase where cod_ibge=$1 and competencia=$2`, [a.cod_ibge, competencia]);
    const c = (f) => pp.map((x) => x[f]);
    await q(`insert into folha_servidores_abase
      (cod_ibge,municipio,uf,entidade,competencia,matricula,nome,cargo,funcao,secretaria,situacao,jornada,valor,cpf_masc,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::numeric[],$13::numeric[],$14::text[],$15::text[])
      on conflict (_hash) do update set valor=excluded.valor, secretaria=excluded.secretaria, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("entidade"), c("competencia"), c("matricula"), c("nome"),
       c("cargo"), c("funcao"), c("secretaria"), c("situacao"), c("jornada"), c("valor"), c("cpf_masc"), c("_hash")]);

    // ⭐ a prova: o próprio portal declara quantos registros existem
    const declarado = j?.recordsTotal ?? 0;
    const bate = declarado && Math.abs(pp.length - declarado) <= 1;
    await marca(bate ? "ok" : "ok_divergente",
      `coletado ${pp.length} · declarado ${declarado}` + (tot ? ` · ${tot.colaboradores} colaboradores, bruto ${tot.total_brutor}` : ""),
      competencia, pp.length, declarado);
    totalGeral += pp.length; ok++;
    console.log(`  [${i + 1}/${fila.length}] ${a.municipio}: ${pp.length} servidores · ${competencia}` +
      (bate ? " ✓" : ` ⚠ declarado ${declarado}`));
  } catch (e) {
    falhas++;
    await marca("erro", String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.municipio}: ${String(e.message).slice(0, 80)}`);
  }
  await dorme(PAUSA_MUN);   // respiro entre municípios — o host é compartilhado
}
console.log(`\n[abase] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} portais ok · ${falhas} falhas`);
await db.end();
