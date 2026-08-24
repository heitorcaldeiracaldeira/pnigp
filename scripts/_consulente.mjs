// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// _consulente.mjs — identidade do SOLICITANTE para portais que exigem identificação antes de liberar dado público.
//
// ⚖️ POR QUE existe: alguns portais (Campinas, Borebi…) só mostram a folha depois de nome+CPF+nascimento de quem
// consulta. Identificar-se é legítimo — o Bento autorizou o uso dos dados DELE em 18/ago/2026, para qualquer
// portal do Brasil. ⛔ O que segue vetado, sempre: usar identidade de TERCEIRO, que seria falsidade.
//
// 🔒 Os dados moram em `.env.local` (coberto por `.env*` no .gitignore, com hook anti-segredo no commit) —
// NUNCA em script, log ou banco. Este módulo lê e devolve; quem usa não imprime.
// ⚠️ Cada consulta identificada fica no log do município, associada ao CPF.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export function consulente() {
  let env = {};
  try {
    const txt = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
    for (const l of txt.split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
  } catch { /* sem arquivo: cai no ambiente */ }
  const nome = process.env.CONSULENTE_NOME || env.CONSULENTE_NOME;
  const cpf = process.env.CONSULENTE_CPF || env.CONSULENTE_CPF;
  const nasc = process.env.CONSULENTE_NASC || env.CONSULENTE_NASC;
  // ⚠️ e-mail é OPCIONAL: Campinas pede nome+CPF+nascimento, o gate LGPD do GeneXus pede nome+CPF+e-mail.
  //    Quem precisa dele confere `email` e cai no rótulo `gated` se estiver faltando — nunca inventa endereço.
  const email = process.env.CONSULENTE_EMAIL || env.CONSULENTE_EMAIL || null;
  if (!nome || !cpf || !nasc) throw new Error("identidade do consulente ausente — ver CONSULENTE_* em .env.local");
  return { nome, cpf, nasc, email, cpfNumeros: cpf.replace(/\D/g, "") };
}
