// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_campinas.mjs — folha de CAMPINAS (17.119 servidores na RAIS), a 3ª maior de SP sem coleta.
//
// ⚠️ O PORTAL EXIGE IDENTIFICAÇÃO DO CONSULENTE. `remuneracoes-pmc.campinas.sp.gov.br/publico` pede NOME COMPLETO,
// CPF e DATA DE NASCIMENTO de quem consulta antes de liberar a folha. Isso NÃO se contorna e NÃO se inventa:
//   • usar identidade de TERCEIRO seria falsidade — vetado, sempre;
//   • usar a identidade do PRÓPRIO solicitante, com autorização dele, é apenas identificar-se, que é o que o
//     formulário pede. Foi o que o Bento autorizou em 18/ago/2026.
//
// 🔒 OS DADOS PESSOAIS NÃO ENTRAM NO REPOSITÓRIO (que é PÚBLICO) NEM EM LOG. Vêm de `.env.local` via
//    `_consulente.mjs`, são usados só em memória e nunca impressos, nem gravados no banco.
//
// ⚖️ Vale registrar o mérito: a Lei 12.527 art. 10 §3º veda exigências sobre os motivos do pedido, e transparência
//    ATIVA não deveria condicionar acesso à identificação de quem consulta. Coletar identificado resolve o caso
//    concreto e NÃO invalida o argumento de LAI — Campinas segue na lista com esse achado.
//
// ⭐ O CAMINHO (medido em 18/ago/2026): a identificação abre uma SESSÃO, e a tela é alimentada por um JSON limpo —
//   GET /publico/gridTransparenciaPMC/{ano}/{mes}?offset=0&limit=N&searchByNome=&searchByCargo=&searchByCategoria=&searchByFuncao=
//   -> {total:"16023", rows:[{idServidor, nmServidorExtenso, nmExtensoCrg, nomeLotacao, nmNomeExtensoSecretaria,
//      nomeCategoria, vrbfixas... total, deducoes, encargosSociais, brutoded, dtAdmissaoFun, jornadaSemanal}]}
//   O fetch roda DENTRO da página (`page.evaluate`) porque é o cookie da identificação que libera o endpoint —
//   fora da sessão ele não devolve folha.
//
// 🚨 VALOR VEM EM CENTAVOS, sem separador: "1274694" = R$ 12.746,94. Ler como número dá salário de R$ 1,2 milhão.
// 🚨 QUAL É O BRUTO: `total` é o **Total Bruto** da tela (soma das verbas: fixas + comissão + produtividade + ...).
//    `brutoded` ("Bruto c/ Deduções") é `total − encargosSociais`, e encargo social é PATRONAL, não é desconto do
//    servidor — gravar `brutoded` como bruto subtrairia do salário uma despesa que não é dele. `deducoes` é o que
//    o portal publica como desconto (quase sempre 0). O portal NÃO publica líquido, então `liquido` fica nulo:
//    inventar líquido = total − encargos seria mentira ([[pnigp-privilegiar-dados]]).
//
// Uso: node scripts/ingest_folha_campinas.mjs      · COMP=2026-07 (fixa a competência) · LIMITE=3000
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "node:crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";
import { consulente } from "./_consulente.mjs";

const COD = "3509502", MUN = "Campinas", UF = "SP";
const BASE = "https://remuneracoes-pmc.campinas.sp.gov.br";
const LIMITE = Number(process.env.LIMITE || 3000);
const COMP_FIXA = process.env.COMP || null;      // "AAAA-MM"
const c = consulente();                          // lança se faltar identidade — nunca imprime

const db = pool(); const q = withRetry(db);
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const lim = (s) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t || null; };
const cent = (s) => { const n = Number(String(s ?? "").replace(/\D/g, "")); return Number.isFinite(n) ? n / 100 : null; };
const dia = (d) => { const t = d && d.date ? String(d.date).slice(0, 10) : null; return t && !t.startsWith("-") ? t : null; };

await q(`create table if not exists folha_servidores_campinas (
  cod_ibge text, municipio text, uf text, competencia text,
  matricula text, nome text, cargo text, secretaria text, lotacao text, vinculo text,
  bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`alter table folha_servidores_campinas add column if not exists admissao text`);
await q(`alter table folha_servidores_campinas add column if not exists jornada text`);
await q(`alter table folha_servidores_campinas add column if not exists encargos numeric`);
await q(`create table if not exists folha_campinas_coleta (
  cod_ibge text primary key, competencia text, linhas int, situacao text, detalhe text, em timestamptz default now())`);
const marca = (situacao, detalhe, n = 0, comp = null) =>
  q(`insert into folha_campinas_coleta (cod_ibge,competencia,linhas,situacao,detalhe,em)
     values ($1,$2,$3,$4,$5,now()) on conflict (cod_ibge) do update set competencia=excluded.competencia,
     linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
    [COD, comp, n, situacao, detalhe]);

const b = await chromium.launch({ headless: true, args: ["--ignore-certificate-errors"] });
const ctx = await b.newContext({ locale: "pt-BR", ignoreHTTPSErrors: true,
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" });
const p = await ctx.newPage();
try {
  await p.goto(`${BASE}/publico`, { waitUntil: "networkidle", timeout: 60000 });
  await dorme(3500);
  // identificação do consulente — preenchida em memória, nunca impressa
  await p.fill("#nomeCompleto", c.nome);
  await p.fill("#cpfUsuario", c.cpf);
  await p.fill("#dataNascimento", c.nasc);
  await p.locator("button[type=submit]").first().click({ timeout: 20000 });
  await dorme(8000);

  // 🚨 competência: o portal só oferece o que os selects listam. Hoje é um par só (2026/7); se um dia houver
  //    mais, fica com a MAIS CHEIA em pessoas distintas ([[pnigp-competencia-mais-cheia-nao-a-recente]]).
  const anos = await p.locator("#ano_transparencia option").evaluateAll((os) => os.map((x) => x.value).filter(Boolean));
  const meses = await p.locator("#mes_transparencia option").evaluateAll((os) => os.map((x) => x.value).filter(Boolean));
  if (!anos.length || !meses.length) throw new Error("selects de competência vazios — a identificação não abriu a consulta");
  const pares = COMP_FIXA ? [[COMP_FIXA.slice(0, 4), String(Number(COMP_FIXA.slice(5, 7)))]]
    : anos.flatMap((a) => meses.map((m) => [a, m]));
  console.log(`[campinas] competências oferecidas: ${pares.map(([a, m]) => `${a}/${m}`).join(", ")}`);

  const baixa = (ano, mes, off, tam) => p.evaluate(async ([ano, mes, off, tam]) => {
    const u = `/publico/gridTransparenciaPMC/${ano}/${mes}?offset=${off}&limit=${tam}`
      + `&searchByNome=&searchByCargo=&searchByCategoria=&searchByFuncao=`;
    const r = await fetch(u, { headers: { "X-Requested-With": "XMLHttpRequest" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    return { total: Number(j.total || 0), rows: j.rows || [] };
  }, [ano, mes, off, tam]);

  let melhor = null;
  for (const [ano, mes] of pares) {
    const comp = `${ano}${String(mes).padStart(2, "0")}`;
    const rows = [];
    let total = 0, off = 0;
    do {
      const r = await baixa(ano, mes, off, LIMITE);
      total = r.total;
      if (!r.rows.length) break;
      rows.push(...r.rows);
      off += r.rows.length;
      process.stdout.write(`\r  ${comp}: ${rows.length}/${total}   `);
    } while (off < total);
    process.stdout.write("\n");
    if (!rows.length) { console.log(`  · ${comp}: vazia`); continue; }
    const pessoas = new Set(rows.map((x) => `${x.idServidor ?? ""}|${x.nmServidorExtenso ?? ""}`)).size;
    if (!melhor || pessoas > melhor.pessoas) melhor = { comp, rows, pessoas, total };
  }
  if (!melhor) throw new Error("nenhuma competência devolveu linha");

  const lote = melhor.rows.map((x) => {
    const bruto = cent(x.total), desc = cent(x.deducoes), enc = cent(x.encargosSociais);
    const nome = lim(x.nmSocial) || lim(x.nmServidorExtenso) || lim(x.nmAbreviadoFun);
    const cargo = lim(x.nmExtensoCrg) || lim(x.nomeCargoComissao);
    return [COD, MUN, UF, melhor.comp, lim(x.idServidor), nome, cargo,
      lim(x.nmNomeExtensoSecretaria), lim(x.nomeLotacao), lim(x.nomeCategoria),
      bruto, desc, null, dia(x.dtAdmissaoFun), lim(x.jornadaSemanal), enc,
      crypto.createHash("sha1").update([COD, melhor.comp, x.idServidor ?? "", nome ?? "", x.total ?? ""].join("|")).digest("hex")];
  });
  const N = 17;
  for (let i = 0; i < lote.length; i += 500) {
    const parte = lote.slice(i, i + 500);
    const vals = parte.map((_, k) => `(${Array.from({ length: N }, (_, j) => `$${k * N + j + 1}`).join(",")})`).join(",");
    await q(`insert into folha_servidores_campinas (cod_ibge,municipio,uf,competencia,matricula,nome,cargo,
      secretaria,lotacao,vinculo,bruto,descontos,liquido,admissao,jornada,encargos,_hash)
      values ${vals} on conflict (_hash) do nothing`, parte.flat());
  }
  const comValor = lote.filter((x) => x[10] > 0).length;
  const gravadas = (await q(`select count(*) n from folha_servidores_campinas where competencia=$1`, [melhor.comp])).rows[0].n;
  await marca("ok", `${melhor.pessoas} pessoas · ${comValor} com bruto · ${gravadas} na tabela`, melhor.pessoas, melhor.comp);
  console.log(`⭐ Campinas ${melhor.pessoas} pessoas · ${lote.length} linhas · ${comValor} com bruto · comp ${melhor.comp} · ${gravadas} gravadas`);
} catch (e) {
  const msg = String(e.message).split("\n")[0].slice(0, 120);
  await marca("erro", msg);
  console.log("ERRO:", msg);
} finally {
  await b.close(); await db.end();
}
