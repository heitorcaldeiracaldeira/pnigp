// DOWNLOAD DOS AGREGADOS POR SETOR CENSITÁRIO (IBGE Censo 2022) — o passo que faltava.
//
// ═══ POR QUE ISTO EXISTE ═══
// Medido em 08/ago: quatro fontes (`setores`, `setores_geo`, `setores_idade`, `setores_criancas`) estavam
// há semanas com "erro(1)" e NUNCA produziram uma linha. Só quando o orquestrador parou de descartar o
// stderr do filho a causa apareceu: `ERR_INVALID_ARG_TYPE — The "path" argument must be of type string.
// Received undefined`, em `fs.createReadStream(CSV)`. Os quatro scripts esperam um CSV passado à mão
// (`process.argv[2]`), e o orquestrador os chama sem argumento nenhum. Não era rede, não era agendamento,
// não era fonte fora do ar: era funcionalidade incompleta — faltava quem baixasse o arquivo.
//
// ═══ DESCOBRE O ARQUIVO, NÃO O FIXA ═══
// Lei do Heitor, 09/ago: "precisa sempre procurar se não há dados novos".
// O IBGE republica os agregados com a data no nome — `Agregados_por_setores_basico_BR_20260520.zip` é a
// versão de hoje, não o nome eterno. Fixar isso no código faria o script nascer desatualizado e silenciar
// toda republicação futura, que é justamente o dado novo que interessa.
// Aqui o diretório é LISTADO e vence o arquivo mais recente que casa o padrão. Quando o IBGE publicar uma
// competência nova, ela entra sozinha — e o log diz qual versão foi usada, para a origem ficar rastreável.
//
//   node scripts/baixa_setores_ibge.mjs basico       → caminho do CSV básico
//   node scripts/baixa_setores_ibge.mjs demografia   → caminho do CSV de demografia
//   node scripts/baixa_setores_ibge.mjs gpkg         → caminho do GPKG da malha (UF)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import { execSync } from "child_process";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(__dirname, "..", "backups", "_ibge_setores");   // fora do git (backups/ é gitignored)
const BASE = "https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Agregados_por_Setores_Censitarios";
const UF = (process.env.UF || "SC").toUpperCase();

const CONJUNTOS = {
  basico:     { dir: `${BASE}/Agregados_por_Setor_csv`, re: /^Agregados_por_setores_basico_BR[^"]*\.zip$/i },
  demografia: { dir: `${BASE}/Agregados_por_Setor_csv`, re: /^Agregados_por_setores_demografia_BR[^"]*\.zip$/i },
  gpkg:       { dir: `${BASE}/malha_com_atributos/setores/gpkg/UF`, re: new RegExp(`^.*${UF}.*\\.(gpkg|zip)$`, "i") },
};

// lista o índice HTTP do FTP e devolve o nome do arquivo MAIS RECENTE que casa o padrão.
// Ordena por nome descendente: o IBGE carimba a data no próprio nome (…_20260520.zip), então o maior
// nome é a versão mais nova. Se um dia deixarem de carimbar, isto degrada para "qualquer um", nunca para
// "nenhum" — e o log mostra o que foi escolhido.
async function achaMaisRecente(dir, re) {
  const r = await fetch(dir + "/", { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`índice do IBGE respondeu ${r.status} em ${dir}`);
  const html = await r.text();
  const nomes = [...new Set([...html.matchAll(/href="([^"?][^"]*)"/gi)].map((m) => decodeURIComponent(m[1].split("/").pop())))]
    .filter((n) => re.test(n));
  if (!nomes.length) throw new Error(`nenhum arquivo casa ${re} em ${dir} — o IBGE mudou o layout?`);
  return nomes.sort().at(-1);
}

async function baixa(url, destino) {
  const r = await fetch(url, { signal: AbortSignal.timeout(900000) });
  if (!r.ok) throw new Error(`download ${r.status}: ${url}`);
  fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
  return destino;
}

// procura dentro do cache já extraído; `tar -xf` do Windows 10+ abre zip sem dependência externa
function extrai(zip, dir) {
  fs.mkdirSync(dir, { recursive: true });
  execSync(`tar -xf "${zip}" -C "${dir}"`, { stdio: "ignore" });
}
function achaArquivo(dir, ext) {
  const achados = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.toLowerCase().endsWith(ext)) achados.push(p);
    }
  })(dir);
  return achados.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];  // o maior é o de dados
}

export async function garanteArquivo(conjunto) {
  const c = CONJUNTOS[conjunto];
  if (!c) throw new Error(`conjunto desconhecido: ${conjunto}`);
  fs.mkdirSync(CACHE, { recursive: true });
  const nome = await achaMaisRecente(c.dir, c.re);
  const zip = path.join(CACHE, nome);
  const destino = path.join(CACHE, conjunto + "_" + nome.replace(/\.(zip|gpkg)$/i, ""));

  // CACHE POR NOME DE VERSÃO: se o IBGE republicar, o nome muda e o download acontece sozinho. Se não
  // mudou, não se rebaixa 22 MB toda noite — é o mesmo princípio do coletor que parou de re-baixar PDF.
  if (fs.existsSync(destino)) {
    const ja = achaArquivo(destino, nome.toLowerCase().endsWith(".gpkg") ? ".gpkg" : conjunto === "gpkg" ? ".gpkg" : ".csv");
    if (ja) { console.log(`[ibge/${conjunto}] em cache: ${nome}`); return ja; }
  }
  console.log(`[ibge/${conjunto}] versão mais recente no FTP: ${nome} — baixando…`);
  if (!fs.existsSync(zip)) await baixa(`${c.dir}/${nome}`, zip);
  if (nome.toLowerCase().endsWith(".zip")) extrai(zip, destino);
  else { fs.mkdirSync(destino, { recursive: true }); fs.copyFileSync(zip, path.join(destino, nome)); }
  const arq = achaArquivo(destino, conjunto === "gpkg" ? ".gpkg" : ".csv");
  if (!arq) throw new Error(`baixou ${nome} mas não achei o arquivo de dados dentro`);
  console.log(`[ibge/${conjunto}] pronto: ${path.basename(arq)} (${(fs.statSync(arq).size / 1e6).toFixed(1)} MB)`);
  return arq;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  console.log(await garanteArquivo(process.argv[2] || "basico"));
}
