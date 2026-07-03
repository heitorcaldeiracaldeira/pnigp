import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function ensure() {
  await query(`CREATE TABLE IF NOT EXISTS caderno_emendas_sc (
    cod_ibge TEXT NOT NULL, escopo TEXT NOT NULL, payload JSONB NOT NULL,
    atualizado timestamptz DEFAULT now(), PRIMARY KEY (cod_ibge, escopo) )`);
}

// Persistência do Caderno de Emendas do município (valores/objetos editados + demandas incluídas), por escopo.
export async function GET(req: Request) {
  try {
    await ensure();
    const { searchParams } = new URL(req.url);
    const cod = (searchParams.get("cod") || "").replace(/\D/g, "").slice(0, 7);
    const escopo = (searchParams.get("escopo") || "federal").slice(0, 20);
    const rows = await query<{ payload: unknown; atualizado: string }>(
      `SELECT payload, to_char(atualizado,'YYYY-MM-DD"T"HH24:MI') atualizado FROM caderno_emendas_sc WHERE cod_ibge=$1 AND escopo=$2`,
      [cod, escopo],
    );
    return NextResponse.json({ caderno: rows[0]?.payload ?? null, atualizado: rows[0]?.atualizado ?? null });
  } catch (e) {
    return NextResponse.json({ caderno: null, erro: String(e) }, { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    await ensure();
    const b = await req.json();
    const cod = String(b.cod || "").replace(/\D/g, "").slice(0, 7);
    const escopo = String(b.escopo || "federal").slice(0, 20);
    if (!cod) return NextResponse.json({ ok: false, erro: "cod" }, { status: 400 });
    const payload = { valores: b.valores || {}, objetos: b.objetos || {}, manuais: Array.isArray(b.manuais) ? b.manuais.slice(0, 200) : [], pedidos: b.pedidos || {} };
    await query(
      `INSERT INTO caderno_emendas_sc (cod_ibge, escopo, payload, atualizado) VALUES ($1,$2,$3,now())
       ON CONFLICT (cod_ibge, escopo) DO UPDATE SET payload=EXCLUDED.payload, atualizado=now()`,
      [cod, escopo, JSON.stringify(payload)],
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: String(e) }, { status: 500 });
  }
}
