// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_betha.mjs — folha nominal dos municípios que usam o portal Betha (490 municípios, 15 UFs).
//
// ⭐ POR QUE ESTA FONTE É A MELHOR das que achei: entrega os três campos que o Heitor priorizou JUNTOS e com a
// SECRETARIA DECLARADA pela própria fonte — `orgao` ("Secretaria Municipal de Educação - SEMED") e `organograma`
// ("Gerência de Ensino Fundamental") — enquanto no Farol do TCE-SC a secretaria precisa ser derivada por
// dicionário. E a competência é a do mês corrente, não uma remessa de meses atrás.
//
// A CADEIA (três chamadas, todas com token anônimo — ver _betha.mjs):
//   1. /auth/portais            → os 1.271 portais com `hash`  (já em betha_portal)
//   2. /api/menu                → as consultas DAQUELE portal; o id da consulta MUDA de município para município,
//                                 então nunca fixar 8768 (que é o de Jaraguá) — achar pelo nome
//   3. POST /api/busca-textual/{id}?offset=&limit=  body {competencia:[...]} → os servidores
// O portal é escolhido pelo header `app-context` = base64 de {"portal":"<hash>"} — é isso que troca de município.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";
import { API, pegaToken } from "./_betha.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;          // limita a uma UF
const SO = process.env.SO || null;          // limita a um município
// SC já vem do Farol do TCE-SC com série mensal — aqui o ganho são as outras UFs. Excluída por padrão.
const EXCLUI_UF = (process.env.EXCLUI_UF ?? "SC").split(",").map((s) => s.trim()).filter(Boolean);
// quantas competências recentes CONSIDERAR. Não é quantas coletar: entre elas, `competenciaMaisCheia` escolhe a
// que tem mais servidores. Com o default antigo (1) a escolha era sempre a mais recente — e o mês corrente vem
// parcial, o que subcoletou 22 municípios do RS.
const COMPETENCIAS = Number(process.env.COMPETENCIAS || 3);
const LIMITE = 500;                          // linhas por página na busca

await q(`create table if not exists folha_servidores_betha (
  cod_ibge      text,
  municipio     text,
  uf            text,
  entidade      text,          -- prefeitura, fundo, autarquia, câmara
  competencia   text,
  nome          text,
  cargo         text,
  classificacao_cargo text,
  nivel_salarial text,
  vinculo       text,          -- efetivo, comissionado, temporário… (a "função")
  secretaria    text,          -- campo "orgao" da fonte, já declarado (não derivado)
  organograma   text,          -- o nível abaixo: gerência/diretoria/unidade
  matricula     text,
  efetivo_em_comissao text,
  bruto         numeric,
  liquido       numeric,
  _hash         text primary key,
  _coletado_em  timestamptz default now()
)`);
await q(`create index if not exists ix_betha_folha_mun on folha_servidores_betha (cod_ibge, competencia)`);
// ⭐ 21/ago/2026: campos que a fonte SEMPRE devolveu e o coletor descartava (admissão, situação, tipo de matrícula)
await q(`alter table folha_servidores_betha add column if not exists data_admissao text`);
await q(`alter table folha_servidores_betha add column if not exists situacao text`);
await q(`alter table folha_servidores_betha add column if not exists tipo_matricula text`);
await q(`create index if not exists ix_betha_folha_sec on folha_servidores_betha (uf, secretaria)`);
await q(`create table if not exists folha_betha_coleta (
  portal_id int primary key, cod_ibge text, municipio text, uf text,
  consulta_id int, competencia text, linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

const ctxDe = (hash) => Buffer.from(JSON.stringify({ portal: hash })).toString("base64");

// ⭐ NORMALIZADOR ÚNICO DE COMPETÊNCIA → sempre `AAAAMM`, o padrão de todas as tabelas de folha.
// Aceita o que as fontes Betha devolvem: "07/2026", "07-2026", "2026-07", "202607".
// Devolve null quando não reconhece — melhor competência nula, que o verificador acusa, do que um rótulo inventado.
function compNorm(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d{4})(\d{2})$/))) return +m[2] >= 1 && +m[2] <= 12 ? `${m[1]}${m[2]}` : null;
  if ((m = s.match(/^(\d{4})[-/](\d{1,2})$/))) return +m[2] >= 1 && +m[2] <= 12 ? `${m[1]}${String(m[2]).padStart(2, "0")}` : null;
  if ((m = s.match(/^(\d{1,2})[-/](\d{4})$/))) return +m[1] >= 1 && +m[1] <= 12 ? `${m[2]}${String(m[1]).padStart(2, "0")}` : null;
  return null;
}

async function chama(caminho, hash, { metodo = "GET", corpo = null, tentativas = 4 } = {}) {
  let ultimo;
  for (let t = 0; t < tentativas; t++) {
    try {
      const tk = await pegaToken(t > 0);
      const r = await fetch(API + caminho, {
        method: metodo,
        headers: {
          Authorization: "Bearer " + tk, "app-context": ctxDe(hash), accept: "application/json",
          ...(corpo ? { "content-type": "application/json;charset=UTF-8" } : {}),
        },
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: AbortSignal.timeout(180000),
      });
      if (r.status === 401 || r.status === 403) { await pegaToken(true); ultimo = "401"; continue; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) { ultimo = e.message; if (t === tentativas - 1) throw new Error(ultimo); await new Promise((s) => setTimeout(s, 2500 * (t + 1))); }
  }
}

// Acha a consulta de folha no menu do portal. O rótulo é padrão do produto, mas o id MUDA por portal.
// ⚠️ O campo do rótulo é `titulo` — não `nome` (esse é o do menu, e vem undefined na consulta). Procurar por
// `nome` devolveu "sem consulta de folha" em 100% dos portais do Acre, o que parecia limite da fonte e era bug meu.
// O título varia no singular/plural entre portais ("Servidores e Remuneração" × "Servidores e Remunerações").
// 🚨 O rótulo NÃO é padronizado como se supunha. Censo dos 140 portais que caíam em "menu sem consulta de
// remuneração" (14/ago): 54 tinham o menu VAZIO (portais secundários de fundos/câmaras), 44 realmente não publicam
// nada de pessoal, e o restante usa outro nome — "Folha de Pagamento", "Quadro de Pessoal", "Relação de Servidores",
// "Cargos e Vencimentos", "Salarios Liquidos", "Servidores &  remunerações" (com "&", que a regex do "e" não pegava).
// ⚠️ "Despesas com Pessoal" NÃO ENTRA: é despesa agregada, não folha nominal — aceitá-la gravaria empenho no lugar
// de servidor. Por isso a lista negativa, e por isso quem chama valida `nomeServidor` antes de gravar.
const NEGATIVO = /despesas?\s+com\s+pessoal|encargos|total\s+da\s+folha|gastos?\s+com\s+pessoal/i;
const PADROES = [
  /servidores?\s*(e|&)\s*remunera/i,
  /remunera/i,
  /servidores?\s+p[úu]blicos?\s+ativos/i,
  /rela[çc][ãa]o\s+de\s+servidores/i,
  /consulta\s+folha\s+de\s+pagamento/i,
  /folha\s+de\s+pagamento/i,
  /quadro\s+de\s+pessoal/i,
  /cargos?\s+e\s+vencimentos/i,
  /sal[áa]rios?\s+l[íi]quidos?/i,
  /servidores?\s+p[úu]blicos?/i,
  /^\s*servidores?\s*$/i,
  /^\s*pessoal\s*$/i,
  /recursos\s+humanos/i,
  // ⚠️ Paty do Alferes (RJ) guarda a folha COMPLETA em "Relação Geral da Folha" (44 = 10 efetivos + 21
  // comissionados + 12 agentes políticos). Sem este padrão o coletor ficava com a maior das consultas PARCIAIS.
  /rela[çc][ãa]o\s+geral\s+da\s+folha/i,
  /\bfolha\b/i,
];
// devolve TODOS os candidatos em ordem de preferência — o chamador desce a lista até um responder folha de verdade
function achaConsultas(menu) {
  const alvo = [];
  const anda = (nos) => {
    for (const n of nos || []) {
      for (const c of n.consultas || []) alvo.push({ ...c, menu: n.nome });
      anda(n.subMenus);
    }
  };
  anda(menu);
  const rotulo = (c) => String(c.titulo || c.nome || "");
  const out = [];
  for (const re of PADROES) {
    for (const c of alvo) {
      if (NEGATIVO.test(rotulo(c))) continue;
      if (re.test(rotulo(c)) && !out.some((x) => x.id === c.id)) out.push(c);
    }
  }
  return out;
}

const cond = ["cod_ibge is not null"];
const par = [];
if (UF) { par.push(UF); cond.push(`uf = $${par.length}`); }
if (SO) { par.push(SO); cond.push(`municipio ilike '%' || $${par.length} || '%'`); }
if (EXCLUI_UF.length && !UF) { par.push(EXCLUI_UF); cond.push(`uf <> all($${par.length}::text[])`); }
const alvos = (await q(`select id, hash, cod_ibge, municipio, uf from betha_portal
  where ${cond.join(" and ")} order by uf, municipio`, par)).rows;

const feitos = process.env.REFAZ === "1" ? new Set()
  : new Set((await q(`select portal_id from folha_betha_coleta where situacao='ok'`)).rows.map((r) => r.portal_id));
const fila = alvos.filter((a) => !feitos.has(a.id));
console.log(`[betha] ${alvos.length} portais alvo · ${feitos.size} já feitos · ${fila.length} na fila`);

const LOTE = 1000;
async function grava(todos) {
  // O mesmo `_hash` pode vir duas vezes na mesma página (o id da fonte repete quando o servidor aparece em mais
  // de uma linha da consulta). Com duplicata no lote, o Postgres recusa: "ON CONFLICT DO UPDATE command cannot
  // affect row a second time". Deduplicar ANTES de mandar, ficando com a última ocorrência.
  const porHash = new Map();
  for (const r of todos) porHash.set(r._hash, r);
  const regs = [...porHash.values()];
  for (let i = 0; i < regs.length; i += LOTE) {
    const p = regs.slice(i, i + LOTE);
    const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_betha
      (cod_ibge,municipio,uf,entidade,competencia,nome,cargo,classificacao_cargo,nivel_salarial,vinculo,
       secretaria,organograma,matricula,efetivo_em_comissao,bruto,liquido,_hash,data_admissao,situacao,tipo_matricula)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::numeric[],$16::numeric[],$17::text[],
        $18::text[],$19::text[],$20::text[])
      -- 🚨 O UPSERT PRECISA ATUALIZAR A SECRETARIA (17/ago/2026): o _hash nao inclui o orgao, entao a linha
      -- antiga (sem secretaria) permanecia e o de-para de órgão não chegava ao banco — 105 portais preenchidos
      -- em memória e ZERO no banco. Ver [[pnigp-betha-secretaria-esta-noutra-consulta]].
      on conflict (_hash) do update set bruto=excluded.bruto, liquido=excluded.liquido,
        secretaria=coalesce(excluded.secretaria, folha_servidores_betha.secretaria),
        organograma=coalesce(excluded.organograma, folha_servidores_betha.organograma),
        -- 🚨 sem propagar aqui, a re-passada com os campos novos NÃO chega ao banco: a linha já existe pelo
        --    _hash e o UPSERT ignora o que não está no SET ([[pnigp-upsert-nao-propaga-a-coluna-consertada]]).
        data_admissao=coalesce(excluded.data_admissao, folha_servidores_betha.data_admissao),
        situacao=coalesce(excluded.situacao, folha_servidores_betha.situacao),
        tipo_matricula=coalesce(excluded.tipo_matricula, folha_servidores_betha.tipo_matricula),
        _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("entidade"), c("competencia"), c("nome"), c("cargo"),
       c("classificacao_cargo"), c("nivel_salarial"), c("vinculo"), c("secretaria"), c("organograma"),
       c("matricula"), c("efetivo_em_comissao"), c("bruto"), c("liquido"), c("_hash"),
       c("data_admissao"), c("situacao"), c("tipo_matricula")]);
  }
}

let totalGeral = 0, ok = 0, falhas = 0, semConsulta = 0;
for (let i = 0; i < fila.length; i++) {
  const p = fila[i];
  const marca = (situacao, detalhe, consultaId = null, competencia = null, linhas = 0) =>
    q(`insert into folha_betha_coleta (portal_id,cod_ibge,municipio,uf,consulta_id,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
       on conflict (portal_id) do update set consulta_id=excluded.consulta_id, competencia=excluded.competencia,
         linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [p.id, p.cod_ibge, p.municipio, p.uf, consultaId, competencia, linhas, situacao, detalhe]);

  try {
    const menu = await chama("/api/menu", p.hash);
    const candidatas = achaConsultas(menu);
    if (!candidatas.length) { semConsulta++; await marca("sem_consulta", "menu sem consulta de folha nominal"); continue; }
    // Competências disponíveis, da mais recente para trás.
    // ⚠️ O filtro volta como {buckets:[{id:"07/2026"}]} — não é array nem `content`. E a competência é
    // OBRIGATÓRIA: POST com corpo vazio devolve HTTP 500 "Ocorreu um erro interno", que parece indisponibilidade
    // da fonte e é só filtro faltando. Sem competência não se pede nada.
    const competenciasDe = async (consultaId) =>
      ((await chama(`/api/busca-textual/${consultaId}/filtro/competencia/MAX`, p.hash))?.buckets || [])
        .map((b) => b.id || b.description).filter(Boolean)
        .sort((a, b) => {
          const [ma, aa] = String(a).split("/"), [mb, ab] = String(b).split("/");
          return (ab - aa) || (mb - ma);
        }).slice(0, COMPETENCIAS);

    // 🚨 A COMPETÊNCIA MAIS RECENTE ESTÁ PARCIAL — o mês corrente ainda está sendo fechado. Campo Bom trouxe
    // 1.126 servidores em 07/2026 e 17 em 08/2026; Torres, Bom Jesus e outros 20 municípios do RS ficaram com
    // dezenas de linhas por causa disso, e o conferidor contra a RAIS marcava tudo como "subcoletado".
    // Uma sondagem de `totalHits` por competência (limit=1) custa 1 requisição e diz qual é a CHEIA.
    const competenciaMaisCheia = async (consultaId, comps) => {
      if (comps.length <= 1) return comps;
      let melhor = null;
      for (const c of comps) {
        const j = await chama(`/api/busca-textual/${consultaId}?sortBy=null&sortDirection=null&offset=0&limit=1&hiperlink=false`,
          p.hash, { metodo: "POST", corpo: { competencia: [c] } }).catch(() => null);
        const n = j?.totalHits ?? 0;
        if (!melhor || n > melhor.n) melhor = { c, n };
      }
      return melhor && melhor.n ? [melhor.c] : comps;
    };

    // 🚨 NEM TODA CONSULTA DE FOLHA TEM FILTRO DE COMPETÊNCIA. A consulta "Servidores Públicos" (a que traz a
    // PREFEITURA inteira, com secretaria) é um CADASTRO, não uma folha mensal: filtra por `situacao`, não por
    // competência. Pedir sem filtro nenhum devolve o histórico acumulado — em Raposos (MG) foram 6.590 linhas para
    // 2.590 pessoas, incluindo "Demitido" e "Inativo", num município de 15 mil habitantes. Por isso, sem
    // competência, filtra-se pelas situações ATIVAS que o próprio portal declara.
    const INATIVO = /demitid|inativ|aposentad|exoner|rescis|pension|falecid|afastad/i;
    const situacoesAtivas = async (consultaId) => {
      const b = ((await chama(`/api/busca-textual/${consultaId}/filtro/situacao/MAX`, p.hash))?.buckets || [])
        .map((x) => x.id || x.description).filter(Boolean);
      return b.filter((s) => !INATIVO.test(s));
    };
    const colhe = async (consultaId, comps, situacoes) => {
      const corpo = comps.length ? { competencia: comps } : (situacoes?.length ? { situacao: situacoes } : {});
      let offset = 0, total = null;
      const out = [];
      do {
        // ⚠️ `sortBy=null&sortDirection=null` são OBRIGATÓRIOS na query string — literalmente a palavra "null".
        // Sem eles o backend devolve HTTP 500 "Ocorreu um erro interno", que parece portal fora do ar e é só a
        // requisição incompleta. Jaraguá funcionou na primeira tentativa porque copiei a chamada inteira do app;
        // ao "limpar" a query string, 100% dos outros portais passaram a falhar.
        const j = await chama(`/api/busca-textual/${consultaId}?sortBy=null&sortDirection=null&offset=${offset}&limit=${LIMITE}&hiperlink=false`,
          p.hash, { metodo: "POST", corpo });
        total = j.totalHits ?? 0;
        // ⭐ DUMP_CAMPOS=1: imprime TODOS os campos que o portal devolve neste hit. Serve para descobrir o que a
        //    fonte publica e o coletor descarta — foi assim que se viu quem publica CPF mascarado (a chave de
        //    homônimo) e quem não publica.
        if (process.env.DUMP_CAMPOS === "1" && (j.hits || []).length) {
          console.log(`\n[betha/campos] ${p.municipio}/${p.uf} — ${p.nome}`);
          console.log(JSON.stringify(j.hits[0].sourceAsMap || {}, null, 1).slice(0, 1800));
          process.exit(0);
        }
        for (const h of j.hits || []) {
          const s = h.sourceAsMap || {};
          out.push({
            cod_ibge: p.cod_ibge, municipio: p.municipio, uf: p.uf, entidade: s.nomeEntidade ?? p.nome,
            // ⚠️ O conjunto de campos MUDA de portal para portal: uns devolvem `competencia`, `matriculaServidor`
            // e `nomeEntidade`, outros não. A competência a gente SEMPRE sabe — é a que foi pedida no filtro —
            // então nunca deixar nula por causa do payload (só 7% dos portais devolvem o campo).
            // 🚨 DOIS FORMATOS PARA A MESMA COMPETÊNCIA. O payload do portal traz `s.competencia` como "07-2026"
            // (MM-AAAA) e o fallback produzia "2026-07" (AAAA-MM) — os ~7% de portais que devolvem o campo
            // gravavam de um jeito e os outros 93% de outro. Resultado: 07/2026 virava DUAS competências, e
            // municípios coletados pelos dois caminhos apareciam com a folha somada — Senador Guiomard tinha
            // 1.028 linhas em "07-2026" e 863 em "2026-07", o mesmo mês contado duas vezes
            // ([[pnigp-filtro-que-nao-aplica-confira-pelo-dado]]). Agora tudo passa por `compNorm`.
            competencia: compNorm(s.competencia) ?? (comps.length ? compNorm(comps[0]) : null),
            nome: s.nomeServidor, cargo: s.cargoAtual,
            classificacao_cargo: s.classificacaoCargoAtual, nivel_salarial: s.nivelSalarialAtual,
            vinculo: s.vinculoEmpregaticio, secretaria: s.orgao, organograma: s.organograma,
            matricula: s.matriculaServidor, efetivo_em_comissao: s.efetivoEmCargoComissionado,
            // ⭐ 21/ago/2026: a API SEMPRE devolveu `dataAdmissao`, `situacao` e `tipoMatricula` e o coletor
            //    descartava os três. "Trazer tudo o que a fonte informa" é o pedido do Heitor — e admissão +
            //    situação são o que permite distinguir dois vínculos da mesma pessoa.
            data_admissao: s.dataAdmissao ?? null, situacao: s.situacao ?? null,
            tipo_matricula: s.tipoMatricula ?? null,
            bruto: s.valorRemuneracaoBruta ?? null, liquido: s.valorRemuneracaoLiquida ?? null,
            _hash: crypto.createHash("md5").update(String(h.id ?? [p.cod_ibge, s.competencia, s.nomeServidor, s.matriculaServidor, s.cargoAtual].join("¦"))).digest("hex"),
          });
        }
        offset += LIMITE;
        if (!j.hits?.length) break;
      } while (offset < total);
      return out;
    };

    // 🚨 NÃO basta parar na primeira candidata que responde: em Paty do Alferes (RJ) o menu tem "Relação de
    // servidores", "Relação de servidores comissionados" e "Relação de agentes políticos" — a primeira que casou
    // trouxe 38 pessoas (só os comissionados), o que passaria por folha do município inteiro. Quando o rótulo não é
    // o canônico ("Servidores e Remunerações"), colhe TODAS as candidatas e fica com a MAIOR.
    const CANONICA = /servidores?\s*(e|&)\s*remunera|remunera/i;
    let consulta = null, comps = null, regs = null, motivo = "";
    for (const cand of candidatas.slice(0, 6)) {
      // vazio é normal: a consulta pode ser cadastro, não folha mensal
      const cs = await competenciaMaisCheia(cand.id, await competenciasDe(cand.id));
      const sits = cs.length ? null : await situacoesAtivas(cand.id);
      const r = await colhe(cand.id, cs, sits);
      if (!r.length) { motivo = `consulta "${cand.titulo}" sem linhas`; continue; }
      // 🚨 GUARDA: "Quadro de Pessoal"/"Folha de Pagamento" de alguns portais respondem SEM `nomeServidor` —
      // é agregado, não nominal. A cadeia de 13/ago gravou 4.997 linhas de "servidor" sem nome em 36 municípios
      // por não checar isso. Exigir MAIORIA com nome (um único nome solto não redime uma consulta agregada).
      const comNome = r.filter((x) => x.nome).length;
      if (comNome < r.length / 2) { motivo = `consulta "${cand.titulo}": ${comNome}/${r.length} com nome`; continue; }
      // 🚨 NOME SEM REMUNERAÇÃO NÃO É FOLHA — é o CADASTRO de pessoal. A consulta "Servidores Públicos" traz a
      // lista nominal com cargo e lotação e ZERO valor, e passava nesta escolha só por ter nome: Barreirinha
      // entrou com 619 linhas, Pauini com 401, Manacapuru com 51 e Urucurituba com 1, todas sem um centavo, e
      // o município aparecia "coletado" no placar. Consulta com valor SEMPRE vence consulta sem valor.
      const comValor = r.filter((x) => +x.bruto > 0 || +x.liquido > 0).length;
      const cand_ = { ...cand, _n: r.length, _pagos: comValor };
      if (!comValor) {
        motivo = `consulta "${cand.titulo}": ${r.length} nomes e NENHUM valor — é cadastro de pessoal, não folha`;
        if (!regs) { consulta = cand_; comps = cs; regs = r; }   // guarda como último recurso, marcado abaixo
        continue;
      }
      const melhorTemValor = regs && (consulta?._pagos || 0) > 0;
      if (!regs || !melhorTemValor || comValor > (consulta?._pagos || 0)) { consulta = cand_; comps = cs; regs = r; }
      if (CANONICA.test(String(cand.titulo || ""))) break; // rótulo canônico do produto: é a folha inteira
    }
    // 🚨 rótulo distinto do "menu sem consulta": AQUI o menu TINHA consulta de pessoal e ela foi testada — o que
    // falta é o dado. Usar o mesmo `sem_consulta` para os dois casos faz parecer que o portal não tem a tela,
    // quando na verdade tem e responde vazia; são pedidos de LAI diferentes ([[pnigp-lai-pendencia-tabela]]).
    if (!regs) { semConsulta++; await marca("consulta_sem_dado", motivo.slice(0, 190) || "nenhuma candidata trouxe folha nominal"); continue; }

    // 🚨 lista sem remuneração NÃO entra como coleta boa: fica registrada com o veredito, para virar pedido por
    // LAI em vez de inflar o placar ([[pnigp-sonda-folha-prova-e-a-coleta]]).
    if (!consulta._pagos) {
      semConsulta++;
      await marca("lista_sem_valor", motivo.slice(0, 190), consulta.id, comps[0] || null, regs.length);
      console.log(`  · [${i + 1}/${fila.length}] ${p.uf} ${p.municipio}: ${regs.length} nomes SEM valor — não gravado`);
      continue;
    }
    // ⭐ DE-PARA DE ÓRGÃO (17/ago/2026): a consulta da FOLHA traz valor e NÃO traz `orgao` em boa parte dos
    // portais — 43 municípios do PR e 231 mil linhas no país ficavam sem secretaria, o que os mantinha como
    // "parcial" no critério cargo+salário+secretaria. A secretaria EXISTE, na consulta de CADASTRO
    // ("Servidores Públicos"/"Quadro de Pessoal"), que tem `orgao` e `lotacao` e ZERO valor.
    // 🚨 O cadastro é usado SÓ como DE-PARA por nome (+matrícula quando houver) — nunca como fonte de linhas:
    // ele traz demitidos e inativos ([[pnigp-betha-secretaria-esta-noutra-consulta]]).
    // ⚠️ E o `organograma` NÃO substitui o órgão: em 72% das linhas ele é ação orçamentária, não unidade.
    const semSec = regs.filter((r) => !r.secretaria).length;
    if (semSec > regs.length / 2) {
      const cadastro = candidatas.find((c) => /servidores?\s+p[úu]blicos?|quadro\s+de\s+pessoal/i.test(String(c.titulo || "")) && c.id !== consulta.id);
      if (cadastro) {
        const linhasCad = await colhe(cadastro.id, [], await situacoesAtivas(cadastro.id)).catch(() => []);
        const chave = (nome, mat) => `${String(nome || "").trim().toUpperCase()}¦${String(mat || "").trim()}`;
        const mapa = new Map();
        for (const c of linhasCad) {
          if (!c.nome || !(c.secretaria || c.organograma)) continue;
          mapa.set(chave(c.nome, c.matricula), { sec: c.secretaria, org: c.organograma });
          mapa.set(chave(c.nome, ""), { sec: c.secretaria, org: c.organograma });   // portais sem matrícula na folha
        }
        let preenchidos = 0;
        for (const r of regs) {
          if (r.secretaria) continue;
          const hit = mapa.get(chave(r.nome, r.matricula)) || mapa.get(chave(r.nome, ""));
          if (hit?.sec) { r.secretaria = hit.sec; if (!r.organograma) r.organograma = hit.org; preenchidos++; }
        }
        if (preenchidos) console.log(`     ⭐ órgão preenchido em ${preenchidos}/${semSec} pelo cadastro "${cadastro.titulo}"`);
      }
    }
    await grava(regs);
    totalGeral += regs.length; ok++;
    await marca("ok", null, consulta.id, comps[0] || null, regs.length);
    console.log(`  [${i + 1}/${fila.length}] ${p.uf} ${p.municipio}: ${regs.length} servidores (${comps[0] || "sem filtro"})`);
  } catch (e) {
    falhas++;
    await marca("erro", String(e.message).slice(0, 200));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${p.uf} ${p.municipio}: ${String(e.message).slice(0, 90)}`);
  }
}

console.log(`\n[betha] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} portais ok · ${semConsulta} sem consulta de folha · ${falhas} com erro`);
await db.end();
