// PAINEL DE ACOMPANHAMENTO DA RODADA COMPLETA — gera um HTML standalone (sem servidor, sem CDN) mostrando
// em que fase a rodada está, o que já terminou, o que falhou e o que ainda não começou.
//   node scripts/painel_rodada.mjs          → gera uma vez
//   LOOP=1 node scripts/painel_rodada.mjs   → regera a cada 15s até a rodada terminar (o HTML se recarrega sozinho)
//   SAIDA=caminho.html                      → onde escrever (padrão C:\Users\PC\painel_rodada.html)
//
// LÊ SÓ ARQUIVO, não toca no banco: a rodada já é pesada e o painel não pode disputar conexão com ela.
// FONTES: pnigp-tudo.log (as 5 fases + detalhe das fases 1 a 4) e pnigp-tce.log (os 10 passos da fase 5).
//
// FUSO — tudo aqui é horário de Brasília. Os .cmd carimbam com %TIME% (já local) e os scripts node carimbam
// por hora_br.mjs, que declara o fuso na própria linha (23:58:12-03). O painel exibe como está; só converte
// linha ANTIGA, gravada antes dessa uniformização, que vinha em UTC sem declarar.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP = path.join(process.env.LOCALAPPDATA || "", "Temp");
const LOG_TUDO = path.join(TMP, "pnigp-tudo.log");
const LOG_TCE = path.join(TMP, "pnigp-tce.log");
const LOG_MARCA = path.join(TMP, "pnigp-marca.log");   // cadeia da marca lançada à parte (roda_marca.cmd)
const SAIDA = process.env.SAIDA || "C:\\Users\\PC\\painel_rodada.html";
const LOOP = process.env.LOOP === "1";
const PASSO_MS = 15000;

const FASES = [
  { n: 1, titulo: "Coleta do PNCP e das fontes devidas", oque: "Varre o catálogo de fontes, decide quais estão vencidas e roda só essas — em série por API, com religamento automático em erro ou estagnação." },
  { n: 2, titulo: "Consumidor de evento — itens", oque: "Drena a fila de eventos do PNCP (o PNCP é um log, não um estado) e mantém itens_sc fresco: resultado, item, contratação, documento e exclusão." },
  { n: 3, titulo: "Enriquecimento do descritivo", oque: "Reconstrói a descrição do item a partir dos documentos do processo, um processo por núcleo da máquina." },
  { n: 4, titulo: "Cadeia da marca e do modelo", oque: "Extrai marca/modelo dos documentos de resultado por família de portal, confere com trava dupla e consolida — sem o consolida nada chega ao produto." },
  { n: 5, titulo: "Casamento com o TCE e fila de averiguação", oque: "Casa o e-Sfinge com o PNCP, saneia o valor do TCE e monta o quadro de apontamentos. Vem por último porque lê itens_sc e contratos_sc já atualizados." },
];

const ler = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---- tempo -------------------------------------------------------------------------------------
// hh:mm:ss[,cc] do cmd (local). Vira minutos-do-dia; a data não aparece no carimbo, então o painel
// compara sempre dentro da mesma rodada e soma 24h quando o relógio dá a volta (rodada que cruza a meia-noite).
const seg = (t) => { const m = /^(\d{1,2}):(\d{2}):(\d{2})/.exec(t || ""); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null; };
const agoraSeg = () => { const d = new Date(); return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds(); };
const diff = (a, b) => { if (a == null || b == null) return null; let d = b - a; if (d < -3600) d += 86400; return d < 0 ? 0 : d; };
const dur = (s) => { if (s == null) return "—"; if (s < 60) return `${s}s`; if (s < 3600) return `${Math.floor(s / 60)}min ${s % 60}s`; return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}min`; };
const hhmm = (t) => (t || "").slice(0, 8);
// Carimbo do orquestrador. Hoje ele sai como "23:58:12-03" (hora_br.mjs) e é exibido como está. Linhas
// gravadas ANTES dessa mudança vêm sem fuso declarado e são UTC — essas ainda se converte. É a única razão
// de esta função existir; quando não houver mais log antigo em circulação, ela pode sair.
const horaExibida = (t) => {
  if (!t) return t;
  if (/-\d\d$/.test(t)) return t.replace(/-\d\d$/, "");         // já é Brasília, declarado na origem
  const s = seg(t);                                              // legado: UTC sem declaração
  return s == null ? t : new Date((s - 3 * 3600 + 86400) % 86400 * 1000).toISOString().slice(11, 19);
};

// ---- as 17 etapas da cadeia da marca, lidas do próprio pipeline (não duplicar a lista aqui) ------
function etapasMarca() {
  const txt = ler(path.join(ROOT, "scripts", "auditoria", "pipeline.mjs"));
  const re = /^\s*\["([^"]+)",\s*\{[^}]*\},\s*"([^"]+)"/gm;
  const out = []; let m;
  while ((m = re.exec(txt))) out.push({ script: m[1], desc: m[2] });
  return out;
}

// ---- leitura da rodada em curso ------------------------------------------------------------------
function lerRodada() {
  const bruto = ler(LOG_TUDO);
  const ini = bruto.lastIndexOf("===== RODADA COMPLETA - INICIO");
  const txt = ini >= 0 ? bruto.slice(ini) : bruto;
  const linhas = txt.split(/\r?\n/);

  const mIni = /INICIO\s+(\S+)\s+([\d:,\.]+)/.exec(linhas[0] || "");
  const inicio = { data: mIni?.[1] || "—", hora: hhmm(mIni?.[2]) };
  const fim = /RODADA COMPLETA - FIM\s+(\S+)\s+([\d:,\.]+)/.exec(txt);
  const encerrada = !!fim;

  // cabeçalhos de fase: --- N/5 rótulo :: hh:mm:ss,cc ---
  const cab = [];
  linhas.forEach((l, i) => {
    const m = /^---\s*(\d)\/5\s+(.+?)\s*::\s*([\d:,\.]+)\s*---/.exec(l.trim());
    if (m) cab.push({ n: +m[1], hora: hhmm(m[3]), linha: i });
  });

  const resumo = [...txt.matchAll(/^\s*(\d) [^\.]+\.+ exit (-?\d+)/gm)].map((m) => ({ n: +m[1], exit: +m[2] }));
  const falhou = new Set([...txt.matchAll(/^\*\*\* FALHOU: (\d)\/5/gm)].map((m) => +m[1]));

  const fases = FASES.map((f) => {
    const c = cab.find((x) => x.n === f.n);
    const prox = c ? cab.find((x) => x.linha > c.linha) : null;
    const r = resumo.find((x) => x.n === f.n);
    let estado = "aguardando";
    if (c) estado = falhou.has(f.n) || (r && r.exit !== 0) ? "falhou" : (prox || encerrada) ? "concluida" : "rodando";
    const fimSeg = prox ? seg(prox.hora) : encerrada ? seg(fim[2]) : agoraSeg();
    return {
      ...f, estado, inicio: c?.hora || null, exit: r?.exit ?? null,
      duracao: c ? diff(seg(c.hora), fimSeg) : null,
      corpo: c ? linhas.slice(c.linha + 1, prox ? prox.linha : linhas.length) : [],
    };
  });
  return { inicio, encerrada, fimHora: encerrada ? hhmm(fim[2]) : null, fases, linhas };
}

// ---- detalhe da fase 1: cada fonte do orquestrador -----------------------------------------------
function detalheColeta(corpo) {
  const fontes = new Map();
  const põe = (id, p) => fontes.set(id, { id, ...(fontes.get(id) || {}), ...p });
  const H = "([\\d:]+(?:-\\d\\d)?)";   // hora do log, com ou sem o fuso declarado
  for (const l of corpo) {
    let m;
    if ((m = new RegExp(`^\\[ORQ ${H}\\]\\s+RODA\\s+(\\S+)`).exec(l))) põe(m[2], { plano: "a coletar" });
    else if ((m = new RegExp(`^\\[ORQ ${H}\\]\\s+ok\\s+(\\S+)`).exec(l))) põe(m[2], { plano: "em dia" });
    else if ((m = new RegExp(`^\\[ORQ ${H}\\]\\s+DESATIVADA\\s+(\\S+)`).exec(l))) põe(m[2], { plano: "desativada", estado: "desativada" });
    else if ((m = new RegExp(`^\\[ORQ ${H}\\] ▶ (\\S+) \\(tentativa (\\d)\\/(\\d)\\)`).exec(l))) põe(m[2], { estado: "rodando", desde: m[1], tentativa: +m[3] });
    else if ((m = new RegExp(`^\\[ORQ ${H}\\] !! (\\S+) ESTAGNADO \\((\\d+)s\\)`).exec(l))) põe(m[2], { estagnou: +m[3] });
    else if ((m = new RegExp(`^\\[ORQ ${H}\\] ✔ (\\S+): (.+)$`).exec(l))) põe(m[2], { estado: m[3].trim() === "ok" ? "ok" : "erro", saida: m[3].trim(), fim: m[1] });
  }
  const plano = [...fontes.values()].filter((f) => f.plano === "a coletar" || f.estado);
  const total = [...fontes.values()].filter((f) => f.plano === "a coletar").length;
  return {
    total,
    ok: plano.filter((f) => f.estado === "ok").length,
    erro: plano.filter((f) => f.estado === "erro"),
    rodando: plano.filter((f) => f.estado === "rodando"),
    desativada: [...fontes.values()].filter((f) => f.estado === "desativada"),
    posFinal: /ciclo concluído/.test(corpo.join("\n")),
  };
}

// ---- detalhe da fase 4: as 17 etapas da cadeia da marca -------------------------------------------
// serve tanto para a fase 4 da rodada quanto para a execução avulsa — as duas escrevem as mesmas linhas,
// em logs diferentes. `terminou` evita que a última etapa vista fique eternamente marcada como "rodando".
function detalheMarca(corpo, terminou = false) {
  const todas = etapasMarca();
  const texto = corpo.join("\n");
  const vistas = [...texto.matchAll(/^── (\S+) · /gm)].map((m) => m[1]);
  const erros = new Map([...texto.matchAll(/^\s*! (\S+) saiu (-?\d+)/gm)].map((m) => [m[1], +m[2]]));
  const atual = terminou ? null : vistas[vistas.length - 1];
  return todas.map((e, i) => ({
    ...e, i: i + 1,
    estado: erros.has(e.script) ? "falhou"
      : e.script === atual ? "rodando"
      : vistas.includes(e.script) ? "ok"
      : terminou ? "pulada" : "aguardando",   // acabou e nunca apareceu = pulada (SEM_LLM pula visão e atas)
    exit: erros.get(e.script) ?? null,
  }));
}

// ---- a cadeia da marca lançada à parte (roda_marca.cmd / tarefa "PNIGP - Marca diaria") -----------
// É a MESMA cadeia que a fase 4 da rodada, mas com vida própria: pode estar rodando enquanto a rodada faz
// outra coisa, e é ela que a tarefa das 05:00 dispara. Por isso ganha bloco próprio em vez de virar fase.
function lerCadeiaMarca() {
  const bruto = ler(LOG_MARCA);
  if (!bruto.trim()) return null;
  const i = bruto.lastIndexOf("===== INICIO");
  const txt = bruto.slice(i < 0 ? 0 : i);
  const linhas = txt.split(/\r?\n/);

  const mIni = /INICIO\s+(\S+)\s+([\d:,\.]+)/.exec(linhas[0] || "");
  const mFim = /FIM\s+(\S+)\s+([\d:,\.]+)\s*\(exit (-?\d+)\)/.exec(txt);
  const pulou = /já há uma rodada da cadeia de marca em curso/.test(txt);
  const encerrada = !!mFim;
  const estado = pulou ? "pulada" : !encerrada ? "rodando" : +mFim[3] === 0 ? "concluida" : "falhou";

  const antes = /^antes:\s*(\{.*\})\s*$/m.exec(txt);
  const fecho = /antes (\{.*?\}) → depois (\{.*?\})/.exec(txt);
  const delta = /Δ marca conferida:\s*(-?\d+)/.exec(txt);
  const conta = (j) => { try { const o = JSON.parse(j); return { conferida: +o.conferida, cru: +o.cru }; } catch { return null; } };

  return {
    estado, inicio: hhmm(mIni?.[2]), fim: encerrada ? hhmm(mFim[2]) : null, exit: encerrada ? +mFim[3] : null,
    duracao: diff(seg(mIni?.[2]), encerrada ? seg(mFim[2]) : agoraSeg()),
    etapas: detalheMarca(linhas, encerrada || pulou),
    antes: antes ? conta(antes[1]) : null,
    depois: fecho ? conta(fecho[2]) : null,
    delta: delta ? +delta[1] : null,
    cauda: linhas.filter((l) => l.trim()).slice(-6),
  };
}

// ---- formato ÚNICO do runner (roda.mjs) ----------------------------------------------------------
// <AAAA-MM-DD hh:mm:ss -03> <NIVEL> <cadeia> <EVENTO> <alvo> | <mensagem>
// Uma expressão para tudo, em vez das vinte e tantas que liam os dialetos de cada .cmd. Com a data no
// carimbo, some também a aritmética de virada de meia-noite que o painel fazia na mão.
const RE_RUNNER = /^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) -\d\d (INFO|WARN|ERRO) (\S+) (INICIO|ETAPA_INICIO|ETAPA_FIM|FALHA|PULADA|RESUMO|FIM) (\S+) \| ?(.*)$/;
function eventosDoRunner(arquivo) {
  const linhas = ler(arquivo).split(/\r?\n/);
  let ini = -1;
  linhas.forEach((l, i) => { const m = RE_RUNNER.exec(l); if (m && m[4] === "INICIO") ini = i; });
  if (ini < 0) return null;   // log ainda no formato antigo
  const ev = [];
  for (const l of linhas.slice(ini)) {
    const m = RE_RUNNER.exec(l);
    if (m) ev.push({ hora: m[1].slice(11), nivel: m[2], cadeia: m[3], evento: m[4], alvo: m[5], msg: m[6] });
  }
  return ev;
}
// passos de uma cadeia do runner, na forma que os cartões do painel já sabem desenhar
function passosDoRunner(arquivo) {
  const ev = eventosDoRunner(arquivo);
  if (!ev) return null;
  const encerrou = ev.some((e) => e.evento === "FIM");
  const passos = new Map();
  for (const e of ev) {
    if (!/^\d+\/\d+$/.test(e.alvo)) continue;
    const p = passos.get(e.alvo) || { n: Number(e.alvo.split("/")[0]), rotulo: "", hora: e.hora, estado: "rodando", duracao: null };
    if (e.evento === "ETAPA_INICIO") { p.rotulo = e.msg; p.hora = e.hora; p.estado = "rodando"; }
    if (e.evento === "ETAPA_FIM") { p.estado = "ok"; p.duracao = Number(/dur=(\d+)s/.exec(e.msg)?.[1]) || null; }
    if (e.evento === "FALHA") { p.estado = "falhou"; p.duracao = Number(/dur=(\d+)s/.exec(e.msg)?.[1]) || null; }
    if (e.evento === "PULADA") { p.estado = "pulada"; p.rotulo = p.rotulo || e.msg; }
    passos.set(e.alvo, p);
  }
  const lista = [...passos.values()].sort((a, b) => a.n - b.n);
  // passo ainda "rodando" numa cadeia que já fechou não existe — foi cortado
  if (encerrou) for (const p of lista) if (p.estado === "rodando") p.estado = "pulada";
  return lista;
}

// ---- detalhe da fase 5: os passos do TCE (log próprio) --------------------------------------------
function detalheTce() {
  const novo = passosDoRunner(LOG_TCE);   // desde 05/ago o TCE roda pelo runner
  if (novo) return novo;
  // formato antigo, preservado para log histórico
  const bruto = ler(LOG_TCE);
  const i = bruto.lastIndexOf("--- 1/10");
  if (i < 0) return [];
  const txt = bruto.slice(i);
  const cab = [...txt.matchAll(/^---\s*(\d+)\/10\s+(.+?)\s*::\s*([\d:,\.]+)\s*---/gm)].map((m) => ({ n: +m[1], rotulo: m[2], hora: hhmm(m[3]) }));
  const falhou = new Set([...txt.matchAll(/^\*\*\* FALHOU: (\d+)\/10/gm)].map((m) => +m[1]));
  const encerrou = /===== FIM/.test(txt);
  return cab.map((c, k) => ({
    ...c,
    estado: falhou.has(c.n) ? "falhou" : cab[k + 1] || encerrou ? "ok" : "rodando",
    duracao: diff(seg(c.hora), cab[k + 1] ? seg(cab[k + 1].hora) : agoraSeg()),
  }));
}

// ---- HTML ----------------------------------------------------------------------------------------
const PILULA = { concluida: ["ok", "concluída"], rodando: ["run", "em curso"], falhou: ["err", "falhou"], aguardando: ["wait", "aguardando"] };

function render() {
  const r = lerRodada();
  const cm = lerCadeiaMarca();
  const emCurso = !r.encerrada;
  const marcaEmCurso = cm?.estado === "rodando";
  const vivo = emCurso || marcaEmCurso;          // a página só se recarrega enquanto ALGUMA das duas anda
  const faseAtual = r.fases.find((f) => f.estado === "rodando");
  const gerado = new Date().toLocaleTimeString("pt-BR");

  const cards = r.fases.map((f) => {
    const [cls, rot] = PILULA[f.estado];
    let detalhe = "";

    if (f.n === 1 && f.corpo.length) {
      const d = detalheColeta(f.corpo);
      const feitas = d.ok + d.erro.length;
      const pct = d.total ? Math.round((feitas / d.total) * 100) : 0;
      detalhe = `
        <div class="barra"><span style="width:${pct}%"></span></div>
        <p class="num"><b>${feitas}</b> de <b>${d.total}</b> fontes concluídas · ${d.ok} ok · ${d.erro.length} com erro${d.desativada.length ? ` · ${d.desativada.length} desativada` : ""}</p>
        ${d.rodando.length ? `<p class="agora">▶ coletando agora: ${d.rodando.map((x) => `<b>${esc(x.id)}</b> <span class="fraco">desde ${horaExibida(x.desde)}${x.tentativa > 1 ? ` · tentativa ${x.tentativa}` : ""}</span>`).join(" · ")}</p>` : ""}
        ${d.erro.length ? `<p class="ruim">✕ falharam as 5 tentativas: ${d.erro.map((x) => `${esc(x.id)} <span class="fraco">(${esc(x.saida)})</span>`).join(" · ")}</p>` : ""}
        ${d.desativada.length ? `<p class="fraco">⊘ desativadas de propósito: ${d.desativada.map((x) => esc(x.id)).join(", ")}</p>` : ""}
        ${d.posFinal ? `<p class="bom">✓ ciclo de coleta concluído — validação, frescor, notificações e documentação incluídos</p>` : ""}`;
    }

    if (f.n === 4 && f.corpo.length) {
      const et = detalheMarca(f.corpo, f.estado !== "rodando");
      const feitas = et.filter((e) => e.estado === "ok" || e.estado === "falhou").length;
      detalhe = `
        <div class="barra"><span style="width:${Math.round((feitas / et.length) * 100)}%"></span></div>
        <p class="num"><b>${feitas}</b> de <b>${et.length}</b> etapas</p>
        <ol class="etapas">${et.map((e) => `<li class="${e.estado}"><span class="i">${e.i}</span> ${esc(e.desc)} <span class="fraco">${esc(e.script)}</span>${e.exit != null ? ` <span class="ruim">saiu ${e.exit}</span>` : ""}</li>`).join("")}</ol>`;
    }

    if (f.n === 5 && f.corpo.length) {
      const ps = detalheTce();
      const feitosTce = ps.filter((p) => p.estado !== "rodando").length;
      detalhe = ps.length
        ? `<div class="barra"><span style="width:${Math.round((feitosTce / ps.length) * 100)}%"></span></div>
           <p class="num"><b>${feitosTce}</b> de <b>${ps.length}</b> passos</p>
           <ol class="etapas">${ps.map((p) => `<li class="${p.estado}"><span class="i">${p.n}</span> ${esc(p.rotulo)} <span class="fraco">${p.hora} · ${dur(p.duracao)}</span></li>`).join("")}</ol>`
        : `<p class="fraco">o log do TCE ainda não registrou o primeiro passo</p>`;
    }

    if ((f.n === 2 || f.n === 3) && f.corpo.length) {
      const uteis = f.corpo.filter((l) => l.trim() && !/^\(node:|^Warning:|^To prepare|^- If you|^See https|^\(Use `node/.test(l.trim())).slice(-6);
      detalhe = uteis.length ? `<pre class="saida">${esc(uteis.join("\n"))}</pre>` : "";
    }

    return `
      <article class="fase ${f.estado}">
        <div class="marca"><span class="bola"></span></div>
        <div class="conteudo">
          <header>
            <h2>${f.n}. ${esc(f.titulo)}</h2>
            <span class="pill ${cls}">${rot}</span>
          </header>
          <p class="oque">${esc(f.oque)}</p>
          ${f.inicio ? `<p class="tempo">começou ${f.inicio} · ${f.estado === "rodando" ? `há ${dur(f.duracao)}` : `levou ${dur(f.duracao)}`}${f.exit != null ? ` · saída ${f.exit}` : ""}</p>` : `<p class="tempo fraco">ainda não começou</p>`}
          ${detalhe}
        </div>
      </article>`;
  }).join("");

  // bloco da cadeia da marca avulsa — só aparece se o log dela existir
  const blocoMarca = !cm ? "" : (() => {
    const [cls, rot] = PILULA[cm.estado] || ["wait", cm.estado];
    const feitas = cm.etapas.filter((e) => e.estado === "ok" || e.estado === "falhou").length;
    const ganho = cm.antes && cm.depois ? cm.depois.conferida - cm.antes.conferida : cm.delta;
    return `
    <section class="avulsa ${cm.estado}">
      <header>
        <h2>Cadeia da marca · execução à parte</h2>
        <span class="pill ${cls}">${rot}</span>
      </header>
      <p class="oque">A mesma cadeia da fase 4, mas com vida própria: é esta que a tarefa das 05:00 dispara e é aqui que ela aparece quando roda fora da rodada. Log: ${esc(LOG_MARCA)}</p>
      ${cm.estado === "pulada"
        ? `<p class="tempo">Saiu na largada às ${esc(cm.inicio)} sem tocar na fila — já havia outra execução com a trava. Isso é o comportamento correto: duas execuções ao mesmo tempo cegam uma à outra em <code>marca_ata_feitas</code>.</p>`
        : `<p class="tempo">começou ${esc(cm.inicio)} · ${cm.estado === "rodando" ? `há ${dur(cm.duracao)}` : `levou ${dur(cm.duracao)}${cm.exit != null ? ` · saída ${cm.exit}` : ""}`}</p>
           <div class="barra"><span style="width:${Math.round((feitas / cm.etapas.length) * 100)}%"></span></div>
           <p class="num"><b>${feitas}</b> de <b>${cm.etapas.length}</b> etapas${cm.antes ? ` · partiu de ${cm.antes.conferida.toLocaleString("pt-BR")} itens com marca conferida` : ""}</p>
           ${ganho != null ? `<p class="${ganho > 0 ? "bom" : "fraco"}">Δ marca conferida: ${ganho > 0 ? "+" : ""}${ganho.toLocaleString("pt-BR")} itens</p>` : ""}
           <ol class="etapas">${cm.etapas.map((e) => `<li class="${e.estado}"><span class="i">${e.i}</span> ${esc(e.desc)} <span class="fraco">${esc(e.script)}</span>${e.exit != null ? ` <span class="ruim">saiu ${e.exit}</span>` : ""}${e.estado === "pulada" ? ` <span class="fraco">(não rodou)</span>` : ""}</li>`).join("")}</ol>
           ${cm.estado === "rodando" ? `<pre class="saida">${esc(cm.cauda.join("\n"))}</pre>` : ""}`}
    </section>`;
  })();

  const cauda = r.linhas.filter((l) => l.trim()).slice(-14)
    .map((l) => esc(l.replace(/^\[ORQ ([\d:]+(?:-\d\d)?)\]/, (_, t) => `[${horaExibida(t)}]`)))
    .join("\n");

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${vivo ? `<meta http-equiv="refresh" content="15">` : ""}
<title>Rodada completa — acompanhamento</title>
<style>
  :root{--bg:#f8fafc;--card:#fff;--linha:#e2e8f0;--txt:#0f172a;--fraco:#64748b;--ok:#059669;--run:#0284c7;--err:#e11d48;--wait:#94a3b8}
  @media(prefers-color-scheme:dark){:root{--bg:#0b1220;--card:#111a2b;--linha:#1e293b;--txt:#e2e8f0;--fraco:#94a3b8}}
  *{box-sizing:border-box}
  body{margin:0;padding:28px 18px 60px;background:var(--bg);color:var(--txt);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
  .capa{max-width:900px;margin:0 auto 26px}
  h1{font-size:24px;margin:0 0 4px}
  .sub{color:var(--fraco);font-size:13px;margin:0}
  .estado{display:inline-flex;align-items:center;gap:8px;margin-top:14px;padding:10px 16px;border-radius:12px;font-weight:600;font-size:14px}
  .estado.viva{background:#e0f2fe;color:#075985}.estado.fim{background:#dcfce7;color:#166534}.estado.ruim{background:#ffe4e6;color:#9f1239}
  @media(prefers-color-scheme:dark){.estado.viva{background:#082f49;color:#bae6fd}.estado.fim{background:#052e16;color:#bbf7d0}.estado.ruim{background:#4c0519;color:#fecdd3}}
  .estados{display:flex;flex-wrap:wrap;gap:10px}
  .avulsa{max-width:900px;margin:18px auto 0;background:var(--card);border:1px solid var(--linha);border-radius:16px;padding:16px 18px}
  .avulsa.rodando{border-color:var(--run);box-shadow:0 0 0 3px rgba(2,132,199,.12)}
  .avulsa.falhou{border-color:var(--err)}
  .avulsa code{font:12px ui-monospace,Consolas,monospace;background:var(--bg);padding:1px 4px;border-radius:4px}
  .ponto{width:9px;height:9px;border-radius:50%;background:currentColor;animation:pulsa 1.4s infinite}
  @keyframes pulsa{0%,100%{opacity:1}50%{opacity:.25}}
  .trilha{max-width:900px;margin:0 auto;position:relative}
  .trilha::before{content:"";position:absolute;left:11px;top:12px;bottom:12px;width:2px;background:var(--linha)}
  .fase{display:flex;gap:16px;margin-bottom:14px;position:relative}
  .marca{flex:0 0 24px;display:flex;justify-content:center;padding-top:20px;z-index:1}
  .bola{width:14px;height:14px;border-radius:50%;background:var(--wait);box-shadow:0 0 0 4px var(--bg)}
  .fase.concluida .bola{background:var(--ok)}.fase.rodando .bola{background:var(--run);animation:pulsa 1.4s infinite}.fase.falhou .bola{background:var(--err)}
  .conteudo{flex:1;background:var(--card);border:1px solid var(--linha);border-radius:16px;padding:16px 18px}
  .fase.rodando .conteudo{border-color:var(--run);box-shadow:0 0 0 3px rgba(2,132,199,.12)}
  .fase.aguardando .conteudo{opacity:.62}
  header{display:flex;align-items:center;justify-content:space-between;gap:12px}
  h2{font-size:16px;margin:0}
  .pill{border-radius:999px;padding:3px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
  .pill.ok{background:#dcfce7;color:#166534}.pill.run{background:#e0f2fe;color:#075985}.pill.err{background:#ffe4e6;color:#9f1239}.pill.wait{background:#f1f5f9;color:#64748b}
  @media(prefers-color-scheme:dark){.pill.ok{background:#052e16;color:#bbf7d0}.pill.run{background:#082f49;color:#bae6fd}.pill.err{background:#4c0519;color:#fecdd3}.pill.wait{background:#1e293b;color:#94a3b8}}
  .oque{color:var(--fraco);font-size:13px;margin:6px 0 0}
  .tempo{font-size:12px;color:var(--fraco);margin:8px 0 0;font-variant-numeric:tabular-nums}
  .barra{height:7px;border-radius:99px;background:var(--linha);margin:12px 0 6px;overflow:hidden}
  .barra span{display:block;height:100%;background:var(--run);border-radius:99px}
  .num{margin:0;font-size:13px;font-variant-numeric:tabular-nums}
  .agora{margin:8px 0 0;font-size:13px;color:var(--run)}
  .bom{margin:8px 0 0;font-size:13px;color:var(--ok)}
  .ruim{color:var(--err);font-size:13px;margin:8px 0 0}
  .fraco{color:var(--fraco);font-size:12px}
  .etapas{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:3px}
  .etapas li{display:flex;align-items:center;gap:8px;font-size:13px;padding:3px 0}
  .etapas .i{flex:0 0 20px;height:20px;border-radius:50%;background:var(--linha);color:var(--fraco);display:grid;place-items:center;font-size:11px;font-weight:700}
  .etapas li.ok .i{background:#dcfce7;color:#166534}.etapas li.rodando .i{background:#e0f2fe;color:#075985}.etapas li.falhou .i{background:#ffe4e6;color:#9f1239}
  .etapas li.aguardando{opacity:.5}.etapas li.pulada{opacity:.45;text-decoration:line-through}
  .etapas li.rodando{font-weight:600;color:var(--run)}
  .saida{margin:10px 0 0;padding:10px 12px;background:var(--bg);border:1px solid var(--linha);border-radius:10px;font:12px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap;overflow-x:auto}
  .rodape{max-width:900px;margin:26px auto 0}
  .rodape h3{font-size:13px;color:var(--fraco);margin:0 0 8px;font-weight:600}
  pre.log{margin:0;padding:14px;background:var(--card);border:1px solid var(--linha);border-radius:14px;font:12px/1.6 ui-monospace,Consolas,monospace;white-space:pre-wrap;overflow-x:auto;color:var(--fraco)}
  .nota{max-width:900px;margin:16px auto 0;font-size:12px;color:var(--fraco)}
</style></head><body>
<div class="capa">
  <h1>Rodada completa — acompanhamento</h1>
  <p class="sub">As 5 cadeias na ordem em que dependem uma da outra. Começou em ${esc(r.inicio.data)} às ${esc(r.inicio.hora)}.</p>
  <div class="estados">
    <div class="estado ${emCurso ? "viva" : "fim"}">${emCurso
      ? `<span class="ponto"></span> Rodada em curso há ${dur(diff(seg(r.inicio.hora), agoraSeg()))} — fase ${faseAtual ? faseAtual.n : "?"} de 5${faseAtual ? `: ${esc(faseAtual.titulo)}` : ""}`
      : `✓ Rodada encerrada às ${esc(r.fimHora)} — durou ${dur(diff(seg(r.inicio.hora), seg(r.fimHora)))}`}</div>
    ${cm ? `<div class="estado ${marcaEmCurso ? "viva" : cm.estado === "falhou" ? "ruim" : "fim"}">${marcaEmCurso
      ? `<span class="ponto"></span> Cadeia da marca à parte em curso há ${dur(cm.duracao)}`
      : cm.estado === "pulada" ? `⊘ Cadeia da marca saiu sem rodar (outra execução tinha a trava)`
      : `${cm.estado === "falhou" ? "✕" : "✓"} Cadeia da marca encerrada às ${esc(cm.fim)} — durou ${dur(cm.duracao)}`}</div>` : ""}
  </div>
</div>
<main class="trilha">${cards}</main>
${blocoMarca}
<div class="rodape">
  <h3>Últimas linhas do log · ${esc(LOG_TUDO)}</h3>
  <pre class="log">${cauda}</pre>
</div>
<p class="nota">Gerado às ${gerado}. ${vivo ? "Esta página se recarrega sozinha a cada 15 segundos enquanto houver rodada ou cadeia da marca em curso." : "Rodada e cadeia da marca terminadas — a página parou de se recarregar."}
<b>Todos os horários são de Brasília</b> (UTC−3): os scripts declaram o fuso na própria linha do log e os arquivos .cmd já carimbam em hora local. Linha antiga, gravada antes dessa uniformização, vinha em UTC e é convertida aqui.
Uma fase só começa quando a anterior termina, e nenhuma delas para a rodada se falhar: o resumo no fim do log traz o código de saída de cada uma.
A cadeia da marca aparece em dois lugares porque tem dois caminhos: como fase 4 da rodada, e à parte — que é como a tarefa das 05:00 a dispara.</p>
</body></html>`;
}

async function main() {
  do {
    const html = render();
    fs.writeFileSync(SAIDA, html, "utf8");
    if (!LOOP) break;
    // só encerra quando as DUAS acabaram: a rodada pode terminar com a cadeia da marca ainda mastigando
    const tudo = ler(LOG_TUDO);
    const rodadaFim = /RODADA COMPLETA - FIM/.test(tudo.slice(tudo.lastIndexOf("===== RODADA COMPLETA - INICIO")));
    const cm = lerCadeiaMarca();
    if (rodadaFim && cm?.estado !== "rodando") break;
    await new Promise((s) => setTimeout(s, PASSO_MS));
  } while (LOOP);
  console.log(`painel escrito em ${SAIDA}`);
}
main();
