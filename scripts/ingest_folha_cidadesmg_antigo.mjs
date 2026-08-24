// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_cidadesmg_antigo.mjs — a GERAÇÃO ANTIGA do CidadesMG (Síntese Tecnologia), a que o coletor novo
// marcava como `geracao_antiga` e deixava para trás: `/portaltransparencia/faces/user/folha/FFolhaPagamento.xhtml?Param=`.
//
// ⭐ O ACHADO: aqui o botão de exportar FUNCIONA. Na geração nova os botões CSV/JSON são `PrimeFaces.ab` que não
//    baixam nada (por isso aquele coletor raspa a DataTable e pagina). Nesta, o link **TXT** é um
//    `mojarra.jsfcljs` — POST comum — e devolve `folhaPagamento.txt` com a FOLHA INTEIRA do mês: matrícula, nome,
//    cargo e todas as rubricas com PROVENTO/DESCONTO, mais Total Bruto e Total Líquido. Uma requisição no lugar
//    de 33 páginas de AJAX (Augusto de Lima: 433 KB, 328 pessoas).
//    ⚠️ Em troca, o TXT **não traz Dpto/Local** — a DataTable traz. Secretaria fica NULL, que é a regra da casa:
//    onde a fonte não tem, é nulo, nunca estimado.
//
// 🚨 QUEM PAROU DE PUBLICAR. Augusto de Lima diz "Última Atualização: 22/05/2025" e **não tem nada em 2025 nem
//    em 2026** — a última folha é 12/2024. Varrer só os meses do ano corrente não acharia nada e o município
//    seguiria contado como "sem folha" por defeito MEU, não da fonte ([[pnigp-recuo-curto-perde-quem-parou]]).
//    Por isso o recuo vai até MESES_RECUO meses.
//
// 🚨 COMPETÊNCIA MAIS CHEIA, não a mais recente: achado o primeiro mês com dado, os três anteriores também são
//    sondados e vence o de MAIS páginas ([[pnigp-competencia-mais-cheia-nao-a-recente]]). A sonda é a consulta
//    HTML (58 KB, traz "Página: 1 de N"); o TXT só é baixado para o vencedor.
//    ⚠️ DEZEMBRO é desempatado por último: nesta safra todo portal congelou em 12/2024, o último mês de MANDATO,
//    com a folha tomada de rescisão e férias-prêmio indenizada (uma PROFESSORA I com R$ 91.797). Ver o laço.
//
// 🚨 O TXT de dezembro traz a folha mensal E o 13º da mesma pessoa (649 blocos para 328 nomes). Somar os dois
//    infla a folha do mês, como no Ágili Blue. Cada bloco é classificado em `tipo_folha` e o `_hash` inclui esse
//    tipo — sem isso os dois blocos colidiriam no mesmo hash e um sobrescreveria o outro
//    ([[pnigp-hash-decide-duplicata-ou-conserto-perdido]]). Quem soma folha filtra `tipo_folha like 'mensal%'`.
//
// Uso: node scripts/ingest_folha_cidadesmg_antigo.mjs [SO=<parte do nome>] [REFAZ=1] [MESES_RECUO=36]
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const REFAZ = process.env.REFAZ === "1";
const MESES_RECUO = Number(process.env.MESES_RECUO || 36);
const H = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

// a tabela é a MESMA da geração nova (mesmo fornecedor, mesmo município-espaço); só `tipo_folha` é novo
await q(`alter table folha_servidores_cidadesmg add column if not exists tipo_folha text`);
await q(`alter table folha_servidores_cidadesmg add column if not exists rubricas jsonb`);

// ── a tela ──────────────────────────────────────────────────────────────────────────────────────────────────────
// Os ids do JSF (`form:j_idt13`) são gerados e MUDAM de portal para portal: tudo é achado pelo RÓTULO.
const RE = {
  ano: /Ano:\s*<\/span><\/td>\s*<td[^>]*>\s*<select name="([^"]+)"/i,
  mes: /M[êe]s:\s*<\/span><\/td>\s*<td[^>]*>\s*<select name="([^"]+)"/i,
  consultar: /<button[^>]*name="([^"]+)"[^>]*>\s*<span[^>]*>\s*Consultar/i,
  viewstate: /name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/,
  acao: /<form[^>]*id="form"[^>]*action="([^"]+)"/i,
  txt: /mojarra\.jsfcljs\(document\.getElementById\('form'\),\{'([^']+)':'[^']+'\}[^)]*\);return false"[^>]*>\s*TXT/i,
  paginas: /P[áa]gina:\s*\d+\s*de\s*(\d+)/i,
  vazio: /N[ãa]o foram encontrados resultados/i,
};

// `/faces/user/<qualquer coisa>?Param=X` → a tela da folha do mesmo Param. O portal antigo redireciona http→https.
const urlDaFolha = (base) => {
  const u = new URL(String(base).replace(/^http:/i, "https:"));
  const i = u.pathname.toLowerCase().indexOf("/faces/user/");
  if (i < 0) return null;
  u.pathname = u.pathname.slice(0, i) + "/faces/user/folha/FFolhaPagamento.xhtml";
  return u.href;
};

// 🚨 o ledger do cidadesmg guarda a UF ora como sigla, ora POR EXTENSO ("Minas Gerais") — e UF por extenso vira
//    estado fantasma em qualquer agrupamento. A sigla sai do IBGE, que não varia.
const UF_IBGE = { 11:"RO",12:"AC",13:"AM",14:"RR",15:"PA",16:"AP",17:"TO",21:"MA",22:"PI",23:"CE",24:"RN",25:"PB",
  26:"PE",27:"AL",28:"SE",29:"BA",31:"MG",32:"ES",33:"RJ",35:"SP",41:"PR",42:"SC",43:"RS",50:"MS",51:"MT",52:"GO",53:"DF" };
const sigla = (uf, cod) => (/^[A-Za-z]{2}$/.test(String(uf || "").trim()) ? String(uf).trim().toUpperCase() : UF_IBGE[String(cod).slice(0, 2)] || null);

const money = (s) => {
  if (s == null) return null;
  const n = +String(s).trim().replace(/\./g, "").replace(",", ".");
  return Number.isFinite(n) ? n : null;
};

// ── o TXT ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Um bloco por pagamento, separados por uma régua de `=`. Dentro: "Matricula/Nome: 0005 - FULANO", "Cargo: X",
// as rubricas "<cod>-<nome>...: <provento> <desconto>" e os totais.
// 🚨 CLASSIFICAR PELO QUE PAGA, NÃO PELA PALAVRA QUE APARECE. A primeira versão marcava como "férias" todo bloco
//    que citasse férias — e derrubou da folha mensal gente como MARIA ENEZIA, que tem SALARIO BASE + quinquênio +
//    insalubridade + "1/3 DE FÉRIAS NO MÊS": é a folha do mês COM o terço, não um pagamento à parte. Excluí-la
//    seria subcoleta feita por mim ([[pnigp-subcoleta-defeito-de-fonte]]).
//    A regra: quem tem rubrica de BASE é folha mensal, ponto. Sem base, o rótulo diz o que aquele pagamento é —
//    e só o **13º** é pagamento ADICIONAL ao mês (por isso é o único que sai da soma). Férias e rescisão são a
//    remuneração DAQUELE período: continuam `mensal (…)`, contam a pessoa e o valor.
const BASE = /SAL[ÁA]RIO\s*BASE|VENCIMENTO|SUBS[ÍI]DIO|PROVENTO|APOSENTAD|PENS[ÃA]O|SALARIO\s*MENSAL|HORA[- ]?AULA/i;
const tipoDoBloco = (rub) => {
  const prov = rub.filter((r) => (r.provento || 0) > 0).map((r) => r.nome).join(" | ");
  if (BASE.test(prov)) return "mensal";
  if (/13\s*SAL|D[ÉE]CIMO\s*TERC/i.test(prov)) return "13º salário";
  if (/F[ÉE]RIAS/i.test(prov)) return "mensal (férias)";
  if (/RESCIS|DIAS\s*TRABALHADOS/i.test(prov)) return "mensal (rescisão)";
  return "mensal";
};
const parseTxt = (txt) => {
  const blocos = txt.split(/={40,}/).filter((b) => /Matricula\/Nome:/i.test(b));
  return blocos.map((b) => {
    const cab = b.match(/Matricula\/Nome:\s*(\S+)\s*-\s*(.+)/);
    const cargo = (b.match(/Cargo:\s*(.+)/) || [])[1]?.trim() || null;
    const bruto = (b.match(/Total\s+Bruto[.\s]*:\s*([\d.,]+)/i) || [])[1];
    const liquido = (b.match(/Total\s+Liquido[.\s]*:\s*([\d.,]+)/i) || [])[1];
    // a linha de totais traz PROVENTO e DESCONTO na mesma linha: "Total Bruto...: 3.577,79   398,66"
    const linhaTot = (b.match(/Total\s+Bruto[.\s]*:\s*[\d.,]+\s+([\d.,]+)/i) || [])[1];
    const rub = [...b.matchAll(/^\s*(\d+)-(.+?)\.*:\s*([\d.,]*)\s*([\d.,]*)\s*$/gm)]
      .map((m) => ({ cod: m[1], nome: m[2].replace(/\.+$/, "").trim(), provento: money(m[3]), desconto: money(m[4]) }))
      .filter((r) => r.provento != null || r.desconto != null);
    const tipo = tipoDoBloco(rub);
    return {
      matricula: cab?.[1]?.trim() || null, nome: cab?.[2]?.trim() || null, cargo,
      bruto: money(bruto), descontos: money(linhaTot), liquido: money(liquido), tipo_folha: tipo, rubricas: rub,
    };
  }).filter((r) => r.nome);
};

// ── alvos ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Quem o coletor da geração nova deixou marcado: `geracao_antiga` e os `vazio` cuja URL é do layout antigo.
const alvos = (await q(`select cod_ibge, municipio, uf, base_url
  from folha_cidadesmg_coleta
-- ⚠️ 'ok_antigo' entra na LISTA e sai pelo filtro "feitos" — senão, uma vez bem-sucedido o município nunca mais
--    podia ser recoletado nem com REFAZ=1, e a correção de um defeito de leitura ficava sem como ser reaplicada.
 where (situacao in ('geracao_antiga','ok_antigo') or (situacao in ('vazio','sem_rota') and base_url ~* '/faces/user/'))
   ${SO ? "and municipio ilike '%'||$1||'%'" : ""}
 order by municipio`, SO ? [SO] : [])).rows;
const feitos = REFAZ ? new Set()
  : new Set((await q(`select cod_ibge from folha_cidadesmg_coleta where situacao = 'ok_antigo'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[cidadesmg-antigo] ${alvos.length} portais do layout antigo · ${fila.length} na fila · recuo ${MESES_RECUO} meses`);

let totalGeral = 0, ok = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe, competencia = null, linhas = 0) =>
    q(`insert into folha_cidadesmg_coleta (cod_ibge,municipio,uf,base_url,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set competencia=excluded.competencia,
       linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, a.base_url, competencia, linhas, situacao, detalhe]);
  const rot = `[${i + 1}/${fila.length}] ${a.uf} ${a.municipio}`;
  try {
    const url = urlDaFolha(a.base_url);
    if (!url) { await marca("sem_rota_antiga", `base_url sem /faces/user/: ${a.base_url}`.slice(0, 150)); falhas++; continue; }

    const r0 = await fetch(url, { headers: H, redirect: "follow", signal: AbortSignal.timeout(60000) });
    const html = (await r0.text()).replace(/\s+/g, " ");
    const cookie = (r0.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
    const campo = { ano: html.match(RE.ano)?.[1], mes: html.match(RE.mes)?.[1], bt: html.match(RE.consultar)?.[1], vs: html.match(RE.viewstate)?.[1] };
    if (!campo.ano || !campo.mes || !campo.bt || !campo.vs) {
      await marca("sem_filtro_antigo", "tela da folha sem os filtros Ano/Mês/Consultar"); falhas++; continue;
    }
    const acao = new URL(html.match(RE.acao)?.[1] || url, url).href;
    const anosOfertados = new Set([...html.matchAll(/<option value="((?:19|20)\d\d)"/g)].map((m) => +m[1]));
    const cab = { ...H, "content-type": "application/x-www-form-urlencoded", ...(cookie ? { cookie } : {}) };

    const consulta = async (ano, mes) => {
      const b = new URLSearchParams({ form: "form", [campo.ano]: String(ano), [campo.mes]: String(mes), [campo.bt]: "", "javax.faces.ViewState": campo.vs });
      const r = await fetch(acao, { method: "POST", body: b, headers: cab, redirect: "follow", signal: AbortSignal.timeout(90000) });
      const t = await r.text();
      const p = t.replace(/\s+/g, " ");
      return { vazio: RE.vazio.test(p), paginas: Number(p.match(RE.paginas)?.[1] || 0), idTxt: p.match(RE.txt)?.[1] || null,
               vs: p.match(RE.viewstate)?.[1] || campo.vs };
    };

    // 1) recua mês a mês até achar o primeiro com dado
    const hoje = new Date();
    let achou = null;
    for (let k = 0; k < MESES_RECUO && !achou; k++) {
      const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - k, 1));
      const ano = d.getUTCFullYear(), mes = d.getUTCMonth() + 1;
      if (anosOfertados.size && !anosOfertados.has(ano)) continue;
      const c = await consulta(ano, mes);
      if (!c.vazio && c.paginas > 0) achou = { ano, mes, ...c };
      await dorme(250);
    }
    if (!achou) { await marca("sem_publicacao", `nenhuma folha nos últimos ${MESES_RECUO} meses`); falhas++; continue; }

    // 2) a mais CHEIA entre ela e os três meses anteriores — mas DEZEMBRO fica por último.
    // 🚨 Todo portal desta safra congelou em 12/2024, que é o ÚLTIMO MÊS DE MANDATO. A folha de dezembro está
    //    tomada de rescisão, férias vencidas e FÉRIAS-PRÊMIO INDENIZADA: em Virgem da Lapa uma PROFESSORA I
    //    aparece com R$ 91.797 (74 mil só de férias-prêmio) e o prefeito com R$ 58.666. É o que a prefeitura
    //    pagou de fato, mas não é salário — publicar isso como remuneração mentiria sobre os 9 municípios.
    //    Dezembro também é o mês do 13º. Por isso a "mais cheia" passa a ser a mais cheia ENTRE OS MESES
    //    COMUNS; dezembro só entra se for a única coisa que existe, e aí fica dito no detalhe da coleta.
    const candidatos = [achou];
    for (let k = 1; k <= 3; k++) {
      const d = new Date(Date.UTC(achou.ano, achou.mes - 1 - k, 1));
      if (anosOfertados.size && !anosOfertados.has(d.getUTCFullYear())) continue;
      const c = await consulta(d.getUTCFullYear(), d.getUTCMonth() + 1);
      if (!c.vazio && c.paginas > 0) candidatos.push({ ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, ...c });
      await dorme(250);
    }
    const comuns = candidatos.filter((c) => c.mes !== 12);
    const escolha = (comuns.length ? comuns : candidatos).sort((x, y) => y.paginas - x.paginas)[0];
    const melhor = escolha;
    const ressalva = melhor.mes === 12 ? "⚠️ só dezembro publicado — mês de 13º e de rescisões" : null;
    if (!melhor.idTxt) { await marca("sem_exportacao", `layout antigo sem link TXT (${melhor.ano}/${melhor.mes})`); falhas++; continue; }

    // 3) o TXT do mês vencedor
    const bt = new URLSearchParams({ form: "form", [campo.ano]: String(melhor.ano), [campo.mes]: String(melhor.mes),
      [melhor.idTxt]: melhor.idTxt, "javax.faces.ViewState": melhor.vs });
    const rt = await fetch(acao, { method: "POST", body: bt, headers: cab, redirect: "follow", signal: AbortSignal.timeout(120000) });
    const txt = Buffer.from(await rt.arrayBuffer()).toString("utf8");
    const regs = parseTxt(txt);
    if (!regs.length) { await marca("vazio_txt", `TXT sem blocos (${rt.headers.get("content-type")}, ${txt.length} bytes)`); falhas++; continue; }

    const comp = `${melhor.ano}${String(melhor.mes).padStart(2, "0")}`;
    const linhas = regs.map((s) => ({
      cod_ibge: a.cod_ibge, municipio: a.municipio, uf: sigla(a.uf, a.cod_ibge), base_url: url, competencia: comp,
      matricula: s.matricula, nome: s.nome, cargo: s.cargo, vinculo: null, departamento: null, secretaria: null,
      local_trabalho: null, jornada: null, data_admissao: null,
      bruto: s.bruto, descontos: s.descontos, liquido: s.liquido, tipo_folha: s.tipo_folha,
      rubricas: JSON.stringify(s.rubricas),
      // 🚨 tipo_folha ENTRA no hash: sem ele o 13º e a folha mensal da mesma pessoa viram a mesma linha
      _hash: crypto.createHash("md5").update([a.cod_ibge, comp, s.matricula, s.nome, s.cargo, s.tipo_folha].join("¦")).digest("hex"),
    }));
    const m = new Map(); for (const r of linhas) m.set(r._hash, r);
    const arr = [...m.values()];
    for (let k = 0; k < arr.length; k += 1000) {
      const p = arr.slice(k, k + 1000); const c = (f) => p.map((x) => x[f]);
      await q(`insert into folha_servidores_cidadesmg
        (cod_ibge,municipio,uf,base_url,competencia,matricula,nome,cargo,vinculo,departamento,secretaria,
         local_trabalho,jornada,data_admissao,bruto,descontos,liquido,tipo_folha,rubricas,_hash)
        select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
          $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::numeric[],$16::numeric[],
          $17::numeric[],$18::text[],$19::jsonb[],$20::text[])
        on conflict (_hash) do update set bruto=excluded.bruto, descontos=excluded.descontos,
          liquido=excluded.liquido, rubricas=excluded.rubricas, _coletado_em=now()`,
        [c("cod_ibge"), c("municipio"), c("uf"), c("base_url"), c("competencia"), c("matricula"), c("nome"),
         c("cargo"), c("vinculo"), c("departamento"), c("secretaria"), c("local_trabalho"), c("jornada"),
         c("data_admissao"), c("bruto"), c("descontos"), c("liquido"), c("tipo_folha"), c("rubricas"), c("_hash")]);
    }
    const mensais = arr.filter((x) => x.tipo_folha.startsWith("mensal")).length;
    // 🚨 O bruto do mês pode ser majoritariamente pagamento NÃO RECORRENTE: em Virgem da Lapa 10/2024, o RATEIO
    //    DO FUNDEB (verba anual da sobra do fundo) é 51% do bruto e leva a média de R$ 3.475 para R$ 7.414 —
    //    o dobro dos vizinhos. Não é erro: é o que a prefeitura pagou. Mas quem lê "média salarial" precisa ver
    //    a ressalva. As rubricas ficam em `rubricas` para quem quiser refazer a conta.
    const EXTRA = /RATEIO|PRECAT|ABONO|ADIANT.?13|F[ÉE]RIAS PR[ÊE]MIO|INDEN/i;
    const som = (f) => arr.filter((x) => x.tipo_folha.startsWith("mensal")).reduce(f, 0);
    const brutoTot = som((t, x) => t + (x.bruto || 0));
    const extraTot = som((t, x) => t + JSON.parse(x.rubricas).filter((y) => EXTRA.test(y.nome)).reduce((a, y) => a + (y.provento || 0), 0));
    const pctExtra = brutoTot > 0 ? Math.round((100 * extraTot) / brutoTot) : 0;
    const naoRecorrente = pctExtra >= 10 ? `${pctExtra}% do bruto do mês é pagamento não recorrente (rateio FUNDEB, abono, indenização)` : null;
    totalGeral += mensais; ok++;
    await marca("ok_antigo", [`TXT · ${arr.length} pagamentos, ${mensais} mensais`, ressalva, naoRecorrente].filter(Boolean).join(" | "), comp, arr.length);
    console.log(`  ${rot}: ${mensais} servidores na folha mensal (${comp}) · ${arr.length - mensais} de 13º`);
  } catch (e) {
    falhas++; await marca("erro_antigo", String(e.message).slice(0, 150));
    console.log(`  ✖ ${rot}: ${String(e.message).slice(0, 80)}`);
  }
  await dorme(800);
}
console.log(`\n[cidadesmg-antigo] ${totalGeral.toLocaleString("pt-BR")} servidores (folha mensal) · ${ok} ok · ${falhas} falhas`);
await db.end();
