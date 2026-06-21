import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function ensure() {
  await query(`CREATE TABLE IF NOT EXISTS serie_anotacao (
    id SERIAL PRIMARY KEY, escopo TEXT NOT NULL, cod_ibge TEXT NOT NULL, ano INTEGER NOT NULL,
    texto TEXT NOT NULL, criado timestamptz DEFAULT now() )`);
}

// Memória institucional local: o gestor registra o que aconteceu de verdade (enriquece a base).
export async function GET(req: Request) {
  try {
    await ensure();
    const { searchParams } = new URL(req.url);
    const escopo = searchParams.get("escopo") || "";
    const cod = searchParams.get("cod") || "";
    const anotacoes = await query<{ ano: number; texto: string }>(
      `SELECT ano, texto FROM serie_anotacao WHERE escopo=$1 AND cod_ibge=$2 ORDER BY ano, id`,
      [escopo, cod],
    );
    return NextResponse.json({ anotacoes });
  } catch (e) {
    return NextResponse.json({ anotacoes: [], erro: String(e) }, { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    await ensure();
    const b = await req.json();
    const escopo = String(b.escopo || "").slice(0, 40);
    const cod = String(b.cod || "").replace(/\D/g, "").slice(0, 7);
    const ano = Number(b.ano);
    const texto = String(b.texto || "").trim().slice(0, 400);
    if (!escopo || !cod || !ano || !texto) return NextResponse.json({ ok: false, erro: "dados incompletos" }, { status: 400 });
    await query(`INSERT INTO serie_anotacao (escopo, cod_ibge, ano, texto) VALUES ($1,$2,$3,$4)`, [escopo, cod, ano, texto]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: String(e) }, { status: 500 });
  }
}
