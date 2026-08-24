// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// casa_catalogo_portalfacil.mjs — resolve NOME DO CADASTRO → município do IBGE em `folha_portalfacil_catalogo`.
//
// Roda sobre o que já está no banco: não repete a varredura da API, só recalcula o casamento. Serve para corrigir
// a regra sem perder o levantamento ([[pnigp-nunca-digitar-codigo-ibge]] — o código sempre vem do cadastro).
//
// 🚨 O BUG QUE ESTE SCRIPT NASCEU PARA CORRIGIR: eu escrevi o regex de limpeza como
//     /^(prefeitura|prefeitura municipal|municipio|pref)\s*(de|do|da)?\s*/
// e em JavaScript a alternância é ORDENADA — `prefeitura` casa antes de `prefeitura municipal`. Resultado:
// "Prefeitura Municipal de Ubá" virava "municipal de uba" e NÃO casava com o cadastro. **201 de 321 prefeituras**
// ficaram sem município por causa da ordem das alternativas — Ubá, Três Pontas, Timóteo, Feira de Santana.
// Alternativa longa primeiro, sempre; ou, como aqui, remoção iterativa de palavras de serviço.
//
// 🚨 ÓRGÃO NÃO É PREFEITURA: "Prefeitura de Congonhas - Guarda Municipal" é um órgão dentro do município. Se
// entrasse como prefeitura, a folha da guarda seria lida como a folha inteira ([[pnigp-entidade-espelho-infla-folha]]).
//
// ⚠️ NOME SEM UF É AMBÍGUO E FICA AMBÍGUO. "Anchieta" existe em ES e RJ; "Boa Esperança" em MG, ES e PR. Esses
// não recebem cod_ibge por adivinhação — ficam `nome_ambiguo` até que uma prova externa resolva
// ([[pnigp-entidade-declarada-e-a-prova]]).
//
// Uso: node scripts/casa_catalogo_portalfacil.mjs        · APLICAR=1
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const APLICAR = process.env.APLICAR === "1";

const so = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// remove palavras de serviço do INÍCIO, uma a uma — imune à ordem das alternativas
// ⭐ 22/ago/2026: "camara" entra como palavra de serviço — o catálogo tem 177 CÂMARAS ("Câmara de Aimorés") e
//    todas estavam sem cod_ibge, porque o script as descartava antes de tentar casar.
const SERVICO = new Set(["prefeitura", "camara", "cámara", "municipal", "municipio", "mun", "pref", "legislativo", "de", "do", "da", "dos", "das"]);
function nucleo(nome) {
  // "Prefeitura de X - Guarda Municipal" → o sufixo depois do hífen é ÓRGÃO, não município
  const semOrgao = String(nome).split(/\s+-\s+/)[0];
  const p = so(semOrgao).split(" ");
  let i = 0;
  while (i < p.length && SERVICO.has(p[i])) i++;
  return p.slice(i).join(" ");
}
// 🚨 22/ago/2026: " - " NEM SEMPRE É ÓRGÃO. Em 18 câmaras o sufixo é a **UF** ("Câmara Municipal de Alvarenga
//    - MG") — justamente o dado que faltava para desambiguar homônimo. Tratá-las como órgão jogava fora as duas
//    informações. A UF no fim vira PISTA, não motivo de descarte.
const UFS = new Set(["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB",
                     "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]);
function ufDoSufixo(nome) {
  const partes = String(nome).split(/\s+-\s+/);
  const fim = (partes[partes.length - 1] || "").trim().toUpperCase();
  return partes.length > 1 && UFS.has(fim) ? fim : null;
}
const RE_ORGAO = /guarda municipal|autarquia|fundac|instituto|consorcio|previd|saae|samae|hospital|fundo/i;

const cad = (await q(`select cod_ibge, nome, uf from municipios_br`)).rows;
const porNome = new Map(), porSemPrep = new Map();
// ⚠️ chave 2: sem as preposições internas. O fornecedor escreve "Alto do Rio Novo"; o IBGE registra
// "Alto Rio Novo". Medido antes de usar: essa chave gera **zero** colisões novas no cadastro dos 5.570 —
// nenhum par de municípios de grafia diferente passa a compartilhar chave.
const PREP = new Set(["de", "do", "da", "dos", "das", "d"]);
const semPrep = (x) => so(x).split(" ").filter((w) => !PREP.has(w)).join(" ");
for (const m of cad) {
  for (const [mapa, k] of [[porNome, so(m.nome)], [porSemPrep, semPrep(m.nome)]]) {
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(m);
  }
}

// ⚠️ chave 3, último recurso: UMA letra de diferença, e só se o candidato for ÚNICO. Nasceu de "Felizburgo",
// que o fornecedor grafa com Z e o IBGE registra **Felisburgo** (3125606/MG). Fica marcado
// `casado_aproximado` — casamento por aproximação tem de ser rastreável, nunca silencioso.
function distancia1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, erros = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++erros > 1) return false;
    if (a.length === b.length) { i++; j++; } else if (a.length > b.length) i++; else j++;
  }
  return erros + (a.length - i) + (b.length - j) <= 1;
}
const chaves = [...porNome.keys()];
// 🚨 SIGLA CURTA NÃO SE APROXIMA. A primeira versão casou **"EMAP" → Emas/PB** — uma letra de diferença, candidato
// único, e completamente errado: EMAP é a Empresa Maranhense de Administração Portuária. Quanto mais curto o nome,
// mais fácil uma letra virar outro município. Exige-se 6+ caracteres e que o original não seja uma sigla.
function aproxima(k, original) {
  if (k.length < 6) return null;
  if (/^[A-Z0-9\s.]+$/.test(String(original).trim())) return null;   // tudo maiúsculo = sigla
  const c = chaves.filter((x) => distancia1(k, x));
  if (c.length !== 1) return null;
  const achados = porNome.get(c[0]);
  return achados.length === 1 ? achados[0] : null;
}

const linhas = (await q(`select id_cliente, nome, tipo, situacao, competencias from folha_portalfacil_catalogo
  order by id_cliente`)).rows;

let casou = 0, ambiguo = 0, orgao = 0, semCad = 0, naoEnte = 0;
const mudancas = [], aindaSem = [], aproximados = [];
for (const L of linhas) {
  // ⭐ a CÂMARA agora é ente de interesse: ela é o alvo da frente do legislativo. Só "teste" fica fora.
  if (L.tipo === "teste") { naoEnte++; continue; }
  const ufSufixo = ufDoSufixo(L.nome);
  // " - " só denuncia órgão quando o sufixo NÃO é uma UF
  if (RE_ORGAO.test(L.nome) || (/\s-\s/.test(L.nome) && !ufSufixo)) {
    orgao++; mudancas.push([L.id_cliente, null, null, null, "orgao", "orgao"]); continue;
  }
  const k = nucleo(L.nome);
  let achados = porNome.get(k) ?? [];
  if (ufSufixo && achados.length > 1) achados = achados.filter((x) => x.uf === ufSufixo);
  let via = "casado";
  if (!achados.length) { achados = porSemPrep.get(semPrep(k)) ?? []; if (achados.length) via = "casado"; }
  if (!achados.length) { const a = aproxima(k, L.nome); if (a) { achados = [a]; via = "casado_aproximado"; } }
  if (achados.length === 1) {
    casou++;
    if (via === "casado_aproximado") aproximados.push(`${L.id_cliente} "${L.nome}" → ${achados[0].nome}/${achados[0].uf}`);
    mudancas.push([L.id_cliente, achados[0].cod_ibge, achados[0].nome, achados[0].uf, via, "prefeitura"]);
  } else if (achados.length > 1) {
    ambiguo++;
    mudancas.push([L.id_cliente, null, null, null, "nome_ambiguo", "prefeitura"]);
  } else {
    semCad++;
    aindaSem.push(`${L.id_cliente} "${L.nome}" → núcleo "${k}"`);
    mudancas.push([L.id_cliente, null, null, null, "sem_municipio_no_cadastro", L.tipo]);
  }
}

console.log(`casadas ${casou} · ambíguas ${ambiguo} · órgãos ${orgao} · sem cadastro ${semCad} · câmara/teste ${naoEnte}`);
if (aproximados.length) {
  console.log(`
casados por APROXIMAÇÃO de uma letra (${aproximados.length}) — conferir:`);
  aproximados.forEach((x) => console.log("   " + x));
}
if (aindaSem.length) {
  console.log(`\nainda sem casamento (${aindaSem.length}):`);
  aindaSem.slice(0, 30).forEach((x) => console.log("   " + x));
}
if (!APLICAR) { console.log("\n(SIMULAÇÃO — rode com APLICAR=1)"); await db.end(); process.exit(0); }

for (const [id, cod, mun, uf, sit, tipo] of mudancas) {
  // 🚨 NÃO SOBRESCREVER O TIPO DE QUEM É CÂMARA. Ao ensinar este script a casar "Câmara de X" com o município,
  //    ele passou a marcar 161 câmaras como `prefeitura` — e tipo errado faria o coletor gravar a folha do
  //    legislativo como se fosse do executivo. O nome é a prova do poder; o casamento só resolve o MUNICÍPIO.
  await q(`update folha_portalfacil_catalogo set cod_ibge=$2, municipio=$3, uf=$4, situacao=$5,
             tipo = case when nome ~* '\\mc[âa]mara' then 'camara' else $6 end, em=now()
    where id_cliente=$1`, [id, cod, mun, uf, sit, tipo]);
}
const r = await q(`select situacao, count(*)::int n from folha_portalfacil_catalogo group by 1 order by 2 desc`);
console.log("\n✔ gravado ·", r.rows.map((x) => `${x.situacao}=${x.n}`).join(" · "));
const p = (await q(`select count(*)::int n, count(distinct uf)::int ufs from folha_portalfacil_catalogo
  where tipo='prefeitura' and cod_ibge is not null and coalesce(competencias,0) > 0`)).rows[0];
console.log(`prontos para coletar: ${p.n} municípios em ${p.ufs} UFs`);
await db.end();
