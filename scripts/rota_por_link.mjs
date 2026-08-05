// PRECEDÊNCIA DO LINK — onde o PNCP diz o portal de realização, o PNCP manda.
//
// `linkSistemaOrigem` é o ÚNICO campo do PNCP que carrega onde a disputa correu. Conferido em 05/ago/2026,
// campo a campo, nos 38 que a API devolve: os demais são órgão, unidade, modalidade, amparo legal, datas,
// valores e `usuarioNome` — e este último é o REMETENTE (o ERP que publicou), não o local. O botão "Acessar
// Contratação" do site do PNCP é exatamente este campo: clicado, abre a mesma URL, caractere por caractere.
//
// O QUE ESTAVA ERRADO: a rota vinha sendo decidida pelo texto do documento mesmo quando o campo oficial
// estava preenchido ao lado. Medido: 2.584 processos têm o link, e a rota registrava `via='link_origem'` em
// apenas 457 deles. Dos 2.584 — 1.173 a rota acertou por outro caminho, 35 ERROU (link diz Compras Públicas
// e a rota dizia e-lic; link diz Licitações-E e a rota dizia Compras Públicas), e 1.376 estavam fora da
// tabela de rota, isto é, o PNCP entregou o endereço e ninguém leu.
//
// A REGRA: link presente ⇒ portal_real vem do domínio, via='link_origem'. É o único caso em que sobrescrever
// uma rota já existente é correto — as outras vias são inferência, esta é declaração da fonte.
//
//   node scripts/rota_por_link.mjs            → só mede
//   APLICAR=1 node scripts/rota_por_link.mjs  → grava
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const U = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const APLICAR = process.env.APLICAR === "1";
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 600000 });

// domínio → portal, na nomenclatura de portal_real. Levantado do dado: são 11 domínios, nenhum a descobrir.
// spectro.alesc e scmweb são portais de um órgão só, mas são portais de realização e entram nomeados —
// deixá-los sem nome faria a rota deles cair em inferência por documento, que é o que se está corrigindo.
export const POR_DOMINIO = [
  ["portaldecompraspublicas",            "Portal de Compras Públicas"],
  ["cnetmobile|comprasnet|gov\\.br/compras", "Compras.gov"],
  ["bnccompras",                         "BNC"],
  ["licitardigital",                     "Licitar Digital"],
  ["bllcompras",                         "BLL"],
  ["licitacoes-e|licitacoes_e",          "Licitações-E BB"],
  ["comprasbr",                          "ComprasBR (AZ)"],
  ["licitanet",                          "Licitanet"],
  ["licitamaisbrasil",                   "Licita+Brasil"],
  ["bbmnet",                             "BBMNET"],
  ["spectro\\.alesc",                    "Spectro (ALESC)"],
  ["scmweb",                             "SCM Web"],
];
const CASE = `CASE ${POR_DOMINIO.map(([re, nome]) => `WHEN c.link_sistema_origem ~* '${re}' THEN '${nome.replace(/'/g, "''")}'`).join(" ")} ELSE NULL END`;

const COM_LINK = `c.link_sistema_origem IS NOT NULL AND c.link_sistema_origem <> ''`;

console.log("=== o que a precedência do link faz ===");
console.table((await db.query(`
  SELECT CASE
           WHEN ${CASE} IS NULL                       THEN '0. dominio sem mapa (nao mexe)'
           WHEN p.cnpj IS NULL                        THEN '1. rota NOVA (estava fora da tabela)'
           WHEN p.portal_real IS NULL                 THEN '2. rota NOVA (estava sem portal)'
           WHEN p.portal_real <> ${CASE}              THEN '3. CORRIGE (rota discordava do link)'
           WHEN p.via IS DISTINCT FROM 'link_origem'  THEN '4. mesma rota, procedencia vira link_origem'
           ELSE '5. ja estava certo e declarado' END acao,
         count(*) processos
    FROM contratacoes_sc c
    LEFT JOIN app.processo_portal_real p ON p.cnpj=c.cnpj AND p.ano=c.ano AND p.seq=c.seq
   WHERE ${COM_LINK} GROUP BY 1 ORDER BY 1`)).rows);

console.log("\n=== as correcoes, uma a uma (rota discordava do link) ===");
console.table((await db.query(`
  SELECT p.portal_real rota_dizia, ${CASE} link_diz, count(*) processos
    FROM contratacoes_sc c JOIN app.processo_portal_real p ON p.cnpj=c.cnpj AND p.ano=c.ano AND p.seq=c.seq
   WHERE ${COM_LINK} AND ${CASE} IS NOT NULL AND p.portal_real IS NOT NULL AND p.portal_real <> ${CASE}
   GROUP BY 1,2 ORDER BY 3 DESC`)).rows);

if (!APLICAR) { console.log("\n(simulação — rode com APLICAR=1 para gravar)"); await db.end(); process.exit(0); }

const r = await db.query(`
  INSERT INTO app.processo_portal_real (cnpj, ano, seq, portal_real, via, remetente_pncp, atualizado)
  SELECT c.cnpj, c.ano, c.seq, ${CASE}, 'link_origem', c.plataforma, now()
    FROM contratacoes_sc c WHERE ${COM_LINK} AND ${CASE} IS NOT NULL
  ON CONFLICT (cnpj, ano, seq) DO UPDATE
     SET portal_real = EXCLUDED.portal_real, via = 'link_origem', atualizado = now()`);
console.log(`\nlinhas gravadas/atualizadas: ${r.rowCount}`);
console.table((await db.query(`SELECT via, count(*) n, count(DISTINCT portal_real) portais
  FROM app.processo_portal_real GROUP BY 1 ORDER BY 2 DESC`)).rows);
await db.end();
