/* exportar.js — sacar lo que se está mirando a Excel o a PDF.
 *
 * Dos cosas, sin librerías de fuera:
 *
 *  · descargarExcel() escribe un .xlsx de verdad. Un xlsx no es más que un
 *    zip con unos cuantos XML dentro, así que se arma a mano: el zip va sin
 *    comprimir (más bytes, cero dependencias) y los textos van metidos en la
 *    propia celda, sin tabla de cadenas compartidas. Lo abre Excel, lo abre
 *    Numbers y lo abre Drive.
 *
 *  · informeImprimible() monta una hoja limpia en un marco escondido y manda
 *    imprimir. Desde ahí, «Guardar como PDF» y listo. No se genera el PDF a
 *    mano porque los acentos en un PDF hecho a pelo son una pelea que no
 *    merece la pena.
 */

import {h, txt} from './util.js';

/* ================= el zip ================= */

const TABLA_CRC = (function () {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** Junta varios ficheros en un zip sin comprimir. */
function zip(archivos) {
  const cod = new TextEncoder();
  const trozos = [];
  const central = [];
  let desplazamiento = 0;

  archivos.forEach(function (a) {
    const nombre = cod.encode(a.nombre);
    const datos = a.datos;
    const crc = crc32(datos);

    const local = new Uint8Array(30 + nombre.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);       // versión mínima
    v.setUint16(6, 0x0800, true);   // los nombres van en UTF-8
    v.setUint16(8, 0, true);        // sin comprimir
    v.setUint16(10, 0, true);       // hora
    v.setUint16(12, 0x2821, true);  // fecha fija: da igual y así es reproducible
    v.setUint32(14, crc, true);
    v.setUint32(18, datos.length, true);
    v.setUint32(22, datos.length, true);
    v.setUint16(26, nombre.length, true);
    local.set(nombre, 30);
    trozos.push(local, datos);

    const c = new Uint8Array(46 + nombre.length);
    const w = new DataView(c.buffer);
    w.setUint32(0, 0x02014b50, true);
    w.setUint16(4, 20, true);
    w.setUint16(6, 20, true);
    w.setUint16(8, 0x0800, true);
    w.setUint16(10, 0, true);
    w.setUint16(12, 0, true);
    w.setUint16(14, 0x2821, true);
    w.setUint32(16, crc, true);
    w.setUint32(20, datos.length, true);
    w.setUint32(24, datos.length, true);
    w.setUint16(28, nombre.length, true);
    w.setUint32(42, desplazamiento, true);
    c.set(nombre, 46);
    central.push(c);

    desplazamiento += local.length + datos.length;
  });

  const tamañoCentral = central.reduce(function (n, c) { return n + c.length; }, 0);
  const fin = new Uint8Array(22);
  const f = new DataView(fin.buffer);
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(8, archivos.length, true);
  f.setUint16(10, archivos.length, true);
  f.setUint32(12, tamañoCentral, true);
  f.setUint32(16, desplazamiento, true);

  const todo = trozos.concat(central, [fin]);
  const total = todo.reduce(function (n, t) { return n + t.length; }, 0);
  const salida = new Uint8Array(total);
  let i = 0;
  todo.forEach(function (t) { salida.set(t, i); i += t.length; });
  return salida;
}

/* ================= el xlsx ================= */

const cod = new TextEncoder();
const bytes = s => cod.encode(s);

const esc = s => String(s === undefined || s === null ? '' : s)
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** 0 → A, 25 → Z, 26 → AA. */
function letraColumna(n) {
  let s = '';
  let x = n + 1;
  while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = (x - 1 - r) / 26; }
  return s;
}

/* Un número se guarda como número para poder sumarlo en Excel; lo demás va
   como texto, que es lo que es. Las fechas en yyyy-mm-dd las reconoce Excel
   al abrir, así que no hace falta formato de celda. */
const esNumero = v => typeof v === 'number' && isFinite(v);

function hojaXml(hoja) {
  const cabeceras = hoja.cabeceras || [];
  const filas = hoja.filas || [];
  const anchos = cabeceras.map(function (c, i) {
    const largos = filas.slice(0, 400).map(function (f) { return String(f[i] === undefined || f[i] === null ? '' : f[i]).length; });
    return Math.min(52, Math.max(10, String(c).length + 2, Math.max.apply(null, largos.concat([0])) + 2));
  });

  const celda = function (v, fila, col, estilo) {
    const ref = letraColumna(col) + fila;
    const s = estilo ? ' s="' + estilo + '"' : '';
    if (esNumero(v)) return '<c r="' + ref + '"' + s + '><v>' + v + '</v></c>';
    const t = String(v === undefined || v === null ? '' : v);
    if (!t) return '<c r="' + ref + '"' + s + '/>';
    return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' +
      esc(t) + '</t></is></c>';
  };

  const cuerpo = filas.map(function (f, i) {
    return '<row r="' + (i + 2) + '">' +
      cabeceras.map(function (_, c) { return celda(f[c], i + 2, c); }).join('') + '</row>';
  }).join('');

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetPr><outlinePr/></sheetPr>' +
    '<cols>' + anchos.map(function (a, i) {
      return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + a + '" customWidth="1"/>';
    }).join('') + '</cols>' +
    '<sheetData>' +
    '<row r="1">' + cabeceras.map(function (c, i) { return celda(String(c), 1, i, 1); }).join('') + '</row>' +
    cuerpo + '</sheetData>' +
    '<autoFilter ref="A1:' + letraColumna(Math.max(0, cabeceras.length - 1)) + (filas.length + 1) + '"/>' +
    '</worksheet>';
}

/**
 * Arma y descarga un .xlsx.
 * hojas: [{nombre, cabeceras:[...], filas:[[...], ...]}]
 */
export function descargarExcel(nombre, hojas) {
  const lista = (Array.isArray(hojas) ? hojas : [hojas]).filter(Boolean);
  if (!lista.length) return;

  /* Excel no admite estos caracteres en el nombre de una pestaña, ni más de
     31 letras, y se pone muy tonto si se los cuela uno. */
  const nombreHoja = (n, i) => (String(n || ('Hoja ' + (i + 1)))
    .replace(/[\\\/\?\*\[\]:]/g, ' ').trim().slice(0, 31)) || ('Hoja ' + (i + 1));

  const tipos = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    lista.map(function (_, i) {
      return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ' +
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    }).join('') + '</Types>';

  const relRaiz = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  const libro = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    lista.map(function (ho, i) {
      return '<sheet name="' + esc(nombreHoja(ho.nombre, i)) + '" sheetId="' + (i + 1) +
        '" r:id="rId' + (i + 1) + '"/>';
    }).join('') + '</sheets></workbook>';

  const relLibro = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    lista.map(function (_, i) {
      return '<Relationship Id="rId' + (i + 1) +
        '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
        'Target="worksheets/sheet' + (i + 1) + '.xml"/>';
    }).join('') + '</Relationships>';

  /* Dos estilos y para de contar: el normal y el de la fila de cabecera. */
  const estilos = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2">' +
    '<font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="3">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF242422"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="2">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  const archivos = [
    {nombre: '[Content_Types].xml', datos: bytes(tipos)},
    {nombre: '_rels/.rels', datos: bytes(relRaiz)},
    {nombre: 'xl/workbook.xml', datos: bytes(libro)},
    {nombre: 'xl/_rels/workbook.xml.rels', datos: bytes(relLibro)},
    {nombre: 'xl/styles.xml', datos: bytes(estilos)}
  ].concat(lista.map(function (ho, i) {
    return {nombre: 'xl/worksheets/sheet' + (i + 1) + '.xml', datos: bytes(hojaXml(ho))};
  }));

  descargar(zip(archivos),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    nombre.replace(/\.xlsx$/i, '') + '.xlsx');
}

function descargar(datos, tipo, nombre) {
  const url = URL.createObjectURL(new Blob([datos], {type: tipo}));
  const a = h('a', {href: url, download: nombre.replace(/[^\w.\-]+/g, '_')});
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}

/* ================= el informe para imprimir ================= */

const CSS_INFORME = `
  @page { size: A4 landscape; margin: 12mm 10mm 14mm; }
  * { box-sizing: border-box; }
  body { font: 11px/1.45 Inter, "Segoe UI", Arial, sans-serif; color: #17191c; margin: 0; }
  header { display: flex; align-items: flex-end; justify-content: space-between;
           border-bottom: 2px solid #242422; padding-bottom: 8px; margin-bottom: 14px; }
  .marca { font: 800 19px/1 Inter, Arial, sans-serif; letter-spacing: -.02em; }
  .marca span { color: #7ab800; }
  .marca small { display: block; font: 600 8px/1.4 Inter, Arial, sans-serif;
                 letter-spacing: .22em; color: #8b918a; margin-top: 3px; }
  h1 { font-size: 17px; margin: 0; }
  .sub { color: #5b6159; font-size: 10.5px; margin-top: 2px; }
  .cuando { text-align: right; color: #8b918a; font-size: 9.5px; }
  .kpis { display: flex; gap: 8px; margin-bottom: 12px; }
  .kpis div { flex: 1; border: 1px solid #e3e7e0; border-radius: 8px; padding: 7px 10px; }
  .kpis b { display: block; font-size: 16px; }
  .kpis small { color: #8b918a; font-size: 8.5px; text-transform: uppercase; letter-spacing: .1em; }
  .reparto { margin-bottom: 12px; font-size: 10.5px; }
  .reparto h2 { font-size: 10px; text-transform: uppercase; letter-spacing: .12em;
                color: #8b918a; margin: 0 0 4px; }
  .reparto span { display: inline-block; margin: 0 10px 3px 0; }
  .reparto span b { font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { text-align: left; font-size: 8.5px; text-transform: uppercase; letter-spacing: .1em;
       color: #fff; background: #242422; padding: 5px 7px; }
  td { padding: 4px 7px; border-bottom: 1px solid #eceee9; vertical-align: top; }
  tr { break-inside: avoid; }
  tbody tr:nth-child(even) td { background: #f7f8f5; }
  .num { text-align: right; }
  .pie { margin-top: 10px; color: #8b918a; font-size: 9px; }
`;

/**
 * Monta la hoja y abre el diálogo de imprimir, que es donde se elige
 * «Guardar como PDF».
 *
 * informe: {titulo, subtitulo, resumen:[{et, valor, nota}],
 *           reparto:{titulo, partes:[{et, n}]}, cabeceras, filas, pie}
 */
export function informeImprimible(informe) {
  const cabeceras = informe.cabeceras || [];
  const filas = informe.filas || [];
  const ahora = new Date().toLocaleString('es-ES',
    {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'});

  const html = '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
    '<title>' + esc(informe.titulo || 'Informe') + '</title><style>' + CSS_INFORME + '</style></head><body>' +
    '<header><div>' +
      '<div class="marca">ZERO<span>WATTIOS</span><small>Ingeniería</small></div>' +
    '</div><div style="flex:1;padding:0 18px">' +
      '<h1>' + esc(informe.titulo || 'Informe') + '</h1>' +
      (informe.subtitulo ? '<div class="sub">' + esc(informe.subtitulo) + '</div>' : '') +
    '</div><div class="cuando">Sacado el ' + esc(ahora) + '</div></header>' +
    ((informe.resumen || []).length ? '<div class="kpis">' + informe.resumen.map(function (k) {
      return '<div><small>' + esc(k.et) + '</small><b>' + esc(k.valor) + '</b>' +
        (k.nota ? '<small style="text-transform:none;letter-spacing:0">' + esc(k.nota) + '</small>' : '') + '</div>';
    }).join('') + '</div>' : '') +
    (informe.reparto && (informe.reparto.partes || []).length
      ? '<div class="reparto"><h2>' + esc(informe.reparto.titulo || 'Reparto') + '</h2>' +
        informe.reparto.partes.map(function (p) {
          return '<span><b>' + esc(p.et) + '</b> ' + esc(p.n) + '</span>'; }).join('') + '</div>'
      : '') +
    '<table><thead><tr>' + cabeceras.map(function (c) {
      return '<th' + (c && c.num ? ' class="num"' : '') + '>' + esc(c && c.et !== undefined ? c.et : c) + '</th>';
    }).join('') + '</tr></thead><tbody>' +
    (filas.length ? filas.map(function (f) {
      return '<tr>' + cabeceras.map(function (c, i) {
        return '<td' + (c && c.num ? ' class="num"' : '') + '>' + esc(f[i]) + '</td>';
      }).join('') + '</tr>';
    }).join('') : '<tr><td colspan="' + Math.max(1, cabeceras.length) + '">No hay nada que listar.</td></tr>') +
    '</tbody></table>' +
    (informe.pie ? '<div class="pie">' + esc(informe.pie) + '</div>' : '') +
    '</body></html>';

  /* Se imprime desde un marco escondido para no pelearse con el bloqueador
     de ventanas emergentes. Si el navegador no deja, se abre una pestaña. */
  const marco = h('iframe', {estilo: {position: 'fixed', right: '0', bottom: '0',
    width: '0', height: '0', border: '0', opacity: '0'}});
  document.body.appendChild(marco);
  const doc = marco.contentDocument;
  if (!doc) {
    document.body.removeChild(marco);
    const v = window.open('', '_blank');
    if (!v) return false;
    v.document.write(html); v.document.close();
    setTimeout(function () { v.focus(); v.print(); }, 400);
    return true;
  }
  doc.open(); doc.write(html); doc.close();
  const imprimir = function () {
    try { marco.contentWindow.focus(); marco.contentWindow.print(); } catch (e) { /* da igual */ }
    setTimeout(function () { if (marco.parentNode) marco.parentNode.removeChild(marco); }, 60000);
  };
  if (doc.readyState === 'complete') setTimeout(imprimir, 250);
  else marco.onload = function () { setTimeout(imprimir, 250); };
  return true;
}

/** El nombre del archivo con la fecha de hoy pegada. */
export function conFecha(base) {
  const d = new Date();
  const dd = n => String(n).padStart(2, '0');
  return txt(base) + '-' + d.getFullYear() + dd(d.getMonth() + 1) + dd(d.getDate());
}
