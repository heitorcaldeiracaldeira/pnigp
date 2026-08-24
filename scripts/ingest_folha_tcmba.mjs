// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_tcmba.mjs — folha NOMINAL COM SALÁRIO dos 417 municípios da Bahia, direto do TCM-BA.
//
// POR QUÊ esta fonte e não os ERPs municipais: a Bahia é o estado mais fragmentado do país em portal de folha
// (o maior fornecedor, Fator Sistemas, tem 75 dos 417). O TCM-BA é o ÚNICO lugar onde os 417 existem juntos,
// com nome, cargo, regime e valor — e a granularidade é a ENTIDADE (Prefeitura, Câmara, fundos, autarquias).
//
// A ROTA (descoberta em 15/ago/2026):
//   `webservice.tcm.ba.gov.br/exportar/pessoal` devolve um XLS pronto. Exige só o cabeçalho `Origin` do próprio
//   site — sem login e sem token de captcha.
//   🚨 OS DOIS PARÂMETROS QUE FAZEM A CHAMADA FUNCIONAR são `actual_item` e `final_item`. Sem eles o Laravel
//   monta `EXEC …upObterDadosServidores_paginacao 2025,1,6,NULL,NULL,NULL,NULL,,` e o SQL Server responde
//   "Incorrect syntax near ','" — um HTTP 500 que PARECE endpoint quebrado e é só chamada incompleta. Eles são
//   a paginação (blocos de 4.000) e não aparecem no link estático da página: só no JS que a tela de RESULTADO
//   escreve depois da busca. Ver [[pnigp-coletor-ok-sem-dado-sete-causas]].
//
// O QUE VEM: Nome · Matrícula · Tipo Regime · Cargo · Salário Líquido · Salário Base · Vantagens · Gratificação ·
//   13º · Carga Horária · Situação · Ingresso. ⚠️ NÃO vem SECRETARIA — a lotação aqui é a ENTIDADE.
//
// Uso:  node scripts/ingest_folha_tcmba.mjs                    (417 prefeituras, competência com recuo)
//       TIPO=TODAS node scripts/ingest_folha_tcmba.mjs         (as 1.025 entidades)
//       ANO=2025 MES=6 node scripts/ingest_folha_tcmba.mjs     (competência fixa)
// Retomável: o livro-razão `folha_tcmba_coleta` guarda cada (entidade, competência) já resolvida.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import XLSX from "xlsx";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const TIPO = (process.env.TIPO || "PREFEITURA").toUpperCase();
const ANO = process.env.ANO || null;
const MES = process.env.MES || null;
const JANELA = +(process.env.JANELA || 6);   // meses de recuo quando a competência alvo vier vazia
const SONDAR = +(process.env.SONDAR || 3);   // quantas competências PUBLICADAS comparar antes de escolher
const PAUSA = +(process.env.PAUSA || 400);   // ms entre chamadas — o tribunal não declara limite; ir devagar
const LIMITE = process.env.LIMITE ? +process.env.LIMITE : null;
const BLOCO = 4000;                          // o mesmo tamanho de página que a tela do tribunal usa

const H = {
  origin: "https://www.tcm.ba.gov.br",
  referer: "https://www.tcm.ba.gov.br/controle-social/pessoal/",
  "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)",
};
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

// competências a tentar, da mais recente para trás (o mês corrente quase nunca está publicado)
const COMPETENCIAS = (ANO && MES) ? [[+ANO, +MES]] : Array.from({ length: JANELA }, (_, k) => {
  const d = new Date(Date.UTC(2026, 7, 1));           // âncora fixa: agosto/2026 (Date.now não entra em script)
  d.setUTCMonth(d.getUTCMonth() - (k + 1));
  return [d.getUTCFullYear(), d.getUTCMonth() + 1];
});

await q(`create table if not exists folha_servidores_tcmba (
  cod_ibge text, municipio text, uf text default 'BA', cd_entidade text, entidade text, competencia text,
  nome text, matricula text, regime text, cargo text,
  liquido numeric, salario_base numeric, vantagens numeric, gratificacao numeric, decimo_terceiro numeric,
  carga_horaria text, situacao text, admissao text,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_tcmba_ibge on folha_servidores_tcmba (cod_ibge)`);
await q(`create table if not exists folha_tcmba_coleta (
  cod_ibge text, cd_entidade text, competencia text, linhas int, situacao text, detalhe text,
  em timestamptz default now(), primary key (cd_entidade, competencia))`);

// ── a fila: entidades ainda sem resposta DEFINITIVA ────────────────────────────────────────────────────────────
// 'ok' e 'sem_publicacao' aposentam; erro de rede NÃO aposenta (volta na próxima passada).
// Escopo por tipo de entidade. O TCM lista 1.025, e nem todas interessam:
//   PREFEITURA (417) · EXECUTIVO = prefeitura + autarquia + empresa + previdência + institutos/agências (523)
//   TODAS (1.025, inclui as 417 câmaras e 60 consórcios)
// ⚠️ CÂMARA e CONSÓRCIO ficam DE FORA do EXECUTIVO por decisão do Heitor (16/ago): o alvo é a folha do
// Poder Executivo municipal e da administração indireta — consórcio é intermunicipal, não é do ente.
const RE_PREV = "previd|iprev|ipreg|fapem|funprev|aposent";
const RE_AUT = "autarq|servi.o aut|saae|daae|demae|servi.o (municipal|de) |superit|superint|coordenadoria|guarda civil|limpeza p";
const RE_EMP = "empresa|companhia|cia\\.|s/a|s\\.a\\.|urbanizadora|participa";
// 'ag[eê]nc' e não 'ag[eê]ncia': o TCM abrevia ("Agênc Reguladora ... - ARSAL" de Salvador ficava de fora).
const RE_INST = "instituto|ag[eê]nc|universidade|fund[aá][cç]";
const filtroTipo =
  TIPO === "TODAS" ? "" :
  // ⭐ 21/ago/2026: as 417 CÂMARAS da Bahia estavam na tabela de entidades e nunca tinham sido colhidas — o
  //    coletor só sabia pedir "Prefeitura%". A folha do legislativo é um dado próprio, não contaminação
  //    ([[pnigp-radar-mapeou-a-camara-causa-nacional]]).
  TIPO === "CAMARA" ? "and e.ds_entidade ~* 'c[âa]mara'" :
  TIPO === "EXECUTIVO" ? `and (e.ds_entidade ilike 'Prefeitura%'
      or (e.ds_entidade !~* 'c[âa]mara' and e.ds_entidade !~* 'cons[oó]rcio'
          and e.ds_entidade ~* '${RE_PREV}|${RE_AUT}|${RE_EMP}|${RE_INST}'))` :
  "and e.ds_entidade ilike 'Prefeitura%'";
const fila = (await q(`select e.cod_ibge, e.cd_entidade, e.ds_entidade, e.municipio
  from tcmba_entidade e
  where not exists (select 1 from folha_tcmba_coleta c
                     where c.cd_entidade = e.cd_entidade and c.situacao in ('ok','sem_publicacao'))
    ${filtroTipo}
  order by e.municipio ${LIMITE ? `limit ${LIMITE}` : ""}`)).rows;

console.log(`[tcmba] ${fila.length} entidades na fila (TIPO=${TIPO}) · competências: ${COMPETENCIAS.map(([a, m]) => `${a}${String(m).padStart(2, "0")}`).join(", ")}`);

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/R\$\s*/g, "").replace(/\./g, "").replace(",", ".").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// baixa UM bloco de 4.000 e devolve as linhas já em objeto
async function bloco(cdEnt, ano, mes, inicio) {
  const u = new URL("https://webservice.tcm.ba.gov.br/exportar/pessoal");
  u.searchParams.set("tipo", "xls");
  u.searchParams.set("entidades", cdEnt);
  u.searchParams.set("ano", String(ano));
  u.searchParams.set("mes", String(mes));
  u.searchParams.set("cpf", "");
  u.searchParams.set("tipoRegime", "");
  u.searchParams.set("receitaLiquidaMensal", "0,00");
  u.searchParams.set("receitaLiquidaAte", "0,00");
  u.searchParams.set("qtdeLinhas", "");
  u.searchParams.set("receitaLiquidaPeriodo", "");
  u.searchParams.set("actual_item", String(inicio));
  u.searchParams.set("final_item", String(inicio + BLOCO - 1));

  const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(120000) });
  // 🚨 competência AINDA NÃO PUBLICADA volta como HTTP 500 ("Undefined offset: 0"), não como planilha vazia.
  // Tratar como erro faria o recuo abortar na primeira tentativa e o município sair como "erro de rede" —
  // exatamente o falso negativo de [[pnigp-coletor-ok-sem-dado-sete-causas]]. `null` = tente a competência anterior.
  if (r.status === 500) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ct = r.headers.get("content-type") || "";
  if (!/excel|spreadsheet|octet/i.test(ct)) throw new Error(`resposta não é planilha (${ct.slice(0, 40)})`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 3000) return [];                        // planilha só com cabeçalho
  const ws = XLSX.read(buf, { type: "buffer" }).Sheets["PASTA"];
  const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  // a linha 2 é o cabeçalho ("Nome","Matrícula",…); os dados começam na 3
  const i = linhas.findIndex((l) => String(l[0]).trim() === "Nome");
  if (i < 0) return [];
  return linhas.slice(i + 1).filter((l) => String(l[0]).trim() !== "").map((l) => ({
    nome: String(l[0]).trim(), matricula: String(l[1]).trim(), regime: String(l[2]).trim(),
    cargo: String(l[3]).trim(), liquido: num(l[4]), salario_base: num(l[5]), vantagens: num(l[6]),
    gratificacao: num(l[7]), decimo_terceiro: num(l[8]), carga_horaria: String(l[9]).trim(),
    situacao: String(l[10]).trim(), admissao: String(l[11]).trim(),
  }));
}

async function grava(p, comp, regs) {
  // 🚨 UMA COMPETÊNCIA POR ENTIDADE. Quando o recuo profundo troca 2026 (parcial) por 202512 (cheia), a antiga
  //    NÃO pode ficar: a mesma entidade com duas competências dobra a folha de quem soma salário (o `distinct
  //    nome` da cobertura não vê o problema, a soma em reais vê). O coletor sempre guardou uma competência por
  //    entidade — isto apenas mantém a regra quando a escolha muda ([[pnigp-competencia-mais-cheia-nao-a-recente]]).
  const velhas = await q(`delete from folha_servidores_tcmba
    where cd_entidade = $1 and competencia is distinct from $2`, [p.cd_entidade, comp]);
  if (velhas.rowCount) console.log(`     ↻ ${p.municipio}: ${velhas.rowCount} linhas da competência anterior substituídas`);
  const LOTE = 500;
  for (let i = 0; i < regs.length; i += LOTE) {
    const parte = regs.slice(i, i + LOTE);
    const vals = [], ph = [];
    parte.forEach((r, k) => {
      const b = k * 18;
      ph.push(`(${Array.from({ length: 18 }, (_, j) => `$${b + j + 1}`).join(",")})`);
      vals.push(p.cod_ibge, p.municipio, "BA", p.cd_entidade, p.ds_entidade, comp,
        r.nome, r.matricula, r.regime, r.cargo, r.liquido, r.salario_base, r.vantagens,
        r.gratificacao, r.decimo_terceiro, r.carga_horaria, r.situacao, r.admissao);
    });
    await q(`insert into folha_servidores_tcmba
      (cod_ibge,municipio,uf,cd_entidade,entidade,competencia,nome,matricula,regime,cargo,
       liquido,salario_base,vantagens,gratificacao,decimo_terceiro,carga_horaria,situacao,admissao,_hash)
      select v.cod_ibge, v.municipio, v.uf, v.cd_entidade, v.entidade, v.competencia, v.nome, v.matricula,
             v.regime, v.cargo,
             v.liquido::numeric, v.salario_base::numeric, v.vantagens::numeric,
             v.gratificacao::numeric, v.decimo_terceiro::numeric,
             v.carga_horaria, v.situacao, v.admissao,
             -- 🚨 o hash PRECISA dos valores: um servidor pode ter DOIS vínculos na mesma entidade e competência
             -- com a mesma matrícula e o mesmo cargo, diferindo só na remuneração. Sem os valores na chave, o
             -- segundo vínculo é engolido pelo ON CONFLICT DO NOTHING e a folha do município sai subestimada.
             md5(v.cd_entidade||v.competencia||v.nome||coalesce(v.matricula,'')||coalesce(v.cargo,'')
                 ||coalesce(v.liquido,'')||coalesce(v.salario_base,'')||coalesce(v.vantagens,'')
                 ||coalesce(v.carga_horaria,'')||coalesce(v.situacao,'')||coalesce(v.admissao,''))
      from (values ${ph.join(",")}) as v(cod_ibge,municipio,uf,cd_entidade,entidade,competencia,nome,matricula,
        regime,cargo,liquido,salario_base,vantagens,gratificacao,decimo_terceiro,carga_horaria,situacao,admissao)
      on conflict (_hash) do nothing`, vals);
  }
}

let okN = 0, vazios = 0, erros = 0, servidores = 0;
for (let i = 0; i < fila.length; i++) {
  const p = fila[i];
  const marca = (situacao, comp, linhas, detalhe) => q(
    `insert into folha_tcmba_coleta (cod_ibge,cd_entidade,competencia,linhas,situacao,detalhe,em)
     values ($1,$2,$3,$4,$5,$6,now()) on conflict (cd_entidade,competencia) do update
     set linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
    [p.cod_ibge, p.cd_entidade, comp, linhas, situacao, detalhe]);

  // baixa TODAS as páginas de uma competência (null = competência não publicada)
  const competenciaInteira = async (ano, mes) => {
    let regs = [], inicio = 1, pagina;
    do {
      pagina = await bloco(p.cd_entidade, ano, mes, inicio);
      if (pagina === null) return null;
      regs = regs.concat(pagina);
      inicio += BLOCO;
      if (pagina.length === BLOCO) await dorme(PAUSA);
    } while (pagina.length === BLOCO && inicio < 60000);
    return regs;
  };

  try {
    // pessoas distintas da competência — matrícula+nome, porque o mesmo nome pode ter dois vínculos
    const pessoasDe = (regs) => new Set(regs.map((r) => `${r.matricula ?? ""}|${r.nome ?? ""}`)).size;
    // ⭐⭐ LEI DA COMPETÊNCIA MAIS CHEIA ([[pnigp-competencia-mais-cheia-nao-a-recente]]):
    // NÃO ficar com a primeira competência que devolve linhas — o mês em fechamento vem parcial e o coletor
    // termina "ok" com uma fração da folha. Sondar as SONDAR mais recentes publicadas e ficar com a MAIOR.
    // Aqui custa uma planilha inteira por competência (o TCM não expõe contagem barata), e é o preço certo:
    // a alternativa é gravar um município inteiro subcoletado e não ter como perceber.
    let melhor = null, publicadas = 0;
    for (const [ano, mes] of COMPETENCIAS) {
      const regs = await competenciaInteira(ano, mes);
      await dorme(PAUSA);
      if (regs === null) continue;                       // não publicada
      publicadas++;
      // 🚨 COMPARAR PESSOAS, NÃO LINHAS: dezembro traz o 13º na mesma consulta e vence sempre na contagem de
      //    linhas — Antônio Cardoso saiu com 1.353 linhas para uma RAIS de 408. A folha do mês é quanta GENTE
      //    foi paga ([[pnigp-competencia-mais-cheia-nao-a-recente]]).
      if (regs.length && (!melhor || pessoasDe(regs) > melhor.pessoas))
        melhor = { comp: `${ano}${String(mes).padStart(2, "0")}`, regs, pessoas: pessoasDe(regs) };
      if (publicadas >= SONDAR) break;
    }

    // ⭐⭐ RECUO PROFUNDO QUANDO A FOLHA SAI PEQUENA DEMAIS (19/ago/2026) — o buraco que a lei acima não tapava.
    // As 3 competências recentes podem estar TODAS parciais: o município passou a remeter um resumo ao TCM e a
    // folha inteira ficou meses atrás. Medido na rede: **Cachoeira** devolve 9 servidores em 2026 e **1.908 em
    // 202512 / 2.399 em 202506**; Casa Nova, 14 contra **4.001**; Camamu, 863 contra 2.138. Como o coletor parava
    // nas 3 primeiras publicadas, 71 municípios da BA ficaram abaixo de 30% da RAIS e a manchete dizia "BA 100%"
    // ([[pnigp-ba-completa-por-municipio-nao-por-pessoa]], [[pnigp-recuo-curto-perde-quem-parou]]).
    //
    // O gatilho é o DENOMINADOR, não o palpite: se o melhor achado não chega a `PISO_RAIS` da RAIS daquele
    // município, continua recuando até `FUNDO` competências. Quem já veio cheio não paga nada por isso.
    const PISO_RAIS = Number(process.env.PISO_RAIS || 0.5);
    const FUNDO = Number(process.env.FUNDO || 18);
    const rais = Number((await q(`select count(*) n from folha_rais_municipal r
      join municipios_br mb on mb.cod_ibge6 = r.cod_ibge6
      where mb.cod_ibge = $1 and r.ativo_3112
        and r.ano = (select max(ano) from folha_rais_municipal)`, [p.cod_ibge])).rows[0].n);
    if (rais > 0 && (!melhor || melhor.pessoas < rais * PISO_RAIS)) {
      const vistas = new Set(COMPETENCIAS.map(([a, m]) => `${a}${m}`));
      for (let k = 1; k <= FUNDO; k++) {
        const d = new Date(Date.UTC(2026, 7, 1));        // mesma âncora fixa do topo do arquivo
        d.setUTCMonth(d.getUTCMonth() - k);
        const ano = d.getUTCFullYear(), mes = d.getUTCMonth() + 1;
        if (vistas.has(`${ano}${mes}`)) continue;
        const regs = await competenciaInteira(ano, mes);
        await dorme(PAUSA);
        if (regs === null || !regs.length) continue;
        if (!melhor || pessoasDe(regs) > melhor.pessoas)
          melhor = { comp: `${ano}${String(mes).padStart(2, "0")}`, regs, pessoas: pessoasDe(regs), fundo: true };
        if (melhor.pessoas >= rais * 0.9) break;         // já alcançou a RAIS: não precisa varrer o resto
      }
      if (melhor && melhor.fundo)
        console.log(`     ↩ recuo profundo em ${p.municipio}: ${melhor.pessoas} pessoas / ${melhor.regs.length} linhas em ${melhor.comp} (RAIS ${rais})`);
    }

    const achou = !!melhor;
    if (melhor) {
      await grava(p, melhor.comp, melhor.regs);
      await marca("ok", melhor.comp, melhor.regs.length, `melhor de ${publicadas} competências sondadas`);
      servidores += melhor.regs.length; okN++;
      console.log(`  [${i + 1}/${fila.length}] ${p.municipio} · ${p.ds_entidade.slice(0, 34)} · ${melhor.comp} · ${melhor.regs.length} servidores`);
    }
    if (!achou) {
      await marca("sem_publicacao", COMPETENCIAS[0].join(""), 0, `sem linhas em ${COMPETENCIAS.length} competências`);
      vazios++;
      console.log(`  ○ [${i + 1}/${fila.length}] ${p.municipio} · ${p.ds_entidade.slice(0, 34)} · nada publicado`);
    }
  } catch (e) {
    erros++;
    await marca("erro", COMPETENCIAS[0].join(""), 0, String(e.message).slice(0, 200));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${p.municipio}: ${String(e.message).slice(0, 90)}`);
  }
  await dorme(PAUSA);
}

console.log(`\n[tcmba] ${okN} entidades com folha · ${vazios} sem publicação · ${erros} erros · ${servidores} servidores`);
console.table((await q(`select count(distinct cod_ibge)::int municipios, count(distinct cd_entidade)::int entidades,
  count(*)::int linhas, count(*) filter (where liquido > 0)::int com_valor
  from folha_servidores_tcmba`)).rows);
await db.end();
