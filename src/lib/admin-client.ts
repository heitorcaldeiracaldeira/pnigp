"use client";

// Cliente do token de admin (camada 1). O gestor digita a senha 1x; fica no navegador (localStorage)
// e vai como header `x-admin-token` nas chamadas de escrita/PII. Leitura pública NÃO usa isto.
// REGRA: nunca pedir a senha no mount/GET (quebraria o acesso público) — só em ação explícita de escrita.

const KEY = "i10_admin_token";

export function getAdminToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(KEY) || "";
}

export function setAdminToken(t: string): void {
  if (typeof window === "undefined") return;
  const v = (t || "").trim();
  if (v) window.localStorage.setItem(KEY, v);
  else window.localStorage.removeItem(KEY);
}

/** Garante um token salvo; se faltar, pede via prompt (só chamar em AÇÃO explícita). "" se cancelar. */
export function ensureAdminToken(): string {
  let t = getAdminToken();
  if (!t && typeof window !== "undefined") {
    t = (window.prompt("Senha de administrador (para gravar/editar dados de gestão):") || "").trim();
    if (t) setAdminToken(t);
  }
  return t;
}

/** Headers p/ chamadas de escrita/PII: content-type + x-admin-token (se houver token salvo). */
export function adminHeaders(extra?: Record<string, string>): Record<string, string> {
  const t = getAdminToken();
  return { "content-type": "application/json", ...(t ? { "x-admin-token": t } : {}), ...extra };
}
