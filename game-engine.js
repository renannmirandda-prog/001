/*
  game-engine.js
  Regras, sistema de draft, simulação em tempo real, rankings e estatísticas.
*/

const FORMACOES = {
  "4-3-3": ["GOL","LD","ZAG","ZAG","LE","VOL","MC","MC","PE","ATA","PD"],
  "4-2-3-1": ["GOL","LD","ZAG","ZAG","LE","VOL","VOL","PE","MEI","PD","ATA"],
  "4-4-2": ["GOL","LD","ZAG","ZAG","LE","ME","MC","MC","MD","ATA","ATA"],
  "4-1-2-1-2": ["GOL","LD","ZAG","ZAG","LE","VOL","MC","MC","MEI","ATA","ATA"],
  "3-5-2": ["GOL","ZAG","ZAG","ZAG","ALA_E","MC","VOL","MC","ALA_D","ATA","ATA"],
  "3-4-3": ["GOL","ZAG","ZAG","ZAG","ALA_E","MC","MC","ALA_D","PE","ATA","PD"],
  "5-3-2": ["GOL","LD","ZAG","ZAG","ZAG","LE","VOL","MC","MC","ATA","ATA"],
  "5-4-1": ["GOL","LD","ZAG","ZAG","ZAG","LE","ME","MC","MC","MD","ATA"],
  "4-2-4": ["GOL","LD","ZAG","ZAG","LE","MC","MC","PE","ATA","ATA","PD"]
};

const COMPATIBILIDADE = {
  GOL:["GOL"],
  LD:["LD","ALA_D","ZAG"],
  LE:["LE","ALA_E","ZAG"],
  ZAG:["ZAG","LD","LE","VOL"],
  ALA_D:["ALA_D","LD","MD","PD"],
  ALA_E:["ALA_E","LE","ME","PE"],
  VOL:["VOL","MC","ZAG"],
  MC:["MC","VOL","MEI"],
  MEI:["MEI","MC","SA","PE","PD"],
  ME:["ME","PE","ALA_E","MC"],
  MD:["MD","PD","ALA_D","MC"],
  PE:["PE","PD","SA","ATA","MEI","ME"],
  PD:["PD","PE","SA","ATA","MEI","MD"],
  SA:["SA","ATA","MEI","PE","PD"],
  ATA:["ATA","SA","PE","PD"]
};

const VELOCIDADES = {"1x":900,"2x":500,"5x":200,"10x":80,instantaneo:0};

const FASES = [
  {fase:"Grupo - Jogo 1",min:76,max:84},
  {fase:"Grupo - Jogo 2",min:78,max:86},
  {fase:"Grupo - Jogo 3",min:80,max:88},
  {fase:"Oitavas",min:83,max:90},
  {fase:"Quartas",min:86,max:92},
  {fase:"Semifinal",min:88,max:94},
  {fase:"Final",min:90,max:96}
];

const state = {
  formacao:"4-3-3",
  estilo:"equilibrado",
  dificuldade:"normal",
  velocidade:"2x",
  rerolls:3,
  selecaoAtual:null,
  usados:new Set(),
  slots:[],
  time:{},
  rodadaDraft:0,
  forcaTime:0,
  jogoAtual:0,
  campanha:[],
  stats:{},
  intervalo:null,
  eliminado:false,
  campeaoAlternativo:null
};

const $ = id => document.getElementById(id);
const rand = (min,max) => Math.floor(Math.random()*(max-min+1))+min;
const choice = arr => arr[Math.floor(Math.random()*arr.length)];

function init() {
  const fs = $("formationSelect");
  Object.keys(FORMACOES).forEach(f => {
    const opt = document.createElement("option");
    opt.value = f; opt.textContent = f;
    fs.appendChild(opt);
  });

  $("startBtn").onclick = iniciarDraft;
  $("rerollBtn").onclick = reroll;
  $("finishDraftBtn").onclick = iniciarCopa;
  $("nextMatchBtn").onclick = proximaPartida;
  $("resetRankingBtn").onclick = () => { localStorage.removeItem("ranking_copa_draft"); alert("Ranking limpo."); };
}

function iniciarDraft() {
  state.formacao = $("formationSelect").value;
  state.estilo = $("styleSelect").value;
  state.dificuldade = $("difficultySelect").value;
  state.velocidade = $("speedSelect").value;
  state.rerolls = state.dificuldade === "normal" ? 3 : state.dificuldade === "dificil" ? 1 : 0;
  state.slots = FORMACOES[state.formacao].map((pos,i)=>({id:`slot_${i}`,pos}));
  state.time = {};
  state.usados = new Set();
  state.rodadaDraft = 0;
  state.stats = {};
  state.campanha = [];
  state.jogoAtual = 0;
  state.eliminado = false;
  state.campeaoAlternativo = null;

  $("draft").classList.remove("hidden");
  $("squad").classList.remove("hidden");
  $("tables").classList.remove("hidden");
  $("result").classList.add("hidden");
  $("match").classList.add("hidden");
  sortearSelecao();
  renderTudo();
}

function sortearSelecao() {
  const disponiveis = COPA_2026_BASE.filter(s => !state.usados.has(s.id));
  state.selecaoAtual = choice(disponiveis.length ? disponiveis : COPA_2026_BASE);
}

function reroll() {
  if (state.rerolls <= 0) return alert("Você não tem mais rerolls.");
  state.rerolls--;
  sortearSelecao();
  renderTudo();
}

function selecionarJogador(jogador) {
  const encaixe = encontrarMelhorSlot(jogador);
  if (!encaixe) return alert("Não tem posição compatível livre para esse jogador.");
  state.time[encaixe.id] = {...jogador, slot: encaixe.pos, slotId: encaixe.id};
  state.usados.add(state.selecaoAtual.id);
  state.rodadaDraft++;

  if (state.rodadaDraft < 11) sortearSelecao();
  renderTudo();
}

function posicoesJogador(j) {
  return j.posicao.split("/").map(p=>p.trim());
}

function ehCompativel(jogador, slotPos) {
  const naturais = posicoesJogador(jogador);
  if (naturais.includes(slotPos)) return {ok:true,penalidade:0};
  const ok = naturais.some(p => (COMPATIBILIDADE[p]||[]).includes(slotPos));
  return ok ? {ok:true,penalidade:3} : {ok:false,penalidade:10};
}

function encontrarMelhorSlot(jogador) {
  let melhor = null;
  for (const slot of state.slots) {
    if (state.time[slot.id]) continue;
    const c = ehCompativel(jogador, slot.pos);
    if (c.ok && (!melhor || c.penalidade < melhor.penalidade)) melhor = {...slot, penalidade:c.penalidade};
  }
  return melhor;
}

function calcularForcaTime() {
  const jogadores = Object.values(state.time);
  if (!jogadores.length) return 0;
  const media = jogadores.reduce((s,j)=>s+j.overall,0)/jogadores.length;
  const quimica = calcularQuimica(jogadores);
  const estiloBonus = state.estilo === "equilibrado" ? 2 : 1;
  const formBonus = ["4-2-3-1","4-3-3","4-1-2-1-2"].includes(state.formacao) ? 2 : 1;
  const penal = jogadores.reduce((s,j)=>s+ehCompativel(j,j.slot).penalidade,0)/3;
  return Math.round(media + quimica + estiloBonus + formBonus - penal);
}

function calcularQuimica(jogadores) {
  let q = 0;
  if (jogadores.some(j=>j.slot==="GOL" && j.posicao.includes("GOL"))) q++;
  if (jogadores.filter(j=>j.slot==="ZAG" && j.posicao.includes("ZAG")).length >= 2) q++;
  if (jogadores.some(j=>["VOL","MC"].includes(j.slot))) q++;
  if (jogadores.some(j=>["MEI","SA"].includes(j.slot))) q++;
  if (jogadores.some(j=>j.slot==="ATA" && j.posicao.includes("ATA"))) q++;
  return q;
}

function calcularForcaSelecao(selecao) {
  const titulares = selecao.jogadores.filter(j=>j.tipo==="titular_base");
  const reservas = selecao.jogadores.filter(j=>j.tipo==="reserva_principal");
  const m = arr => arr.reduce((s,j)=>s+j.overall,0)/Math.max(1,arr.length);
  return Math.round(m(titulares)*0.85 + m(reservas)*0.15);
}

function iniciarCopa() {
  state.forcaTime = calcularForcaTime();
  $("draft").classList.add("hidden");
  $("nextMatchBtn").disabled = false;
  state.jogoAtual = 0;
  proximaPartida();
}

function proximaPartida() {
  if (state.jogoAtual >= FASES.length) return finalizarCopa(true);
  const fase = FASES[state.jogoAtual];
  const adv = sortearAdversario(fase);
  const jogo = criarJogo(fase, adv);
  $("match").classList.remove("hidden");
  $("nextMatchBtn").disabled = true;
  iniciarPartidaTempoReal(jogo);
}

function sortearAdversario(fase) {
  const candidatos = COPA_2026_BASE.map(s=>({...s, forca:calcularForcaSelecao(s)}))
    .filter(s => s.forca >= fase.min && s.forca <= fase.max);
  return choice(candidatos.length ? candidatos : COPA_2026_BASE.map(s=>({...s, forca:calcularForcaSelecao(s)})));
}

function criarJogo(fase, adversario) {
  return {
    fase:fase.fase, adversario,
    minuto:0, placarPlayer:0, placarAdv:0,
    eventos:[],
    stats:{finPlayer:0, finAdv:0, possePlayer:50, posseAdv:50},
    timePlayer:Object.values(state.time),
    timeAdv:adversario.jogadores.filter(j=>j.tipo==="titular_base"),
    forcaPlayer:state.forcaTime,
    forcaAdv:calcularForcaSelecao(adversario)
  };
}

function iniciarPartidaTempoReal(jogo) {
  renderPartida(jogo);
  if (state.velocidade === "instantaneo") {
    while (jogo.minuto < 90) {
      jogo.minuto++;
      simularMinuto(jogo);
    }
    finalizarPartida(jogo);
    return;
  }
  clearInterval(state.intervalo);
  state.intervalo = setInterval(()=>{
    jogo.minuto++;
    simularMinuto(jogo);
    renderPartida(jogo);
    if (jogo.minuto >= 90) {
      clearInterval(state.intervalo);
      finalizarPartida(jogo);
    }
  }, VELOCIDADES[state.velocidade]);
}

function simularMinuto(jogo) {
  const chanceEvento = 0.20 + Math.abs(jogo.forcaPlayer-jogo.forcaAdv)/350;
  if (Math.random() > chanceEvento) return;

  const ladoPlayer = Math.random() < chanceAtaquePlayer(jogo);
  const lado = ladoPlayer ? "player" : "adv";
  const evento = gerarEvento(jogo, lado);
  jogo.eventos.unshift(evento);
}

function chanceAtaquePlayer(jogo) {
  let base = 0.5 + (jogo.forcaPlayer - jogo.forcaAdv)/100;
  if (state.estilo === "ofensivo") base += 0.06;
  if (state.estilo === "defensivo") base -= 0.04;
  return Math.max(0.25, Math.min(0.75, base));
}

function gerarEvento(jogo, lado) {
  const forcaAtq = lado === "player" ? jogo.forcaPlayer : jogo.forcaAdv;
  const forcaDef = lado === "player" ? jogo.forcaAdv : jogo.forcaPlayer;
  const chanceGol = Math.max(0.08, Math.min(0.34, 0.16 + (forcaAtq-forcaDef)/160));
  const r = Math.random();

  if (lado === "player") jogo.stats.finPlayer++; else jogo.stats.finAdv++;

  if (r < chanceGol) return gerarGol(jogo,lado);
  if (r < chanceGol + 0.15) return criarEvento(jogo,lado,"trave","Chute na trave");
  if (r < chanceGol + 0.35) return criarEvento(jogo,lado,"defesa","Grande defesa do goleiro");
  if (r < chanceGol + 0.75) return criarEvento(jogo,lado,"finalizacao","Finalização para fora");
  return criarEvento(jogo,lado,"cartao","Cartão amarelo");
}

const PESO_GOL = {GOL:0,ZAG:1,LD:1,LE:1,ALA_D:2,ALA_E:2,VOL:2,MC:3,ME:4,MD:4,MEI:6,PE:7,PD:7,SA:8,ATA:10};
const PESO_AST = {GOL:0,ZAG:1,LD:3,LE:3,ALA_D:5,ALA_E:5,VOL:3,MC:6,ME:6,MD:6,MEI:9,PE:8,PD:8,SA:6,ATA:3};

function weightedPlayer(jogadores, pesos, excluirNome=null) {
  const pool = [];
  jogadores.filter(j=>j.nome!==excluirNome).forEach(j=>{
    const pos = posicoesJogador(j)[0];
    const peso = (pesos[pos]||2) * Math.max(1, j.overall-74);
    for(let i=0;i<peso;i++) pool.push(j);
  });
  return choice(pool.length ? pool : jogadores);
}

function gerarGol(jogo,lado) {
  const time = lado === "player" ? jogo.timePlayer : jogo.timeAdv;
  const autor = weightedPlayer(time,PESO_GOL);
  const assist = Math.random() < 0.75 ? weightedPlayer(time,PESO_AST,autor.nome) : null;

  if (lado === "player") jogo.placarPlayer++; else jogo.placarAdv++;
  registrarGol(autor, lado === "player" ? "Seu Time" : jogo.adversario.pais);
  alterarNota(autor, lado === "player" ? "Seu Time" : jogo.adversario.pais, 1.2);
  if (assist) {
    registrarAssistencia(assist, lado === "player" ? "Seu Time" : jogo.adversario.pais);
    alterarNota(assist, lado === "player" ? "Seu Time" : jogo.adversario.pais, 0.8);
  }

  return {
    minuto:jogo.minuto,tipo:"gol",lado,
    texto: assist ? `${jogo.minuto}' GOL de ${autor.nome}, assistência de ${assist.nome}` : `${jogo.minuto}' GOL de ${autor.nome}`
  };
}

function criarEvento(jogo,lado,tipo,label) {
  const time = lado === "player" ? jogo.timePlayer : jogo.timeAdv;
  const jogador = weightedPlayer(time, tipo==="cartao" ? {GOL:0,ZAG:5,LD:4,LE:4,VOL:5,MC:3,MEI:2,ATA:1} : PESO_GOL);
  alterarNota(jogador, lado === "player" ? "Seu Time" : jogo.adversario.pais, tipo==="defesa" ? 0.25 : tipo==="cartao" ? -0.2 : 0.05);
  return {minuto:jogo.minuto,tipo,lado,texto:`${jogo.minuto}' ${label} — ${jogador.nome}`};
}

function statsKey(jogador,selecao) { return `${selecao}_${jogador.nome}`; }
function garantirStats(jogador,selecao) {
  const key = statsKey(jogador,selecao);
  if (!state.stats[key]) state.stats[key] = {nome:jogador.nome,selecao,posicao:jogador.posicao,overall:jogador.overall,gols:0,assistencias:0,notaTotal:0,jogos:0,notaMedia:6,notaPartida:6};
  return state.stats[key];
}
function registrarGol(j,s) { garantirStats(j,s).gols++; }
function registrarAssistencia(j,s) { garantirStats(j,s).assistencias++; }
function alterarNota(j,s,v) { garantirStats(j,s).notaPartida += v; }

function finalizarNotas(jogo) {
  [...jogo.timePlayer.map(j=>({...j,selecao:"Seu Time"})), ...jogo.timeAdv.map(j=>({...j,selecao:jogo.adversario.pais}))].forEach(j=>{
    const st = garantirStats(j,j.selecao);
    st.jogos++;
    st.notaPartida = Math.max(4,Math.min(10,st.notaPartida));
    st.notaTotal += st.notaPartida;
    st.notaMedia = +(st.notaTotal/st.jogos).toFixed(2);
    st.notaPartida = 6;
  });
}

function finalizarPartida(jogo) {
  finalizarNotas(jogo);

  if (state.jogoAtual >= 3 && jogo.placarPlayer === jogo.placarAdv) {
    const chance = Math.max(35, Math.min(70, 50 + (jogo.forcaPlayer-jogo.forcaAdv)*2));
    if (Math.random()*100 < chance) {
      jogo.resultado = "vitoria_penaltis";
      jogo.eventos.unshift({texto:`90'+ Vitória nos pênaltis`});
    } else {
      jogo.resultado = "derrota_penaltis";
      jogo.eventos.unshift({texto:`90'+ Derrota nos pênaltis`});
    }
  } else {
    jogo.resultado = jogo.placarPlayer > jogo.placarAdv ? "vitoria" : jogo.placarPlayer < jogo.placarAdv ? "derrota" : "empate";
  }

  state.campanha.push(jogo);
  renderPartida(jogo);
  renderTabelas();

  const perdeu = jogo.resultado === "derrota" || jogo.resultado === "derrota_penaltis";
  if (perdeu) {
    state.eliminado = true;
    simularRestoDaCopa(jogo.adversario);
    finalizarCopa(false);
    return;
  }
  state.jogoAtual++;
  if (state.jogoAtual >= FASES.length) finalizarCopa(true);
  else $("nextMatchBtn").disabled = false;
}

function simularRestoDaCopa(timeQueEliminou) {
  let candidatos = COPA_2026_BASE
    .filter(s=>s.id !== "player")
    .map(s=>({...s, forca:calcularForcaSelecao(s)}))
    .sort((a,b)=>b.forca-a.forca)
    .slice(0, 8);
  if (!candidatos.find(s=>s.id===timeQueEliminou.id)) candidatos[0] = {...timeQueEliminou, forca:calcularForcaSelecao(timeQueEliminou)};

  while(candidatos.length > 1) {
    const prox = [];
    for(let i=0;i<candidatos.length;i+=2) {
      const a = candidatos[i], b = candidatos[i+1] || candidatos[0];
      const vencedor = simularMaquina(a,b);
      prox.push(vencedor);
    }
    candidatos = prox;
  }
  state.campeaoAlternativo = candidatos[0];
}

function simularMaquina(a,b) {
  const fa = a.forca || calcularForcaSelecao(a);
  const fb = b.forca || calcularForcaSelecao(b);
  const golsA = Math.max(0, Math.round(Math.random()*2 + 1 + (fa-fb)/25));
  const golsB = Math.max(0, Math.round(Math.random()*2 + 1 + (fb-fa)/25));
  gerarStatsSelecao(a,golsA);
  gerarStatsSelecao(b,golsB);
  if (golsA > golsB) return a;
  if (golsB > golsA) return b;
  return Math.random() < (0.5 + (fa-fb)/100) ? a : b;
}

function gerarStatsSelecao(selecao,gols) {
  const titulares = selecao.jogadores.filter(j=>j.tipo==="titular_base");
  for(let i=0;i<gols;i++) {
    const autor = weightedPlayer(titulares,PESO_GOL);
    const assist = Math.random()<0.75 ? weightedPlayer(titulares,PESO_AST,autor.nome) : null;
    registrarGol(autor,selecao.pais);
    alterarNota(autor,selecao.pais,1.2);
    if (assist) { registrarAssistencia(assist,selecao.pais); alterarNota(assist,selecao.pais,0.8); }
  }
  titulares.forEach(j=>{
    const st = garantirStats(j,selecao.pais);
    st.jogos++;
    st.notaTotal += Math.max(4,Math.min(10,st.notaPartida));
    st.notaMedia = +(st.notaTotal/st.jogos).toFixed(2);
    st.notaPartida = 6;
  });
}

function rankingStats() {
  return Object.values(state.stats);
}
function topGols() { return rankingStats().sort((a,b)=>b.gols-a.gols || b.assistencias-a.assistencias || b.notaMedia-a.notaMedia).slice(0,10); }
function topAssists() { return rankingStats().sort((a,b)=>b.assistencias-a.assistencias || b.gols-a.gols || b.notaMedia-a.notaMedia).slice(0,10); }
function pontCraque(s) { return s.notaMedia*10 + s.gols*4 + s.assistencias*3 + (s.selecao===state.campeaoAlternativo?.pais?8:0); }
function topBest() { return rankingStats().sort((a,b)=>pontCraque(b)-pontCraque(a)).slice(0,10); }

function finalizarCopa(campeao) {
  clearInterval(state.intervalo);
  $("result").classList.remove("hidden");
  $("nextMatchBtn").disabled = true;
  if (campeao) state.campeaoAlternativo = {pais:"Seu Time"};

  const artilheiro = topGols()[0];
  const garcom = topAssists()[0];
  const melhor = topBest()[0];
  const melhorSeu = rankingStats().filter(s=>s.selecao==="Seu Time").sort((a,b)=>pontCraque(b)-pontCraque(a))[0];

  $("resultText").innerHTML = `
    <p><b>${campeao ? "🏆 Você foi campeão 7-0!" : "Você foi eliminado."}</b></p>
    <p>Campanha: ${state.campanha.map(j=>`${j.fase}: ${j.placarPlayer} x ${j.placarAdv} ${j.adversario.pais}`).join("<br>")}</p>
    <p><b>Campeão da Copa:</b> ${state.campeaoAlternativo?.pais || "Indefinido"}</p>
    <p><b>Artilheiro:</b> ${artilheiro ? `${artilheiro.nome} (${artilheiro.selecao}) — ${artilheiro.gols} gols` : "-"}</p>
    <p><b>Líder de assistências:</b> ${garcom ? `${garcom.nome} (${garcom.selecao}) — ${garcom.assistencias} assistências` : "-"}</p>
    <p><b>Melhor jogador da Copa:</b> ${melhor ? `${melhor.nome} (${melhor.selecao}) — nota ${melhor.notaMedia}` : "-"}</p>
    <p><b>Melhor do seu time:</b> ${melhorSeu ? `${melhorSeu.nome} — nota ${melhorSeu.notaMedia}` : "-"}</p>
  `;
  salvarRanking(campeao);
  renderTabelas();
}

function salvarRanking(campeao) {
  const ranking = JSON.parse(localStorage.getItem("ranking_copa_draft") || "[]");
  ranking.push({data:new Date().toLocaleString("pt-BR"),forca:state.forcaTime,campeao,jogos:state.campanha.length,formacao:state.formacao,estilo:state.estilo});
  ranking.sort((a,b)=>Number(b.campeao)-Number(a.campeao) || b.jogos-a.jogos || b.forca-a.forca);
  localStorage.setItem("ranking_copa_draft", JSON.stringify(ranking.slice(0,20)));
}

function renderTudo() {
  renderDraft();
  renderCampo();
  renderTabelas();
}

function renderDraft() {
  $("draftStatus").innerHTML = `Rodada ${state.rodadaDraft+1}/11 • Formação ${state.formacao} • Rerolls: ${state.rerolls}`;
  $("currentTeamTitle").textContent = `${state.selecaoAtual.pais} 2026 — Grupo ${state.selecaoAtual.grupo}`;
  $("playersList").innerHTML = state.selecaoAtual.jogadores.map(j=>{
    const encaixa = encontrarMelhorSlot(j);
    return `<div class="player">
      <strong>${j.nome}</strong>
      <small>${j.posicao} • ${j.tipo}</small>
      <div>Overall: <span class="overall">${j.overall}</span></div>
      <button ${!encaixa ? "disabled" : ""} onclick='selecionarJogadorPorId("${j.id}")'>Escolher ${encaixa ? "para " + encaixa.pos : ""}</button>
    </div>`;
  }).join("");
  $("finishDraftBtn").disabled = Object.keys(state.time).length < 11;
  $("rerollBtn").disabled = state.rerolls <= 0 || Object.keys(state.time).length >= 11;
}

function selecionarJogadorPorId(id) {
  const j = state.selecaoAtual.jogadores.find(x=>x.id===id);
  selecionarJogador(j);
}
window.selecionarJogadorPorId = selecionarJogadorPorId;

function renderCampo() {
  const power = calcularForcaTime();
  $("teamPower").textContent = `Força atual: ${power || "-"} • Jogadores: ${Object.keys(state.time).length}/11`;
  $("fieldSlots").innerHTML = state.slots.map(slot=>{
    const j = state.time[slot.id];
    return `<div class="slot"><b>${slot.pos}</b>${j ? `<strong>${j.nome}</strong><br><span class="overall">${j.overall}</span> <small>${j.posicao}</small>` : `<span class="empty">vazio</span>`}</div>`;
  }).join("");
}

function renderPartida(jogo) {
  $("matchPhase").textContent = jogo.fase;
  $("matchInfo").textContent = `Seu Time (${jogo.forcaPlayer}) x ${jogo.adversario.pais} (${jogo.forcaAdv})`;
  $("scoreText").textContent = `${jogo.placarPlayer} x ${jogo.placarAdv}`;
  $("minutePill").textContent = `${jogo.minuto}'`;
  $("shotsPill").textContent = `Finalizações ${jogo.stats.finPlayer} x ${jogo.stats.finAdv}`;
  const posse = Math.round(50 + (jogo.forcaPlayer-jogo.forcaAdv)/2 + (state.estilo==="ofensivo"?4:state.estilo==="defensivo"?-3:0));
  jogo.stats.possePlayer = Math.max(35,Math.min(65,posse));
  jogo.stats.posseAdv = 100-jogo.stats.possePlayer;
  $("possessionPill").textContent = `Posse ${jogo.stats.possePlayer}% x ${jogo.stats.posseAdv}%`;
  $("eventsList").innerHTML = jogo.eventos.map(e=>`<div class="event">${e.texto}</div>`).join("") || `<div class="event">A bola vai rolar...</div>`;
}

function renderTabelas() {
  $("scorersTable").innerHTML = tabela(topGols(), "gols");
  $("assistsTable").innerHTML = tabela(topAssists(), "assistencias");
  $("bestTable").innerHTML = tabela(topBest(), "notaMedia");
}
function tabela(lista, campo) {
  if (!lista.length) return "<p class='status'>Sem dados ainda.</p>";
  return `<table><thead><tr><th>#</th><th>Jogador</th><th>Sel.</th><th>${campo}</th></tr></thead><tbody>` +
    lista.map((s,i)=>`<tr><td>${i+1}</td><td>${s.nome}</td><td>${s.selecao}</td><td>${s[campo]}</td></tr>`).join("") +
    "</tbody></table>";
}

document.addEventListener("DOMContentLoaded", init);
