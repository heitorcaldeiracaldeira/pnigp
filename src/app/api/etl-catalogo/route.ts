import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const fontes = await query<{
      id: string; label: string; api: string; max_ano: number | null;
      ultima_exec: string | null; ultimo_status: string | null; devido: boolean | null; msg: string | null;
      atualizado_em: string | null; idade_exec: number | null;
    }>(
      `SELECT id, label, api, max_ano, ultima_exec, ultimo_status, devido, msg, atualizado_em,
              EXTRACT(EPOCH FROM (now()-ultima_exec))::int AS idade_exec
         FROM etl_catalogo ORDER BY api, id`,
    );
    return NextResponse.json({ ts: Date.now(), fontes });
  } catch (e) {
    return NextResponse.json({ ts: Date.now(), fontes: [], erro: String(e) });
  }
}
