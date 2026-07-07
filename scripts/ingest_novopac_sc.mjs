// Novo PAC / ObrasGov — empreendimentos por município: nº obras, investimento previsto, por situação. Fonte: ObrasGov (Casa Civil). State-agnostic (UF env).
// ATENÇÃO: paginação do metadata é mentirosa → paginar até content vir vazio.
import fs from "fs"; import pg from "pg";
const UF = process.env.UF || "SC";
const norm = (s) => (s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const H = { "User-Agent": "Mozilla/5.0", "Accept-Language": "pt-BR" };
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const byNome = new Map((await db.query("SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'")).rows.map(e => [norm(e.nome), e.cod_ibge]));
const agg = new Map(); let totalProj = 0, semMatch = 0;
for (let pag = 0; pag < 200; pag++) {
  const j = await fetch(`https://api.obrasgov.gestao.gov.br/obrasgov/api/projeto-investimento?uf=${UF}&pagina=${pag}&tamanhoDaPagina=100`, { headers: H }).then(r => r.json()).catch(() => null);
  const arr = j?.content || [];
  if (!arr.length) break;
  for (const p of arr) {
    totalProj++;
    // acha executor que seja município (MUNICIPIO DE / PREFEITURA)
    const ex = (p.executores || []).map(e => e.nome || "").find(nm => /MUNIC[IÍ]PIO|PREFEITURA/i.test(nm));
    if (!ex) { semMatch++; continue; }
    const cod = byNome.get(norm(ex.replace(/MUNIC[IÍ]PIO DE |PREFEITURA (MUNICIPAL )?DE /i, "")));
    if (!cod) { semMatch++; continue; }
    const val = (p.fontesDeRecurso || []).reduce((s, f) => s + (+f.valorInvestimentoPrevisto || 0), 0);
    if (!agg.has(cod)) agg.set(cod, { proj: 0, valor: 0, andamento: 0 });
    const o = agg.get(cod); o.proj++; o.valor += val; if (/execu|andamento|obras/i.test(p.situacao || "")) o.andamento++;
  }
}
await db.query(`CREATE TABLE IF NOT EXISTS novopac_sc (cod_ibge TEXT PRIMARY KEY, projetos INT, valor_previsto NUMERIC, em_andamento INT, atualizado TIMESTAMPTZ DEFAULT now())`);
await db.query("DELETE FROM novopac_sc WHERE cod_ibge IN (SELECT cod_ibge FROM entes_sc WHERE tipo='M')");
let n = 0;
for (const [cod, o] of agg) { await db.query("INSERT INTO novopac_sc (cod_ibge,projetos,valor_previsto,em_andamento) VALUES ($1,$2,$3,$4) ON CONFLICT (cod_ibge) DO UPDATE SET projetos=EXCLUDED.projetos,valor_previsto=EXCLUDED.valor_previsto,em_andamento=EXCLUDED.em_andamento,atualizado=now()", [cod, o.proj, o.valor, o.andamento]); n++; }
const c = (await db.query("SELECT count(*) n, sum(projetos) p, round(sum(valor_previsto)/1e6,1) v FROM novopac_sc")).rows[0];
console.log(`✔ novopac_sc: ${n} munis · ${c.p} obras municipais (${totalProj} total, ${semMatch} não-municipais/sem match) · R$ ${c.v} mi previstos`);
await db.end();
