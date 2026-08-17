// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// audita_entidade_declarada.mjs — procura CONTAMINAÇÃO em todas as folhas: município cuja ENTIDADE declarada pela
// fonte não é a dele.
//
// POR QUÊ: varredura de host/porta/subdomínio aceita "host que responde" como prova, e o DNS curinga do fornecedor
// faz `saojoaopr.equiplano.com.br:7072` servir a folha de VERÊ. No PR isso gravou a mesma folha em 10 municípios
// diferentes, todos com o livro-razão em `ok` ([[pnigp-varredura-porta-exige-entidade]]).
//
// Só audita as tabelas que TÊM coluna de entidade declarada (entidade / entidade_nome / unidade_gestora / orgao) —
// as demais (govbr, sinsoft, scpi, megasoft, nucleogov) não trazem o nome da entidade e precisam de outra prova.
//
// Uso: node scripts/audita_entidade_declarada.mjs            (só relata)
//      APAGAR=1 node scripts/audita_entidade_declarada.mjs   (apaga as linhas do município errado)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const so = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const COLS = ["entidade_nome", "entidade", "unidade_gestora", "orgao"];
// entidades com nome genérico não provam nem desmentem nada — não acusar
const GENERICO = /^(consolidad|prefeitura|municipio|camara|fundo|instituto|autarquia|geral|todos|matriz|1|2|3)/i;

// ⭐ A régua tem de ser ESPECÍFICA, senão vira ruído: nome de entidade em CÓDIGO ("98H9AD"), autarquia própria
// ("DEMLURB", "EMCASA" em Juiz de Fora) ou fundo de previdência não provam nada. O sinal forte é a entidade citar
// o nome de OUTRO MUNICÍPIO — foi assim que Verê apareceu dentro de Campo do Tenente.
const municipios = (await q(`select nome from municipios_br where length(nome) >= 6`)).rows
  .map((r) => ({ nome: r.nome, s: so(r.nome) }));
// 🚨 E ainda assim precisa de ÂNCORA: "CASA DE PASSAGEM" casa com o município Passagem/PB e "ESCOLA SÃO FRANCISCO"
// com São Francisco — dois falsos positivos na 1ª rodada. Só acusa quando o nome do outro município vem DEPOIS de
// um rótulo de ente ("MUNICIPIO DE", "PREFEITURA MUNICIPAL DE", "CAMARA DE"…), que é como a fonte declara a
// entidade de verdade.
const citaOutro = (ents, meu) => {
  const e = so(ents);
  const ancorado = [...e.matchAll(/(?:municipiode|prefeituramunicipalde|prefeiturade|camaramunicipalde|camarade|fundomunicipalde|institutodeprevidenciade)([a-z0-9]{6,})/g)]
    .map((m) => m[1]);
  for (const trecho of ancorado) {
    const m = municipios.find((x) => x.s.length >= 8 && x.s !== meu && trecho.startsWith(x.s));
    if (m) return m.nome;
  }
  return null;
};

const tabs = (await q(`select table_name t from information_schema.tables
  where table_schema='public' and table_name like 'folha_servidores_%' order by 1`)).rows.map((r) => r.t);

let totalSusp = 0;
for (const t of tabs) {
  const cols = (await q(`select column_name c from information_schema.columns where table_name=$1`, [t])).rows.map((r) => r.c);
  if (!cols.includes("cod_ibge") || !cols.includes("municipio")) continue;
  const ent = COLS.find((c) => cols.includes(c));
  if (!ent) { console.log(`— ${t.replace("folha_servidores_", "").padEnd(12)} sem coluna de entidade declarada`); continue; }

  const temUf = cols.includes("uf");
  const r = (await q(`select municipio, ${temUf ? "uf" : "null::text uf"}, cod_ibge,
    string_agg(distinct ${ent}, ' | ') ents, count(*) n
    from ${t} where ${ent} is not null group by 1,2,3`)).rows;
  const ruins = [];
  for (const x of r) {
    const m = so(x.municipio); if (m.length < 5) continue;
    const e = so(x.ents);
    if (!e || GENERICO.test(String(x.ents).trim())) continue;
    if (e.includes(m.slice(0, Math.min(m.length, 12)))) continue;   // a entidade cita o próprio município: ok
    const outro = citaOutro(x.ents, m);
    if (!outro) continue;                                            // nome em código/sigla: não acusa
    ruins.push({ ...x, outro });
  }
  totalSusp += ruins.length;
  console.log(`${ruins.length ? "🚨" : "✅"} ${t.replace("folha_servidores_", "").padEnd(12)} ${String(r.length).padStart(4)} municípios · ${ruins.length} suspeitos`);
  for (const x of ruins.slice(0, 15)) console.log(`     ✖ ${String(x.uf || "").padEnd(8)} ${x.municipio.padEnd(26)} ${String(x.n).padStart(6)} linhas · cita "${x.outro}" · ${String(x.ents).slice(0, 45)}`);
  if (process.env.APAGAR === "1") {
    for (const x of ruins) {
      const d = await q(`delete from ${t} where cod_ibge=$1`, [x.cod_ibge]);
      console.log(`       apagado ${x.municipio}: ${d.rowCount} linhas`);
    }
  }
}
console.log(`\n${totalSusp} municípios suspeitos no total${process.env.APAGAR === "1" ? " (apagados)" : " — rode com APAGAR=1 depois de conferir"}`);
await db.end();
