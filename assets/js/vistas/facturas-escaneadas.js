/* vistas/facturas-escaneadas.js — subir una factura (PDF, imagen o foto), leerla
   entera, revisar los datos y contabilizarla (20/11/2026, orden de Nando).
   Solo dirección (permiso «finanzas»; el servidor lo vuelve a mirar).

   Lectura en el propio navegador, sin mandar la factura a nadie de fuera:
     · PDF con texto → pdf.js saca el texto tal cual;
     · PDF escaneado, imagen o foto → OCR en español con Tesseract.js.
   Luego se proponen los datos (emisor, NIF, número, fechas, base, IVA, IRPF,
   total, concepto, cliente y concepto de gasto) y se pueden corregir antes
   de guardar. Al guardar: archivo al Drive, datos al CRM y, si es recibida,
   su gasto; si es emitida, su factura. */

import {h, poner, txt, num, eur2, fechaCorta, normal, hoyISO} from '../util.js';
import * as api from '../api.js';
import {tarjeta, tabla, kpi, kpis, formulario, ventana, aviso, confirmar, filtros, cargando} from '../ui.js';

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const NUESTRO_CIF = 'B25935073';

/* ---------- carga de librerías bajo demanda ---------- */
const cargados = {};
function script(src) {
  if (!cargados[src]) cargados[src] = new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => mal(new Error('No se ha podido cargar el lector (' + src.split('/')[2] + ').'));
    document.head.appendChild(s);
  });
  return cargados[src];
}
async function pdfjs() {
  await script(PDFJS);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  return window.pdfjsLib;
}

/* ---------- utilidades de archivo ---------- */
const aBase64 = blob => new Promise((ok, mal) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1]);
  r.onerror = () => mal(new Error('No se ha podido leer el archivo.'));
  r.readAsDataURL(blob);
});
const cargarImagen = src => new Promise((ok, mal) => {
  const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error('La imagen no se puede abrir.')); i.src = src;
});
function lienzo(fuente, maxLado) {
  const w = fuente.naturalWidth || fuente.width, hh = fuente.naturalHeight || fuente.height;
  const k = Math.min(1, maxLado / Math.max(w, hh));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(hh * k);
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(fuente, 0, 0, c.width, c.height);
  return c;
}
const aBlob = (c, calidad = 0.85) => new Promise(ok => c.toBlob(ok, 'image/jpeg', calidad));

/* ---------- lectura ---------- */
async function ocr(lienzos, avance) {
  await script(TESSERACT);
  const w = await window.Tesseract.createWorker('spa', 1, {
    logger: m => { if (m.status === 'recognizing text') avance('Leyendo el texto… ' + Math.round(m.progress * 100) + ' %'); }
  });
  let texto = '';
  for (let i = 0; i < lienzos.length; i++) {
    if (lienzos.length > 1) avance('Leyendo la página ' + (i + 1) + ' de ' + lienzos.length + '…');
    const r = await w.recognize(lienzos[i]);
    texto += (i ? '\n\n' : '') + r.data.text;
  }
  await w.terminate();
  return texto;
}

/** Texto de un PDF, línea a línea (agrupando por altura). */
async function textoPdf(doc) {
  const paginas = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pg = await doc.getPage(n);
    const tc = await pg.getTextContent();
    const filas = [];
    tc.items.forEach(it => {
      if (!it.str || !it.str.trim()) return;
      const y = Math.round(it.transform[5]), x = it.transform[4];
      let f = filas.find(r => Math.abs(r.y - y) <= 3);
      if (!f) { f = {y, trozos: []}; filas.push(f); }
      f.trozos.push({x, s: it.str});
    });
    filas.sort((a, b) => b.y - a.y);
    paginas.push(filas.map(f => f.trozos.sort((a, b) => a.x - b.x).map(t => t.s).join('  ')).join('\n'));
  }
  return paginas.join('\n\n');
}

/**
 * Lee el archivo entero. Devuelve {texto, subir: {datos, mime, nombre}, miniatura, metodo}.
 * Las fotos se reducen a 2.000 px y se guardan en JPEG para que suban rápido.
 */
async function leerArchivo(archivo, avance) {
  const esPdf = archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name);
  if (esPdf) {
    avance('Abriendo el PDF…');
    const lib = await pdfjs();
    const doc = await lib.getDocument({data: new Uint8Array(await archivo.arrayBuffer())}).promise;
    let texto = await textoPdf(doc);
    const pags = Math.min(doc.numPages, 4);
    const lienzos = [];
    for (let n = 1; n <= pags; n++) {
      const pg = await doc.getPage(n);
      const vp = pg.getViewport({scale: 2});
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await pg.render({canvasContext: c.getContext('2d'), viewport: vp}).promise;
      lienzos.push(c);
    }
    let metodo = 'texto del PDF';
    if (texto.replace(/\s/g, '').length < 40 * doc.numPages) {
      avance('El PDF es una imagen escaneada: leyéndolo con OCR…');
      texto = await ocr(lienzos, avance);
      metodo = 'OCR del PDF escaneado';
    }
    return {texto, metodo, miniatura: lienzo(lienzos[0], 360).toDataURL('image/jpeg', 0.6),
      subir: {datos: await aBase64(archivo), mime: 'application/pdf', nombre: archivo.name}};
  }
  avance('Preparando la imagen…');
  const url = URL.createObjectURL(archivo);
  try {
    const img = await cargarImagen(url);
    const grande = lienzo(img, 2400);
    const texto = await ocr([grande], avance);
    const subirLienzo = lienzo(img, 2000);
    return {texto, metodo: 'OCR de la imagen', miniatura: lienzo(img, 360).toDataURL('image/jpeg', 0.6),
      subir: {datos: await aBase64(await aBlob(subirLienzo)), mime: 'image/jpeg', nombre: archivo.name.replace(/\.\w+$/, '') + '.jpg'}};
  } finally { URL.revokeObjectURL(url); }
}

/* ---------- interpretación del texto ---------- */
const MESES = {enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12};
const RE_IMPORTE = /-?\d{1,3}(?:[.\s]\d{3})*,\d{2}(?!\d)|-?\d+\.\d{2}(?!\d)|-?\d+,\d{2}(?!\d)/g;
const RE_NIF = /\b(?:ES)?([ABCDEFGHJNPQRSUVW][-\s.]?\d{7}[-\s.]?[0-9A-J]|\d{8}[-\s]?[A-Z]|[XYZ][-\s]?\d{7}[-\s]?[A-Z])\b/g;

const aNumero = s => {
  s = String(s).replace(/\s/g, '');
  if (/,\d{2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  return Number(s) || 0;
};
const pctDe = s => Number(String(s).replace(',', '.')) || 0;
const importes = linea => (linea.match(RE_IMPORTE) || []).map(aNumero);
const r2 = n => Math.round(n * 100) / 100;

function fechaDe(s) {
  let m = s.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/);
  if (m) {
    let a = +m[3]; if (a < 100) a += 2000;
    if (+m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) return `${a}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }
  m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return m[0];
  m = normal(s).match(/\b(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(\d{4})/);
  if (m) return `${m[3]}-${String(MESES[m[2]]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  return '';
}

function categoriaPorTexto(t) {
  const n = normal(t);
  const reglas = [
    ['material_aero', /aerotermia|bomba de calor|domusa|saunier|genia|deposito (acs|inercia)|acumulador/],
    ['bateria', /bateria|t-bat|battery/],
    ['material_fv', /modulo|placa|panel solar|inversor|fotovolt|estructura coplanar|solax|seissolar|seis solar/],
    ['montaje', /montaje|instalacion de|mano de obra|subcontrat|greenfield|robert gas/],
    ['legalizacion', /legaliz|boletin|certificado|cie\b|cite\b|tasa|icio|licencia/],
    ['transporte', /gasolina|gasoleo|combustible|peaje|parking|aparcamiento|restaurante|dietas|repsol|cepsa|ayvens|renting/],
    ['marketing', /publicidad|marketing|anuncio|google ads|meta platforms|facebook|imprenta|rotulacion|tarjetas de visita/],
    ['administracion', /gestoria|asesoria|notaria|registro mercantil|abogad|legalitas/],
    ['estructura', /alquiler|telefon|digi|movistar|vodafone|orange|ionos|hosting|software|licencia anual|suscripcion|luz de la oficina|seguro|mapfre|pccomponentes|amazon/]
  ];
  const r = reglas.find(([, re]) => re.test(n));
  return r ? r[0] : '';
}

/** Propone el cliente: el que más trozos de su dirección (o su nombre) aparecen en el texto. */
function clientePorTexto(t) {
  const n = ' ' + normal(t).replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ') + ' ';
  const vacias = new Set(['calle', 'c', 'av', 'avda', 'avenida', 'de', 'del', 'la', 'las', 'los', 'el', 'urb', 'plaza', 'paseo', 'camino', 'madrid', 'y']);
  let mejor = null, puntos = 0;
  for (const c of api.estado.clientes || []) {
    const dir = normal(c.direccion).replace(/,\s*\d{5}.*$/, '').replace(/[^a-z0-9ñ ]/g, ' ').split(/\s+/).filter(w => w && !vacias.has(w));
    const numero = dir.find(w => /^\d+$/.test(w));
    const palabras = dir.filter(w => !/^\d+$/.test(w) && w.length > 3);
    let p = 0;
    if (palabras.length && palabras.every(w => n.includes(' ' + w + ' '))) p += 2 + (numero && n.includes(' ' + numero + ' ') ? 2 : 0);
    const nom = normal(c.nombre).replace(/[^a-zñ ]/g, ' ').split(/\s+/).filter(w => w.length > 3);
    if (nom.length >= 2 && nom.filter(w => n.includes(' ' + w + ' ')).length >= 2) p += 3;
    if (p > puntos) { puntos = p; mejor = c; }
  }
  return puntos >= 3 ? mejor : null;
}

function interpretar(texto) {
  const lineas = texto.split(/\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const n = normal(texto);
  const d = {};

  /* NIF y tipo: si el primer NIF es el nuestro, la factura la hemos emitido nosotros */
  const mayus = texto.toUpperCase();
  const nifs = [...mayus.matchAll(RE_NIF)].map(m => m[1].replace(/[-\s.]/g, ''));
  const otros = [...new Set(nifs.filter(x => x !== NUESTRO_CIF))];
  /* ¿Nuestro CIF va como emisor o como cliente? Manda la etiqueta que tenga más cerca por encima. */
  let nuestroEsEmisor = false;
  const pos = mayus.search(/B[-\s.]?25935073/);
  if (pos >= 0) {
    const antes = normal(texto.slice(Math.max(0, pos - 400), pos));
    const ult = (re) => { let i = -1, m; const g = new RegExp(re.source, 'g'); while ((m = g.exec(antes))) i = m.index; return i; };
    const iCli = ult(/cliente|destinatario|facturar a|datos del? cliente|entrega|receptor|comprador/);
    const iEmi = ult(/proveedor|emisor|vendedor|razon social/);
    nuestroEsEmisor = iEmi > iCli || (iCli < 0 && iEmi < 0 && nifs[0] === NUESTRO_CIF);
  }
  d.tipo = nuestroEsEmisor && otros.length ? 'emitida' : 'recibida';
  if (d.tipo === 'emitida') { d.receptor_nif = otros[0] || ''; d.emisor_nif = NUESTRO_CIF; d.emisor = 'ZERO WATTIOS INGENIERÍA, S.L.'; }
  else { d.emisor_nif = otros[0] || ''; d.receptor_nif = nifs.includes(NUESTRO_CIF) ? NUESTRO_CIF : (otros[1] || ''); }

  /* emisor: un proveedor que ya conocemos, una razón social o la primera línea */
  if (d.tipo === 'recibida') {
    const conocidos = [...new Set((api.estado.gastos || []).map(g => txt(g.proveedor)).filter(p => p.length > 3))]
      .filter(p => n.includes(normal(p))).sort((a, b) => b.length - a.length);
    let social = '';
    for (const l of lineas) {
      const m = l.match(/([A-ZÁÉÍÓÚÑ0-9&'][A-ZÁÉÍÓÚÑ0-9&.,' -]{2,60}?\b(?:S\.?\s?L\.?\s?U?|S\.?\s?A\.?\s?U?|S\.?\s?COOP)\.?)(?=\s|$)/);
      if (m && !/zero\s*wattios/i.test(m[1])) { social = m[1]; break; }
    }
    d.emisor = conocidos[0] || social.replace(/^(raz[oó]n social|emisor|proveedor)\s*:?\s*/i, '').trim() ||
      (lineas.find(l => /[a-z]{3}/i.test(l) && !/factura|invoice|fecha|p[aá]gina/i.test(l) && !/zero\s*wattios/i.test(l)) || '');
  } else {
    const c = clientePorTexto(texto);
    let otra = '';
    for (const l of lineas) {
      const m = l.match(/([A-ZÁÉÍÓÚÑ0-9&'][A-ZÁÉÍÓÚÑ0-9&.,' -]{2,60}?\b(?:S\.?\s?L\.?\s?U?|S\.?\s?A\.?\s?U?|S\.?\s?COOP)\.?)(?=\s|$)/);
      if (m && !/zero\s*wattios/i.test(m[1])) { otra = m[1].trim(); break; }
    }
    d.receptor = otra || (c ? c.nombre : '');
  }

  /* número de factura */
  for (let i = 0; i < lineas.length && !d.numero; i++) {
    const l = lineas[i];
    const sn = l.match(/serie\s*\/?\s*n[uú]m(?:ero)?\.?\s*:?\s*([A-Z0-9]+(?:\s*[\/-]\s*[A-Z0-9.]+)?)/i);
    if (sn && /\d/.test(sn[1])) { d.numero = sn[1].replace(/\s+/g, ''); break; }
    if (/^(n[ºo°.]?\s*(de\s*)?)?factura(\s*n[ºo°.])?\s*:?$/i.test(l)) {
      const sig = lineas.slice(i + 1, i + 4).map(x => x.split(' ')[0]).find(x => /^[A-Z]{0,6}[-\/]?\d{2,}[\w\-\/.]*$/i.test(x) && !fechaDe(x));
      if (sig) { d.numero = sig; break; }
    }
    const m = l.match(/(?:n[ºo°.]\s*(?:de\s*)?factura|factura\s*(?:n[ºo°.]|n[uú]m(?:ero)?\.?|no\.?)?|invoice\s*(?:no\.?|number|#)?|fra\.\s*n?[ºo°]?)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/\.]{1,24})/i);
    if (m && /\d/.test(m[1]) && !fechaDe(m[1]) && !/^(fecha|date)$/i.test(m[1])) { d.numero = m[1].replace(/[.\-\/]$/, ''); break; }
  }

  /* fechas */
  const conFecha = lineas.map(l => ({l, f: fechaDe(l)})).filter(x => x.f);
  let venc = conFecha.find(x => /venc/i.test(x.l));
  if (!venc) { const i = lineas.findIndex(l => /venc/i.test(l)); const f2 = i >= 0 && lineas[i + 1] ? fechaDe(lineas[i + 1]) : ''; if (f2) venc = {l: lineas[i + 1], f: f2}; }
  const emision = conFecha.find(x => /fecha/i.test(x.l) && !/venc/i.test(x.l)) || conFecha.find(x => !venc || x.f !== venc.f);
  d.fecha = emision ? emision.f : '';
  d.vencimiento = venc ? venc.f : '';

  /* importes */
  const ultimo = (re, excluir) => {
    for (let i = lineas.length - 1; i >= 0; i--) {
      const l = lineas[i];
      if (!re.test(l) || (excluir && excluir.test(l))) continue;
      const v = importes(l).filter(x => x > 0);
      if (v.length) return {v, l};
      const sig = lineas[i + 1] ? importes(lineas[i + 1]).filter(x => x > 0) : [];
      if (sig.length) return {v: sig, l};
    }
    return null;
  };
  const tot = ultimo(/total/i, /sub\s*total|total\s*(base|bruto|neto|iva|impuestos)/i);
  const base = ultimo(/base\s*imponible|sub\s*total|importe\s*neto|total\s*(base|neto)|\bbase\b/i);
  const iva = ultimo(/\bi\.?\s?v\.?\s?a\b|cuota/i, /incluido|exento.*0,00/i);
  const irpf = ultimo(/irpf|retenci[oó]n/i);
  if (tot) d.total = Math.max(...tot.v);
  if (base) d.base = base.v[base.v.length - 1];
  if (iva) {
    const pc = iva.l.match(/(\d{1,2}(?:[.,]\d+)?)\s*%/);
    if (pc) d.iva_pct = pctDe(pc[1]);
    const vals = iva.v.filter(x => x !== d.base && x !== d.iva_pct);
    if (vals.length) d.iva = vals[vals.length - 1];
  }
  if (irpf) {
    const pc = irpf.l.match(/(\d{1,2}(?:[.,]\d+)?)\s*%/);
    if (pc) d.irpf_pct = pctDe(pc[1]);
    const vals = irpf.v.filter(x => x !== d.irpf_pct && x !== d.base);
    if (vals.length) d.irpf = vals[vals.length - 1];
  }
  /* La forma más fiable: buscar en todo el texto tres importes que cuadren
     (base + IVA al 21/10/5/4 % [− IRPF] = total) y quedarse con el total mayor. */
  const todos = [...new Set(lineas.flatMap(importes).filter(x => x > 0))].sort((a, b) => b - a).slice(0, 60);
  let mejor = null;
  for (const t of todos) {
    for (const b of todos) {
      if (b >= t) continue;
      for (const pct of [21, 10, 5, 4]) {
        const iv = todos.find(x => Math.abs(x - b * pct / 100) <= 0.02 + b * 0.0005);
        if (iv === undefined) continue;
        if (Math.abs(b + iv - t) <= 0.03) { mejor = {t, b, iv, pct, r: 0}; break; }
        for (const rp of [15, 7, 19]) {
          const rr = todos.find(x => Math.abs(x - b * rp / 100) <= 0.02 + b * 0.0005);
          if (rr !== undefined && Math.abs(b + iv - rr - t) <= 0.03) { mejor = {t, b, iv, pct, r: rr, rp}; break; }
        }
        if (mejor) break;
      }
      if (mejor) break;
    }
    if (mejor) break;
  }
  if (mejor) {
    d.total = mejor.t; d.base = mejor.b; d.iva = mejor.iv; d.iva_pct = mejor.pct;
    if (mejor.r) { d.irpf = mejor.r; d.irpf_pct = mejor.rp; } else if (!d.irpf) { delete d.irpf; delete d.irpf_pct; }
  }
  /* cuadrar lo que falte: total = base + IVA − IRPF */
  const ir = d.irpf || 0;
  if (d.base && d.total && !d.iva) d.iva = r2(d.total - d.base + ir);
  if (d.base && d.iva && !d.total) d.total = r2(d.base + d.iva - ir);
  if (d.total && !d.base) {
    const pct = d.iva_pct || 21;
    d.base = d.iva ? r2(d.total - d.iva + ir) : r2((d.total + ir) / (1 + pct / 100));
    if (!d.iva) d.iva = r2(d.total - d.base + ir);
  }
  if (d.base && d.iva && !d.iva_pct) d.iva_pct = Math.round(d.iva / d.base * 100);
  if (!d.iva_pct && d.base) d.iva_pct = 21;

  /* líneas de detalle: texto con importe que no son los totales */
  const detalle = lineas.filter(l => importes(l).length && /[a-záéíóúñ]{4}/i.test(l) &&
    !/total|base|i\.?v\.?a|irpf|retenci|cuota|vencim|fecha|iban|cif|nif|tel[eé]f|cuenta|cobro|banco|transferencia|suma|impuesto|ES\d{2}\s?\d{4}/i.test(l) && !fechaDe(l));
  d.lineas = detalle.slice(0, 40).map(l => ({descripcion: l.replace(RE_IMPORTE, '').replace(/€/g, ' ').replace(/\b\d+([.,]\d+)?\s*%/g, ' ').replace(/\b(unidades|uds?\.?)\b/gi, ' ').replace(/^\s*\d+\s+/, '').replace(/\s+/g, ' ').trim(), importe: importes(l).pop()}));
  const descs = d.lineas.map(x => x.descripcion.replace(/\s%|%\s|%$/g, ' ').replace(/\s+/g, ' ').trim()).filter(s => s.length > 5);
  d.concepto = descs.slice(0, 3).join(' · ').slice(0, 160);

  /* cliente y concepto de gasto */
  const c = clientePorTexto(texto);
  d.cliente_id = c ? c.id : '';
  if (d.tipo === 'recibida') {
    const previo = (api.estado.gastos || []).filter(g => d.emisor && normal(g.proveedor) === normal(d.emisor) && txt(g.categoria)).pop();
    d.categoria = previo ? previo.categoria : categoriaPorTexto(texto);
  }
  d.estado_pago = 'pendiente';
  return d;
}

/* ---------- pantalla ---------- */
const nombreCliente = id => { const c = api.cliente(id); return c ? [c.direccion, c.nombre].filter(Boolean).join(' · ') : ''; };
const etiquetaCat = k => (api.opciones('categoriasGasto').find(o => o[0] === k) || [k, k])[1];

function trimestre() {
  const hoy = hoyISO(), a = hoy.slice(0, 4), q = Math.floor((+hoy.slice(5, 7) - 1) / 3);
  return {desde: `${a}-${String(q * 3 + 1).padStart(2, '0')}-01`, hasta: hoy};
}

export async function vistaFacturasEscaneadas() {
  const caja = h('div');
  const estado = h('.nota', {estilo: {minHeight: '20px', marginTop: '8px'}});
  const rango = trimestre();
  const lista = h('div', cargando('Cargando facturas…'));

  const elegir = h('input', {type: 'file', accept: 'application/pdf,image/*', estilo: {display: 'none'}});
  const foto = h('input', {type: 'file', accept: 'image/*', capture: 'environment', estilo: {display: 'none'}});
  const ocupado = {v: false};

  async function procesar(archivo) {
    if (!archivo || ocupado.v) return;
    if (archivo.size > 15 * 1024 * 1024) return aviso('El archivo pasa de 15 MB.', 'error');
    ocupado.v = true;
    const avance = t => poner(estado, h('span.cargando'), ' ', t);
    try {
      const leido = await leerArchivo(archivo, avance);
      poner(estado, '');
      const datos = interpretar(leido.texto);
      editor({datos, leido, alGuardar: recargar});
    } catch (e) {
      poner(estado, h('span', {estilo: {color: 'var(--rojo, #c0392b)'}}, e.message || String(e)));
    } finally { ocupado.v = false; elegir.value = ''; foto.value = ''; }
  }
  elegir.addEventListener('change', () => procesar(elegir.files[0]));
  foto.addEventListener('change', () => procesar(foto.files[0]));

  const zona = h('div', {estilo: {border: '2px dashed var(--borde, #ccc)', borderRadius: '10px', padding: '22px 16px', textAlign: 'center'}},
    h('p', {estilo: {margin: '0 0 12px'}}, 'Arrastra aquí la factura (PDF o imagen) o elige una opción:'),
    h('.acciones', {estilo: {justifyContent: 'center', display: 'flex', gap: '10px', flexWrap: 'wrap'}},
      h('button.btn.primario', {onclick: () => elegir.click()}, '📄 Subir PDF o imagen'),
      h('button.btn', {onclick: () => foto.click()}, '📷 Hacer foto')),
    h('p.nota', {estilo: {margin: '10px 0 0'}}, 'Se lee entera en este equipo (texto del PDF u OCR). Revisa los datos antes de guardar.'),
    elegir, foto, estado);
  zona.addEventListener('dragover', e => { e.preventDefault(); zona.style.background = 'var(--fondo-2, #f4f8ec)'; });
  zona.addEventListener('dragleave', () => { zona.style.background = ''; });
  zona.addEventListener('drop', e => { e.preventDefault(); zona.style.background = ''; procesar(e.dataTransfer.files[0]); });

  const f = filtros([
    {id: 'desde', tipo: 'fecha', et: 'Desde', valor: rango.desde},
    {id: 'hasta', tipo: 'fecha', et: 'Hasta', valor: rango.hasta},
    {tipo: 'boton', et: 'Este trimestre', accion: () => { Object.assign(rango, trimestre()); recargar(); }},
    {tipo: 'boton', et: 'Todo', accion: () => { rango.desde = ''; rango.hasta = ''; recargar(); }}
  ], v => { Object.assign(rango, v); recargar(); });

  async function recargar() {
    poner(lista, cargando('Cargando facturas…'));
    const r = await api.pedir('facturasDoc', {desde: rango.desde || '', hasta: rango.hasta || ''});
    const fs = r.facturas || [];
    const rec = fs.filter(x => x.tipo !== 'emitida'), emi = fs.filter(x => x.tipo === 'emitida');
    const s = (l, c) => l.reduce((a, x) => a + num(x[c]), 0);
    const t = tabla([
      {clave: 'fecha', et: 'Fecha', pinta: x => fechaCorta(x.fecha)},
      {clave: 'tipo', et: 'Tipo', pinta: x => x.tipo === 'emitida' ? 'Emitida' : 'Recibida'},
      {clave: 'emisor', et: 'Emisor', valor: x => x.tipo === 'emitida' ? (x.receptor || nombreCliente(x.cliente_id) || '—') : (x.emisor || '—')},
      {clave: 'numero', et: 'Nº'},
      {clave: 'cliente_id', et: 'Cliente', valor: x => nombreCliente(x.cliente_id) || '—'},
      {clave: 'categoria', et: 'Concepto de gasto', valor: x => x.tipo === 'emitida' ? '—' : (x.categoria ? etiquetaCat(x.categoria) : '—')},
      {clave: 'base', et: 'Base', num: true, pinta: x => eur2(x.base)},
      {clave: 'iva', et: 'IVA', num: true, pinta: x => eur2(x.iva)},
      {clave: 'total', et: 'Total', num: true, pinta: x => eur2(x.total)},
      {clave: 'estado_pago', et: 'Estado', valor: x => x.estado_pago === 'pagado' ? (x.tipo === 'emitida' ? 'Cobrada' : 'Pagada') : 'Pendiente'}
    ], fs, {alPulsar: abrir, csv: 'Facturas_escaneadas.csv', vacio: 'Aún no hay facturas escaneadas en estas fechas.'});
    poner(lista,
      kpis([kpi('Facturas', String(fs.length)),
        kpi('Recibidas · base', eur2(s(rec, 'base')), 'IVA soportado ' + eur2(s(rec, 'iva'))),
        kpi('Emitidas · base', eur2(s(emi, 'base')), 'IVA repercutido ' + eur2(s(emi, 'iva'))),
        kpi('Pendiente de pago', eur2(s(rec.filter(x => x.estado_pago !== 'pagado'), 'total')))]),
      tarjeta('Facturas escaneadas', t, {sinRelleno: true,
        acciones: [h('button.btn.mini', {onclick: () => t.exportar && t.exportar()}, 'Exportar CSV')]}));
  }

  async function abrir(fila) {
    const r = await api.pedir('facturaDoc', {id: fila.id});
    editor({datos: r.factura, guardada: r.factura, alGuardar: recargar});
  }

  poner(caja, tarjeta('Subir una factura', zona, {subtitulo: 'PDF, imagen o foto · queda guardada en el Drive y contabilizada'}), f.nodo, lista);
  await recargar();
  return caja;
}

/* ---------- ventana de revisión ---------- */
function editor({datos, leido, guardada, alGuardar}) {
  const clientes = (api.estado.clientes || []).map(c => [c.id, [c.direccion, c.nombre].filter(Boolean).join(' · ')])
    .sort((a, b) => a[1].localeCompare(b[1], 'es'));
  const form = formulario([
    {separador: 'Factura'},
    {id: 'tipo', et: 'Tipo', tipo: 'select', vacio: false, opciones: [['recibida', 'Recibida (gasto)'], ['emitida', 'Emitida (ingreso)']]},
    {id: 'numero', et: 'Nº de factura'},
    {id: 'fecha', et: 'Fecha', tipo: 'fecha', requerido: true},
    {id: 'vencimiento', et: 'Vencimiento', tipo: 'fecha'},
    {id: 'emisor', et: 'Emisor', ancho: 2},
    {id: 'emisor_nif', et: 'NIF del emisor'},
    {id: 'receptor', et: 'Receptor', ancho: 2},
    {id: 'receptor_nif', et: 'NIF del receptor'},
    {id: 'concepto', et: 'Concepto', ancho: 3},
    {separador: 'Importes (€)'},
    {id: 'base', et: 'Base imponible', tipo: 'euro', requerido: true},
    {id: 'iva_pct', et: 'IVA (%)', tipo: 'numero', paso: '0.01'},
    {id: 'iva', et: 'Cuota de IVA', tipo: 'euro'},
    {id: 'irpf_pct', et: 'IRPF (%)', tipo: 'numero', paso: '0.01'},
    {id: 'irpf', et: 'Retención IRPF', tipo: 'euro'},
    {id: 'total', et: 'Total factura', tipo: 'euro', requerido: true},
    {separador: 'Asociar y contabilizar'},
    {id: 'cliente_id', et: 'Cliente (opcional)', tipo: 'select', vacio: '— sin cliente —', opciones: clientes, ancho: 2},
    {id: 'categoria', et: 'Concepto de gasto', tipo: 'select', vacio: '— sin concepto —', opciones: api.opciones('categoriasGasto')},
    {id: 'estado_pago', et: 'Estado', tipo: 'select', vacio: false, opciones: [['pendiente', 'Pendiente'], ['pagado', 'Pagada / cobrada']]},
    {id: 'fecha_pago', et: 'Fecha de pago o cobro', tipo: 'fecha'},
    {id: 'notas', et: 'Notas', tipo: 'area', filas: 2, ancho: 3}
  ], datos);

  /* aviso si no cuadra total = base + IVA − IRPF */
  const cuadre = h('.nota', {estilo: {margin: '6px 0'}});
  const revisar = () => {
    const v = form.leer();
    const dif = r2(num(v.base) + num(v.iva) - num(v.irpf) - num(v.total));
    poner(cuadre, Math.abs(dif) > 0.02
      ? h('span', {estilo: {color: '#b45309'}}, '⚠ No cuadra: base + IVA − IRPF da ' + eur2(num(v.base) + num(v.iva) - num(v.irpf)) + ' y el total es ' + eur2(v.total) + '.')
      : h('span', {estilo: {color: '#3f7d0b'}}, '✓ Los importes cuadran.'));
  };
  form.nodo.addEventListener('input', revisar);
  form.nodo.addEventListener('change', revisar);
  revisar();

  const texto = txt((leido && leido.texto) || (guardada && guardada.texto));
  const mini = (leido && leido.miniatura) || (guardada && guardada.miniatura);
  const verArchivo = guardada && guardada.archivo_id ? h('button.btn.mini', {onclick: async () => {
    const a = await api.pedir('archivoFacturaDoc', {id: guardada.id});
    const bytes = Uint8Array.from(atob(a.datos), c => c.charCodeAt(0));
    window.open(URL.createObjectURL(new Blob([bytes], {type: a.mime || 'application/octet-stream'})), '_blank');
  }}, 'Ver archivo original') : null;

  const lateral = h('div', {estilo: {display: 'flex', flexDirection: 'column', gap: '8px'}},
    mini ? h('img', {src: mini, alt: 'Factura', estilo: {width: '100%', maxWidth: '260px', border: '1px solid #ddd', borderRadius: '6px'}}) : null,
    verArchivo,
    leido ? h('small.nota', 'Leída con: ' + leido.metodo) : null);
  const detalles = h('details', {estilo: {marginTop: '10px'}},
    h('summary', 'Texto completo leído (' + texto.length + ' caracteres)'),
    h('pre', {estilo: {whiteSpace: 'pre-wrap', maxHeight: '260px', overflow: 'auto', fontSize: '12px', background: '#f7f7f5', padding: '8px', borderRadius: '6px'}}, texto || '—'));

  const btn = h('button.btn.primario', guardada ? 'Guardar cambios' : 'Guardar y contabilizar');
  const borrar = guardada ? h('button.btn.peligro', {onclick: async () => {
    if (!await confirmar('Se borra la factura, su archivo del Drive y el ' + (guardada.tipo === 'emitida' ? 'registro de factura emitida' : 'gasto') + ' que creó. No se puede deshacer.', {botón: 'Borrar'})) return;
    await api.pedir('borrarFacturaDoc', {id: guardada.id});
    aviso('Factura borrada.'); v.cerrar(); await alGuardar();
  }}, 'Borrar') : null;

  const v = ventana({
    titulo: guardada ? 'Factura ' + (guardada.numero || guardada.id) : 'Revisar la factura leída',
    ancha: true,
    cuerpo: h('div',
      h('div', {estilo: {display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 260px', gap: '16px'}}, h('div', form.nodo, cuadre), lateral),
      detalles),
    acciones: [borrar, h('button.btn', {onclick: () => v.cerrar()}, 'Cancelar'), btn].filter(Boolean)
  });

  btn.addEventListener('click', async () => {
    const falta = form.validar();
    if (falta) return aviso('Falta rellenar: ' + falta, 'error');
    const d = form.leer();
    if (guardada) d.id = guardada.id;
    if (leido) { d.texto = leido.texto; d.miniatura = leido.miniatura; d.lineas = datos.lineas || []; }
    btn.disabled = true; poner(btn, h('span.cargando'), ' Guardando');
    const enviar = forzar => api.pedir('guardarFacturaDoc', Object.assign({factura: d, forzar: forzar ? 1 : 0},
      leido && !guardada ? leido.subir : {})).catch(e => { if (e.datos && e.datos.duplicada) return e.datos; throw e; });
    try {
      let r = await enviar(false);
      if (r && r.duplicada) {
        if (!await confirmar(r.error + ' ¿Guardarla otra vez?', {botón: 'Guardar igualmente', peligro: false})) { btn.disabled = false; btn.textContent = 'Guardar y contabilizar'; return; }
        r = await enviar(true);
      }
      if (!r || r.ok === false) throw new Error((r && r.error) || 'No se ha podido guardar.');
      aviso(d.tipo === 'emitida' ? 'Factura guardada y apuntada en facturas emitidas.' : 'Factura guardada y contabilizada como gasto.');
      v.cerrar();
      await api.cargarDatos().catch(() => {});
      await alGuardar();
    } catch (e) {
      aviso(e.message || String(e), 'error');
      btn.disabled = false; btn.textContent = guardada ? 'Guardar cambios' : 'Guardar y contabilizar';
    }
  });
}
