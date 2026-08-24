#!/usr/bin/env node
/**
 * Coleta a relação oficial de filiados a partidos do TSE (Brasil inteiro).
 *
 * FONTE: Filia-Consulta (https://filia2-consulta.tse.jus.br), consulta pública sem login,
 * disponível apenas durante a JANELA ELEITORAL — `parametro/permiteExibirRelacaoFiliados`
 * precisa devolver `true`. Fora dela a consulta fecha e não há substituto: desde 2021
 * (LGPD / art. 26 da Res. TSE 23.596/2019) não existe download de filiados nos dados abertos.
 *
 * A consulta exige os 4 filtros (UF + município + zona + partido), então a coleta é o
 * produto cartesiano: ~6.300 pares município-zona x 39 partidos = ~245 mil chamadas.
 *
 * LGPD: a API devolve `numCpf` com os 11 dígitos, mas nem a tela nem o CSV oficial do TSE
 * mostram CPF. Este coletor grava apenas os 6 dígitos CENTRAIS (`cpf_miolo`) — exatamente o
 * que a CGU já publica na base de Pessoas Expostas Politicamente (***.XXX.XXX-**) e o que
 * permite casar PEP x filiação sem homônimo. O CPF completo é descartado na origem.
 *
 * Retomável: o progresso é gravado por combinação; rodar de novo continua de onde parou.
 * Combinações que falharam depois dos retries ficam em falhas.jsonl para nova passada.
 *
 * Uso:  node scripts/coleta_filiados_tse.mjs [--saida DIR] [--conc 10] [--uf SC,PR]
 */
import fs from 'node:fs';
import path from 'node:path';

const API = 'https://filia2-consulta.tse.jus.br/filia-consulta/rest/v1';
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const SAIDA = arg('saida', 'C:/Users/PC/filia_tse');
const CONC = Number(arg('conc', 10));
const UFS = (arg('uf', '') || '').split(',').filter(Boolean).map(s => s.toUpperCase());
const PAGE = 50000;

const dir = p => (fs.mkdirSync(p, { recursive: true }), p);
dir(SAIDA); dir(path.join(SAIDA, 'dados'));

async function get(url, tent = 0) {
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) {
    if (tent >= 5) throw e;
    await new Promise(s => setTimeout(s, 800 * 2 ** tent));
    return get(url, tent + 1);
  }
}

// ---- 0. janela aberta? (sem isso a coleta devolve vazio calado)
const aberta = await get(`${API}/parametro/permiteExibirRelacaoFiliados?dataInicio=DATA_INICIO_RELACAO_FILIADOS_CONSULTA&dataFim=DATA_FIM_RELACAO_FILIADOS_CONSULTA`);
if (aberta !== true) {
  console.error('JANELA FECHADA: o TSE não está publicando a relação de filiados agora. Abortando.');
  process.exit(2);
}
console.log('janela de publicação: ABERTA');

// ---- 1. inventário (UF -> municípios -> zonas) + partidos
const invPath = path.join(SAIDA, 'inventario.json');
let inv;
if (fs.existsSync(invPath)) {
  inv = JSON.parse(fs.readFileSync(invPath, 'utf8'));
  console.log('inventário reaproveitado');
} else {
  const partidos = await get(`${API}/partidos`);
  const ufs = await get(`${API}/uf/todas`);
  const municipios = [];
  for (const uf of ufs) {
    const ms = await get(`${API}/localidade/${uf.codObjeto}/municipios`);
    for (const m of ms) municipios.push({ sgUf: uf.sglUf, cdMunicipio: m.codObjeto, nome: m.nomLocalidade, codLocalidadeTse: m.codLocalidadeTse, zonas: [] });
  }
  let k = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (k < municipios.length) {
      const m = municipios[k++];
      m.zonas = (await get(`${API}/zona/municipio/${m.cdMunicipio}/zonasEleitorais`)).map(z => ({ codObjeto: z.codObjeto, numZona: z.numZona }));
    }
  }));
  inv = { partidos, ufs, municipios, colhido_em: new Date().toISOString() };
  fs.writeFileSync(invPath, JSON.stringify(inv));
  console.log('inventário montado');
}

// ---- 2. combinações
const combos = [];
for (const m of inv.municipios) {
  if (UFS.length && !UFS.includes(m.sgUf)) continue;
  for (const z of m.zonas) for (const p of inv.partidos) {
    combos.push({ uf: m.sgUf, mun: m.cdMunicipio, zona: z.codObjeto, pid: p.id });
  }
}
const chave = c => `${c.uf}|${c.mun}|${c.zona}|${c.pid}`;

// ---- 3. progresso (retomada)
const progPath = path.join(SAIDA, 'progresso.jsonl');
const feitas = new Set();
if (fs.existsSync(progPath)) {
  for (const l of fs.readFileSync(progPath, 'utf8').split('\n')) {
    const k = l.split('\t')[0];
    if (k) feitas.add(k);
  }
}
const pendentes = combos.filter(c => !feitas.has(chave(c)));
console.log(`combinações: ${combos.length} | já feitas: ${feitas.size} | pendentes: ${pendentes.length}`);
if (!pendentes.length) { console.log('nada a fazer'); process.exit(0); }

// ---- 4. streams de saída por UF (NDJSON). Trunca linha parcial de uma execução morta.
const streams = new Map();
function saidaUF(uf) {
  if (streams.has(uf)) return streams.get(uf);
  const f = path.join(SAIDA, 'dados', `filiados_${uf}.ndjson`);
  if (fs.existsSync(f) && fs.statSync(f).size) {
    const st = fs.statSync(f);
    const fd = fs.openSync(f, 'r+');
    const buf = Buffer.alloc(1);
    fs.readSync(fd, buf, 0, 1, st.size - 1);
    if (buf[0] !== 10) { // último byte não é \n: corta a linha parcial de uma queda
      const txt = fs.readFileSync(f, 'utf8');
      fs.ftruncateSync(fd, txt.lastIndexOf('\n') + 1);
      console.log(`  ${uf}: linha parcial truncada na retomada`);
    }
    fs.closeSync(fd);
  }
  const s = fs.createWriteStream(f, { flags: 'a' });
  streams.set(uf, s);
  return s;
}
const prog = fs.createWriteStream(progPath, { flags: 'a' });
const falhas = fs.createWriteStream(path.join(SAIDA, 'falhas.jsonl'), { flags: 'a' });

const dt = a => Array.isArray(a) ? `${a[0]}-${String(a[1]).padStart(2, '0')}-${String(a[2]).padStart(2, '0')}` : null;

// ---- 5. coleta
let i = 0, linhas = 0, erros = 0;
const t0 = Date.now();
async function trabalhador() {
  while (i < pendentes.length) {
    const c = pendentes[i++];
    const u = `${API}/relacao-filiados?sgUe=${c.uf}&cdMunicipio=${c.mun}&cdZona=${c.zona}&sqPartido=${c.pid}&currentPage=0&pageSize=${PAGE}`;
    let j;
    try {
      j = await get(u);
    } catch (e) {
      erros++;
      falhas.write(JSON.stringify({ ...c, erro: String(e) }) + '\n');
      continue;
    }
    const regs = j.entitys || [];
    if (regs.length && regs.length < (j.totalElements || 0)) {
      for (let pg = 1; regs.length < j.totalElements; pg++) {
        const extra = await get(u.replace('currentPage=0', 'currentPage=' + pg));
        if (!extra.entitys || !extra.entitys.length) break;
        regs.push(...extra.entitys);
      }
    }
    if (regs.length) {
      const bloco = regs.map(r => JSON.stringify({
        sq_registro: r.sqRegistroFiliacao,
        uf: r.sgUe,
        cd_municipio: r.cdMunicipio,
        municipio: r.nomLocalidade,
        cod_localidade_tse: r.codLocalidadeTse,
        zona: r.numZona,
        secao: r.numSecao,
        partido: r.sgPartido,
        legenda: r.nrLegenda,
        nome: r.nmEleitor,
        nome_social: r.nmSocialEleitor,
        titulo: r.nrTituloEleitor,
        cpf_miolo: typeof r.numCpf === 'string' && r.numCpf.length === 11 ? r.numCpf.slice(3, 9) : null,
        dt_filiacao: dt(r.dtFiliacao),
        dt_desfiliacao: dt(r.dtDesfiliacao),
        dt_cancelamento: dt(r.dtCancelamento),
        dt_exclusao: dt(r.dtExclusao),
        situacao_eleitor: r.desSituacaoEleitor,
        st_registro: r.stRegistroFiliacao,
        sexo: r.tpSexo,
      })).join('\n') + '\n';
      await new Promise(res => saidaUF(c.uf).write(bloco, res));
      linhas += regs.length;
    }
    prog.write(`${chave(c)}\t${regs.length}\n`);
    const n = i;
    if (n % 2000 === 0) {
      const s = (Date.now() - t0) / 1000;
      const rps = n / s;
      const falta = (pendentes.length - n) / rps / 60;
      console.log(`${n}/${pendentes.length} (${(100 * n / pendentes.length).toFixed(1)}%) | ${linhas.toLocaleString('pt-BR')} filiados | ${rps.toFixed(1)} req/s | faltam ~${falta.toFixed(0)} min | erros ${erros}`);
    }
  }
}
await Promise.all(Array.from({ length: CONC }, trabalhador));
await Promise.all([...streams.values()].map(s => new Promise(r => s.end(r))));
prog.end();
falhas.end();
console.log(`\nFIM: ${linhas.toLocaleString('pt-BR')} filiados gravados em ${SAIDA}/dados | erros: ${erros} (ver falhas.jsonl) | ${((Date.now() - t0) / 3600000).toFixed(2)} h`);
