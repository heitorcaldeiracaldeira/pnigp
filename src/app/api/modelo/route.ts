import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { gerarDocx } from "@/lib/docx";
import { gerarBlocos, MODELOS, type ModeloTipo } from "@/lib/modelos-captacao";

export const dynamic = "force-dynamic";

// Banco de Modelos de Captação (.docx editável, pré-preenchido). /api/modelo?ente=4205407&tipo=plano-trabalho&programa=<id>
export async function GET(req: NextRequest) {
  const ente = req.nextUrl.searchParams.get("ente") || "";
  const tipo = (req.nextUrl.searchParams.get("tipo") || "plano-trabalho") as ModeloTipo;
  const idPrograma = req.nextUrl.searchParams.get("programa") || "";
  if (!ente) return new Response("informe ?ente=", { status: 400 });
  if (!MODELOS[tipo]) return new Response("tipo inválido", { status: 400 });

  const e = (await query<Record<string, unknown>>(`SELECT nome, populacao, tipo FROM entes_sc WHERE cod_ibge=$1`, [ente]).catch(() => []))[0];
  if (!e) return new Response("ente não encontrado", { status: 404 });
  const prog = idPrograma
    ? (await query<Record<string, unknown>>(`SELECT nome AS nome_programa, orgao, modalidade, dt_fim_vol AS dt_fim_prop FROM programas_transferegov WHERE id_programa=$1`, [idPrograma]).catch(() => []))[0]
    : null;

  const hoje = new Date().toLocaleDateString("pt-BR");
  const blocos = gerarBlocos(tipo, { nome: String(e.nome || "Município"), tipo: String(e.tipo || "M"), populacao: Number(e.populacao || 0) }, prog ? { nome_programa: String(prog.nome_programa || ""), orgao: String(prog.orgao || ""), modalidade: String(prog.modalidade || "") } : null, hoje);
  const buf = gerarDocx(blocos);
  const slug = String(e.nome || "municipio").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${tipo}-${slug}.docx"`,
    },
  });
}
