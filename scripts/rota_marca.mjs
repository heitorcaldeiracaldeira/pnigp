// A ROTA DA MARCA — um local só para decidir QUEM extrai a marca de cada processo.
//
// ═══ O ERRO QUE ISTO CORRIGE ═══
// Havia nove extratores, cada um varrendo o universo inteiro pelo SEU critério, e todos escrevendo no MESMO
// marcador de "feito" (`marca_ata_feitas`, chaveado só por cnpj+ano+seq). Duas consequências, ambas medidas
// em 05/ago/2026:
//
//   1. ROTEAVAM PELO SISTEMA QUE INFORMA, NÃO PELO QUE FAZ. `extrai_az.mjs` seleciona `gerador='az'` — o
//      sistema que gerou o PDF. Mas o gerador é o ERP que relata (Betha, IPM, Pública, AZ), e não o portal
//      onde a disputa correu. Medido: dos processos com documento gerado por 'az', 2.232 tiveram a disputa no
//      Compras.gov, 753 na BLL e 526 na BNC — três portais diferentes, três layouts de ata diferentes, todos
//      caindo no mesmo parser. E a marca, quando existe, está no documento DA PLATAFORMA que conduziu a
//      disputa: o órgão quase nunca anexa a ata (0,12% num re-poll de 82 mil documentos).
//
//   2. UM EXTRATOR CEGAVA OS OUTROS. Como o marcador é por processo e não por rota, o primeiro extrator a
//      passar marcava o processo como feito — mesmo tendo achado nada. A etapa da dispensa roda na posição 5,
//      antes de az (6), betha (7), ecustomize (8) e portal_vencedores (9): ela varreu 6.167 processos 'az',
//      278 'portal_vencedores' e 163 'betha', achou ZERO nos três, e fechou a porta para quem sabia lê-los.
//      Isso não é lentidão, é cobertura perdida.
//
// ═══ A REGRA ═══
// A rota sai do par MODALIDADE + LOCAL DA DISPUTA, nesta ordem de precedência:
//   1. `app.processo_portal_real.portal_real` — onde a disputa CORREU. É o que manda quando existe.
//   2. sem portal (a maioria das dispensas: 144.862 de ~159 mil, disputa que não correu em plataforma) —
//      aí sim o documento é o termo do próprio ERP, e o gerador do documento é o desempate legítimo.
// O marcador novo é chaveado por (cnpj, ano, seq, ROTA): cada rota tem a sua fila e ninguém cega ninguém.
//
// Este arquivo NÃO extrai: ele decide e diz. `node scripts/rota_marca.mjs` imprime a distribuição do universo
// pendente por rota, que é o que se confere antes de deixar qualquer extrator escrever.
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const U = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();

// ── portal onde a disputa correu → quem sabe ler a ata daquele portal ─────────────────────────────
// Os nomes de portal são os de app.processo_portal_real.portal_real, e os alvos são os coletores/parsers que
// JÁ roteiam por esse mesmo campo — a tabela abaixo só torna explícito o que estava espalhado por nove arquivos.
export const POR_PORTAL = {
  "Compras.gov":                       "compras_gov",
  "Portal de Compras Públicas":        "pcp",
  "Estado de Santa Catarina (e-lic)":  "elic",
  "BLL":                               "bll",
  "BNC":                               "bnc",
  "ComprasBR (AZ)":                    "az",
  "Licitar Digital":                   "licitar",
  "Licitações-E BB":                   "licitacoes_e",
  "BBMNET":                            "bbmnet",
  "Licitanet":                         "licitanet",
  "Atende.net (IPM)":                  "ipm",
  "Betha":                             "betha",
  "Contrata+Brasil":                   "contrata_brasil",
  "Licita+Brasil":                     "licita_brasil",
};

// ── sem portal: o documento é o termo do ERP. O gerador do documento é o desempate. ───────────────
export const POR_ERP = {
  az: "termo_az", betha: "termo_betha", ecustomize: "termo_ecustomize",
  portal_compras_publicas: "termo_pcp", licitar_digital: "termo_licitar",
  portal_vencedores: "termo_vencedores", bll: "termo_bll", licitanet: "termo_licitanet",
};
export const ROTA_TERMO = "termo_generico";   // gerador 'outro'/nulo: o parser de termo de dispensa

// SQL da decisão de rota — uma expressão, para que a mesma regra valha na seleção e no relatório.
export const SQL_ROTA = `
  CASE
    WHEN p.portal_real IS NOT NULL THEN 'portal:' || p.portal_real
    WHEN d.gerador IS NOT NULL AND d.gerador <> 'outro' THEN 'erp:' || d.gerador
    ELSE 'termo'
  END`;

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 300000 });
  console.log("=== universo COM documento, por rota (modalidade × local da disputa) ===\n");
  const { rows } = await db.query(`
    SELECT ${SQL_ROTA} AS rota,
           CASE WHEN c.modalidade_id IN (8,9,12) THEN 'dispensa/inexig' ELSE 'disputa' END AS familia,
           count(DISTINCT (d.cnpj,d.ano,d.seq)) processos
      FROM arquivo_texto_sc d
      JOIN contratacoes_sc c ON c.cnpj=d.cnpj AND c.ano=d.ano AND c.seq=d.seq
      LEFT JOIN app.processo_portal_real p ON p.cnpj=d.cnpj AND p.ano=d.ano AND p.seq=d.seq
     WHERE d.chars > 500
     GROUP BY 1,2 ORDER BY 3 DESC LIMIT 40`);
  console.table(rows);
  const tot = rows.reduce((s, r) => s + Number(r.processos), 0);
  console.log(`\ntotal roteado: ${tot.toLocaleString()} processos`);
  console.log("rotas sem destino declarado:",
    [...new Set(rows.map((r) => r.rota).filter((r) => {
      if (r.startsWith("portal:")) return !POR_PORTAL[r.slice(7)];
      if (r.startsWith("erp:")) return !POR_ERP[r.slice(4)];
      return false;
    }))].join(", ") || "(nenhuma)");
  await db.end();
}
