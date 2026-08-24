#!/usr/bin/env node
/**
 * Cruza a base de Pessoas Expostas Politicamente (CGU / Portal da Transparência) com a
 * relação oficial de filiados a partidos do TSE colhida por scripts/coleta_filiados_tse.mjs.
 *
 * A CHAVE: a CGU publica o CPF mascarado como ***.XXX.XXX-** — os 6 dígitos centrais. O
 * coletor do TSE guarda exatamente esses 6 dígitos (`cpf_miolo`). Casar por (miolo + nome)
 * elimina o homônimo, que é o que inviabiliza o casamento só por nome: "MARIA DA SILVA"
 * aparece milhares de vezes na base de filiados.
 *
 * O nome do PEP vem truncado em alguns registros (limite de ~60 caracteres no arquivo da
 * CGU), então o casamento aceita prefixo: nomes iguais, ou um prefixo do outro com pelo
 * menos MIN_PREFIXO caracteres — sempre dentro do mesmo miolo de CPF.
 *
 * Uso:  node scripts/cruza_pep_filiados.mjs [--pep ARQ.csv] [--dados DIR] [--saida DIR]
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const PEP = arg('pep', 'C:/Users/PC/filia_tse/pep/202606_PEP.csv');
const DADOS = arg('dados', 'C:/Users/PC/filia_tse/dados');
const SAIDA = arg('saida', 'C:/Users/PC/filia_tse');
const MIN_PREFIXO = 25;

const norm = s => (s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/^\(CUMULATIVAMENTE\)\s*/, '')
  .replace(/[^A-Z ]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// ---- 1. PEP: indexa por miolo do CPF
const linhasPep = fs.readFileSync(PEP, 'latin1').split(/\r?\n/);
const cab = linhasPep[0].split(';').map(s => s.replace(/^"|"$/g, ''));
const col = n => cab.findIndex(c => norm(c).startsWith(norm(n)));
const iCpf = col('CPF'), iNome = col('Nome_PEP'), iSig = col('Sigla'), iDesc = col('Descricao'),
      iOrg = col('Nome_Org'), iIni = col('Data_Inicio'), iFim = col('Data_Fim_Exerc');

const porMiolo = new Map();   // miolo -> [{nomeNorm, pessoa}]
const pessoas = new Map();    // miolo|nomeNorm -> pessoa
let nPep = 0;
for (let i = 1; i < linhasPep.length; i++) {
  const l = linhasPep[i];
  if (!l.trim()) continue;
  const c = l.split(';').map(s => s.replace(/^"|"$/g, ''));
  const m = /^\*{3}\.(\d{3})\.(\d{3})-\*{2}$/.exec(c[iCpf]);
  if (!m) continue;
  const miolo = m[1] + m[2];
  const nomeNorm = norm(c[iNome]);
  if (!nomeNorm) continue;
  nPep++;
  const k = miolo + '|' + nomeNorm;
  let p = pessoas.get(k);
  if (!p) {
    p = { miolo, nome: c[iNome].trim(), nomeNorm, mandatos: [], filiacoes: [] };
    pessoas.set(k, p);
    if (!porMiolo.has(miolo)) porMiolo.set(miolo, []);
    porMiolo.get(miolo).push(p);
  }
  p.mandatos.push({ funcao: c[iDesc] || c[iSig], orgao: c[iOrg], inicio: c[iIni], fim: c[iFim] });
}
console.log(`PEP: ${nPep} registros | ${pessoas.size} pessoas | ${porMiolo.size} miolos de CPF distintos`);

// ---- 2. varre os filiados e casa
const casa = (a, b) => a === b || (a.startsWith(b) && b.length >= MIN_PREFIXO) || (b.startsWith(a) && a.length >= MIN_PREFIXO);

const arquivos = fs.readdirSync(DADOS).filter(f => f.endsWith('.ndjson'));
let lidas = 0, achados = 0, semCpf = 0;
for (const f of arquivos) {
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(DADOS, f)), crlfDelay: Infinity });
  for await (const l of rl) {
    if (!l) continue;
    lidas++;
    let d;
    try { d = JSON.parse(l); } catch { continue; } // linha parcial de coleta em andamento
    if (!d.cpf_miolo) { semCpf++; continue; }
    const cands = porMiolo.get(d.cpf_miolo);
    if (!cands) continue;
    const nn = norm(d.nome);
    for (const p of cands) {
      if (casa(p.nomeNorm, nn)) {
        p.filiacoes.push({
          partido: d.partido, dt_filiacao: d.dt_filiacao, situacao: d.situacao_eleitor,
          uf: d.uf, municipio: d.municipio, zona: d.zona,
          nome_tse: d.nome, dt_desfiliacao: d.dt_desfiliacao, dt_cancelamento: d.dt_cancelamento,
        });
        achados++;
        break;
      }
    }
  }
  process.stdout.write(`  ${f}: ${lidas.toLocaleString('pt-BR')} linhas lidas, ${achados.toLocaleString('pt-BR')} casamentos\n`);
}

// ---- 3. saída
const comFil = [...pessoas.values()].filter(p => p.filiacoes.length);
const csvEsc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
// `municipio_confere`: prova independente do casamento \u2014 94% dos PEP s\u00e3o vereador/prefeito e
// o \u00f3rg\u00e3o traz MUNICIPIO-UF, que tem de bater com o munic\u00edpio onde a pessoa est\u00e1 filiada.
const soLetras = s => norm(s).replace(/ /g, '');
const confere = (orgao, uf, municipio) => {
  const o = (orgao || '').trim();
  if (o.length < 4 || o[o.length - 3] !== '-') return '-';           // \u00f3rg\u00e3o n\u00e3o \u00e9 municipal
  return (o.slice(-2) === uf && soLetras(o.slice(0, -3)) === soLetras(municipio)) ? 'S' : 'N';
};

const out = fs.createWriteStream(path.join(SAIDA, 'pep_com_filiacao.csv'));
out.write('\ufeffcpf_miolo;nome_pep;nome_tse;funcao;orgao;inicio_mandato;fim_mandato;partido;dt_filiacao;situacao_filiacao;uf_filiacao;municipio_filiacao;zona;municipio_confere\n');
let conf = { S: 0, N: 0, '-': 0 };
for (const p of comFil) {
  for (const m of p.mandatos) {
    for (const fl of p.filiacoes) {
      const c = confere(m.orgao, fl.uf, fl.municipio);
      conf[c]++;
      out.write([p.miolo, p.nome, fl.nome_tse, m.funcao, m.orgao, m.inicio, m.fim,
        fl.partido, fl.dt_filiacao, fl.situacao, fl.uf, fl.municipio, fl.zona, c].map(csvEsc).join(';') + '\n');
    }
  }
}
out.end();

const semFil = pessoas.size - comFil.length;
const porPartido = {};
for (const p of comFil) for (const f of new Set(p.filiacoes.map(x => x.partido))) porPartido[f] = (porPartido[f] || 0) + 1;
const multi = comFil.filter(p => new Set(p.filiacoes.map(f => f.partido)).size > 1).length;

console.log(`\nfiliados lidos: ${lidas.toLocaleString('pt-BR')} (sem cpf no TSE: ${semCpf.toLocaleString('pt-BR')})`);
console.log(`PEP com filiação encontrada: ${comFil.length.toLocaleString('pt-BR')} de ${pessoas.size.toLocaleString('pt-BR')} (${(100 * comFil.length / pessoas.size).toFixed(1)}%)`);
console.log(`PEP sem filiação na base: ${semFil.toLocaleString('pt-BR')}`);
console.log(`PEP com registro em mais de um partido: ${multi.toLocaleString('pt-BR')}`);
console.log(`prova do município (mandato x filiação): confere ${conf.S.toLocaleString('pt-BR')} | diverge ${conf.N.toLocaleString('pt-BR')} | órgão não-municipal ${conf['-'].toLocaleString('pt-BR')}`);
console.log('\npartidos mais frequentes entre os PEP:');
for (const [k, v] of Object.entries(porPartido).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${String(v).padStart(7)} ${k}`);

fs.writeFileSync(path.join(SAIDA, 'cruzamento_resumo.json'), JSON.stringify({
  gerado_em: new Date().toISOString(), arquivo_pep: path.basename(PEP),
  pep_registros: nPep, pep_pessoas: pessoas.size, filiados_lidos: lidas,
  pep_com_filiacao: comFil.length, pep_sem_filiacao: semFil, pep_multipartido: multi,
  prova_municipio: conf, por_partido: porPartido,
}, null, 1));
console.log(`\ngravado: ${SAIDA}/pep_com_filiacao.csv e cruzamento_resumo.json`);
