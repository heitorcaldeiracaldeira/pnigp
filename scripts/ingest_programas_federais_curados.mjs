// ETL — REGISTRO CURADO de programas federais de infraestrutura (saúde/educação) que o município pode pleitear.
// FNS/FNDE não expõem "janela aberta" por API limpa (SISMOB/Habilita são logados; aberturas saem por portaria/seleção).
// Então mantemos um registro curado, COM PROVENIÊNCIA (link oficial em cada item = evidência da procura), atualizado
// quando muda a portaria. Alimenta o casamento oportunidade×carência do radar. Idempotente. node scripts/ingest_programas_federais_curados.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();

// Fonte: páginas oficiais consultadas (Novo PAC Casa Civil, FNS/SISMOB, FNDE/Proinfância) — jun/2026.
const PROGRAMAS = [
  { id: "novopac-ubs", area: "saude", nome: "Novo PAC — Unidades Básicas de Saúde (UBS)",
    objeto: "Construção e conclusão de Unidades Básicas de Saúde (atenção primária)", orgao: "Ministério da Saúde · Novo PAC",
    fonte: "Novo PAC Saúde", link: "https://www.gov.br/casacivil/pt-br/novopac/saude",
    elegibilidade: "Municípios com demanda/obras de atenção básica; ingresso por seleção do Novo PAC.",
    janela: "Por seleção do Novo PAC (portaria) — consultar portal" },
  { id: "sismob-requalifica-ubs", area: "saude", nome: "Requalifica UBS / SISMOB",
    objeto: "Construção, ampliação, reforma e informatização de UBS", orgao: "Ministério da Saúde · Fundo Nacional de Saúde",
    fonte: "FNS · SISMOB 2.0", link: "https://portalfns.saude.gov.br/sismob-2-0/",
    elegibilidade: "Municípios; cadastro de proposta no SISMOB quando a fase é aberta por portaria.",
    janela: "Cadastro no SISMOB quando aberto por portaria — consultar portal" },
  { id: "novopac-saude-especializada", area: "saude", nome: "Novo PAC — Policlínicas e Maternidades",
    objeto: "Policlínicas regionais e maternidades (atenção especializada)", orgao: "Ministério da Saúde · Novo PAC",
    fonte: "Novo PAC Saúde", link: "https://www.gov.br/casacivil/pt-br/novopac/saude",
    elegibilidade: "Em geral de abrangência regional; verificar arranjo com o estado/CIR.",
    janela: "Por seleção do Novo PAC (portaria) — consultar portal" },
  { id: "novopac-educacao", area: "educacao", nome: "Novo PAC — Educação básica (creches e escolas)",
    objeto: "Construção de creches, pré-escolas e escolas de ensino fundamental e médio", orgao: "MEC · FNDE · Novo PAC",
    fonte: "Novo PAC Educação", link: "https://www.gov.br/casacivil/pt-br/novopac/educacao-ciencia-e-tecnologia",
    elegibilidade: "Municípios com demanda de vagas; ingresso por seleção do Novo PAC.",
    janela: "Por seleção do Novo PAC (portaria) — consultar portal" },
  { id: "fnde-proinfancia", area: "educacao", nome: "Proinfância (FNDE)",
    objeto: "Construção e equipamento de creches e pré-escolas (educação infantil)", orgao: "FNDE",
    fonte: "FNDE · Proinfância (PAR/SIMEC)", link: "https://www.gov.br/fnde/pt-br/acesso-a-informacao/acoes-e-programas/programas/proinfancia",
    elegibilidade: "Demanda mínima por Censo + terreno municipal regularizado; adesão via PAR no SIMEC.",
    janela: "Adesão por ciclo do PAR (SIMEC) — consultar portal" },
];

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  await db.query(`CREATE TABLE IF NOT EXISTS programas_federais_sc (
    id TEXT PRIMARY KEY, area TEXT NOT NULL, nome TEXT NOT NULL, objeto TEXT, orgao TEXT,
    fonte TEXT, link TEXT, elegibilidade TEXT, janela TEXT, atualizado_em timestamptz DEFAULT now())`);
  for (const p of PROGRAMAS) {
    await db.query(`INSERT INTO programas_federais_sc (id,area,nome,objeto,orgao,fonte,link,elegibilidade,janela,atualizado_em)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
      ON CONFLICT (id) DO UPDATE SET area=EXCLUDED.area, nome=EXCLUDED.nome, objeto=EXCLUDED.objeto, orgao=EXCLUDED.orgao,
        fonte=EXCLUDED.fonte, link=EXCLUDED.link, elegibilidade=EXCLUDED.elegibilidade, janela=EXCLUDED.janela, atualizado_em=now()`,
      [p.id, p.area, p.nome, p.objeto, p.orgao, p.fonte, p.link, p.elegibilidade, p.janela]);
  }
  const r = (await db.query(`SELECT area, count(*) n FROM programas_federais_sc GROUP BY 1 ORDER BY 1`)).rows;
  console.log(`programas_federais_sc: ${PROGRAMAS.length} registrados · ${r.map((x) => `${x.area}=${x.n}`).join(" · ")}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
