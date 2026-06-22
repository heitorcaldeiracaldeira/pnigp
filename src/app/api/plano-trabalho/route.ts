import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { gerarDocx, type Bloco } from "@/lib/docx";

export const dynamic = "force-dynamic";

// Gera o Plano de Trabalho (.docx) pré-preenchido para um município + programa de captação.
// /api/plano-trabalho?ente=4205407&programa=<id_programa>
export async function GET(req: NextRequest) {
  const ente = req.nextUrl.searchParams.get("ente") || "";
  const idPrograma = req.nextUrl.searchParams.get("programa") || "";
  if (!ente) return new Response("informe ?ente=", { status: 400 });

  const e = (await query<Record<string, unknown>>(`SELECT nome, populacao, tipo FROM entes_sc WHERE cod_ibge=$1`, [ente]).catch(() => []))[0];
  if (!e) return new Response("ente não encontrado", { status: 404 });
  const prog = idPrograma
    ? (await query<Record<string, unknown>>(`SELECT nome_programa, orgao, modalidade, dt_fim_prop FROM radar_captacao_sc WHERE cod_ibge=$1 AND id_programa=$2`, [ente, idPrograma]).catch(() => []))[0]
    : null;

  const nome = String(e.nome || "Município");
  const pop = Number(e.populacao || 0).toLocaleString("pt-BR");
  const nomePrograma = prog ? String(prog.nome_programa) : "_____________________________________";
  const orgao = prog ? String(prog.orgao) : "_____________________________________";
  const hoje = new Date().toLocaleDateString("pt-BR");

  const L = (texto: string): Bloco => ({ tipo: "label", texto });
  const P = (texto: string): Bloco => ({ tipo: "p", texto });
  const H2 = (texto: string): Bloco => ({ tipo: "h2", texto });

  const blocos: Bloco[] = [
    { tipo: "h1", texto: "PLANO DE TRABALHO" },
    P(`Proposta de convênio / transferência voluntária — ${nomePrograma}`),

    H2("1. Dados do Proponente"),
    L("Ente proponente:"), P(`${nome} — ${e.tipo === "E" ? "Governo do Estado" : "Prefeitura Municipal"} / SC`),
    L("CNPJ:"), P("____________________  (preencher)"),
    L("População (IBGE):"), P(pop),
    L("Responsável (gestor) / cargo:"), P("____________________  (preencher)"),
    L("Endereço / contato:"), P("____________________  (preencher)"),

    H2("2. Dados do Programa / Concedente"),
    L("Programa:"), P(nomePrograma),
    L("Órgão concedente:"), P(orgao),
    L("Modalidade:"), P(prog ? String(prog.modalidade || "—") : "—"),

    H2("3. Objeto"),
    P(`Descrição resumida do objeto a ser executado com os recursos do programa "${nomePrograma}" no município de ${nome}. (Revisar e detalhar conforme a necessidade local.)`),

    H2("4. Justificativa"),
    P(`O município de ${nome} apresenta demanda que se alinha ao objeto do programa. Descrever aqui o diagnóstico que justifica a captação (indicador/gargalo, público atendido, impacto esperado). (Pré-preenchido pelo PNIGP — revisar com os dados do diagnóstico.)`),

    H2("5. Metas e Etapas"),
    L("Meta 1:"), P("Descrição · indicador · quantidade · prazo  (preencher)"),
    L("Meta 2:"), P("Descrição · indicador · quantidade · prazo  (preencher)"),

    H2("6. Cronograma Físico-Financeiro"),
    P("Etapa | Início | Término | Valor (R$)  —  (preencher conforme as metas)"),

    H2("7. Plano de Aplicação dos Recursos"),
    L("Valor do repasse (concedente):"), P("R$ ____________  (preencher)"),
    L("Contrapartida do proponente:"), P("R$ ____________  (preencher)"),
    L("Valor global:"), P("R$ ____________"),

    H2("8. Declarações"),
    P("Declaramos a regularidade do ente e o compromisso com a contrapartida e a prestação de contas, nos termos da legislação aplicável."),

    { tipo: "p", texto: "" },
    P(`${nome}/SC, ${hoje}.`),
    P("_______________________________________"),
    P("Responsável pelo ente proponente"),
    { tipo: "p", texto: "" },
    P("Documento pré-preenchido automaticamente pelo PNIGP (Instituto I10) a partir de dados oficiais. Revise antes de submeter no Transferegov."),
  ];

  const buf = gerarDocx(blocos);
  const arquivo = `plano-trabalho-${nome.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.docx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${arquivo}"`,
    },
  });
}
