import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function GET() {
  const TOTAL = 296; // 295 municípios + Estado

  const compras = await safe(
    async () =>
      await query<{ ano: number; entes: number; ctr: string; valor: string }>(
        `SELECT ano, count(*)::int entes, coalesce(sum(n_contratos),0)::bigint ctr, coalesce(sum(valor_homologado),0)::numeric valor
         FROM compras_sc GROUP BY ano ORDER BY ano`,
      ),
    [],
  );
  const vazios = await safe(
    async () => Number((await query<{ n: string }>(`SELECT count(*) n FROM compras_sc_vazios`))[0]?.n ?? 0),
    0,
  );
  const contratos = await safe(
    async () =>
      await query<{ ano: number; n: string; entes: number }>(
        `SELECT ano_compra ano, count(*)::bigint n, count(distinct cod_ibge)::int entes
         FROM contratos_sc GROUP BY ano_compra ORDER BY ano_compra`,
      ),
    [],
  );
  const contratosTot = await safe(
    async () => Number((await query<{ n: string }>(`SELECT count(*) n FROM contratos_sc`))[0]?.n ?? 0),
    0,
  );
  const pcaFeitos = await safe(
    async () => Number((await query<{ n: string }>(`SELECT count(*) n FROM pca_sc_feitos`))[0]?.n ?? 0),
    0,
  );
  const pcaDados = await safe(
    async () => Number((await query<{ n: string }>(`SELECT count(*) n FROM pca_sc`))[0]?.n ?? 0),
    0,
  );
  const itens = await safe(
    async () => Number((await query<{ n: string }>(`SELECT count(*) n FROM itens_sc`))[0]?.n ?? 0),
    -1, // -1 = tabela ainda não criada
  );
  const itensFeitos = await safe(
    async () => Number((await query<{ n: string }>(`SELECT count(*) n FROM itens_sc_feitos`))[0]?.n ?? 0),
    0,
  );

  // heartbeat autoritativo do supervisor (no servidor — independe da aba estar aberta)
  const heartbeat = await safe(
    async () =>
      (
        await query<{ etapa: string; reinicios: number; msg: string; progresso: string; idade: number }>(
          `SELECT etapa, reinicios, msg, progresso::text, EXTRACT(EPOCH FROM (now()-ts))::int idade
           FROM coleta_heartbeat WHERE id=1`,
        )
      )[0] ?? null,
    null,
  );

  // selo de qualidade (validação contínua)
  const qa = await safe(
    async () =>
      (
        await query<{ status: string; suspeitos: number; alertas: number; regras: Record<string, number>; idade: number }>(
          `SELECT status, suspeitos, alertas, regras, EXTRACT(EPOCH FROM (now()-ts))::int idade FROM coleta_qa WHERE id=1`,
        )
      )[0] ?? null,
    null,
  );

  return NextResponse.json({
    qa,
    heartbeat: heartbeat
      ? { etapa: heartbeat.etapa, reinicios: heartbeat.reinicios, msg: heartbeat.msg, progresso: Number(heartbeat.progresso), idade: heartbeat.idade }
      : null,
    ts: Date.now(),
    total: TOTAL,
    vazios,
    compras: compras.map((c) => ({ ano: c.ano, entes: c.entes, ctr: Number(c.ctr), valor: Number(c.valor) })),
    contratos: contratos.map((c) => ({ ano: c.ano, n: Number(c.n), entes: c.entes })),
    contratosTot,
    pcaFeitos,
    pcaDados,
    itens,
    itensFeitos,
  });
}
