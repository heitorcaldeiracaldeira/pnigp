import "server-only";
import { Pool } from "pg";

// Reuse a single pool across hot-reloads in dev to avoid exhausting Neon connections.
const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForPg.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    // Endpoint é o -pooler (pgBouncer, multiplexa) → subir a concorrência por instância é seguro
    // e dá vazão às ~150 queries que a página /real/[codigo] dispara no cold-start (menos filas de acquire).
    max: 8,
  });

// 🚨 03/set/2026: medido em produção — o pooler do Neon às vezes entrega uma conexão nova com
// `search_path` vazado de outra sessão (veio `pg_catalog` puro), e toda tabela sem prefixo de schema
// (a imensa maioria daqui) para de resolver: "relation municipios does not exist" com a tabela existindo,
// e um CREATE TABLE cai em "permission denied for schema pg_catalog" por tentar criar ali dentro. Fixar
// uma vez por CONEXÃO nova (não por query — `max: 8` faz poucas conexões físicas) é barato e resolve na raiz.
pool.on("connect", (client) => {
  client.query("SET search_path TO public").catch(() => {});
});

if (process.env.NODE_ENV !== "production") globalForPg.pgPool = pool;

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  try {
    const res = await pool.query(text, params);
    return res.rows as T[];
  } catch (err) {
    // NÃO engolir em silêncio: logar antes de propagar. Os `.catch(() => [])` nos chamadores
    // continuam devolvendo o fallback, mas agora a falha fica VISÍVEL no log (Vercel/servidor).
    // Sem isso, uma query que falha vira "dado vazio" exibido como verdade — bug que já zerou KPI aqui.
    const sql = text.replace(/\s+/g, " ").trim().slice(0, 200);
    console.error(`[db.query] ${(err as Error)?.message ?? err} | SQL: ${sql}${params?.length ? ` | params=${params.length}` : ""}`);
    throw err;
  }
}
