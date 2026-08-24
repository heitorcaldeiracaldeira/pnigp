// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_tcepta.mjs — folha NOMINAL da família "TcePta", achada em 20/ago/2026 em Belágua/MA enquanto
// se procurava fonte para o Maranhão (o pior estado do país: 15 de 217).
//
// ⭐ POR QUE VALE: uma requisição GET por município devolve a folha inteira em JSON, sem login e sem captcha,
//    com os CINCO campos de [[pnigp-folha-municipal-cinco-campos]] e ainda o TIPO DE FOLHA explícito:
//      COMPETENCIA (já em AAAAMM!) · REFERENCIA_ABREVIADA · MATRICULA_CPF · NOME · CARGO ·
//      TPFO_CARGA_HORARIA · VINCULO · TIPO_FOLHA · LOTACAO · SALARIO_BRUTO · SALARIO_LIQUIDO
//
// A ROTA é derivável do nome do município — não exige descobrir id, que é o que costuma travar expansão:
//    http://transparencia.{slug}.{uf}.gov.br/acessoInformacao/folha/folha/listarFolhaTcePta
//
// 🚨 COMO FOI ACHADA (e por que quase não foi): a página `/acessoInformacao/folha/folha` traz o grid montado
//    por JavaScript — em HTTP puro ela tem **2 <tr> e nenhum nome**. Eu a classifiquei como "rota sem dado" e
//    quase a descartei. O navegador mostrou 31 linhas; observando as requisições do CARREGAMENTO (não do
//    clique, onde eu olhava) apareceu o `listarFolhaTcePta`. **Página sem dado no HTML não é página sem dado.**
//
// 🚨 TIPO_FOLHA é obrigatório de respeitar: o mesmo endpoint devolve "Folha Mensal (Normal)" junto com
//    Rescisão, Férias, 13º, Abono e Licença. Somar tudo infla a folha — é a mesma lei que já corrigiu 23
//    municípios no SCPI ([[pnigp-competencia-mais-cheia-nao-a-recente]]). Aqui só entra a MENSAL.
//
// 🚨 A COMPETÊNCIA VARIA POR MUNICÍPIO no mesmo payload (de 202412 a 202607). Grava-se a competência de cada
//    linha, e a "mais cheia" decide qual representa o município ([[pnigp-competencia-mais-cheia-nao-a-recente]]).
//
// Uso: node scripts/ingest_folha_tcepta.mjs        · UF=MA restringe · SO=Belágua um município · REFAZ=1
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const UF = process.env.UF || null;
const CONC = +(process.env.CONC || 5);
const PAUSA = +(process.env.PAUSA || 200);
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const H = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  accept: "application/json, text/javascript, */*", "x-requested-with": "XMLHttpRequest" };

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const slug = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9]/g, "");
// 🚨 O JSON usa PONTO DECIMAL ("1783.06") embora a TELA renderize "1.783,06". Assumir pt-BR e tirar o ponto
//    multiplica tudo por cem — a primeira coleta saiu com média de R$ 329.679 e foi a prova real que pegou.
//    Mesma armadilha já corrigida no SMARAPD: decidir o formato pelo VALOR, não pela origem
//    ([[pnigp-rotulo-da-coluna-de-dinheiro-varia]]).
// vazio/"-" → null (nunca 0, para não confundir "não publicou" com "ganhou zero")
const money = (v) => {
  const t = String(v ?? "").replace(/R\$/gi, "").replace(/\s/g, "").trim();
  if (!t || !/\d/.test(t)) return null;
  let n;
  if (t.includes(",")) n = Number(t.replace(/\./g, "").replace(",", "."));   // pt-BR: 1.783,06
  else if (/^-?\d+\.\d{1,2}$/.test(t)) n = Number(t);                        // ponto decimal: 1783.06
  else n = Number(t.replace(/\./g, ""));                                     // inteiro com milhar: 1.783
  return Number.isFinite(n) ? n : null;
};

await q(`create table if not exists folha_servidores_tcepta (
  cod_ibge text, municipio text, uf text, host text, competencia text, referencia text,
  matricula_cpf text, nome text, cargo text, lotacao text, vinculo text, tipo_folha text,
  carga_horaria text, data_exercicio text,
  salario_bruto numeric, salario_liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_tcepta_mun on folha_servidores_tcepta (cod_ibge, competencia)`);
await q(`create table if not exists folha_tcepta_coleta (
  cod_ibge text primary key, municipio text, uf text, host text, competencia text,
  linhas int, mensais int, situacao text, detalhe text, em timestamptz default now())`);

let alvos = (await q(`select cod_ibge, nome, uf from municipios_br
  where 1=1 ${UF ? "and uf = $1" : ""} order by uf, nome`, UF ? [UF] : [])).rows;
if (SO) alvos = alvos.filter((a) => new RegExp(semAcento(SO), "i").test(semAcento(a.nome)));
// retomada: quem já fechou `ok` fica de fora, salvo REFAZ=1
const feitos = process.env.REFAZ === "1" ? new Set()
  : new Set((await q(`select cod_ibge from folha_tcepta_coleta where situacao like 'ok%'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[tcepta] ${alvos.length} municípios · ${fila.length} na fila`);

const LOTE = 1000;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    // ⚠️ o upsert PROPAGA as colunas de dinheiro: conserto de coletor que não chega ao banco é trabalho
    //    descartado em silêncio ([[pnigp-upsert-nao-propaga-a-coluna-consertada]]).
    await q(`insert into folha_servidores_tcepta
      (cod_ibge,municipio,uf,host,competencia,referencia,matricula_cpf,nome,cargo,lotacao,vinculo,tipo_folha,
       carga_horaria,data_exercicio,salario_bruto,salario_liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::numeric[],$16::numeric[],$17::text[])
      on conflict (_hash) do update set
        salario_bruto   = coalesce(excluded.salario_bruto,   folha_servidores_tcepta.salario_bruto),
        salario_liquido = coalesce(excluded.salario_liquido, folha_servidores_tcepta.salario_liquido),
        lotacao = coalesce(excluded.lotacao, folha_servidores_tcepta.lotacao),
        cargo   = coalesce(excluded.cargo,   folha_servidores_tcepta.cargo), _coletado_em = now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("host"), c("competencia"), c("referencia"), c("matricula_cpf"),
       c("nome"), c("cargo"), c("lotacao"), c("vinculo"), c("tipo_folha"), c("carga_horaria"), c("data_exercicio"),
       c("salario_bruto"), c("salario_liquido"), c("_hash")]);
  }
}

let ok = 0, vazios = 0, falhas = 0, totalGeral = 0;
const trabalha = async () => {
  while (fila.length) {
    const a = fila.pop();
    const base = `http://transparencia.${slug(a.nome)}.${a.uf.toLowerCase()}.gov.br`;
    const marca = (situacao, detalhe, linhas = 0, mensais = 0, comp = null) =>
      q(`insert into folha_tcepta_coleta (cod_ibge,municipio,uf,host,competencia,linhas,mensais,situacao,detalhe,em)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict (cod_ibge) do update set
         host=excluded.host, competencia=excluded.competencia, linhas=excluded.linhas, mensais=excluded.mensais,
         situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
        [a.cod_ibge, a.nome, a.uf, base, comp, linhas, mensais, situacao, detalhe]);
    try {
      const r = await fetch(`${base}/acessoInformacao/folha/folha/listarFolhaTcePta`,
        { headers: { ...H, referer: `${base}/acessoInformacao/folha/folha` }, redirect: "follow", signal: AbortSignal.timeout(60000) });
      if (!r.ok) { falhas++; continue; }                    // município sem o produto: nem entra no ledger
      const txt = await r.text();
      let j; try { j = JSON.parse(txt); } catch { falhas++; continue; }
      const arr = Array.isArray(j) ? j : (j.data || j.aaData || []);
      if (!Array.isArray(arr) || !arr.length || arr[0]?.NOME === undefined) { falhas++; continue; }

      // 🚨 só FOLHA MENSAL. Rescisão, férias, 13º e abono somados inflariam a folha do município.
      const mensal = arr.filter((x) => /mensal/i.test(x.TIPO_FOLHA || ""));
      if (!mensal.length) {
        const tipos = [...new Set(arr.map((x) => x.TIPO_FOLHA))].slice(0, 4).join(", ");
        await marca("ok_sem_mensal", `${arr.length} linhas, nenhuma de Folha Mensal (tipos: ${tipos})`, arr.length, 0);
        vazios++; continue;
      }
      // ⭐ a competência mais CHEIA entre as mensais representa o município, não a mais recente
      const porComp = {}; mensal.forEach((x) => (porComp[x.COMPETENCIA] = (porComp[x.COMPETENCIA] || 0) + 1));
      const comp = Object.entries(porComp).sort((x, y) => y[1] - x[1])[0][0];
      const doMes = mensal.filter((x) => x.COMPETENCIA === comp);

      const regs = doMes.map((x) => ({
        cod_ibge: a.cod_ibge, municipio: a.nome, uf: a.uf, host: base,
        competencia: String(x.COMPETENCIA || "").trim(), referencia: x.REFERENCIA_ABREVIADA || null,
        matricula_cpf: x.MATRICULA_CPF || null, nome: (x.NOME || "").trim() || null,
        cargo: x.CARGO || null, lotacao: x.LOTACAO || null,
        vinculo: x.VINCULO && x.VINCULO !== "-" ? x.VINCULO : null, tipo_folha: x.TIPO_FOLHA || null,
        carga_horaria: x.TPFO_CARGA_HORARIA || null,
        data_exercicio: x.TPFO_DT_EXERCICIO && !/^0000/.test(x.TPFO_DT_EXERCICIO) ? x.TPFO_DT_EXERCICIO : null,
        salario_bruto: money(x.SALARIO_BRUTO), salario_liquido: money(x.SALARIO_LIQUIDO),
        _hash: crypto.createHash("md5")
          .update([a.cod_ibge, x.COMPETENCIA, x.MATRICULA_CPF, x.NOME, x.CARGO, x.TIPO_FOLHA].join("|")).digest("hex"),
      })).filter((x) => x.nome);                            // linha sem NOME não é folha nominal

      await grava(regs);
      const comValor = regs.filter((x) => x.salario_bruto > 0 || x.salario_liquido > 0).length;
      await marca(comValor ? "ok" : "ok_sem_valor",
        `${arr.length} linhas no total · ${mensal.length} mensais · ${regs.length} na competência mais cheia · ${comValor} com valor`,
        regs.length, mensal.length, comp);
      ok++; totalGeral += regs.length;
      console.log(`  ⭐ ${a.nome.padEnd(26)}/${a.uf} ${String(regs.length).padStart(5)} servidores · ${comp} · ${comValor} com valor`);
    } catch { falhas++; }
    if (PAUSA) await dorme(PAUSA);
  }
};
await Promise.all(Array.from({ length: CONC }, trabalha));
console.log(`\n[tcepta] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} sem mensal · ${falhas} sem o produto`);
await db.end();
