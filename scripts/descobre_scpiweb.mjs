// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_scpiweb.mjs — varre a família `{slug}.scpiweb.com.br` derivando o host do NOME do município.
//
// De onde veio a pista: a varredura por site de Roraima achou `caroebe.scpiweb.com.br`, `bonfim.scpiweb.com.br`
// e `uiramuta.scpiweb.com.br` ([[pnigp-verificacao-publicacao-por-site]]). Nenhuma varredura por IP/porta chega
// nesses hosts — cada prefeitura hospeda no PRÓPRIO nome, e é justamente por isso que o padrão é derivável.
//
// 🚨 O nome vira slug de mais de um jeito: "Santa Luzia do Norte" pode ser `santaluzia`, `santaluzianorte` ou
// `pmsantaluzia`. Testar UMA forma acha pouco e conclui "não existe" — que é a mentira mais cara desta base.
// 🚨 Confirmar pelo CONTEÚDO, não pelo status: 200 não prova nada ([[pnigp-sonda-soft404-falso-positivo]]).
//    Só conta como achado a página que diz "SCPI".
//
// Uso: node scripts/descobre_scpiweb.mjs            (municípios SEM folha, todos os estados)
//      UF=PI node scripts/descobre_scpiweb.mjs      ·   TODOS=1 para varrer inclusive os já coletados
//      CONC=12
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { Agent } from "undici";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const CONC = +(process.env.CONC || 12);
const UF = process.env.UF || null;
const TODOS = process.env.TODOS === "1";
// on-premise com certificado próprio: o mesmo motivo do coletor ([[pnigp-fiorilli-e-scpi-csv]])
const inseguro = new Agent({ connect: { rejectUnauthorized: false } });
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  accept: "text/html,*/*" };

const sem = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// as formas de slug que a família usa, da mais provável para a menos
function slugs(nome) {
  const base = sem(nome).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const semLigacao = base.split(" ").filter((p) => !["de", "do", "da", "dos", "das", "e"].includes(p));
  const junto = base.replace(/ /g, "");
  const juntoSemLigacao = semLigacao.join("");
  const primeiro = semLigacao[0] || junto;
  return [...new Set([juntoSemLigacao, junto, primeiro, "pm" + juntoSemLigacao, "pm" + primeiro,
    semLigacao.join("-"), base.replace(/ /g, "-")])].filter((s) => s.length >= 3);
}

await q(`create table if not exists scpiweb_descoberto (
  cod_ibge text primary key, municipio text, uf text, host text, url text,
  situacao text, detalhe text, em timestamptz default now())`);

const alvos = (await q(`
  with tabs as (select table_name t from information_schema.columns
    where table_schema='public' and table_name like 'folha_servidores_%' and column_name='cod_ibge' group by 1)
  select m.cod_ibge, m.nome, m.uf from municipios_br m
  where ${UF ? "m.uf = $1 and" : ""} true
  order by m.uf, m.nome`, UF ? [UF] : [])).rows;

// quem já tem folha COM VALOR sai da fila (a menos que TODOS=1) — o objetivo é achar porta nova
let fila = alvos;
if (!TODOS) {
  const tabs = (await q(`select c.table_name t, string_agg(c.column_name,',') filter (where c.data_type in ('numeric','integer','bigint','double precision','real')) num
    from information_schema.columns c where c.table_schema='public' and c.table_name like 'folha_servidores_%'
    group by 1 having bool_or(c.column_name='cod_ibge')`)).rows;
  const partes = [];
  for (const t of tabs) {
    const num = (t.num || "").split(",").filter(Boolean);
    const b = num.filter((c) => !/liquido|desconto|base_calculo|inss|irrf|patronal|previd/i.test(c));
    const v = b.find((c) => /^(bruto|valor_bruto|total_bruto|remuneracao_bruta|remuneracao|provento|proventos|salario_bruto|total_vencimentos|total_proventos|vantagens)$/.test(c))
      || b.find((c) => /bruto|provento|remunera|vencimento|rendimento|vantagem/.test(c))
      || b.find((c) => /salario/.test(c)) || num.find((c) => /liquido/.test(c));
    if (v) partes.push(`select cod_ibge::text cod, (${v})::numeric v from ${t.t} where cod_ibge is not null`);
  }
  const com = new Set((await q(`with dado as (${partes.join(" union all ")}) select cod from dado where v > 0 group by cod`)).rows.map((r) => r.cod));
  fila = alvos.filter((a) => !com.has(a.cod_ibge));
}
const feitos = new Set((await q(`select cod_ibge from scpiweb_descoberto`)).rows.map((r) => r.cod_ibge));
fila = fila.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[scpiweb] ${alvos.length} municípios · ${fila.length} na fila (sem folha${UF ? ", " + UF : ""})`);

const pega = async (u) => {
  try {
    const r = await fetch(u, { headers: UA, redirect: "follow", dispatcher: inseguro, signal: AbortSignal.timeout(15000) });
    const b = Buffer.from(await r.arrayBuffer());
    return { st: r.status, t: b.toString("latin1"), url: r.url };
  } catch (e) { return { st: 0, t: "", erro: String(e?.cause?.message || e.message).slice(0, 40) }; }
};

let achados = 0, testados = 0;
const fifo = [...fila];
await Promise.all(Array.from({ length: CONC }, async () => {
  while (fifo.length) {
    const a = fifo.shift();
    testados++;
    let hit = null, ultimo = null;
    for (const s of slugs(a.nome)) {
      const host = `${s}.scpiweb.com.br`;
      // 🚨 o caminho varia entre /transparencia/ e /Transparencia/ na mesma família
      for (const cam of ["/transparencia/", "/Transparencia/"]) {
        const r = await pega(`https://${host}${cam}`);
        ultimo = r.erro || `HTTP ${r.st}`;
        if (r.st !== 200 || !/SCPI/i.test(r.t.slice(0, 12000))) continue;
        // 🚨 HOMÔNIMO: derivar o host do NOME e parar aí atribui o portal de Bonfim/RR a Bonfim/MG e a Bonfim
        // do Piauí, e o de Alto Alegre/RR a Alto Alegre/RS. Foi o que aconteceu na 1ª varredura: 3 dos 8
        // "achados" eram o mesmo host de Roraima contado três vezes ([[pnigp-homonimo-uf-guarda-de-contaminacao]]).
        // A prova é a ENTIDADE DECLARADA na própria página — o portal diz de quem ele é.
        // 🚨 tirar SCRIPT e STYLE antes: sem isso os 4.000 primeiros caracteres do "texto" sao JavaScript
        // e o nome da entidade, que vem depois, nunca era encontrado. E decodificar entidade HTML:
        // a pagina escreve RORAIN&#211;POLIS, nao RORAINOPOLIS.
        const limpo = r.t.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
          .replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
        const ent = (limpo.match(/(?:PREFEITURA|C[ÂA]MARA|MUNIC[ÍI]PIO)[^|]{0,70}/i) || [])[0] || limpo.slice(0, 200);
        const nomeOk = sem(ent).includes(sem(a.nome).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim());
        if (!nomeOk) { ultimo = `portal existe e declara "${ent.slice(0, 46)}" — nao e este municipio`; continue; }
        hit = { host, url: `https://${host}${cam}`, entidade: ent.slice(0, 90) }; break;
      }
      if (hit) break;
      // DNS inexistente derruba o slug inteiro: não adianta tentar o segundo caminho
      if (/ENOTFOUND|getaddrinfo/i.test(ultimo || "")) continue;
    }
    if (hit) {
      // 🚨 UM HOST, UM MUNICÍPIO. Bonfim/RR, Bonfim/MG e Bonfim do Piauí derivam o MESMO `bonfim.scpiweb.com.br`,
      // e a página declara só "PREFEITURA MUNICIPAL DE BONFIM", sem UF — nenhum texto desempata. Quem chegar
      // depois no mesmo host é homônimo e NÃO é atribuído ([[pnigp-homonimo-uf-guarda-de-contaminacao]]).
      const dono = (await q(`select municipio, uf from scpiweb_descoberto where host=$1 and situacao='achado' and cod_ibge <> $2 limit 1`, [hit.host, a.cod_ibge])).rows[0];
      if (dono) {
        await q(`insert into scpiweb_descoberto (cod_ibge,municipio,uf,host,url,situacao,detalhe,em)
          values ($1,$2,$3,$4,$5,'homonimo_ambiguo',$6,now())
          on conflict (cod_ibge) do update set situacao='homonimo_ambiguo', detalhe=excluded.detalhe, em=now()`,
          [a.cod_ibge, a.nome, a.uf, hit.host, hit.url, `mesmo host ja atribuido a ${dono.municipio}/${dono.uf}`]);
        console.log(`  ⚠ ${a.uf} ${a.nome.padEnd(30)} ${hit.host} — homônimo de ${dono.municipio}/${dono.uf}, não atribuído`);
        continue;
      }
      achados++;
      await q(`insert into scpiweb_descoberto (cod_ibge,municipio,uf,host,url,situacao,detalhe,em)
        values ($1,$2,$3,$4,$5,'achado',null,now())
        on conflict (cod_ibge) do update set host=excluded.host, url=excluded.url, situacao='achado', em=now()`,
        [a.cod_ibge, a.nome, a.uf, hit.host, hit.url]);
      console.log(`  ★ ${a.uf} ${a.nome.padEnd(30)} ${hit.host}`);
    } else {
      await q(`insert into scpiweb_descoberto (cod_ibge,municipio,uf,host,url,situacao,detalhe,em)
        values ($1,$2,$3,null,null,'nao_existe',$4,now())
        on conflict (cod_ibge) do update set situacao='nao_existe', detalhe=excluded.detalhe, em=now()`,
        [a.cod_ibge, a.nome, a.uf, String(ultimo).slice(0, 60)]);
    }
    if (testados % 200 === 0) console.log(`  … ${testados}/${fila.length} testados · ${achados} achados`);
  }
}));
console.log(`\n[scpiweb] ${achados} hosts achados em ${testados} municípios testados`);
console.table((await q(`select uf, count(*) n from scpiweb_descoberto where situacao='achado' group by 1 order by 2 desc`)).rows);
await db.end();
