// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// relatorio_folha_es.mjs — a entrega do Espírito Santo: quem tem folha nominal, com que qualidade, e quem falta.
//
// Lê tudo do banco na hora (nada escrito à mão) e mede a coleta contra o DENOMINADOR EXTERNO da RAIS 2025
// ([[pnigp-conferidor-rais-denominador-folha]]) — uma razão de 0,2 ou de 3,0 não é divergência metodológica,
// é defeito de coleta. As fontes são DESCOBERTAS no catálogo do banco, nunca listadas à mão: lista fixa envelhece
// e ignora coletor novo em silêncio ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
//
// Uso: node scripts/relatorio_folha_es.mjs   ·   SAIDA=C:/caminho/arquivo.html
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import fs from "fs";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF_ALVO || "ES";
const COD = "32";
const SAIDA = process.env.SAIDA || `C:/Users/PC/folha-servidores-${UF.toLowerCase()}.html`;

const mil = (n) => Number(n || 0).toLocaleString("pt-BR");
const brl = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── 1. descobre as fontes e monta a união do estado ─────────────────────────────────────────────────────────────
const tabs = (await q(`select table_name t, string_agg(column_name, ',') cols,
    string_agg(column_name, ',') filter (where data_type in ('numeric','integer','bigint','double precision','real')) num
  from information_schema.columns where table_schema='public' and table_name like 'folha_servidores_%'
  group by 1 order by 1`)).rows;

const partes = [];
for (const t of tabs) {
  const cols = t.cols.split(",");
  if (!cols.includes("cod_ibge")) continue;
  const num = (t.num || "").split(",").filter(Boolean);
  const acha = (lista, re) => lista.find((c) => re.test(c));
  const val = acha(num, /^(bruto|valor_bruto|remuneracao_bruta|provento|proventos|salario_bruto)$/)
           || acha(num, /bruto|provento|remunera|salario|vencimento|rendimento/)
           || acha(num, /^valor$/);
  const sec = acha(cols, /^(secretaria|lotacao|orgao|setor)$/) || acha(cols, /secretaria|lotacao|organograma|orgao|unidade|setor/);
  const car = acha(cols, /^(cargo|nome_cargo|descricao_cargo)$/) || acha(cols, /cargo|funcao/);
  const comp = acha(cols, /^(competencia|anomes|referencia|mes_referencia)$/);
  const nome = acha(cols, /^nome$/);
  if (!val) continue;
  partes.push(`select '${t.t.replace("folha_servidores_", "")}'::text fonte, cod_ibge::text,
    ${comp ? `nullif(btrim(${comp}::text),'')` : "null::text"} competencia,
    ${nome ? "nullif(btrim(nome),'')" : "null::text"} nome,
    ${car ? `nullif(btrim(${car}::text),'')` : "null::text"} cargo,
    ${sec ? `nullif(btrim(${sec}::text),'')` : "null::text"} secretaria,
    (${val})::numeric valor
   from ${t.t} where left(cod_ibge::text,2) = '${COD}'`);
}
await q(`drop view if exists vw_folha_es cascade`);
await q(`create view vw_folha_es as ${partes.join("\nunion all\n")}`);
console.log(`[${UF}] ${partes.length} fontes de folha na união`);

// ── 2. a MELHOR fatia de cada município: fonte + competência com mais servidores ─────────────────────────────────
// (o mesmo município pode ter várias competências coletadas; misturá-las conta a mesma pessoa N vezes)
const melhor = (await q(`
with fatia as (
  select cod_ibge, fonte, coalesce(competencia,'-') competencia,
         count(*) linhas,
         count(*) filter (where valor > 0) com_valor,
         count(*) filter (where cargo is not null) com_cargo,
         count(*) filter (where secretaria is not null) com_secretaria,
         count(*) filter (where nome is not null) com_nome,
         sum(valor) filter (where valor > 0) folha,
         percentile_cont(0.5) within group (order by valor) filter (where valor > 0) mediana
    from vw_folha_es group by 1,2,3
),
top as (select distinct on (cod_ibge) * from fatia order by cod_ibge, com_valor desc, linhas desc)
select m.cod_ibge, m.nome municipio, t.fonte, t.competencia, t.linhas, t.com_valor, t.com_cargo,
       t.com_secretaria, t.com_nome, round(t.folha) folha, round(t.mediana) mediana,
       r.vinculos rais, round(t.linhas::numeric / nullif(r.vinculos,0), 2) razao_rais
  from municipios_br m
  left join top t on t.cod_ibge = m.cod_ibge
  left join (select cod_ibge6, count(*) filter (where ativo_3112) vinculos from folha_rais_municipal
              where esfera_grupo = 'municipal' and left(cod_ibge6,2) = '${COD}' group by 1) r
    on r.cod_ibge6 = left(m.cod_ibge, 6)
 where m.uf = '${UF}'
 order by t.linhas desc nulls last, m.nome`)).rows;

const comDado = melhor.filter((r) => r.fonte);
const semDado = melhor.filter((r) => !r.fonte);
const soma = (f) => comDado.reduce((s, r) => s + Number(r[f] || 0), 0);
console.log(`\n${comDado.length} de ${melhor.length} municípios com folha · ${mil(soma("linhas"))} servidores · ${brl(soma("folha"))} na competência de referência`);
console.table(comDado.slice(0, 15).map((r) => ({ municipio: r.municipio, fonte: r.fonte, comp: r.competencia, servidores: r.linhas, folha: brl(r.folha), rais: r.rais, razao: r.razao_rais })));
if (semDado.length) console.log("SEM FOLHA:", semDado.map((r) => r.municipio).join(", "));

const suspeitos = comDado.filter((r) => r.razao_rais && (r.razao_rais < 0.5 || r.razao_rais > 1.8));
if (suspeitos.length) {
  console.log(`\n⚠ ${suspeitos.length} municípios fora da faixa 0,5–1,8 da RAIS (candidatos a coleta parcial ou a espelho):`);
  console.table(suspeitos.map((r) => ({ municipio: r.municipio, fonte: r.fonte, coletado: r.linhas, rais: r.rais, razao: r.razao_rais })));
}

// ── 3. recortes que respondem a pergunta do Heitor: secretaria e cargo ───────────────────────────────────────────
const porFonte = (await q(`with fatia as (
  select fonte, cod_ibge, coalesce(competencia,'-') competencia, count(*) linhas,
    count(*) filter (where valor>0) com_valor from vw_folha_es group by 1,2,3),
 top as (select distinct on (cod_ibge) * from fatia order by cod_ibge, com_valor desc, linhas desc)
 select fonte, count(*) municipios, sum(linhas) servidores from top group by 1 order by 3 desc`)).rows;

const porSecretaria = (await q(`with fatia as (
  select cod_ibge, fonte, coalesce(competencia,'-') competencia, count(*) n, count(*) filter (where valor>0) cv
    from vw_folha_es group by 1,2,3),
 top as (select distinct on (cod_ibge) * from fatia order by cod_ibge, cv desc, n desc)
 select upper(f.secretaria) secretaria, count(*) servidores, round(sum(f.valor)) folha,
        round(percentile_cont(0.5) within group (order by f.valor) filter (where f.valor>0)) mediana
   from vw_folha_es f join top t on t.cod_ibge=f.cod_ibge and t.fonte=f.fonte
        and coalesce(f.competencia,'-')=t.competencia
  where f.secretaria is not null and f.valor > 0
  group by 1 order by 2 desc limit 20`)).rows;

const porCargo = (await q(`with fatia as (
  select cod_ibge, fonte, coalesce(competencia,'-') competencia, count(*) n, count(*) filter (where valor>0) cv
    from vw_folha_es group by 1,2,3),
 top as (select distinct on (cod_ibge) * from fatia order by cod_ibge, cv desc, n desc)
 select upper(f.cargo) cargo, count(*) servidores,
        round(percentile_cont(0.5) within group (order by f.valor)) mediana,
        round(max(f.valor)) maior
   from vw_folha_es f join top t on t.cod_ibge=f.cod_ibge and t.fonte=f.fonte
        and coalesce(f.competencia,'-')=t.competencia
  where f.cargo is not null and f.valor > 0
  group by 1 order by 2 desc limit 20`)).rows;

// ── 4. página ───────────────────────────────────────────────────────────────────────────────────────────────────
const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
const totServ = soma("linhas"), totFolha = soma("folha"), totRais = comDado.reduce((s, r) => s + Number(r.rais || 0), 0);
const pctSec = comDado.filter((r) => +r.com_secretaria > 0).length, pctCar = comDado.filter((r) => +r.com_cargo > 0).length;

const linha = (r) => `<tr><td>${esc(r.municipio)}</td><td class="f">${esc(r.fonte || "—")}</td>
  <td>${esc(r.competencia || "—")}</td><td class="n">${mil(r.linhas)}</td><td class="n">${mil(r.com_valor)}</td>
  <td class="n">${r.folha ? brl(r.folha) : "—"}</td><td class="n">${r.mediana ? brl(r.mediana) : "—"}</td>
  <td class="n">${mil(r.rais)}</td><td class="n ${r.razao_rais && (r.razao_rais < 0.5 || r.razao_rais > 1.8) ? "alerta" : ""}">${r.razao_rais ?? "—"}</td></tr>`;

const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Folha de pagamento dos municípios do Espírito Santo</title>
<style>
:root{color-scheme:light;--bg:#fcfcfb;--surface:#fff;--line:#e5e4e0;--ink:#0b0b0b;--ink2:#52514e;--ink3:#7a7975;
 --s1:#2a78d6;--ok:#0ca30c;--warn:#fab219;--crit:#d03b3b}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--bg:#141413;--surface:#1a1a19;
 --line:#33322f;--ink:#fff;--ink2:#c3c2b7;--ink3:#8f8e85;--s1:#3987e5}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);
 font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:48px 24px 96px}
h1{font-size:2.1rem;line-height:1.2;margin:0 0 8px;letter-spacing:-.02em}
h2{font-size:1.35rem;margin:52px 0 6px}p{margin:8px 0 0;color:var(--ink2);max-width:70ch}
.sub{color:var(--ink3);font-size:.92rem;margin-top:4px}
.heros{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:28px 0 8px}
.hero{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 18px}
.hero b{display:block;font-size:1.9rem;line-height:1.15;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.hero span{color:var(--ink3);font-size:.85rem}
.scroll{overflow-x:auto;margin-top:14px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
table{border-collapse:collapse;width:100%;font-size:.92rem}
th,td{padding:9px 12px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap}
thead th{font-size:.76rem;text-transform:uppercase;letter-spacing:.05em;color:var(--ink3);font-weight:600}
tbody tr:last-child td{border-bottom:0}
td.n{text-align:right;font-variant-numeric:tabular-nums}
td.f{color:var(--ink3);font-size:.85rem}
.alerta{color:var(--crit);font-weight:600}
.aviso{border-left:3px solid var(--warn);padding:6px 0 6px 14px;margin-top:16px;color:var(--ink2)}
footer{margin-top:64px;color:var(--ink3);font-size:.85rem;border-top:1px solid var(--line);padding-top:16px}
</style></head><body><div class="wrap">
<h1>Folha de pagamento dos municípios do Espírito Santo</h1>
<p class="sub">Servidor a servidor, com cargo, lotação e remuneração, direto dos portais de transparência municipais. Gerado em ${agora}.</p>

<div class="heros">
 <div class="hero"><b>${comDado.length}/78</b><span>municípios com folha nominal</span></div>
 <div class="hero"><b>${mil(totServ)}</b><span>servidores na competência de referência</span></div>
 <div class="hero"><b>${brl(totFolha)}</b><span>folha bruta do mês</span></div>
 <div class="hero"><b>${pctSec}</b><span>municípios com lotação/secretaria</span></div>
 <div class="hero"><b>${pctCar}</b><span>municípios com cargo</span></div>
</div>
<p>O denominador de conferência é a <b>RAIS 2025</b> (vínculos municipais ativos em 31/12): ${mil(totRais)} vínculos
nos municípios já coletados. A razão coletado/RAIS é a prova real — perto de 1,0 significa que a coleta pegou o
ente inteiro; muito abaixo indica que ficaram de fora fundos, autarquias ou a câmara.</p>

<h2>Município a município</h2>
<div class="scroll"><table><thead><tr><th>Município</th><th>Fonte</th><th>Competência</th><th>Servidores</th>
<th>Com valor</th><th>Folha bruta</th><th>Mediana</th><th>RAIS 2025</th><th>Razão</th></tr></thead>
<tbody>${comDado.map(linha).join("")}</tbody></table></div>
${semDado.length ? `<div class="aviso"><b>Sem folha coletada (${semDado.length}):</b> ${semDado.map((r) => esc(r.municipio)).join(" · ")}</div>` : ""}

<h2>De onde vem o dado</h2>
<div class="scroll"><table><thead><tr><th>Fonte (produto do portal)</th><th>Municípios</th><th>Servidores</th></tr></thead>
<tbody>${porFonte.map((r) => `<tr><td>${esc(r.fonte)}</td><td class="n">${mil(r.municipios)}</td><td class="n">${mil(r.servidores)}</td></tr>`).join("")}</tbody></table></div>

<h2>Por secretaria</h2>
<p class="sub">Lotação declarada pelo próprio município, nas 20 maiores.</p>
<div class="scroll"><table><thead><tr><th>Secretaria / lotação</th><th>Servidores</th><th>Folha</th><th>Mediana</th></tr></thead>
<tbody>${porSecretaria.map((r) => `<tr><td>${esc(r.secretaria)}</td><td class="n">${mil(r.servidores)}</td><td class="n">${brl(r.folha)}</td><td class="n">${brl(r.mediana)}</td></tr>`).join("")}</tbody></table></div>

<h2>Por cargo</h2>
<div class="scroll"><table><thead><tr><th>Cargo</th><th>Servidores</th><th>Mediana</th><th>Maior remuneração</th></tr></thead>
<tbody>${porCargo.map((r) => `<tr><td>${esc(r.cargo)}</td><td class="n">${mil(r.servidores)}</td><td class="n">${brl(r.mediana)}</td><td class="n">${brl(r.maior)}</td></tr>`).join("")}</tbody></table></div>

<footer>Fontes: portais de transparência municipais (Portal TP, TransparenciaWeb, Ágape, Betha, SMARAPD) e
Prefeitura de Vitória. Denominador: RAIS 2025 (MTE). Uma competência por município — a mais cheia disponível.
Números lidos do banco no momento da geração.</footer>
</div></body></html>`;

fs.writeFileSync(SAIDA, html, "utf8");
console.log(`\n✔ ${SAIDA}`);
await db.end();
