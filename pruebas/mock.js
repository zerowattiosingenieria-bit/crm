/* Simulador mínimo de los servicios de Apps Script para poder probar el
   backend en Node antes de subirlo. No pretende ser fiel: solo lo justo
   para que el código se ejecute igual. */
const crypto = require('crypto');

class Range {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, {sheet, r, c, nr, nc}); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const fila = [];
      for (let j = 0; j < this.nc; j++) fila.push(this.sheet._get(this.r + i, this.c + j));
      out.push(fila);
    }
    return out;
  }
  getDisplayValues() { return this.getValues().map(f => f.map(v => v === null || v === undefined ? '' : String(v))); }
  setValues(v) {
    v.forEach((fila, i) => fila.forEach((val, j) => this.sheet._set(this.r + i, this.c + j, val)));
    return this;
  }
  setValue(v) { this.sheet._set(this.r, this.c, v); return this; }
  getValue() { return this.sheet._get(this.r, this.c); }
  setFontWeight() { return this; } setBackground() { return this; } setFontColor() { return this; }
}

class Sheet {
  constructor(name) { this.name = name; this.datos = []; }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  _get(r, c) { const f = this.datos[r - 1]; return f ? (f[c - 1] === undefined ? '' : f[c - 1]) : ''; }
  _set(r, c, v) {
    while (this.datos.length < r) this.datos.push([]);
    const f = this.datos[r - 1];
    while (f.length < c) f.push('');
    f[c - 1] = v;
  }
  getLastRow() { return this.datos.length; }
  getLastColumn() { return this.datos.reduce((a, f) => Math.max(a, f.length), 0); }
  getRange(r, c, nr, nc) {
    if (typeof r === 'string') {
      const m = r.match(/^([A-Z]+)(\d+)$/);
      let col = 0; for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
      return new Range(this, Number(m[2]), col, 1, 1);
    }
    return new Range(this, r, c, nr === undefined ? 1 : nr, nc === undefined ? 1 : nc);
  }
  appendRow(fila) { this.datos.push(fila.slice()); }
  deleteRow(r) { this.datos.splice(r - 1, 1); }
  deleteRows(r, n) { this.datos.splice(r - 1, n); }
  setFrozenRows() { return this; } autoResizeColumns() { return this; }
}

class Spreadsheet {
  constructor(nombre) { this.nombre = nombre; this.hojas = [new Sheet('Hoja 1')]; }
  getId() { return 'BASE_DEMO'; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/BASE_DEMO'; }
  getSheets() { return this.hojas; }
  getSheetByName(n) { return this.hojas.filter(h => h.getName() === n)[0] || null; }
  insertSheet(n) { const h = new Sheet(n); this.hojas.push(h); return h; }
}

let LIBRO = null;
const PROPIEDADES = {};

global.SpreadsheetApp = {
  create(n) { LIBRO = new Spreadsheet(n); return LIBRO; },
  openById() { if (!LIBRO) throw new Error('sin libro'); return LIBRO; }
};
global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: k => (k in PROPIEDADES ? PROPIEDADES[k] : null),
    setProperty: (k, v) => { PROPIEDADES[k] = v; }
  })
};
global.LockService = { getScriptLock: () => ({waitLock() {}, releaseLock() {}}) };
global.ContentService = {
  MimeType: {JSON: 'json'},
  createTextOutput: t => ({setMimeType: () => t, texto: t})
};
global.Logger = {log: m => console.log('[log] ' + m)};
global.Maps = {newGeocoder: () => ({setRegion() { return this; }, geocode: () => ({status: 'ZERO_RESULTS'})})};
global.Utilities = {
  DigestAlgorithm: {SHA_256: 'sha256'},
  Charset: {UTF_8: 'utf8'},
  getUuid: () => crypto.randomUUID(),
  sleep: () => {},
  computeDigest: (alg, txt) => {
    const h = crypto.createHash('sha256').update(txt, 'utf8').digest();
    return Array.from(h).map(b => (b > 127 ? b - 256 : b));
  },
  formatDate: (d, tz, f) => {
    const p = n => String(n).padStart(2, '0');
    const s = {'yyyy-MM-dd': `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
      'yyyy-MM-dd HH:mm:ss': `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`};
    return s[f] || d.toISOString();
  }
};

/* Carga los .gs en el ámbito global, en orden. */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'apps-script');
fs.readdirSync(dir).filter(f => f.endsWith('.gs')).sort().forEach(f => {
  const codigo = fs.readFileSync(path.join(dir, f), 'utf8');
  /* const/function de nivel superior -> globales */
  (0, eval)(codigo.replace(/^const /gm, 'var ').replace(/^function /gm, 'function ') + `
;(${JSON.stringify(f)});`);
  const declarados = codigo.match(/^(?:var|const|function)\s+([A-Za-z0-9_$]+)/gm) || [];
  declarados.forEach(d => {
    const nombre = d.split(/\s+/)[1];
    try { if (typeof eval(nombre) !== 'undefined') global[nombre] = eval(nombre); } catch (e) {}
  });
});
module.exports = {PROPIEDADES, libro: () => LIBRO};
