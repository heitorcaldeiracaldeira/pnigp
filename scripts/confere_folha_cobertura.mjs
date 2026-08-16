// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// confere_folha_cobertura.mjs — PROVA REAL da folha coletada: o que a gente tem por município contra o gabarito
// da RAIS (vínculos municipais ativos em 31/12).
//
// POR QUÊ: coletar "a folha do município" é fácil de fazer pela metade — o portal devolve só a prefeitura e ficam
// de fora fundos, autarquias e câmara; ou a API pagina de 20 em 20 e grava só a primeira página. Nenhum desses
// defeitos aparece como erro: o coletor termina com 'ok'. A única forma de enxergar é comparar com um denominador
// externo. A RAIS não é a verdade absoluta (regime, terceirizados e data de referência divergem), mas uma razão
// de 0,1 ou de 3,0 não é divergência metodológica — é defeito de coleta.
//
// Uso: node scripts/confere_folha_cobertura.mjs [--min 0.5] [--max 1.6]
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const MIN = arg("--min", 0.5), MAX = arg("--max", 1.6);

// 🚨 lista FIXA de fontes envelhece: quando tenosoft e equiplano entraram, o relatório passou a ignorá-los sem
// avisar. Descobrir as tabelas e a coluna de competência direto do catálogo do banco.
const COMP_CANDIDATAS = ["competencia", "referencia", "anomes", "exercicio", "mes_referencia"];
const FONTES = {};
for (const r of (await q(`select table_name t from information_schema.tables
  where table_schema='public' and table_name like 'folha_servidores_%' order by 1`)).rows) {
  const f = r.t.replace("folha_servidores_", "");
  const cols = (await q(`select column_name c from information_schema.columns where table_name=$1`, [r.t])).rows.map((x) => x.c);
  if (!cols.includes("cod_ibge")) continue;   // pe/ma são resolvidos por nome, ficam de fora daqui
  const comp = COMP_CANDIDATAS.find((c) => cols.includes(c));
  if (comp) FONTES[f] = comp;
}
console.log(`fontes no relatório: ${Object.keys(FONTES).length} (${Object.keys(FONTES).join(", ")})`);

// O esquema NÃO é uniforme: govbr e sc não têm `matricula`, o scpi não tem `nome`, o geosiap chama a matrícula de
// `chapa`. Descobrir as colunas de identidade em vez de supor — senão a consulta quebra na primeira tabela diferente.
const colsPorTabela = {};
for (const r of (await q(
  `select table_name t, column_name c from information_schema.columns
    where table_name = any($1::text[]) and column_name in ('nome','matricula','chapa','cpf_masc')`,
  [Object.keys(FONTES).map((f) => `folha_servidores_${f}`)])).rows) {
  (colsPorTabela[r.t] ??= new Set()).add(r.c);
}
const identidade = (f) => {
  const cols = colsPorTabela[`folha_servidores_${f}`] || new Set();
  const partes = ["nome", "matricula", "chapa", "cpf_masc"].filter((c) => cols.has(c)).map((c) => `coalesce(s.${c},'')`);
  return partes.length ? partes.join(" || '¦' || ") : "s.cod_ibge"; // sem identidade: conta 1 por município
};

// Por município e por fonte, conta os servidores DISTINTOS da competência mais CHEIA — não da mais recente.
// 🚨 Usar a mais recente mentia feio: basta um registro solto numa competência nova (um servidor com data de
// referência à frente do resto) para o município inteiro aparecer com "1 servidor". Curitiba saía com 21 e
// São Paulo dos Campos com 25. O pico da série é o retrato honesto do que a fonte entrega.
// 🚨 SEGUNDO defeito da régua (visto no SCPI de SP e de novo em MG): há portal que publica uma linha por servidor
// com cargo, unidade e provento e OMITE o nome e a matrícula. Como a identidade é `nome¦matrícula`, todas as linhas
// viravam a MESMA chave vazia e o município saía com "1 servidor" — Monte Sião-MG: 1.300 linhas contadas como 1.
// Quando a identidade da linha está inteiramente vazia, A LINHA É A PESSOA. Ver [[pnigp-sp-mapa-folha-645]].
const porFonte = Object.entries(FONTES).map(([f, comp]) => `
  select fonte, cod_ibge, max(n) n from (
    select '${f}' fonte, s.cod_ibge, coalesce(s.${comp},'—') comp,
           count(distinct ${identidade(f)}) filter (where replace(${identidade(f)}, '¦', '') <> '')
         + count(*)                          filter (where replace(${identidade(f)}, '¦', '') =  '') n
      from folha_servidores_${f} s group by 1,2,3
  ) x group by 1,2`).join("\n union all ");

console.log("medindo… (a consulta varre 19 tabelas de servidores)");
const linhas = (await q(`
with col as (${porFonte}),
-- município pode estar em mais de uma fonte: fica com a MAIOR, somar duplicaria a mesma pessoa
melhor as (
  select cod_ibge, max(n) coletado,
         (array_agg(fonte order by n desc))[1] fonte_principal,
         count(*) fontes
    from col group by 1
),
rais_ano as (select max(ano) a from folha_rais_municipal),
rais as (
  select lpad(cod_ibge6,6,'0') ibge6, count(*)::int ativos
    from folha_rais_municipal, rais_ano
   where ano = rais_ano.a and esfera_grupo = 'municipal' and ativo_3112
   group by 1
)
select m.cod_ibge, mb.nome municipio, mb.uf, m.coletado, m.fonte_principal, m.fontes,
       r.ativos rais, round(m.coletado::numeric / nullif(r.ativos,0), 2) razao
  from melhor m
  left join municipios_br mb on mb.cod_ibge = m.cod_ibge
  left join rais r on r.ibge6 = left(m.cod_ibge, 6)
 order by razao nulls last`)).rows;

const comRais = linhas.filter((l) => l.razao != null);
const baixo = comRais.filter((l) => +l.razao < MIN);
const alto = comRais.filter((l) => +l.razao > MAX);
const ok = comRais.length - baixo.length - alto.length;

console.log(`\n${linhas.length} municípios com folha · ${comRais.length} comparáveis com a RAIS`);
console.log(`  dentro da faixa [${MIN}–${MAX}]: ${ok}`);
console.log(`  SUBCOLETADOS (razão < ${MIN}): ${baixo.length}`);
console.log(`  INFLADOS (razão > ${MAX}): ${alto.length}`);

const mostra = (t, arr) => {
  console.log(`\n── ${t} (${arr.length}) ──`);
  console.log(arr.slice(0, 40).map((l) =>
    `  ${(l.uf || "??")} ${String(l.municipio || l.cod_ibge).padEnd(28)} coletado=${String(l.coletado).padStart(6)} rais=${String(l.rais).padStart(6)} razão=${l.razao}  ${l.fonte_principal}`).join("\n"));
};
mostra("SUBCOLETADOS", baixo);
mostra("INFLADOS", alto);

// quem é o pior por fonte — mostra qual coletor ainda está pela metade
const porFonteRes = {};
for (const l of comRais) {
  const f = porFonteRes[l.fonte_principal] ??= { n: 0, baixo: 0, alto: 0 };
  f.n++; if (+l.razao < MIN) f.baixo++; if (+l.razao > MAX) f.alto++;
}
console.log("\n── por fonte principal ──");
console.log(Object.entries(porFonteRes).sort((a, b) => b[1].baixo - a[1].baixo)
  .map(([f, v]) => `  ${f.padEnd(12)} ${String(v.n).padStart(4)} mun · ${String(v.baixo).padStart(4)} subcoletados · ${String(v.alto).padStart(3)} inflados`).join("\n"));

await db.end();
