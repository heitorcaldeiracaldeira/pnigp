// NOTA FISCAL ELETRÔNICA — o que foi ENTREGUE, com NCM. O eixo que eu passei um dia inventando já existe.
//
// ═══ O ACHADO (medido 2026-07-16) ═══
// /v1/instrumentoscobranca/inclusao?uf=SC devolve a NF com **71 campos** — e dentro de `jsonResponseNFe`:
//   "itensNotaFiscal": [{ "descricaoProdutoServico": "FILE DE PEITO REAL PCT KG",
//                         "codigoNcmSh": "2071422", "cfop": "5405",
//                         "quantidade": "148,50", "unidade": "kg",
//                         "valorUnitario": "17,60", "valor": "2.613,60" }]
// Descrição, **NCM**, CFOP, quantidade, unidade e preço unitário — item a item, como o fornecedor declarou
// à Receita. É o que SAIU DO CAMINHÃO: não o que se queria (edital), não o que se registrou (ata).
//
// 🔑 **O NCM É O EIXO.** Classificação fiscal oficial, universal, obrigatória por lei — e não depende de o
// município preencher catálogo nenhum. Passei 2026-07-15 inteiro reconstruindo eixo por trigrama + LLM sobre
// descrição de edital ("veiculo", 7 letras) enquanto o NCM estava na nota. Ver [[pnigp-catmat-classificacao]].
//
// COBERTURA MEDIDA (amostra de 50 de 767 em SC, 2 dias):
//   49/50 têm `chaveNFe` (44 dígitos — com ela a nota se consulta na Receita)
//    8/50 têm `itensNotaFiscal` preenchido (16%) — o PNCP consulta a NFe e guarda a resposta;
//          nos outros o `jsonResponseNFe` veio nulo (consulta ainda não voltou)
//
// E a NF traz `recuperarContratoDTO` embutido — inclusive `numeroControlePncpCompra`: **da nota até o processo,
// num objeto só.** Fecha a cadeia compra → contrato → pagamento.
//
// ⚠️ `uf=SC` no endpoint traz ente FEDERAL sediado em SC (MPU, IFs). Filtrar por esfera/cod_ibge p/ o municipal.
// node scripts/ingest_nota_fiscal_sc.mjs      (UF=SC DIAS=30 DRY=1)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { getTodas, Bloqueado } from "./pncp_http.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const CONS = "https://pncp.gov.br/api/consulta/v1";
const UF = (process.env.UF || "SC").toUpperCase();
const DIAS = Number(process.env.DIAS || 30);
const DRY = process.env.DRY === "1";
const num = (x) => { if (x == null || x === "") return null; const v = Number(String(x).replace(/\./g, "").replace(",", ".")); return Number.isFinite(v) ? v : null; };
const s = (x, m) => { const v = String(x ?? "").trim(); return v ? v.slice(0, m) : null; };
const dt = (x) => (x ? String(x).slice(0, 19) : null);
const dbr = (x) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(x || "")); return m ? `${m[3]}-${m[2]}-${m[1]}` : (x ? String(x).slice(0, 10) : null); };
const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 180000 });
db.on("error", () => {});
const q = (sql, p) => db.query(sql, p);

// ─── ESPELHO (nome do PNCP: instrumento de cobrança) ──────────────────────────────────────────────────────────
await q(`CREATE TABLE IF NOT EXISTS instrumento_cobranca_sc (
  cnpj TEXT, ano INT, sequencial_contrato INT, sequencial_instrumento INT,
  cod_ibge TEXT, uf TEXT, municipio_nome TEXT, esfera TEXT,
  tipo_id INT, tipo TEXT, numero TEXT, data_emissao DATE,
  chave_nfe TEXT, fonte_nfe INT, status_response_nfe INT, data_consulta_nfe TIMESTAMPTZ,
  numero_controle_compra TEXT,   -- 🔑 a ponte de volta p/ o processo (vem em recuperarContratoDTO)
  ni_fornecedor TEXT, nome_fornecedor TEXT, valor_nota NUMERIC,
  n_itens INT, data_inclusao TIMESTAMPTZ, data_atualizacao TIMESTAMPTZ,
  raw JSONB, atualizado timestamptz DEFAULT now(),
  PRIMARY KEY (cnpj, ano, sequencial_contrato, sequencial_instrumento))`);
await q(`CREATE INDEX IF NOT EXISTS ix_nf_compra ON instrumento_cobranca_sc (numero_controle_compra)`);
await q(`CREATE INDEX IF NOT EXISTS ix_nf_chave ON instrumento_cobranca_sc (chave_nfe)`);

// 🔑 O ITEM DA NOTA — com NCM. É o que foi ENTREGUE.
await q(`CREATE TABLE IF NOT EXISTS item_nota_fiscal_sc (
  cnpj TEXT, ano INT, sequencial_contrato INT, sequencial_instrumento INT, numero_produto TEXT,
  cod_ibge TEXT, chave_nfe TEXT, numero_controle_compra TEXT,
  descricao TEXT,          -- "FILE DE PEITO REAL PCT KG" — o que o FORNECEDOR declarou
  ncm TEXT,                -- 🔑 O EIXO: classificação fiscal oficial, não depende de catálogo do município
  cfop TEXT, quantidade NUMERIC, unidade TEXT, valor_unitario NUMERIC, valor_total NUMERIC,
  raw JSONB, atualizado timestamptz DEFAULT now(),
  PRIMARY KEY (cnpj, ano, sequencial_contrato, sequencial_instrumento, numero_produto))`);
await q(`CREATE INDEX IF NOT EXISTS ix_inf_ncm ON item_nota_fiscal_sc (ncm) WHERE ncm IS NOT NULL`);
await q(`CREATE INDEX IF NOT EXISTS ix_inf_ibge ON item_nota_fiscal_sc (cod_ibge)`);

const hoje = new Date(); let nNF = 0, nIT = 0, comItens = 0, comChave = 0, janelas = 0;
console.log(`NOTA FISCAL · ${UF} · ${DIAS} dias${DRY ? " · DRY" : ""}\n`);

// janela de 2 dias por vez (o endpoint recusa janela larga; e assim o 429 custa pouco)
for (let d = DIAS; d > 0; d -= 2) {
  const a = new Date(hoje); a.setDate(hoje.getDate() - d);
  const b = new Date(hoje); b.setDate(hoje.getDate() - Math.max(0, d - 2));
  const D0 = ymd(a), D1 = ymd(b);
  let nfs;
  try { nfs = await getTodas(`${CONS}/instrumentoscobranca/inclusao?dataInicial=${D0}&dataFinal=${D1}&uf=${UF}`); }
  catch (e) {
    // 🔴 NÃO engole: bloqueio/incompleto PARA a rodada. Gravar parcial seria inventar dado.
    console.log(`\n⚠ ${D0}→${D1}: ${e.name} — ${e.message.slice(0, 90)}`);
    if (e instanceof Bloqueado) { console.log("   PARANDO: continuar aqui grava bloqueio como dado."); break; }
    continue;
  }
  janelas++;
  for (const n of nfs) {
    const c = n.recuperarContratoDTO || {};
    const nc = s(c.numeroControlePncpCompra || c.numeroControlePNCPCompra, 60);
    let p = null; try { p = JSON.parse(n.jsonResponseNFe || "null"); } catch {}
    const itens = p?.itensNotaFiscal || [];
    if (n.chaveNFe) comChave++;
    if (itens.length) comItens++;
    if (DRY) { nNF++; nIT += itens.length; continue; }
    await q(`INSERT INTO instrumento_cobranca_sc (cnpj,ano,sequencial_contrato,sequencial_instrumento,cod_ibge,uf,
        municipio_nome,esfera,tipo_id,tipo,numero,data_emissao,chave_nfe,fonte_nfe,status_response_nfe,
        data_consulta_nfe,numero_controle_compra,ni_fornecedor,nome_fornecedor,valor_nota,n_itens,
        data_inclusao,data_atualizacao,raw)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
      ON CONFLICT (cnpj,ano,sequencial_contrato,sequencial_instrumento) DO UPDATE SET
        chave_nfe=EXCLUDED.chave_nfe, n_itens=EXCLUDED.n_itens, valor_nota=EXCLUDED.valor_nota,
        data_atualizacao=EXCLUDED.data_atualizacao, raw=EXCLUDED.raw, atualizado=now()`,
      [n.cnpj, Number(n.ano) || null, Number(n.sequencialContrato) || null, Number(n.sequencialInstrumentoCobranca) || 1,
       s(c.unidadeOrgao?.codigoIbge, 7), c.unidadeOrgao?.ufSigla || UF, s(c.unidadeOrgao?.municipioNome, 80),
       s(c.orgaoEntidade?.esferaId, 1), Number(n.tipoInstrumentoCobranca?.id) || null, s(n.tipoInstrumentoCobranca?.nome, 80),
       s(n.numeroInstrumentoCobranca, 60), dbr(n.dataEmissaoDocumento), s(n.chaveNFe, 44),
       Number(n.fonteNFe) || null, Number(n.statusResponseNFe) || null, dt(n.dataConsultaNFe), nc,
       s(c.niFornecedor, 20), s(p?.notaFiscalDTO?.nomeFornecedor, 160), num(p?.notaFiscalDTO?.valorNotaFiscal),
       itens.length, dt(n.dataInclusao), dt(n.dataAtualizacao), JSON.stringify(n)]);
    nNF++;
    for (const it of itens) {
      await q(`INSERT INTO item_nota_fiscal_sc (cnpj,ano,sequencial_contrato,sequencial_instrumento,numero_produto,
          cod_ibge,chave_nfe,numero_controle_compra,descricao,ncm,cfop,quantidade,unidade,valor_unitario,valor_total,raw)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT (cnpj,ano,sequencial_contrato,sequencial_instrumento,numero_produto) DO UPDATE SET
          descricao=EXCLUDED.descricao, ncm=EXCLUDED.ncm, valor_unitario=EXCLUDED.valor_unitario, raw=EXCLUDED.raw`,
        [n.cnpj, Number(n.ano) || null, Number(n.sequencialContrato) || null, Number(n.sequencialInstrumentoCobranca) || 1,
         s(it.numeroProduto, 10) || "1", s(c.unidadeOrgao?.codigoIbge, 7), s(n.chaveNFe, 44), nc,
         s(it.descricaoProdutoServico, 500), s(it.codigoNcmSh || it.ncmSh, 20), s(it.cfop, 10),
         num(it.quantidade), s(it.unidade, 20), num(it.valorUnitario), num(it.valor), JSON.stringify(it)]);
      nIT++;
    }
  }
  process.stdout.write(`  ${D0}→${D1}: ${nfs.length} notas · ${nNF} gravadas · ${nIT} itens\r`);
}
console.log(`\n\n${"═".repeat(72)}`);
console.log(`  ${janelas} janelas · ${nNF} notas · ${comChave} com chaveNFe · ${comItens} com itens`);
console.log(`  ${nIT} ITENS DE NOTA FISCAL — com NCM, descrição do fornecedor e preço unitário`);
console.log(`${"═".repeat(72)}`);
if (!DRY) {
  const t = (await q(`SELECT count(*) n, count(DISTINCT ncm) ncms, count(DISTINCT cod_ibge) munis FROM item_nota_fiscal_sc`)).rows[0];
  console.log(`\n  item_nota_fiscal_sc: ${Number(t.n).toLocaleString("pt-BR")} itens · ${t.ncms} NCMs distintos · ${t.munis} municípios`);
}
await db.end();
