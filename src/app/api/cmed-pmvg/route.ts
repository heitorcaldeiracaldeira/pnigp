// Busca no catálogo CMED/PMVG (preço-teto legal de medicamentos) — por substância ou produto.
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (q.length < 3) return NextResponse.json([]);
  const rows = await query(
    `SELECT substancia, produto, apresentacao, laboratorio, pmvg_17, pmvg_0, restricao_hospitalar
     FROM cmed_pmvg WHERE pmvg_17 IS NOT NULL AND (substancia ILIKE $1 OR produto ILIKE $1)
     ORDER BY substancia, pmvg_17 LIMIT 40`,
    [`%${q}%`],
  ).catch(() => []);
  return NextResponse.json(rows);
}
