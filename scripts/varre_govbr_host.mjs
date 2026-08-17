// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// varre_govbr_host.mjs — procura o PRONIM/GovBR nos municípios ainda sem folha, com MOLDES DE HOST ampliados.
//
// 🚨 O molde `webapp1-{slug}.cidade360.cloud` não é o único: já apareceram `{slug}.cidade360.cloud`,
// `{slug}.govbr.cloud`, `webapp1-pm{slug}.cidade360.cloud` (Feliz) e nomes encurtados
// (`webapp1-cachoeira` para Cachoeira do Sul). Cada molde que falta é um município que fica parado com coletor
// pronto — foi o que aconteceu com Cachoeira do Sul (13.023 linhas) e com o ADMRH de Venâncio Aires
// ([[pnigp-admrh-e-pelotas-csv]]).
//
// Prova de vida: `/pronimtb/index.asp?acao=10&item=8` traz o <select> de entidades com os bancos `DW_LC131_AP_n`.
// ⭐ Grava o BANCO da PREFEITURA (nem sempre é o `_0`: em Triunfo é o `_6`).
//
// Uso: UF=RS node scripts/varre_govbr_host.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "RS";
const CONC = Number(process.env.CONC || 8);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36" };
const so = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

await q(`create table if not exists govbr_portal (
  cod_ibge text primary key, municipio text, uf text, host text, banco text default 'DW_LC131_AP_0',
  situacao text, linhas int, detalhe text, em timestamptz default now()
)`);

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const c = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (c) partes.push(`select distinct left(cod_ibge::text,6) i from ${t} where cod_ibge is not null`);
}
const muns = (await q(`select cod_ibge, nome, uf from municipios_br
  where uf=$1 and left(cod_ibge,6) not in (${partes.join(" union ")}) order by nome`, [UF])).rows;
console.log(`[govbr-host] ${muns.length} municípios ${UF} sem folha`);

// os hosts que o diagnóstico já viu (podem trazer o nome encurtado que não se deriva do slug)
const conhecidos = new Map();
for (const r of (await q(`select cod_ibge, url_visitada, url_pessoal from folha_diagnostico_faltante`).catch(() => ({ rows: [] }))).rows) {
  for (const u of [r.url_visitada, r.url_pessoal]) {
    const m = String(u || "").match(/^(?:https?:\/\/)?([^/?#]+)/);
    if (!m || !/cidade360|govbr\.cloud|pronim/i.test(String(u))) continue;
    if (!conhecidos.has(r.cod_ibge)) conhecidos.set(r.cod_ibge, new Set());
    conhecidos.get(r.cod_ibge).add(m[1].replace(/:\d+$/, ""));
  }
}

async function prova(host) {
  // 🚨 `acao=10` não é universal: em Eldorado do Sul essa tela devolve 93 bytes (vazia) e as entidades só
  // aparecem em `acao=4`. Provar com mais de uma ação antes de concluir que não há PRONIM.
  for (const cam of ["/pronimtb/index.asp?acao=10&item=8", "/pronimtb/index.asp?acao=4&item=8",
                     "/PRONIMTB/index.asp?acao=10&item=8", "/PRONIMTB/index.asp?acao=4&item=8"]) {
    for (const esq of ["https", "http"]) {
      try {
        const r = await fetch(`${esq}://${host}${cam}`, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(12000) });
        if (!r.ok) continue;
        const buf = Buffer.from(await r.arrayBuffer());
        let t = buf.toString("utf8");
        if (t.includes("�")) t = buf.toString("latin1");
        const ents = [...t.matchAll(/<option[^>]*value=["']?(DW_[A-Z0-9_]+)["']?[^>]*>([^<]*)</gi)]
          .map((m) => ({ banco: m[1], nome: m[2].trim() }));
        if (ents.length) return { host, esq, ents };
      } catch { /* próximo */ }
    }
  }
  return null;
}

let achados = 0, i = 0;
for (let k = 0; k < muns.length; k += CONC) {
  await Promise.all(muns.slice(k, k + CONC).map(async (m) => {
    const s = so(m.nome);
    const curto = s.replace(/dosul$|donorte$|dooeste$|doleste$/, ""); // "cachoeiradosul" → "cachoeira"
    const hosts = new Set([
      ...(conhecidos.get(m.cod_ibge) || []),
      `webapp1-${s}.cidade360.cloud`, `${s}.cidade360.cloud`, `${s}.govbr.cloud`,
      `webapp1-pm${s}.cidade360.cloud`, `pm${s}.cidade360.cloud`,
      `webapp1-${curto}.cidade360.cloud`, `${curto}.cidade360.cloud`,
    ]);
    for (const h of hosts) {
      const p = await prova(h);
      if (!p) continue;
      // ⭐ o banco da PREFEITURA — não presumir o _0 (em Triunfo é o _6).
      // 🚨 E não bastam as palavras "PREFEITURA|MUNICIPIO" em QUALQUER posição: "FUNDO DE PREVIDENCIA SOCIAL DO
      // MUNICIPIO DE FELIZ" casa com elas e é o RPPS, não a prefeitura. Exigir que o nome COMECE com o rótulo, e
      // excluir explicitamente câmara/fundo/instituto/autarquia/estagiários.
      const ehOutraCoisa = (n) => /^(CAMARA|C[ÂA]MARA)|FUNDO|INSTITUTO|PREVID|AUTARQUIA|SAAE|SAMAE|ESTAGIARI|CONSORCIO/i.test(n.trim());
      const pref = p.ents.find((e) => /^(PREFEITURA|MUNICIPIO|MUNIC[ÍI]PIO)/i.test(e.nome.trim()) && !ehOutraCoisa(e.nome))
                || p.ents.find((e) => !ehOutraCoisa(e.nome));
      if (!pref) {
        console.log(`   ✖ ${m.nome} → ${h} só tem entidade que não é prefeitura (${p.ents.map((e) => e.nome).join(" | ").slice(0, 70)}) — ignorado`);
        continue;
      }
      // 🚨 conferir o nome declarado: host de outro município responde igualzinho
      const nomeDecl = so(pref.nome.replace(/PREFEITURA( MUNICIPAL)?( DE)?|MUNICIPIO( DE)?/gi, ""));
      if (nomeDecl && !nomeDecl.includes(s) && !s.includes(nomeDecl)) {
        console.log(`   ✖ ${m.nome} → ${h} declara "${pref.nome}" — ignorado`);
        continue;
      }
      achados++;
      console.log(`⭐ ${m.nome.padEnd(26)} → ${p.esq}://${h}  ${pref.banco} = ${pref.nome}`);
      await q(`insert into govbr_portal (cod_ibge, municipio, uf, host, banco, situacao, detalhe)
        values ($1,$2,$3,$4,$5,'descoberto',$6)
        on conflict (cod_ibge) do update set host=excluded.host, banco=excluded.banco, detalhe=excluded.detalhe, em=now()`,
        [m.cod_ibge, m.nome, m.uf, h, pref.banco, `varredura de host · ${p.ents.length} entidades`]);
      return;
    }
  }));
  i += Math.min(CONC, muns.length - k);
  process.stdout.write(`   ${i}/${muns.length} · ${achados} achados\r`);
}
console.log(`\n[govbr-host] ${achados} portais PRONIM achados`);
await db.end();
