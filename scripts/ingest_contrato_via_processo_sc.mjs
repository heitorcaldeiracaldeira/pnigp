// CONTRATO PELO PROCESSO — "primeiro procura em processos o contrato, e depois os documentos".
// Dirige pelas 241.302 contratações (contratacoes_sc) e resolve os contratos pela PONTE
//   /orgaos/{cnpj}/contratos/contratacao/{ano}/{seq}   → devolve TODOS os contratos que a compra gerou,
//   cada um com a SUA chave própria (numeroControlePncp, dígito do meio = 2) — a chave que falta p/ o /arquivos.
//
// POR QUE PELO PROCESSO (e não pelo /contratos/atualizacao filtrado por UF):
//   a ponte traz as ADESÕES de outros órgãos à ata daqui (a ata nacional do FNDE 2023/25 gera 276 contratos,
//   com CNPJs de quem aderiu). Filtrar contrato por uf=SC perderia isso. O processo é o dono; o contrato pende dele.
//
// ═══ AS 4 REGRAS (docs/coleta-pncp-forma.md) ═══
//  1. raw jsonb no contrato (contrato_sc.raw). O mapa tipado é conveniência; o raw é a garantia.
//  2. sem filtro na entrada: todas as contratações, todas as modalidades.
//  3. FALHA NUNCA VIRA ZERO: getTodas confere o retorno contra o totalRegistros declarado; 429/WAF → Bloqueado ABORTA.
//  4. resumível na PRÓPRIA entidade (contratacoes_sc.contratos_em), não numa tabela *_feitos.
//
// Preenche contrato_sc (mesma tabela da cadeia — PK pela chave PRÓPRIA do contrato, com raw). Torna redundante a
// velha contratos_sc (1,87M sem raw, sem a chave do contrato). node scripts/ingest_contrato_via_processo_sc.mjs
//   (CONC=4 DRY=1 LIMIT=n  opcionais)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { getTodas, Bloqueado } from "./pncp_http.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const PNCP = "https://pncp.gov.br/api/pncp/v1";
const CONC = Number(process.env.CONC || 4);
const DRY = process.env.DRY === "1";
const LIMIT = Number(process.env.LIMIT || 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (x) => (x == null || x === "" ? null : (Number(x) || 0));
const dt = (x) => (x ? String(x).slice(0, 19) : null);
const s = (x, m) => { const v = String(x ?? "").trim(); return v ? v.slice(0, m) : null; };

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 120000 });
  db.on("error", () => {});
  const FATAL = new Set(["22P05", "23502", "42703", "42P10"]);
  const q = async (sql, p) => { let u; for (let i = 0; i < 6; i++) { try { return await db.query(sql, p); } catch (e) { u = e; if (FATAL.has(e.code)) throw e; await sleep(1200 * (i + 1)); } } throw new Error(`db: ${u?.message}`); };

  // contrato_sc: já existe (criada pela cadeia). Garante idempotência mesmo em base limpa.
  await q(`CREATE TABLE IF NOT EXISTS contrato_sc (
    cnpj TEXT, ano INT, seq INT, cod_ibge TEXT, uf TEXT, municipio_nome TEXT,
    numero_controle_pncp TEXT, numero_controle_compra TEXT,
    cnpj_compra TEXT, ano_compra INT, seq_compra INT,
    tipo_contrato_id INT, tipo_contrato TEXT, numero_contrato_empenho TEXT,
    ni_fornecedor TEXT, nome_fornecedor TEXT, ni_fornecedor_subcontratado TEXT,
    valor_inicial NUMERIC, valor_global NUMERIC, valor_parcela NUMERIC, numero_parcelas INT,
    data_assinatura DATE, data_vigencia_inicio DATE, data_vigencia_fim DATE,
    data_publicacao TIMESTAMPTZ, data_atualizacao TIMESTAMPTZ, fruto_adesao BOOLEAN,
    objeto TEXT, raw JSONB, atualizado timestamptz DEFAULT now(),
    PRIMARY KEY (cnpj, ano, seq))`);
  await q(`CREATE INDEX IF NOT EXISTS ix_ctr_compra ON contrato_sc (cnpj_compra, ano_compra, seq_compra)`);
  await q(`CREATE INDEX IF NOT EXISTS ix_ctr_ibge ON contrato_sc (cod_ibge)`);
  // regra 4: estado na contratação, não numa tabela paralela. 0 contratos é resposta legítima (a compra pode não ter contrato ainda).
  await q(`ALTER TABLE contratacoes_sc ADD COLUMN IF NOT EXISTS contratos_em timestamptz`);
  await q(`ALTER TABLE contratacoes_sc ADD COLUMN IF NOT EXISTS contratos_n int`);

  const lim = LIMIT ? `LIMIT ${LIMIT}` : "";
  const procs = (await q(`SELECT cnpj, ano, seq, cod_ibge, numero_controle
    FROM contratacoes_sc WHERE contratos_em IS NULL ${lim}`)).rows;
  const total = (await q(`SELECT count(*)::int n FROM contratacoes_sc`)).rows[0].n;
  console.log(`contrato pelo processo: ${procs.length.toLocaleString()} contratações pendentes de ${total.toLocaleString()} · conc ${CONC}${DRY ? " · DRY" : ""}`);

  let i = 0, done = 0, comCtr = 0, nCtr = 0, adesoes = 0, abortado = null;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < procs.length && !abortado) {
      const p = procs[i++];
      const base = `${PNCP}/orgaos/${p.cnpj}/contratos/contratacao/${p.ano}/${p.seq}`;
      let ctrs;
      try { ctrs = await getTodas(base, { tamanho: 50 }); }   // confere contra totalRegistros; 429/WAF → Bloqueado
      catch (e) { if (e instanceof Bloqueado) { abortado = e.message; break; } continue; }  // outro erro: pula, retenta no re-run

      if (!DRY) {
        try {
          for (const c of ctrs) {
            const nc = String(c.numeroControlePncp || c.numeroControlePNCP || "");   // chave PRÓPRIA do contrato (dígito 2)
            const mc = /^(\d{14})-\d+-(\d+)\/(\d+)$/.exec(nc);
            if (!mc) continue;                                  // sem a chave própria não há como pegar o /arquivos depois
            const [, cCnpj, cSeq, cAno] = mc;
            const ncCompra = String(c.numeroControlePncpCompra || c.numeroControlePNCPCompra || p.numero_controle || "");
            await q(`INSERT INTO contrato_sc (cnpj,ano,seq,cod_ibge,uf,municipio_nome,numero_controle_pncp,numero_controle_compra,
                cnpj_compra,ano_compra,seq_compra,tipo_contrato_id,tipo_contrato,numero_contrato_empenho,ni_fornecedor,
                nome_fornecedor,ni_fornecedor_subcontratado,valor_inicial,valor_global,valor_parcela,numero_parcelas,
                data_assinatura,data_vigencia_inicio,data_vigencia_fim,data_publicacao,data_atualizacao,fruto_adesao,objeto,raw)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
              ON CONFLICT (cnpj,ano,seq) DO UPDATE SET valor_global=EXCLUDED.valor_global, data_vigencia_fim=EXCLUDED.data_vigencia_fim,
                numero_controle_compra=EXCLUDED.numero_controle_compra, data_atualizacao=EXCLUDED.data_atualizacao,
                raw=EXCLUDED.raw, atualizado=now()`,
              [cCnpj, Number(cAno), Number(cSeq), s(c.unidadeOrgao?.codigoIbge, 7) || p.cod_ibge,
               c.unidadeOrgao?.ufSigla || null, s(c.unidadeOrgao?.municipioNome, 80),
               s(nc, 60), s(ncCompra, 60) || null,
               p.cnpj, p.ano, p.seq,
               num(c.tipoContrato?.id), s(c.tipoContrato?.nome, 60), s(c.numeroContratoEmpenho, 60),
               s(c.niFornecedor, 20), s(c.nomeRazaoSocialFornecedor, 160), s(c.niFornecedorSubContratado, 20),
               num(c.valorInicial), num(c.valorGlobal), num(c.valorParcela), num(c.numeroParcelas),
               dt(c.dataAssinatura), dt(c.dataVigenciaInicio), dt(c.dataVigenciaFim),
               dt(c.dataPublicacaoPncp), dt(c.dataAtualizacao), c.frutoAdesao === true,
               s(c.objetoContrato, 2000), JSON.stringify(c)]);
            nCtr++;
            if (c.frutoAdesao === true || cCnpj !== p.cnpj) adesoes++;
          }
          await q(`UPDATE contratacoes_sc SET contratos_em=now(), contratos_n=$2 WHERE cnpj=$1 AND ano=$3 AND seq=$4`,
            [p.cnpj, ctrs.length, p.ano, p.seq]);
          if (ctrs.length) comCtr++;
        } catch { /* deixa p/ o próximo run */ }
      } else { if (ctrs.length) comCtr++; nCtr += ctrs.length; }
      if (++done % 50 === 0) process.stdout.write(`  ${done}/${procs.length} · ${comCtr} c/contrato · ${nCtr} contratos · ${adesoes} adesões\r`);
    }
  }));

  if (abortado) console.log(`\n🔴 ABORTADO (regra 3 — não gravar zeros): ${abortado}`);
  const st = (await q(`SELECT count(*)::int n, count(*) FILTER (WHERE raw IS NOT NULL)::int raw,
    count(*) FILTER (WHERE fruto_adesao)::int ades FROM contrato_sc`)).rows[0];
  const falta = (await q(`SELECT count(*)::int n FROM contratacoes_sc WHERE contratos_em IS NULL`)).rows[0].n;
  console.log(`\n✔ contrato_sc: ${st.n.toLocaleString()} contratos · raw=${st.raw.toLocaleString()} · ${st.ades.toLocaleString()} adesões · faltam ${falta.toLocaleString()} processos`);
  await db.end();
  if (abortado) process.exit(1);
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
