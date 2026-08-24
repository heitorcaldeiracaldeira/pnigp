// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_eddydata.mjs — folha nominal do portal EddyData "Transparência Pública"
// (`app.{slug}.{uf}.gov.br/transparencia/{orgao}/`), Angular + API REST.
//
// ⭐ POR QUE VALE: é API, não tela. `/api/v1/{tenant}/{cidade}/holerites/{pag}/{lim}` devolve JSON com os
// CINCO campos de [[pnigp-folha-municipal-cinco-campos]] via `relations`:
//   funcionario.pessoa.nome · funcionario.cargo.nome · **funcionario.departamento.nome (=secretaria)** ·
//   valor_bruto · valor_liquido · salario_base · data_admissao · situacao · cargo.regime_juridico
// E com `lim=1` o campo `totalPages` VIRA A CONTAGEM EXATA de servidores — sondar competência custa
// uma requisição, não uma varredura ([[pnigp-competencia-mais-cheia-nao-a-recente]] fica barato).
//
// 🚨 ASSINATURA DE REQUISIÇÃO: além de `Authorization: JWT <token>` (o esquema é **JWT**, não Bearer), a API
// exige dois cabeçalhos que o próprio cliente calcula a partir do token que o servidor acabou de entregar:
//     agora  = Date.now()
//     codigo = bcrypt.hashSync(((agora - token.iat) / token.id).toFixed(0), token.chave)
// No token PÚBLICO `id` é 0, então a divisão dá Infinity e o texto assinado é sempre a string "Infinity".
// Sem esses cabeçalhos a resposta é `Unauthorized` — e "Unauthorized" aqui NÃO quer dizer que o portal é
// fechado: o token sai de `POST /usuarios/token-publico` com corpo vazio, sem login e sem captcha.
// Mesma lição de [[pnigp-7focus-folha-crack]]: uma resposta de negação não prova que a fonte é fechada.
//
// 🚨 O TENANT não sai do slug ("sjbv" para São José da Bela Vista) — vem do bundle, e quem descobre é
// `sonda_eddydata.mjs`.
//
// ⚠️ PRIVACIDADE: `funcionario.pessoa` traz CPF, RG, título de eleitor, endereço, telefone e e-mail. Nada
// disso entra no banco. Grava-se só o que a folha pública exige — e o CPF só MASCARADO, como no 7focus.
//
// Uso: node scripts/ingest_folha_eddydata.mjs   ·  SO=Tapiratiba um município  ·  MESES=3 quantos sondar
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const MESES_SONDA = Number(process.env.MESES || 3);
const LIMITE = 200;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

await q(`create table if not exists folha_servidores_eddydata (
  cod_ibge text, municipio text, uf text, host text, tenant text, orgao text, competencia text,
  matricula text, nome text, cpf_mascarado text, cargo text, departamento text, regime_juridico text,
  provimento text, situacao text, carga_horaria text,
  salario_base numeric, salario_bruto numeric, salario_liquido numeric,
  data_admissao text, data_demissao text,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_eddy_mun on folha_servidores_eddydata (cod_ibge, competencia)`);
await q(`create table if not exists folha_eddydata_coleta (
  cod_ibge text primary key, municipio text, uf text, host text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now())`);

// CPF nunca inteiro — só os 6 dígitos do meio, como em [[pnigp-7focus-folha-crack]]
const mascara = (c) => {
  const d = String(c || "").replace(/\D/g, "");
  return d.length === 11 ? `xxx.${d.slice(3, 6)}.${d.slice(6, 9)}-xx` : null;
};
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const soData = (v) => (v ? String(v).slice(0, 10) : null);

// ── sessão assinada ───────────────────────────────────────────────────────────────────────────────────────────
async function novaSessao(base) {
  const r = await fetch(`${base}/usuarios/token-publico`, {
    method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/json" },
    body: "{}", signal: AbortSignal.timeout(40000),
  });
  if (!r.ok) throw new Error(`token-publico HTTP ${r.status}`);
  const { token } = await r.json();
  if (!token) throw new Error("token-publico sem token");
  const p = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  const agora = Date.now();
  // ⚠️ `id` = 0 no token público → (agora-iat)/0 = Infinity → assina-se a string "Infinity"
  const codigo = bcrypt.hashSync(((agora - +p.iat) / +p.id).toFixed(0), p.chave);
  return {
    nascida: Date.now(),
    expira: (+p.exp || 0) * 1000,
    cab: { "User-Agent": UA, Authorization: `JWT ${token}`, agora: String(agora), codigo,
      Accept: "application/json" },
  };
}

async function pegaJson(base, rota, sess) {
  const r = await fetch(`${base}${rota}`, { headers: sess.cab, signal: AbortSignal.timeout(90000) });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${rota.slice(0, 60)}: ${t.slice(0, 60)}`);
  try { return JSON.parse(t); } catch { throw new Error(`resposta nao-JSON em ${rota.slice(0, 60)}`); }
}

const RELS = "funcionario,funcionario.pessoa,funcionario.cargo,funcionario.departamento,referencia,orgao";

const alvos = (await q(`select p.cod_ibge, p.municipio, p.uf, p.host, p.caminho, p.tenant, p.orgao, p.cidade
  from eddydata_portal p
  where p.situacao = 'tem_api'
    ${process.env.REFAZ === "1" ? "" :
      "and not exists (select 1 from folha_eddydata_coleta c where c.cod_ibge = p.cod_ibge and c.situacao = 'ok')"}
  order by p.municipio`)).rows
  .filter((a) => !SO || new RegExp(SO, "i").test(semAcento(a.municipio)));

console.log(`── EddyData · ${alvos.length} municípios ────────────────────────────────────────`);

let ok = 0, servidores = 0;
for (const p of alvos) {
  process.stdout.write(`  ${p.municipio.padEnd(26)} `);
  let r = { situacao: "erro", detalhe: null, linhas: 0, competencia: null };
  try {
    const base = `https://${p.host}/api/v1/${p.tenant}`;
    let sess = await novaSessao(base);
    const renova = async () => { if (Date.now() > sess.expira - 120000) sess = await novaSessao(base); };

    // ── órgão: o do bundle, e tem de ser o EXECUTIVO ───────────────────────────────────────────────────────
    const orgs = await pegaJson(base, `/${p.cidade}/orgaos/filtrar?codigo=${p.orgao}&cidade.id=${p.cidade}`, sess);
    const lista = orgs.content || orgs;
    const org = Array.isArray(lista) ? lista[0] : null;
    if (!org) throw new Error(`orgao ${p.orgao} nao encontrado`);
    if (/c[âa]mara|legislativ/i.test(org.nome || "")) throw new Error(`orgao e legislativo: ${org.nome}`);
    // identidade: o nome do órgão tem de falar do município ([[pnigp-fila-erp-homonimo-contamina-uf]])
    const chave = semAcento(p.municipio).toLowerCase().replace(/[^a-z]/g, "");
    if (!semAcento(org.nome || "").toLowerCase().replace(/[^a-z]/g, "").includes(chave.slice(0, Math.max(5, Math.floor(chave.length * 0.7)))))
      throw new Error(`identidade: orgao diz "${(org.nome || "").slice(0, 50)}"`);

    // ── competência mais cheia: com lim=1, `totalPages` é a contagem exata ─────────────────────────────────
    const hoje = new Date();
    const cands = [];
    for (let k = 0; k < MESES_SONDA; k++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - k, 1);
      cands.push({ ano: d.getFullYear(), mes: d.getMonth() + 1 });
    }
    let melhor = null;
    for (const c of cands) {
      await renova();
      try {
        const j = await pegaJson(base,
          `/${p.cidade}/holerites/1/1?ignoreCondObrig=true&orgao.id=${org.id}` +
          `&referencia.mes=${c.mes}&referencia.ano=${c.ano}&relations=${RELS}`, sess);
        const n = Number(j.totalPages || 0);
        if (!melhor || n > melhor.n) melhor = { ...c, n };
      } catch { /* competência ausente: seguir */ }
    }
    if (!melhor || !melhor.n) throw new Error("nenhuma competencia com registros");
    const competencia = `${melhor.ano}-${String(melhor.mes).padStart(2, "0")}`;

    // ── páginas ───────────────────────────────────────────────────────────────────────────────────────────
    let lidas = 0, novas = 0;
    const paginas = Math.ceil(melhor.n / LIMITE);
    for (let pag = 1; pag <= paginas; pag++) {
      await renova();
      const j = await pegaJson(base,
        `/${p.cidade}/holerites/${pag}/${LIMITE}?ignoreCondObrig=true&orgao.id=${org.id}` +
        `&referencia.mes=${melhor.mes}&referencia.ano=${melhor.ano}` +
        `&orderBy=funcionario.pessoa.nome$ASC&relations=${RELS}`, sess);
      const linhas = j.content || [];
      if (!linhas.length) break;
      lidas += linhas.length;

      const vals = [], params = [];
      let k = 1;
      for (const l of linhas) {
        const f = l.funcionario || {};
        const pe = f.pessoa || {};
        const ca = f.cargo || {};
        const de = f.departamento || l.departamento || {};
        const h = crypto.createHash("md5").update([p.cod_ibge, competencia, String(l.id ?? ""),
          pe.nome || "", ca.nome || "", de.nome || "", String(l.valor_bruto ?? "")].join("|")).digest("hex");
        vals.push(`(${Array.from({ length: 22 }, () => `$${k++}`).join(",")})`);
        params.push(p.cod_ibge, p.municipio, p.uf, p.host, p.tenant, org.nome, competencia,
          pe.matricula || f.codigo || null, pe.nome || null, mascara(pe.cpf_cnpj),
          ca.nome || null, de.nome || null, ca.regime_juridico || null, ca.provimento || null,
          f.situacao || null, f.carga_horaria != null ? String(f.carga_horaria) : null,
          num(l.salario_base), num(l.valor_bruto), num(l.valor_liquido),
          soData(f.data_admissao), soData(f.data_demissao), h);
      }
      const res = await q(`insert into folha_servidores_eddydata
        (cod_ibge, municipio, uf, host, tenant, orgao, competencia, matricula, nome, cpf_mascarado,
         cargo, departamento, regime_juridico, provimento, situacao, carga_horaria,
         salario_base, salario_bruto, salario_liquido, data_admissao, data_demissao, _hash)
        values ${vals.join(",")} on conflict (_hash) do nothing`, params);
      novas += res.rowCount;
      await dorme(150);
    }
    // linhas = o que a FONTE deu ([[pnigp-resumo-conta-tabela-nao-execucao]])
    r = { situacao: "ok", linhas: lidas, competencia,
      detalhe: novas !== lidas ? `${novas} novas` : null };
  } catch (e) {
    r = { situacao: /identidade|legislativ/.test(String(e.message)) ? "identidade" : "erro",
      detalhe: String(e.message || e).slice(0, 180), linhas: 0, competencia: null };
  }
  await q(`insert into folha_eddydata_coleta
    (cod_ibge, municipio, uf, host, competencia, linhas, situacao, detalhe, em)
    values ($1,$2,$3,$4,$5,$6,$7,$8, now())
    on conflict (cod_ibge) do update set competencia = excluded.competencia, linhas = excluded.linhas,
      situacao = excluded.situacao, detalhe = excluded.detalhe, host = excluded.host, em = now()`,
    [p.cod_ibge, p.municipio, p.uf, p.host, r.competencia, r.linhas, r.situacao, r.detalhe]);
  if (r.situacao === "ok") { ok++; servidores += r.linhas; }
  console.log(`${r.situacao.padEnd(12)} ${String(r.linhas).padStart(6)} ${r.competencia || ""} ${r.detalhe || ""}`);
}
console.log(`\n  ✔ ${ok}/${alvos.length} municípios · ${servidores.toLocaleString("pt-BR")} servidores`);
await db.end();
