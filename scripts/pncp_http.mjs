// HTTP DO PNCP — um lugar só. **FALHA NUNCA VIRA ZERO.**
//
// ═══ POR QUE EXISTE ═══
// O mesmo defeito estava em 17 scripts do projeto, em três formas:
//   `if (!r.ok) return []`                    → o PNCP me BLOQUEOU (429) e eu gravei "0 empenhos, 0 notas fiscais"
//   `.catch(() => ({ rows: [] }))`            → timeout virou "0 processos pendentes" e o ingest saiu com CÓDIGO 0
//   retry cego 25× em silêncio                → byte NUL travou o download por HORAS com o node vivo
// **Falha vira zero. Zero vira conclusão. Conclusão vira decisão.** Quatro vezes em 2026-07-15/16.
//
// A REGRA: o único "não tem" legítimo é o que a API **AFIRMA** — HTTP 204, ou 404 num recurso que pode faltar.
// Todo o resto é ERRO e tem que gritar. Vazio silencioso é a única coisa que nenhuma métrica pega, porque a
// métrica também não olha.
//
// ⚠️ COMO O PNCP BLOQUEIA (medido 2026-07-16): HTTP **429 com corpo HTML** ("Limite de Requisições Excedido",
// com Support ID) e **SEM cabeçalho Retry-After**. Não é o 429 comum da aplicação — é WAF. Não diz quanto dura.
// Por isso: HTML no content-type é bloqueio, mesmo que o status engane.
//
// import { getJson, getTodas, Bloqueado } from "./pncp_http.mjs";

export class Bloqueado extends Error { constructor(m) { super(m); this.name = "Bloqueado"; } }
export class RespostaInvalida extends Error { constructor(m) { super(m); this.name = "RespostaInvalida"; } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lista = (j) => (Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : j && !j.status ? [j] : []);

/**
 * GET que devolve lista — ou EXPLODE. Nunca devolve [] por falha.
 * @param {string} url
 * @param {{podeFaltar?:boolean, tentativas?:number}} o
 *   podeFaltar: 404 é resposta legítima ("este contrato não tem empenho") e não erro. Default true.
 * @throws {Bloqueado} 429/WAF depois do backoff — a rodada TEM que parar, não continuar gravando zeros
 * @throws {RespostaInvalida} JSON quebrado, 5xx, 4xx inesperado
 */
export async function getJson(url, { podeFaltar = true, tentativas = 7 } = {}) {
  let ultimo = "";
  for (let t = 0; t < tentativas; t++) {
    let r;
    try { r = await fetch(url, { headers: { accept: "*/*" }, signal: AbortSignal.timeout(30000) }); }
    catch (e) { ultimo = `rede: ${e.message.slice(0, 50)}`; await sleep(1500 * (t + 1)); continue; }

    if (r.status === 204) return [];                        // a API AFIRMA: não tem
    if (r.status === 404 && podeFaltar) return [];           // idem, p/ recurso opcional

    // 🔴 BLOQUEIO — o PNCP responde 429 com HTML e sem Retry-After. Backoff longo; não é erro transitório de rede.
    if (r.status === 429) { ultimo = "429 (limite de requisições)"; await sleep(8000 * (t + 1)); continue; }
    const ct = r.headers.get("content-type") || "";
    if (/text\/html/i.test(ct)) { ultimo = "HTML no lugar de JSON (WAF)"; await sleep(8000 * (t + 1)); continue; }

    if (r.status >= 500) { ultimo = `HTTP ${r.status}`; await sleep(3000 * (t + 1)); continue; }
    if (!r.ok) throw new RespostaInvalida(`HTTP ${r.status} — ${url.slice(0, 100)}`);

    try { return lista(await r.json()); }
    catch { throw new RespostaInvalida(`JSON inválido — ${url.slice(0, 100)}`); }
  }
  // esgotou: NÃO devolve []. Gritar é o ponto deste arquivo.
  throw new Bloqueado(`${tentativas} tentativas (${ultimo}) — ${url.slice(0, 100)}`);
}

/**
 * Todas as páginas — ou EXPLODE. **Parcial é pior que nada**: vira um número plausível e errado.
 * PROVA REAL: confere o que veio contra o `totalRegistros` que a própria API declarou.
 * @param {string} base  URL já com `?` e os filtros (sem pagina/tamanhoPagina)
 */
export async function getTodas(base, { tamanho = 50, maxPaginas = 600 } = {}) {
  const out = [];
  let p = 1, esperado = null;
  for (;;) {
    // ⚠️ tamanhoPagina tem MÍNIMO 10 (400: "must be greater than or equal to 10") e máximo 500 medido.
    const url = `${base}${base.includes("?") ? "&" : "?"}pagina=${p}&tamanhoPagina=${Math.min(500, Math.max(10, tamanho))}`;
    let r;
    try { r = await fetch(url, { headers: { accept: "*/*" }, signal: AbortSignal.timeout(30000) }); }
    catch (e) { throw new Bloqueado(`rede na página ${p}: ${e.message.slice(0, 40)} — ${base.slice(0, 70)}`); }

    if (r.status === 204) break;
    if (r.status === 429 || /text\/html/i.test(r.headers.get("content-type") || ""))
      throw new Bloqueado(`429/WAF na página ${p} — ABORTA. Devolver o parcial mentiria. ${base.slice(0, 70)}`);
    if (!r.ok) throw new RespostaInvalida(`HTTP ${r.status} na página ${p} — ${base.slice(0, 70)}`);

    let j;
    try { j = await r.json(); } catch { throw new RespostaInvalida(`JSON inválido na página ${p}`); }
    if (esperado == null) esperado = j?.totalRegistros ?? null;
    const d = lista(j);
    if (!d.length) break;
    out.push(...d);
    if (p >= (j?.totalPaginas || 1)) break;
    if (p > maxPaginas) throw new Bloqueado(`>${maxPaginas} páginas — cortar em silêncio é o erro. ${base.slice(0, 70)}`);
    p++;
  }
  // 🔑 PROVA REAL — a API disse quantos existem; se não bate, a coleta está incompleta e NÃO pode ser gravada.
  if (esperado != null && out.length !== esperado)
    throw new Bloqueado(`INCOMPLETO: ${out.length} de ${esperado} declarados — ${base.slice(0, 70)}`);
  return out;
}

// ─── TESTES ───────────────────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith("pncp_http.mjs")) {
  const C = "https://pncp.gov.br/api/consulta/v1";
  let ok = 0, n = 0;
  const t = async (nome, fn, esperado) => {
    n++;
    let r;
    try { const v = await fn(); r = Array.isArray(v) ? `lista(${v.length})` : String(v); }
    catch (e) { r = e.name; }
    const p = r.startsWith(esperado);
    if (p) ok++;
    console.log(`${p ? "✓" : "✗"} ${nome.padEnd(52)} ${r}${p ? "" : `  (esperado ${esperado})`}`);
  };
  // a NF de SC: prova que o caminho funciona (767 em 2 dias, medido)
  await t("NF de SC volta com dado", () => getJson(`${C}/instrumentoscobranca/inclusao?dataInicial=20260713&dataFinal=20260714&uf=SC&pagina=1&tamanhoPagina=10`), "lista(10)");
  // 404 de recurso que PODE faltar = "não tem" legítimo. Contrato real, sem empenho publicado.
  await t("404 'nenhum empenho' é [] legítimo", () => getJson("https://pncp.gov.br/api/pncp/v1/orgaos/83102400000135/contratos/2026/433/empenhos?pagina=1"), "lista(0)");
  // 400 = EU mandei lixo (CNPJ inválido). Tem que explodir — não é "não tem".
  await t("400 (CNPJ inválido) explode, não vira []", () => getJson("https://pncp.gov.br/api/pncp/v1/orgaos/00000000000000/contratos/2024/1/empenhos?pagina=1", { tentativas: 1 }), "RespostaInvalida");
  await t("rota inexistente explode", () => getJson(`${C}/naoexiste?x=1`, { podeFaltar: false, tentativas: 1 }), "RespostaInvalida");
  // 🔑 A PROVA REAL: paginação incompleta é Bloqueado, não lista curta
  await t("getTodas confere contra totalRegistros", () => getTodas(`${C}/instrumentoscobranca/inclusao?dataInicial=20260713&dataFinal=20260714&uf=SC`), "lista(767)");
  console.log(`\n${ok} de ${n}`);
}
