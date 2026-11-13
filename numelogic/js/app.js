/**
 * app.js - Interfície i flux del joc.
 */
(function () {
  'use strict';

  const { Validator: V, Generator: G, GameStorage: S } = window;

  const RANKS = [
    { name: 'Principiant', pct: 0 },
    { name: 'Calculador', pct: 10 },
    { name: 'Àgil', pct: 25 },
    { name: 'Matemàtic', pct: 50 },
    { name: 'Geni Numèric', pct: 75 },
    { name: 'Pitagòric', pct: 100 },
  ];

  const $ = (id) => document.getElementById(id);
  const el = {
    target: $('target'), maxOps: $('max-ops'), expression: $('expression'), preview: $('preview'),
    numbers: $('numbers'), toasts: $('toasts'), loading: $('loading'),
    rankName: $('rank-name'), score: $('score'), fill: $('progress-fill'),
    marks: $('progress-marks'), nextRank: $('next-rank'),
    foundCount: $('found-count'), totalCount: $('total-count'), list: $('solutions-list'), empty: $('solutions-empty'),
    tabDaily: $('tab-daily'), tabRandom: $('tab-random'), btnNew: $('btn-new'),
    sortTime: $('sort-time'), sortPoints: $('sort-points'), help: $('help-dialog'),
    allDialog: $('all-dialog'), allSummary: $('all-summary'), allList: $('all-list'),
  };

  let game = null;       // partida en curs
  let solutions = [];    // totes les solucions possibles del repte actual
  let tokens = [];       // expressió en construcció
  let sortMode = 'time'; // 'time' | 'points'
  let busy = false;
  let level = 'easy';    // 'easy' | 'medium' | 'hard' (operadors)
  let age = '1';         // '1' | '2' | '3' | '4' (curs de primària)

  /* ---------- Partides ---------- */

  function gameId(mode) {
    const base = mode === 'daily' ? 'daily-' + G.todayKey() : 'random';
    return `${base}-${level}-${age}`;
  }

  function loadOrCreate(mode, forceNew = false) {
    const id = gameId(mode);
    let g = forceNew ? null : S.loadGame(id);
    // Les partides desades amb un límit d'operacions diferent s'han de regenerar.
    if (g && g.challenge.maxOps !== G.maxOpsFor(level, age)) g = null;
    if (!g) {
      const challenge = mode === 'daily' ? G.generateDaily(new Date(), level, age) : G.generateRandom(level, age);
      g = { id, mode, challenge, found: [], score: 0 };
      S.saveGame(g);
    }
    g.challenge.ops = g.challenge.ops || V.OPS;
    g.challenge.maxOps = g.challenge.maxOps || G.MAX_OPS;
    syncWithSolutions(g);
    return g;
  }

  /**
   * Calcula la llista completa de solucions (la mateixa que mostra "Veure solucions") i hi ajusta
   * la partida: total, puntuació de referència i solucions trobades (sense duplicats ni alienes a la llista).
   */
  function syncWithSolutions(g) {
    solutions = G.listSolutions(g.challenge);
    if (solutions.length === 0) return;

    const valid = new Set(solutions.map((s) => s.key));
    const seen = new Set();
    const found = g.found.filter((f) => {
      const key = V.keyOf(f.expression);
      if (!valid.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const score = found.reduce((sum, f) => sum + f.points, 0);
    const ref = solutions.reduce((sum, s) => sum + s.points, 0);

    const changed = found.length !== g.found.length || score !== g.score ||
      ref !== g.challenge.ref || solutions.length !== g.challenge.solutionCount;
    g.found = found;
    g.score = score;
    g.challenge.ref = ref;
    g.challenge.solutionCount = solutions.length;
    if (changed) S.saveGame(g);
  }

  /** Genera/carrega una partida deixant que el navegador pinti l'indicador de càrrega. */
  function startGame(mode, forceNew = false) {
    if (busy) return;
    busy = true;
    el.loading.hidden = false;
    setTimeout(() => {
      try {
        game = loadOrCreate(mode, forceNew);
        tokens = [];
        S.saveMeta({ ...S.loadMeta(), mode, level, age });
        if (mode === 'daily') S.pruneDaily(game.id);
        renderAll();
      } finally {
        el.loading.hidden = true;
        busy = false;
      }
    }, 30);
  }

  /* ---------- Rangs i progrés ---------- */

  function rankIndex(score, ref) {
    let idx = 0;
    RANKS.forEach((r, i) => { if (score >= (r.pct / 100) * ref) idx = i; });
    return idx;
  }

  function renderProgress() {
    const { ref } = game.challenge;
    const idx = rankIndex(game.score, ref);
    const pct = Math.min(100, (game.score / ref) * 100);

    el.rankName.textContent = RANKS[idx].name;
    el.score.textContent = `${game.score} ${game.score === 1 ? 'punt' : 'punts'}`;
    el.fill.style.width = pct + '%';

    el.marks.replaceChildren(...RANKS.map((r, i) => {
      const m = document.createElement('span');
      m.className = 'mark' + (i <= idx ? ' reached' : '');
      m.style.left = r.pct + '%';
      m.title = r.name;
      return m;
    }));

    if (idx < RANKS.length - 1) {
      const next = RANKS[idx + 1];
      const missing = Math.ceil((next.pct / 100) * ref - game.score);
      el.nextRank.textContent = `${next.name}: ${Math.max(missing, 1)} punts més`;
    } else {
      el.nextRank.textContent = 'Has arribat al màxim rang!';
    }
  }

  /* ---------- Render ---------- */

  function renderAll() {
    el.target.textContent = game.challenge.target;
    el.maxOps.textContent = `Fins a ${game.challenge.maxOps} operacions`;
    renderNumbers();
    renderExpression();
    renderProgress();
    renderSolutions();
    el.tabDaily.setAttribute('aria-selected', game.mode === 'daily');
    el.tabRandom.setAttribute('aria-selected', game.mode === 'random');
    el.tabDaily.classList.toggle('active', game.mode === 'daily');
    el.tabRandom.classList.toggle('active', game.mode === 'random');
    document.querySelectorAll('.level-btn').forEach((b) => b.classList.toggle('active', b.dataset.level === level));
    document.querySelectorAll('.age-btn').forEach((b) => b.classList.toggle('active', b.dataset.age === age));
    document.querySelectorAll('.op-btn').forEach((b) => { b.disabled = !game.challenge.ops.includes(b.dataset.op); });
    el.btnNew.hidden = game.mode !== 'random';
  }

  function renderNumbers() {
    el.numbers.replaceChildren(...game.challenge.bases.map((n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hex';
      b.dataset.num = n;
      b.textContent = n;
      return b;
    }));
  }

  function displayOp(op) { return op === '-' ? '−' : op; }

  function renderExpression() {
    el.expression.replaceChildren(...tokens.map((t) => {
      const s = document.createElement('span');
      s.className = typeof t === 'string' ? 'tok tok-op' : 'tok tok-num';
      s.textContent = typeof t === 'string' ? displayOp(t) : t;
      return s;
    }));
    el.expression.classList.toggle('empty', tokens.length === 0);
    renderPreview();
  }

  /** Resultat parcial en temps real. */
  function renderPreview() {
    el.preview.className = 'preview';
    const last = tokens[tokens.length - 1];

    if (tokens.length === 0) {
      el.preview.textContent = 'Construeix una operació';
    } else if (typeof last === 'string' || tokens.length < 3 ||
               !game.challenge.bases.includes(last)) {
      el.preview.textContent = '…';
    } else {
      const r = V.evaluate(tokens);
      if (!r.ok) {
        el.preview.textContent = r.message;
        el.preview.classList.add('error');
      } else {
        el.preview.textContent = '= ' + r.value;
        if (r.value === game.challenge.target) el.preview.classList.add('match');
      }
    }
  }

  function renderSolutions() {
    const items = [...game.found];
    if (sortMode === 'points') items.sort((a, b) => b.points - a.points || a.time - b.time);
    else items.sort((a, b) => b.time - a.time);

    el.foundCount.textContent = items.length;
    el.totalCount.textContent = solutions.length;
    el.empty.hidden = items.length > 0;
    el.list.replaceChildren(...items.map((f) => {
      const li = document.createElement('li');
      const expr = document.createElement('span');
      expr.className = 'sol-expr';
      expr.textContent = `${f.expression.replace(/ - /g, ' − ')} = ${game.challenge.target}`;
      const pts = document.createElement('span');
      pts.className = 'sol-points';
      pts.textContent = `+${f.points}`;
      li.append(expr, pts);
      return li;
    }));

    el.sortTime.classList.toggle('active', sortMode === 'time');
    el.sortPoints.classList.toggle('active', sortMode === 'points');
  }

  /* ---------- Toasts ---------- */

  function showAllSolutions() {
    const all = solutions;
    const found = new Set(game.found.map((f) => V.keyOf(f.expression)));
    const hits = all.filter((s) => found.has(s.key)).length;

    el.allSummary.textContent = `Has trobat ${hits} de ${all.length}.`;
    el.allList.replaceChildren(...all.map((s) => {
      const li = document.createElement('li');
      const isFound = found.has(s.key);
      if (isFound) li.className = 'found';
      const expr = document.createElement('span');
      expr.className = 'sol-expr';
      expr.textContent = `${isFound ? '✓ ' : ''}${s.expression.replace(/ - /g, ' − ')} = ${game.challenge.target}`;
      const pts = document.createElement('span');
      pts.className = 'sol-points';
      pts.textContent = `+${s.points}`;
      li.append(expr, pts);
      return li;
    }));
    el.allDialog.showModal();
  }

  function toast(message, type = 'error') {
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = message;
    el.toasts.appendChild(t);
    while (el.toasts.children.length > 3) el.toasts.firstChild.remove();
    setTimeout(() => {
      t.classList.add('hide');
      setTimeout(() => t.remove(), 300);
    }, 2200);
  }

  function shake() {
    el.expression.classList.remove('shake');
    void el.expression.offsetWidth; // reinicia l'animació
    el.expression.classList.add('shake');
  }

  /* ---------- Entrada ---------- */

  function lastToken() { return tokens[tokens.length - 1]; }

  function addNumber(n) {
    if (typeof lastToken() === 'number') return toast('Falta un operador entre els números');
    tokens.push(n);
    renderExpression();
  }

  function addOperator(op) {
    if (!game.challenge.ops.includes(op)) return toast(V.MESSAGES.OP_NOT_ALLOWED);
    if (tokens.length === 0) return toast("Comença amb un número");
    if (typeof lastToken() === 'string') tokens[tokens.length - 1] = op; // canvia l'operador
    else if ((tokens.length + 1) / 2 > game.challenge.maxOps) {
      return toast(`Només es poden fer ${game.challenge.maxOps} operacions`);
    } else tokens.push(op);
    renderExpression();
  }

  /** Dígit de teclat físic: permet escriure números base de diverses xifres (ex. 10). */
  function addDigit(d) {
    const bases = game.challenge.bases.map(String);
    const last = lastToken();
    if (typeof last === 'number') {
      const joined = String(last) + d;
      if (bases.some((b) => b.startsWith(joined))) {
        tokens[tokens.length - 1] = parseInt(joined, 10);
        return renderExpression();
      }
      return toast('Falta un operador entre els números');
    }
    if (bases.some((b) => b.startsWith(d))) {
      tokens.push(parseInt(d, 10));
      return renderExpression();
    }
    toast(`El ${d} no és un dels números disponibles`);
  }

  function deleteLast() {
    if (!tokens.length) return;
    tokens.pop();
    renderExpression();
  }

  function clearAll() {
    tokens = [];
    renderExpression();
  }

  function submit() {
    const result = V.validate(tokens, game.challenge, game.found.map((f) => f.expression));
    if (!result.ok) {
      shake();
      return toast(result.message);
    }
    const rankBefore = rankIndex(game.score, game.challenge.ref);
    game.found.push({ expression: result.expression, points: result.points, time: Date.now() });
    game.score += result.points;
    S.saveGame(game);
    tokens = [];
    renderExpression();
    renderProgress();
    renderSolutions();
    toast(`+${result.points} ${result.points === 1 ? 'punt' : 'punts'}!`, 'success');
    const rankAfter = rankIndex(game.score, game.challenge.ref);
    if (rankAfter > rankBefore) toast(`Nou rang: ${RANKS[rankAfter].name}!`, 'success');
  }

  /* ---------- Esdeveniments ---------- */

  el.numbers.addEventListener('click', (e) => {
    const b = e.target.closest('.hex');
    if (b) addNumber(parseInt(b.dataset.num, 10));
  });
  $('operators').addEventListener('click', (e) => {
    const b = e.target.closest('.op-btn');
    if (b) addOperator(b.dataset.op);
  });
  $('btn-delete').addEventListener('click', deleteLast);
  $('btn-clear').addEventListener('click', clearAll);
  $('btn-submit').addEventListener('click', submit);
  $('btn-help').addEventListener('click', () => el.help.showModal());
  $('btn-reveal').addEventListener('click', () => {
    if (game && confirm('Vols veure totes les solucions d\'aquest repte?')) showAllSolutions();
  });
  el.tabDaily.addEventListener('click', () => game && game.mode !== 'daily' && startGame('daily'));
  el.tabRandom.addEventListener('click', () => game && game.mode !== 'random' && startGame('random'));
  el.btnNew.addEventListener('click', () => {
    if (!game) return;
    if (game.found.length === 0 || confirm('Es perdrà el progrés del repte aleatori actual. Continuar?')) {
      startGame('random', true);
    }
  });
  el.sortTime.addEventListener('click', () => { sortMode = 'time'; renderSolutions(); });
  document.querySelector('.levels').addEventListener('click', (e) => {
    const b = e.target.closest('.level-btn');
    if (!b || !game || busy || b.dataset.level === level) return;
    level = b.dataset.level;
    startGame(game.mode);
  });
  el.sortPoints.addEventListener('click', () => { sortMode = 'points'; renderSolutions(); });
  document.querySelector('.ages').addEventListener('click', (e) => {
    const b = e.target.closest('.age-btn');
    if (!b || !game || busy || b.dataset.age === age) return;
    age = b.dataset.age;
    startGame(game.mode);
  });

  document.addEventListener('keydown', (e) => {
    if (!game || busy || document.querySelector('dialog[open]') || e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key;

    if (/^[0-9]$/.test(key)) addDigit(key);
    else if (['+', '-', '*', '/', 'x', 'X'].includes(key)) addOperator(V.tokenize(key).tokens[0]);
    else if (key === 'Backspace') deleteLast();
    else if (key === 'Escape' || key === 'Delete') clearAll();
    else if (key === 'Enter') {
      // Evita reenviar si un botó amb focus ja gestiona l'Enter.
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
      submit();
    } else return;

    e.preventDefault();
  });

  /* ---------- Inici ---------- */

  const meta = S.loadMeta();
  if (G.LEVELS[meta.level]) level = meta.level;
  if (G.AGES[meta.age]) age = meta.age;
  startGame(meta.mode === 'random' ? 'random' : 'daily');
  if (!meta.helpSeen) {
    S.saveMeta({ ...S.loadMeta(), helpSeen: true });
    setTimeout(() => el.help.showModal(), 200);
  }
})();
