import { NextResponse } from "next/server";
import { getInteligenciaItem } from "@/lib/queries";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") || "";
  const data = await getInteligenciaItem(q);
  return NextResponse.json(data);
}
