// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// relatorio_folha_uf.mjs — a entrega de uma UF: quem tem folha nominal, com que qualidade, e quem falta.
//
// Lê tudo do banco na hora (nada escrito à mão) e mede a coleta contra o DENOMINADOR EXTERNO da RAIS 2025
// ([[pnigp-conferidor-rais-denominador-folha]]) — uma razão de 0,2 ou de 3,0 não é divergência metodológica,
// é defeito de coleta. As fontes são DESCOBERTAS no catálogo do banco, nunca listadas à mão: lista fixa envelhece
// e ignora coletor novo em silêncio ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
//
// Uso: UF=ES node scripts/relatorio_folha_uf.mjs   ·   UF=AM ...   ·   SAIDA=C:/caminho/arquivo.html
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import fs from "fs";
import { pool, withRetry } from "./_cadprev.mjs";
import { SG_UF, COD_UF, NOME_ESTADO } from "./_uf.mjs";
import { criaUniaoFolha } from "./_folha_uniao.mjs";

const db = pool();
const q = withRetry(db);
const UF = SG_UF;              // vem de _uf.mjs (env UF), a fonte única da verdade da UF
const COD = COD_UF;
const SAIDA = process.env.SAIDA || `C:/Users/PC/folha-servidores-${UF.toLowerCase()}.html`;

const mil = (n) => Number(n || 0).toLocaleString("pt-BR");
const brl = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── 1. descobre as fontes e monta a união do estado ─────────────────────────────────────────────────────────────
const { nome: VW, fontes } = await criaUniaoFolha(q, COD, UF);
console.log(`[${UF}] ${fontes} fontes de folha na união (${VW})`);

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
    from ${VW} group by 1,2,3
),
top as (select distinct on (cod_ibge) * from fatia order by cod_ibge, com_valor desc, linhas desc)
-- 🚨 a razão contra a RAIS se mede por QUEM FOI PAGO, não por linha: a lista do Portal TP traz **demitidos e
-- licenças sem remuneração** junto dos ativos (São Mateus: 3.075 linhas "Demitido", 77 com valor). Medindo por
-- linha, o município aparece com 1,77 e parece coleta inflada — quando o defeito é do numerador.
select m.cod_ibge, m.nome municipio, t.fonte, t.competencia, t.linhas, t.com_valor, t.com_cargo,
       t.com_secretaria, t.com_nome, round(t.folha) folha, round(t.mediana) mediana,
       r.vinculos rais, round(t.com_valor::numeric / nullif(r.vinculos,0), 2) razao_rais
  from municipios_br m
  left join top t on t.cod_ibge = m.cod_ibge
  left join (select cod_ibge6, count(*) filter (where ativo_3112) vinculos from folha_rais_municipal
              where esfera_grupo = 'municipal' and left(cod_ibge6,2) = '${COD}' group by 1) r
    on r.cod_ibge6 = left(m.cod_ibge, 6)
 where m.uf = '${UF}'
 order by t.linhas desc nulls last, m.nome`)).rows;

// ── verificação NA FONTE: o que o site do próprio município publica ────────────────────────────────────────────
// Coletar do agregador responde "o dado chegou?"; abrir o site responde "o município publica?". As duas coisas
// juntas é o que sustenta o pedido por LAI ([[feedback-verificar-por-portal]]). Vem de verifica_publicacao_folha_uf.mjs.
const verif = (await q(`select cod_ibge, municipio, veredito, url_pessoal, rotulo_pessoal, erp, plataforma,
    publica, evidencia from folha_verificacao_site where uf=$1 order by municipio`, [UF]).catch(() => ({ rows: [] }))).rows;
const porVeredito = [...verif.reduce((m, r) => m.set(r.veredito, [...(m.get(r.veredito) || []), r]), new Map())]
  .sort((a, b) => b[1].length - a[1].length);
const VER_TXT = {
  publica_arquivos: "publica a folha em arquivo no próprio site",
  publica_tabela_com_valor: "publica tabela com remuneração no próprio site",
  publica_tabela_sem_valor: "publica lista nominal SEM remuneração",
  publica_via_agregador: "não hospeda a folha: delega a um agregador (AAM, ANC, Diretório Digital…)",
  portal_agregador_indisponivel: "delega a um agregador que estava fora do ar na verificação — re-sondar",
  portal_sem_modulo_de_pessoal: "tem portal de transparência, e nele não existe item de pessoal",
  site_sem_transparencia: "site no ar sem link de transparência",
  site_fora_do_ar: "nenhum endereço do município respondeu",
  so_login_do_servidor: "o único item de pessoal é o contracheque (login do funcionário), não publicação",
  anexos_que_nao_sao_folha: "o menu de pessoal existe e os anexos não são folha",
  pagina_de_pessoal_vazia: "o item existe no menu e abre uma página em branco",
  pagina_de_pessoal_quebrada: "o item existe no menu e o destino não responde",
  menu_sem_dado: "o item de pessoal abre página sem tabela e sem arquivo",
  spa_sem_dado: "a página é um SPA: o HTML servido não traz o dado",
  portal_com_captcha: "o portal exige captcha na entrada",
  publica_mas_desatualizado: "publica, mas parou de atualizar — o arquivo mais novo tem anos",
  publica_pdf_sem_texto: "publica a folha em PDF digitalizado — sem camada de texto, só sairia por OCR",
  menu_sem_edicoes: "o tema de servidores existe no portal e não tem nenhum arquivo publicado",
  publica_por_consulta_no_portal: "o portal publica, mas só entrega a folha depois de uma consulta — provado pela coleta",
  sem_site_proprio_dado_vem_do_agregador: "o site do município não entrega a folha; quem publica é o agregador",
};

const comDado = melhor.filter((r) => r.fonte);
const semDado = melhor.filter((r) => !r.fonte);
// 🚨 "tem folha" não pode ser "tem uma linha": Urucurituba entrava no placar com 1 servidor e Manacapuru com 51
// (todos sem valor) para 13.856 vínculos na RAIS. O número defensável é o de coleta CONSISTENTE — pelo menos 1/5
// do denominador externo. Os demais aparecem como coleta residual, não como cobertura.
const consistente = (r) => +r.com_valor > 0 && (!r.rais || +r.com_valor >= 0.2 * +r.rais);
const solidos = comDado.filter(consistente);
const residuais = comDado.filter((r) => !consistente(r));
const soma = (f) => comDado.reduce((s, r) => s + Number(r[f] || 0), 0);
console.log(`\n${comDado.length} de ${melhor.length} municípios com folha · ${mil(soma("linhas"))} servidores · ${brl(soma("folha"))} na competência de referência`);
console.log(`   dos quais ${solidos.length} com coleta CONSISTENTE (>=20% da RAIS) e ${residuais.length} apenas residual: ${residuais.map((r) => `${r.municipio} (${r.com_valor})`).join(", ") || "—"}`);
console.table(comDado.slice(0, 15).map((r) => ({ municipio: r.municipio, fonte: r.fonte, comp: r.competencia, servidores: r.linhas, folha: brl(r.folha), rais: r.rais, razao: r.razao_rais })));
if (semDado.length) console.log("SEM FOLHA:", semDado.map((r) => r.municipio).join(", "));

const suspeitos = comDado.filter((r) => r.razao_rais && (r.razao_rais < 0.5 || r.razao_rais > 1.8));
if (suspeitos.length) {
  console.log(`\n⚠ ${suspeitos.length} municípios fora da faixa 0,5–1,8 da RAIS (candidatos a coleta parcial ou a espelho):`);
  console.table(suspeitos.map((r) => ({ municipio: r.municipio, fonte: r.fonte, linhas: r.linhas, pagos: r.com_valor, rais: r.rais, razao: r.razao_rais })));
}

// ── 3. recortes que respondem a pergunta do Heitor: secretaria e cargo ───────────────────────────────────────────
const porFonte = (await q(`with fatia as (
  select fonte, cod_ibge, coalesce(competencia,'-') competencia, count(*) linhas,
    count(*) filter (where valor>0) com_valor from ${VW} group by 1,2,3),
 top as (select distinct on (cod_ibge) * from fatia order by cod_ibge, com_valor desc, linhas desc)
 select fonte, count(*) municipios, sum(linhas) servidores from top group by 1 order by 3 desc`)).rows;

const porSecretaria = (await q(`with fatia as (
  select cod_ibge, fonte, coalesce(competencia,'-') competencia, count(*) n, count(*) filter (where valor>0) cv
    from ${VW} group by 1,2,3),
 top as (select distinct on (cod_ibge) * from fatia order by cod_ibge, cv desc, n desc)
 select upper(f.secretaria) secretaria, count(*) servidores, round(sum(f.valor)) folha,
        round(percentile_cont(0.5) within group (order by f.valor) filter (where f.valor>0)) mediana
   from ${VW} f join top t on t.cod_ibge=f.cod_ibge and t.fonte=f.fonte
        and coalesce(f.competencia,'-')=t.competencia
  where f.secretaria is not null and f.valor > 0
  group by 1 order by 2 desc limit 20`)).rows;

const porCargo = (await q(`with fatia as (
  select cod_ibge, fonte, coalesce(competencia,'-') competencia, count(*) n, count(*) filter (where valor>0) cv
    from ${VW} group by 1,2,3),
 top as (select distinct on (cod_ibge) * from fatia order by cod_ibge, cv desc, n desc)
 select upper(f.cargo) cargo, count(*) servidores,
        round(percentile_cont(0.5) within group (order by f.valor)) mediana,
        round(max(f.valor)) maior
   from ${VW} f join top t on t.cod_ibge=f.cod_ibge and t.fonte=f.fonte
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
<title>Folha de pagamento dos municípios ${"do " + NOME_ESTADO}</title>
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
.ev{font-size:.82rem;color:var(--ink3);max-width:640px}
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
<h1>Folha de pagamento dos municípios ${"do " + NOME_ESTADO}</h1>
<p class="sub">Servidor a servidor, com cargo, lotação e remuneração, direto dos portais de transparência municipais. Gerado em ${agora}.</p>

<div class="heros">
 <div class="hero"><b>${solidos.length}/${melhor.length}</b><span>municípios com coleta consistente</span></div>
 <div class="hero"><b>${comDado.length}</b><span>com alguma folha (inclui ${residuais.length} residuais)</span></div>
 <div class="hero"><b>${mil(totServ)}</b><span>servidores na competência de referência</span></div>
 <div class="hero"><b>${brl(totFolha)}</b><span>folha bruta do mês</span></div>
 <div class="hero"><b>${pctSec}</b><span>municípios com lotação/secretaria</span></div>
 <div class="hero"><b>${pctCar}</b><span>municípios com cargo</span></div>
</div>
<p>O denominador de conferência é a <b>RAIS 2025</b> (vínculos municipais ativos em 31/12): ${mil(totRais)} vínculos
nos municípios já coletados. A razão é <b>pagos no mês ÷ RAIS</b> — e o numerador é quem recebeu, não a linha: a
lista do portal traz demitidos e licenças sem remuneração junto dos ativos (em São Mateus, 3.075 linhas
&ldquo;Demitido&rdquo;), o que por linha faria o município parecer inflado.</p>
<p>Razão <b>muito abaixo de 1,0</b> é coleta curta — ficaram de fora fundos, autarquias ou a câmara. Razão
<b>acima de 1,8</b>, nos municípios pequenos, foi verificada e <b>não é duplicação</b>: o número de nomes distintos
bate com o de linhas; é a RAIS que subdeclara onde há muito contratado temporário.</p>

<h2>Município a município</h2>
<div class="scroll"><table><thead><tr><th>Município</th><th>Fonte</th><th>Competência</th><th>Servidores</th>
<th>Com valor</th><th>Folha bruta</th><th>Mediana</th><th>RAIS 2025</th><th>Razão</th></tr></thead>
<tbody>${comDado.map(linha).join("")}</tbody></table></div>
${semDado.length ? `<div class="aviso"><b>Sem folha coletada (${semDado.length}):</b> ${semDado.map((r) => esc(r.municipio)).join(" · ")}</div>` : ""}

${!verif.length ? "" : `<h2>Verificação na fonte: o que o site de cada município publica</h2>
<p class="sub">Os ${verif.length} municípios do estado, abertos um a um no endereço oficial. Não é o que o agregador
entrega — é o que a prefeitura publica. Cada linha tem a URL do item de pessoal e o que foi encontrado nela.</p>
<div class="scroll"><table><thead><tr><th>Situação</th><th>Municípios</th><th>O que significa</th></tr></thead>
<tbody>${porVeredito.map(([v, rs]) => `<tr><td><b>${esc(v.replace(/_/g, " "))}</b></td><td class="n">${rs.length}</td>
  <td>${esc(VER_TXT[v] || "")}</td></tr>`).join("")}</tbody></table></div>
<div class="scroll"><table><thead><tr><th>Município</th><th>Situação</th><th>Item de pessoal encontrado</th><th>Evidência</th></tr></thead>
<tbody>${verif.map((r) => `<tr><td>${esc(r.municipio)}</td><td>${esc(r.veredito.replace(/_/g, " "))}</td>
  <td>${r.url_pessoal ? `<a href="${esc(r.url_pessoal)}">${esc(r.rotulo_pessoal || r.url_pessoal.slice(0, 50))}</a>` : "—"}</td>
  <td class="ev">${esc(r.evidencia || "")}</td></tr>`).join("")}</tbody></table></div>`}

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

<footer>Fontes: portais de transparência municipais, lidos por
os coletores do PNIGP. Denominador: RAIS 2025 (MTE). Uma competência por município — a mais cheia disponível.
Números lidos do banco no momento da geração.</footer>
</div></body></html>`;

fs.writeFileSync(SAIDA, html, "utf8");
console.log(`\n✔ ${SAIDA}`);
await db.end();
