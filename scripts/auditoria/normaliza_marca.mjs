// NORMALIZADOR de marca/modelo (derivado; não apaga o cru). Sobre app.item_marca_conferida_${uf}:
//  · marca_norm     = canônica (UPPER, sem acento, sem sufixo de empresa) → dedup caixa (Plastilit=PLASTILIT)
//  · modelo_norm    = canônico; NULL se == marca (o parser às vezes copia) ou genérico
//  · marca_suspeita = fornecedor (LTDA/ME/EIRELI…) · descritor (in natura/granel) · genérico · curta  → fora das análises
// Batch update (tabela pequena). node scripts/auditoria/normaliza_marca.mjs
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 300000 });
const UF = (process.env.UF || "sc").toLowerCase();
const CONF = `app.item_marca_conferida_${UF}`;

const SUFFIX = /\b(ltda|epp|eireli|mei|s\/?a\b|sa\b|cia|comercio|comercial|distribuidora?|distrib|industria|industrial|servicos?|cooperativa|coop|importadora?|exportadora?|atacado|varejo|representacoes?|empreendimentos?|solucoes?|tecnologia|construtora?|transportes?)\b/i;
const SO_ME = /\b(me|epp)\b/i;                                   // "…- ME" no fim
const DESCRITOR = /^(in ?natura|a? ?granel|nacional|importad[oa]|comum|diversos?|v[aá]rios?|propri[oa]|generic[oa]|sem\s*marca|marca\s*propria|a\s*definir|n[aã]o\s*informad|s\/?\s*marca|conforme|padrao|primeira\s*linha|qualquer|seguros?$|apolices?$|locacao|aluguel|mao\s*de\s*obra)/i;
const GENERICO = /^(marca|modelo|serv|servico|material|pe[cç]a|produto|item|unidade|kg|kilo|un|und|nc|na|x)$/i;

function normMarca(m) {
  if (!m) return { norm: null, suspeita: true, motivo: "vazia" };
  let s = String(m).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const low = s.toLowerCase();
  if (DESCRITOR.test(low)) return { norm: null, suspeita: true, motivo: "descritor" };
  if (GENERICO.test(low)) return { norm: null, suspeita: true, motivo: "generico" };
  const ehForn = SUFFIX.test(low) || /\b(me|epp|eireli|ltda)\s*$/i.test(low);
  s = s.replace(SUFFIX, " ").replace(/[-–\/,.;:]?\s*\b(me|epp)\b\s*$/i, "").replace(/[.,;:\-\/\s]+$/, "").trim();
  const canon = s.toUpperCase().replace(/\s+/g, " ").trim();
  if (canon.length < 2) return { norm: null, suspeita: true, motivo: "curta" };
  return { norm: canon, suspeita: ehForn, motivo: ehForn ? "fornecedor" : null };
}
function normModelo(modelo, marcaNorm) {
  if (!modelo) return null;
  const s = String(modelo).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  if (s.length < 2 || GENERICO.test(s.toLowerCase())) return null;
  if (marcaNorm && s === marcaNorm) return null;             // modelo == marca → dedup
  return s;
}

async function main() {
  for (const col of ["marca_norm text", "modelo_norm text", "marca_suspeita boolean", "marca_motivo text"])
    await db.query(`ALTER TABLE ${CONF} ADD COLUMN IF NOT EXISTS ${col}`);
  const LOTE = 5000; let tot = 0, susp = 0;
  for (let off = 0; ; off += LOTE) {
    const rows = (await db.query(`SELECT ctid, marca, modelo FROM ${CONF} ORDER BY ctid LIMIT ${LOTE} OFFSET ${off}`)).rows;
    if (!rows.length) break;
    const ct = [], mn = [], mo = [], sp = [], mt = [];
    for (const r of rows) {
      const a = normMarca(r.marca); const md = normModelo(r.modelo, a.norm);
      ct.push(r.ctid); mn.push(a.norm || ""); mo.push(md || ""); sp.push(a.suspeita); mt.push(a.motivo || "");
      if (a.suspeita) susp++;
    }
    await db.query(`UPDATE ${CONF} e SET marca_norm=nullif(v.mn,''), modelo_norm=nullif(v.mo,''), marca_suspeita=v.sp, marca_motivo=nullif(v.mt,'')
      FROM (SELECT unnest($1::tid[]) ct, unnest($2::text[]) mn, unnest($3::text[]) mo, unnest($4::bool[]) sp, unnest($5::text[]) mt) v
      WHERE e.ctid=v.ct`, [ct, mn, mo, sp, mt]);
    tot += rows.length; process.stdout.write(`  normalizados: ${tot}\r`);
  }
  console.log(`\n✔ normalizados: ${tot} · suspeitas (fora das análises): ${susp} (${(100 * susp / tot).toFixed(0)}%)`);
  console.log("\nTOP marca_norm (limpa, sem suspeita):");
  console.table((await db.query(`SELECT marca_norm, count(*) n, count(*) filter(where modelo_norm is not null) c_mod FROM ${CONF} WHERE not marca_suspeita and marca_norm is not null GROUP BY 1 ORDER BY 2 DESC LIMIT 12`)).rows);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
