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

// ═══ RODAPÉ DE TABELA COLADO NO FIM DA MARCA ═══
// Medido em 07/ago: 158 linhas trazem "Total do Participante" grudado — o rótulo que FECHA o bloco de cada
// licitante no Termo de Homologação. O leitor não parou na fronteira e engoliu o rodapé junto com a marca.
// Aparece em PCP e BLL, logo o furo está no leitor genérico de termo, não no parser de um portal só.
// Cortar aqui é o conserto certo NESTA camada: recupera a marca real quando ela existe antes do rótulo
// ("Brastemp Total do Participante" → BRASTEMP) e esvazia quando o rótulo era tudo que havia. Vale para
// todos os parsers de uma vez e para o que já está gravado. ⚠️ NÃO substitui consertar o leitor.
// São DUAS famílias de rodapé, e a segunda só apareceu depois de cortar a primeira: "Total do Participante"
// (PCP/BLL) e "Total Fornecedor" (SV). Ambas fecham o bloco do licitante — por isso `total ...` genérico.
const RODAPE = /\s*(total\s+(do\s+)?(participante|fornecedor|lote|item|geral)|total\s+geral|valor\s+total|subtotal)\b[\s:.\-]*$/i;
// critério de julgamento e afins: nunca é marca, mesmo aparecendo no campo.
const CRITERIO = /^(tecnica\s*e\s*preco|menor\s*preco|maior\s*desconto|melhor\s*tecnica|maior\s*lance|preco\s*global)$/i;
// rótulo de coluna sozinho e descritor de especificação ("original/genuína conforme edital") não são marca.
const ROTULO = /^(fornecedor|licitante|participante|vencedor[a]?|empresa|razao\s*social|proponente|marca|modelo|descricao|especificacao)$/i;
const ESPECIFICACAO = /(^|\/|\s)(original|genuina|equivalente|similar|cfme|conforme)\b.*(edital|termo|referencia|projeto|especificacao)/i;

function normMarca(m) {
  if (!m) return { norm: null, suspeita: true, motivo: "vazia" };
  let s = String(m).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  // corta o rodapé de tabela ANTES de julgar: é ele que faz marca real parecer lixo.
  const comRodape = RODAPE.test(s);
  if (comRodape) s = s.replace(RODAPE, "").trim();
  if (!s) return { norm: null, suspeita: true, motivo: "rodape_de_tabela" };
  const low = s.toLowerCase();
  if (DESCRITOR.test(low)) return { norm: null, suspeita: true, motivo: "descritor" };
  if (CRITERIO.test(low)) return { norm: null, suspeita: true, motivo: "criterio_julgamento" };
  if (ROTULO.test(low)) return { norm: null, suspeita: true, motivo: "rotulo_de_coluna" };
  if (ESPECIFICACAO.test(low)) return { norm: null, suspeita: true, motivo: "especificacao" };
  if (/marca\s*propria/i.test(low)) return { norm: null, suspeita: true, motivo: "marca_propria" };
  if (/^n[\/.\s-]?c$/i.test(low)) return { norm: null, suspeita: true, motivo: "nao_consta" };
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
  // ═══ POR PAR DISTINTO, NÃO POR PÁGINA DE ctid ═══
  // O desenho anterior paginava `ORDER BY ctid LIMIT/OFFSET` e dava UPDATE na MESMA tabela dentro do laço.
  // Em Postgres o UPDATE grava uma versão NOVA da linha, com ctid novo — então a ordenação muda embaixo da
  // paginação e o OFFSET desliza: linha visitada duas vezes, linha nunca visitada. Medido em 07/ago rodando
  // duas vezes seguidas sobre a MESMA base: TIGRE limpo saiu 88 na 1ª passada e 161 na 2ª. Irmão do
  // `distinct on` sem `order by` de 04/ago, e pego pela mesma regra: rodar DUAS vezes e comparar.
  // Agora normaliza o conjunto DISTINTO de (marca,modelo) — milhares, não centenas de milhares — e aplica
  // por JOIN de valor. Determinístico, set-based, e uma passada só.
  const pares = (await db.query(`SELECT DISTINCT marca, modelo FROM ${CONF}`)).rows;
  const ma = [], mb = [], mn = [], mo = [], sp = [], mt = [];
  let susp = 0;
  for (const r of pares) {
    const a = normMarca(r.marca); const md = normModelo(r.modelo, a.norm);
    ma.push(r.marca); mb.push(r.modelo); mn.push(a.norm || ""); mo.push(md || ""); sp.push(a.suspeita); mt.push(a.motivo || "");
    if (a.suspeita) susp++;
  }
  const res = await db.query(`
    UPDATE ${CONF} e SET marca_norm=nullif(v.mn,''), modelo_norm=nullif(v.mo,''), marca_suspeita=v.sp, marca_motivo=nullif(v.mt,'')
      FROM (SELECT unnest($1::text[]) ma, unnest($2::text[]) mb, unnest($3::text[]) mn,
                   unnest($4::text[]) mo, unnest($5::bool[]) sp, unnest($6::text[]) mt) v
     WHERE e.marca IS NOT DISTINCT FROM v.ma AND e.modelo IS NOT DISTINCT FROM v.mb`,
    [ma, mb, mn, mo, sp, mt]);
  const tot = res.rowCount;
  console.log(`✔ pares distintos: ${pares.length} · linhas normalizadas: ${tot} · pares suspeitos: ${susp}`);
  const orfas = (await db.query(`SELECT count(*) n FROM ${CONF} WHERE marca_suspeita IS NULL`)).rows[0].n;
  console.log(orfas > 0 ? `⚠ ${orfas} linhas NÃO foram alcançadas` : `✔ cobertura total: nenhuma linha ficou sem normalizar`);
  console.log("\nTOP marca_norm (limpa, sem suspeita):");
  console.table((await db.query(`SELECT marca_norm, count(*) n, count(*) filter(where modelo_norm is not null) c_mod FROM ${CONF} WHERE not marca_suspeita and marca_norm is not null GROUP BY 1 ORDER BY 2 DESC LIMIT 12`)).rows);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
