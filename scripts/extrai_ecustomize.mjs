// EXTRATOR DETERMINÍSTICO ECustomize — roda parseAtaEcustomize sobre TODAS as atas ECustomize (texto guardado) e grava
// propostas_sc (TODOS os fornecedores: fornecedor+cnpj+marca+modelo+valor+data/hora+classificado), lances_sc (por data/hora),
// item_marca_sc (vencedor = menor valor classificado). Determinístico = rápido, sem LLM. RESUMÍVEL (marca_ata_feitas),
// LOTE (Neon-safe: 1 INSERT/tabela por ata, pool max 3). node scripts/extrai_ecustomize.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { PARSER_VERSAO } from "./parser_versao.mjs";
import { parseAtaEcustomize } from "./parser_ecustomize.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const LIMIT = Number(process.env.LIMIT || 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 120000 });
  db.on("error", () => {});
  // NÃO engolir o erro: o retry cego escondeu por horas uma colisão de PK que fazia CADA ata queimar ~8min e nunca
  // gravar "feito" — reprocessando as mesmas 20 atas para sempre. Erro de dado/schema falha na hora, com a mensagem.
  const FATAL = new Set(["21000", "22P05", "22021", "23505", "23502", "42703", "42P10"]);
  const q = async (s, p) => {
    let ultimo;
    for (let i = 0; i < 25; i++) {
      try { return await db.query(s, p); }
      catch (err) { ultimo = err; if (FATAL.has(err.code)) throw err; await sleep(1500 * (i + 1)); }
    }
    throw new Error(`db (${ultimo?.code || "?"}): ${ultimo?.message || "sem detalhe"}`);
  };
  // colunas extras em propostas_sc — cria só se faltar (evita ALTER a cada run, que pega lock exclusivo e deadlocka entre instâncias)
  const cols = new Set((await q(`SELECT column_name FROM information_schema.columns WHERE table_name='propostas_sc'`)).rows.map((r) => r.column_name));
  for (const [nome, tipo] of [["cnpj_fornecedor", "TEXT"], ["data_hora", "TEXT"], ["classificado", "BOOLEAN"], ["valor_total", "NUMERIC"], ["fonte", "TEXT"]])
    if (!cols.has(nome)) await q(`ALTER TABLE propostas_sc ADD COLUMN ${nome} ${tipo}`);

  // IDENTIDADE DA PROPOSTA = CNPJ, não o nome. A PK antiga era (…,numero,fornecedor) — apoiada no campo FUZZY do
  // parser (o nome sai de heurística), enquanto o CNPJ é âncora determinística. Efeito: dois fornecedores distintos
  // com o mesmo nome truncado colidiam → "ON CONFLICT DO UPDATE cannot affect row a second time" → a ata NUNCA
  // gravava e reprocessava eternamente. fornecedor_key usa o CNPJ e cai no nome só p/ extrator que não capta CNPJ.
  if (!cols.has("fornecedor_key")) {
    await q(`ALTER TABLE propostas_sc ADD COLUMN fornecedor_key TEXT
      GENERATED ALWAYS AS (COALESCE(NULLIF(cnpj_fornecedor,''), 'nome:'||lower(fornecedor))) STORED`);
  }
  const pkDef = (await q(`SELECT pg_get_constraintdef(c.oid) def FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
    WHERE t.relname='propostas_sc' AND c.contype='p'`)).rows[0]?.def || "";
  if (!pkDef.includes("fornecedor_key")) {
    await q(`ALTER TABLE propostas_sc DROP CONSTRAINT propostas_sc_pkey`);
    await q(`ALTER TABLE propostas_sc ADD PRIMARY KEY (cnpj,ano,seq,numero,fornecedor_key)`);
    console.log("↻ PK de propostas_sc migrada p/ (cnpj,ano,seq,numero,fornecedor_key) — identidade pelo CNPJ");
  }

  // ROTEADO PELO GERADOR do documento, não pela plataforma do PNCP. `contratacoes_sc.plataforma` (=usuarioNome) é
  // quem PUBLICOU (o ERP do município); município com ERP Betha/IPM roda o pregão no Portal de Compras Públicas e o
  // PDF sai com a assinatura do Portal — este mesmo parser lê esses docs (medido: +3.423 propostas em 60 docs "Betha",
  // +1.153 em 60 "IPM"). Filtrar por plataforma perdia tudo isso. `gerador` é carimbado na ingestão (indexado).
  // só as CHAVES (rápido) — o texto (blob grande) é buscado por ata no loop; agregar texto de 1k atas numa query trava.
  const atas = (await q(`SELECT d.cnpj,d.ano,d.seq,d.cod_ibge FROM arquivo_texto_sc d
    WHERE d.gerador='portal_compras_publicas' AND d.chars > 200
      AND d.parser_versao IS DISTINCT FROM ${PARSER_VERSAO}
    GROUP BY d.cnpj,d.ano,d.seq,d.cod_ibge ${LIMIT ? "LIMIT " + LIMIT : ""}`)).rows;
  console.log(`${atas.length.toLocaleString()} atas do Portal de Compras Públicas a extrair (determinístico, por gerador)`);

  let comProp = 0, done = 0;
  for (const e of atas) {
    try {
      const tx = (await q(`SELECT texto FROM arquivo_texto_sc WHERE cnpj=$1 AND ano=$2 AND seq=$3 ORDER BY chars DESC LIMIT 1`, [e.cnpj, e.ano, e.seq])).rows[0];
      e.texto = tx?.texto || "";
      const recs = parseAtaEcustomize(e.texto).filter((r) => r.codigo && (r.fornecedor || r.cnpj));
      // dedup por (codigo,cnpj) — mantém o de menor valor (proposta final)
      const porChave = new Map();
      for (const r of recs) { const k = r.codigo + "|" + r.cnpj; const cur = porChave.get(k); if (!cur || r.valorUnitario < cur.valorUnitario) porChave.set(k, r); }
      const props = [...porChave.values()];
      // lotes
      const P = { num: [], forn: [], cnpj: [], mar: [], mod: [], val: [], vt: [], dh: [], cls: [] };
      const L = { num: [], ord: [], forn: [], val: [], dh: [] };
      const vencPorItem = new Map();
      let ord = 0;
      for (const r of props) {
        P.num.push(r.codigo); P.forn.push(String(r.fornecedor || "").slice(0, 160) || "—"); P.cnpj.push(r.cnpj || null);
        P.mar.push(r.marca ? String(r.marca).slice(0, 80) : null); P.mod.push(r.modelo ? String(r.modelo).slice(0, 80) : null);
        P.val.push(r.valorUnitario || null); P.vt.push(r.valorTotal || null); P.dh.push(r.dataHora || null); P.cls.push(!!r.classificado);
        ord++; L.num.push(r.codigo); L.ord.push(ord); L.forn.push(String(r.fornecedor || "").slice(0, 160) || "—"); L.val.push(r.valorUnitario || null); L.dh.push(r.dataHora || null);
        // (vencedor NÃO se deduz aqui — ver abaixo: quem venceu é o que a API informa)
      }
      if (P.num.length) {
        await q(`INSERT INTO propostas_sc (cnpj,ano,seq,cod_ibge,numero,fornecedor,cnpj_fornecedor,marca,modelo,valor_unitario,valor_total,data_hora,classificacao,classificado,fonte)
          SELECT $1,$2,$3,$4, t.numero,t.forn,t.cnpjf,t.mar,t.mod,t.val,t.vt,t.dh, CASE WHEN t.cls THEN 'Classificado' ELSE 'Desclassificado' END, t.cls, 'ecustomize-ata'
          FROM unnest($5::int[],$6::text[],$7::text[],$8::text[],$9::text[],$10::numeric[],$11::numeric[],$12::text[],$13::bool[]) AS t(numero,forn,cnpjf,mar,mod,val,vt,dh,cls)
          ON CONFLICT (cnpj,ano,seq,numero,fornecedor_key) DO UPDATE SET fornecedor=EXCLUDED.fornecedor, marca=EXCLUDED.marca, modelo=EXCLUDED.modelo,
            valor_unitario=EXCLUDED.valor_unitario, valor_total=EXCLUDED.valor_total, data_hora=EXCLUDED.data_hora, classificado=EXCLUDED.classificado, fonte='ecustomize-ata', atualizado=now()`,
          [e.cnpj, e.ano, e.seq, e.cod_ibge, P.num, P.forn, P.cnpj, P.mar, P.mod, P.val, P.vt, P.dh, P.cls]);
        await q(`INSERT INTO lances_sc (cnpj,ano,seq,cod_ibge,numero,ordem,fornecedor,valor,data_hora)
          SELECT $1,$2,$3,$4, t.* FROM unnest($5::int[],$6::int[],$7::text[],$8::numeric[],$9::text[]) AS t(numero,ordem,fornecedor,valor,data_hora)
          ON CONFLICT (cnpj,ano,seq,numero,ordem) DO UPDATE SET fornecedor=EXCLUDED.fornecedor, valor=EXCLUDED.valor, data_hora=EXCLUDED.data_hora`,
          [e.cnpj, e.ano, e.seq, e.cod_ibge, L.num, L.ord, L.forn, L.val, L.dh]);
        // ─── VENCEDOR POR ITEM → item_marca_sc ────────────────────────────────────────────────────────────────
        // 🔴 BUG CORRIGIDO 2026-07-15 (achado ao EXIBIR um processo real, não por teste): eu deduzia o vencedor como
        // "menor proposta classificada". Errado por dois motivos:
        //   1. **a API DIZ quem venceu** (`itens_sc.fornecedor`/`cnpj_fornecedor`) — deduzir o que a fonte informa é
        //      o erro-raiz que se repetiu o dia inteiro;
        //   2. a menor PROPOSTA não é o vencedor: existe fase de LANCES. Caso real (Balneário Piçarras 2025/57 item 1):
        //      MAXMOBILE propôs R$ 879 e ARREMATOU a R$ 230; a menor proposta era da FLEXFORMA (R$ 289, marca ekomob).
        //      Eu gravava "ekomob" no item — marca de quem PERDEU.
        // Medido: em 426 itens rastreáveis, só 143 (33,6%) tinham a marca do vencedor real. **66,4% errados.**
        // Dado errado é pior que dado faltando: o banco de sucesso recomendaria uma marca que o município não comprou.
        // Agora: casa por CNPJ do vencedor da API. Sem casar (o vencedor não tem proposta identificável na ata, ex.:
        // ganhou só na fase de lances) → NÃO grava marca. Ausência é honesta; atribuição errada, não.
        const vencAPI = new Map();   // numeroItem -> cnpj do vencedor, direto da API
        for (const it of (await q(`SELECT numero, cnpj_fornecedor FROM itens_sc
              WHERE cnpj=$1 AND ano=$2 AND seq=$3 AND situacao='Homologado' AND cnpj_fornecedor IS NOT NULL`,
              [e.cnpj, e.ano, e.seq])).rows) vencAPI.set(it.numero, String(it.cnpj_fornecedor).replace(/\D/g, ""));
        for (const r of props) {
          const alvo = vencAPI.get(r.codigo);
          if (!alvo || !r.cnpj) continue;
          if (String(r.cnpj).replace(/\D/g, "") !== alvo) continue;   // proposta de outro licitante: ignora
          vencPorItem.set(r.codigo, r);
        }
        const M = { num: [], mar: [], mod: [], val: [] };
        for (const [cod, r] of vencPorItem) { M.num.push(cod); M.mar.push(r.marca ? String(r.marca).slice(0, 80) : null); M.mod.push(r.modelo ? String(r.modelo).slice(0, 80) : null); M.val.push(r.valorUnitario || null); }
        if (M.num.length) await q(`INSERT INTO item_marca_sc (cnpj,ano,seq,cod_ibge,numero,modelo,marca,valor)
          SELECT $1,$2,$3,$4, t.* FROM unnest($5::int[],$6::text[],$7::text[],$8::numeric[]) AS t(numero,modelo,marca,valor)
          ON CONFLICT (cnpj,ano,seq,numero) DO UPDATE SET modelo=EXCLUDED.modelo, marca=EXCLUDED.marca, valor=EXCLUDED.valor, atualizado=now()`,
          [e.cnpj, e.ano, e.seq, e.cod_ibge, M.num, M.mod, M.mar, M.val]);
        const nForn = new Set(props.map((r) => r.cnpj)).size;
        await q(`INSERT INTO contratacao_disputa_sc (cnpj,ano,seq,cod_ibge,n_licitantes,n_lances,n_marcas,n_propostas) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT (cnpj,ano,seq) DO UPDATE SET n_licitantes=EXCLUDED.n_licitantes, n_lances=EXCLUDED.n_lances, n_marcas=EXCLUDED.n_marcas, n_propostas=EXCLUDED.n_propostas, atualizado=now()`,
          [e.cnpj, e.ano, e.seq, e.cod_ibge, nForn, L.num.length, M.num.length, P.num.length]);
        comProp++;
      }
      // estado NO DOCUMENTO (+versão): parser mudou → reprocessa sozinho, sem limpar marcador na mão. parser_versao.mjs
      await q(`UPDATE arquivo_texto_sc SET parser_versao=${PARSER_VERSAO}, n_registros=$4, lido_em=now()
        WHERE cnpj=$1 AND ano=$2 AND seq=$3 AND gerador='portal_compras_publicas'`, [e.cnpj, e.ano, e.seq, P.num.length]);
      await q(`INSERT INTO marca_ata_feitas (cnpj,ano,seq,n_propostas) VALUES ($1,$2,$3,$4) ON CONFLICT (cnpj,ano,seq) DO UPDATE SET n_propostas=EXCLUDED.n_propostas, feito_em=now()`, [e.cnpj, e.ano, e.seq, P.num.length]);
    } catch (err) { if (process.env.DEBUG) console.log("ERRO ata " + e.ano + "/" + e.seq + ": " + err.message); }
    if (++done % 50 === 0) process.stdout.write(`  ${done}/${atas.length} · ${comProp} c/propostas\r`);
  }
  const s = (await q(`SELECT count(*) prop, count(DISTINCT cnpj_fornecedor) forn, count(DISTINCT lower(marca)) marcas FROM propostas_sc WHERE fonte='ecustomize-ata'`)).rows[0];
  console.log(`\n✔ ECustomize: ${Number(s.prop).toLocaleString()} propostas · ${Number(s.forn).toLocaleString()} fornecedores · ${Number(s.marcas).toLocaleString()} marcas`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
