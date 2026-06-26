/*
  game-engine.js
  Regras, sistema de draft, campo visual, simulação em tempo real e rankings.
  Versão tela única: mostra só gols/assistências no feed principal.
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

const VELOCIDADES = {
  "1x": 900,
  "2x": 500,
  "5x": 200,
  "10x": 80,
  instantaneo: 0
};

const FASES = [
  { fase:"Grupo 1", min:76, max:84 },
  { fase:"Grupo 2", min:78, max:86 },
  { fase:"Grupo 3", min:80, max:88 },
  { fase:"Oitavas", min:83, max:90 },
  { fase:"Quartas", min:86, max:92 },
  { fase:"Semifinal", min:88, max:94 },
  { fase:"Final", min:90, max:96 }
];

const PESO_GOL = {
  GOL:0,
  ZAG:1,
  LD:1,
  LE:1,
  ALA_D:2,
  ALA_E:2,
  VOL:2,
  MC:3,
  ME:4,
  MD:4,
  MEI:6,
  PE:7,
  PD:7,
  SA:8,
  ATA:10
};

const PESO_AST = {
  GOL:0,
  ZAG:1,
  LD:3,
  LE:3,
  ALA_D:5,
  ALA_E:5,
  VOL:3,
  MC:6,
  ME:6,
  MD:6,
  MEI:9,
  PE:8,
  PD:8,
  SA:6,
  ATA:3
};

const state = {
  formacao:"4-3-3",
  estilo:"equilibrado",
  dificuldade:"normal",
  velocidade:"2x",
  rerolls:0,
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
  campeaoAlternativo:null,
  modoTela:"time",
  simulando:false
};

const $ = id => document.getElementById(id);
const choice = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (n,min,max) => Math.max(min, Math.min(max, n));

function init() {
  const fs = $("formationSelect");

  Object.keys(FORMACOES).forEach(f => {
    const opt = document.createElement("option");
    opt.value = f;
    opt.textContent = f;
    fs.appendChild(opt);
  });

  $("startBtn").onclick = iniciarDraft;
  $("rerollBtn").onclick = reroll;
  $("finishDraftBtn").onclick = iniciarCopa;

  $("resetRankingBtn").onclick = () => {
    localStorage.removeItem("ranking_copa_draft");
    alert("Ranking local limpo.");
  };

  $("tabTeamBtn").onclick = () => {
    state.modoTela = "time";
    renderPainelDireito();
  };

  $("tabGoalsBtn").onclick = () => {
    state.modoTela = "gols";
    renderPainelDireito();
  };

  $("tabAstBtn").onclick = () => {
    state.modoTela = "assist";
    renderPainelDireito();
  };

  montarSlotsPreview();
  renderTudo();
}

function iniciarDraft() {
  clearInterval(state.intervalo);

  state.formacao = $("formationSelect").value;
  state.estilo = $("styleSelect").value;
  state.dificuldade = $("difficultySelect").value;
  state.velocidade = $("speedSelect").value;

  state.rerolls =
    state.dificuldade === "normal" ? 3 :
    state.dificuldade === "dificil" ? 1 :
    0;

  state.slots = FORMACOES[state.formacao].map((pos,i) => ({
    id:`slot_${i}`,
    pos
  }));

  state.time = {};
  state.usados = new Set();
  state.rodadaDraft = 0;
  state.forcaTime = 0;
  state.jogoAtual = 0;
  state.campanha = [];
  state.stats = {};
  state.campeaoAlternativo = null;
  state.simulando = false;
  state.modoTela = "time";

  $("scoreText").textContent = "0 x 0";
  $("matchPhase").textContent = "Draft";
  $("minutePill").textContent = "0'";
  $("shotsPill").textContent = "Finalizações 0 x 0";
  $("opponentName").innerHTML = 'Adversário<small id="matchInfo">-</small>';
  $("goalFeed").textContent = "Monte seu time escolhendo 1 jogador por seleção sorteada.";

  sortearSelecao();
  renderTudo();
}

function montarSlotsPreview() {
  state.slots = FORMACOES[state.formacao].map((pos,i) => ({
    id:`slot_${i}`,
    pos
  }));
}

function sortearSelecao() {
  const disponiveis = COPA_2026_BASE.filter(s => !state.usados.has(s.id));
  state.selecaoAtual = choice(disponiveis.length ? disponiveis : COPA_2026_BASE);
}

function reroll() {
  if (state.simulando) return;

  if (state.rerolls <= 0) {
    return alert("Você não tem mais rerolls.");
  }

  state.rerolls--;
  sortearSelecao();
  renderTudo();
}

function selecionarJogadorPorId(id) {
  if (state.simulando) return;

  const jogador = state.selecaoAtual.jogadores.find(j => j.id === id);
  const encaixe = encontrarMelhorSlot(jogador);

  if (!encaixe) {
    return alert("Não tem posição compatível livre para esse jogador.");
  }

  state.time[encaixe.id] = {
    ...jogador,
    slot: encaixe.pos,
    slotId: encaixe.id
  };

  state.usados.add(state.selecaoAtual.id);
  state.rodadaDraft++;

  if (state.rodadaDraft < 11) {
    sortearSelecao();
  }

  renderTudo();
}

window.selecionarJogadorPorId = selecionarJogadorPorId;

function posicoesJogador(j) {
  return j.posicao.split("/").map(p => p.trim());
}

function ehCompativel(jogador, slotPos) {
  const naturais = posicoesJogador(jogador);

  if (naturais.includes(slotPos)) {
    return { ok:true, penalidade:0 };
  }

  const ok = naturais.some(p => (COMPATIBILIDADE[p] || []).includes(slotPos));

  return ok
    ? { ok:true, penalidade:3 }
    : { ok:false, penalidade:10 };
}

function encontrarMelhorSlot(jogador) {
  let melhor = null;

  for (const slot of state.slots) {
    if (state.time[slot.id]) continue;

    const c = ehCompativel(jogador, slot.pos);

    if (c.ok && (!melhor || c.penalidade < melhor.penalidade)) {
      melhor = {
        ...slot,
        penalidade:c.penalidade
      };
    }
  }

  return melhor;
}

function calcularForcaTime() {
  const jogadores = Object.values(state.time);

  if (!jogadores.length) return 0;

  const media = jogadores.reduce((s,j) => s + j.overall, 0) / jogadores.length;
  const quimica = calcularQuimica(jogadores);

  const estiloBonus = state.estilo === "equilibrado" ? 2 : 1;

  const formBonus = ["4-2-3-1","4-3-3","4-1-2-1-2"].includes(state.formacao)
    ? 2
    : 1;

  const penal = jogadores.reduce((s,j) => {
    return s + ehCompativel(j,j.slot).penalidade;
  }, 0) / 3;

  return Math.round(media + quimica + estiloBonus + formBonus - penal);
}

function calcularQuimica(jogadores) {
  let q = 0;

  if (jogadores.some(j => j.slot === "GOL" && j.posicao.includes("GOL"))) q++;

  if (jogadores.filter(j => j.slot === "ZAG" && j.posicao.includes("ZAG")).length >= 2) q++;

  if (jogadores.some(j => ["VOL","MC"].includes(j.slot))) q++;

  if (jogadores.some(j => ["MEI","SA"].includes(j.slot))) q++;

  if (jogadores.some(j => j.slot === "ATA" && j.posicao.includes("ATA"))) q++;

  return q;
}

function calcularForcaSelecao(selecao) {
  const titulares = selecao.jogadores.filter(j => j.tipo === "titular_base");
  const reservas = selecao.jogadores.filter(j => j.tipo === "reserva_principal");

  const media = arr => {
    return arr.reduce((s,j) => s + j.overall, 0) / Math.max(1, arr.length);
  };

  return Math.round(media(titulares) * 0.85 + media(reservas) * 0.15);
}

function iniciarCopa() {
  if (Object.keys(state.time).length < 11) return;

  state.simulando = true;
  state.forcaTime = calcularForcaTime();
  state.jogoAtual = 0;
  state.modoTela = "gols";

  $("leftTitle").textContent = "Copa";
  $("currentTeamTitle").textContent = "Simulação";
  $("playersList").innerHTML = "";
  $("rerollBtn").disabled = true;
  $("finishDraftBtn").disabled = true;

  proximaPartida();
}

function proximaPartida() {
  if (state.jogoAtual >= FASES.length) {
    return finalizarCopa(true);
  }

  const fase = FASES[state.jogoAtual];
  const adv = sortearAdversario(fase);
  const jogo = criarJogo(fase, adv);

  iniciarPartidaTempoReal(jogo);
}

function sortearAdversario(fase) {
  const candidatos = COPA_2026_BASE
    .map(s => ({
      ...s,
      forca: calcularForcaSelecao(s)
    }))
    .filter(s => s.forca >= fase.min && s.forca <= fase.max);

  return choice(
    candidatos.length
      ? candidatos
      : COPA_2026_BASE.map(s => ({
          ...s,
          forca: calcularForcaSelecao(s)
        }))
  );
}

function criarJogo(fase, adversario) {
  return {
    fase:fase.fase,
    adversario,
    minuto:0,
    placarPlayer:0,
    placarAdv:0,
    golsFeed:[],
    stats:{
      finPlayer:0,
      finAdv:0
    },
    timePlayer:Object.values(state.time),
    timeAdv:adversario.jogadores.filter(j => j.tipo === "titular_base"),
    forcaPlayer:state.forcaTime,
    forcaAdv:calcularForcaSelecao(adversario)
  };
}

function iniciarPartidaTempoReal(jogo) {
  renderPartida(jogo);

  $("playersList").innerHTML = `
    <div class="status-line">
      <b>${jogo.fase}</b><br>
      Seu Time (${jogo.forcaPlayer}) x ${jogo.adversario.pais} (${jogo.forcaAdv})<br><br>
      Tempo correndo. O feed mostra apenas gols e assistências.
    </div>
  `;

  if (state.velocidade === "instantaneo") {
    while (jogo.minuto < 90) {
      jogo.minuto++;
      simularMinuto(jogo);
    }

    finalizarPartida(jogo);
    return;
  }

  clearInterval(state.intervalo);

  state.intervalo = setInterval(() => {
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
  const chanceEvento = 0.20 + Math.abs(jogo.forcaPlayer - jogo.forcaAdv) / 350;

  if (Math.random() > chanceEvento) return;

  const ladoPlayer = Math.random() < chanceAtaquePlayer(jogo);
  const lado = ladoPlayer ? "player" : "adv";

  gerarEvento(jogo, lado);
}

function chanceAtaquePlayer(jogo) {
  let base = 0.5 + (jogo.forcaPlayer - jogo.forcaAdv) / 100;

  if (state.estilo === "ofensivo") base += 0.06;
  if (state.estilo === "defensivo") base -= 0.04;

  return clamp(base, 0.25, 0.75);
}

function gerarEvento(jogo, lado) {
  const forcaAtq = lado === "player" ? jogo.forcaPlayer : jogo.forcaAdv;
  const forcaDef = lado === "player" ? jogo.forcaAdv : jogo.forcaPlayer;

  const chanceGol = clamp(0.16 + (forcaAtq - forcaDef) / 160, 0.08, 0.34);
  const r = Math.random();

  if (lado === "player") {
    jogo.stats.finPlayer++;
  } else {
    jogo.stats.finAdv++;
  }

  if (r < chanceGol) {
    gerarGol(jogo, lado);
  }
}

function weightedPlayer(jogadores, pesos, excluirNome = null) {
  const pool = [];

  jogadores
    .filter(j => j.nome !== excluirNome)
    .forEach(j => {
      const pos = posicoesJogador(j)[0];
      const peso = (pesos[pos] || 2) * Math.max(1, j.overall - 74);

      for (let i = 0; i < peso; i++) {
        pool.push(j);
      }
    });

  return choice(pool.length ? pool : jogadores);
}

function gerarGol(jogo, lado) {
  const time = lado === "player" ? jogo.timePlayer : jogo.timeAdv;
  const selecao = lado === "player" ? "Seu Time" : jogo.adversario.pais;

  const autor = weightedPlayer(time, PESO_GOL);
  const assist = Math.random() < 0.75
    ? weightedPlayer(time, PESO_AST, autor.nome)
    : null;

  if (lado === "player") {
    jogo.placarPlayer++;
  } else {
    jogo.placarAdv++;
  }

  registrarGol(autor, selecao);
  alterarNota(autor, selecao, 1.2);

  if (assist) {
    registrarAssistencia(assist, selecao);
    alterarNota(assist, selecao, 0.8);
  }

  const texto = assist
    ? `${jogo.minuto}' GOL - ${autor.nome}; AC: ${assist.nome}`
    : `${jogo.minuto}' GOL - ${autor.nome}`;

  jogo.golsFeed.unshift({
    lado,
    texto
  });
}

function statsKey(jogador, selecao) {
  return `${selecao}_${jogador.nome}`;
}

function garantirStats(jogador, selecao) {
  const key = statsKey(jogador, selecao);

  if (!state.stats[key]) {
    state.stats[key] = {
      nome:jogador.nome,
      selecao,
      posicao:jogador.posicao,
      overall:jogador.overall,
      gols:0,
      assistencias:0,
      notaTotal:0,
      jogos:0,
      notaMedia:6,
      notaPartida:6
    };
  }

  return state.stats[key];
}

function registrarGol(j, s) {
  garantirStats(j, s).gols++;
}

function registrarAssistencia(j, s) {
  garantirStats(j, s).assistencias++;
}

function alterarNota(j, s, v) {
  garantirStats(j, s).notaPartida += v;
}

function finalizarNotas(jogo) {
  [
    ...jogo.timePlayer.map(j => ({
      ...j,
      selecao:"Seu Time"
    })),
    ...jogo.timeAdv.map(j => ({
      ...j,
      selecao:jogo.adversario.pais
    }))
  ].forEach(j => {
    const st = garantirStats(j, j.selecao);

    st.jogos++;
    st.notaPartida = clamp(st.notaPartida, 4, 10);
    st.notaTotal += st.notaPartida;
    st.notaMedia = +(st.notaTotal / st.jogos).toFixed(2);
    st.notaPartida = 6;
  });
}

function finalizarPartida(jogo) {
  finalizarNotas(jogo);

  if (state.jogoAtual >= 3 && jogo.placarPlayer === jogo.placarAdv) {
    const chance = clamp(50 + (jogo.forcaPlayer - jogo.forcaAdv) * 2, 35, 70);

    if (Math.random() * 100 < chance) {
      jogo.resultado = "vitoria_penaltis";
      jogo.golsFeed.unshift({
        lado:"player",
        texto:`90'+ Vitória nos pênaltis`
      });
    } else {
      jogo.resultado = "derrota_penaltis";
      jogo.golsFeed.unshift({
        lado:"adv",
        texto:`90'+ Derrota nos pênaltis`
      });
    }
  } else {
    jogo.resultado =
      jogo.placarPlayer > jogo.placarAdv ? "vitoria" :
      jogo.placarPlayer < jogo.placarAdv ? "derrota" :
      "empate";
  }

  state.campanha.push(jogo);

  renderPartida(jogo);
  renderPainelDireito();

  const perdeu =
    jogo.resultado === "derrota" ||
    jogo.resultado === "derrota_penaltis";

  if (perdeu) {
    simularRestoDaCopa(jogo.adversario);
    finalizarCopa(false);
    return;
  }

  state.jogoAtual++;

  if (state.jogoAtual >= FASES.length) {
    finalizarCopa(true);
  } else {
    setTimeout(proximaPartida, 1350);
  }
}

function simularRestoDaCopa(timeQueEliminou) {
  let candidatos = COPA_2026_BASE
    .map(s => ({
      ...s,
      forca:calcularForcaSelecao(s)
    }))
    .sort((a,b) => b.forca - a.forca)
    .slice(0, 8);

  if (!candidatos.find(s => s.id === timeQueEliminou.id)) {
    candidatos[0] = {
      ...timeQueEliminou,
      forca:calcularForcaSelecao(timeQueEliminou)
    };
  }

  while (candidatos.length > 1) {
    const prox = [];

    for (let i = 0; i < candidatos.length; i += 2) {
      const a = candidatos[i];
      const b = candidatos[i + 1] || candidatos[0];

      prox.push(simularMaquina(a, b));
    }

    candidatos = prox;
  }

  state.campeaoAlternativo = candidatos[0];
}

function simularMaquina(a, b) {
  const fa = a.forca || calcularForcaSelecao(a);
  const fb = b.forca || calcularForcaSelecao(b);

  const golsA = Math.max(0, Math.round(Math.random() * 2 + 1 + (fa - fb) / 25));
  const golsB = Math.max(0, Math.round(Math.random() * 2 + 1 + (fb - fa) / 25));

  gerarStatsSelecao(a, golsA);
  gerarStatsSelecao(b, golsB);

  if (golsA > golsB) return a;
  if (golsB > golsA) return b;

  return Math.random() < (0.5 + (fa - fb) / 100) ? a : b;
}

function gerarStatsSelecao(selecao, gols) {
  const titulares = selecao.jogadores.filter(j => j.tipo === "titular_base");

  for (let i = 0; i < gols; i++) {
    const autor = weightedPlayer(titulares, PESO_GOL);
    const assist = Math.random() < 0.75
      ? weightedPlayer(titulares, PESO_AST, autor.nome)
      : null;

    registrarGol(autor, selecao.pais);
    alterarNota(autor, selecao.pais, 1.2);

    if (assist) {
      registrarAssistencia(assist, selecao.pais);
      alterarNota(assist, selecao.pais, 0.8);
    }
  }

  titulares.forEach(j => {
    const st = garantirStats(j, selecao.pais);

    st.jogos++;
    st.notaTotal += clamp(st.notaPartida, 4, 10);
    st.notaMedia = +(st.notaTotal / st.jogos).toFixed(2);
    st.notaPartida = 6;
  });
}

function rankingStats() {
  return Object.values(state.stats);
}

function topGols() {
  return rankingStats()
    .sort((a,b) =>
      b.gols - a.gols ||
      b.assistencias - a.assistencias ||
      b.notaMedia - a.notaMedia
    )
    .slice(0, 12);
}

function topAssists() {
  return rankingStats()
    .sort((a,b) =>
      b.assistencias - a.assistencias ||
      b.gols - a.gols ||
      b.notaMedia - a.notaMedia
    )
    .slice(0, 12);
}

function pontCraque(s) {
  return (
    s.notaMedia * 10 +
    s.gols * 4 +
    s.assistencias * 3 +
    (s.selecao === state.campeaoAlternativo?.pais ? 8 : 0)
  );
}

function topBest() {
  return rankingStats()
    .sort((a,b) => pontCraque(b) - pontCraque(a))
    .slice(0, 12);
}

function finalizarCopa(campeao) {
  clearInterval(state.intervalo);

  if (campeao) {
    state.campeaoAlternativo = {
      pais:"Seu Time"
    };
  }

  const artilheiro = topGols()[0];
  const garcom = topAssists()[0];
  const melhor = topBest()[0];

  $("matchPhase").textContent = campeao ? "Campeão" : "Eliminado";
  $("minutePill").textContent = "Fim";

  $("goalFeed").innerHTML = `
    ${campeao ? "🏆 Você venceu a Copa!" : "Fim da campanha."}
    Campeão: ${state.campeaoAlternativo?.pais || "-"} •
    Artilheiro: ${artilheiro ? `${artilheiro.nome} ${artilheiro.gols}G` : "-"} •
    Assistente: ${garcom ? `${garcom.nome} ${garcom.assistencias}A` : "-"} •
    Melhor: ${melhor ? `${melhor.nome} (${melhor.selecao})` : "-"}
  `;

  $("playersList").innerHTML = `
    <div class="status-line">
      <b>${campeao ? "🏆 CAMPEÃO 7-0" : "ELIMINADO"}</b><br><br>
      ${state.campanha.map(j =>
        `${j.fase}: Seu Time ${j.placarPlayer} x ${j.placarAdv} ${j.adversario.pais}`
      ).join("<br>")}
      <br><br>
      <b>Campeão da Copa:</b> ${state.campeaoAlternativo?.pais || "-"}<br>
      <b>Melhor jogador:</b> ${melhor ? `${melhor.nome} (${melhor.selecao})` : "-"}<br>
      <b>Artilheiro:</b> ${artilheiro ? `${artilheiro.nome} - ${artilheiro.gols}` : "-"}<br>
      <b>Garçom:</b> ${garcom ? `${garcom.nome} - ${garcom.assistencias}` : "-"}
    </div>
  `;

  salvarRanking(campeao);
  renderPainelDireito();
}

function salvarRanking(campeao) {
  const ranking = JSON.parse(localStorage.getItem("ranking_copa_draft") || "[]");

  ranking.push({
    data:new Date().toLocaleString("pt-BR"),
    forca:state.forcaTime,
    campeao,
    jogos:state.campanha.length,
    formacao:state.formacao,
    estilo:state.estilo
  });

  ranking.sort((a,b) =>
    Number(b.campeao) - Number(a.campeao) ||
    b.jogos - a.jogos ||
    b.forca - a.forca
  );

  localStorage.setItem("ranking_copa_draft", JSON.stringify(ranking.slice(0,20)));
}

function renderTudo() {
  renderDraft();
  renderCampo();
  renderPainelDireito();
}

function renderDraft() {
  if (!state.selecaoAtual) {
    $("draftStatus").textContent = "Clique em Novo jogo";
    $("playersList").innerHTML = "<div class='status-line'>O sorteio aparece aqui.</div>";
    return;
  }

  $("leftTitle").textContent = state.simulando ? "Copa" : "Sorteio";

  $("draftStatus").innerHTML = state.simulando
    ? "Simulação em andamento"
    : `Rodada ${state.rodadaDraft + 1}/11 • ${state.formacao}`;

  $("rerollPill").textContent = `Reroll ${state.rerolls}`;

  $("currentTeamTitle").textContent =
    `${state.selecaoAtual.pais} 2026 • Grupo ${state.selecaoAtual.grupo}`;

  if (!state.simulando) {
    $("playersList").innerHTML = state.selecaoAtual.jogadores.map(j => {
      const encaixa = encontrarMelhorSlot(j);

      return `
        <div class="player-card">
          <div>
            <strong>${j.nome}</strong>
            <small>${j.posicao} • ${j.tipo === "titular_base" ? "Titular" : "Reserva"}</small>
          </div>
          <div class="ov">${j.overall}</div>
          <button ${!encaixa ? "disabled" : ""} onclick='selecionarJogadorPorId("${j.id}")'>
            ${encaixa ? `Escolher em ${encaixa.pos}` : "Sem posição"}
          </button>
        </div>
      `;
    }).join("");
  }

  $("finishDraftBtn").disabled =
    Object.keys(state.time).length < 11 || state.simulando;

  $("rerollBtn").disabled =
    state.rerolls <= 0 ||
    Object.keys(state.time).length >= 11 ||
    state.simulando;
}

function fieldCoordinates() {
  const slots = state.slots;

  const lines = {
    GOL: [],
    DEF: [],
    MID: [],
    ATK: []
  };

  const defSet = ["LD","LE","ZAG","ALA_D","ALA_E"];
  const midSet = ["VOL","MC","MEI","ME","MD"];
  const atkSet = ["PE","PD","SA","ATA"];

  slots.forEach(slot => {
    if (slot.pos === "GOL") {
      lines.GOL.push(slot);
    } else if (defSet.includes(slot.pos)) {
      lines.DEF.push(slot);
    } else if (midSet.includes(slot.pos)) {
      lines.MID.push(slot);
    } else if (atkSet.includes(slot.pos)) {
      lines.ATK.push(slot);
    }
  });

  function spread(arr, y) {
    const n = arr.length;

    return arr.map((slot,i) => ({
      ...slot,
      x: n === 1 ? 50 : 18 + i * (64 / (n - 1)),
      y
    }));
  }

  return [
    ...spread(lines.GOL, 91),
    ...spread(lines.DEF, 74),
    ...spread(lines.MID, 52),
    ...spread(lines.ATK, 28)
  ];
}

function renderCampo() {
  if (!state.slots.length) {
    montarSlotsPreview();
  }

  const coords = fieldCoordinates();

  $("fieldSlots").innerHTML = coords.map(slot => {
    const j = state.time[slot.id];

    const ov = j ? j.overall : slot.pos;
    const nome = j ? abreviarNome(j.nome) : slot.pos;

    return `
      <div class="slot-chip ${j ? "" : "empty"}" style="left:${slot.x}%;top:${slot.y}%">
        <div class="circle">${ov}</div>
        <div class="name">${nome}</div>
      </div>
    `;
  }).join("");

  const power = calcularForcaTime();

  $("teamPower").textContent = `Força ${power || "-"} • ${Object.keys(state.time).length}/11`;

  $("smallStatus").textContent =
    `${Object.keys(state.time).length}/11 jogadores • ${state.formacao} • ${state.estilo}`;
}

function abreviarNome(nome) {
  const partes = nome.split(" ");

  if (nome.length <= 13) return nome;
  if (partes.length === 1) return nome;

  return partes[0][0] + ". " + partes[partes.length - 1];
}

function renderPartida(jogo) {
  $("matchPhase").textContent = jogo.fase;

  $("opponentName").innerHTML =
    `${jogo.adversario.pais}<small id="matchInfo">Força ${jogo.forcaAdv}</small>`;

  $("scoreText").textContent = `${jogo.placarPlayer} x ${jogo.placarAdv}`;
  $("minutePill").textContent = `${jogo.minuto}'`;
  $("shotsPill").textContent = `Finalizações ${jogo.stats.finPlayer} x ${jogo.stats.finAdv}`;

  $("goalFeed").innerHTML = jogo.golsFeed.length
    ? jogo.golsFeed.slice(0,2).map(g => g.texto).join("<br>")
    : "Tempo passando... sem gols até agora.";
}

function renderPainelDireito() {
  if (state.modoTela === "gols") {
    $("teamList").innerHTML = tabelaRanking(topGols(), "gols");
    $("tablesBox").innerHTML = tabelaRanking(topBest(), "notaMedia", "Melhores");
    return;
  }

  if (state.modoTela === "assist") {
    $("teamList").innerHTML = tabelaRanking(topAssists(), "assistencias");
    $("tablesBox").innerHTML = tabelaRanking(topGols(), "gols", "Artilharia");
    return;
  }

  const ordered = state.slots.map(slot => ({
    slot,
    j:state.time[slot.id]
  }));

  $("teamList").innerHTML = ordered.map(({slot,j}) => `
    <div class="team-row">
      <b>${slot.pos}</b>
      <div>
        ${j
          ? `<strong>${j.nome}</strong><small>${j.posicao}</small>`
          : `<strong>Vazio</strong><small>aguardando</small>`
        }
      </div>
      <div class="ov" style="width:30px;height:30px;font-size:12px">
        ${j ? j.overall : "-"}
      </div>
    </div>
  `).join("");

  const ranking = JSON.parse(localStorage.getItem("ranking_copa_draft") || "[]").slice(0,5);

  $("tablesBox").innerHTML = ranking.length
    ? `
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Campanha</th>
            <th>Força</th>
          </tr>
        </thead>
        <tbody>
          ${ranking.map((r,i) => `
            <tr>
              <td>${i + 1}</td>
              <td>
                ${r.campeao ? "Campeão" : r.jogos + " jogos"}<br>
                <small>${r.formacao}</small>
              </td>
              <td>${r.forca}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `
    : "<div class='status-line'>Ranking local vazio.</div>";
}

function tabelaRanking(lista, campo, titulo = "") {
  if (!lista.length) {
    return "<div class='status-line'>Sem estatísticas ainda.</div>";
  }

  return `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Jogador</th>
          <th>Sel.</th>
          <th>${campo}</th>
        </tr>
      </thead>
      <tbody>
        ${lista.map((s,i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${s.nome}</td>
            <td>${s.selecao}</td>
            <td>${s[campo]}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

document.addEventListener("DOMContentLoaded", init);
