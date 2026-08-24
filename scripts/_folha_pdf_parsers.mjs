// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// _folha_pdf_parsers.mjs — ⭐ A BATERIA DE PARSERS de folha de pagamento em PDF.
//
// POR QUE é um MÓDULO e não código dentro de um coletor: cada prefeitura usa um sistema de folha diferente, mas o
// MESMO conjunto de layouts reaparece em portais distintos — o "Resumo da Folha por Funcionário" (Betha) que o
// Diretório Digital publica em Barreirinha é o mesmo de Pauini no portal da AAM. Um parser por tipo, reusado por
// todos os coletores ([[feedback-varios-metodos-um-por-tipo]]).
//
// 🚨 A REGRA DE OURO: rodar TODOS os parsers e ficar com o que colhe MAIS gente. Parar no primeiro que devolve
// algo fez Tefé entrar com **5 servidores** (falso positivo sobre um resumo) em vez de **9.834**.
//
// DEZESSETE layouts calibrados no Amazonas (16-17/ago/2026) — texto já normalizado (`\s+` → " "):
//   fiorilli · infortread · quadro-atual · relacao-nominal · embaralhado · tabela-mat · relacao-valores ·
//   salario-bruto · conferencia · por-evento · colado-rs · resumo-funcionario · remuneracao-mensal ·
//   fiorilli-colunado · colado-lotacao · registro-lotacao · mat-proventos-colado
//
// Além dos parsers, DUAS GUARDAS valem para todos eles (ver `limpaNome` e `ehResumo` no fim do arquivo):
//   · o rótulo do documento não pode ficar dentro do nome ("FULANO Admissão 02/06/2025 Cargo 0095 - …");
//   · documento sem NOME DE GENTE é resumo, e resumo não é folha ([[pnigp-lista-sem-valor-nao-e-folha]]).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// valor brasileiro: "3.858,75" → 3858.75
export const num = (v) => {
  if (v == null) return null;
  const s = String(v).replace(/[R$\s]/g, "").trim();
  if (!s || s === "-") return null;
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const vazio = { secretaria: null, vinculo: null, matricula: null, nome: null, cargo: null,
  data_admissao: null, cpf: null, pis: null, dependentes: 0, bruto: null, descontos: null, liquido: null, rubricas: {} };

// ── LAYOUT A (fiorilli): o relatório "Folha de Pagamento" analítico, servidor a servidor ────────────────────────
// 🚨 O MESMO relatório varia de prefeitura para prefeitura, e cada variação zera a extração inteira sem erro:
//   · Alvarães:   "Cargo 0042 - GUARDA MUNICIPAL CPF 94269394234 PIS 19028464363 Qtde. Dep. 0"
//   · Anori:      "Cargo 0722 - SUBCONTROLADOR GERALCPF: 63902117249 PIS: 12897933021"  ← CPF COLADO, com ":",
//                  e SEM "Qtde. Dep."
//   · Caapiranga: "Cargo 0164 - CONSELHEIRO TUTELAR P 001 SALARIO BASE …"                ← SEM CPF e SEM PIS
// Por isso CPF/PIS/Qtde são TODOS opcionais — e o fim do cargo é um LOOKAHEAD para os terminadores conhecidos
// (CPF, PIS, Qtde., a 1ª rubrica `P 001`/`D 919`, ou `Base Prev`): sem essa âncora o `.+?` do cargo desanda e casa
// um caractere só. Calibrado: Alvarães 63/63 · Anori 55/55 · Caapiranga 626/626 · Apuí 1.068/1.068.
const RE_SERV = /Matr[íi]cula\s+(\S+)\s+Nome do Trabalhador\s+(.+?)\s+Admiss[ãa]o\s+(\d\d\/\d\d\/\d{4})\s+Cargo\s+(.+?)\s*(?=CPF|PIS|Qtde\.|[PD]\s+\d{3}|Base Prev)(?:CPF:?\s*(\d*)\s*)?(?:PIS:?\s*(\d*)\s*)?(?:Qtde\.\s*Dep\.\s*(\d+))?([\s\S]*?)Proventos\s+([\d.,]+)\s+Descontos\s+([\d.,]+)\s+L[íi]quido\s+([\d.,-]+)/g;
// a seção de lotação nem sempre traz "Vínculo:" (Anori não traz) — grupo opcional
const RE_UNID = /Unidade:\s*(.{3,80}?)\s+(?:V[íi]nculo:\s*(\d+\s*-\s*[^\d]{2,40}?)\s+)?Matr[íi]cula/g;
const RE_COMP = /M[êe]s\/Ano\s+(\d\d)\/(\d{4})/;

function parseFiorilli(T) {
  // 🚨 `vinculo` é grupo OPCIONAL — `.trim()` direto derrubava o parser inteiro com "Cannot read properties of
  // undefined", engolido pelo catch do coletor, e o município saía "0 servidores", cara de fonte vazia.
  const cabecalhos = [...T.matchAll(RE_UNID)].map((m) => ({ pos: m.index, unidade: (m[1] || "").trim() || null, vinculo: (m[2] || "").trim() || null }));
  const doPonto = (pos) => {
    let atual = cabecalhos[0] || { unidade: null, vinculo: null };
    for (const c of cabecalhos) if (c.pos <= pos) atual = c; else break;
    return atual;
  };
  const regs = [];
  for (const m of T.matchAll(RE_SERV)) {
    const c = doPonto(m.index);
    // rubricas do miolo: "P 001 SALARIO BASE 30.00D 1.621,00 D 919 I.N.S.S. 7.70 143,45"
    // 🚨 NUNCA somar as rubricas para achar o bruto — o próprio relatório fecha em `Proventos`.
    const rub = {};
    for (const r of (m[8] || "").matchAll(/\b([PD])\s+(\d{3})\s+(.+?)\s+([\d.,]+[A-Z]?)\s+([\d.,]+)(?=\s+[PD]\s+\d{3}\b|\s+Base\s|$)/g)) {
      rub[`${r[1]} ${r[2]} ${r[3].trim()}`] = num(r[5]);
    }
    regs.push({ ...vazio, secretaria: c.unidade, vinculo: c.vinculo, matricula: m[1], nome: m[2].trim(),
      data_admissao: m[3], cargo: m[4].replace(/\s*CPF:?$/i, "").trim(), cpf: m[5] || null, pis: m[6] || null,
      dependentes: +m[7] || 0, bruto: num(m[9]), descontos: num(m[10]), liquido: num(m[11]), rubricas: rub });
  }
  return { competencia: null, regs };
}

// ── LAYOUT B (infortread): "Folha de Pagamento Analítica" da Infortread Telecom (Canutama) ──────────────────────
// `232 - ANTONIO RODRIGUES DE FREITAS Cargo: AUXILIAR DE CONTABILIDADE Dt Adm.: 15/09/1983 … Qtde. Dep.: 0
//  2.107,30 231,80 1.875,50` — os três totais fecham o bloco. A lotação vem com os RÓTULOS PRIMEIRO:
// `Departamento: Divisão: Secretaria: PREF… SECRETARIA MUNICIPAL DE FINANCA SEC FIN EFETIVOS 01.00.000 …`
const RE_B = /(\d{1,7})\s*-\s*([A-ZÀ-Ú][A-ZÀ-Ú'.\s]{4,60}?)\s+Cargo:\s*(.+?)\s+Dt\s*Adm\.?:?\s*(\d\d\/\d\d\/\d{4})([\s\S]*?)Qtde\.?\s*Dep\.?:?\s*\d+\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/g;
const RE_B_SEC = /Departamento:\s*Divis[ãa]o:\s*Secretaria:\s*(.+?)\s+\d\d\.\d\d\.\d{3}/g;
const MES_EXT = { janeiro: "01", fevereiro: "02", marco: "03", "março": "03", abril: "04", maio: "05", junho: "06",
  julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12" };

function parseInfortread(T) {
  const mc = T.match(/(Janeiro|Fevereiro|Mar[çc]o|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\/(\d{4})/i);
  const competencia = mc ? `${mc[2]}${MES_EXT[mc[1].toLowerCase()]}` : null;
  const cabs = [...T.matchAll(RE_B_SEC)].map((m) => ({ pos: m.index, sec: m[1].trim() }));
  const doPonto = (pos) => { let a = cabs[0]?.sec || null; for (const c of cabs) if (c.pos <= pos) a = c.sec; else break; return a; };
  const regs = [];
  for (const m of T.matchAll(RE_B)) {
    regs.push({ ...vazio, secretaria: doPonto(m.index), matricula: m[1], nome: m[2].trim(),
      data_admissao: m[4], cargo: m[3].trim(), bruto: num(m[6]), descontos: num(m[7]), liquido: num(m[8]) });
  }
  return { competencia, regs };
}

// ── LAYOUT C (quadro-atual): "Quadro Atual de Servidores" (Benjamin Constant) ──────────────────────────────────
// Fluxo `LOTAÇÃO NOME VÍNCULO CARGO ADMISSÃO PROVENTOS` sem rótulo nenhum: quem dá a âncora é o VÍNCULO
// (conjunto fechado) e a data logo antes do valor.
const RE_C = /([A-ZÀ-Ú][A-ZÀ-Ú0-9'.,\-\s]{8,110}?)\s+(EFETIVO|ESTATUT[ÁA]RIO|CARGO EM COMISSAO|CARGO EM COMISSÃO|TRABALHADOR TEMPORARIO|TRABALHADOR TEMPORÁRIO|CONTRATADO|COMISSIONADO|TEMPOR[ÁA]RIO)\s+(.{3,60}?)\s+(\d\d\/\d\d\/\d{4})\s+([\d.,]+)(?=\s+[A-ZÀ-Ú]|\s*$)/g;
function parseQuadroAtual(T) {
  const regs = [];
  for (const m of T.matchAll(RE_C)) {
    // "SECRETARIA MUNICIPAL DE EDUCACAO - SEMED ABDIAS GOMES DE PAULA FILHO" → lotação + nome (a sigla separa)
    const bruto1 = m[1].trim();
    const corte = bruto1.match(/^(.*?[-–]\s*[A-ZÀ-Ú]{2,10})\s+(.{4,})$/);
    regs.push({ ...vazio, secretaria: corte ? corte[1].trim() : null, vinculo: m[2].trim(),
      nome: (corte ? corte[2] : bruto1).trim(), cargo: m[3].trim(), data_admissao: m[4], bruto: num(m[5]) });
  }
  return { competencia: null, regs };
}

// ── LAYOUT D (relacao-nominal): "Relação Nominal" (Novo Airão) ─────────────────────────────────────────────────
// `NOME 08/03/2024 CARGO Contrato/Temporário 1.518,00 1.518,00` — a SITUAÇÃO FUNCIONAL separa cargo dos valores.
const RE_D = /([A-ZÀ-Ú][A-ZÀ-Ú'.\s]{6,60}?)\s+(\d\d\/\d\d\/\d{4})\s+(.{3,60}?)\s+(Contrato\/Tempor[áa]rio|Efetivo|Comissionado|Estatut[áa]rio|Tempor[áa]rio|Contratado)\s+([\d.,]+)\s+([\d.,]+)/gi;
function parseRelacaoNominal(T) {
  const regs = [];
  for (const m of T.matchAll(RE_D)) {
    regs.push({ ...vazio, vinculo: m[4].trim(), nome: m[1].trim(), cargo: m[3].trim(),
      data_admissao: m[2], bruto: num(m[5]), liquido: num(m[6]) });
  }
  return { competencia: null, regs };
}

// ── LAYOUT E (embaralhado): campos EMBARALHADOS pela extração (Envira) ─────────────────────────────────────────
// `JOSE RONNE VON GURGEL ATENDESTE DE NFERMAGEM AE- IB 3.404,10 3.404,10 2.108,4206/08/1990 Estatutário`
// 🚨 o líquido vem COLADO na data de admissão — separar por posição, não por espaço.
const RE_E = /([A-ZÀ-Ú][A-ZÀ-Ú'.\s]{6,60}?)\s+(.{3,55}?)\s+([\d.]+,\d\d)\s+([\d.]+,\d\d)\s+([\d.]+,\d\d)(\d\d\/\d\d\/\d{4})\s+([A-ZÀ-Úa-zà-ú\/\s]{4,26}?)(?=\s+[A-ZÀ-Ú]{2}|\s*$)/g;
function parseEmbaralhado(T) {
  const regs = [];
  for (const m of T.matchAll(RE_E)) {
    regs.push({ ...vazio, vinculo: m[7].replace(/\s+/g, " ").trim(), nome: m[1].trim(), cargo: m[2].trim(),
      data_admissao: m[6], bruto: num(m[3]), liquido: num(m[5]) });
  }
  return { competencia: null, regs };
}

// ── LAYOUT F (tabela-mat): "Nº MAT NOME ADMISSÃO DESLIGAMENTO CARGO SALARIO" (Tefé) ────────────────────────────
const RE_F = /(?:^|\s)(\d{1,5})\s+(\d{3,8})\s+([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú'.\s]{5,60}?)\s+(\d\d\/\d\d\/\d{4})\s+(?:(\d\d\/\d\d\/\d{4})\s+)?(.{3,60}?)\s+([\d.]+,\d\d)(?=\s+\d{1,5}\s+\d{3,8}\s|\s*$)/g;
function parseTabelaMat(T) {
  const regs = [];
  for (const m of T.matchAll(RE_F)) {
    regs.push({ ...vazio, matricula: m[2], nome: m[3].trim(), cargo: m[6].trim(), data_admissao: m[4], bruto: num(m[7]) });
  }
  return { competencia: null, regs };
}

// ── LAYOUT G (relacao-valores): "Relação de Valores" em seções por Vínculo (Barcelos, Nova Olinda) ─────────────
const RE_G = /(\d{2,7}-\d)\s+([A-ZÀ-Ú][A-ZÀ-Ú'.\s]{5,60}?)\s+([\d.]+,\d\d)\s+([\d.]+,\d\d)\s+([\d.]+,\d\d)/g;
const RE_G_VINC = /V[íi]nculo:\s*(\d+\s*-\s*[^\d]{3,45}?)(?=\s+\d{2,7}-\d|\s+V[íi]nculo:|$)/g;
function parseRelacaoValores(T) {
  const cabs = [...T.matchAll(RE_G_VINC)].map((m) => ({ pos: m.index, v: m[1].trim() }));
  const doPonto = (pos) => { let a = cabs[0]?.v || null; for (const c of cabs) if (c.pos <= pos) a = c.v; else break; return a; };
  const regs = [];
  for (const m of T.matchAll(RE_G)) {
    regs.push({ ...vazio, vinculo: doPonto(m.index), matricula: m[1], nome: m[2].trim(),
      bruto: num(m[3]), descontos: num(m[4]), liquido: num(m[5]) });
  }
  return { competencia: null, regs };
}

// ── LAYOUT H (salario-bruto): "Relação de Salário Bruto do mês" (Maraã) ────────────────────────────────────────
const RE_H = /(\d{5,9})\s+([A-ZÀ-Ú][A-ZÀ-Ú'.\s]{5,55}?)\s+([A-ZÀ-Ú0-9()'.\-\/\s]{3,45}?)\s+([\d.]+,\d\d)(?=\s+\d{5,9}\s+[A-ZÀ-Ú]|\s*$)/g;
function parseSalarioBruto(T) {
  const regs = [];
  for (const m of T.matchAll(RE_H)) {
    regs.push({ ...vazio, matricula: m[1], nome: m[2].trim(), cargo: m[3].trim(), bruto: num(m[4]) });
  }
  return { competencia: null, regs };
}

// ── LAYOUT I (conferencia): "Relatório mensal para simples conferencia" (Atalaia do Norte) ─────────────────────
const RE_I = /(\d{2,7})\s+([A-ZÀ-Ú][A-ZÀ-Ú'.\s]{5,55}?)\s+(.{3,45}?)\s+(TRABALHADOR TEMPOR[ÁA]RIO|ESTATUT[ÁA]RIO|COMISSIONADO|CONTRATADO|EFETIVO|CARGO EM COMISS[ÃA]O)\s+([\d.]+,\d\d)/g;
function parseConferencia(T) {
  const regs = [];
  for (const m of T.matchAll(RE_I)) {
    regs.push({ ...vazio, vinculo: m[4].trim(), matricula: m[1], nome: m[2].trim(), cargo: m[3].trim(), bruto: num(m[5]) });
  }
  return { competencia: null, regs };
}

// ── LAYOUT J (por-evento): "Relação de Trabalhadores por Evento" (São Paulo de Olivença) ───────────────────────
// 🚨 O servidor aparece UMA VEZ POR EVENTO (salário base, insalubridade, INSS…). Somar seria inventar bruto:
// colhe-se o evento de SALÁRIO BASE, e o campo fica declarado como tal em `vinculo`.
const RE_J_EV = /Evento:\s*(\d{3})\s*-\s*([^\d]{3,40}?)\s+(?=\d{2,7}-\d\s)/g;
const RE_J = /(\d{2,7}-\d)\s+([A-ZÀ-Ú][A-ZÀ-Ú'.\s]{5,55}?)\s+[\d.,]+D?\s+[\d.,]+\s+([\d.]+,\d\d)/g;
function parsePorEvento(T) {
  const evs = [...T.matchAll(RE_J_EV)].map((m) => ({ pos: m.index, cod: m[1], nome: m[2].trim() }));
  if (!evs.length) return { competencia: null, regs: [] };
  const doPonto = (pos) => { let a = evs[0]; for (const e of evs) if (e.pos <= pos) a = e; else break; return a; };
  const regs = [];
  for (const m of T.matchAll(RE_J)) {
    const ev = doPonto(m.index);
    if (!/sal[áa]rio base|salario base/i.test(ev.nome)) continue;
    regs.push({ ...vazio, vinculo: `evento ${ev.cod} - ${ev.nome}`, matricula: m[1], nome: m[2].trim(), bruto: num(m[3]) });
  }
  return { competencia: null, regs };
}

// ── LAYOUT Q (mat-proventos-colado): "Relação dos Funcionários" com o LÍQUIDO grudado no nome ─────────────────
// São Gabriel da Cachoeira, 92 páginas, 283 mil caracteres — e a bateria só tirava 756 de ~3 mil pessoas.
// `14286 7.673,47 1.420,20 6.253,27ABIUDE LOPES CAMPOS 02/05/2025 PROF.INDIG.II 20H.ENS.FUND.TMP`
//   matrícula · proventos · descontos · líquido+NOME · admissão · cargo
// 🚨 O cargo termina onde COMEÇA O PRÓXIMO REGISTRO (matrícula seguida de valor) — sem esse lookahead o `.+?`
// engole a linha inteira e o registro seguinte some. O rodapé "Página N de M" entra no meio e é descartado.
const RE_Q = /(\d{2,7})\s+([\d.]+,\d\d)\s+([\d.]+,\d\d)\s+([\d.]+,\d\d)([A-ZÀ-Ú][A-ZÀ-Ú'.\s-]{4,58}?)\s+(\d{2}\/\d{2}\/\d{4})\s+(.{3,55}?)(?=\s*\d{2,7}\s+[\d.]+,\d\d\s+[\d.]+,\d\d\s+[\d.]+,\d\d[A-ZÀ-Ú]|\s*P[áa]gina\s+\d|\s*$)/g;
function parseMatProventosColado(T) {
  const regs = [];
  for (const m of T.matchAll(RE_Q)) {
    const cargo = m[7].replace(/\s*P[áa]gina\s+\d+\s+de\s+\d+.*$/i, "")
      .replace(/\s*Rela[çc][ãa]o dos Funcionarios.*$/i, "").replace(/\s{2,}/g, " ").trim();
    regs.push({ ...vazio, matricula: m[1], nome: m[5].replace(/\s{2,}/g, " ").trim(),
      data_admissao: m[6], cargo: cargo || null,
      bruto: num(m[2]), descontos: num(m[3]), liquido: num(m[4]) });
  }
  return { competencia: null, regs };
}

// ── LAYOUT K (colado-rs): "Nome / Total Bruto / Total Descontos / Líquido" com campos COLADOS (Itamarati) ──────
// `EDER GOMES MAIA R$ 5.000,00 R$ 2.416,51R$ 2.583,495400806 R$ 5.000,00` — o líquido vem grudado na matrícula.
const RE_K = /([A-ZÀ-Ú][A-ZÀ-Ú'.\s]{5,55}?)\s+R\$\s*([\d.]+,\d\d)\s+R\$\s*([\d.]+,\d\d)R\$\s*([\d.]+,\d\d)(\d{2,9})\s+R\$\s*([\d.]+,\d\d)/g;
const RE_K_SEC = /(SECRETARIA[A-ZÀ-Ú\s]{4,50}?)(?=\s+[A-ZÀ-Ú][a-zà-ú]|\s+CNPJ|\s+M[êe]s)/g;
function parseColadoRS(T) {
  const cabs = [...T.matchAll(RE_K_SEC)].map((m) => ({ pos: m.index, sec: m[1].trim() }));
  const doPonto = (pos) => { let a = cabs[0]?.sec || null; for (const c of cabs) if (c.pos <= pos) a = c.sec; else break; return a; };
  const regs = [];
  for (const m of T.matchAll(RE_K)) {
    regs.push({ ...vazio, secretaria: doPonto(m.index), matricula: m[5], nome: m[1].trim(),
      bruto: num(m[2]), descontos: num(m[3]), liquido: num(m[4]) });
  }
  return { competencia: null, regs };
}

// ── LAYOUT L (resumo-funcionario): "Resumo da Folha por Funcionário" (Betha) — traz a lotação ─────────────────
// `3530 - 1 ANA GABRIELE REIS DE GOIS R$ 0,00 R$ 5.021,00 R$ 504,44 R$ 7,51 R$ 1.311,95 R$ 3.709,05R$ 1.621,00`
//   código-dígito · nome · sal.família · TOTAL PROVENTOS · previdência · IRRF · total descontos · líquido+contratual
const RE_L = /(\d{2,7})\s*-\s*\d\s+([A-ZÀ-Ú][A-ZÀ-Ú'.\s]{5,55}?)\s+R\$\s*[\d.]+,\d\d\s+R\$\s*([\d.]+,\d\d)\s+R\$\s*[\d.]+,\d\d\s+R\$\s*[\d.]+,\d\d\s+R\$\s*([\d.]+,\d\d)\s+R\$\s*([\d.]+,\d\d)/g;
const RE_L_SEC = /Estrutura organizacional:\s*(.{3,60}?)(?=\s+\d{2,7}\s*-\s*\d\s|\s*$)/g;
function parseResumoFuncionario(T) {
  const cabs = [...T.matchAll(RE_L_SEC)].map((m) => ({ pos: m.index, sec: m[1].trim() }));
  const doPonto = (pos) => { let a = cabs[0]?.sec || null; for (const c of cabs) if (c.pos <= pos) a = c.sec; else break; return a; };
  const regs = [];
  for (const m of T.matchAll(RE_L)) {
    regs.push({ ...vazio, secretaria: doPonto(m.index), matricula: m[1], nome: m[2].trim(),
      bruto: num(m[3]), descontos: num(m[4]), liquido: num(m[5]) });
  }
  return { competencia: null, regs };
}

// ── LAYOUT M (remuneracao-mensal): "Remuneração mensal dos servidores" (Presidente Figueiredo) ────────────────
// `7-1 ABDON NASCIMENTO DE SALES IRMAO 26/07/1993 15687,43 13975,031712,4AGENTE DE SAUDE J-10`
const RE_M = /(\d{1,7}-\d)\s+([A-ZÀ-Ú][A-ZÀ-Ú'.\s]{5,55}?)\s+(\d\d\/\d\d\/\d{4})\s+([\d.]+,\d+)\s+([\d.]+,\d+?)([\d.]+,\d+?)([A-ZÀ-Ú][^\d]{2,45}?)(?=\s+\d{1,7}-\d\s|\s*$)/g;
function parseRemuneracaoMensal(T) {
  const regs = [];
  for (const m of T.matchAll(RE_M)) {
    regs.push({ ...vazio, matricula: m[1], nome: m[2].trim(), cargo: m[7].trim(), data_admissao: m[3], bruto: num(m[4]) });
  }
  return { competencia: null, regs };
}

// ── LAYOUT N (fiorilli-colunado): o MESMO relatório Fiorilli, mas com os totais DESCOLADOS do bloco ───────────
// Em Careiro da Várzea a extração quebra a diagramação em duas colunas e os `Proventos/Descontos` aparecem
// LONGE do servidor a que pertencem (no topo da página), enquanto o bloco termina em `Base Prev. … Líquido`.
// O layout A não casa nada aqui. ⭐ `Base Prev.` == `Proventos` neste relatório (conferido: SALARIO BASE 1.690,20
// + FUNCAO GRATIFICADA 750,00 → Base Prev. 2.440,20, igual ao Proventos solto), então é ele que vira o bruto.
const RE_N = /Matr[íi]cula\s+(\S+)\s+Nome do Trabalhador\s+(.+?)\s+Admiss[ãa]o\s+(\d\d\/\d\d\/\d{4})\s+Cargo\s+([^\n]{3,60}?)\s+(?=SALARIO|VENCIMENTO|Base |PREVID|[A-Z]{4})([\s\S]{0,600}?)Base Prev\.\s+([\d.,]+)\s+Base IRRF\s+([\d.,]+)\s+L[íi]quido\s+([\d.,-]+)/g;
function parseFiorilliColunado(T) {
  const cabecalhos = [...T.matchAll(RE_UNID)].map((m) => ({ pos: m.index, unidade: (m[1] || "").trim() || null }));
  const doPonto = (pos) => { let a = cabecalhos[0]?.unidade || null; for (const c of cabecalhos) if (c.pos <= pos) a = c.unidade; else break; return a; };
  const regs = [];
  for (const m of T.matchAll(RE_N)) {
    const base = num(m[6]);
    regs.push({ ...vazio, secretaria: doPonto(m.index), matricula: m[1], nome: m[2].trim(),
      data_admissao: m[3], cargo: m[4].trim(), bruto: base, liquido: num(m[8]),
      descontos: base != null && num(m[8]) != null ? +(base - num(m[8])).toFixed(2) : null });
  }
  return { competencia: null, regs };
}

// ── LAYOUT O (colado-lotacao): tudo COLADO, mas com LOTAÇÃO (Amaturá) ────────────────────────────────────────
// `6705 7.053,66 695,75 6.357,91ABEL BARBOSA 12/05/2025 PROFESSOR LEIGO 20H31/12/2025 TEMPORARIOSECRETARIA
//  MUNICIPAL DE EDUCACAO 40`
//   mat · proventos · descontos · líquido+NOME · admissão · cargo+demissão · VÍNCULO+LOTAÇÃO · carga horária
// 🚨 Três emendas na mesma linha (líquido↔nome, cargo↔demissão, vínculo↔lotação): o vínculo é conjunto fechado
// e serve de tesoura para separar o cargo da lotação.
const RE_O = /(\d{2,7})\s+([\d.]+,\d\d)\s+([\d.]+,\d\d)\s+([\d.]+,\d\d)([A-ZÀ-Ú][A-ZÀ-Ú'.\s]{4,55}?)\s+(\d\d\/\d\d\/\d{4})\s+(.{3,55}?)\s*(?:\d\d\/\d\d\/\d{4}|0)\s*(EFETIVO|TEMPOR[ÁA]RIO|COMISSIONADO|CONTRATADO|ESTATUT[ÁA]RIO)([A-ZÀ-Ú][A-ZÀ-Ú\s]{4,60}?)\s+(\d{1,3})(?=\s+\d{2,7}\s+[\d.]|\s*$)/g;
function parseColadoLotacao(T) {
  const regs = [];
  for (const m of T.matchAll(RE_O)) {
    regs.push({ ...vazio, matricula: m[1], bruto: num(m[2]), descontos: num(m[3]), liquido: num(m[4]),
      nome: m[5].trim(), data_admissao: m[6], cargo: m[7].trim(), vinculo: m[8].trim(), secretaria: m[9].trim() });
  }
  return { competencia: null, regs };
}

// ── LAYOUT P (registro-lotacao): "REGISTRO NOME VINCULO LOTAÇÃO SALÁRIO" (Tabatinga) ─────────────────────────
// `525774 ABDIAS PEREIRA DE OLIVEIRA JUNIOR Temporários SECRETARIA DE SAUDE 4.000,00R$`
// 🚨 o `R$` vem DEPOIS do número, colado — e o vínculo (conjunto fechado) é o que separa nome de lotação.
const RE_P = /(\d{5,7})\s+([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú'.\s]{4,55}?)\s+(Tempor[áa]rios?|Estatut[áa]rios?|Celetistas?|Comissionado\s*s?|Contratados?|Efetivos?)\s+([A-ZÀ-Ú][A-ZÀ-Ú.,\s]{4,60}?)\s+([\d.]+,\d\d)\s*R\$/g;
function parseRegistroLotacao(T) {
  const regs = [];
  for (const m of T.matchAll(RE_P)) {
    regs.push({ ...vazio, matricula: m[1], nome: m[2].trim(), vinculo: m[3].trim(),
      secretaria: m[4].trim(), bruto: num(m[5]) });
  }
  return { competencia: null, regs };
}

export const PARSERS = [
  ["fiorilli", parseFiorilli], ["infortread", parseInfortread], ["quadro-atual", parseQuadroAtual],
  ["relacao-nominal", parseRelacaoNominal], ["embaralhado", parseEmbaralhado], ["tabela-mat", parseTabelaMat],
  ["relacao-valores", parseRelacaoValores], ["salario-bruto", parseSalarioBruto], ["conferencia", parseConferencia],
  ["por-evento", parsePorEvento], ["colado-rs", parseColadoRS], ["resumo-funcionario", parseResumoFuncionario],
  ["remuneracao-mensal", parseRemuneracaoMensal], ["fiorilli-colunado", parseFiorilliColunado], ["colado-lotacao", parseColadoLotacao], ["registro-lotacao", parseRegistroLotacao],
  ["mat-proventos-colado", parseMatProventosColado],
];

// ⭐ roda TODOS e devolve o que colheu MAIS gente (ver a regra de ouro no cabeçalho).
//
// 🚨 DUAS PASSADAS, e não uma: rodar os 13 parsers sobre o texto INTEIRO custa caro e, em alguns PDFs, um regex
// com classe larga + alternância entra em backtracking catastrófico e **pendura o coletor** (Careiro da Várzea
// ficou 20 minutos num PDF de 1,5 MB que baixa em 0,6 s — o gargalo não era a rede, era o parser).
// Então: detecta o layout numa AMOSTRA barata e só o vencedor roda no documento completo.
const AMOSTRA = 40000;
// ═══ pós-processamento comum a TODOS os parsers ══════════════════════════════════════════════════════════════
// 🚨 RÓTULO COLADO NO NOME: em Careiro da Várzea o nome saía "ANA TEREZA DA SILVA GUIMARAES Admissão 02/06/2025
// Cargo 0095 - ASSESSOR TECNICO ADMINISTRATIVO I SALARIO BASE 1.621,00" — 117 linhas com o registro inteiro
// dentro do campo nome. Isso quebra qualquer contagem por pessoa e qualquer cruzamento por nome. O corte é no
// primeiro RÓTULO do próprio documento, e o que vem depois ainda serve para preencher cargo e admissão.
// 🚨 ACENTO EM REGEX E ARMADILHA: "a-til" pre-composto (U+00E3) e decomposto (a + U+0303) sao strings
// DIFERENTES, e o texto que sai do PDF nem sempre vem na mesma forma do codigo-fonte: a guarda casava no
// teste e falhava no dado real. Aqui o acento vira `.` -- encoding nao derruba mais o corte.
const RE_CORTE = /\s+(admiss.{0,2}o|matr.{0,2}cula|cargo|fun.{0,3}o|cpf|lota.{0,3}o|salario base|sal\. base|v.{0,2}nculo)\b/i;
export function limpaNome(r) {
  if (!r || typeof r.nome !== "string") return r;
  const m = r.nome.match(RE_CORTE);
  if (!m || m.index < 4) return r;                       // corte no começo = não era nome, deixa como está
  const resto = r.nome.slice(m.index);
  // pontuação órfã sobra quando o corte é num "NOME - CPF ...": "JOAO CARLOS RODRIGUES -" não é nome.
  r.nome = r.nome.slice(0, m.index).replace(/[\s.,;:\/-]+$/, "").trim();
  // aproveita o resto: cargo e admissão costumam estar ali e costumam estar vazios no registro
  if (!r.cargo) {
    const c = resto.match(/cargo\s*:?\s*(?:\d+\s*[-\u2013]\s*)?([^\d]{4,60}?)(?=\s+(?:salario|sal\.|admiss|matr|cpf|lota|v.{0,2}nculo)|\s+\d|$)/i);
    if (c) r.cargo = c[1].replace(/\s+(salario|sal\.|admiss|matr|cpf|lota).*$/i, "").trim();
  }
  if (!r.data_admissao) {
    const d = resto.match(/admiss.{0,2}o\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (d) r.data_admissao = d[1];
  }
  return r;
}

// 🚨 RESUMO NÃO É FOLHA: o "Relatório Folha de Pagamento Analítica" de Manaquiri é um RESUMO GERAL por rubrica —
// "001 SALARIO BASE 673 Sim Sim 675.613,50" — e os parsers liam cada rubrica como uma pessoa (o município
// entrou no placar com 22 "servidores" chamados QUINQUENIO e ABONO). Documento sem nome de gente é descartado
// inteiro: melhor zero medido do que lixo que infla ([[pnigp-sonda-folha-prova-e-a-coleta]]).
const RE_RESUMO = /resumo geral|resumo mensal da folha|quantidade de servidores|resumo por (evento|rubrica|estrutura)|totaliza[çc][ãa]o (da|de) folha/i;
const RE_RUBRICA = /^(complemento|gabinete|vantagens|liquido a receber|salario|sal\.|vencimento|gratifica|adicional|adic\.|abono|inss|irrf|imposto|previdencia|previd|pensao|licenca|hora extra|quinquenio|faltas|desconto|produtividade|regencia|periculosidade|insalubridade|maternidade|salario familia|decimo|13|ferias|rescisao|base|total|liquido|bruto|resumo|quantidade|contribuicao|margem|consignad)/i;
const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
export function ehResumo(texto, regs) {
  if (!regs.length) return false;
  // 🚨 O MARCADOR TEXTUAL NÃO BASTA. Em Manaquiri os 12 arquivos mensais não trazem "RESUMO GERAL" nem
  // "Quantidade de Servidores" no texto extraído, e mesmo assim o que sai são 2 "servidores" por mês chamados
  // COMPLEMENTO e QUINQUENIO. Quem denuncia o documento é O NOME EXTRAÍDO, não o cabeçalho: gente tem nome E
  // sobrenome, rubrica e lotação são palavra única (QUINQUENIO, GABINETE, VANTAGENS). Duas provas independentes:
  //   · verbete de folha conhecido (RE_RUBRICA), e
  //   · TOKEN ÚNICO — nome sem espaço não é nome de pessoa.
  const suspeito = regs.filter((r) => {
    const n = semAcento(r.nome || "").trim();
    return !n || RE_RUBRICA.test(n) || !/\s/.test(n);
  }).length;
  const frac = suspeito / regs.length;
  if (frac >= 0.5) return true;                       // maioria não é gente: o documento é resumo/extrato
  return RE_RESUMO.test(texto) && frac >= 0.3;        // com marcador no texto, um terço já condena
}


export function parsePdfTexto(texto) {
  const T = texto.replace(/\s+/g, " ");
  const comp = T.match(RE_COMP);
  const padrao = comp ? `${comp[2]}${comp[1]}` : null;
  const amostra = T.length > AMOSTRA * 1.5 ? T.slice(0, AMOSTRA) : T;

  // 🚨 A amostra do INÍCIO às vezes pega só capa/índice e nenhum parser casa — o arquivo pareceria vazio.
  // Se isso acontecer, tenta uma fatia do MEIO antes de desistir.
  const fatias = [amostra];
  if (amostra !== T) {
    const meio = Math.floor(T.length / 2);
    fatias.push(T.slice(meio, meio + AMOSTRA));
  }
  let vencedor = null, melhorNaAmostra = 0;
  for (const f of fatias) {
    for (const [nome, fn] of PARSERS) {
      let alt;
      try { alt = fn(f); } catch { continue; }
      if (alt.regs.length > melhorNaAmostra) { melhorNaAmostra = alt.regs.length; vencedor = [nome, fn]; }
    }
    if (vencedor) break;
  }
  if (!vencedor) return { regs: [], layout: null, competencia: padrao };
  const entrega = (regs, competencia) => {
    const limpos = regs.map(limpaNome);
    if (ehResumo(T, limpos)) return { regs: [], layout: vencedor[0], competencia, resumo: true };
    return { regs: limpos, layout: vencedor[0], competencia, resumo: false };
  };
  if (amostra === T) {
    const alt = vencedor[1](T);
    return entrega(alt.regs, alt.competencia || padrao);
  }
  let cheio;
  try { cheio = vencedor[1](T); } catch { return { regs: [], layout: vencedor[0], competencia: padrao }; }
  return entrega(cheio.regs, cheio.competencia || padrao);
}
