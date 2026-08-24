// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// audita_folha_geral.mjs — duas provas baratas que já pegaram contaminação e lixo em produção:
//   1. HOST/SLUG servindo MAIS DE UM município → homônimo (o host sai do nome: Pitangueiras/SP e /PR no mesmo)
//      ver [[pnigp-smarapd-homonimo-e-linhas-sem-nome]]
//   2. LINHAS SEM NOME → não é folha nominal; costuma ser resíduo de rodada antiga que o `_hash` não sobrescreveu
//   3. CONTAGEM IDÊNTICA entre municípios diferentes na mesma competência → assinatura de contaminação
//      ver [[pnigp-varredura-porta-exige-entidade]]
// Só relata. Limpeza é decisão caso a caso.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const tabs = (await q(`select table_name t from information_schema.tables
  where table_schema='public' and table_name like 'folha_servidores_%' order by 1`)).rows.map((r) => r.t);

const achados = { host: [], semNome: [], gemeas: [] };
for (const t of tabs) {
  const cols = (await q(`select column_name c from information_schema.columns where table_name=$1`, [t])).rows.map((r) => r.c);
  if (!cols.includes("cod_ibge")) continue;
  const nome = t.replace("folha_servidores_", "");

  // 1) host/slug compartilhado
  const chave = ["host", "slug", "base_url", "url"].find((c) => cols.includes(c));
  if (chave) {
    const r = (await q(`select ${chave} k, count(distinct cod_ibge) n,
      string_agg(distinct coalesce(municipio,'?')${cols.includes("uf") ? " || '/' || coalesce(uf,'?')" : ""}, ', ') muns, count(*) linhas
      from ${t} where ${chave} is not null group by 1 having count(distinct cod_ibge) > 1 order by 4 desc limit 10`)).rows;
    for (const x of r) achados.host.push({ tabela: nome, chave, ...x });
  }

  // 2) linhas sem nome
  if (cols.includes("nome")) {
    const r = (await q(`select count(*) filter (where nome is null or btrim(nome)='') sem, count(*) tot from ${t}`)).rows[0];
    if (+r.sem > 0) achados.semNome.push({ tabela: nome, sem: +r.sem, tot: +r.tot, pct: Math.round(100 * r.sem / r.tot) });
  }

  // 3) contagens idênticas por competência + NOMES IGUAIS (a contagem sozinha dá muito falso positivo:
  //    dois municípios pequenos podem ter 250 servidores cada. A prova é a interseção dos NOMES ser total.)
  const comp = ["competencia", "exercicio", "referencia"].find((c) => cols.includes(c));
  if (comp && cols.includes("municipio") && cols.includes("nome")) {
    const r = (await q(`with c as (
        select municipio, ${comp} comp, count(*) n from ${t} group by 1,2 having count(*) > 5)
      select comp, n, count(*) municipios, string_agg(municipio, '¦') muns
        from c group by 1,2 having count(*) > 1 order by 2 desc limit 60`)).rows;
    for (const x of r) {
      const [a, b] = String(x.muns).split("¦");
      if (!b) continue;
      const ov = (await q(`select count(*) filter (where m=3) ambos, count(*) total from (
        select nome, sum(distinct case when municipio=$1 then 1 when municipio=$2 then 2 end) m
          from ${t} where municipio in ($1,$2) and nome is not null group by 1) x`, [a, b])).rows[0];
      const pct = Math.round(100 * ov.ambos / Math.max(1, ov.total));
      if (pct >= 80) achados.gemeas.push({ tabela: nome, ...x, pct });
    }
  }
}

console.log("═══ 1. HOST/SLUG servindo mais de um município (homônimo?) ═══");
for (const x of achados.host) console.log(`  🚨 ${x.tabela.padEnd(12)} ${String(x.k).slice(0, 42).padEnd(44)} ${x.n} mun · ${x.linhas} linhas · ${String(x.muns).slice(0, 60)}`);
if (!achados.host.length) console.log("  ✅ nenhum");

console.log("\n═══ 2. LINHAS SEM NOME (não é folha nominal) ═══");
for (const x of achados.semNome) console.log(`  ${x.pct > 40 ? "🚨" : "⚠️ "} ${x.tabela.padEnd(12)} ${String(x.sem).padStart(7)} de ${String(x.tot).padStart(8)} (${x.pct}%)`);
if (!achados.semNome.length) console.log("  ✅ nenhuma");

console.log("\n═══ 3. CONTAGENS IDÊNTICAS entre municípios na mesma competência ═══");
for (const x of achados.gemeas) console.log(`  🚨 ${x.tabela.padEnd(12)} ${x.comp} · ${x.n} linhas · ${x.pct}% dos NOMES coincidem: ${String(x.muns).replace("¦", " × ").slice(0, 70)}`);
if (!achados.gemeas.length) console.log("  ✅ nenhuma");
await db.end();
