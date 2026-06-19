import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const fontes = await query<{
      id: string; label: string; api: string; max_ano: number | null;
      ultima_exec: string | null; ultimo_status: string | null; devido: boolean | null; solicitado: boolean | null; msg: string | null;
      atualizado_em: string | null; idade_exec: number | null;
    }>(
      `SELECT id, label, api, max_ano, ultima_exec, ultimo_status, devido,
              COALESCE(solicitado,false) AS solicitado, msg, atualizado_em,
              EXTRACT(EPOCH FROM (now()-ultima_exec))::int AS idade_exec
         FROM etl_catalogo ORDER BY api, id`,
    );
    return NextResponse.json({ ts: Date.now(), fontes });
  } catch (e) {
    return NextResponse.json({ ts: Date.now(), fontes: [], erro: String(e) });
  }
}

// Botão "Buscar novos dados" — marca a fonte como solicitada; o orquestrador (a cada 15 min) atende.
export async function POST(req: Request) {
  try {
    const { id } = await req.json();
    if (!id || typeof id !== "string") return NextResponse.json({ ok: false, erro: "id ausente" }, { status: 400 });
    const r = await query(`UPDATE etl_catalogo SET solicitado=true, msg='solicitado pela tela', atualizado_em=now() WHERE id=$1 RETURNING id`, [id]);
    return NextResponse.json({ ok: r.length > 0 });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: String(e) }, { status: 500 });
  }
}
