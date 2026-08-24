// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_campogrande_valor.mjs — a SEGUNDA PASSADA de Campo Grande/MS: o dinheiro dos 40.000 servidores.
//
// O `ingest_folha_campogrande.mjs` traz a lista inteira num CSV (nome, cargo, secretaria, vínculo, admissão) e
// **nenhum valor** — a remuneração só existe na ficha individual. Esta é a passada que promete aquele cabeçalho.
//
// O CONTRATO, em duas etapas, porque o CSV traz o CPF MASCARADO e a ficha exige o CPF INTEIRO:
//   1. LISTA HTML (15 por página, ~2.667 páginas): POST em /servidores/consulta com `_token` (CSRF), `page`,
//      `ano` e `competencia`. Cada linha traz o link
//        /servidores/detalhe/{ano}/{mes}/{matricula}/{vinculo}/{codCargo}/{SECRETARIA}/{CPF-INTEIRO}
//      — é a ÚNICA fonte do CPF completo.
//   2. FICHA (1 requisição por pessoa): duas tabelas, "Rendimentos" e "Descontos", em R$ pt-BR.
//        Remuneração Básica Bruto · Exercício FC · Abono de Permanência · Gratificação Natalina · Férias
//        Deduções Obrigatórias · Redução Decreto Contigenciamento
//
// 🚨 A ROTA DE DETALHE **NÃO** DISPENSA O CPF, embora pareça: com CPF mascarado, vazio ou parcial o servidor
//    devolve **HTTP 200 com 119 KB** — que é a LANDING genérica do portal, não a ficha. Eu quase concluí "o
//    portal não valida o CPF" olhando só o status e o tamanho. O que distingue é o CONTEÚDO: a ficha real tem
//    ~38 KB e uma tabela com o cabeçalho "Rendimentos|Valor" ([[pnigp-api-de-fachada-tc]]).
//
// 🚨 O host tem certificado que o Node recusa — daí o NODE_TLS_REJECT_UNAUTHORIZED, como no coletor da lista.
//
// RETOMÁVEL: o alvo é quem está com `bruto` nulo. Interrompido, recomeça de onde parou sem repetir ficha boa.
//
// Uso: node scripts/ingest_folha_campogrande_valor.mjs
//      COMP=202512 fixa a competência · CONC=6 requisições simultâneas · LIMITE=200 para teste
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const B = "https://sig-transparencia.campogrande.ms.gov.br";
const COD = "5002704";
const CONC = +(process.env.CONC || 6);
const LIMITE = process.env.LIMITE ? +process.env.LIMITE : Infinity;
const PAUSA = +(process.env.PAUSA || 120);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" };
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

// "R$ 1.234,56" → 1234.56 · vazio/zero → 0
const money = (s) => {
  const t = String(s ?? "").replace(/R\$/gi, "").replace(/\s/g, "").trim();
  if (!t || !/\d/.test(t)) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const competencia = process.env.COMP
  || (await q(`select competencia from folha_servidores_campogrande group by 1 order by 1 desc limit 1`)).rows[0]?.competencia;
if (!competencia) { console.log("sem competência na tabela — rode antes o ingest_folha_campogrande.mjs"); await db.end(); process.exit(0); }
const ano = competencia.slice(0, 4), mes = competencia.slice(4, 6);

const pend = (await q(`select count(*) n from folha_servidores_campogrande where competencia=$1 and bruto is null`, [competencia])).rows[0].n;
const total = (await q(`select count(*) n from folha_servidores_campogrande where competencia=$1`, [competencia])).rows[0].n;
console.log(`[cg-valor] competência ${competencia} · ${total} servidores · ${pend} ainda sem valor`);
if (+pend === 0) { console.log("nada a fazer"); await db.end(); process.exit(0); }

// ── sessão: token CSRF + cookie ──────────────────────────────────────────────────────────────────────────────
async function sessao() {
  const r = await fetch(`${B}/servidores/consulta`, { headers: UA, signal: AbortSignal.timeout(60000) });
  const html = await r.text();
  const cookie = (r.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  const token = (html.match(/name="_token"[^>]*value="([^"]+)"/) || [])[1];
  if (!token) throw new Error("não achei o _token na página de consulta");
  return { token, cookie };
}
let S = await sessao();

// ── etapa 1: uma página da lista → os links de detalhe (com o CPF inteiro) ───────────────────────────────────
async function paginaDaLista(pagina) {
  const corpo = new URLSearchParams({ _token: S.token, page: String(pagina), download: "", situacao: "",
    matricula: "", cpf: "", nome: "", nome_secretaria: "", tipo_nome_cargo: "", tipo_nome_funcao: "",
    competencia: mes, ano });
  const r = await fetch(`${B}/servidores/consulta`, { method: "POST", body: corpo,
    headers: { ...UA, cookie: S.cookie, "content-type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(90000) }).catch(() => null);
  if (!r?.ok) return null;
  const t = await r.text();
  // /servidores/detalhe/{ano}/{mes}/{matricula}/{vinculo}/{codCargo}/{SECRETARIA}/{cpf}
  const rx = /\/servidores\/detalhe\/(\d+)\/(\d+)\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)\/(\d{11})/g;
  const vistos = new Set(); const out = [];
  for (const m of t.matchAll(rx)) {
    const chave = `${m[3]}|${m[4]}|${m[5]}`;
    if (vistos.has(chave)) continue; vistos.add(chave);
    out.push({ ano: m[1], mes: m[2], matricula: m[3], vinculo: m[4], codCargo: m[5], secretaria: m[6], cpf: m[7] });
  }
  return out;
}

// ── etapa 2: a ficha ────────────────────────────────────────────────────────────────────────────────────────
// 🚨 exige o cabeçalho "Rendimentos|Valor": sem ele o que voltou foi a landing genérica, não a ficha.
async function ficha(s) {
  const u = `${B}/servidores/detalhe/${s.ano}/${s.mes}/${s.matricula}/${s.vinculo}/${s.codCargo}/${s.secretaria}/${s.cpf}`;
  const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(60000) }).catch(() => null);
  if (!r?.ok) return null;
  const t = await r.text();
  const linhas = [...t.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) =>
    [...m[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((c) => c[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()));
  if (!linhas.some((l) => /^rendimentos$/i.test(l[0] || ""))) return null;   // landing, não ficha
  let secao = null, bruto = 0, desc = 0, achou = false;
  for (const l of linhas) {
    if (!l.length) continue;
    if (/^rendimentos$/i.test(l[0])) { secao = "R"; continue; }
    if (/^descontos$/i.test(l[0])) { secao = "D"; continue; }
    if (l.length < 2 || !secao) continue;
    const v = money(l[1]);
    if (v == null) continue;
    achou = true;
    if (secao === "R") bruto += v; else desc += v;
  }
  if (!achou) return null;
  return { bruto: Math.round(bruto * 100) / 100, descontos: Math.round(desc * 100) / 100,
           liquido: Math.round((bruto - desc) * 100) / 100 };
}

// ── laço ────────────────────────────────────────────────────────────────────────────────────────────────────
// 🚨 NÃO recalcular o `_hash` para mirar o UPDATE: o hash gravado pela primeira passada usa uma combinação de
//    campos que não dá para reproduzir com segurança daqui (tentei md5(cod|competencia|matricula|vinculo|cargo)
//    e as 60 primeiras fichas voltaram "sem par no banco" — dado bom colhido e descartado no último metro).
//    A chave natural está nas COLUNAS, e a URL da ficha entrega exatamente as mesmas: matrícula, vínculo e
//    código do cargo ([[pnigp-hash-decide-duplicata-ou-conserto-perdido]]).
const chaveDe = (s) => `${s.matricula}|${s.vinculo}|${s.codCargo}`;
const jaTem = new Set((await q(
  `select matricula||'|'||vinculo_num||'|'||codigo_cargo k from folha_servidores_campogrande
    where competencia=$1 and bruto is not null`, [competencia])).rows.map((r) => r.k));

// ⭐ PAGINA=N começa direto numa página. A retomada natural (varrer desde a 1 pulando quem já tem valor) é
//    correta mas custa ~50 min de re-caminhada quando já se passou de mil páginas. A ordem da lista é ESTÁVEL
//    — provado: a re-caminhada devolveu "0 gravadas" em todas as páginas já feitas —, então pular é seguro.
//    ⚠️ Sem certeza dessa estabilidade, NÃO pular: repetir página barata é melhor que deixar servidor para trás.
let pagina = +(process.env.PAGINA || 1), gravadas = 0, semFicha = 0, semPar = 0, paginasVazias = 0, processadas = 0;
const t0 = Date.now();
while (processadas < LIMITE) {
  // 🚨 A PRIMEIRA VERSÃO DESTE BLOCO PERDIA A RETENTATIVA: renovava a sessão, refazia o pedido e **jogava o
  //    resultado fora** (`itens` continuava nulo, e `itens.push?.(...)` não fazia nada). Duas páginas "vazias"
  //    seguidas encerravam o laço — a passada morreu na página 669 com 30 mil servidores por colher.
  //    Agora a retentativa substitui `lista`, e a sessão é renovada com espera crescente antes de desistir.
  let lista = await paginaDaLista(pagina);
  for (let tent = 1; lista == null && tent <= 4; tent++) {
    console.log(`   ⟳ página ${pagina} falhou — renovando sessão (tentativa ${tent}/4)`);
    await dorme(3000 * tent);
    try { S = await sessao(); } catch { /* portal instável: tenta de novo no laço */ }
    lista = await paginaDaLista(pagina);
  }
  if (lista == null) { console.log(`  ✖ página ${pagina} falhou 5 vezes — parando (retomável: rode de novo)`); break; }
  if (!lista.length) { paginasVazias++; if (paginasVazias >= 2) break; pagina++; continue; }
  paginasVazias = 0;

  // só quem ainda não tem valor
  const pendentes = lista.filter((s) => !jaTem.has(chaveDe(s)));

  const fila = [...pendentes];
  const trabalhador = async () => {
    while (fila.length) {
      const s = fila.pop();
      const v = await ficha(s);
      processadas++;
      if (!v) { semFicha++; continue; }
      const u = await q(`update folha_servidores_campogrande
          set bruto=$5, descontos=$6, liquido=$7, _coletado_em=now()
        where competencia=$1 and matricula=$2 and vinculo_num=$3 and codigo_cargo=$4`,
        [competencia, s.matricula, s.vinculo, s.codCargo, v.bruto, v.descontos, v.liquido]);
      if (u.rowCount) { gravadas++; jaTem.add(chaveDe(s)); } else semPar++;
      if (PAUSA) await dorme(PAUSA);
    }
  };
  await Promise.all(Array.from({ length: CONC }, trabalhador));

  if (pagina % 20 === 0 || pagina === 1) {
    const min = ((Date.now() - t0) / 60000).toFixed(1);
    console.log(`   … página ${pagina} · ${gravadas} gravadas · ${semFicha} sem ficha · ${semPar} sem par no banco · ${min} min`);
  }
  pagina++;
}
const comValor = (await q(`select count(*) n from folha_servidores_campogrande where competencia=$1 and bruto is not null`, [competencia])).rows[0].n;
console.log(`\n[cg-valor] ${gravadas} gravadas nesta passada · ${comValor} de ${total} com valor · ${semFicha} fichas sem dado · ${semPar} sem par no banco`);
await q(`insert into folha_campogrande_coleta (competencia, linhas, com_valor, situacao, detalhe, em)
   values ($1,$2,$3,$4,$5,now()) on conflict (competencia) do update set
   linhas=excluded.linhas, com_valor=excluded.com_valor, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
  [competencia, +total, +comValor, +comValor > 0 ? "ok" : "sem_valor",
   `segunda passada (ficha individual): ${gravadas} valores gravados, ${semFicha} fichas sem dado`]);
await db.end();
