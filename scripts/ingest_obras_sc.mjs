// Obras por município — DETALHE POR OBRA (ObrasGov/Casa Civil), TODAS as obras ligadas ao município (executor OU tomador),
// com a ORIGEM do recurso (Federal/Estadual/Municipal/Privado). Paginação ROBUSTA (retry por página; metadata é mentirosa).
import fs from "fs"; import pg from "pg";
const UF = process.env.UF || "SC";
const norm = (s) => (s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const H = { "User-Agent": "Mozilla/5.0", "Accept-Language": "pt-BR" };
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const byNome = new Map((await db.query("SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'")).rows.map((e) => [norm(e.nome), e.cod_ibge]));
const codDe = (nm) => byNome.get(norm(String(nm).replace(/MUNIC[IÍ]PIO DE |PREFEITURA (MUNICIPAL )?DE |FUNDO MUNICIPAL DE [A-Z ]+ DE /i, "")));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getPage(pag) { for (let t = 0; t < 4; t++) { try { const r = await fetch(`https://api.obrasgov.gestao.gov.br/obrasgov/api/projeto-investimento?uf=${UF}&pagina=${pag}&tamanhoDaPagina=100`, { headers: H }); if (!r.ok) throw 0; const j = await r.json(); return j?.content ?? null; } catch { await sleep(1500 * (t + 1)); } } return null; }
await db.query(`CREATE TABLE IF NOT EXISTS obras_sc (id_unico TEXT, cod_ibge TEXT, nome TEXT, situacao TEXT, especie TEXT, natureza TEXT, valor NUMERIC, origem TEXT, vinculo TEXT, data_ini TEXT, data_fim TEXT, pop_benef NUMERIC, endereco TEXT, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (id_unico, cod_ibge))`);
await db.query("ALTER TABLE obras_sc ADD COLUMN IF NOT EXISTS origem TEXT");
await db.query("ALTER TABLE obras_sc ADD COLUMN IF NOT EXISTS vinculo TEXT");
await db.query("DELETE FROM obras_sc WHERE cod_ibge IN (SELECT cod_ibge FROM entes_sc WHERE tipo='M')");
let total = 0, grav = 0, vazias = 0;
for (let pag = 0; pag < 500; pag++) {
  const arr = await getPage(pag);
  if (arr === null) { vazias++; if (vazias >= 3) break; continue; } // erro persistente: tenta próximas, desiste após 3 seguidas
  if (!arr.length) break; vazias = 0;
  for (const p of arr) {
    total++;
    // origem do recurso (distintas) + valor
    const origens = [...new Set((p.fontesDeRecurso || []).map((f) => f.origem).filter(Boolean))];
    const val = (p.fontesDeRecurso || []).reduce((s, f) => s + (+f.valorInvestimentoPrevisto || 0), 0);
    // municípios ligados: executor (executa) ou tomador (recebe)
    const links = new Map(); // cod → vínculo
    for (const e of (p.executores || [])) { if (/MUNIC[IÍ]PIO|PREFEITURA/i.test(e.nome || "")) { const c = codDe(e.nome); if (c && !links.has(c)) links.set(c, "executor"); } }
    for (const e of (p.tomadores || [])) { if (/MUNIC[IÍ]PIO|PREFEITURA/i.test(e.nome || "")) { const c = codDe(e.nome); if (c && !links.has(c)) links.set(c, "tomador"); } }
    if (!links.size) continue;
    const end = [p.endereco, p.cep].filter(Boolean).join(" · ").slice(0, 200);
    for (const [cod, vinc] of links) {
      await db.query(`INSERT INTO obras_sc (id_unico,cod_ibge,nome,situacao,especie,natureza,valor,origem,vinculo,data_ini,data_fim,pop_benef,endereco) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (id_unico,cod_ibge) DO UPDATE SET situacao=EXCLUDED.situacao,valor=EXCLUDED.valor,origem=EXCLUDED.origem,data_fim=EXCLUDED.data_fim,atualizado=now()`,
        [String(p.idUnico), cod, (p.nome || "").slice(0, 300), p.situacao || null, p.especie || null, p.natureza || null, val, origens.join("/") || null, vinc, p.dataInicialPrevista || null, p.dataFinalPrevista || null, +p.populacaoBeneficiada || null, end || null]);
      grav++;
    }
  }
}
const c = (await db.query("SELECT count(*) n, count(DISTINCT cod_ibge) m, round(sum(valor)/1e9,2) v FROM obras_sc")).rows[0];
const org = (await db.query("SELECT origem, count(*) n FROM obras_sc GROUP BY 1 ORDER BY 2 DESC LIMIT 8")).rows;
console.log(`✔ obras_sc: ${grav} vínculos obra-município (${total} obras SC varridas) · ${c.m} munis · R$${c.v}bi`);
console.log("  por origem:", org.map((o) => (o.origem || "?") + "=" + o.n).join(" · "));
await db.end();
