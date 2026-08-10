// DESCOMPACTAÇÃO PORTÁTIL — um caminho que funciona onde as ETLs de fato rodam.
//
// ═══ POR QUE ISTO EXISTE ═══
// Medido em 09/ago, depois que o orquestrador parou de descartar o stderr do filho: quatro fontes do INEP
// falhavam com `spawnSync unzip ENOENT` e a RAIS com `7-zip exited with code 2`. Não era rede, não era
// fonte fora do ar, não era agendamento — era BINÁRIO QUE NÃO EXISTE.
// `unzip` existe no Git Bash (/usr/bin/unzip), mas as tarefas do Agendador rodam por cmd.exe, e ali ele
// não está no PATH. `7z` não existe em lugar nenhum desta máquina. Os scripts foram escritos assumindo um
// ambiente Linux e nunca puderam funcionar agendados.
//
// ═══ O QUE FUNCIONA AQUI ═══
// `tar -xf` é nativo desde o Windows 10 (bsdtar) e abre ZIP sem dependência externa — foi o que destravou
// o download dos setores do IBGE. É a primeira opção. Depois vêm os que possam existir no ambiente.
// Ordem deliberada: do que não precisa de nada instalado para o que precisa.
import { execSync, spawnSync } from "child_process";
import fs from "fs"; import path from "path";

const existe = (cmd) => { try { execSync(`${cmd} --version`, { stdio: "ignore" }); return true; } catch { return false; } };

/**
 * Extrai e ACHATA: todo arquivo vai para a raiz de `destino`, sem subpastas.
 *
 * ═══ POR QUE ISTO PRECISOU EXISTIR ═══
 * `unzip -j` (junk paths) joga tudo na raiz, e os scripts do INEP contavam com isso: eles montam o caminho
 * esperado (`${arq}_${ANO}.xlsx`) direto no tmpdir e testam `existsSync`. Meu primeiro conserto trocou
 * `unzip -j` por `tar -xf`, que PRESERVA a estrutura — o xlsx foi parar numa subpasta e o teste falhou.
 * Medido em 09/ago: a fonte rodou 10 minutos, imprimiu "xlsx não encontrado" quatro vezes, terminou com ✔
 * e gravou ZERO linhas — a tabela seguiu congelada em 08/jul. Conserto meu criando falha silenciosa nova.
 * Quem substitui `unzip -j` tem de replicar o `-j`, não só o "descompactar".
 */
export function extraiPlano(arquivo, destino) {
  const tmp = path.join(destino, `_tmp_${Date.now()}`);
  const arquivos = extrai(arquivo, tmp);
  const finais = [];
  for (const f of arquivos) {
    const alvo = path.join(destino, path.basename(f));
    try { fs.copyFileSync(f, alvo); finais.push(alvo); } catch { /* nome repetido: o primeiro vence, como no -j */ }
  }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignora */ }
  return finais;
}

/**
 * Extrai `arquivo` (zip/7z/tar.gz) dentro de `destino`, tentando cada mecanismo disponível.
 * @returns {string[]} caminhos dos arquivos extraídos
 */
export function extrai(arquivo, destino) {
  if (!fs.existsSync(arquivo)) throw new Error(`arquivo não existe: ${arquivo}`);
  fs.mkdirSync(destino, { recursive: true });
  const erros = [];

  // 1) tar do Windows 10+ (bsdtar): abre zip e tar.gz, e não exige NADA instalado
  try { execSync(`tar -xf "${arquivo}" -C "${destino}"`, { stdio: "ignore" }); return listar(destino); }
  catch (e) { erros.push(`tar: ${String(e.message).slice(0, 60)}`); }

  // 2) Expand-Archive do PowerShell — só zip, mas está em qualquer Windows
  if (/\.zip$/i.test(arquivo)) {
    try {
      execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${arquivo}' -DestinationPath '${destino}' -Force"`, { stdio: "ignore" });
      return listar(destino);
    } catch (e) { erros.push(`Expand-Archive: ${String(e.message).slice(0, 60)}`); }
  }

  // 3) unzip, se estiver no PATH deste processo (costuma estar no shell, não na tarefa agendada)
  if (existe("unzip")) {
    const r = spawnSync("unzip", ["-o", arquivo, "-d", destino], { stdio: "ignore" });
    if (!r.error && r.status === 0) return listar(destino);
    erros.push(`unzip: status ${r.status}`);
  }

  // 4) 7zip-min, se o pacote estiver instalado (a RAIS usava isto e falhava com "exited with code 2")
  try {
    const _7z = require7z();
    if (_7z) { _7z(arquivo, destino); return listar(destino); }
  } catch (e) { erros.push(`7zip-min: ${String(e.message).slice(0, 60)}`); }

  throw new Error(`nenhum descompactador funcionou para ${path.basename(arquivo)} — tentados: ${erros.join(" | ")}`);
}

function require7z() {
  try {
    const m = globalThis.__7zmin || null;
    if (m) return m;
  } catch { /* ignora */ }
  return null;   // carregado sob demanda por quem já depende dele; aqui é só o último recurso
}

function listar(dir) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else out.push(p);
    }
  })(dir);
  return out;
}

/** Acha dentro de `destino` o maior arquivo com a extensão pedida — costuma ser o de dados. */
export function maiorArquivo(destino, ext) {
  const c = listar(destino).filter((f) => f.toLowerCase().endsWith(ext.toLowerCase()));
  return c.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0] || null;
}
