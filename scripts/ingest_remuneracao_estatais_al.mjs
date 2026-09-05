// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_al.mjs — Alagoas: o portal de "tabela remuneratória" central (gestaointegrada.
// seplag.al.gov.br) é só um catálogo de LEGISLAÇÃO por órgão (não uma consulta de valores) e cobre explicitamente
// só "administração direta, autarquias e fundações públicas" — confirma o mesmo padrão de GO/AM/ES/MT/PB: as
// estatais precisam de portal próprio.
//
// 2 estatais identificadas nesta rodada (sem WebSearch, esgotado desde o estado anterior — usei o dataset
// "Água e Saneamento"/"Distribuição de Gás" do catálogo dados.al.gov.br como pista): CASAL (saneamento) e ALGÁS
// (gás). Não há garantia de que a lista esteja completa (ex.: eventual agência de fomento não confirmada) —
// tratar como piso, não teto.
//
// CASAL: Diretor-Presidente confirmado no próprio site institucional (casal.al.gov.br/diretoria) — Luiz
// Cavalcante Peixoto Neto. Governança lista Estatuto/Membros de Conselhos/Demonstrações Contábeis, mas NENHUMA
// categoria de "remuneração de pessoal/dirigentes" — a única correlata é "Terceirizados", que não cobre
// dirigentes. Valor não publicado (ou não organizado em categoria própria) nas páginas verificadas.
//
// ALGÁS: nem o nome do dirigente atual nem valor de remuneração foram encontrados nesta rodada — o portal de
// governança (governanca.algas.com.br) só linka documentos institucionais (Carta Anual, Código de Conduta,
// Estatuto, Relatório de Administração) sem conteúdo navegável nas tentativas feitas, e o link de LAI retornou
// 404.
//
// node scripts/ingest_remuneracao_estatais_al.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

await q(`create table if not exists remuneracao_dirigentes_estatais_al_individual (
  empresa_sigla text, empresa_nome text, cargo text, nome text, valor numeric, competencia text,
  fonte text, observacao text, _hash text primary key, _coletado_em timestamptz default now()
)`);

{
  const r = { sigla: "CASAL", nome_empresa: "Companhia de Saneamento de Alagoas", cargo: "Diretor Presidente",
    nome: "Luiz Cavalcante Peixoto Neto", fonte: "casal.al.gov.br/diretoria",
    obs: "Governança lista Estatuto/Membros de Conselhos/Demonstrações Contábeis mas nenhuma categoria dedicada a remuneração de dirigentes — 'Terceirizados' é a única categoria correlata de RH e não cobre a diretoria" };
  const hash = crypto.createHash("sha256").update(`AL|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_al_individual
    (empresa_sigla,empresa_nome,cargo,nome,valor,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,null,null,$5,$6,$7) on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.fonte, r.obs, hash]);
}

const PENDENCIAS = [
  { sigla: "CASAL", motivo: "valor_nao_publicado",
    detalhe: "Nome do dirigente confirmado; nenhuma categoria de transparência dedicada a remuneração de dirigentes localizada no site institucional" },
  { sigla: "ALGÁS", nome_empresa: "Companhia Alagoana de Gás", motivo: "nome_e_valor_nao_confirmados",
    detalhe: "Portal de governança (governanca.algas.com.br) só linka documentos institucionais sem conteúdo navegável nesta rodada; link de LAI (lai.algas.com.br:8090) retornou 404" },
  { sigla: "TODAS", nome_empresa: null, motivo: "lista_pode_estar_incompleta",
    detalhe: "Levantamento desta rodada foi feito sem WebSearch (esgotado no estado anterior) — não há confirmação de que CASAL e ALGÁS sejam as únicas estatais de Alagoas; recomenda-se nova varredura com busca aberta" },
];
for (const p of PENDENCIAS) {
  const hash = crypto.createHash("sha256").update(`AL|${p.sigla}|${p.motivo}`).digest("hex");
  await q(`insert into estatais_pendencias (uf,empresa_sigla,empresa_nome,motivo,detalhe,fonte,_hash) values
    ('AL',$1,$2,$3,$4,$5,$6) on conflict (_hash) do nothing`,
    [p.sigla, p.nome_empresa, p.motivo, p.detalhe, "dados.al.gov.br + sites institucionais próprios", hash]);
}

console.log("=== Alagoas — confirmados ===");
console.table((await q(`select empresa_sigla, nome, observacao from remuneracao_dirigentes_estatais_al_individual`)).rows);
console.log("=== Alagoas — pendências ===");
console.table((await q(`select empresa_sigla, motivo from estatais_pendencias where uf='AL'`)).rows);
await db.end();
