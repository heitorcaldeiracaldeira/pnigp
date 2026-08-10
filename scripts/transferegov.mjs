// CLIENTE DA API DO TRANSFEREGOV — um lugar só para o contrato, porque ele acabou de mudar inteiro.
//
// ═══ POR QUE ISTO EXISTE, E POR QUE AGORA ═══
// Comunicado Transferegov nº 23/2026: o host `api.transferegov.gestao.gov.br` SERÁ DESLIGADO em
// 31/08/2026. Três ETLs nossas apontavam para ele. Sem esta migração, elas param numa data conhecida —
// e parariam do jeito pior, com a fonte devolvendo erro de rede e ninguém sabendo que era desligamento
// programado e não queda.
//
// ⚠️ NÃO É SÓ TROCAR O DOMÍNIO. Medido em 10/ago contra a especificação OpenAPI do host novo, mudaram
// QUATRO coisas — e cada uma quebraria o consumidor de um jeito diferente:
//   1. HOST      api.transferegov… → api-publica.transferegov…
//   2. CAMINHO   `programa_gestao_agil` → `programas-gestao-agil`   (underscore/singular → hífen/plural)
//   3. PÁGINA    header `Range: 0-999` + `Range-Unit: items` → query `pagina` + `tamanho_da_pagina`
//   4. ENVELOPE  a resposta era o ARRAY cru; agora é `{data, total_pages, total_items, page_number,
//                page_size}`. Quem esperava array receberia um objeto e leria `.length` como undefined —
//                ou seja, "zero linhas" em silêncio, que é o pior desfecho possível.
// A mudança 4 é a traiçoeira: as outras três dão erro; essa dá SUCESSO VAZIO.
//
// ⚠️ A MIGRAÇÃO DO LADO DELES ESTÁ PELA METADE (medido em 10/ago):
//   · `fundoafundo`            → migrado, responde no host novo
//   · transferências especiais → migrado, mas RENOMEADO para `/especiais`
//   · `ted`                    → ainda NÃO existe no host novo (404)
// Por isso o cliente aceita host por fonte: o que já migrou usa o novo, o que não migrou segue no antigo
// até migrar. `TRANSFEREGOV_HOST=` força um host para depurar.
const NOVO = "https://api-publica.transferegov.gestao.gov.br";
const ANTIGO = "https://api.transferegov.gestao.gov.br";   // desligado em 31/08/2026

// nome antigo → nome novo. Fica explícito para o próximo recurso ser um acréscimo, não uma descoberta.
export const RECURSO = {
  "fundoafundo/programa": "fundoafundo/programas",
  "fundoafundo/programa_beneficiario": "fundoafundo/programas-beneficiarios",
  "fundoafundo/programa_gestao_agil": "fundoafundo/programas-gestao-agil",
  "fundoafundo/plano_acao": "fundoafundo/planos-acao",
  "fundoafundo/empenho": "fundoafundo/empenhos",
  "fundoafundo/termo_adesao": "fundoafundo/termos-adesao",
};

const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

/** GET com repetição — 5xx e queda de rede são transitórios; 4xx não é e sobe na hora. */
async function pega(url) {
  let ultimo = null;
  for (let t = 0; t < 5; t++) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(60000) });
      if (r.status >= 500) { ultimo = `HTTP ${r.status}`; await sleep(1500 * (t + 1)); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
      return await r.json();
    } catch (e) { ultimo = e.message; await sleep(1500 * (t + 1)); }
  }
  throw new Error(`Transferegov: ${ultimo} (após 5 tentativas) — ${url}`);
}

/**
 * Percorre um recurso página a página e devolve as linhas.
 * `recurso` aceita o nome ANTIGO (fundoafundo/programa) e é traduzido — assim o chamador não precisa
 * saber que houve migração, e a tradução mora num lugar só.
 */
export async function* paginar(recurso, filtros = {}, tam = 500) {
  const novo = RECURSO[recurso];
  const base = novo ? NOVO : ANTIGO;                       // sem tradução conhecida, segue no antigo
  const caminho = novo || recurso;
  const host = process.env.TRANSFEREGOV_HOST || base;
  for (let pagina = 1; ; pagina++) {
    const qs = new URLSearchParams({ ...filtros, pagina: String(pagina), tamanho_da_pagina: String(tam) });
    const j = await pega(`${host}/${caminho}?${qs}`);
    // o host antigo devolve array cru; o novo, envelope. Aceitar os dois deixa a migração ser gradual.
    const linhas = Array.isArray(j) ? j : (j?.data || []);
    if (!linhas.length) return;
    yield* linhas;
    // com envelope dá para parar pelo total; sem, para quando a página vier menor que o pedido
    const fim = Array.isArray(j) ? linhas.length < tam : (j.total_pages != null && pagina >= j.total_pages);
    if (fim) return;
    await sleep(120);
  }
}

/** Junta tudo numa lista — para recursos pequenos, onde streaming não paga o esforço. */
export async function tudo(recurso, filtros = {}, tam = 500) {
  const out = [];
  for await (const x of paginar(recurso, filtros, tam)) out.push(x);
  return out;
}
