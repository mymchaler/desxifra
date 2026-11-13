/**
 * generator.js - Generador de reptes (diari amb seed per data, o aleatori).
 *
 * Un repte = { target, bases, ops, maxOps, level, age, ref, solutionCount, seed, canon }.
 * Una "solució" és una classe d'expressions equivalents per l'ordre dels factors
 * (10 + 6 i 6 + 10 són la mateixa; vegeu Validator.canonicalKey).
 * `ref` és la suma dels punts de totes les solucions de fins a `maxOps` operadors.
 *
 * Dos selectors independents:
 *  - nivell (LEVELS): quins operadors es poden usar.
 *  - curs (AGES): mida de l'objectiu i dels números, i longitud màxima de les solucions de referència.
 */
(function (root) {
  'use strict';

  const V = typeof module !== 'undefined' && module.exports ? require('./validator') : root.Validator;

  const MAX_OPS = 4; // valor per defecte per a reptes desats sense `maxOps`
  const MAX_ATTEMPTS = 15;
  const MAX_TARGET_TRIES = 8; // objectius candidats que es verifiquen per cada joc de números

  const OP_INDEX = { '+': 0, '-': 1, '×': 2, '÷': 3 };
  const INV_INDEX = [1, 0, 3, 2];

  const LEVELS = {
    easy: { label: 'Fàcil', ops: ['+'] },
    medium: { label: 'Mig', ops: ['+', '-', '×'] },
    hard: { label: 'Difícil', ops: ['+', '-', '×', '÷'] },
  };

  // Rangs pensats perquè el repte sigui jugable (nombre de solucions raonable) a cada curs.
  const AGES = {
    '1': { label: '1r', targetMin: 5, targetMax: 20, baseMin: 2, baseMax: 10, maxOps: 2, minSolutions: 5, maxSolutions: 200 },
    '2': { label: '2n', targetMin: 10, targetMax: 100, baseMin: 2, baseMax: 12, maxOps: 3, minSolutions: 15, maxSolutions: 300 },
    '3': { label: '3r', targetMin: 20, targetMax: 500, baseMin: 2, baseMax: 25, maxOps: 3, minSolutions: 10, maxSolutions: 300 },
    '4': { label: '4t', targetMin: 50, targetMax: 1000, baseMin: 2, baseMax: 50, maxOps: 4, minSolutions: 10, maxSolutions: 300 },
  };

  /* ---------- PRNG amb seed ---------- */

  function hashString(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function mulberry32(seed) {
    let a = seed;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- Enumeració de solucions ---------- */

  /**
   * Enumera totes les expressions vàlides (sense agrupar equivalents) fins a maxOps operadors.
   * Cada expressió es codifica en un enter (seqüència d'índexs de número i operador, base 20)
   * i només es guarda quan el resultat cau dins de `range`.
   * @returns {Map<number,{count:number, codes:number[]|null}>} resultat -> recompte brut i codis
   */
  function enumerate(bases, allowedOps, maxOps, range) {
    const stats = new Map();
    const n = bases.length; // <= 5: el codi usa 5 números x 4 operadors per pas
    const opIndexes = allowedOps.map((op) => OP_INDEX[op]);
    const lo = range[0];
    const hi = range[1];

    function walk(acc, term, mask, ops, firstIdx, code) {
      if (ops >= 1) {
        const value = acc + term;
        let s = stats.get(value);
        if (!s) { s = { count: 0, codes: null }; stats.set(value, s); }
        s.count++;
        if (value >= lo && value <= hi) (s.codes || (s.codes = [])).push(code);
      }
      if (ops === maxOps) return;

      for (const o of opIndexes) {
        // El primer número compta com a operand implícit de la família del primer operador.
        const base = ops === 0 ? 1 << (firstIdx * 4 + (o < 2 ? 0 : 2)) : mask;
        for (let j = 0; j < n; j++) {
          if (base & (1 << (j * 4 + INV_INDEX[o]))) continue;
          const next = V.step(acc, term, V.OPS[o], bases[j]);
          if (!next) continue;
          walk(next[0], next[1], base | (1 << (j * 4 + o)), ops + 1, firstIdx, code * 20 + o * 5 + j);
        }
      }
    }

    for (let i = 0; i < n; i++) walk(0, bases[i], 0, 0, i, 5 + i);
    return stats;
  }

  /** Reconstrueix els tokens d'una expressió a partir del seu codi. */
  function decode(code, bases) {
    const steps = [];
    while (code >= 10) {
      steps.push(code % 20);
      code = (code - (code % 20)) / 20;
    }
    const tokens = [bases[code - 5]];
    for (let i = steps.length - 1; i >= 0; i--) {
      tokens.push(V.OPS[Math.floor(steps[i] / 5)], bases[steps[i] % 5]);
    }
    return tokens;
  }

  /** Agrupa les expressions per equivalència (ordre dels factors) i en conserva un representant. */
  function classify(codes, bases) {
    const classes = new Map(); // clau canònica -> { tokens, points }
    for (const code of codes) {
      const tokens = decode(code, bases);
      const key = V.canonicalKey(tokens);
      if (!classes.has(key)) classes.set(key, { key, tokens, points: V.calculatePoints(tokens) });
    }
    return [...classes.values()];
  }

  function totalPoints(list) {
    let sum = 0;
    for (const c of list) sum += c.points;
    return sum;
  }

  /**
   * Llista totes les solucions (classes equivalents) que donen `challenge.target`.
   * @returns {{expression:string, points:number, key:string}[]} ordenades per punts (descendent)
   */
  function listSolutions(challenge) {
    const stats = enumerate(
      challenge.bases, challenge.ops || V.OPS, challenge.maxOps || MAX_OPS, [challenge.target, challenge.target]
    );
    const s = stats.get(challenge.target);
    if (!s || !s.codes) return [];
    return classify(s.codes, challenge.bases)
      .map((c) => ({ expression: V.format(c.tokens), points: c.points, key: c.key }))
      .sort((a, b) => b.points - a.points || a.expression.localeCompare(b.expression));
  }

  /** Operacions màximes d'una solució. Amb només sumes enumerar és barat, així que es permeten fins a 4. */
  function maxOpsFor(level, ageKey) {
    const age = AGES[ageKey] || AGES['1'];
    return level === 'easy' ? Math.max(age.maxOps, MAX_OPS) : age.maxOps;
  }

  function pickBases(rng, age) {
    const count = rng() < 0.7 ? 5 : 4;
    const pool = [];
    for (let v = age.baseMin; v <= age.baseMax; v++) pool.push(v);
    const bases = [];
    while (bases.length < count) {
      bases.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    }
    return bases.sort((a, b) => a - b);
  }

  function shuffle(list, rng) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  /** Genera un repte a partir d'un seed (string). El mateix seed dóna sempre el mateix repte. */
  function generate(seed, level = 'easy', ageKey = '1') {
    const cfg = LEVELS[level] || LEVELS.easy;
    const age = AGES[ageKey] || AGES['1'];
    // Amb només sumes hi ha molts menys resultats repetits: n'hi ha prou amb menys solucions.
    const minSol = level === 'easy' ? Math.max(2, Math.ceil(age.minSolutions / 4)) : age.minSolutions;
    const range = [age.targetMin, age.targetMax];
    const maxOps = maxOpsFor(level, ageKey);

    const rng = mulberry32(hashString(String(seed)));
    let fallback = null;   // objectiu amb massa solucions
    let lastResort = null; // objectiu amb poques solucions

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const bases = pickBases(rng, age);
      const stats = enumerate(bases, cfg.ops, maxOps, range);

      // Les classes són com a molt tantes com expressions: el recompte brut és una cota superior.
      const candidates = [];
      let anyValue = null;
      for (const [value, s] of stats) {
        if (!s.codes || bases.includes(value)) continue;
        if (anyValue === null || s.count > stats.get(anyValue).count) anyValue = value;
        if (s.count >= minSol) candidates.push(value);
      }
      shuffle(candidates, rng);

      let tries = 0;
      for (const value of candidates) {
        const s = stats.get(value);
        // Descarta de pressa els objectius amb una quantitat desproporcionada d'expressions.
        if (s.count > age.maxSolutions * 10) continue;
        if (tries++ >= MAX_TARGET_TRIES) break;

        const classes = classify(s.codes, bases);
        if (classes.length >= minSol && classes.length <= age.maxSolutions) {
          return build(seed, level, ageKey, bases, value, classes);
        }
        if (classes.length > age.maxSolutions && !fallback) fallback = build(seed, level, ageKey, bases, value, classes);
      }

      if (anyValue !== null && !lastResort) {
        lastResort = build(seed, level, ageKey, bases, anyValue, classify(stats.get(anyValue).codes, bases));
      }
    }
    return fallback || lastResort;
  }

  function build(seed, level, ageKey, bases, target, classes) {
    return {
      seed: String(seed), level, age: ageKey, target, bases,
      ops: (LEVELS[level] || LEVELS.easy).ops.slice(),
      maxOps: maxOpsFor(level, ageKey),
      ref: totalPoints(classes), solutionCount: classes.length,
      canon: true, // el recompte ja agrupa les expressions equivalents
    };
  }

  /* ---------- Reptes diari i aleatori ---------- */

  function todayKey(date = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  }

  function generateDaily(date = new Date(), level = 'easy', age = '1') {
    return generate(`numelogic-daily-${todayKey(date)}-${level}-${age}`, level, age);
  }

  function generateRandom(level = 'easy', age = '1') {
    return generate(`numelogic-random-${Date.now()}-${Math.random()}-${level}-${age}`, level, age);
  }

  const api = {
    MAX_OPS, LEVELS, AGES, maxOpsFor, enumerate, listSolutions, generate, generateDaily, generateRandom, todayKey,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Generator = api;
})(typeof self !== 'undefined' ? self : this);
