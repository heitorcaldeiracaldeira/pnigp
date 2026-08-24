// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_ss_catalogo.mjs — enumera o CATÁLOGO NACIONAL da SS Informática
// (`sstransparenciamunicipal.net:8080/transparencia/`), que lista ENTIDADE · MUNICÍPIO · UF e é PAGINADO.
//
// 🚨 O caminho `/ssfolha/` NÃO é transparência: redireciona para `sisfo_login.php` (usuário e senha, app
//    "FolhaOnline" nas lojas) — é CONTRACHEQUE DO SERVIDOR. O portal público é `/transparencia/`.
//    Classifiquei errado antes por causa do nome do diretório ([[pnigp-rotulo-erp-nao-e-o-portal-da-folha]]).
//
// ⭐ Mesma técnica de [[pnigp-elmar-catalogo-ctx-enumeravel]]: ir ao catálogo da FONTE em vez do portal de cada
//    cliente. O catálogo mostra municípios do CE, RN e outros estados de uma vez.
//
// Uso: node scripts/descobre_ss_catalogo.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const B = "http://sstransparenciamunicipal.net:8080/transparencia";
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists ss_catalogo (
  entcod text primary key, entidade text, municipio_nome text, uf_nome text,
  cod_ibge text, uf text, tipo text, em timestamptz default now()
)`);

const chave = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toUpperCase().replace(/\s+[A-Z]{2}$/, "").replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
const UF_POR_NOME = { "ACRE": "AC", "ALAGOAS": "AL", "AMAPA": "AP", "AMAZONAS": "AM", "BAHIA": "BA",
  "CEARA": "CE", "DISTRITO FEDERAL": "DF", "ESPIRITO SANTO": "ES", "GOIAS": "GO", "MARANHAO": "MA",
  "MATO GROSSO": "MT", "MATO GROSSO DO SUL": "MS", "MINAS GERAIS": "MG", "PARA": "PA", "PARAIBA": "PB",
  "PARANA": "PR", "PERNAMBUCO": "PE", "PIAUI": "PI", "RIO DE JANEIRO": "RJ", "RIO GRANDE DO NORTE": "RN",
  "RIO GRANDE DO SUL": "RS", "RONDONIA": "RO", "RORAIMA": "RR", "SANTA CATARINA": "SC", "SAO PAULO": "SP",
  "SERGIPE": "SE", "TOCANTINS": "TO" };

// dicionário (nome, uf) → cod_ibge. `municipios_br` tem 37 nomes com sufixo de UF e nomes revogados
// ([[pnigp-municipios-br-nomes-revogados]]).
const mun = new Map();
for (const m of (await q(`select cod_ibge, nome, uf from municipios_br`)).rows)
  mun.set(`${chave(m.nome)}|${m.uf}`, m.cod_ibge);

// 🚨 A "tabela" NÃO usa <tr>/<td>: são DIVs com classe, e o entcod vem no onclick.
//    E o HTML é LATIN-1 ("Cear&#65533;" quando lido como utf-8) — decodificar na leitura.
const linhaRe = /<div class='tr body'[^>]*entcod=(\d+)[^>]*>\s*<div class='td'[^>]*>(.*?)<\/div>\s*<div class='td'[^>]*>(.*?)<\/div>\s*<div class='td'[^>]*>(.*?)<\/div>/gis;
const limpa = (s) => String(s).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
  .replace(/&aacute;/gi, "á").replace(/&eacute;/gi, "é").replace(/&iacute;/gi, "í").replace(/&oacute;/gi, "ó")
  .replace(/&uacute;/gi, "ú").replace(/&atilde;/gi, "ã").replace(/&otilde;/gi, "õ").replace(/&ccedil;/gi, "ç")
  .replace(/&ecirc;/gi, "ê").replace(/&acirc;/gi, "â").replace(/&ocirc;/gi, "ô")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/\s+/g, " ").trim();

let pagina = 1, total = 0, novos = 0, vazias = 0;
while (pagina <= 200) {
  const url = `${B}/index.php?pagina=${pagina}`;
  let html;
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(45000) });
    html = new TextDecoder("latin1").decode(await r.arrayBuffer());
  } catch { console.log(`  ✖ página ${pagina} não respondeu`); break; }
  const linhas = [...html.matchAll(linhaRe)]
    .map((m) => ({ entcod: m[1], entidade: limpa(m[2]), municipio: limpa(m[3]), uf: limpa(m[4]) }))
    .filter((x) => x.entidade && x.uf && !/^ENTIDADE$/i.test(x.entidade));
  if (!linhas.length) { if (++vazias >= 2) break; pagina++; continue; }
  vazias = 0;
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    const uf = UF_POR_NOME[chave(l.uf)] || null;
    const cod_ibge = uf ? mun.get(`${chave(l.municipio)}|${uf}`) || null : null;
    const tipo = /c[âa]mara/i.test(l.entidade) ? "camara"
      : /prefeitura|munic[íi]pio de/i.test(l.entidade) ? "prefeitura" : "outra entidade";
    const entcod = l.entcod;
    const r = await q(`insert into ss_catalogo (entcod, entidade, municipio_nome, uf_nome, cod_ibge, uf, tipo)
      values ($1,$2,$3,$4,$5,$6,$7) on conflict (entcod) do update set
      entidade=excluded.entidade, municipio_nome=excluded.municipio_nome, uf_nome=excluded.uf_nome,
      cod_ibge=coalesce(excluded.cod_ibge, ss_catalogo.cod_ibge), uf=excluded.uf, tipo=excluded.tipo`,
      [entcod, l.entidade, l.municipio, l.uf, cod_ibge, uf, tipo]);
    novos += r.rowCount;
    total++;
  }
  if (pagina % 5 === 0) console.log(`  página ${pagina} · ${total} entidades lidas`);
  pagina++;
  await dorme(350);
}
console.log(`\n[ss] ${total} linhas em ${pagina - 1} páginas`);
console.table((await q(`select uf, count(*)::int entidades, count(*) filter (where tipo='prefeitura')::int prefeituras,
   count(distinct cod_ibge)::int municipios_casados from ss_catalogo where uf is not null group by 1 order by 2 desc`)).rows);
const sem = (await q(`select count(*)::int n from ss_catalogo where cod_ibge is null`)).rows[0].n;
console.log(`sem cod_ibge: ${sem}`);
await db.end();
