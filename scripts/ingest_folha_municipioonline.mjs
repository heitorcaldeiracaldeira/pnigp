// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_municipioonline.mjs — folha nominal do **Município Online** (Gênesis / transparencia.cloud).
//
// POR QUÊ: Sergipe era o ÚNICO estado com 0% de folha — 75 municípios, nenhum. O TCE-SE não publica folha de
// jurisdicionado (a API de dados abertos dele só tem contratos e fornecedores; a tela "Pessoal" é a folha do
// PRÓPRIO tribunal). O dado está nos portais municipais, e quase todos rodam o mesmo produto.
//
// 🚨 O produto se esconde atrás de três fachadas — a mesma instalação aparece como:
//    · `{municipio}.se.gov.br/portaltransparencia/?servico=cidadao/servidores`  (white-label no domínio da prefeitura)
//    · `genesis.transparencia.cloud/servicos/{CNPJ}/cidadao/servidores`          (front do fornecedor)
//    · `municipioonline.com.br/{uf}/{pm|prefeitura}/{slug}/cidadao/servidor`     (o sistema de verdade)
//    Sondar por nome de fornecedor não acha nenhuma delas: a varredura de 7 ERPs conhecidos deu 0/75 em SE.
//    Quem revela é o HOST do link de "servidores", seguido até o fim.
//
// ⭐ Por que Sergipe é tão uniforme: o HTML declara `serigySchema="https://serigy.tce.se.gov.br/comum/
//    recursos-humanos.html"` — o layout de transparência é PADRONIZADO PELO TCE-SE (projeto Serigy). O tribunal
//    não publica o dado, mas dita a forma de publicá-lo.
//
// A rota: POST `{base}/dados?cn={CNPJ}&a={ano}&m={mes}&tf=1&tc=0&b=&v=&uo=0&aa=0`, corpo DataTables.
// 🚨 Três coisas que, faltando, devolvem **HTTP 500** e fazem o endpoint parecer quebrado:
//    1. o header **`x-token`**, que sai de `var haDDOS = '...'` no HTML da própria página;
//    2. `order[0][column]` / `order[0][dir]`;
//    3. `pageNumber`.
//    O nome da variável (haDDOS) diz para que serve: é freio de taxa. Por isso este coletor vai devagar,
//    identificado, um município por vez.
// ⚠️ `length=5000` traz o município inteiro numa requisição; o padrão da tela (25) exigiria dezenas.
//
// Uso: node scripts/ingest_folha_municipioonline.mjs   · UF=se · SO=neopolis · ANO=2026 · DESCOBRIR=1
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = (process.env.UF || "se").toLowerCase();
const SO = process.env.SO || null;
const ANO = process.env.ANO ? +process.env.ANO : new Date().getFullYear();
const PAUSA = +(process.env.PAUSA || 900);
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const UA = "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)";

await q(`create table if not exists folha_mo_portal (
  cod_ibge text primary key, municipio text, uf text, base_url text, ativo boolean default true,
  descoberto_em timestamptz default now()
)`);
await q(`create table if not exists folha_servidores_municipioonline (
  cod_ibge text, municipio text, uf text, entidade text, cnpj text, competencia text,
  matricula text, nome text, cpf_masc text, cargo text, tipo_cargo text, nivel text,
  salario_base numeric, bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_mo_mun on folha_servidores_municipioonline (cod_ibge, competencia)`);
await q(`create table if not exists folha_mo_coleta (
  cod_ibge text primary key, municipio text, uf text, competencia text, linhas int, com_valor int,
  entidades int, situacao text, detalhe text, em timestamptz default now()
)`);

const money = (s) => {
  if (s == null) return null;
  const t = String(s).replace(/R\$|\s|\./g, "").replace(",", ".");
  const n = +t; return Number.isFinite(n) ? n : null;
};
const lim = (v) => { const t = String(v ?? "").trim(); return t && t !== "-" ? t : null; };
const chave = (n) => String(n || "").toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

// ── a sessão de um município: token anti-DDoS + cookies ─────────────────────────────────────────────────────────
async function sessao(base) {
  const r = await fetch(base, { headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(120000) })
    .catch(() => null);
  if (!r?.ok) return null;
  const html = await r.text();
  // "AVISO O serviço solicitado está indisponível ou não foi contratado pelo órgão" — módulo não contratado
  if (/n[ãa]o foi contratado pelo [óo]rg[ãa]o/i.test(html)) return { indisponivel: true };
  const token = (html.match(/haDDOS\s*=\s*'([0-9a-f-]{36})'/i) || [])[1];
  if (!token) return null;
  const cookie = (r.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  return { token, cookie, html };
}
const cabecalhos = (base, s) => ({ "user-agent": UA, "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
  "x-requested-with": "XMLHttpRequest", "x-token": s.token, accept: "application/json, text/javascript, */*; q=0.01",
  referer: base, cookie: s.cookie });

// 🚨 o corpo é DataTables COMPLETO: sem `order[]` e `pageNumber` a resposta é 500
const COLS = [["detalhe", "detalhe", false], ["nm_funcionario", "nmfuncionario", true], ["nu_matricula", "numatricula", true],
  ["nu_cpf", "nucpf", true], ["nm_cargo", "nmcargo", true], ["nm_tipoCargo", "nmtipocargo", true],
  ["nm_nivel", "nmnivel", true], ["vl_base", "vlbase", true], ["vl_provento", "vlprovento", true],
  ["vl_desconto", "vldesconto", true], ["vl_liquido", "vlliquido", true]];
const corpo = (start, length) => {
  const p = new URLSearchParams(); p.set("draw", "1");
  COLS.forEach(([d, n, ord], i) => { p.set(`columns[${i}][data]`, d); p.set(`columns[${i}][name]`, n);
    p.set(`columns[${i}][searchable]`, "true"); p.set(`columns[${i}][orderable]`, String(ord));
    p.set(`columns[${i}][search][value]`, ""); p.set(`columns[${i}][search][regex]`, "false"); });
  p.set("order[0][column]", "0"); p.set("order[0][dir]", "asc");
  p.set("start", String(start)); p.set("length", String(length));
  p.set("search[value]", ""); p.set("search[regex]", "false");
  p.set("pageNumber", String(Math.floor(start / Math.max(1, length)) + 1));
  return p.toString();
};
async function folha(base, s, cnpj, ano, mes, len = 5000) {
  const u = `${base}/dados?cn=${cnpj}&a=${ano}&m=${mes}&tf=1&tc=0&b=&v=&uo=0&aa=0`;
  for (let t = 1; t <= 3; t++) {
    const r = await fetch(u, { method: "POST", headers: cabecalhos(base, s), body: corpo(0, len), signal: AbortSignal.timeout(300000) })
      .catch(() => null);
    if (r?.ok) { const j = await r.json().catch(() => null); if (j) return j; }
    await dorme(2500 * t);
  }
  return null;
}
const unidades = async (base, s, ano) => {
  const r = await fetch(`${base}?operacao=UnidGestora&ano=${ano}`, { headers: cabecalhos(base, s), signal: AbortSignal.timeout(120000) })
    .catch(() => null);
  if (!r?.ok) return [];
  const j = await r.json().catch(() => null);
  return Array.isArray(j?.[1]) ? j[1] : [];
};

// ── descoberta: qual caminho o município usa ────────────────────────────────────────────────────────────────────
// ⚠️ o path varia entre `/{uf}/pm/{slug}` e `/{uf}/prefeitura/{slug}` sem regra aparente — testar os dois
if (process.env.DESCOBRIR === "1" || !(await q(`select 1 from folha_mo_portal where lower(uf)=$1 limit 1`, [UF])).rows.length) {
  const muns = (await q(`select cod_ibge, nome, uf from municipios_br where lower(uf)=$1 order by nome`, [UF])).rows;
  console.log(`[mo] descobrindo em ${muns.length} municípios de ${UF.toUpperCase()}…`);
  let achei = 0;
  for (const m of muns) {
    const nome = m.nome.replace(/ [A-Z]{2}$/, "");
    const slug = chave(nome);
    let base = null;
    for (const seg of ["pm", "prefeitura"]) {
      const u = `https://www.municipioonline.com.br/${UF}/${seg}/${slug}/cidadao/servidor`;
      const s = await sessao(u);
      await dorme(400);
      if (s?.token || s?.indisponivel) { base = u; break; }   // existe; sem módulo também vale registrar
    }
    if (!base) continue;
    achei++;
    await q(`insert into folha_mo_portal (cod_ibge,municipio,uf,base_url) values ($1,$2,$3,$4)
             on conflict (cod_ibge) do update set base_url=excluded.base_url`, [m.cod_ibge, nome, m.uf, base]);
    process.stdout.write(`\r   ${achei} portais encontrados (último: ${nome.slice(0, 24)})            `);
  }
  console.log(`\n[mo] ${achei} municípios de ${UF.toUpperCase()} no Município Online`);
  if (process.env.APENAS_DESCOBRIR === "1") { await db.end(); process.exit(0); }
}

// ⚠️ filtrar por `base_url` também: o nome no banco vem acentuado ("Neópolis") e SO=neopolis não casaria
// SO_FALHAS=1 refaz só o que não fechou — não requeima o que já veio
const alvos = (await q(`select p.* from folha_mo_portal p
  ${process.env.SO_FALHAS === "1" ? "left join folha_mo_coleta c on c.cod_ibge = p.cod_ibge" : ""}
  where p.ativo and lower(p.uf)=$1
  ${process.env.SO_FALHAS === "1" ? "and coalesce(c.situacao,'') <> 'ok'" : ""}
  ${SO ? "and (p.municipio ilike '%'||$2||'%' or p.cod_ibge=$2 or p.base_url ilike '%'||$2||'%')" : ""}
  order by p.municipio`, SO ? [UF, SO] : [UF])).rows;
console.log(`[mo] ${alvos.length} portais na fila · ano-alvo ${ANO}\n`);

let ok = 0, vazios = 0, total = 0;
for (const a of alvos) {
  const marca = (situacao, detalhe, comp = null, linhas = 0, comValor = 0, ents = 0) =>
    q(`insert into folha_mo_coleta (cod_ibge,municipio,uf,competencia,linhas,com_valor,entidades,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
       on conflict (cod_ibge) do update set competencia=excluded.competencia, linhas=excluded.linhas,
         com_valor=excluded.com_valor, entidades=excluded.entidades, situacao=excluded.situacao,
         detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, comp, linhas, comValor, ents, situacao, detalhe]);
  try {
    const s = await sessao(a.base_url);
    if (s?.indisponivel) { await marca("nao_contratado", "portal existe, módulo de folha não contratado"); vazios++;
      console.log(`  ○ ${a.municipio.padEnd(26)} módulo de folha não contratado`); continue; }
    if (!s?.token) { await marca("sem_token", "página não entregou o token"); vazios++;
      console.log(`  ✖ ${a.municipio.padEnd(26)} sem token`); continue; }

    // 🚨 NÃO inventar o ano. A própria página publica, no `<select>` de exercício, os anos que ela tem — e muitos
    //    municípios pararam de alimentar há tempos (Boquim: 2018 · Carira: 2021 · Arauá: 2021). Recuar um número
    //    fixo de anos a partir do corrente perdia 15 dos 60 municípios de SE, dando "sem unidade gestora" num
    //    portal que estava servindo o dado normalmente ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
    const anosPagina = [...new Set([...s.html.matchAll(/<option[^>]+value=["'](20\d\d)["']/gi)].map((m) => +m[1]))]
      .sort((x, y) => y - x);
    const candidatos = (anosPagina.length ? anosPagina : [ANO, ANO - 1, ANO - 2]).slice(0, 8);

    // ⚠️ ter unidade gestora no ano não garante ter folha: General Maynard lista UG em 2026 e não tem um mês
    //    sequer. Só encerra a busca o ano que devolve LINHA.
    let ano = null, ugs = [], melhor = null, medidas = [];
    for (const tentativa of candidatos) {
      const u = await unidades(a.base_url, s, tentativa);
      await dorme(300);
      if (!u.length) continue;
      // ⚠️ mês mais CHEIO, não o mais recente: o corrente vem parcial (em Neópolis 08 veio ZERO e 07 tinha 678)
      const principal = u.find((x) => /PREFEITURA/i.test(x.nm_unidGestora)) || u[0];
      const med = []; let mel = null;
      for (let mes = 12; mes >= 1; mes--) {
        const mm = String(mes).padStart(2, "0");
        const j = await folha(a.base_url, s, principal.nu_cnpj, tentativa, mm, 1);
        const n = +(j?.recordsTotal || 0);
        await dorme(PAUSA);
        if (n > 0) { med.push(`${mm}:${n}`); if (!mel || n > mel.n) mel = { mm, n }; }
        if (med.length >= 4 && mel && n < mel.n * 0.8) break;   // já passou do pico
      }
      if (mel) { ano = tentativa; ugs = u; melhor = mel; medidas = med; break; }
    }
    if (!melhor) { await marca("vazio", `sem folha nos anos publicados (${candidatos.slice(0, 6).join(",")})`); vazios++;
      console.log(`  ✖ ${a.municipio.padEnd(26)} sem folha em ${candidatos.slice(0, 4).join(",")}`); continue; }
    const comp = `${ano}${melhor.mm}`;

    const regs = [];
    for (const ug of ugs) {
      const j = await folha(a.base_url, s, ug.nu_cnpj, ano, melhor.mm);
      await dorme(PAUSA);
      for (const d of (j?.data || [])) {
        const nome = lim(d.nm_funcionario);
        if (!nome) continue;
        const bruto = money(d.vl_proventos), desc = money(d.vl_descontos), liq = money(d.vl_liquido);
        regs.push({ cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf,
          entidade: lim(ug.nm_unidGestora), cnpj: ug.nu_cnpj, competencia: comp,
          matricula: lim(d.nu_matricula), nome, cpf_masc: lim(d.nu_cpf), cargo: lim(d.nm_cargo),
          tipo_cargo: lim(d.nm_tipoCargo), nivel: lim(d.nm_nivel),
          salario_base: money(d.vl_salario), bruto, descontos: desc, liquido: liq,
          // o valor entra no hash: sem ele, dois vínculos do mesmo servidor no mesmo mês colapsam numa linha
          _hash: crypto.createHash("md5")
            .update([a.cod_ibge, comp, ug.nu_cnpj, d.nu_matricula, nome, d.nm_cargo, d.vl_proventos].join("¦")).digest("hex") });
      }
    }
    if (!regs.length) { await marca("vazio", "unidades responderam sem linha", comp); vazios++;
      console.log(`  ✖ ${a.municipio.padEnd(26)} sem linha`); continue; }

    const m = new Map(); for (const r of regs) m.set(r._hash, r);
    const arr = [...m.values()];
    for (let i = 0; i < arr.length; i += 500) {
      const p = arr.slice(i, i + 500); const c = (f) => p.map((x) => x[f]);
      await q(`insert into folha_servidores_municipioonline
        (cod_ibge,municipio,uf,entidade,cnpj,competencia,matricula,nome,cpf_masc,cargo,tipo_cargo,nivel,
         salario_base,bruto,descontos,liquido,_hash)
        select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
          $9::text[],$10::text[],$11::text[],$12::text[],$13::numeric[],$14::numeric[],$15::numeric[],$16::numeric[],$17::text[])
        on conflict (_hash) do update set bruto=excluded.bruto, descontos=excluded.descontos,
          liquido=excluded.liquido, _coletado_em=now()`,
        [c("cod_ibge"), c("municipio"), c("uf"), c("entidade"), c("cnpj"), c("competencia"), c("matricula"),
         c("nome"), c("cpf_masc"), c("cargo"), c("tipo_cargo"), c("nivel"), c("salario_base"), c("bruto"),
         c("descontos"), c("liquido"), c("_hash")]);
    }
    const comValor = arr.filter((r) => r.bruto > 0).length;
    await marca("ok", `mês mais cheio de ${medidas.length} sondados (${medidas.slice(0, 5).join(" ")})`, comp, arr.length, comValor, ugs.length);
    ok++; total += arr.length;
    console.log(`  ✔ ${a.municipio.padEnd(26)} ${String(arr.length).padStart(6)} servidores · ${comp} · ${ugs.length} entidades · ${comValor} com valor`);
  } catch (e) {
    await marca("erro", String(e?.cause?.message || e.message).slice(0, 200));
    console.log(`  ✖ ${a.municipio.padEnd(26)} ${String(e?.cause?.message || e.message).slice(0, 70)}`);
  }
}
console.log(`\n[mo] ${ok} municípios com folha · ${vazios} sem · ${total.toLocaleString("pt-BR")} servidores`);
await db.end();
