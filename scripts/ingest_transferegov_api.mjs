// ETL — Transferegov API VIVA (PostgREST, fonte original autoritativa). Substitui o dump histórico do SICONV.
// 1) programas_transferegov: catálogo de programas + janela de proposta voluntária (o "poderá acessar").
// 2) captacao_transferegov_sc: planos de ação dos municípios de SC (o que JÁ captaram) — cruzável c/ SICONFI.
// node scripts/ingest_transferegov_api.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
import { paginar as clientePaginar } from "./transferegov.mjs";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const num = (v) => { const n = Number(v); return isNaN(n) || v == null ? null : n; };
const dt = (s) => (s && /^\d{4}-\d{2}-\d{2}/.test(String(s)) ? String(s).slice(0, 10) : null);

async function api(url, headers = {}) {
  for (let t = 0; t < 5; t++) {
    try { const r = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(40000) }); if (r.status >= 500) throw 0; return r; }
    catch { await sleep(2000 * (t + 1)); }
  }
  return null;
}
// ⚠️ MIGRADO PARA O HOST NOVO — o antigo é desligado em 31/08/2026 (Comunicado Transferegov nº 23/2026).
// Isto aqui era paginação PostgREST por header `Range: 0-999`, que o contrato novo não tem: virou
// `pagina` + `tamanho_da_pagina`, e a resposta deixou de ser array cru para vir em `{data: [...]}`.
// A tradução de host, caminho, paginação e envelope mora em `transferegov.mjs`, num lugar só — foi o que
// permitiu migrar três ETLs sem reescrever nenhuma delas por dentro.
// Este gerador segue entregando LOTES (e não linhas), que é o que os consumidores abaixo esperam.
async function* paginar(recurso, qs = "") {
  const filtros = Object.fromEntries(new URLSearchParams(qs));
  let lote = [];
  for await (const linha of clientePaginar(recurso, filtros, 500)) {
    lote.push(linha);
    if (lote.length >= 1000) { yield lote; lote = []; }
  }
  if (lote.length) yield lote;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS programas_transferegov (id_programa TEXT PRIMARY KEY, modulo TEXT, nome TEXT, orgao TEXT, modalidade TEXT, situacao TEXT, valor_global NUMERIC, uf TEXT, ano INTEGER, dt_ini_vol DATE, dt_fim_vol DATE, objetivo TEXT)`);
  for (const col of ["descricao TEXT", "codigo TEXT", "fundo TEXT", "natureza_despesa TEXT", "acao_orcamentaria TEXT", "valor_acao NUMERIC", "parcelas INTEGER", "dt_ini_esp DATE", "dt_fim_esp DATE", "dt_ini_emenda DATE", "dt_fim_emenda DATE"])
    await db.query(`ALTER TABLE programas_transferegov ADD COLUMN IF NOT EXISTS ${col}`);
  await db.query(`CREATE TABLE IF NOT EXISTS captacao_transferegov_sc (id_plano TEXT PRIMARY KEY, cod_ibge TEXT, uf TEXT, id_programa TEXT, situacao TEXT, valor_total_repasse NUMERIC, valor_voluntario NUMERIC, valor_total NUMERIC, dt_inicio DATE, dt_fim DATE, orgao_repassador TEXT)`);
  for (const col of ["nome_ente_recebedor TEXT", "cnpj_ente_recebedor TEXT", "esfera TEXT"])
    await db.query(`ALTER TABLE captacao_transferegov_sc ADD COLUMN IF NOT EXISTS ${col}`).catch(() => {});
  const q = async (s, p) => { for (let t = 0; t < 8; t++) { try { return await db.query(s, p); } catch { await sleep(1200 * (t + 1)); } } throw new Error("db"); };

  // 1) PROGRAMAS (fundo a fundo) — catálogo + janela voluntária
  console.log("Coletando programas (fundoafundo)…");
  let nprog = 0;
  for await (const arr of paginar("fundoafundo/programa")) {
    for (const p of arr) {
      await q(`INSERT INTO programas_transferegov (id_programa,modulo,nome,orgao,modalidade,situacao,valor_global,uf,ano,dt_ini_vol,dt_fim_vol,objetivo,descricao,codigo,fundo,natureza_despesa,acao_orcamentaria,valor_acao,parcelas,dt_ini_esp,dt_fim_esp,dt_ini_emenda,dt_fim_emenda)
               VALUES ($1,'fundoafundo',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
               ON CONFLICT (id_programa) DO UPDATE SET nome=EXCLUDED.nome, orgao=EXCLUDED.orgao, modalidade=EXCLUDED.modalidade, situacao=EXCLUDED.situacao, valor_global=EXCLUDED.valor_global, dt_ini_vol=EXCLUDED.dt_ini_vol, dt_fim_vol=EXCLUDED.dt_fim_vol, objetivo=EXCLUDED.objetivo, descricao=EXCLUDED.descricao, codigo=EXCLUDED.codigo, fundo=EXCLUDED.fundo, natureza_despesa=EXCLUDED.natureza_despesa, acao_orcamentaria=EXCLUDED.acao_orcamentaria, valor_acao=EXCLUDED.valor_acao, parcelas=EXCLUDED.parcelas, dt_ini_esp=EXCLUDED.dt_ini_esp, dt_fim_esp=EXCLUDED.dt_fim_esp, dt_ini_emenda=EXCLUDED.dt_ini_emenda, dt_fim_emenda=EXCLUDED.dt_fim_emenda`,
        [String(p.id_programa), p.nome_programa, p.nome_orgao_superior_programa, p.modalidade_programa, p.situacao_programa, num(p.valor_global_programa), p.uf_fundo_programa || null, parseInt(p.ano_programa, 10) || null, dt(p.data_inicio_recebimento_planos_acao_beneficiarios_voluntarios), dt(p.data_fim_recebimento_planos_acao_beneficiarios_voluntarios), p.objetivo_programa, p.descricao_programa, p.codigo_programa, p.nome_fundo_programa, p.grupo_natureza_despesa_programa, p.descricao_acao_orcamentaria_programa, num(p.valor_acao_orcamentaria_programa), parseInt(p.quantidade_parcelas_programa, 10) || null, dt(p.data_inicio_recebimento_planos_acao_beneficiarios_especificos), dt(p.data_fim_recebimento_planos_acao_beneficiarios_especificos), dt(p.data_inicio_recebimento_planos_acao_beneficiarios_emendas), dt(p.data_fim_recebimento_planos_acao_beneficiarios_emendas)]);
      nprog++;
    }
  }
  console.log(`programas: ${nprog}`);

  // 2) CAPTAÇÃO de SC (planos de ação recebidos por municípios de SC)
  console.log(`Coletando planos de ação recebidos (UF=${UF})…`);
  let nplan = 0, estPulados = 0;
  for await (const arr of paginar("fundoafundo/plano_acao", `uf_ente_recebedor_plano_acao=eq.${UF}`)) {
    for (const p of arr) {
      const nomeRec = p.nome_ente_recebedor_plano_acao || "";
      // Esfera do RECEBEDOR: municipal só se o nome indicar município/prefeitura/fundo municipal.
      // Entes estaduais (ESTADO DE…, SECRETARIA DE ESTADO…) têm IBGE = capital → NÃO atribuir ao município (cod_ibge null).
      const municipal = /\b(MUNIC[IÍ]P|PREFEITURA)/i.test(nomeRec);
      const esfera = municipal ? "municipal" : (nomeRec ? "estadual/outra" : "indefinida");
      const cod = municipal && p.codigo_ibge_municipio_ente_recebedor_plano_acao ? String(p.codigo_ibge_municipio_ente_recebedor_plano_acao) : null;
      if (!municipal || !cod) { estPulados++; continue; } // NÃO ingerir recebedor estadual/outro — tabela é MUNICIPAL (regra Estado×município separados)
      await q(`INSERT INTO captacao_transferegov_sc (id_plano,cod_ibge,uf,id_programa,situacao,valor_total_repasse,valor_voluntario,valor_total,dt_inicio,dt_fim,orgao_repassador,nome_ente_recebedor,cnpj_ente_recebedor,esfera)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
               ON CONFLICT (id_plano) DO UPDATE SET cod_ibge=EXCLUDED.cod_ibge, situacao=EXCLUDED.situacao, valor_total_repasse=EXCLUDED.valor_total_repasse, valor_total=EXCLUDED.valor_total, nome_ente_recebedor=EXCLUDED.nome_ente_recebedor, cnpj_ente_recebedor=EXCLUDED.cnpj_ente_recebedor, esfera=EXCLUDED.esfera`,
        [String(p.id_plano_acao), cod, p.uf_ente_recebedor_plano_acao, p.id_programa != null ? String(p.id_programa) : null, p.situacao_plano_acao, num(p.valor_total_repasse_plano_acao), num(p.valor_repasse_voluntario_plano_acao), num(p.valor_total_plano_acao), dt(p.data_inicio_vigencia_plano_acao), dt(p.data_fim_vigencia_plano_acao), p.nome_orgao_repassador_plano_acao, nomeRec, p.cnpj_ente_recebedor_plano_acao || null, esfera]);
      nplan++;
    }
    console.log(`  ...${nplan} planos municipais (${estPulados} estaduais/outros pulados)`);
  }
  const r1 = await db.query(`SELECT count(*) n, count(*) FILTER (WHERE dt_fim_vol >= CURRENT_DATE) abertos FROM programas_transferegov`);
  const r2 = await db.query(`SELECT count(distinct cod_ibge) e, count(*) n, round(sum(valor_total_repasse)/1e6) mi FROM captacao_transferegov_sc`);
  console.log(`OK · programas: ${JSON.stringify(r1.rows[0])} · captação SC: ${JSON.stringify(r2.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
