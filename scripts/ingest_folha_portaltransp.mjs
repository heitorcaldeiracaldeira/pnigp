// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_portaltransp.mjs — portal "Portal Transparência" (portaltransp.com.br), um município por CÓDIGO.
//
// ⭐ Achado em 18/ago/2026 atacando os 94 municípios de MG que o diagnóstico marcava `tela_sem_linhas`.
// Diamantina e Juatuba apontavam para `portaltransp.com.br/remuneracao/?data=pdmt` — e a tela funciona: o
// diagnóstico parou na PÁGINA-ÍNDICE, que de fato não tem linhas, sem seguir para `/remuneracao/servidores/`
// ([[pnigp-tela-certa-nao-e-so-ter-tabela]]).
//
// O CONTRATO — duas partes, porque a lista NÃO tem dinheiro:
//   1. LISTA (CSV, o município inteiro numa requisição):
//      /exportador/ExportadorRemuneracao_csv.php/?data={cod}&exercicio={ano}&tabela=1
//        &matricula=&servidor=&cargo=&cpf=&lotacao=&referencia={MM/AAAA}&ordenado=1
//      → Referência · Matrícula · Servidor · Cargo · CPF · Lotação · Admissão · Exoneração
//   2. FICHA (1 requisição por pessoa) — é ONDE ESTÁ O VALOR:
//      /remuneracao/servidores-detalhes/?exercicio={ano}&matricula={mat}&data={cod}&servidor={nome}
//      → Cargo · Lotação · Proventos · Descontos · Líquido · Referência ("Julho/2026"), com a série mensal inteira
//
// 🚨 `tabela=2` (que pareceria a de valores) NÃO responde — existem só `tabela=1` (nominal, sem dinheiro) e
// `tabela=3` (agregado por cargo). O valor nominal só existe na ficha.
// 🚨 O CSV vem em latin-1 e com os campos preenchidos de espaços à direita.
//
// Uso: node scripts/ingest_folha_portaltransp.mjs        · SO=<município> · SEM_VALOR=1 (pula as fichas)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import "./_rede.mjs";
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const SEM_VALOR = process.env.SEM_VALOR === "1";
const MESES_TESTE = Number(process.env.MESES_TESTE || 3);
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };
const B = "https://portaltransp.com.br";

// 🚨 O PRIMEIRO CARACTERE DO CÓDIGO É O PODER: `p` = PREFEITURA, `c` = CÂMARA.
// A URL que o diagnóstico trouxe para Juatuba era `data=cjtb` — a CÂMARA — e a coleta veio com 66 pessoas cujos
// cargos eram VEREADOR e ASSESSOR PARLAMENTAR, num município de 1.504 vínculos. A prefeitura é `pjtb`, com 1.673.
// Câmara é outro poder e não entra ([[pnigp-entidade-espelho-infla-folha]]).
// Os códigos não se deduzem do nome (Diamantina = pdmt) — vêm da URL descoberta.
const ALVOS = [
  { municipio: "Diamantina", uf: "MG", cod: "pdmt" },
  { municipio: "Juatuba", uf: "MG", cod: "pjtb" },
];

await q(`create table if not exists folha_servidores_portaltransp (
  cod_ibge text, municipio text, uf text, competencia text,
  matricula text, nome text, cargo text, cpf_masc text, lotacao text, admissao text, exoneracao text,
  proventos numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_ptransp_mun on folha_servidores_portaltransp (cod_ibge, competencia)`);
await q(`create table if not exists folha_portaltransp_coleta (
  cod_ibge text primary key, municipio text, uf text, codigo text, competencia text,
  servidores int, com_valor int, situacao text, detalhe text, em timestamptz default now()
)`);

const money = (s) => {
  const t = String(s ?? "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
};
const limpa = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const MES_N = { janeiro: 1, fevereiro: 2, "março": 3, abril: 4, maio: 5, junho: 6, julho: 7,
                agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };

async function baixa(url) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(180000) });
      if (!r.ok) { await new Promise((s) => setTimeout(s, 2500 * (t + 1))); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      // 🚨 latin-1: sem isso "Lotação" chega como "LotaÃ§Ã£o"
      return buf.toString("latin1");
    } catch { await new Promise((s) => setTimeout(s, 2500 * (t + 1))); }
  }
  return null;
}

function parseCSV(txt) {
  return txt.split(/\r?\n/).filter((l) => l.trim())
    .map((l) => l.split(";").map((c) => limpa(c.replace(/^\s*"|"\s*$/g, ""))));
}

// a ficha traz a série mensal — devolve a linha da competência pedida
async function ficha(cod, ano, matricula, nome, reCompetencia) {
  const u = `${B}/remuneracao/servidores-detalhes/?exercicio=${ano}`
    + `&matricula=${encodeURIComponent(matricula)}&data=${cod}&servidor=${encodeURIComponent(nome)}`;
  const html = await baixa(u);
  if (!html) return null;
  const tab = (html.match(/<table[\s\S]*?<\/table>/i) || [])[0];
  if (!tab) return null;
  const linhas = [...tab.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((x) =>
    [...x[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((c) => limpa(c[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " "))));
  // 🚨 19/ago: A FICHA NÃO TEM SEMPRE 6 COLUNAS. Em Diamantina são Cargo·Lotação·Proventos·Descontos·Líquido·
  //    Referência; em **Juatuba são 4** — `Cargo / Função · Lotação · Liquido · Referência`, sem proventos nem
  //    descontos. Exigir `l.length >= 6` e ler a competência em `l[5]` devolvia NULO nas 1.671 fichas: o
  //    município publica só o LÍQUIDO, e líquido conta como publicação quando não há bruto
  //    ([[pnigp-duas-telas-de-folha-liquido-e-bruto]]).
  //    Mapear por RÓTULO do cabeçalho, nunca por posição — é a lei que atravessou o dia inteiro
  //    ([[pnigp-rotulo-da-coluna-de-dinheiro-varia]]).
  const cab = (linhas[0] || []).map((c) => c.toLowerCase());
  const ondeEsta = (re) => cab.findIndex((c) => re.test(c));
  const iProv = ondeEsta(/provento|vencimento|bruto|remunera/);
  const iDesc = ondeEsta(/desconto/);
  const iLiq  = ondeEsta(/l[íi]quido/);
  const iRef  = ondeEsta(/refer/);
  const iCargo = ondeEsta(/cargo|fun[çc][ãa]o/);
  const iLot  = ondeEsta(/lota[çc]|secretaria|unidade/);
  if (iRef < 0) return null;
  const alvo = linhas.slice(1).find((l) => reCompetencia.test(l[iRef] || ""));
  if (!alvo) return null;
  const pega = (i) => (i >= 0 && i < alvo.length ? alvo[i] : null);
  return { cargo: pega(iCargo), lotacao: pega(iLot),
    proventos: iProv >= 0 ? money(pega(iProv)) : null,
    descontos: iDesc >= 0 ? money(pega(iDesc)) : null,
    liquido:   iLiq  >= 0 ? money(pega(iLiq))  : null };
}

for (const a of ALVOS) {
  if (SO && !a.municipio.toLowerCase().includes(SO.toLowerCase())) continue;
  // 🚨 código IBGE do cadastro ([[pnigp-nunca-digitar-codigo-ibge]])
  const mun = (await q(`select cod_ibge, nome, uf from municipios_br where uf=$1 and lower(nome)=lower($2) limit 1`,
    [a.uf, a.municipio])).rows[0];
  if (!mun) { console.log(`✖ ${a.municipio}/${a.uf} não está em municipios_br`); continue; }
  console.log(`\n[portaltransp] ${mun.nome}/${mun.uf} (data=${a.cod})`);

  // ⭐ competência MAIS CHEIA entre as recentes ([[pnigp-competencia-mais-cheia-nao-a-recente]])
  const hoje = new Date();
  let melhor = null;
  for (let k = 0; k < MESES_TESTE; k++) {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - k, 1));
    const ano = d.getUTCFullYear(), mes = d.getUTCMonth() + 1;
    const ref = `${String(mes).padStart(2, "0")}/${ano}`;
    const csv = await baixa(`${B}/exportador/ExportadorRemuneracao_csv.php/?data=${a.cod}&exercicio=${ano}`
      + `&tabela=1&matricula=&servidor=&cargo=&cpf=&lotacao=&referencia=${encodeURIComponent(ref)}&ordenado=1`);
    if (!csv) continue;
    // ⭐ O CABEÇALHO DO CSV DECLARA A ENTIDADE: "Servidores da Prefeitura de Diamantina, Referência: 07/2026".
    // É a prova de que não se está coletando a câmara com o nome da prefeitura
    // ([[pnigp-entidade-declarada-e-a-prova]]).
    const cabecalho = (csv.split(/\r?\n/)[0] || "");
    if (/c[âa]mara/i.test(cabecalho)) {
      console.log(`   ✖ ${ref}: o CSV declara "${limpa(cabecalho).slice(0, 60)}" — é CÂMARA, não a prefeitura`);
      continue;
    }
    const linhas = parseCSV(csv).filter((l) => l.length >= 6 && /^\d/.test(l[1] || ""));
    console.log(`   ${ref}: ${linhas.length} linhas · ${limpa(cabecalho).slice(0, 55)}`);
    if (!melhor || linhas.length > melhor.linhas.length) melhor = { ano, mes, ref, linhas };
  }
  if (!melhor || !melhor.linhas.length) {
    await q(`insert into folha_portaltransp_coleta (cod_ibge,municipio,uf,codigo,servidores,com_valor,situacao,detalhe,em)
      values ($1,$2,$3,$4,0,0,'vazio','o CSV da tabela 1 não devolveu linhas em nenhuma competência testada',now())
      on conflict (cod_ibge) do update set situacao='vazio', detalhe=excluded.detalhe, em=now()`,
      [mun.cod_ibge, mun.nome, mun.uf, a.cod]);
    console.log("   ✖ sem linhas");
    continue;
  }
  const competencia = `${melhor.ano}${String(melhor.mes).padStart(2, "0")}`;
  const rotulo = Object.keys(MES_N).find((k) => MES_N[k] === melhor.mes) || "";
  const reComp = new RegExp(`${rotulo}\\s*/\\s*${melhor.ano}`, "i");
  console.log(`   ⭐ ${melhor.ref} com ${melhor.linhas.length} servidores`);

  let n = 0, comValor = 0;
  for (const l of melhor.linhas) {
    const matricula = l[1], nome = l[2], cargo = l[3], cpf = l[4], lotacao = l[5];
    const admissao = l[6] || null, exoneracao = l[7] || null;
    if (!nome) continue;
    let v = null;
    if (!SEM_VALOR) v = await ficha(a.cod, melhor.ano, matricula, nome, reComp);
    const _hash = crypto.createHash("sha1")
      .update([mun.cod_ibge, competencia, matricula, nome, cargo].join("|")).digest("hex");
    await q(`insert into folha_servidores_portaltransp
      (cod_ibge, municipio, uf, competencia, matricula, nome, cargo, cpf_masc, lotacao, admissao, exoneracao,
       proventos, descontos, liquido, _hash)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      on conflict (_hash) do update set proventos=excluded.proventos, descontos=excluded.descontos,
        liquido=excluded.liquido, _coletado_em=now()`,
      [mun.cod_ibge, mun.nome, mun.uf, competencia, matricula, nome, v?.cargo || cargo, cpf,
       v?.lotacao || lotacao, admissao, exoneracao,
       v?.proventos ?? null, v?.descontos ?? null, v?.liquido ?? null, _hash]);
    n++;
    // 🚨 contar só `proventos` faz o coletor MENTIR sobre si mesmo: Juatuba gravou 1.629 líquidos e o resumo
    //    disse "0 com valor", e o ledger foi carimbado `ok_sem_valor_individual` com o dinheiro no banco.
    //    A régua é "tem dinheiro?", e líquido conta quando não há bruto ([[pnigp-duas-telas-de-folha-liquido-e-bruto]]).
    if (v && (v.proventos > 0 || v.liquido > 0)) comValor++;
    if (n % 200 === 0) process.stdout.write(`   ${n}/${melhor.linhas.length}\r`);
  }
  console.log(`   ✔ ${n} servidores · ${comValor} com valor · ${competencia}          `);
  await q(`insert into folha_portaltransp_coleta
    (cod_ibge, municipio, uf, codigo, competencia, servidores, com_valor, situacao, detalhe, em)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
    on conflict (cod_ibge) do update set competencia=excluded.competencia, servidores=excluded.servidores,
      com_valor=excluded.com_valor, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
    [mun.cod_ibge, mun.nome, mun.uf, a.cod, competencia, n, comValor,
     comValor ? "ok" : "ok_sem_valor_individual",
     "CSV tabela=1 + ficha por servidor; o valor nominal só existe na ficha (tabela=2 não responde)"]);
}
await db.end();
