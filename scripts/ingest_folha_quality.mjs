// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_quality.mjs — folha NOMINAL dos municípios atendidos pela QUALITY SISTEMAS (bloco de MS,
// identificado pelo cadastro oficial do e-Sfinge do TCE-MS — [[pnigp-tcems-sem-folha-cadastro-erp]]).
//
// A CADEIA (REST puro, sem navegador, sem login):
//   1. /folha_de_pagamento/OfficeFinder?entity={slug}&currentMonth={m}&currentYear={a}
//        → {"8":{"id":8,"description":"SECRETARIA…","departments":[{"id":1,"description":"DEPARTAMENTO…"}]}}
//   2. /folha_de_pagamento/RoleFinder?entity={slug}&currentMonth={m}&currentYear={a}&officeId={s}&departmentId={d}
//        → {"Estatutário":{"roles":[{name,cpf,role,classAndLevel,state,admissionDate,baseSalary,
//           gratification,othersEarnings,discounts,netSalary,tenthSalary,vacation,secretaria,lotacao,…}]}}
//
// 🚨 O NOME DO PARÂMETRO DA SECRETARIA É `officeId` — e só ele. `office`, `secretariat`, `secretariatId` e
//    `idOffice` devolvem HTTP 200 com {"erro":"Uma secretaria deve ser escolhida."}: erro que NÃO falha,
//    exatamente o defeito nº 1 ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
// 🚨 `grossSalary` vem ZERO — o bruto real é baseSalary + gratification + othersEarnings + vacation + tenthSalary.
//    Confiar no campo de nome óbvio deixaria o município inteiro "coletado sem valor".
// ⭐ Mês mais CHEIO, não o corrente ([[pnigp-competencia-mais-cheia-nao-a-recente]]).
// 🔒 O portal expõe o CPF inteiro; gravamos MASCARADO.
//
// Uso: UF=MS node scripts/ingest_folha_quality.mjs   ·   SO=Terenos   ·   REFAZ=1
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool(); const q = withRetry(db);
const BASE = "https://web.qualitysistemas.com.br/folha_de_pagamento";
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "x-requested-with": "XMLHttpRequest", accept: "application/json" };
const SO = process.env.SO || null;
const REFAZ = process.env.REFAZ === "1";
const MESES_TESTE = Number(process.env.MESES_TESTE || 3);
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_servidores_quality (
  cod_ibge text, municipio text, uf text, entidade text, competencia text,
  nome text, cpf_masc text, matricula text, cargo text, secretaria text, departamento text,
  vinculo text, classe_nivel text, situacao text, data_admissao text,
  salario_base numeric, gratificacoes numeric, outros numeric, ferias numeric, decimo numeric,
  bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_quality_mun on folha_servidores_quality (cod_ibge)`);
// ⭐ 22/ago/2026 — PODER=legislativo: o coletor já sabia que o slug `camara_municipal_de_x` existe (ele o
//    TROCAVA por prefeitura para não colher o poder errado). Agora esse mesmo slug é o ALVO, e `poder` separa.
await q(`alter table folha_servidores_quality add column if not exists poder text`);
await q(`alter table folha_quality_coleta add column if not exists poder text not null default 'executivo'`);
await q(`do $do$ begin
  if exists (select 1 from pg_constraint where conname = 'folha_quality_coleta_pkey'
               and (select count(*) from unnest(conkey)) = 1) then
    alter table folha_quality_coleta drop constraint folha_quality_coleta_pkey;
    alter table folha_quality_coleta add primary key (cod_ibge, poder);
  end if;
end $do$`);
const PODER = (process.env.PODER || "executivo").toLowerCase();
await q(`create table if not exists folha_quality_coleta (
  cod_ibge text primary key, municipio text, uf text, slug text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

const json = async (url, tent = 3) => {
  for (let t = 0; t < tent; t++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(45000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const txt = await r.text();
      if (/^\s*</.test(txt)) return null;                       // devolveu HTML = rota/param errado
      return JSON.parse(txt);
    } catch (e) { if (t === tent - 1) return null; await dorme(1500 * (t + 1)); }
  }
  return null;
};
const num = (v) => { const n = typeof v === "number" ? v : +String(v ?? "").replace(/\./g, "").replace(",", "."); return Number.isFinite(n) ? n : 0; };
const mascara = (cpf) => { const d = String(cpf || "").replace(/\D/g, "").padStart(11, "0"); return d.length === 11 ? `${d.slice(0, 3)}.***.***-${d.slice(9)}` : null; };
// 🚨 O PREFIXO DO SLUG VARIA: Camapuã é `municipio_de_camapua`, não `prefeitura_municipal_de_camapua` —
// e o backend responde a entidade inexistente com {"erro":"O ip informado nao e valido."}, mensagem que
// parece bloqueio e é só slug errado. Por isso o coletor testa os prefixos conhecidos.
const slugBase = (nome) => nome.normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/\s+ms$/, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const PREFIXOS = ["prefeitura_municipal_de_", "municipio_de_", "prefeitura_de_"];
const slugsDe = (nome) => PREFIXOS.map((p) => p + slugBase(nome));
const slugDe = (nome) => PREFIXOS[0] + slugBase(nome);

// ── alvos: o cadastro do TCE-MS diz quem é Quality; o slug vem da URL descoberta ou do nome ────────────────
const alvos = (await q(`
  select m.cod_ibge, m.nome, m.uf,
         (select p.url_portal_real from portal_real_descoberto p
           where p.cod_ibge=m.cod_ibge and p.url_portal_real ilike '%qualitysistemas%' order by em desc limit 1) url,
         (select d.url_visitada from folha_diagnostico_faltante d
           where d.cod_ibge=m.cod_ibge and d.url_visitada ilike '%qualitysistemas%' limit 1) url2
    from municipios_br m
    join tc_ms_software_house s on s.cod_ibge = m.cod_ibge
   where s.razao_social ilike '%QUALITY%' ${SO ? "and m.nome ilike '%'||$1||'%'" : ""}
   order by m.nome`, SO ? [SO] : [])).rows
  .map((a) => {
    const u = a.url || a.url2 || "";
    // 🚨 a URL descoberta pode ser a da CÂMARA (`camara_municipal_de_…`) — trocar pela prefeitura
    const m = u.match(/transparencia_publica\/([a-z0-9_]+)/i) || u.match(/folha_de_pagamento\/([a-z0-9_]+)/i);
    let slug = m ? m[1] : slugDe(a.nome);
    if (/^camara_/.test(slug) && (process.env.PODER || "executivo").toLowerCase() !== "legislativo")
      slug = slug.replace(/^camara_municipal_de_/, "prefeitura_municipal_de_");
    return { ...a, slug };
  });

// ⭐ fila do LEGISLATIVO: as câmaras que o diagnóstico provou serem Quality (o slug sai da própria URL)
if (PODER === "legislativo") {
  alvos.length = 0;
  for (const r of (await q(`select cod_ibge, municipio nome, uf, coalesce(url_erp_camara, url_camara) url
      from folha_camara_fila where coalesce(erp_camara,'') = 'quality'
        and coalesce(url_erp_camara, url_camara) is not null
        ${SO ? "and municipio ilike '%'||$1||'%'" : ""}`, SO ? [SO] : [])).rows) {
    // 🚨 A URL QUE O DIAGNÓSTICO ACHOU É `/cargos_e_salarios/{slug}` — TABELA DE VENCIMENTOS DO CARGO, não
    //    folha nominal. O diagnóstico marcou "tem dados" porque a tela tem linhas e dinheiro, e é a mesma
    //    armadilha do `plano-de-cargos` no IPM ([[pnigp-lista-sem-valor-nao-e-folha]]).
    //    Daqui se aproveita só o SLUG: a rota da FOLHA quem monta é o coletor.
    const m = String(r.url).match(/qualitysistemas\.com\.br\/[a-z0-9_]+\/([a-z0-9_]+)/i);
    if (m) alvos.push({ ...r, slug: m[1] });
  }
  console.log(`[quality] PODER=legislativo · ${alvos.length} câmaras com slug na URL`);
}

const feitos = REFAZ ? new Set()
  : new Set((await q(`select cod_ibge from folha_quality_coleta where situacao='ok' and poder=$1`, [PODER])).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[quality] ${alvos.length} municípios no cadastro · ${fila.length} na fila`);

const LOTE = 700;
async function grava(regs) {
  const uniq = [...new Map(regs.map((r) => [r._hash, r])).values()];
  for (let i = 0; i < uniq.length; i += LOTE) {
    const p = uniq.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_quality
      (cod_ibge,municipio,uf,entidade,competencia,nome,cpf_masc,matricula,cargo,secretaria,departamento,vinculo,
       classe_nivel,situacao,data_admissao,salario_base,gratificacoes,outros,ferias,decimo,bruto,descontos,liquido,_hash,poder)
      select *, '${PODER}'::text from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[],
        $16::numeric[],$17::numeric[],$18::numeric[],$19::numeric[],$20::numeric[],$21::numeric[],$22::numeric[],$23::numeric[],$24::text[])
      on conflict (_hash) do update set bruto=excluded.bruto, liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("entidade"), c("competencia"), c("nome"), c("cpf_masc"),
       c("matricula"), c("cargo"), c("secretaria"), c("departamento"), c("vinculo"), c("classe_nivel"),
       c("situacao"), c("data_admissao"), c("salario_base"), c("gratificacoes"), c("outros"), c("ferias"),
       c("decimo"), c("bruto"), c("descontos"), c("liquido"), c("_hash")]);
  }
  return uniq.length;
}

// varre um (mês, ano): devolve as linhas de todas as secretarias × departamentos
async function colheMes(a, mes, ano) {
  // testa os prefixos de slug até um responder com secretarias de verdade (não {"erro": …})
  let offices = null;
  for (const s of [a.slug, ...slugsDe(a.nome).filter((x) => x !== a.slug)]) {
    const j = await json(`${BASE}/OfficeFinder?entity=${s}&currentMonth=${mes}&currentYear=${ano}`);
    if (j && typeof j === "object" && !j.erro && Object.keys(j).length) { offices = j; a.slug = s; break; }
  }
  if (!offices || typeof offices !== "object") return null;
  const regs = [];
  for (const off of Object.values(offices)) {
    if (!off || !off.id) continue;
    // secretaria sem departamento também precisa ser consultada (departmentId=0)
    const deps = (off.departments && off.departments.length) ? off.departments : [{ id: 0, description: "" }];
    for (const dep of deps) {
      const j = await json(`${BASE}/RoleFinder?entity=${a.slug}&currentMonth=${mes}&currentYear=${ano}&officeId=${off.id}&departmentId=${dep.id}`);
      if (!j || j.erro) continue;
      for (const grupo of Object.values(j)) {
        for (const r of (grupo?.roles || [])) {
          const base = num(r.baseSalary), grat = num(r.gratification), out = num(r.othersEarnings),
                fer = num(r.vacation), dec = num(r.tenthSalary), desc = num(r.discounts), liq = num(r.netSalary);
          // 🚨 grossSalary vem 0: o bruto é a soma das parcelas (ou o próprio gross, quando preenchido)
          const bruto = num(r.grossSalary) || +(base + grat + out + fer + dec).toFixed(2);
          regs.push({
            cod_ibge: a.cod_ibge, municipio: a.nome, uf: a.uf,
            entidade: r.unidadeGestora || "", competencia: `${String(mes).padStart(2, "0")}-${ano}`,
            nome: r.name || null, cpf_masc: mascara(r.cpf), matricula: r.contract != null ? String(r.contract) : null,
            cargo: r.role || null, secretaria: r.secretaria || off.description || null,
            departamento: r.departamento || dep.description || null,
            vinculo: r.roleTypeDescription || null, classe_nivel: r.classAndLevel || null,
            situacao: r.state || null, data_admissao: r.admissionDate || null,
            salario_base: base, gratificacoes: grat, outros: out, ferias: fer, decimo: dec,
            bruto, descontos: desc, liquido: liq,
            _hash: crypto.createHash("md5").update([a.cod_ibge, r.cpf, r.contract, r.role, off.id, dep.id, mes, ano].join("|")).digest("hex"),
          });
        }
      }
      await dorme(120);
    }
  }
  return regs;
}

const hoje = new Date();
let ok = 0, vazios = 0, erros = 0, total = 0;
for (const [i, a] of fila.entries()) {
  const marca = (situacao, detalhe, comp = null, linhas = 0) =>
    q(`insert into folha_quality_coleta (cod_ibge,municipio,uf,slug,competencia,linhas,situacao,detalhe,poder,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict (cod_ibge,poder) do update set
       competencia=excluded.competencia, linhas=excluded.linhas, situacao=excluded.situacao,
       detalhe=excluded.detalhe, em=now()`, [a.cod_ibge, a.nome, a.uf, a.slug, comp, linhas, situacao, detalhe, PODER]);
  try {
    // ⭐ mês mais CHEIO entre os últimos meses com dados — não o corrente, que vem parcial
    let melhor = null, testados = 0;
    for (let k = 1; k <= 12 && testados < MESES_TESTE; k++) {
      const d = new Date(hoje); d.setDate(1); d.setMonth(hoje.getMonth() - k);
      const regs = await colheMes(a, d.getMonth() + 1, d.getFullYear());
      if (regs === null) { if (k === 1) throw new Error("OfficeFinder não respondeu (slug inválido?)"); continue; }
      if (regs.length) { testados++; if (!melhor || regs.length > melhor.regs.length) melhor = { regs, comp: `${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}` }; }
    }
    if (!melhor) { await marca("vazio", "nenhum mês com folha"); vazios++; console.log(`  ○ [${i + 1}/${fila.length}] ${a.nome}: vazio`); continue; }
    const n = await grava(melhor.regs);
    total += n; ok++;
    await marca("ok", `${melhor.comp}`, melhor.comp, n);
    console.log(`  ✔ [${i + 1}/${fila.length}] ${a.nome}: ${n} servidores (${melhor.comp})`);
  } catch (e) {
    erros++; await marca("erro", String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.nome}: ${String(e.message).slice(0, 80)}`);
  }
}
console.log(`\n[quality] ${total.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${erros} erros`);
console.table((await q(`select count(distinct cod_ibge) municipios, count(*) linhas,
  count(*) filter (where bruto>0) com_valor, count(*) filter (where secretaria is not null and secretaria<>'') com_secretaria
  from folha_servidores_quality`)).rows);
await db.end();
