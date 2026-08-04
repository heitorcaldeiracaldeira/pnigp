// ROTEADOR DE MARCA — o passo AUTOMÁTICO que roda a cada ciclo: quando um item vem HOMOLOGADO (unit_homologado>0)
// e o documento de resultado já foi baixado, extrai a marca pelo parser do TEMPLATE certo. Carrega todos os
// parsers determinísticos de scripts/marca_tpl/*.mjs (gerados pelo fan-out por célula portal×modalidade); roda TODOS
// no doc — cada parser só casa o SEU template (retorna [] nos outros), então não precisa tabela de roteamento.
//
// Incremental e resumível (marca_tpl_feitas): só toca processos com homologado novo, sem marca, com doc, não feitos.
// Determinístico, custo ~zero. Pensado p/ ser chamado pelo orquestrador após cada ingestão (ou pela task autônoma).
// Haiku NÃO entra aqui (é exceção, passe separado no resíduo). node scripts/extrai_marca_router.mjs   [LIMIT=n]
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const U = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const LIMIT = Number(process.env.LIMIT || 0);
const TIPOS = "1,2,11,16,19,20";   // docs onde a marca+valor vivem (ata de resultado + docs de contratação direta + SRP)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const CONF = { alta: 3, media: 2, baixa: 1 };

// carrega os parsers de template (cada um exporta parse(texto, itensApi) -> [{numero,marca,modelo,valorUnit,confianca,template}])
async function carregaParsers() {
  const dir = path.join(__dirname, "marca_tpl");
  const parsers = [];
  if (!fs.existsSync(dir)) return parsers;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".mjs") || f.startsWith("_")) continue;
    try { const m = await import("file://" + path.join(dir, f)); if (typeof m.parse === "function") parsers.push({ nome: f, parse: m.parse }); } catch (e) { console.error(`  ! ${f}: ${e.message}`); }
  }
  return parsers;
}

async function main() {
  const falhasParser = new Map();   // parser -> nº de documentos em que estourou (defeito de parser, não do dado)
  const parsers = await carregaParsers();
  console.log(`roteador de marca · ${parsers.length} parsers de template carregados` + (parsers.length ? ": " + parsers.map((p) => p.nome.replace(".mjs", "")).join(", ") : " (nenhum ainda — aguardando o fan-out)"));
  if (!parsers.length) { console.log("nada a rodar sem parsers."); return; }

  const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 180000 });
  db.on("error", () => {});
  const q = async (s, p) => { let u; for (let i = 0; i < 6; i++) { try { return await db.query(s, p); } catch (e) { u = e; if (["22P05", "23502", "42703", "42P10", "21000"].includes(e.code)) throw e; await sleep(1200 * (i + 1)); } } throw new Error(`db: ${u?.message}`); };
  await q(`CREATE TABLE IF NOT EXISTS item_marca_sc (cnpj TEXT, ano INT, seq INT, numero INT, cod_ibge TEXT, descricao TEXT, produto_ata TEXT, modelo TEXT, marca TEXT, valor NUMERIC, template TEXT, atualizado timestamptz DEFAULT now(), PRIMARY KEY (cnpj,ano,seq,numero))`);
  await q(`ALTER TABLE item_marca_sc ADD COLUMN IF NOT EXISTS template TEXT`);
  await q(`CREATE TABLE IF NOT EXISTS marca_tpl_feitas (cnpj TEXT, ano INT, seq INT, n_marca INT, feito_em timestamptz DEFAULT now(), PRIMARY KEY (cnpj,ano,seq))`);

  // UNIVERSO INCREMENTAL: processo com item homologado (valor homologado), doc de resultado baixado, ainda sem marca, não feito.
  // É o "evento": só entra quando o valor VEIO homologado e o doc existe. Barato (não varre o histórico todo).
  const procs = (await q(`SELECT DISTINCT i.cnpj,i.ano,i.seq,i.cod_ibge FROM itens_sc i
    WHERE i.unit_homologado>0 AND i.situacao='Homologado'
      AND NOT EXISTS (SELECT 1 FROM marca_tpl_feitas f WHERE f.cnpj=i.cnpj AND f.ano=i.ano AND f.seq=i.seq)
      AND NOT EXISTS (SELECT 1 FROM item_marca_sc m WHERE m.cnpj=i.cnpj AND m.ano=i.ano AND m.seq=i.seq AND m.numero=i.numero AND m.marca IS NOT NULL)
      AND EXISTS (SELECT 1 FROM arquivo_texto_sc t JOIN arquivos_sc a USING (cnpj,ano,seq,sequencial_documento)
                  WHERE t.cnpj=i.cnpj AND t.ano=i.ano AND t.seq=i.seq AND a.tipo_documento_id IN (${TIPOS}) AND t.chars>300)
    ${LIMIT ? "LIMIT " + LIMIT : ""}`)).rows;
  console.log(`${procs.length.toLocaleString()} processos com homologado novo a extrair`);

  let done = 0, itensMarca = 0;
  for (const p of procs) {
    try {
      const docs = (await q(`SELECT t.texto FROM arquivo_texto_sc t JOIN arquivos_sc a USING (cnpj,ano,seq,sequencial_documento)
        WHERE t.cnpj=$1 AND t.ano=$2 AND t.seq=$3 AND a.tipo_documento_id IN (${TIPOS}) AND t.chars>300 ORDER BY t.chars DESC LIMIT 6`, [p.cnpj, p.ano, p.seq])).rows;
      const itensApi = (await q(`SELECT numero, descricao, unit_homologado, quantidade, cnpj_fornecedor, fornecedor FROM itens_sc
        WHERE cnpj=$1 AND ano=$2 AND seq=$3 AND situacao='Homologado' AND unit_homologado>0`, [p.cnpj, p.ano, p.seq])).rows
        .map((r) => ({ numero: Number(r.numero), descricao: r.descricao, unit_homologado: Number(r.unit_homologado), quantidade: r.quantidade, cnpj_fornecedor: r.cnpj_fornecedor, fornecedor: r.fornecedor }));
      if (!docs.length || !itensApi.length) { await q(`INSERT INTO marca_tpl_feitas (cnpj,ano,seq,n_marca) VALUES ($1,$2,$3,0) ON CONFLICT DO NOTHING`, [p.cnpj, p.ano, p.seq]); continue; }
      // roda TODOS os parsers em TODOS os docs; cada parser só casa o seu template. Best por item pela confiança.
      const best = new Map();
      for (const d of docs) for (const P of parsers) {
        // Aqui a falha é DETERMINÍSTICA, ao contrário do LLM/rede: o parser quebrou NESTE documento e vai quebrar
        // de novo no próximo run. Não marcar feito criaria laço infinito — pior que o silêncio. O que faltava era
        // VISIBILIDADE: parser que estoura em milhares de documentos é marca que nunca foi extraída, e nada indicava.
        let out = []; try { out = P.parse(d.texto || "", itensApi) || []; } catch (err) { falhasParser.set(P.nome, (falhasParser.get(P.nome) || 0) + 1); }
        for (const r of out) {
          if (!r || r.numero == null || !r.marca) continue;
          const nm = norm(r.marca); if (nm.length < 2 || /^\d+$/.test(nm)) continue;
          const sc = CONF[r.confianca] || 1;
          const cur = best.get(r.numero);
          if (!cur || sc > cur._sc) best.set(r.numero, { ...r, _sc: sc, _tpl: r.template || P.nome.replace(".mjs", "") });
        }
      }
      if (best.size) {
        const M = { num: [], desc: [], mar: [], mod: [], val: [], tpl: [] };
        const descOf = new Map(itensApi.map((i) => [i.numero, i.descricao]));
        for (const [numero, r] of best) { M.num.push(numero); M.desc.push(String(descOf.get(numero) || "").slice(0, 200)); M.mar.push(String(r.marca).slice(0, 80)); M.mod.push(r.modelo ? String(r.modelo).slice(0, 80) : null); M.val.push(r.valorUnit || r.unit_homologado || null); M.tpl.push(r._tpl); }
        await q(`INSERT INTO item_marca_sc (cnpj,ano,seq,cod_ibge,numero,descricao,marca,modelo,valor,template)
          SELECT $1,$2,$3,$4, t.* FROM unnest($5::int[],$6::text[],$7::text[],$8::text[],$9::numeric[],$10::text[]) AS t(numero,descricao,marca,modelo,valor,template)
          ON CONFLICT (cnpj,ano,seq,numero) DO UPDATE SET marca=EXCLUDED.marca, modelo=EXCLUDED.modelo, valor=EXCLUDED.valor, template=EXCLUDED.template, descricao=COALESCE(item_marca_sc.descricao,EXCLUDED.descricao), atualizado=now()`,
          [p.cnpj, p.ano, p.seq, p.cod_ibge, M.num, M.desc, M.mar, M.mod, M.val, M.tpl]);
        itensMarca += M.num.length;
      }
      await q(`INSERT INTO marca_tpl_feitas (cnpj,ano,seq,n_marca) VALUES ($1,$2,$3,$4) ON CONFLICT (cnpj,ano,seq) DO UPDATE SET n_marca=EXCLUDED.n_marca, feito_em=now()`, [p.cnpj, p.ano, p.seq, best.size]);
    } catch { /* deixa p/ o próximo ciclo — não marca feito */ }
    if (++done % 50 === 0) process.stdout.write(`  ${done}/${procs.length} · ${itensMarca} marcas\r`);
  }
  console.log(`\n✔ roteador: ${itensMarca.toLocaleString()} marcas gravadas em ${done} processos`);
  if (falhasParser.size) {
    console.log("\n⚠ PARSERS QUE ESTOURARAM (marca possivelmente perdida — o processo FOI marcado feito porque a falha é determinística e reprocessar daria o mesmo erro):");
    for (const [nome, n] of [...falhasParser].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(6)} documento(s) · ${nome}`);
    console.log("   Conserte o parser e limpe marca_tpl_feitas das linhas afetadas para reprocessar.");
  }
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
