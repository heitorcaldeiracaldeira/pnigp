// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// acha_prefeitura_do_camara.mjs — 10 municípios foram diagnosticados com DADOS numa URL da CÂMARA. A guarda da
// fila (certa) os exclui, e eles ficam para sempre fora da coleta. Mas o portal da PREFEITURA costuma estar no
// MESMO host, um caminho ao lado: `{host}/transparenciacamara/` → `{host}/transparencia/`.
//
// ⭐ Medido em 19/ago/2026 em Jaci: `200.95.195.126:8079/transparenciacamara/` (câmara) e
// `200.95.195.126:8079/transparencia/` = **PREFEITURA MUNICIPAL DE JACI**. Mesmo IP, mesma porta.
// 🚨 E o inverso também engana: **Rancharia** está em `scpi-camara.rancharia.sp.gov.br` e a entidade do portal é
//    "MUNICIPIO DE RANCHARIA" — o NOME DO HOST não é prova de câmara. Quem decide é a entidade que a tela declara
//    ([[pnigp-radar-mapeou-a-camara-causa-nacional]], [[pnigp-scpi-host-proprio-e-entidade-ranqueada]]).
//
// ⚖️ O QUE ESTE SCRIPT PODE E O QUE NÃO PODE PROVAR (medido em 19/ago): por HTTP puro ele NÃO consegue dizer
//    qual entidade a tela está mostrando — no SCPI o combo `cmbEntidadeContabil_I` é preenchido por JS e chega
//    VAZIO. Procurar "PREFEITURA MUNICIPAL DE X" no HTML acha o nome em qualquer canto (lista de entidades,
//    rodapé, script) e produz FALSO POSITIVO: dos 10 "achados", o coletor — que abre com navegador e lê o combo —
//    derrubou Jaci, Santo Expedito e Duartina(url velha) como CÂMARA MUNICIPAL.
//    Portanto: aqui se produz CANDIDATO, não veredito. Quem decide a entidade é o coletor, que já tem a guarda
//    ([[pnigp-scpi-host-proprio-e-entidade-ranqueada]]). O fluxo funciona porque a validação vem depois.
//
// Só grava candidato cuja tela declara PREFEITURA/MUNICÍPIO. DRY por padrão; APLICAR=1 grava.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool(); const q = withRetry(db);
const APLICAR = process.env.APLICAR === "1";
const H = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };

// 🚨 o produto do diagnóstico pode vir NULO — e cair no default 'scpi' rotula errado quem é de outro fornecedor
//    (Nova Aurora/GO é megasoft). O host diz o produto quando o diagnóstico não sabe.
const produtoDoHost = (url, produto) => {
  if (produto) return produto;
  const h = url.toLowerCase();
  if (h.includes("megasofttransparencia")) return "megasoft";
  if (h.includes("sgpcloud") || h.includes("dcfiorilli") || /:(8079|5656|879)\//.test(h)) return "scpi";
  return null;
};

const variantes = (url) => {
  const v = new Set();
  const add = (u) => { if (u && u !== url) v.add(u); };
  add(url.replace(/transparenciacamara/i, "transparencia"));
  add(url.replace(/transparenciacm/i, "transparencia"));
  add(url.replace(/scpi-camara\./i, "scpi."));
  add(url.replace(/camara([a-z]+)\./i, "$1."));
  add(url.replace(/\.camara([a-z]+)\./i, ".$1."));
  add(url.replace(/transparencia\.camara/i, "transparencia."));
  return [...v].map((u) => u.replace(/[#?].*$/, ""));
};

const alvos = (await q(`select d.cod_ibge, d.municipio, d.uf, d.produto, d.url_pessoal
  from folha_diagnostico_faltante d
  where d.veredito='tem_dados'
    and d.url_pessoal ~* '(transparenciacm|camara|c[âa]mara|\\.leg\\.br|\\-cm\\.)'
  order by d.uf, d.municipio`)).rows;
console.log(`${alvos.length} municípios diagnosticados numa URL de câmara\n`);

let achados = 0;
for (const a of alvos) {
  const testes = variantes(String(a.url_pessoal));
  let ok = null;
  for (const u of testes) {
    try {
      const r = await fetch(u, { headers: H, redirect: "follow", signal: AbortSignal.timeout(25000) });
      if (!r.ok) continue;
      const t = await r.text();
      // 🚨🚨 A PROVA É O COMBO DE ENTIDADE SELECIONADA, NÃO UMA MENÇÃO QUALQUER NO HTML. Procurar
      //    /PREFEITURA MUNICIPAL DE X/ em qualquer lugar da página deu 10 "achados" e o coletor derrubou três
      //    deles: em Jaci, Santo Expedito e Duartina o `cmbEntidadeContabil` declara **CÂMARA MUNICIPAL**, e o
      //    nome da prefeitura aparecia noutro canto do HTML (lista de entidades, rodapé, script). Ler a entidade
      //    ATIVA — `#cmbEntidadeContabil_I` no SCPI — é o que separa o portal da prefeitura do da câmara
      //    ([[pnigp-scpi-host-proprio-e-entidade-ranqueada]]).
      const ativa = (t.match(/id="cmbEntidadeContabil_I"[^>]*value="([^"]*)"/i) || [])[1];
      if (ativa && /c[âa]mara/i.test(ativa)) continue;             // a tela ATIVA é a câmara: não serve
      const ent = ativa && /prefeitura|munic[íi]pio/i.test(ativa) ? ativa
        : (t.match(/(PREFEITURA (MUNICIPAL )?DE [^"<]{0,40}|MUNIC[ÍI]PIO DE [^"<]{0,40})/i) || [])[0];
      const camara = /C[ÂA]MARA MUNICIPAL DE/i.test(t) && !ent;
      if (ent) { ok = { url: u, entidade: ent.replace(/\s+/g, " ").trim() }; break; }
      // 🚨 SPA: quando a página vem com poucos KB, o nome do ente é escrito por JS e o HTTP puro não vê nada —
      //    Nova Aurora/GO respondia 2 KB e só no navegador aparece "PREFEITURA DE Nova Aurora". Marcar para
      //    conferência em vez de descartar ([[pnigp-spa-nao-e-obstaculo-e-nao-publicacao]]).
      if (t.length < 6000 && !camara) { ok = { url: u, entidade: "(SPA — confirmar no navegador)", spa: true }; break; }
      if (camara) continue;
    } catch { /* host/caminho não existe */ }
  }
  if (ok) {
    achados++;
    console.log(`  ✅ ${a.uf} ${a.municipio.padEnd(20)} ${ok.entidade.slice(0, 34).padEnd(34)} ${ok.url.slice(0, 60)}`);
    if (APLICAR) {
      await q(`insert into folha_portal_candidato (cod_ibge, municipio, uf, produto, url, achado_via, achado_em)
        values ($1,$2,$3,$4,$5,'derivado da url da camara (19/ago/2026)', now())
        on conflict do nothing`, [a.cod_ibge, a.municipio, a.uf, produtoDoHost(ok.url, a.produto), ok.url]);
    }
  } else {
    console.log(`  ·  ${a.uf} ${a.municipio.padEnd(20)} nenhuma variante declarou prefeitura (${testes.length} testadas)`);
  }
}
console.log(`\n${achados} portais de PREFEITURA achados${APLICAR ? " e gravados na fila" : " (DRY — APLICAR=1 grava)"}`);
await db.end();
