/**
 * validator.js - Motor de regles i avaluació.
 *
 * Funciona tant al navegador (window.Validator) com a Node (require).
 * Convencions:
 *  - Els tokens són números (Number) i operadors (strings '+', '-', '×', '÷').
 *  - L'avaluació segueix la jerarquia estàndard (× i ÷ abans que + i -), sense parèntesis.
 *  - Cada divisió ha de ser exacta (sense decimals) en el moment d'executar-se.
 *  - Regla d'anti-cancel·lació: no es poden usar (+N i -N) ni (×N i ÷N) a la mateixa expressió.
 *    El primer número compta com un operand implícit de la família de l'operador que el segueix
 *    (+ per a +/-, × per a ×/÷), de manera que "5 + 3 - 5" també queda detectat.
 */
(function (root) {
  'use strict';

  const OPS = ['+', '-', '×', '÷'];
  const POINTS = { '+': 1, '-': 2, '×': 3, '÷': 5 };
  const INVERSE = { '+': '-', '-': '+', '×': '÷', '÷': '×' };

  /** Missatges d'error, compartits amb la UI. */
  const MESSAGES = {
    EMPTY: "Escriu una operació primer",
    NO_OPERATION: "Cal fer almenys una operació",
    TRAILING_OPERATOR: "L'operació no pot acabar en un operador",
    LEADING_OPERATOR: "L'operació ha de començar amb un número",
    ADJACENT_OPERATORS: "No pot haver-hi dos operadors seguits",
    ADJACENT_NUMBERS: "Falta un operador entre dos números",
    INVALID_CHAR: "Caràcter no permès",
    NOT_BASE: "Només es poden usar els números disponibles",
    OP_NOT_ALLOWED: "Aquest operador no està permès en aquest nivell",
    INEXACT_DIVISION: "Divisió no exacta",
    TARGET_MISMATCH: "El resultat no coincideix amb l'objectiu",
    DUPLICATE: "Aquesta combinació ja l'has trobat",
  };

  const isOp = (t) => typeof t === 'string';

  /** Normalitza un caràcter d'operador d'entrada (ASCII o Unicode) al símbol intern. */
  function normalizeOp(ch) {
    switch (ch) {
      case '+': return '+';
      case '-': case '−': case '–': return '-';
      case '×': case '*': case 'x': case 'X': case '·': return '×';
      case '÷': case '/': case ':': return '÷';
      default: return null;
    }
  }

  /**
   * Parser: converteix un string en tokens.
   * @returns {{ok:true, tokens:Array}|{ok:false, code:string, message:string}}
   */
  function tokenize(input) {
    const tokens = [];
    let i = 0;
    const s = String(input);
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (/[0-9]/.test(ch)) {
        let j = i;
        while (j < s.length && /[0-9]/.test(s[j])) j++;
        tokens.push(parseInt(s.slice(i, j), 10));
        i = j;
        continue;
      }
      const op = normalizeOp(ch);
      if (!op) return fail('INVALID_CHAR', `${MESSAGES.INVALID_CHAR}: "${ch}"`);
      tokens.push(op);
      i++;
    }
    return { ok: true, tokens };
  }

  function fail(code, message) {
    return { ok: false, code, message: message || MESSAGES[code] };
  }

  /** Validador de sintaxi: alternança número/operador, que comenci i acabi en número. */
  function checkSyntax(tokens) {
    if (tokens.length === 0) return fail('EMPTY');
    if (isOp(tokens[0])) return fail('LEADING_OPERATOR');
    for (let i = 1; i < tokens.length; i++) {
      if (isOp(tokens[i]) && isOp(tokens[i - 1])) return fail('ADJACENT_OPERATORS');
      if (!isOp(tokens[i]) && !isOp(tokens[i - 1])) return fail('ADJACENT_NUMBERS');
    }
    if (isOp(tokens[tokens.length - 1])) return fail('TRAILING_OPERATOR');
    if (tokens.length < 3) return fail('NO_OPERATION');
    return { ok: true };
  }

  /**
   * Un pas de l'avaluació incremental. L'estat és (acc, term): el valor és acc + term,
   * on term és el terme multiplicatiu en curs (amb signe).
   * Retorna [acc, term] o null si la divisió no és exacta.
   */
  function step(acc, term, op, n) {
    switch (op) {
      case '+': return [acc + term, n];
      case '-': return [acc + term, -n];
      case '×': return [acc, term * n];
      case '÷': return term % n === 0 ? [acc, term / n] : null;
      default: return null;
    }
  }

  /**
   * Calculador segur (sense eval). Assumeix una sintaxi vàlida.
   * @returns {{ok:true, value:number}|{ok:false, code:string, message:string}}
   */
  function evaluate(tokens) {
    let acc = 0;
    let term = tokens[0];
    for (let i = 1; i < tokens.length; i += 2) {
      const next = step(acc, term, tokens[i], tokens[i + 1]);
      if (!next) return fail('INEXACT_DIVISION');
      acc = next[0];
      term = next[1];
    }
    return { ok: true, value: acc + term };
  }

  /**
   * Validador d'anti-cancel·lació: busca parells (+N,-N) o (×N,÷N).
   * @returns {{n:number, a:string, b:string}|null}
   */
  function findCancellation(tokens) {
    if (tokens.length < 3) return null;
    const used = new Set();
    // Operand implícit del primer número.
    used.add((tokens[1] === '+' || tokens[1] === '-' ? '+' : '×') + tokens[0]);
    for (let i = 1; i < tokens.length; i += 2) {
      const op = tokens[i];
      const n = tokens[i + 1];
      if (used.has(INVERSE[op] + n)) return { n, a: INVERSE[op], b: op };
      used.add(op + n);
    }
    return null;
  }

  /** Calculador de punts: suma els pesos dels operadors. */
  function calculatePoints(tokens) {
    let total = 0;
    for (const t of tokens) if (isOp(t)) total += POINTS[t];
    return total;
  }

  /** Format canònic de l'expressió (text mostrat). */
  function format(tokens) {
    return tokens.join(' ');
  }

  /**
   * Clau d'equivalència: ignora l'ordre dels termes de la suma/resta i dels factors i divisors
   * dins de cada terme (10 + 6 ≡ 6 + 10; 3 × 4 ÷ 2 ≡ 4 × 3 ÷ 2). Assumeix sintaxi vàlida.
   */
  function canonicalKey(tokens) {
    const plus = [];
    const minus = [];
    let sign = '+';
    let nums = [tokens[0]];
    let dens = [];
    const byValue = (a, b) => a - b;
    const flush = () => {
      const term = nums.sort(byValue).join('×') + (dens.length ? '÷' + dens.sort(byValue).join('÷') : '');
      (sign === '+' ? plus : minus).push(term);
    };
    for (let i = 1; i < tokens.length; i += 2) {
      const op = tokens[i];
      const n = tokens[i + 1];
      if (op === '×') nums.push(n);
      else if (op === '÷') dens.push(n);
      else { flush(); sign = op; nums = [n]; dens = []; }
    }
    flush();
    return plus.sort().join('+') + (minus.length ? '-' + minus.sort().join('-') : '');
  }

  /** Clau d'equivalència d'una expressió en text (null si no es pot interpretar). */
  function keyOf(expression) {
    const parsed = tokenize(expression);
    return parsed.ok && checkSyntax(parsed.tokens).ok ? canonicalKey(parsed.tokens) : null;
  }

  /**
   * Validació completa d'una expressió.
   * @param {string|Array} input  string de l'usuari o tokens
   * @param {{target:number, bases:number[]}} challenge
   * @param {string[]} foundExpressions  expressions ja trobades (format canònic)
   */
  function validate(input, challenge, foundExpressions) {
    let tokens = input;
    if (typeof input === 'string') {
      const parsed = tokenize(input);
      if (!parsed.ok) return parsed;
      tokens = parsed.tokens;
    }

    const syntax = checkSyntax(tokens);
    if (!syntax.ok) return syntax;

    const allowed = challenge.ops || OPS;
    if (tokens.some((t) => isOp(t) && !allowed.includes(t))) return fail('OP_NOT_ALLOWED');

    const bad = tokens.find((t) => !isOp(t) && !challenge.bases.includes(t));
    if (bad !== undefined) return fail('NOT_BASE', `${MESSAGES.NOT_BASE} (${bad} no ho és)`);

    const result = evaluate(tokens);
    if (!result.ok) return result;

    const cancel = findCancellation(tokens);
    if (cancel) {
      return fail('CANCELLATION', `Operació cancel·lada detectada (${cancel.a}${cancel.n} i ${cancel.b}${cancel.n})`);
    }

    if (result.value !== challenge.target) return fail('TARGET_MISMATCH');

    const expression = format(tokens);
    const key = canonicalKey(tokens);
    if (foundExpressions.some((e) => keyOf(e) === key)) return fail('DUPLICATE');

    return { ok: true, tokens, expression, value: result.value, points: calculatePoints(tokens) };
  }

  const api = {
    OPS, POINTS, INVERSE, MESSAGES,
    tokenize, checkSyntax, step, evaluate, findCancellation, calculatePoints, format, canonicalKey, keyOf, validate,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Validator = api;
})(typeof self !== 'undefined' ? self : this);
