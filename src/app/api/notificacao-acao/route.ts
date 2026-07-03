import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET → alertas ativos (deltas do log ainda não resolvidos) com título/secretaria da regra.
export async function GET(req: Request) {
  try {
    const cod = (new URL(req.url).searchParams.get("cod") || "").replace(/\D/g, "").slice(0, 7);
    const rows = await query(
      `SELECT l.id, l.alerta_id, l.severidade, l.chave_delta,
        to_char(l.enviado_em,'DD/MM/YYYY') detectado, r.titulo, r.secretaria, r.natureza, r.solucao_i10,
        (l.severidade='critico' AND l.enviado_em < now() - interval '30 days') escalonado
       FROM notificacao_log l LEFT JOIN notificacao_regras r ON r.alerta_id=l.alerta_id
       WHERE l.cod_ibge=$1 AND l.resolvido_em IS NULL
       ORDER BY (l.severidade='critico') DESC, l.enviado_em ASC LIMIT 100`, [cod]);
    return NextResponse.json({ alertas: rows });
  } catch (e) {
    return NextResponse.json({ alertas: [], erro: String(e) }, { status: 200 });
  }
}

// POST {cod, resolver:id, tipo_impacto?, valor?} → marca resolvido + (opcional) registra impacto (ROI).
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const cod = String(b.cod || "").replace(/\D/g, "").slice(0, 7);
    const id = Number(b.resolver);
    if (!cod || !id) return NextResponse.json({ ok: false, erro: "params" }, { status: 400 });

    const done = await query<{ alerta_id: string }>(
      `UPDATE notificacao_log SET resolvido_em=now() WHERE id=$1 AND cod_ibge=$2 AND resolvido_em IS NULL RETURNING alerta_id`, [id, cod]);
    if (!done.length) return NextResponse.json({ ok: false, erro: "não encontrado" }, { status: 404 });

    const tipo = ["resolvido", "recurso_destravado", "recurso_captado"].includes(String(b.tipo_impacto)) ? String(b.tipo_impacto) : "resolvido";
    const valor = Number(b.valor) > 0 ? Number(b.valor) : null;
    await query(
      `INSERT INTO notificacao_impacto (cod_ibge, alerta_id, tipo_impacto, valor, descricao) VALUES ($1,$2,$3,$4,$5)`,
      [cod, done[0].alerta_id, tipo, valor, String(b.descricao || "").slice(0, 200) || null]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: String(e) }, { status: 500 });
  }
}
