// ALICE (compras.gov.br) — login com credencial do .env.local e puxa os avisos de risco (red-flags).
// Credencial NUNCA no codigo: COMPRASGOV_LOGIN / COMPRASGOV_SENHA no .env.local (protegido pelo hook anti-segredo).
// ALICE = robo que analisa a compra e emite "avisos" com fundamentacao legal (AvisosVwDTO: tipo/texto/descricao/fundamentacao).
//   node scripts/auditoria/alice_probe.mjs            (avisos das ultimas 24h)
//   DI="18/07/2026 00:00:00" DF="23/07/2026 23:59:59" node scripts/auditoria/alice_probe.mjs
import fs from "fs";
const BASE = "https://dadosabertos.compras.gov.br";
const env = fs.readFileSync("./.env.local", "utf8");
const get = (k) => env.match(new RegExp("^" + k + "=(.+)$", "m"))?.[1]?.trim();
const login = get("COMPRASGOV_LOGIN"), senha = get("COMPRASGOV_SENHA");
if (!login || !senha) { console.error("Falta COMPRASGOV_LOGIN/COMPRASGOV_SENHA no .env.local"); process.exit(1); }

async function main() {
  // 1) login → captura token (corpo, header Authorization ou cookie — inspeciona tudo)
  const r = await fetch(`${BASE}/autenticacao/login`, {
    method: "POST", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" },
    body: JSON.stringify({ login, senha }), signal: AbortSignal.timeout(30000),
  });
  console.log("login HTTP", r.status);
  const authHdr = r.headers.get("authorization");
  const setCookie = r.headers.get("set-cookie");
  const bodyTxt = await r.text();
  let bodyJson = null; try { bodyJson = JSON.parse(bodyTxt); } catch {}
  if (r.status !== 200) { console.error("login falhou:", bodyTxt.slice(0, 400)); process.exit(1); }
  // descobre o token: header Authorization, campo token/accessToken/jwt no corpo, ou cookie
  const token = authHdr || bodyJson?.token || bodyJson?.accessToken || bodyJson?.access_token || bodyJson?.jwt || bodyJson?.id_token || null;
  console.log("token via:", authHdr ? "header Authorization" : bodyJson ? "corpo(" + Object.keys(bodyJson).join(",") + ")" : setCookie ? "cookie" : "??");
  const auth = token ? (token.startsWith("Bearer") ? token : "Bearer " + token) : null;
  const H = { "user-agent": "Mozilla/5.0", ...(auth ? { authorization: auth } : {}), ...(setCookie ? { cookie: setCookie.split(";")[0] } : {}) };

  // 2) avisos-restritos no intervalo
  const DI = process.env.DI || fmt(-1), DF = process.env.DF || fmt(0);
  const url = `${BASE}/alice/avisos-restritos?dataInicioIntervalo=${encodeURIComponent(DI)}&dataFimIntervalo=${encodeURIComponent(DF)}`;
  const ar = await fetch(url, { headers: H, signal: AbortSignal.timeout(30000) });
  console.log(`\navisos-restritos [${DI} → ${DF}] HTTP`, ar.status);
  const at = await ar.text();
  let aj = null; try { aj = JSON.parse(at); } catch {}
  if (ar.status !== 200) { console.error(at.slice(0, 600)); process.exit(1); }
  const arr = Array.isArray(aj) ? aj : aj?.resultado || aj?.content || [aj];
  console.log("registros:", arr.length);
  // agrupa por status/tipo de analise + amostra
  const porStatus = {}; for (const a of arr) porStatus[a.descricaoStatusAnalise || a.codigoStatusAnalise] = (porStatus[a.descricaoStatusAnalise || a.codigoStatusAnalise] || 0) + 1;
  console.log("por status:", JSON.stringify(porStatus));
  console.log("amostra (3):", JSON.stringify(arr.slice(0, 3), null, 1).slice(0, 1500));
}
function fmt(deltaDias) {
  // ALICE quer DD/MM/YYYY HH:MM:SS — mas Date.now nao esta disponivel em workflow; aqui e script normal, ok
  const d = new Date(Date.now() + deltaDias * 86400000);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${deltaDias < 0 ? "00:00:00" : "23:59:59"}`;
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
