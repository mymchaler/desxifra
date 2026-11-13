/**
 * storage.js - Gestió d'estat a localStorage.
 *
 * Cada partida es guarda amb un id ('daily-YYYY-MM-DD' o 'random'):
 *   { id, mode, challenge:{target,bases,ref,seed}, found:[{expression,points,time}], score }
 */
(function (root) {
  'use strict';

  const PREFIX = 'numelogic:';
  const META_KEY = PREFIX + 'meta';

  function read(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* localStorage no disponible (mode privat, quota...): el joc continua sense persistència */
    }
  }

  function isValidGame(g) {
    return !!g && g.challenge && Array.isArray(g.challenge.bases) &&
      Number.isInteger(g.challenge.target) && Array.isArray(g.found) && Number.isFinite(g.score);
  }

  function loadGame(id) {
    const g = read(PREFIX + 'game:' + id);
    return isValidGame(g) ? g : null;
  }

  function saveGame(game) {
    write(PREFIX + 'game:' + game.id, game);
  }

  function loadMeta() {
    return read(META_KEY) || {};
  }

  function saveMeta(meta) {
    write(META_KEY, meta);
  }

  /** Elimina els reptes diaris antics per no omplir el localStorage. */
  function pruneDaily(keepId, keep = 200) {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX + 'game:daily-')) keys.push(k);
      }
      keys.sort().reverse().slice(keep).forEach((k) => {
        if (k !== PREFIX + 'game:' + keepId) localStorage.removeItem(k);
      });
    } catch (e) { /* ignorat */ }
  }

  root.GameStorage = { loadGame, saveGame, loadMeta, saveMeta, pruneDaily };
})(typeof self !== 'undefined' ? self : this);
