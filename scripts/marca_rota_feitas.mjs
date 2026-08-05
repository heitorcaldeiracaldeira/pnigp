// MARCADOR DE "FEITO" POR ROTA — substitui o marca_ata_feitas, que era chaveado só por processo.
//
// ═══ O DEFEITO ═══
// `marca_ata_feitas` tem PK (cnpj, ano, seq) e é COMPARTILHADO por cinco extratores. O primeiro a passar
// marca o processo como feito — mesmo tendo achado nada — e os outros quatro nunca mais olham. Como a etapa
// da dispensa roda na posição 5 da cadeia, antes de az (6), betha (7), ecustomize (8) e portal_vencedores (9),
// ela varria o documento deles com o parser errado, achava zero e fechava a porta. Medido em 05/ago/2026:
// 6.167 processos 'az', 278 'portal_vencedores' e 163 'betha' marcados com zero achado. Cobertura perdida.
//
// ═══ A CHAVE NOVA ═══
// (cnpj, ano, seq, ROTA). Cada extrator tem a sua fila; ninguém cega ninguém. Um mesmo processo pode ser
// visitado pela rota do portal E pela rota do termo, que é o correto — são perguntas diferentes.
//
// ═══ COMO A ROTA DO PASSADO É RECUPERADA, sem refazer 152 mil processos ═══
// O esquema antigo guarda a assinatura de quem escreveu, sem querer: `extrai_marca_multi` grava n_propostas
// (INSERT ... (cnpj,ano,seq,n_propostas)) e az/betha/ecustomize/portal_vencedores gravam n_marcas. Como o
// ON CONFLICT de cada um toca só a própria coluna, dá para atribuir:
//   n_propostas NÃO NULO  → a varredura por formato passou por aqui        → rota 'multi'
//   n_marcas    NÃO NULO  → um extrator de gerador passou por aqui         → rota 'doc:<gerador do documento>'
// Linha com as duas colunas preenchidas vira DUAS linhas na tabela nova, que é a verdade: dois extratores
// diferentes passaram pelo mesmo processo.
//
// O efeito colateral é justamente o conserto: processo de gerador 'az' marcado SÓ com n_propostas (isto é,
// varrido pela dispensa e por mais ninguém) não ganha linha 'doc:az' — e volta para a fila do extrai_az.
//
//   node scripts/marca_rota_feitas.mjs            → só mede, não escreve
//   APLICAR=1 node scripts/marca_rota_feitas.mjs  → cria a tabela e faz a carga
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const U = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const APLICAR = process.env.APLICAR === "1";
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 600000 });

const cols = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name='marca_ata_feitas'`)).rows.map((r) => r.column_name);
console.log("colunas do marcador antigo:", cols.join(", "));
const temProp = cols.includes("n_propostas"), temMarcas = cols.includes("n_marcas");
if (!temProp && !temMarcas) { console.error("sem n_propostas nem n_marcas — não dá para atribuir rota"); process.exit(1); }

// gerador dominante do processo: o do documento mais longo, que é o que os extratores de gerador leem
const GER = `(SELECT a.gerador FROM arquivo_texto_sc a
              WHERE a.cnpj=f.cnpj AND a.ano=f.ano AND a.seq=f.seq AND a.gerador IS NOT NULL
              ORDER BY a.chars DESC LIMIT 1)`;

console.log("\n=== o que a carga vai produzir ===");
console.table((await db.query(`
  SELECT 'multi' rota, count(*) linhas FROM marca_ata_feitas f WHERE f.n_propostas IS NOT NULL
  UNION ALL
  SELECT 'doc:'||coalesce(${GER},'(sem gerador)'), count(*) FROM marca_ata_feitas f
   WHERE f.n_marcas IS NOT NULL GROUP BY 1
  ORDER BY 2 DESC`)).rows);

console.log("\n=== o que VOLTA para a fila do extrator certo (marcado só pela varredura, gerador com dono) ===");
console.table((await db.query(`
  SELECT coalesce(${GER},'(sem gerador)') gerador, count(*) processos_liberados
    FROM marca_ata_feitas f
   WHERE f.n_propostas IS NOT NULL AND f.n_marcas IS NULL
     AND ${GER} IN ('az','betha','ecustomize','portal_vencedores','portal_compras_publicas')
   GROUP BY 1 ORDER BY 2 DESC`)).rows);

if (!APLICAR) { console.log("\n(simulação — rode com APLICAR=1 para criar e carregar)"); await db.end(); process.exit(0); }

await db.query(`CREATE TABLE IF NOT EXISTS app.marca_rota_feitas (
  cnpj TEXT NOT NULL, ano INT NOT NULL, seq INT NOT NULL, rota TEXT NOT NULL,
  achou INT, feito_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cnpj, ano, seq, rota) )`);
const a = await db.query(`INSERT INTO app.marca_rota_feitas (cnpj,ano,seq,rota,achou,feito_em)
  SELECT f.cnpj,f.ano,f.seq,'multi',f.n_propostas,coalesce(f.feito_em,now()) FROM marca_ata_feitas f
   WHERE f.n_propostas IS NOT NULL ON CONFLICT DO NOTHING`);
const b = await db.query(`INSERT INTO app.marca_rota_feitas (cnpj,ano,seq,rota,achou,feito_em)
  SELECT f.cnpj,f.ano,f.seq,'doc:'||coalesce(${GER},'sem_gerador'),f.n_marcas,coalesce(f.feito_em,now())
    FROM marca_ata_feitas f WHERE f.n_marcas IS NOT NULL ON CONFLICT DO NOTHING`);
console.log(`\ncarregado: ${a.rowCount} linhas de rota 'multi' · ${b.rowCount} linhas de rota 'doc:*'`);
console.table((await db.query(`SELECT rota, count(*) linhas FROM app.marca_rota_feitas GROUP BY 1 ORDER BY 2 DESC`)).rows);
await db.end();
