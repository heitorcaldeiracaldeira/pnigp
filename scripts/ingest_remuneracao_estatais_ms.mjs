// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_ms.mjs — Mato Grosso do Sul: 3 estatais confirmadas (MSGÁS, SANESUL, MS Ativos
// Ambientais — a antiga MS Mineral, transformada por Lei Estadual 6.538/2025). O portal central de folha
// (transparencia.ms.gov.br) testado com órgão="SANESUL" retornou "Não encontrado órgãos" — confirma o padrão
// comum: cadastro central só cobre administração direta/indireta autárquica, não as sociedades de economia mista.
//
// MSGÁS: Diretora-Presidente Cristiane Alkmin Junqueira Schmidt está EM LICENÇA desde ago/2026 para campanha
// política (Ronaldo Caiado) — quem responde interinamente é Gisele Barreto Lourenço (Diretora Administrativa e
// Financeira). Registro mantém a titular formal e documenta a interinidade, sem trocar o cargo.
//
// MS ATIVOS AMBIENTAIS: CONFLITO entre fontes — a "Lista de Autoridades" oficial do governo (Agência MS, PDF,
// 17/07/2026) diz "Diretor-Presidente: Valdir João Gomes de Oliveira"; uma notícia da Midiamax de 24/06/2026 (mais
// antiga) atribui a assinatura de um edital a "Karla Bethânia Ledesma de Nadai, Diretora-Presidente". Prevaleceu a
// fonte oficial mais recente (lei do projeto: não usar dado antigo); o nome de imprensa fica documentado como
// conflito não resolvido, não como fato.
//
// Nenhum valor de remuneração encontrado nesta rodada para as 3 empresas — não há portal próprio de remuneração
// individualizada localizado, e o cadastro central não cobre.
//
// node scripts/ingest_remuneracao_estatais_ms.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const FONTE_SANESUL = "sanesul.ms.gov.br/diretoria";
const FONTE_MSGAS = "msgas.com.br/a-empresa + Campo Grande News (05/08/2026, licença para campanha)";
const FONTE_MSATIVOS = "Agência MS — Lista de Autoridades (PDF, 17/07/2026)";

await q(`create table if not exists remuneracao_dirigentes_estatais_ms_individual (
  empresa_sigla text, empresa_nome text, cargo text, nome text, valor numeric,
  competencia text, fonte text, observacao text, _hash text primary key, _coletado_em timestamptz default now()
)`);

const REGS = [
  { sigla: "SANESUL", nome_empresa: "Empresa de Saneamento de Mato Grosso do Sul S.A.", cargo: "Diretor-Presidente",
    nome: "Renato Marcílio da Silva", fonte: FONTE_SANESUL,
    obs: "no cargo desde janeiro/2023; valor de remuneração não encontrado nesta rodada (empresa não está no cadastro central de folha)" },
  { sigla: "MSGÁS", nome_empresa: "Companhia de Gás do Estado de Mato Grosso do Sul", cargo: "Diretora-Presidente",
    nome: "Cristiane Alkmin Junqueira Schmidt", fonte: FONTE_MSGAS,
    obs: "titular EM LICENÇA desde ago/2026 (campanha presidencial de Ronaldo Caiado) — Gisele Barreto Lourenço (Diretora Administrativa e Financeira) responde interinamente; valor de remuneração não encontrado nesta rodada" },
  { sigla: "MS ATIVOS AMBIENTAIS", nome_empresa: "Companhia Gestora de Ativos Ambientais de Mato Grosso do Sul S.A.", cargo: "Diretor-Presidente",
    nome: "Valdir João Gomes de Oliveira", fonte: FONTE_MSATIVOS,
    obs: "CONFLITO NÃO RESOLVIDO: notícia da Midiamax (24/06/2026) atribui o cargo a Karla Bethânia Ledesma de Nadai, mas a Lista de Autoridades oficial do governo (17/07/2026, mais recente) diz Valdir João Gomes de Oliveira — prevaleceu a fonte oficial mais recente; valor de remuneração não encontrado" },
].map((r) => ({ ...r, valor: null, competencia: null }));

for (const r of REGS) {
  const hash = crypto.createHash("sha256").update(`MS|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_ms_individual
    (empresa_sigla,empresa_nome,cargo,nome,valor,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.valor, r.competencia, r.fonte, r.obs, hash]);
}

console.log("=== Mato Grosso do Sul ===");
console.table((await q(`select empresa_sigla, nome, observacao from remuneracao_dirigentes_estatais_ms_individual order by empresa_sigla`)).rows);
await db.end();
