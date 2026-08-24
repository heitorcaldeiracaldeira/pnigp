// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// varre_portalfacil_dadosabertos.mjs — enumera o catálogo do Portal Fácil pela API central de Dados Abertos.
//
// ⭐⭐ `https://dadosabertos-portalfacil.azurewebsites.net/api/cliente?idCliente=N` devolve o NOME do ente para
// cada id sequencial. Isso ENUMERA o produto no país inteiro — sem adivinhar domínio, que era a limitação do
// molde `www.{slug}.{uf}.gov.br/tpc_serv_nome_lis.aspx` ([[pnigp-portalfacil-tpc-aspx]]). O molde achou 24
// municípios, todos em MG, e me fez concluir "produto regional mineiro". Era falso: o id 400 é **Aiquara/BA**.
//
// 🚨 O catálogo NÃO é uma lista de municípios. Junto das prefeituras vêm câmaras ("Câmara de Nova Serrana"),
// ambientes de teste ("DEV V1101", "Portal de demonstração - 2.0") e cadastros que são PESSOAS ou empresas
// ("Renato Nascimento", "Jornal JR a voz de minas"). Aceitar tudo que responde 200 carimbaria legislativo como
// executivo ([[pnigp-entidade-espelho-infla-folha]]).
//
// 🚨 E o nome NÃO traz UF: "Prefeitura Municipal de Alpinopolis" pode ser MG (é) mas nomes se repetem entre
// estados. O casamento com `municipios_br` só é aceito quando o nome normalizado é ÚNICO no país; ambíguo fica
// registrado como tal, para resolução pelo portal do próprio município ([[pnigp-nunca-digitar-codigo-ibge]]).
//
// Uso: node scripts/varre_portalfacil_dadosabertos.mjs        · ATE=1500 · PARALELO=12
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import "./_rede.mjs";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const ATE = Number(process.env.ATE || 1500);
const PARALELO = Number(process.env.PARALELO || 12);
const API = "https://dadosabertos-portalfacil.azurewebsites.net";
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36" };
const so = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

await q(`create table if not exists folha_portalfacil_catalogo (
  id_cliente int primary key, nome text, tipo text, cod_ibge text, municipio text, uf text,
  competencia_ref text, atualizado_em text, competencias int, situacao text, em timestamptz default now()
)`);

// ── classificação do cadastro: só PREFEITURA vira coleta ───────────────────────────────────────────────────────
const RE_CAMARA = /c[âa]mara|legislat|vereador/i;
const RE_PREF = /prefeitura|munic[íi]pio|pref\.?\s/i;
const RE_TESTE = /^dev |demonstra|homolog|teste|^\s*$/i;

function classifica(nome) {
  if (!nome || RE_TESTE.test(nome)) return "teste";
  if (RE_CAMARA.test(nome)) return "camara";
  if (RE_PREF.test(nome)) return "prefeitura";
  return "indefinido";   // pode ser município escrito só pelo nome ("Alpercata", "Itaguaçu") — resolvido abaixo
}

// nome do município limpo dos prefixos
const limpaNome = (n) => so(n).replace(/^(prefeitura|prefeitura municipal|municipio|prefeitura mun)\s*(de|do|da|dos|das)?\s*/i, "").trim();

const cad = (await q(`select cod_ibge, nome, uf from municipios_br`)).rows;
const porNome = new Map();
for (const m of cad) {
  const k = so(m.nome);
  if (!porNome.has(k)) porNome.set(k, []);
  porNome.get(k).push(m);
}

async function jsonDe(u) {
  const r = await fetch(`${API}${u}`, { headers: UA, signal: AbortSignal.timeout(30000) });
  if (!r.ok) return null;
  const t = await r.text();
  try { return JSON.parse(t); } catch { return null; }
}

let entes = 0, prefeituras = 0, casados = 0, ambiguos = 0;
const visita = async (id) => {
  const c = await jsonDe(`/api/cliente?idCliente=${id}`).catch(() => null);
  if (!c || !c.value || String(c.id) === "0") return;
  entes++;
  const nome = String(c.value).trim();
  let tipo = classifica(nome);

  // resolve o município e, com ele, decide se um cadastro "indefinido" é de fato prefeitura
  const chave = limpaNome(nome);
  const achados = porNome.get(chave) ?? [];
  let cod = null, mun = null, uf = null, situacao;
  if (tipo === "camara" || tipo === "teste") situacao = tipo;
  else if (achados.length === 1) { cod = achados[0].cod_ibge; mun = achados[0].nome; uf = achados[0].uf; situacao = "casado"; casados++; if (tipo === "indefinido") tipo = "prefeitura"; }
  else if (achados.length > 1) { situacao = "nome_ambiguo"; ambiguos++; if (tipo === "indefinido") tipo = "prefeitura"; }
  else situacao = tipo === "prefeitura" ? "sem_municipio_no_cadastro" : "nao_e_ente";
  if (tipo === "prefeitura") prefeituras++;

  // competências publicadas (só para quem é prefeitura — evita 1.500 requisições inúteis)
  let comps = null, ref = null, atual = null;
  if (tipo === "prefeitura") {
    const a = await jsonDe(`/api/servidoresano?idcliente=${id}`).catch(() => null);
    comps = Array.isArray(a) ? a.length : null;
    ref = (await jsonDe(`/api/servidoresdatareferencia?idcliente=${id}`).catch(() => null)) ?? null;
    atual = (await jsonDe(`/api/servidoresdataatualizacao?idcliente=${id}`).catch(() => null)) ?? null;
  }

  await q(`insert into folha_portalfacil_catalogo
    (id_cliente,nome,tipo,cod_ibge,municipio,uf,competencia_ref,atualizado_em,competencias,situacao,em)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
    on conflict (id_cliente) do update set nome=excluded.nome, tipo=excluded.tipo, cod_ibge=excluded.cod_ibge,
      municipio=excluded.municipio, uf=excluded.uf, competencia_ref=excluded.competencia_ref,
      atualizado_em=excluded.atualizado_em, competencias=excluded.competencias, situacao=excluded.situacao, em=now()`,
    [id, nome, tipo, cod, mun, uf, ref ? String(ref) : null, atual ? String(atual) : null, comps, situacao]);

  if (tipo === "prefeitura" && comps) {
    console.log(`  ⭐ ${String(id).padStart(4)} ${(uf ?? "??")} ${(mun ?? nome).padEnd(28)} ${comps} competências · ref ${ref ?? "?"}${situacao !== "casado" ? `  [${situacao}]` : ""}`);
  }
};

console.log(`[catálogo] varrendo ids 1..${ATE}\n`);
for (let i = 1; i <= ATE; i += PARALELO) {
  await Promise.all(Array.from({ length: Math.min(PARALELO, ATE - i + 1) }, (_, k) => visita(i + k)));
  if (i % 300 < PARALELO) console.log(`      … id ${i}, ${entes} entes, ${prefeituras} prefeituras`);
}
console.log(`\n[catálogo] ${entes} cadastros · ${prefeituras} prefeituras · ${casados} casadas · ${ambiguos} ambíguas`);
const r = await q(`select situacao, count(*)::int n from folha_portalfacil_catalogo group by 1 order by 2 desc`);
console.log(r.rows.map((x) => `${x.situacao}=${x.n}`).join(" · "));
await db.end();
