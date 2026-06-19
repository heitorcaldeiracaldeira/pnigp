// Gerador de documentação automática do sistema PNIGP.
// Introspecta: ETLs (cabeçalho dos scripts), tabelas do Neon (+contagens), rotas/páginas, catálogo de coleta
// e tarefas agendadas → docs/SISTEMA.md. Mantém a doc sempre fiel ao estado real. node scripts/gerar_documentacao.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, query_timeout: 60000 });
const q = (s, p) => db.query(s, p).then((r) => r.rows).catch(() => []);

// cabeçalho (comentário inicial) de um script
function cabecalho(arquivo) {
  try {
    const linhas = fs.readFileSync(arquivo, "utf8").split("\n");
    const out = [];
    for (const l of linhas) { if (l.trim().startsWith("//")) out.push(l.replace(/^\s*\/\/\s?/, "")); else if (out.length) break; else if (l.trim() === "") continue; else break; }
    return out.join(" ").trim();
  } catch { return ""; }
}
function walk(dir, pred, base = dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.next|\.git/.test(e.name)) walk(f, pred, base, acc); }
    else if (pred(f)) acc.push(path.relative(base, f).replace(/\\/g, "/"));
  }
  return acc;
}

async function main() {
  const hoje = new Date().toISOString().slice(0, 10);
  let md = `# PNIGP — Documentação do Sistema (gerada automaticamente)\n\n`;
  md += `> Gerada em ${hoje} por \`scripts/gerar_documentacao.mjs\`. Reflete o estado real do código e do banco. **Não editar à mão.**\n\n`;

  // 1) Tabelas do Neon + contagens
  md += `## 1. Banco de dados (Neon)\n\n| Tabela | Registros | Colunas |\n|---|---|---|\n`;
  const tabs = await q(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`);
  for (const t of tabs) {
    const n = (await q(`SELECT count(*) n FROM "${t.table_name}"`))[0]?.n ?? "?";
    const cols = (await q(`SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`, [t.table_name])).map((c) => c.column_name);
    md += `| \`${t.table_name}\` | ${Number(n).toLocaleString("pt-BR")} | ${cols.length} (${cols.slice(0, 8).join(", ")}${cols.length > 8 ? "…" : ""}) |\n`;
  }

  // 2) ETLs / scripts
  md += `\n## 2. Coleta (ETLs e scripts)\n\n| Script | O que faz |\n|---|---|\n`;
  for (const s of walk(path.join(ROOT, "scripts"), (f) => f.endsWith(".mjs")).sort()) {
    md += `| \`scripts/${s}\` | ${cabecalho(path.join(ROOT, "scripts", s)).slice(0, 180) || "—"} |\n`;
  }

  // 3) Catálogo de coleta (estado das fontes)
  md += `\n## 3. Fontes de dados (catálogo de coleta)\n\n| Fonte | Provedor | Ano + recente | Última coleta | Situação |\n|---|---|---|---|---|\n`;
  for (const f of await q(`SELECT id,label,api,max_ano,ultimo_status,devido, EXTRACT(EPOCH FROM (now()-ultima_exec))::int idade FROM etl_catalogo ORDER BY api,id`)) {
    const ago = f.idade == null ? "nunca" : f.idade < 86400 ? `há ${Math.round(f.idade / 3600)}h` : `há ${Math.round(f.idade / 86400)}d`;
    md += `| ${f.label} | ${f.api} | ${f.max_ano || "—"} | ${ago} | ${f.devido ? "pendente" : "em dia"} |\n`;
  }

  // 4) Rotas / páginas
  const rotas = walk(path.join(ROOT, "src", "app"), (f) => /(page|route)\.tsx?$/.test(f)).map((r) => "/" + r.replace(/\/?(page|route)\.tsx?$/, "").replace(/\\/g, "/")).sort();
  md += `\n## 4. Rotas e APIs (Next.js)\n\n` + rotas.map((r) => `- \`${r || "/"}\``).join("\n") + "\n";

  // 5) Automação agendada
  md += `\n## 5. Automação agendada (Agendador do Windows)\n\n`;
  md += `- **PNIGP-ETL-Diario** — \`scripts/etl_orquestrador.cmd\` — diário 03:30. Detecta novidade por fonte e coleta só o que falta (supervisionado: religa estagnação/crash).\n`;
  md += `- **PNIGP-Auditor-QA** — \`scripts/validacao_continua.cmd\` — a cada 5 min. Valida integridade e flag de registros suspeitos.\n`;
  md += `- **Backup** — \`scripts/backup_neon.mjs\` (dump local seguro) + Neon PITR nativo.\n`;

  // 6) Validação de integridade (estado)
  const qa = (await q(`SELECT status,suspeitos,alertas FROM coleta_qa WHERE id=1`))[0];
  if (qa) md += `\n## 6. Integridade (última validação)\n\n- status: **${qa.status}** · registros suspeitos (excluídos): ${qa.suspeitos} · sobrepreço unitário: ${qa.alertas}\n`;

  md += `\n---\n*Documentação viva — regenerada a cada coleta diária. Fontes oficiais: PNCP, SICONFI, SIOPS, IBGE, CGU.*\n`;

  fs.writeFileSync(path.join(ROOT, "docs", "SISTEMA.md"), md);
  console.log(`docs/SISTEMA.md gerado (${md.length} bytes, ${tabs.length} tabelas, ${rotas.length} rotas)`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
