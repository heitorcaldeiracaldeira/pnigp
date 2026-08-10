// FONTE COMPARTILHADA — o zip de microdados do Censo Escolar do INEP (~537 MB).
//
// ═══ POR QUE ISTO EXISTE ═══
// Medido em 10/ago: CINCO ETLs precisam deste mesmo arquivo (censo_especial, fundeb_matriculas,
// escola_turmas, escolas, escolas_series) e nenhuma delas o baixava direito.
//   · censo_especial e fundeb_matriculas apontavam para `.../claude/C--Users-PC/ba9cc77b-.../scratchpad/
//     censo2025.zip` — o scratchpad de uma SESSÃO ANTIGA, que já não existe. O arquivo tinha sido baixado à
//     mão uma vez, num diretório temporário de vida curta, e o caminho foi cravado no script. Agendadas,
//     essas fontes nunca mais rodaram: `arquivo não existe`, todo dia, desde julho.
//   · escola_turmas e evasao_escolar liam `process.argv[2]` — esperavam o caminho passado à mão na linha de
//     comando. Sem argumento, `undefined` chega no lugar do arquivo: era ISSO o `ERR_INVALID_ARG_TYPE`.
//   · escolas baixava por conta própria e morria de timeout no meio dos 537 MB, sem retomar.
// Baixar cinco vezes o mesmo meio-giga também é queimar recurso à toa. Uma fonte, um download, um cache.
//
// ═══ O NOME DO ARQUIVO MUDA DE ANO PARA ANO ═══
// Medido: 2025 é `microdados_censo_escolar_2025_.zip` (com underline no fim, 537 MB) e 2024 é
// `microdados_censo_escolar_2024.zip` (sem). Não dá para cravar o padrão — tem de tentar os dois.
// E o ano também se descobre: presumir "2025" quebra calado quando sair 2026.
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process";

const BASE = "https://download.inep.gov.br/dados_abertos";
const nomes = (ano) => [`microdados_censo_escolar_${ano}_.zip`, `microdados_censo_escolar_${ano}.zip`];

/** tamanho declarado pelo servidor, ou 0 se o caminho não existe (aqui o INEP devolve 404 de verdade) */
function tamanhoRemoto(url) {
  try {
    const h = execFileSync("curl", ["-sIL", "--max-time", "40", "-A", "Mozilla/5.0", url], { encoding: "latin1" });
    if (!/HTTP\/[\d.]+ 200/.test(h.split(/\r?\n\r?\n/).filter(Boolean).pop() || h)) return 0;
    const m = [...h.matchAll(/^content-length:\s*(\d+)/gim)].pop();
    return m ? Number(m[1]) : 0;
  } catch { return 0; }
}

/**
 * Garante o zip de microdados em disco e devolve `{ zip, ano }`.
 * ANO_CENSO= força um ano; sem isso, varre do ano corrente para trás até achar arquivo de verdade.
 */
export function zipCensoEscolar() {
  const dir = process.env.DIR_CENSO || os.tmpdir();
  const topo = process.env.ANO_CENSO ? Number(process.env.ANO_CENSO) : new Date().getFullYear();
  const piso = process.env.ANO_CENSO ? Number(process.env.ANO_CENSO) : topo - 4;

  let alvo = null;
  for (let a = topo; a >= piso && !alvo; a--) {
    for (const n of nomes(a)) {
      const url = `${BASE}/${n}`;
      const tam = tamanhoRemoto(url);
      // 537 MB é o tamanho real; uma página de erro pesa uns 3 KB. O piso separa arquivo de recado.
      if (tam > 1e7) { alvo = { url, ano: a, tam, zip: path.join(dir, `censo_escolar_${a}.zip`) }; break; }
    }
  }
  if (!alvo) throw new Error(`Censo Escolar: nenhum microdados publicado entre ${piso} e ${topo}`);

  const tem = () => (fs.existsSync(alvo.zip) ? fs.statSync(alvo.zip).size : 0);
  if (tem() === alvo.tam) { console.log(`  censo escolar ${alvo.ano}: já em cache (${(alvo.tam / 1e6).toFixed(0)} MB)`); return alvo; }
  if (tem() > alvo.tam) { try { fs.rmSync(alvo.zip, { force: true }); } catch { /* sobra de outro ano */ } }

  // 537 MB com retomada: uma queda no meio não pode significar recomeçar do zero, que foi como `escolas`
  // morria. --speed-limit aborta se ESTAGNAR; --max-time sozinho corta arquivo grande em origem lenta.
  for (let tent = 1; tent <= 4 && tem() !== alvo.tam; tent++) {
    console.log(`  baixando censo escolar ${alvo.ano} (${(alvo.tam / 1e6).toFixed(0)} MB, tenho ${(tem() / 1e6).toFixed(0)} MB) tentativa ${tent}…`);
    try {
      execFileSync("curl", ["-sS", "--fail", "-L", "-C", "-", "--max-time", "5400", "--speed-limit", "2048",
        "--speed-time", "120", "--retry", "2", "--retry-all-errors", "-A", "Mozilla/5.0", "-o", alvo.zip, alvo.url], { stdio: "ignore" });
    } catch { /* pode ter trazido parte; a próxima tentativa retoma daí */ }
  }
  if (tem() !== alvo.tam) throw new Error(`Censo Escolar ${alvo.ano}: veio incompleto (${tem()} de ${alvo.tam} bytes)`);
  return alvo;
}

/**
 * Extrai UM arquivo de dentro do zip e devolve o caminho em disco.
 * `casa` é testado contra o caminho interno; o primeiro que casar vence.
 */
export function extraiDoCenso(zip, casa, destino) {
  fs.mkdirSync(destino, { recursive: true });
  const lista = execFileSync("tar", ["-tf", zip], { encoding: "latin1", maxBuffer: 1 << 26 }).split(/\r?\n/).filter(Boolean);
  const alvo = lista.find((n) => casa.test(n));
  if (!alvo) throw new Error(`Censo Escolar: nada casou com ${casa} (zip tem ${lista.length} entradas)`);
  execFileSync("tar", ["-xf", zip, "-C", destino, alvo], { stdio: "ignore" });
  return path.join(destino, alvo);
}
