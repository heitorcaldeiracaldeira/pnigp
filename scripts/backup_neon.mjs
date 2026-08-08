// Backup LÓGICO do Neon — dump de todas as tabelas em JSONL.gz local (backups/, gitignored).
// Dado sensível: NUNCA vai pro GitHub. Camada primária = PITR nativo do Neon; isto é o dump portátil.
// Mantém os últimos 7 backups. node scripts/backup_neon.mjs
import fs from "fs"; import path from "path"; import zlib from "zlib"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, query_timeout: 120000, statement_timeout: 120000 });
const q = (s, p) => db.query(s, p).then((r) => r.rows);
const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
const LOTE = 10000;

async function dumpTabela(tab, dir) {
  const file = path.join(dir, `${tab}.jsonl.gz`);
  const ws = fs.createWriteStream(file); const gz = zlib.createGzip(); gz.pipe(ws);
  // paginação KEYSET por ctid — O(n). OFFSET era O(n²): na arquivo_texto_sc (12GB/628k) a última página
  // relia 620k linhas (26s/página no pg_stat_statements). Keyset só avança: WHERE ctid > último.
  // ═══ QUEDA DE CONEXÃO NÃO PODE PERDER A TABELA ═══
  // O Neon fica atrás de um pooler e escala/suspende sozinho: numa varredura de horas a conexão CAI, e
  // isso é esperado, não excepcional. Sem retentativa, cada queda custava a tabela inteira — medido em
  // 08/ago: dezenas de tabelas perdidas com `getaddrinfo ENOTFOUND` e `ECONNRESET` no mesmo run, e o
  // backup fechou com 8,6% do tamanho do dia anterior.
  // A paginação é KEYSET (`ctid > último`), então retomar é exato: não repete nem pula linha.
  const q6 = async (sql) => {
    let ultimo;
    for (let t = 0; t < 6; t++) {
      try { return await q(sql); }
      catch (e) {
        ultimo = e;
        const transitorio = /ENOTFOUND|ECONNRESET|ETIMEDOUT|EPIPE|timeout|terminated|Connection/i.test(String(e));
        if (!transitorio) throw e;                       // erro de verdade (coluna, permissão) sobe na hora
        await new Promise((r) => setTimeout(r, 2000 * (t + 1)));
      }
    }
    throw ultimo;
  };
  let last = null, total = 0;
  for (;;) {
    const rows = await q6(`SELECT ctid::text _ct, * FROM "${tab}" ${last ? `WHERE ctid > '${last}'::tid` : ""} ORDER BY ctid LIMIT ${LOTE}`);
    if (!rows.length) break;
    for (const r of rows) { last = r._ct; delete r._ct; gz.write(JSON.stringify(r) + "\n"); }
    total += rows.length;
    if (rows.length < LOTE) break;
  }
  gz.end(); await new Promise((res) => ws.on("finish", res));
  return total;
}

async function main() {
  const baseDir = path.join(ROOT, "backups");
  const dir = path.join(baseDir, stamp);
  fs.mkdirSync(dir, { recursive: true });
  // schema (colunas de todas as tabelas)
  const schema = await q(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position`);
  fs.writeFileSync(path.join(dir, "_schema.json"), JSON.stringify(schema, null, 0));
  // ═══ SÓ TABELA-BASE: VIEW NÃO TEM ctid ═══
  // `information_schema.tables` traz VIEWs junto, e a paginação keyset é por ctid — que view não tem.
  // Resultado no log de toda noite: "! geography_columns: column ctid does not exist", repetido. Erro
  // conhecido que se repete vira ruído, e ruído é o que ensina a ignorar o log.
  const tabs = (await q(`SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`)).map((r) => r.table_name);
  // ═══ O TETO PRECISA VIVER AQUI DENTRO, NÃO NO AGENDADOR ═══
  // A tarefa tem ExecutionTimeLimit de 3h, e isso NÃO PARA o backup: o Agendador mata o `.cmd`, mas o node
  // que ele lançou fica ÓRFÃO e continua. Medido em 08/ago: a tarefa foi encerrada às 03:30 e o log seguiu
  // sendo escrito até 09:43 — seis horas depois, consumindo banco e egress durante o horário de trabalho,
  // sem ninguém saber que ainda estava rodando. É o mesmo defeito que a ETL tinha e que já foi corrigido
  // lá: limite que o Agendador aplica não é limite, porque ele não alcança os filhos.
  // Aqui o processo é um só, então parar o laço basta — e parar é seguro: o dump é por tabela, cada uma
  // fecha o seu arquivo, e as que faltaram entram como falha explícita no manifesto.
  const TETO_MIN = Number(process.env.TETO_MIN || 170);   // abaixo do PT3H da tarefa, de propósito
  const t0 = Date.now();
  let totalReg = 0; const resumo = {}; const falhas = []; let cortado = false;
  for (const t of tabs) {
    const min = (Date.now() - t0) / 60000;
    if (min > TETO_MIN) {
      cortado = true;
      const faltando = tabs.slice(tabs.indexOf(t));
      console.log(`\n⏱ TETO DE ${TETO_MIN} MIN atingido (${Math.round(min)} min) — parando com ${faltando.length} tabelas por dumpar.`);
      for (const f of faltando) { resumo[f] = "nao_dumpada"; falhas.push({ tabela: f, erro: `nao dumpada: teto de ${TETO_MIN} min` }); }
      break;
    }
    try { const n = await dumpTabela(t, dir); resumo[t] = n; totalReg += n; console.log(`  ${t}: ${n.toLocaleString("pt-BR")}`); }
    catch (e) { const m = String(e).slice(0, 60); console.log(`  ! ${t}: ${m}`); resumo[t] = "erro"; falhas.push({ tabela: t, erro: m }); }
  }
  const ok = tabs.length - falhas.length;
  fs.writeFileSync(path.join(dir, "_manifest.json"), JSON.stringify({
    ts: stamp, total_registros: totalReg, tabelas_esperadas: tabs.length, tabelas_ok: ok,
    completo: falhas.length === 0, cortado_por_tempo: cortado, falhas, tabelas: resumo,
  }, null, 2));

  // ═══ RETENÇÃO: PRIORIZA O COMPLETO, MAS NUNCA APAGA POR FALTA DE METADADO ═══
  // A intenção é boa — dos 8 backups em disco, CINCO estavam incompletos e um tinha ZERO arquivo, e a
  // rotação "últimos 7" empurrava os bons para fora guardando carcaça.
  // ⚠️ MAS A PRIMEIRA VERSÃO DESTA REGRA DESTRUIU BACKUP BOM, em 08/ago, e a lição é dura: ela tratava
  // "sem `_manifest.json` com completo:true" como "não completo" — e NENHUM backup anterior tinha esse
  // campo, porque ele acabou de ser criado. Na primeira execução ela apagou 6 pastas, incluindo os dois
  // dumps íntegros de 11 GB. Ausência de metadado NOVO não é prova de defeito: é só ausência.
  // Agora: só apaga o que PROVA estar incompleto (manifesto dizendo `completo:false` ou pasta com <5
  // arquivos). O desconhecido — backup antigo, sem manifesto — conta como bom e entra na regra dos 7.
  const dirs = fs.readdirSync(baseDir).filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d)).sort();
  const grau = (d) => {
    const arqs = (() => { try { return fs.readdirSync(path.join(baseDir, d)).length; } catch { return 0; } })();
    if (arqs < 5) return "vazio";                                   // carcaça: provado inútil
    try {
      const m = JSON.parse(fs.readFileSync(path.join(baseDir, d, "_manifest.json"), "utf8"));
      return m.completo === true ? "completo" : "incompleto";       // manifesto DIZ que faltou tabela
    } catch { return "desconhecido"; }                              // sem manifesto: NÃO é motivo para apagar
  };
  const bons = dirs.filter((d) => grau(d) !== "vazio" && grau(d) !== "incompleto");
  const manter = new Set(bons.slice(-7).concat(dirs.slice(-2)));    // 7 aproveitáveis + os 2 mais recentes
  for (const d of dirs) if (!manter.has(d)) { fs.rmSync(path.join(baseDir, d), { recursive: true, force: true }); console.log(`  (retenção) removido ${d} [${grau(d)}]`); }

  // ═══ BACKUP INCOMPLETO NÃO PODE REPORTAR SUCESSO ═══
  // A linha anterior imprimia "Backup concluído" com `tabs.length` — o número de tabelas TENTADAS, não das
  // que deram certo. Um dump que falhou em 90% delas dizia exatamente a mesma frase que um dump perfeito.
  // Medido em 08/ago: o backup da noite tinha 975 MB contra 11.322 MB do dia anterior (8,6%), dezenas de
  // tabelas perdidas com `getaddrinfo ENOTFOUND` — a conexão com o Neon caiu no meio — e a tarefa foi
  // registrada como terminada normalmente. Backup que falha em silêncio é pior que não ter backup: cria a
  // crença de que existe cópia.
  console.log(`\n${falhas.length ? "⚠ BACKUP INCOMPLETO" : "✔ backup completo"}${cortado ? " (cortado pelo teto de tempo)" : ""}: ${dir}`);
  console.log(`  ${ok}/${tabs.length} tabelas · ${totalReg.toLocaleString("pt-BR")} registros · ${Math.round((Date.now() - t0) / 60000)} min`);
  if (falhas.length) {
    console.log(`  ${falhas.length} tabela(s) FALHARAM:`);
    for (const f of falhas.slice(0, 12)) console.log(`    ${f.tabela}: ${f.erro}`);
    if (falhas.length > 12) console.log(`    … e mais ${falhas.length - 12}`);
  }
  await db.end();
  if (falhas.length) process.exit(1);   // falha ALTA: o Agendador registra e o verificador acusa
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
