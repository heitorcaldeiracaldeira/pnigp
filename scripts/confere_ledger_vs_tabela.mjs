// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// confere_ledger_vs_tabela.mjs — acha livros-razão que MENTEM: municípios com veredito improdutivo
// (vazio / erro / sem_*) e que TÊM linhas gravadas na tabela do coletor.
//
// ⭐ POR QUE EXISTE: em 18/ago/2026 o ledger do publicsoft dizia `vazio` para 39 municípios que tinham
// 22.085 linhas no banco — uma re-passada tinha sobrescrito o `ok` verdadeiro
// ([[pnigp-repassada-nao-pode-rebaixar-veredito]]). O upsert vulnerável está em ~68 coletores; antes de
// mexer em todos, medir ONDE o defeito está vivo.
//
// Convenção que torna isso automático: `folha_{X}_coleta` ↔ `folha_servidores_{X}`.
//
// Uso: node scripts/confere_ledger_vs_tabela.mjs        ·  CORRIGE=1 repara os vereditos encontrados
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const CORRIGE = process.env.CORRIGE === "1";

const pares = (await q(`
  select l.table_name ledger, 'folha_servidores_' || substring(l.table_name from 'folha_(.*)_coleta') tabela
    from information_schema.tables l
   where l.table_schema = 'public' and l.table_name like 'folha\\_%\\_coleta'
     and exists (select 1 from information_schema.tables t
                  where t.table_schema = 'public'
                    and t.table_name = 'folha_servidores_' || substring(l.table_name from 'folha_(.*)_coleta'))
   order by 1`)).rows;

console.log(`── ledger × tabela · ${pares.length} coletores com par identificável ──────────────`);

let totalMun = 0, totalLinhas = 0;
const suspeitos = [];
for (const p of pares) {
  // o ledger precisa ter cod_ibge e situacao; alguns antigos podem não ter
  const cols = (await q(`select column_name from information_schema.columns
    where table_schema='public' and table_name=$1`, [p.ledger])).rows.map((r) => r.column_name);
  if (!cols.includes("cod_ibge") || !cols.includes("situacao")) continue;
  const temLinhas = cols.includes("linhas");

  // 🚨 GUARDA 1 — o ledger tem de ser 1:1 por município. O do elotech tem uma linha por ENTIDADE do portal,
  //    e ali `espelho` marca a entidade duplicada, não o município: o município tem dado legítimo ao lado
  //    (Umuarama: 3.370 servidores espelhados contra 25.777 linhas na view). Juntar por cod_ibge num ledger
  //    1:N acusa como "mentira" o que é um veredito CERTO sobre outra coisa.
  const dup = (await q(`select count(*)::int linhas, count(distinct cod_ibge)::int muns from ${p.ledger}`)).rows[0];
  if (dup.linhas !== dup.muns) {
    console.log(`  ↷ ${p.ledger.padEnd(34)} ledger 1:N (${dup.linhas} linhas / ${dup.muns} municípios) — fora do escopo`);
    continue;
  }

  let r;
  try {
    // 🚨 GUARDA 2 — só vereditos que significam "não veio nada". `espelho`, `lista_sem_valor`, `sem_valor` e
    //    `duplicata` são JULGAMENTOS deliberados sobre o dado; "consertá-los" ressuscitaria fantasma ou
    //    daria por resolvida uma folha sem salário ([[pnigp-lista-sem-valor-nao-e-folha]]).
    r = (await q(`
      select count(*)::int municipios, coalesce(sum(t.n),0)::int linhas,
             string_agg(distinct c.situacao, ', ') vereditos
        from ${p.ledger} c
        join (select cod_ibge, count(*)::int n from ${p.tabela} group by 1) t on t.cod_ibge = c.cod_ibge
       where t.n > 0
         and c.situacao ~* '^(vazio|erro|falha|sem_host|sem_tela|sem_rota|sem_consulta|sem_filtro|sem_publicacao|sem_exportacao|geracao_antiga)'
         and c.situacao !~* 'espelho|sem_valor|duplicat|homonim|camara'`)).rows[0];
  } catch (e) { console.log(`  ⚠️ ${p.ledger}: ${String(e.message).slice(0, 60)}`); continue; }

  if (!r || !r.municipios) continue;
  suspeitos.push({ ...p, ...r, temLinhas });
  totalMun += r.municipios;
  totalLinhas += r.linhas;
  console.log(`  🚨 ${p.ledger.padEnd(34)} ${String(r.municipios).padStart(4)} mun · ` +
    `${String(r.linhas).padStart(7)} linhas · vereditos: ${(r.vereditos || "").slice(0, 60)}`);
}

console.log(`\n  ${suspeitos.length} coletores afetados · ${totalMun} municípios · ` +
  `${totalLinhas.toLocaleString("pt-BR")} linhas escondidas atrás de veredito improdutivo`);

if (CORRIGE && suspeitos.length) {
  console.log("\n── corrigindo ────────────────────────────────────────────────────────────────");
  for (const s of suspeitos) {
    // ⚠️ O veredito vira `ok_historico` — NÃO `ok`. A passada mais recente realmente falhou; o que se
    //    corrige é a AFIRMAÇÃO de que não há dado, não o fato de a última tentativa ter falhado.
    const set = s.temLinhas
      ? `situacao = 'ok_historico', linhas = t.n, detalhe = coalesce(c.detalhe,'') || ' | reparado: ledger dizia ' || c.situacao || ' com dado na tabela'`
      : `situacao = 'ok_historico', detalhe = coalesce(c.detalhe,'') || ' | reparado: ledger dizia ' || c.situacao || ' com dado na tabela'`;
    const r = await q(`update ${s.ledger} c set ${set}
      from (select cod_ibge, count(*)::int n from ${s.tabela} group by 1) t
      where t.cod_ibge = c.cod_ibge and t.n > 0
        and c.situacao ~* '^(vazio|erro|falha|sem_host|sem_tela|sem_rota|sem_consulta|sem_filtro|sem_publicacao|sem_exportacao|geracao_antiga)'
        and c.situacao !~* 'espelho|sem_valor|duplicat|homonim|camara'`);
    console.log(`  ✔ ${s.ledger.padEnd(34)} ${r.rowCount} vereditos corrigidos`);
  }
}
await db.end();
