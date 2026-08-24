// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cataloga_itsolucoes.mjs — enumera as entidades do portal `portaltransparencia.app.br` (IT Soluções).
//
// ⭐ ACHADO EM 21/ago/2026, saindo de uma FALHA: 8 câmaras de PE estavam classificadas como "portaltp" e davam
// `redirect (302)`. O host não era portaltp coisa nenhuma — é outro produto, e ele publica o que falta em
// Pernambuco: **REMUNERAÇÃO NOMINAL INDIVIDUALIZADA** (o TCE-PE dá nome sem valor em 184 câmaras).
//
// A ROTA (tudo GET, sem navegador e sem postback):
//   `servidoresMunicipal.aspx?t=1&p_i={ENTIDADE}&p_t=0&ano=AAAA&mes=M`
// devolve a tabela pronta com: ANO · SERVIDOR/AGENTE (matrícula + **CPF mascarado** + nome) · CARGO/JORNADA ·
// FUNÇÃO/VÍNCULO · REMUNERAÇÃO (Vencimentos / Desconto / Líquido).
//
// `p_i` é o id da entidade e é ENUMERÁVEL — é o que este script mapeia, gravando nome e município de cada uma
// ([[pnigp-elmar-catalogo-ctx-enumeravel]] é o mesmo padrão: quando o id é sequencial, o catálogo é a fonte).
//
// Uso: node scripts/cataloga_itsolucoes.mjs        · DE=1 ATE=400 CONC=6
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const DE = Number(process.env.DE || 1);
const ATE = Number(process.env.ATE || 400);
const CONC = Number(process.env.CONC || 6);
const BASE = "https://portaltransparencia.app.br";
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };

await q(`create table if not exists itsolucoes_entidade (
  p_i int primary key, entidade text, municipio_txt text, uf text, cod_ibge text,
  tem_remuneracao boolean, linhas_amostra int, em timestamptz default now())`);

async function baixa(url) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(45000) });
      if (r.ok) return await r.text();
    } catch { /* retry */ }
    await new Promise((s) => setTimeout(s, 1500 * (t + 1)));
  }
  return null;
}

const limpa = (s) => String(s || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

let achadas = 0, comRem = 0;
const ids = [];
for (let i = DE; i <= ATE; i++) ids.push(i);

for (let k = 0; k < ids.length; k += CONC) {
  await Promise.all(ids.slice(k, k + CONC).map(async (p_i) => {
    const html = await baixa(`${BASE}/servidoresMunicipal.aspx?t=1&p_i=${p_i}&p_t=0&ano=2026&mes=7`);
    if (!html) return;
    // 🚨 O RODAPÉ NÃO IDENTIFICA DE FORMA CONFIÁVEL: `hdfNomeEntidade` vem VAZIO e o nome com UF colado
    //    ("Camara Municipal de Alagoinha - PE") só aparece em parte das instalações — casar por ele achou 5
    //    entidades em 600 ids. Quem identifica de verdade é o LINK "Ir ao Site": `{slug}.{uf}.leg.br` para
    //    câmara e `{slug}.{uf}.gov.br` para prefeitura ([[pnigp-produto-no-link-do-site]]).
    const site = html.match(/https?:\/\/(?:www\.)?([a-z0-9-]+)\.([a-z]{2})\.(leg|gov)\.br/i);
    const rod = html.match(/((?:C[âa]mara|Prefeitura|Munic[íi]pio|Fundo|Instituto)[^<]{5,80}?)\s*-\s*([A-Z]{2})\b/i);
    if (!site && !rod) return;
    const uf = (site ? site[2] : rod[2]).toUpperCase();
    const entidade = rod ? limpa(rod[1])
      : `${site[3].toLowerCase() === "leg" ? "Câmara Municipal de" : "Prefeitura de"} ${site[1]}`;
    const linhas = (html.match(/<tr[^>]*>/gi) || []).length - 1;
    // ⚠️ NÃO exigir "Vencimentos: R$" colado — entre o rótulo e o valor há tags e `&nbsp;`. Exigir o par
    //    grudado devolveu "não publica remuneração" numa página que tem 28 ocorrências do rótulo.
    const temRem = /Vencimentos:/i.test(html);
    achadas++; if (temRem) comRem++;
    // o município sai do SLUG do site quando existe (é o que casa com municipios_br sem depender de redação)
    const municipioTxt = site ? site[1].replace(/-/g, " ") : entidade.replace(/^.*?(?:de|do|da|dos|das)\s+/i, "").trim();
    await q(`insert into itsolucoes_entidade (p_i, entidade, municipio_txt, uf, tem_remuneracao, linhas_amostra)
             values ($1,$2,$3,$4,$5,$6)
             on conflict (p_i) do update set entidade=excluded.entidade, municipio_txt=excluded.municipio_txt,
               uf=excluded.uf, tem_remuneracao=excluded.tem_remuneracao, linhas_amostra=excluded.linhas_amostra, em=now()`,
      [p_i, entidade, municipioTxt, uf, temRem, Math.max(0, linhas)]);
  }));
  if ((k / CONC) % 10 === 0) process.stdout.write(`   ${k + CONC}/${ids.length} · ${achadas} entidades · ${comRem} com remuneração\r`);
}
console.log(`\n[itsolucoes] ${achadas} entidades no intervalo ${DE}-${ATE} · ${comRem} publicam remuneração nominal`);

// casa o texto do município com municipios_br (nome + UF)
await q(`update itsolucoes_entidade e set cod_ibge = m.cod_ibge
  from municipios_br m
 where m.uf = e.uf and nome_chave(m.nome) = nome_chave(e.municipio_txt) and e.cod_ibge is null`);
console.table((await q(`select uf, count(*)::int entidades,
    count(*) filter (where tem_remuneracao)::int com_remuneracao,
    count(*) filter (where entidade ~* 'c[âa]mara')::int camaras,
    count(*) filter (where cod_ibge is not null)::int casadas
  from itsolucoes_entidade group by 1 order by 2 desc`)).rows);
await db.end();
