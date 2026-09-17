// CONEXÃO PADRÃO DOS SCRIPTS — um lugar só para o que todo extrator/coletor precisava repetir (e repetia errado).
//
//   import { abrePool, consulta } from "./db.mjs";
//   const db = abrePool({ max: 3 });
//   const { rows } = await consulta(db, `select …`, [params]);
//
// ═══ POR QUE EXISTE (17/set/2026) ═══
// Três shards da fila da disputa morreram às 05:38 com `relation "arquivo_texto_sc" does not exist` — a tabela
// existia. Mesma morte que folha_auditoria (12/set) e folha_camaras (17/set). Causa medida: o pooler do Neon
// (PgBouncer em modo TRANSAÇÃO) não reseta a sessão entre clientes — 40 transações curtas já passearam por
// backends com search_path diferentes — e um `SET search_path` não "gruda": a transação seguinte pode cair em
// outro backend, sujo. O Neon recusa `options=-c search_path=public` no pooler e manda usar conexão SEM pool.
// Então: (1) script local usa o endpoint DIRETO (DATABASE_URL do .env.local já aponta para ele; o pooler ficou em
// DATABASE_URL_POOLER para a Vercel); (2) fixa `search_path` em toda conexão nova, de qualquer jeito; (3) a
// consulta reexecuta quando o erro é transitório — inclusive 42P01 "relation does not exist", que num pooler é
// backend sujo e numa sessão direta simplesmente não acontece.
// 504 scripts abrem pool próprio; migram para cá quando forem tocados. Scripts novos nascem aqui.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export function urlDoBanco({ pooler = false } = {}) {
  const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const pega = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
  const u = pooler ? (pega("DATABASE_URL_POOLER") || pega("DATABASE_URL")) : (process.env.DATABASE_URL || pega("DATABASE_URL"));
  if (!u) throw new Error("DATABASE_URL não encontrada em .env.local");
  return u;
}

export function abrePool({ max = 3, statementTimeoutMs = 590000, pooler = false } = {}) {
  const db = new pg.Pool({ connectionString: urlDoBanco({ pooler }), ssl: { rejectUnauthorized: false }, max, statement_timeout: statementTimeoutMs });
  db.on("connect", (client) => { client.query("SET search_path TO public").catch(() => {}); });
  db.on("error", () => {});   // conexão ociosa que o Neon derruba não pode matar o processo
  return db;
}

// Erros que valem nova tentativa: rede/pooler (conexão caiu, DNS, timeout) e o backend sujo do pooler (42P01).
// Erros de DADO (PK duplicada, coluna inexistente, tipo errado) falham na hora — retry cego escondeu por horas
// uma colisão de PK no extrai_ecustomize.
const TRANSITORIO = /Connection terminated|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|timeout|terminating connection|socket hang up|server closed the connection|Client has encountered a connection error/i;
// 17/set 14h: um shard morreu com ENOTFOUND (DNS da máquina caiu por mais de 30 s). Queda de rede dura minutos, não
// segundos: 8 tentativas com espera crescente (3 s … 24 s ≈ 2 min) cobrem o soluço sem esconder falha de verdade.
export async function consulta(db, sql, params, { tentativas = 8 } = {}) {
  let ultimo;
  for (let t = 0; t < tentativas; t++) {
    try { return await db.query(sql, params); }
    catch (e) {
      ultimo = e;
      const sujo = e.code === "42P01";
      if (!sujo && !TRANSITORIO.test(e.message || "")) throw e;
      await new Promise((r) => setTimeout(r, 3000 * (t + 1)));
    }
  }
  throw ultimo;
}
