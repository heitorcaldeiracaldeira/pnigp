// RELÓGIO ÚNICO DOS SCRIPTS — tudo que um humano vai ler sai em horário de Brasília.
//
// O PROBLEMA que isto resolve. O servidor e o node correm em UTC, então `new Date().toISOString()` carimba
// três horas à frente. Como os arquivos .cmd carimbam com %TIME% (que é local), o mesmo log misturava dois
// relógios sem avisar: em 04/ago/2026 o cabeçalho de fase dizia 17:45 e as linhas do orquestrador logo
// abaixo diziam 20:45 — a mesma coisa, com três horas de diferença. Pior, o SISTEMA.md gerado às 23h de
// 04/ago nasceu carimbado "2026-08-05". Este módulo é a única fonte de hora dos scripts.
//
// A REGRA. Carimbo de INSTANTE (quando algo aconteceu) converte para Brasília, sempre. Data PURA — data de
// competência, exercício, ano de publicação — não se converte nunca: ela não é um instante, é um rótulo.
//
// O sufixo -03 vai junto de propósito: um log sem fuso declarado é justamente o que criou a confusão acima,
// e ele também permite distinguir o que foi escrito antes desta mudança (sem sufixo = UTC antigo).
const FUSO = "America/Sao_Paulo";
// 'sv-SE' formata como ISO (2026-08-04 23:58:12), que ordena bem e não confunde dia com mês
const fmt = new Intl.DateTimeFormat("sv-SE", {
  timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});

const partes = (d = new Date()) => fmt.format(d).replace(",", "");   // "2026-08-04 23:58:12"

export const dataBR = (d = new Date()) => partes(d).slice(0, 10);    // 2026-08-04
export const horaBR = (d = new Date()) => partes(d).slice(11, 19);   // 23:58:12
export const carimboBR = (d = new Date()) => `${partes(d)} -03`;     // 2026-08-04 23:58:12 -03
export const carimboCurtoBR = (d = new Date()) => `${partes(d).slice(0, 16)} -03`; // 2026-08-04 23:58 -03
// prefixo de linha de log: hora com o fuso declarado, para nunca mais se confundir com UTC
export const horaLogBR = (d = new Date()) => `${horaBR(d)}-03`;      // 23:58:12-03
