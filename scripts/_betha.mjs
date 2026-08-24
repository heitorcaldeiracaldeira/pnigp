// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// _betha.mjs — acesso ao Portal da Transparência Betha (transparencia.betha.cloud).
//
// AUTENTICAÇÃO: OAuth2 implicit com `access_mode=anonymous` — o token é emitido a QUALQUER UM, sem cadastro, e
// vale ~40 min. Não há credencial nossa envolvida: é a mesma chamada que o navegador faz ao abrir o portal.
// (Heitor autorizou o uso do token público em 12/ago/2026; antes disso a coleta era feita pela tela.)
//
// O DIRETÓRIO NACIONAL: `/transparencia/auth/portais` lista os 1.271 portais do país com `codigoIbge`, município,
// uf e o `hash` — que é o identificador do portal na URL (#/{hash}) e o que amarra qualquer consulta.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
const AUTH = "https://plataforma-oauth.betha.cloud/auth/oauth2/authorize" +
  "?response_type=token&client_id=91a97459-f1d8-4b29-b5fa-2e51d1692623" +
  "&redirect_uri=https://transparencia.betha.cloud/auth-callback.html" +
  "&scope=transparencia.public&bth_ignore_origin=true&access_mode=anonymous";
export const API = "https://api.transparencia.betha.cloud/transparencia";

let token = null, expiraEm = 0;

// O token vem no FRAGMENTO do Location do 303 — não há corpo para ler, e seguir o redirect perde o token.
export async function pegaToken(forcar = false) {
  if (!forcar && token && Date.now() < expiraEm) return token;
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(AUTH, { redirect: "manual", signal: AbortSignal.timeout(60000) });
      const loc = r.headers.get("location") || "";
      const m = loc.match(/access_token=([^&]+)/);
      const exp = Number((loc.match(/expires_in=(\d+)/) || [])[1] || 1800);
      if (m) { token = m[1]; expiraEm = Date.now() + (exp - 120) * 1000; return token; }
    } catch { /* tenta de novo */ }
    await new Promise((s) => setTimeout(s, 2000 * (t + 1)));
  }
  throw new Error("Betha: não consegui token anônimo");
}

// GET com renovação de token (401/403 → pega outro e repete) e backoff.
export async function api(caminho, { tentativas = 4 } = {}) {
  let ultimo;
  for (let t = 0; t < tentativas; t++) {
    try {
      const tk = await pegaToken(t > 0 && ultimo === 401);
      const r = await fetch(API + caminho, {
        headers: { Authorization: "Bearer " + tk, accept: "application/json" },
        signal: AbortSignal.timeout(120000),
      });
      if (r.status === 401 || r.status === 403) { ultimo = 401; await pegaToken(true); continue; }
      if (!r.ok) { ultimo = r.status; throw new Error("HTTP " + r.status); }
      return await r.json();
    } catch (e) { ultimo = ultimo || e.message; if (t === tentativas - 1) throw e; await new Promise((s) => setTimeout(s, 2000 * (t + 1))); }
  }
  throw new Error("Betha falhou: " + ultimo);
}

// Percorre um recurso paginado (offset/limit/total/hasNext) até o fim.
export async function paginar(caminho, { limit = 100, aoProgredir } = {}) {
  const out = [];
  let offset = 0, total = null;
  do {
    const sep = caminho.includes("?") ? "&" : "?";
    const j = await api(`${caminho}${sep}limit=${limit}&offset=${offset}`);
    total = j.total ?? (j.content || []).length;
    out.push(...(j.content || []));
    offset += limit;
    if (aoProgredir) aoProgredir(out.length, total);
    if (!j.hasNext) break;
  } while (out.length < total);
  return out;
}
