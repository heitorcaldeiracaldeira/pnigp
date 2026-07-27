import "server-only";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

// Camada 1 de proteção das rotas de escrita/PII: token de admin compartilhado (env ADMIN_TOKEN).
// NÃO é login por usuário — é o gate que fecha o abuso anônimo/bot até a auth por município (fase 2).
// A leitura pública das fichas municipais NÃO passa por aqui (segue aberta).

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  if (ab.length !== bb.length) return false; // vaza só o tamanho — aceitável p/ token de admin
  return timingSafeEqual(ab, bb);
}

/** Retorna uma resposta de erro (401/503) se a requisição NÃO estiver autorizada, ou null se OK.
 *  Uso: `const negado = checkAdmin(req); if (negado) return negado;` no topo do handler. */
export function checkAdmin(req: Request): NextResponse | null {
  const configured = process.env.ADMIN_TOKEN;
  if (!configured) {
    // Fail-closed: sem segredo no servidor a escrita NÃO passa (evita inseguro-por-omissão).
    return NextResponse.json({ ok: false, erro: "auth não configurada no servidor" }, { status: 503 });
  }
  const sent = req.headers.get("x-admin-token") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!sent || !safeEq(sent, configured)) {
    return NextResponse.json({ ok: false, erro: "não autorizado" }, { status: 401 });
  }
  return null;
}
