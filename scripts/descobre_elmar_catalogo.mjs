// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_elmar_catalogo.mjs — enumera o CATÁLOGO da ELMAR (PublicSoft) pelo `ctx` e identifica cada entidade
// pelo **CNPJ**, não pelo nome.
//
// ⭐ A descoberta: `transparencia.elmartecnologia.com.br/FolhaPag?ctx={N}` devolve ~150 KB com o nome E O CNPJ da
//    entidade quando o ctx existe, e **45 bytes** quando não existe. O catálogo inteiro é enumerável — não é
//    preciso caçar o iframe no portal de cada município (o descobridor antigo achava 6 de 96).
//    Mesma técnica de [[pnigp-catalogo-rnr-cr2-bubble]]: ir ao catálogo da FONTE, não ao portal do cliente.
//
// 🚨 CASAR POR NOME AQUI PRODUZ UF ERRADA. O catálogo é quase todo PB, e PB/PE compartilham Alagoinha, Paulista,
//    Condado, Santa Cruz, Triunfo e Salgadinho. Pior: `municipios_br` guarda 37 nomes COM sufixo de UF
//    ("Alagoinha PB"), então a chave exata casa silenciosamente com o homônimo de PE. O CNPJ é a prova
//    ([[pnigp-entidade-declarada-e-a-prova]], [[pnigp-fila-erp-homonimo-contamina-uf]]).
//
// Coleta identificada, em ritmo baixo, e aceita a recusa do servidor como resposta.
// Uso: DE=201000 ATE=201250 node scripts/descobre_elmar_catalogo.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool();
const q = withRetry(db);
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };
const DE = Number(process.env.DE || 201000);
const ATE = Number(process.env.ATE || 201250);
const PAR = Number(process.env.PAR || 4);
const REFAZ = process.env.REFAZ === "1";        // re-testa ctx já catalogados (para pegar o CNPJ dos antigos)
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists elmar_ctx_catalogo (
  ctx int primary key, entidade text, tipo text, cod_ibge text, municipio text, uf text, em timestamptz default now()
)`);
await q(`alter table elmar_ctx_catalogo add column if not exists cnpj text`);
await q(`alter table elmar_ctx_catalogo add column if not exists prova text`);

// 🚨 O acento vem como ENTIDADE HTML (`RIACH&Atilde;O DO PO&Ccedil;O`). Casar antes de decodificar corta o nome
//    no `&` e produz "RIACH" — um município fantasma. Decodificar PRIMEIRO.
const desHtml = (s) => String(s)
  // 🚨 a ELMAR usa entidade NUMÉRICA (`RIACH&#195;O DO PO&#199;O`), não a nomeada. Sem isto o nome vira "RIACH".
  .replace(/&#(\d{2,5});/g, (_, n) => { try { return String.fromCodePoint(+n); } catch { return " "; } })
  .replace(/&#x([0-9a-f]{2,4});/gi, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return " "; } })
  .replace(/&Aacute;/g, "Á").replace(/&Agrave;/g, "À").replace(/&Acirc;/g, "Â").replace(/&Atilde;/g, "Ã")
  .replace(/&Eacute;/g, "É").replace(/&Ecirc;/g, "Ê").replace(/&Iacute;/g, "Í")
  .replace(/&Oacute;/g, "Ó").replace(/&Ocirc;/g, "Ô").replace(/&Otilde;/g, "Õ")
  .replace(/&Uacute;/g, "Ú").replace(/&Ccedil;/g, "Ç")
  .replace(/&aacute;/g, "á").replace(/&agrave;/g, "à").replace(/&acirc;/g, "â").replace(/&atilde;/g, "ã")
  .replace(/&eacute;/g, "é").replace(/&ecirc;/g, "ê").replace(/&iacute;/g, "í")
  .replace(/&oacute;/g, "ó").replace(/&ocirc;/g, "ô").replace(/&otilde;/g, "õ")
  .replace(/&uacute;/g, "ú").replace(/&ccedil;/g, "ç").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

// ⚠️ o nome vem em três grafias na mesma página: com _, com espaço e url-encoded. A com espaço é a boa.
const nomeEntidade = (bruto) => {
  const h = desHtml(bruto);
  const c = [...h.matchAll(/(PREFEITURA MUNICIPAL DE [A-ZÀ-Ú][^<>"'&]{2,50}|Prefeitura Municipal de [A-Za-zÀ-ú][^<>"'&]{2,50}|C[ÂA]MARA MUNICIPAL DE [A-ZÀ-Ú][^<>"'&]{2,50}|C[âa]mara Municipal de [A-Za-zÀ-ú][^<>"'&]{2,50})/g)]
    .map((m) => m[1].replace(/\s+/g, " ").trim());
  if (!c.length) return null;
  const cont = new Map();
  for (const x of c) cont.set(x, (cont.get(x) || 0) + 1);
  return [...cont.entries()].sort((a, b) => b[1] - a[1])[0][0];
};
const soDig = (s) => String(s || "").replace(/\D/g, "");
const chave = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
// chave FROUXA: descarta preposições e todo separador. "POCO JOSE DE MOURA" == "Poço de José de Moura";
// "OLHO DAGUA" == "Olho d'Água". Só é consultada quando a chave exata não achou nada.
const frouxa = (s) => chave(s).split(" ").filter((p) => !["DE", "DA", "DO", "DAS", "DOS", "D", "E"].includes(p)).join("");

// 🚨 `municipios_br` guarda NOMES REVOGADOS: 2513653 é "Santarém" (hoje Joca Claudino) e 2516409 é
//    "Campo de Santana" (hoje Tacima) — o IBGE renomeou em 2010. A fonte usa o nome ATUAL, então o
//    casamento por nome falha em silêncio. Apelidos históricos entram como chave adicional.
const APELIDOS = { "2513653": ["JOCA CLAUDINO"], "2516409": ["TACIMA"] };

// dicionário nome→municípios. A chave IGNORA o sufixo de UF que 37 linhas de municipios_br carregam.
const mun = new Map();
const munFrouxo = new Map();
const poe = (mapa, k, m) => { if (!mapa.has(k)) mapa.set(k, []); if (!mapa.get(k).some((x) => x.cod_ibge === m.cod_ibge)) mapa.get(k).push(m); };
for (const m of (await q(`select cod_ibge, nome, uf from municipios_br`)).rows) {
  const limpo = String(m.nome).replace(/\s+[A-Z]{2}$/, "");
  poe(mun, chave(limpo), m); poe(munFrouxo, frouxa(limpo), m);
  for (const a of APELIDOS[m.cod_ibge] || []) { poe(mun, chave(a), m); poe(munFrouxo, frouxa(a), m); }
}
// CNPJ → (municipio, uf) pela base da CGU
const porCnpj = new Map();
for (const r of (await q(`select cnpj, municipio, uf from cnpj_loc where cnpj is not null`)).rows)
  porCnpj.set(soDig(r.cnpj), r);

// identifica a entidade: 1º pelo CNPJ (prova), 2º pelo nome quando ele é único no país,
// 3º pelo nome + a UF que as siglas do HTML declaram. Sem os três, fica sem cod_ibge.
function identifica(nome, cnpj, ufsHtml) {
  const c = porCnpj.get(soDig(cnpj));
  if (c) {
    const alvo = (mun.get(chave(String(c.municipio).replace(/\s+[A-Z]{2}$/, ""))) || []).find((m) => m.uf === c.uf);
    if (alvo) return { m: alvo, prova: "cnpj" };
  }
  // "BAYEUX PS" — o cadastro da ELMAR sufixa a sigla do produto no nome de algumas entidades
  const nomeLimpo = nome.replace(/\s+PS$/i, "").trim();
  let cand = mun.get(chave(nomeLimpo)) || [];
  if (!cand.length) cand = munFrouxo.get(frouxa(nomeLimpo)) || [];   // preposição/apóstrofo divergentes
  if (cand.length === 1) return { m: cand[0], prova: "nome único no país" };
  const porUf = cand.filter((m) => ufsHtml.includes(m.uf));
  if (porUf.length > 1) { /* homônimo dentro da MESMA UF: sem prova, fica sem cod_ibge */ }
  if (porUf.length === 1) return { m: porUf[0], prova: `nome + UF declarada no HTML (${porUf[0].uf})` };
  // 3º recurso: o catálogo da ELMAR é comprovadamente MONOESTADUAL (154 de 154 identificados são PB).
  // Restringir o homônimo à PB é inferência do catálogo, não chute — mas fica CARIMBADA como prova mais fraca.
  const pb = cand.filter((m) => m.uf === "PB");
  if (pb.length === 1) return { m: pb[0], prova: "catálogo monoestadual PB (prova fraca)" };
  return { m: null, prova: null };
}

const feitos = REFAZ ? new Set() : new Set((await q(`select ctx from elmar_ctx_catalogo where cnpj is not null`)).rows.map((r) => r.ctx));
const fila = [];
for (let c = DE; c <= ATE; c++) if (!feitos.has(c)) fila.push(c);
console.log(`[elmar] varrendo ctx ${DE}..${ATE} · ${fila.length} a testar`);

let achou = 0, testado = 0, recusa = 0, semId = 0;
async function testa(ctx) {
  let h;
  try {
    const r = await fetch(`https://transparencia.elmartecnologia.com.br/FolhaPag?Tab=1&isModal=false&ctx=${ctx}`,
      { headers: UA, signal: AbortSignal.timeout(45000) });
    if (r.status === 429 || r.status === 403) { recusa++; return; }   // o servidor recusou: é resposta, não obstáculo
    h = await r.text();
  } catch { return; }
  testado++;
  if (h.length < 2000) return;                       // ctx inexistente: a resposta é de 45 bytes
  const ent = nomeEntidade(h);
  if (!ent) return;
  const tipo = /c[âa]mara/i.test(ent) ? "camara" : "prefeitura";
  const nome = ent.replace(/^(PREFEITURA MUNICIPAL DE|Prefeitura Municipal de|C[ÂA]MARA MUNICIPAL DE|C[âa]mara Municipal de)\s*/i, "");
  const cnpj = ([...h.matchAll(/\b(\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2})\b/g)].map((m) => soDig(m[1]))
    .find((d) => d.length === 14)) || null;
  const ufs = [...new Set([...h.matchAll(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/g)].map((m) => m[1]))];
  const { m, prova } = identifica(nome, cnpj, ufs);
  if (!m) semId++;
  await q(`insert into elmar_ctx_catalogo (ctx,entidade,tipo,cod_ibge,municipio,uf,cnpj,prova) values ($1,$2,$3,$4,$5,$6,$7,$8)
    on conflict (ctx) do update set entidade=excluded.entidade, tipo=excluded.tipo, cod_ibge=excluded.cod_ibge,
      municipio=excluded.municipio, uf=excluded.uf, cnpj=excluded.cnpj, prova=excluded.prova`,
    [ctx, ent, tipo, m?.cod_ibge || null, nome, m?.uf || null, cnpj, prova]);
  achou++;
  if (!m || prova !== "cnpj") console.log(`   ${m ? "•" : "⚠️"} ${ctx} ${tipo.padEnd(10)} ${nome.slice(0, 30).padEnd(30)} ${m ? m.uf : "SEM ID"} · ${prova || `cnpj ${cnpj || "?"} fora da base`}`);
}

for (let i = 0; i < fila.length; i += PAR) {
  await Promise.all(fila.slice(i, i + PAR).map(testa));
  await dorme(400);
  if ((i + PAR) % 100 < PAR) console.log(`  ${Math.min(i + PAR, fila.length)}/${fila.length} · ${achou} entidades · ${semId} sem id`);
  if (recusa > 20) { console.log(`  ⛔ servidor recusando (${recusa}) — parando`); break; }
}
console.log(`\n[elmar] ${achou} entidades gravadas · ${testado} respostas · ${semId} sem identificação`);
const t = (await q(`select tipo, count(*)::int n, count(cod_ibge)::int id, count(cnpj)::int cnpj from elmar_ctx_catalogo group by 1`)).rows;
console.log("catálogo:", t.map((x) => `${x.tipo}:${x.n} (${x.id} identificados, ${x.cnpj} com cnpj)`).join(" · "));
const pv = (await q(`select prova, count(*)::int n from elmar_ctx_catalogo group by 1 order by 2 desc`)).rows;
console.log("prova:", pv.map((x) => `${x.prova || "(nenhuma)"}:${x.n}`).join(" · "));
const uf = (await q(`select uf, count(*)::int n from elmar_ctx_catalogo where uf is not null group by 1 order by 2 desc`)).rows;
console.log("por UF:", uf.map((x) => `${x.uf}:${x.n}`).join(" · "));
await db.end();
