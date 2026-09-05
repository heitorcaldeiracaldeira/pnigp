// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_pi_completa.mjs — Piauí, segunda rodada: resolve as 3 pendências abertas (CODIPI,
// AGESPISA, EMGERPI). Nenhuma tinha nome confirmado na rodada 1.
//
// CODIPI: CONFIRMADO EM LIQUIDAÇÃO — por decreto estadual (Decreto 23698/2025), o Diretor-Presidente da EMGERPI
// foi designado liquidante/interventor da CODIPI. O "REGISTRO ATIVO" na JUCEPI é só formalidade cadastral da
// Receita Federal — a empresa não opera mais. Sai do escopo por natureza (em liquidação), não por falha de busca.
// (Nota: não confundir com "CODIPI COOP", cooperativa agrícola privada homônima criada em jul/2026 — entidade
// completamente diferente.)
//
// EMGERPI (Empresa de Gestão de Recursos do Estado do Piauí): Antônio Torres da Paz, Diretor-Presidente desde
// 31/03/2025 — DUPLA confirmação: notícia de posse (Tribuna Piauí) + o próprio Decreto 23698/2025 que o designa
// liquidante da CODIPI. O site institucional segue com problema de configuração (domínio serve conteúdo de outro
// órgão) — valor de remuneração não encontrado.
//
// AGESPISA (Águas e Esgotos do Piauí S/A): Garcias Guedes Rodrigues Júnior, indicado pelo governador Rafael
// Fonteles, aprovado por unanimidade pela Assembleia Legislativa e pelo Conselho de Administração (posse ~jul/2025,
// confirmado por notícia institucional). O domínio oficial agespisa.com.br CONTINUA fora do ar (DNS não resolve,
// confirmado nesta rodada de novo) — valor de remuneração não encontrado.
//
// node scripts/ingest_remuneracao_estatais_pi_completa.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

await q(`create table if not exists remuneracao_dirigentes_estatais_pi_individual (
  empresa_sigla text, empresa_nome text, cargo text, nome text, valor numeric,
  competencia text, fonte text, observacao text, _hash text primary key, _coletado_em timestamptz default now()
)`);

const REGS = [
  { sigla: "AGESPISA", nome_empresa: "Águas e Esgotos do Piauí S/A", cargo: "Presidente",
    nome: "Garcias Guedes Rodrigues Júnior",
    fonte: "instagram.com/agespisa.oficial (posse) + agespisa.com.br (conteúdo indexado, domínio atualmente fora do ar)",
    obs: "indicado pelo governador Rafael Fonteles, aprovado por unanimidade pela Assembleia Legislativa e pelo Conselho de Administração; domínio agespisa.com.br confirmado fora do ar (DNS não resolve) nesta rodada de novo — valor pendente" },
  { sigla: "EMGERPI", nome_empresa: "Empresa de Gestão de Recursos do Estado do Piauí S/A", cargo: "Diretor-Presidente",
    nome: "Antônio Torres da Paz",
    fonte: "Decreto Estadual nº 23.698/2025 + Tribuna Piauí (31/03/2025)",
    obs: "mesmo decreto que o nomeia também o designa liquidante/interventor da CODIPI; domínio institucional segue mal configurado — valor pendente" },
].map((r) => ({ ...r, valor: null, competencia: null }));

for (const r of REGS) {
  const hash = crypto.createHash("sha256").update(`PI|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_pi_individual
    (empresa_sigla,empresa_nome,cargo,nome,valor,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.valor, r.competencia, r.fonte, r.obs, hash]);
}

{
  const hash = crypto.createHash("sha256").update("PI|CODIPI|em_liquidacao_decreto23698").digest("hex");
  await q(`insert into estatais_extintas (uf,sigla,nome,ano_extincao,destino,fonte,_hash) values
    ('PI','CODIPI','Companhia de Desenvolvimento Industrial do Piauí',2025,
     'Em liquidação por Decreto Estadual nº 23.698/2025 — o Diretor-Presidente da EMGERPI foi designado liquidante/interventor. Registro "ATIVO" na JUCEPI é só formalidade cadastral da Receita Federal, empresa não opera mais. Não confundir com CODIPI COOP (cooperativa agrícola privada homônima, jul/2026, entidade diferente).',
     'Decreto Estadual nº 23.698/2025 (leisestaduais.com.br)', $1) on conflict (_hash) do nothing`, [hash]);
}

await q(`delete from estatais_pendencias where uf='PI' and empresa_sigla in ('CODIPI','AGESPISA','EMGERPI')`);

console.log("=== Piauí — completo (rodada 2) ===");
console.table((await q(`select empresa_sigla, nome, observacao from remuneracao_dirigentes_estatais_pi_individual order by empresa_sigla`)).rows);
console.log("=== Piauí — pendências restantes ===");
console.table((await q(`select empresa_sigla, motivo from estatais_pendencias where uf='PI'`)).rows);
await db.end();
