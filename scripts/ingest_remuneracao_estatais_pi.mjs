// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_pi.mjs — Piauí: a lista oficial "Relatório de Empresas Públicas e Sociedades de
// Economia Mista" (art. 92 da Lei 13.303/2016, piauidigital.pi.gov.br/home/publicacoes-legais/empresa-publicas)
// só carrega via botão "Baixar PDF" acionado por JS (sem link estático) — baixei o PDF pelo browser e filtrei
// as ~1000 linhas (que, como em outros estados, misturam agências bancárias federais — Banco do Brasil, Banco
// do Nordeste, uma entrada por município — com as verdadeiras estatais do Piauí).
//
// 4 nomes de estatal ESTADUAL genuínos encontrados no PDF (excluídas ETURB e PRODATER, que são empresas
// MUNICIPAIS de Teresina, não do Estado):
//   • AGESPISA (Águas e Esgotos do Piauí S/A) — REGISTRO ATIVO, sociedade de economia mista (dezenas de filiais
//     por município no PDF, mesmo padrão de "1 empresa = N linhas" visto em AM/JUCEA)
//   • EMGERPI (Empresa de Gestão de Recursos do Estado do Piauí S/A) — REGISTRO ATIVO, sociedade de economia mista
//   • PIEMTUR (Empresa de Turismo do Piauí S/A) — EXTINTA, com o próprio nome registrado como "EM LIQUIDAÇÃO"
//   • CODIPI (Companhia de Desenvolvimento Industrial do Piauí) — situação "REGISTRO ATIVO" mas o nome no
//     próprio registro já traz "EM LIQUIDAÇÃO" — processo de extinção em andamento, não claramente ativa nem extinta
//
// Nem AGESPISA nem EMGERPI tiveram nome de dirigente ou valor confirmados nesta rodada: o domínio oficial
// agespisa.pi.gov.br redireciona (301) para agespisa.com.br, que NÃO RESOLVE por DNS (site genuinamente fora do
// ar); emgerpi.pi.gov.br tem certificado TLS de OUTRO órgão (detran.pi.gov.br) e o conteúdo servido é do DETRAN,
// não da EMGERPI — o domínio está claramente mal configurado/abandonado.
//
// node scripts/ingest_remuneracao_estatais_pi.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const FONTE_JUCEPI = "piauidigital.pi.gov.br/home/publicacoes-legais/empresa-publicas (PDF gerado em 01/09/2026)";

const PENDENCIAS = [
  { sigla: "AGESPISA", nome_empresa: "Águas e Esgotos do Piauí S/A", motivo: "site_quebrado",
    detalhe: "Registro ativo confirmado no relatório oficial JUCEPI (sociedade de economia mista); domínio oficial agespisa.pi.gov.br redireciona (301) para agespisa.com.br, que não resolve por DNS — site genuinamente fora do ar" },
  { sigla: "EMGERPI", nome_empresa: "Empresa de Gestão de Recursos do Estado do Piauí S/A", motivo: "dominio_mal_configurado",
    detalhe: "Registro ativo confirmado no relatório oficial JUCEPI (sociedade de economia mista); domínio emgerpi.pi.gov.br serve certificado TLS e conteúdo de OUTRO órgão (detran.pi.gov.br) — domínio claramente mal configurado/abandonado" },
  { sigla: "CODIPI", nome_empresa: "Companhia de Desenvolvimento Industrial do Piauí", motivo: "status_societario_incerto",
    detalhe: "Relatório oficial JUCEPI (11/11/2025) mostra situação 'REGISTRO ATIVO' mas o próprio nome registrado já traz 'EM LIQUIDAÇÃO' — processo de extinção em andamento, status real não confirmado nesta rodada" },
];
for (const p of PENDENCIAS) {
  const hash = crypto.createHash("sha256").update(`PI|${p.sigla}|${p.motivo}`).digest("hex");
  await q(`insert into estatais_pendencias (uf,empresa_sigla,empresa_nome,motivo,detalhe,fonte,_hash) values
    ('PI',$1,$2,$3,$4,$5,$6) on conflict (_hash) do nothing`,
    [p.sigla, p.nome_empresa, p.motivo, p.detalhe, FONTE_JUCEPI, hash]);
}

{
  const hash = crypto.createHash("sha256").update("PI|PIEMTUR|extinta_em_liquidacao_2013").digest("hex");
  await q(`insert into estatais_extintas (uf,sigla,nome,ano_extincao,destino,fonte,_hash) values
    ('PI','PIEMTUR','Empresa de Turismo do Piauí S/A',2013,
     'Situação registrada como EXTINTA no relatório oficial JUCEPI, com o próprio nome trazendo a marca "EM LIQUIDAÇÃO" desde 24/10/2013',
     $1, $2) on conflict (_hash) do nothing`, [FONTE_JUCEPI, hash]);
}

console.log("=== Piauí — pendências (AGESPISA/EMGERPI/CODIPI) ===");
console.table((await q(`select empresa_sigla, motivo from estatais_pendencias where uf='PI'`)).rows);
console.log("=== Piauí — extintas ===");
console.table((await q(`select sigla, ano_extincao from estatais_extintas where uf='PI'`)).rows);
await db.end();
