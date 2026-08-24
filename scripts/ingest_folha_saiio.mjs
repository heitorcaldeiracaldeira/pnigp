// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_saiio.mjs — folha dos portais SPA `transparencia.{slug}.al.gov.br` que são frontend da API
// CENTRAL `sai2.io.org.br/v3` (io.org.br). Descoberto em 20/ago/2026: o HTML desses portais tem 31 KB e monta
// tudo por JS, então o coletor HTTP do `algov` os classificava como "sem tabela nominal".
//
// O contrato (três chamadas, nenhuma exige login):
//   GET  /v3/orgao/info                        (header `origin` do município) → cod_orgao_org + NOME DO ÓRGÃO
//   POST /v3/CargosPessoal/Listar              {des_nome_pec:null, ano:"", mes:"", cod_orgao_org} → todos os
//        servidores (Penedo: 2.886) — com nome, cargo, lotação, vínculo, admissão e CPF; **sem valor**
//   GET  /v3/CargosPessoal/Detalhes?cod_orgao_org=&num_cpf_pec=  → **num_valor_salario_base_sa2** + INSS + IR
//        + `num_ano_competencia_sa2`/`num_mes_competencia_sa2`
//
// ⭐ `/v3/orgao/info` devolve "Prefeitura Municipal de X" — é a PROVA DE ENTIDADE que faltava nos outros
//    produtos, onde só o combo (renderizado por JS) dizia se a tela era da prefeitura ou da câmara
//    ([[pnigp-prefeitura-ao-lado-da-camara]]).
//
// 🚨 O VALOR NÃO ESTÁ NA LISTA: `val_salarial_pec` vem NULL em todas as competências. O salário mora no
//    DETALHE, um por servidor — e o campo se chama `num_valor_salario_base_sa2`, não `val_salarial_pec`
//    ([[pnigp-ficha-individual-e-onde-mora-o-valor]]). Custo: uma requisição por pessoa.
//
// 🔒 A API devolve o CPF **COMPLETO** (a tela mascara, a API não). Ele é usado só em memória para montar a
//    chamada do detalhe e é gravado MASCARADO. Não expor dado pessoal que a própria fonte já expõe por descuido.
//
// Uso: node scripts/ingest_folha_saiio.mjs   ·   SO=Penedo   ·   TETO=4000   ·   PAUSA=200   ·   REFAZ=1
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "node:crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool(); const q = withRetry(db);
const SO = process.env.SO || null;
const UF = process.env.UF || "AL";
const TETO = Number(process.env.TETO || 4000);
const PAUSA = Number(process.env.PAUSA || 200);
const REFAZ = process.env.REFAZ === "1";
const API = "https://sai2.io.org.br/v3";
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const chave = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const lim = (s) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t || null; };
const mascara = (cpf) => { const d = String(cpf || "").replace(/\D/g, ""); return d.length === 11 ? `${d.slice(0, 3)}.***.***-${d.slice(9)}` : null; };

await q(`create table if not exists folha_servidores_saiio (
  cod_ibge text, municipio text, uf text, cod_orgao int, competencia text,
  matricula text, nome text, cpf_masc text, cargo text, lotacao text, vinculo text, admissao text,
  carga_horaria text, bruto numeric, desconto_inss numeric, desconto_ir numeric,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_saiio_mun on folha_servidores_saiio (cod_ibge)`);
await q(`create table if not exists folha_saiio_coleta (
  cod_ibge text primary key, municipio text, uf text, cod_orgao int, orgao text,
  linhas int, com_valor int, situacao text, detalhe text, em timestamptz default now())`);

const h = (origin) => ({ "content-type": "application/json", accept: "application/json",
  "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)", origin, referer: origin + "/" });

const alvos = (await q(`select m.cod_ibge, m.nome municipio, m.uf from municipios_br m
  where m.uf = $1 ${SO ? "and m.nome ilike '%'||$2||'%'" : ""} order by m.nome`, SO ? [UF, SO] : [UF])).rows;
const feitos = REFAZ ? new Set() : new Set((await q(`select cod_ibge from folha_saiio_coleta where situacao in ('ok','sem_api','sem_lista')`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[saiio] ${fila.length} municípios de ${UF} na fila`);

let ok = 0, total = 0;
for (const a of fila) {
  const origin = `https://transparencia.${chave(a.municipio)}.${UF.toLowerCase()}.gov.br`;
  const marca = (situacao, detalhe, cod = null, orgao = null, linhas = 0, comValor = 0) =>
    q(`insert into folha_saiio_coleta (cod_ibge,municipio,uf,cod_orgao,orgao,linhas,com_valor,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict (cod_ibge) do update set cod_orgao=excluded.cod_orgao,
       orgao=excluded.orgao, linhas=excluded.linhas, com_valor=excluded.com_valor, situacao=excluded.situacao,
       detalhe=excluded.detalhe, em=now()`, [a.cod_ibge, a.municipio, a.uf, cod, orgao, linhas, comValor, situacao, detalhe]);

  // 1) o órgão existe nessa API? e é PREFEITURA?
  let info;
  try {
    const r = await fetch(`${API}/orgao/info`, { headers: h(origin), signal: AbortSignal.timeout(30000) });
    info = await r.json();
  } catch { continue; }                                   // host do município não existe: nem é alvo
  if (!info || !info.cod_orgao_org) { await marca("sem_api", "host responde mas /orgao/info não devolve cod_orgao_org"); continue; }
  const orgao = lim(info.des_nome_org || info.des_nome_fantasia_org) || "";
  if (/c[âa]mara|legislativ/i.test(orgao)) { await marca("camara", `orgao declarado: ${orgao}`, info.cod_orgao_org, orgao); continue; }

  // 2) a lista (sem valor)
  let lista = [];
  try {
    const r = await fetch(`${API}/CargosPessoal/Listar`, { method: "POST", headers: h(origin),
      body: JSON.stringify({ des_nome_pec: null, ano: "", mes: "", cod_orgao_org: info.cod_orgao_org }),
      signal: AbortSignal.timeout(120000) });
    const j = await r.json();
    lista = Array.isArray(j) ? j : [];
  } catch (e) { await marca("erro", `Listar: ${String(e.message).slice(0, 80)}`, info.cod_orgao_org, orgao); continue; }
  if (!lista.length) { await marca("sem_lista", "CargosPessoal/Listar devolveu vazio", info.cod_orgao_org, orgao); continue; }

  // 3) o VALOR, um por servidor. ⚠️ TETO evita disparar dezenas de milhares de chamadas sem decisão explícita.
  if (lista.length > TETO) {
    await marca("grande_pendente", `${lista.length} servidores acima do teto ${TETO} — precisa decisão`, info.cod_orgao_org, orgao, lista.length);
    console.log(`  ⏸ ${a.municipio.padEnd(22)} ${lista.length} servidores — acima do teto, não coletado`);
    continue;
  }
  const regs = [];
  for (const s of lista) {
    const cpf = String(s.num_cpf_pec || "").replace(/\D/g, "");
    if (!cpf) continue;
    try {
      const r = await fetch(`${API}/CargosPessoal/Detalhes?cod_orgao_org=${info.cod_orgao_org}&num_cpf_pec=${cpf}`,
        { headers: h(origin), signal: AbortSignal.timeout(45000) });
      const j = await r.json();
      for (const d of (Array.isArray(j) ? j : [j]).filter(Boolean)) {
        const comp = d.num_ano_competencia_sa2 && d.num_mes_competencia_sa2
          ? `${d.num_ano_competencia_sa2}${String(d.num_mes_competencia_sa2).padStart(2, "0")}` : null;
        regs.push({
          cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, cod_orgao: info.cod_orgao_org, competencia: comp,
          matricula: lim(d.des_matricula_servidor_sa2), nome: lim(s.des_nome_pec), cpf_masc: mascara(cpf),
          cargo: lim(d.des_cargo_emprego_pec) || lim(s.des_cargo_emprego_pec) || lim(d.des_cargo_emprego_comissionado_pec),
          lotacao: lim(d.des_lotacao_principal_pec) || lim(s.des_lotacao_principal_pec),
          vinculo: lim(d.des_vinculo_pec) || lim(s.des_vinculo_pec), admissao: (d.dat_admissao_pec || "").slice(0, 10) || null,
          carga_horaria: lim(d.num_carga_horaria_cargo_sa2), bruto: Number(d.num_valor_salario_base_sa2) || null,
          desconto_inss: Number(d.num_valor_desconto_inss_sa2) || null, desconto_ir: Number(d.num_valor_desconto_ir_sa2) || null,
        });
      }
    } catch { /* servidor sem detalhe: segue */ }
    await dorme(PAUSA);
  }
  if (!regs.length) { await marca("vazio", "lista tinha servidores mas nenhum detalhe respondeu", info.cod_orgao_org, orgao, lista.length); continue; }

  const uniq = new Map();
  for (const r of regs) {
    const hh = crypto.createHash("sha1").update([r.cod_ibge, r.competencia, r.matricula, r.nome, r.bruto].join("|")).digest("hex");
    if (!uniq.has(hh)) uniq.set(hh, { ...r, _hash: hh });
  }
  const arr = [...uniq.values()];
  for (let i = 0; i < arr.length; i += 500) {
    const parte = arr.slice(i, i + 500); const N = 17;
    const vals = parte.map((_, k) => `(${Array.from({ length: N }, (_, j) => `$${k * N + j + 1}`).join(",")})`).join(",");
    await q(`insert into folha_servidores_saiio (cod_ibge,municipio,uf,cod_orgao,competencia,matricula,nome,cpf_masc,
      cargo,lotacao,vinculo,admissao,carga_horaria,bruto,desconto_inss,desconto_ir,_hash)
      values ${vals} on conflict (_hash) do update set bruto=excluded.bruto, _coletado_em=now()`,
      parte.flatMap((r) => [r.cod_ibge, r.municipio, r.uf, r.cod_orgao, r.competencia, r.matricula, r.nome, r.cpf_masc,
        r.cargo, r.lotacao, r.vinculo, r.admissao, r.carga_horaria, r.bruto, r.desconto_inss, r.desconto_ir, r._hash]));
  }
  const comValor = arr.filter((r) => r.bruto > 0).length;
  await marca("ok", `${comValor} de ${arr.length} com salário`, info.cod_orgao_org, orgao, arr.length, comValor);
  ok++; total += arr.length;
  console.log(`  ⭐ ${a.municipio.padEnd(22)} ${String(arr.length).padStart(5)} servidores · ${comValor} com salário · ${orgao.slice(0, 34)}`);
}
console.log(`\n[saiio] ${ok} municípios · ${total.toLocaleString("pt-BR")} servidores`);
await db.end();
