/* portal.js — App de clientes (clientes.zerowattios.com) y de subcontratas
 * (contratas.zerowattios.com) de Zero Wattios. 10/11/2026.
 *
 * Una sola página para las dos: el modo sale del nombre del dominio. Habla con
 * el mismo backend que el CRM (/api/) pero solo con las acciones «portal*»,
 * que tienen sus propias cuentas y sesiones.
 */
(function () {
  'use strict';

  /* ---------- modo y sesión ---------- */
  const host = location.hostname;
  const qs = new URLSearchParams(location.search);
  const camino = location.pathname;
  const MODO = host.indexOf('contratas.') === 0 || /^\/contratas(\/|$)/.test(camino) ? 'contrata'
    : host.indexOf('clientes.') === 0 || /^\/clientes(\/|$)/.test(camino) ? 'cliente'
    : (qs.get('modo') === 'contrata' ? 'contrata' : 'cliente');
  /* El manifest de la app que toca (para «añadir a la pantalla de inicio»). */
  try { const m = document.querySelector('link[rel=manifest]'); if (m) m.href = '/assets/portal/manifest-' + MODO + '.webmanifest'; } catch (e) { /* nada */ }
  const ES_CLIENTE = MODO === 'cliente';
  const K_TOKEN = 'zw.portal.' + MODO + '.token';
  const API = '/api/';
  let token = '';
  let previa = false;
  let D = null;                 // lo que devuelve portalInicio
  let obraAbierta = null;       // detalle de una obra (subcontrata)
  let instSel = 0;              // instalación elegida (cliente con varias)

  const leerLS = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const ponerLS = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { /* nada */ } };

  /* «Ver como» del superadmin: llega un token de vista previa en el enlace. */
  const mVc = /(?:^#|&)vc=([a-f0-9]{20,})/.exec(location.hash);
  if (mVc) {
    try { sessionStorage.setItem(K_TOKEN + '.vc', mVc[1]); } catch (e) { /* nada */ }
    history.replaceState(null, '', location.pathname + location.search + '#inicio');
  }
  try { const vc = sessionStorage.getItem(K_TOKEN + '.vc'); if (vc) { token = vc; previa = true; } } catch (e) { /* nada */ }
  if (!token) token = leerLS(K_TOKEN);

  /* ---------- utilidades ---------- */
  function h(sel, props, ...hijos) {
    const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(sel) || [];
    const el = document.createElement(m[1] || 'div');
    (m[2] || '').replace(/([.#])([\w-]+)/g, (_, t, v) => { if (t === '.') el.classList.add(v); else el.id = v; });
    if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { hijos.unshift(props); props = null; }
    for (const k in props || {}) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'estilo') Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    const meter = x => { if (x == null || x === false) return; if (Array.isArray(x)) return x.forEach(meter); el.appendChild(x instanceof Node ? x : document.createTextNode(String(x))); };
    hijos.forEach(meter);
    return el;
  }
  const $ = s => document.querySelector(s);
  const txt = v => String(v == null ? '' : v).trim();
  const app = () => $('#app');
  const poner = (el, ...hijos) => { el.innerHTML = ''; hijos.flat().forEach(x => x && el.appendChild(x)); return el; };
  const eur = n => new Intl.NumberFormat('es-ES', {style: 'currency', currency: 'EUR', maximumFractionDigits: 0}).format(Number(n) || 0);
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  function fecha(iso, conHora) {
    const s = txt(iso); if (!s) return '';
    const d = new Date(s.replace(' ', 'T'));
    if (isNaN(d)) return s;
    const f = d.getDate() + ' ' + MESES[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
    return conHora && s.length > 10 ? f + ', ' + s.slice(11, 16) : f;
  }
  function fechaLarga(iso) {
    const s = txt(iso); if (!s) return '';
    const d = new Date(s.slice(0, 10) + 'T12:00');
    if (isNaN(d)) return s;
    return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][d.getMonth()];
  }
  function haceCuanto(iso) {
    const s = txt(iso); if (!s) return '';
    const d = new Date(s.replace(' ', 'T')); if (isNaN(d)) return s;
    const min = Math.round((Date.now() - d) / 60000);
    if (min < 1) return 'ahora mismo';
    if (min < 60) return 'hace ' + min + ' min';
    if (min < 1440) return 'hace ' + Math.round(min / 60) + ' h';
    if (min < 2880) return 'ayer';
    return fecha(s);
  }
  function quedan(iso) {
    const s = txt(iso); if (!s) return '';
    const d = new Date(s.replace(' ', 'T')); if (isNaN(d)) return '';
    const min = Math.round((d - Date.now()) / 60000);
    if (min < 0) return 'fuera de plazo';
    if (min < 60) return 'quedan ' + min + ' min';
    if (min < 2880) return 'quedan ' + Math.round(min / 60) + ' h';
    return 'quedan ' + Math.round(min / 1440) + ' días';
  }
  const hoyISO = () => new Date().toLocaleDateString('sv-SE');

  function toast(msg, tipo) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const t = h('.toast' + (tipo ? '.' + tipo : ''), msg);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), tipo === 'error' ? 5200 : 2800);
  }

  async function pedir(accion, params = {}) {
    let r;
    try {
      const res = await fetch(API, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify(Object.assign({accion, token, agente: navigator.userAgent.slice(0, 120)}, params))});
      r = await res.json();
    } catch (e) { throw new Error('Sin conexión. Revisa la cobertura y vuelve a intentarlo.'); }
    if (r && r.sesion === false) { salirLocal(); throw new Error(r.error || 'Vuelve a entrar.'); }
    return r || {ok: false, error: 'Respuesta vacía.'};
  }

  /* ---------- iconos (trazo, 24×24) ---------- */
  const P = {
    casa: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
    foto: 'M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    doc: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z M14 3v5h5 M8 13h8 M8 17h6',
    ayuda: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14 M12 17.5v.01',
    firma: 'M4 20h16 M6 16l9.5-9.5a2.1 2.1 0 0 1 3 3L9 19H6z',
    sello: 'M9 3h6v5l3 3v3H6v-3l3-3z M5 18h14v3H5z',
    caja: 'M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10',
    obra: 'M2 20h20 M5 20V10l7-5 7 5v10 M9 20v-5h6v5',
    rayo: 'M13 2L4 14h7l-1 8 9-12h-7z',
    papel: 'M7 3h7l5 5v13H7z M14 3v5h5 M10 13l2 2 4-4',
    fin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M8 12l3 3 5-6',
    check: 'M5 12l5 5 9-10',
    sol: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M1 12h2 M21 12h2 M4.2 19.8l1.4-1.4 M18.4 5.6l1.4-1.4',
    panel: 'M3 18l3-12h12l3 12z M4.5 12h15 M9 6l-1.5 12 M15 6l1.5 12',
    inversor: 'M5 3h14v18H5z M8 7h8 M8 11h8 M12 15v3',
    bateria: 'M7 4h10v17H7z M10 2h4v2 M10 10h4 M10 14h4',
    enchufe: 'M9 2v5 M15 2v5 M6 7h12v4a6 6 0 0 1-12 0z M12 17v5',
    aero: 'M12 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0 M12 10c0-4 2-7 5-7 1 3-1 6-5 7 M14 12c4 0 7 2 7 5-3 1-6-1-7-5 M12 14c0 4-2 7-5 7-1-3 1-6 5-7 M10 12c-4 0-7-2-7-5 3-1 6 1 7 5',
    deposito: 'M7 5a5 2 0 0 1 10 0v14a5 2 0 0 1-10 0z M7 5a5 2 0 0 0 10 0',
    suelo: 'M3 18h18 M5 14c2-2 4 2 6 0s4 2 6 0 4 2 4 0',
    telefono: 'M5 3h4l2 5-3 2a11 11 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z',
    mapa: 'M12 21s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12z M12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    camara: 'M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    reloj: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
    entrar: 'M10 17l5-5-5-5 M15 12H3 M14 3h6v18h-6',
    salir: 'M14 17l5-5-5-5 M19 12H7 M10 3H4v18h6',
    chat: 'M4 5h16v11H8l-4 4z',
    bandera: 'M5 21V4 M5 4h11l-2 4 2 4H5',
    descarga: 'M12 3v12 M7 10l5 5 5-5 M4 21h16',
    subir: 'M12 21V9 M7 14l5-5 5 5 M4 3h16',
    libro: 'M4 4h6a3 3 0 0 1 3 3v14a2 2 0 0 0-2-2H4z M20 4h-6a3 3 0 0 0-3 3v14a2 2 0 0 1 2-2h7z',
    euro: 'M17 6a7 7 0 1 0 0 12 M4 10h10 M4 14h10',
    escudo: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4',
    lista: 'M9 6h11 M9 12h11 M9 18h11 M4 6h.01 M4 12h.01 M4 18h.01',
    nota: 'M5 4h14v12l-4 4H5z M15 20v-4h4',
    usuario: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
    alerta: 'M12 3l10 18H2z M12 10v5 M12 18v.01',
    llave: 'M15 7a4 4 0 1 1-3.5 6L5 19.5V22H2v-3l6.5-6.5A4 4 0 0 1 15 7z M16 8h.01',
    mas: 'M12 5v14 M5 12h14'
  };
  function ico(n) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.9'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    (P[n] || P.doc).split(/ (?=M)/).forEach(d => { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.appendChild(p); });
    return s;
  }
  const ICONO_EQUIPO = {paneles: 'panel', inversor: 'inversor', bateria: 'bateria', cargador: 'enchufe', aerotermia: 'aero', acs: 'deposito', inercia: 'deposito', suelo: 'suelo'};
  const ICONO_PASO = {firma: 'firma', tramites: 'sello', material: 'caja', instalacion: 'obra', instalada: 'rayo', legalizacion: 'papel', fin: 'fin'};
  const CORTO_PASO = {firma: 'Firma', tramites: 'Trámites', material: 'Material', instalacion: 'Obra', instalada: 'Hecha', legalizacion: 'Legal', fin: 'Listo'};
  const ICONO_EVENTO = {llegada: 'entrar', salida: 'salir', fase: 'check', foto: 'foto', documento: 'doc', terminada: 'fin', nota: 'nota', aviso: 'bandera'};

  /* ---------- hojas (ventanas que suben desde abajo) ---------- */
  function hoja(titulo, cuerpo, {alCerrar} = {}) {
    const fondo = h('.fondo-hoja');
    const cerrar = () => { fondo.remove(); if (alCerrar) alCerrar(); };
    fondo.addEventListener('click', e => { if (e.target === fondo) cerrar(); });
    fondo.appendChild(h('.hoja', {role: 'dialog', 'aria-label': titulo}, h('.asa'), titulo ? h('h2', titulo) : null, cuerpo));
    document.body.appendChild(fondo);
    return cerrar;
  }

  function cargandoGrande(texto) {
    const d = h('.subiendo', h('div', h('span', texto || 'Un momento…'), h('.barra', h('i', {estilo: {width: '35%'}}))));
    document.body.appendChild(d);
    let w = 35; const t = setInterval(() => { w = Math.min(92, w + (95 - w) * 0.08); const i = d.querySelector('i'); if (i) i.style.width = w + '%'; }, 250);
    return () => { clearInterval(t); d.remove(); };
  }

  /* ---------- descargas y visor ---------- */
  async function abrir(params, nombreSugerido) {
    const fin = cargandoGrande('Abriendo…');
    let r;
    try { r = await pedir('portalDescargar', params); } catch (e) { fin(); return toast(e.message, 'error'); }
    fin();
    if (!r.ok) return toast(r.error || 'No se ha podido abrir.', 'error');
    const bin = atob(r.datos || '');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const mime = r.mime || 'application/octet-stream';
    const url = URL.createObjectURL(new Blob([bytes], {type: mime}));
    const nombre = r.nombre || nombreSugerido || 'archivo';
    const v = h('.visor');
    const cerrar = () => { v.remove(); URL.revokeObjectURL(url); };
    const cuerpo = mime.indexOf('image/') === 0 ? h('img', {src: url, alt: nombre})
      : mime === 'application/pdf' ? h('iframe', {src: url, title: nombre})
      : h('p', {estilo: {color: '#fff'}}, 'Pulsa «Descargar» para guardarlo.');
    v.append(h('.barra-v', h('button.btn.chico.borde', {onclick: cerrar}, '✕'), h('b', nombre),
      h('a.btn.chico.lima', {href: url, download: nombre}, ico('descarga'), 'Descargar')), h('.cuerpo-v', cuerpo));
    document.body.appendChild(v);
  }

  /* ---------- fotos: reducir antes de subir ---------- */
  function leerArchivo(f) {
    return new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => mal(new Error('No se ha podido leer el archivo.')); r.readAsDataURL(f); });
  }
  function cargarImagen(url) { return new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error('Esa imagen no se puede abrir.')); i.src = url; }); }
  function dibuja(img, lado, calidad) {
    const k = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', calidad);
  }
  async function prepararArchivo(f) {
    const url = await leerArchivo(f);
    if ((f.type || '').indexOf('image/') === 0 && !/gif|svg/.test(f.type)) {
      const img = await cargarImagen(url);
      const grande = dibuja(img, 1800, 0.82);
      return {nombre: (f.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg', mime: 'image/jpeg', datos: grande.split(',')[1], miniatura: dibuja(img, 220, 0.55)};
    }
    if (f.size > 12 * 1024 * 1024) throw new Error('El archivo pasa de 12 MB.');
    return {nombre: f.name || 'documento', mime: f.type || 'application/octet-stream', datos: url.split(',')[1], miniatura: ''};
  }
  function elegirArchivos({camara, multiple, aceptar}) {
    return new Promise(ok => {
      const i = h('input', {type: 'file', accept: aceptar || 'image/*', multiple: multiple ? true : null, capture: camara ? 'environment' : null, estilo: {display: 'none'}});
      i.addEventListener('change', () => { ok(Array.from(i.files || [])); i.remove(); });
      document.body.appendChild(i); i.click();
    });
  }

  /* ======================================================================
     Entrada
     ====================================================================== */
  function pantallaEntrada(paso = 'login', msg = '', emailPrevio = '') {
    document.title = ES_CLIENTE ? 'Mi instalación · Zero Wattios' : 'Obras · Zero Wattios';
    const error = h('.error', {hidden: !msg || paso === 'aviso'}, msg);
    const bien = h('.bien', {hidden: paso !== 'aviso'}, msg);
    const titulo = ES_CLIENTE
      ? h('h1', 'Tu instalación, ', h('em', 'en tiempo real'), '.')
      : h('h1', 'Tus obras con ', h('em', 'Zero Wattios'), '.');
    const sub = h('p.sub', ES_CLIENTE ? 'Sigue cada paso, mira las fotos y ten tus documentos, manuales y facturas a mano.'
      : 'Avisos, fichas de obra, fotos, legalizaciones y tickets en un solo sitio.');
    let form;
    const mal = m => { error.textContent = m; error.hidden = false; bien.hidden = true; };
    if (paso === 'login') {
      const u = h('input', {type: ES_CLIENTE ? 'email' : 'text', autocomplete: 'username', inputmode: ES_CLIENTE ? 'email' : null, autocapitalize: 'none', required: true, value: emailPrevio});
      const c = h('input', {type: 'password', autocomplete: 'current-password', required: true});
      const boton = h('button.btn.lima.ancho', {type: 'submit'}, 'Entrar');
      form = h('form', {onsubmit: async e => {
        e.preventDefault(); boton.disabled = true; error.hidden = true;
        try {
          const r = await pedir('portalLogin', {tipo: MODO, usuario: u.value, clave: c.value});
          if (!r.ok) { mal(r.error); return; }
          token = r.token; ponerLS(K_TOKEN, token); arrancar();
        } catch (er) { mal(er.message); } finally { boton.disabled = false; }
      }},
        h('label', ES_CLIENTE ? 'Tu correo' : 'Usuario', u),
        h('label', 'Clave', c),
        error, bien, boton,
        ES_CLIENTE ? h('button.enlace', {type: 'button', onclick: () => pantallaEntrada('codigo', '', u.value)}, 'Es mi primera vez · He olvidado mi clave') : null);
    } else if (paso === 'codigo' || paso === 'aviso') {
      const u = h('input', {type: 'email', autocomplete: 'email', inputmode: 'email', autocapitalize: 'none', required: true, value: emailPrevio});
      const boton = h('button.btn.lima.ancho', {type: 'submit'}, 'Mandarme un código');
      form = h('form', {onsubmit: async e => {
        e.preventDefault(); boton.disabled = true;
        try {
          const r = await pedir('portalCodigo', {email: u.value});
          if (!r.ok) { mal(r.error); return; }
          pantallaEntrada('clave', r.mensaje, u.value);
        } catch (er) { mal(er.message); } finally { boton.disabled = false; }
      }},
        h('p', {estilo: {margin: 0, color: '#c9cbc3'}}, 'Escribe el correo que diste al firmar. Te mandamos un código para crear tu clave.'),
        h('label', 'Tu correo', u), error, boton,
        h('button.enlace', {type: 'button', onclick: () => pantallaEntrada('login', '', u.value)}, '← Ya tengo clave'));
    } else {
      const cod = h('input', {type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, required: true, estilo: {letterSpacing: '6px', fontSize: '22px', textAlign: 'center'}});
      const c1 = h('input', {type: 'password', autocomplete: 'new-password', required: true});
      const c2 = h('input', {type: 'password', autocomplete: 'new-password', required: true});
      const boton = h('button.btn.lima.ancho', {type: 'submit'}, 'Guardar clave y entrar');
      form = h('form', {onsubmit: async e => {
        e.preventDefault();
        if (c1.value !== c2.value) return mal('Las dos claves no coinciden.');
        boton.disabled = true;
        try {
          const r = await pedir('portalCrearClave', {email: emailPrevio, codigo: cod.value, clave: c1.value});
          if (!r.ok) { mal(r.error); return; }
          token = r.token; ponerLS(K_TOKEN, token); arrancar();
        } catch (er) { mal(er.message); } finally { boton.disabled = false; }
      }},
        h('.bien', msg || 'Revisa tu correo.'),
        h('label', 'Código de 6 cifras', cod),
        h('label', 'Tu nueva clave (8 o más, con letras y números)', c1),
        h('label', 'Repite la clave', c2), error, boton,
        h('button.enlace', {type: 'button', onclick: () => pantallaEntrada('codigo', '', emailPrevio)}, 'No me ha llegado: pedir otro'));
    }
    poner(app(), h('.entrada',
      h('img.logo', {src: '/assets/img/logo-dark-h96.png', alt: 'ZERO WATTIOS'}),
      titulo, sub, form,
      h('p.pie', ES_CLIENTE ? 'Área privada de clientes de Zero Wattios Ingeniería.' : 'Área privada de instaladores de Zero Wattios Ingeniería.')));
    const primero = app().querySelector('input'); if (primero && !primero.value) setTimeout(() => primero.focus(), 50);
  }

  function salirLocal() {
    if (previa) { try { sessionStorage.removeItem(K_TOKEN + '.vc'); } catch (e) { /* nada */ } previa = false; }
    else ponerLS(K_TOKEN, '');
    token = ''; D = null;
  }

  /* ======================================================================
     Armazón
     ====================================================================== */
  const PESTANAS = ES_CLIENTE
    ? [['inicio', 'Mi obra', 'casa'], ['fotos', 'Fotos', 'foto'], ['documentos', 'Documentos', 'doc'], ['ayuda', 'Ayuda', 'ayuda']]
    : [['inicio', 'Obras', 'obra'], ['avisos', 'Avisos', 'bandera'], ['tickets', 'Tickets', 'chat']];

  function ruta() { const p = (location.hash || '#inicio').slice(1).split('/'); return {v: p[0] || 'inicio', id: p[1] ? decodeURIComponent(p[1]) : ''}; }
  function ir(r) { if (location.hash === '#' + r) pintar(); else location.hash = '#' + r; }

  async function arrancar() {
    if (!token) return pantallaEntrada();
    try {
      const r = await pedir('portalInicio');
      if (!r.ok) { salirLocal(); return pantallaEntrada('login', r.error || ''); }
      D = r;
      document.title = ES_CLIENTE ? 'Mi instalación · Zero Wattios' : 'Obras · ' + (D.cuenta.empresa || D.cuenta.nombre || 'Zero Wattios');
      pintar();
    } catch (e) {
      if (!token) return pantallaEntrada('login', e.message);
      poner(app(), h('.entrada', h('img.logo', {src: '/assets/img/logo-dark-h96.png', alt: 'ZERO WATTIOS'}), h('h1', 'Sin conexión'),
        h('p.sub', e.message), h('button.btn.lima', {onclick: arrancar}, 'Reintentar')));
    }
  }

  async function refrescar() {
    try { const r = await pedir('portalInicio'); if (r.ok) { D = r; } } catch (e) { /* se queda lo que había */ }
  }

  function inicialesDe(s) { return txt(s).split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase() || '·'; }

  function pintar() {
    if (!D) return arrancar();
    const {v, id} = ruta();
    const enObra = !ES_CLIENTE && v === 'obra';
    const nombre = ES_CLIENTE ? (D.cliente.nombre || D.cuenta.nombre) : (D.cuenta.empresa || D.cuenta.nombre);
    const cab = h('header.cabecera',
      enObra ? h('button.atras', {onclick: () => ir('inicio'), 'aria-label': 'Volver'}, '‹') : h('img.logo', {src: '/assets/img/logo-dark-h96.png', alt: 'ZERO WATTIOS'}),
      enObra ? h('.tit', 'Ficha de obra') : h('.tit'),
      h('button.yo', {onclick: menuYo, 'aria-label': 'Mi cuenta'}, inicialesDe(nombre)));
    const main = h('main');
    const nav = h('nav.pestanas', PESTANAS.map(([k, et, ic]) => {
      const b = h('button' + ((v === k || (enObra && k === 'inicio')) ? '.activa' : ''), {onclick: () => ir(k)}, ico(ic), et);
      const n = k === 'avisos' ? (D.avisos || []).filter(a => a.vencido || a.fecha <= hoyISO()).length
        : k === 'ayuda' || k === 'tickets' ? (D.tickets || []).filter(t => t.estado === 'en_curso' && ultimoEsDeZW(t)).length : 0;
      if (n) b.appendChild(h('span.punto', n));
      return b;
    }));
    poner(app(), previa ? h('.previa', 'Vista previa (solo lectura) · ' + nombre) : null, cab, main, nav);
    window.scrollTo(0, 0);
    if (ES_CLIENTE) {
      if (v === 'fotos') vistaFotos(main);
      else if (v === 'documentos') vistaDocumentos(main);
      else if (v === 'ayuda') vistaAyuda(main, id);
      else vistaInicioCliente(main);
    } else {
      if (v === 'obra' && id) vistaObra(main, id);
      else if (v === 'avisos') vistaAvisos(main);
      else if (v === 'tickets') vistaAyuda(main, id);
      else vistaObras(main);
    }
  }
  const ultimoEsDeZW = t => { const m = (t.mensajes || []); return m.length && m[m.length - 1].de === 'zw'; };

  function menuYo() {
    const c = D.cuenta;
    const cuerpo = h('.menu-yo',
      h('.quien', h('b', ES_CLIENTE ? (D.cliente.nombre || c.nombre) : (c.empresa || c.nombre)), h('span.nota', c.usuario),
        !ES_CLIENTE && c.especialidad ? h('span.nota', 'Instalador de ' + c.especialidad) : null),
      h('.contacto',
        h('.fila', h('span', 'Teléfono Zero Wattios'), h('b', D.contacto.telefono || '—')),
        h('.fila', h('span', 'Correo'), h('b', D.contacto.email || '—'))),
      D.contacto.telefono ? h('a.btn.borde.ancho', {href: 'tel:' + D.contacto.telefono.replace(/\s/g, '')}, ico('telefono'), 'Llamar a Zero Wattios') : null,
      previa ? null : h('button.btn.borde.ancho', {onclick: () => { cerrar(); cambiarClave(); }}, ico('llave'), 'Cambiar mi clave'),
      h('button.btn.peligro.ancho', {onclick: async () => {
        cerrar();
        try { await pedir('portalSalir'); } catch (e) { /* da igual */ }
        salirLocal(); pantallaEntrada();
      }}, ico('salir'), previa ? 'Cerrar vista previa' : 'Salir'));
    const cerrar = hoja('Mi cuenta', cuerpo);
  }

  function cambiarClave() {
    const a = h('input', {type: 'password', autocomplete: 'current-password'});
    const n1 = h('input', {type: 'password', autocomplete: 'new-password'});
    const n2 = h('input', {type: 'password', autocomplete: 'new-password'});
    const b = h('button.btn.lima.ancho', {type: 'submit'}, 'Cambiar clave');
    const f = h('form.form', {onsubmit: async e => {
      e.preventDefault();
      if (n1.value !== n2.value) return toast('Las dos claves nuevas no coinciden.', 'error');
      b.disabled = true;
      try {
        const r = await pedir('portalCambiarClave', {actual: a.value, nueva: n1.value});
        if (!r.ok) return toast(r.error, 'error');
        token = r.token; ponerLS(K_TOKEN, token); cerrar(); toast('Clave cambiada', 'ok');
      } catch (er) { toast(er.message, 'error'); } finally { b.disabled = false; }
    }}, h('label.campo', h('span', 'Clave actual'), a), h('label.campo', h('span', 'Nueva clave (8 o más, con letras y números)'), n1),
      h('label.campo', h('span', 'Repite la nueva'), n2), b);
    const cerrar = hoja('Cambiar mi clave', f);
  }

  /* ======================================================================
     CLIENTE
     ====================================================================== */
  function anillo(pct, centro, pie) {
    const r = 52, L = 2 * Math.PI * r;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 124 124');
    const c = (cls, off) => { const e = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      e.setAttribute('cx', 62); e.setAttribute('cy', 62); e.setAttribute('r', r); e.setAttribute('fill', 'none'); e.setAttribute('stroke-width', 11);
      e.setAttribute('class', cls); e.setAttribute('stroke-dasharray', L); e.setAttribute('stroke-dashoffset', off); return e; };
    svg.appendChild(c('fondo', 0));
    const v = c('valor', L);
    svg.appendChild(v);
    requestAnimationFrame(() => requestAnimationFrame(() => v.setAttribute('stroke-dashoffset', L * (1 - Math.max(0.02, pct / 100)))));
    return h('.anillo', svg, h('.dentro', h('div', h('b', centro), h('span', pie))));
  }

  function porcentajeInstalacion(inst) {
    const pasos = inst.pasos || [];
    const hechos = pasos.filter(p => p.estado === 'hecho').length;
    const ahora = pasos.find(p => p.estado === 'ahora');
    if (!ahora) return hechos >= pasos.length ? 100 : Math.round(hechos / pasos.length * 100);
    const parte = ahora.clave === 'instalacion' ? Math.max(0.1, (inst.progreso || 0) / 100) : 0.5;
    return Math.min(99, Math.round((hechos + parte) / pasos.length * 100));
  }

  function vistaInicioCliente(main) {
    const insts = D.instalaciones || [];
    if (!insts.length) { main.appendChild(h('.tarjeta', h('.vacio', h('span.ico', '⏳'), 'Tu instalación aparecerá aquí en cuanto el proyecto esté firmado.'))); return; }
    if (instSel >= insts.length) instSel = 0;
    const inst = insts[instSel];
    const pasos = inst.pasos || [];
    const ahora = pasos.find(p => p.estado === 'ahora') || pasos[pasos.length - 1];
    const pct = porcentajeInstalacion(inst);
    const primer = txt(D.cliente.nombre).split(/\s+/)[0] || '';

    main.appendChild(h('.hola', h('h1', 'Hola' + (primer ? ', ' + primer : '')), h('p', [D.cliente.direccion, D.cliente.municipio].filter(Boolean).join(', '))));
    if (insts.length > 1) main.appendChild(h('div', {estilo: {display: 'flex', gap: '8px', flexWrap: 'wrap'}}, insts.map((x, i) =>
      h('button.btn.chico' + (i === instSel ? '.negro' : '.borde'), {onclick: () => { instSel = i; pintar(); }}, x.tipo))));

    /* 1. Dónde estamos: grande, de un vistazo */
    const fechaInst = inst.fecha_prevista && ahora && ['tramites', 'material', 'instalacion', 'firma'].includes(ahora.clave) && inst.fecha_prevista >= hoyISO()
      ? h('.fecha', ico('reloj'), 'Instalación prevista: ' + fechaLarga(inst.fecha_prevista)) : null;
    main.appendChild(h('section.estado-grande',
      h('.tipo', inst.tipo),
      h('.fila', anillo(pct, pct + '%', 'completado'),
        h('.ahora', h('small', ahora && ahora.estado === 'hecho' ? '¡Terminado!' : 'Ahora mismo'), h('h2', ahora ? ahora.titulo : ''),
          h('p', ahora ? ahora.texto : ''))),
      fechaInst,
      h('.camino', pasos.map(p => h('.paso.' + p.estado, h('.bola', ico(p.estado === 'hecho' && p.clave !== 'fin' ? 'check' : ICONO_PASO[p.clave])), h('span', CORTO_PASO[p.clave] || p.titulo))))));

    /* 2. El avance de la obra, si está en marcha */
    const obras = inst.obras || [];
    if (obras.length && obras.some(o => o.estado !== 'asignada')) {
      main.appendChild(h('.tarjeta', h('h2', 'Avance de la obra'),
        h('div', {estilo: {display: 'grid', gap: '12px'}}, obras.map(o => h('div',
          h('div', {estilo: {display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '14px'}},
            h('b', o.especialidad === 'aerotermia' ? 'Aerotermia' : 'Fotovoltaica'),
            h('span', {estilo: {fontWeight: 800}}, (o.progreso || 0) + '%')),
          h('.barra', h('i', {estilo: {width: (o.progreso || 0) + '%'}})),
          h('small.nota', o.estado === 'terminada' || o.estado === 'validada' ? 'Terminada el ' + fecha(o.terminada) : o.llegada ? 'Empezó el ' + fecha(o.llegada) : ''))))));
    }

    /* 3. Lo último que ha pasado */
    const diario = (D.diario || []).slice(0, 6);
    if (diario.length) main.appendChild(h('.tarjeta', h('h2', 'Lo último'), h('.diario', diario.map(e =>
      h('.ev', h('.ic', ico(ICONO_EVENTO[e.tipo] || 'nota')), h('div', h('b', e.texto), h('small', haceCuanto(e.fecha))))))));

    /* 4. Paso a paso, con detalle */
    main.appendChild(h('.tarjeta', h('h2', 'Paso a paso'), h('.linea-tiempo', pasos.map(p => h('.lt.' + p.estado,
      h('.marca', ico(p.estado === 'hecho' ? 'check' : ICONO_PASO[p.clave])),
      h('div', h('h3', p.titulo, p.estado === 'ahora' ? h('span.etq', 'AHORA') : null),
        p.fecha && (p.estado !== 'pendiente' || p.fecha >= hoyISO()) ? h('.cuando', (p.estado === 'pendiente' ? 'Previsto: ' : '') + fechaLarga(p.fecha)) : null,
        h('p', p.texto)))))));

    /* 5. Lo que te instalamos */
    if ((inst.equipos || []).length) main.appendChild(h('.tarjeta', h('h2', 'Tu equipo'), h('.equipos', inst.equipos.map(e =>
      h('.equipo', h('.ic', ico(ICONO_EQUIPO[e.clave] || iconoPorNombre(e.equipo))), h('div', h('b', e.equipo), h('small', e.detalle)), h('.cant', e.cantidad > 1 ? '×' + e.cantidad : ''))))));

    main.appendChild(h('.tarjeta', h('h2', '¿Necesitas algo?'), h('p.nota', {estilo: {marginTop: 0}}, 'Escríbenos desde aquí y te respondemos en el plazo indicado.'),
      h('button.btn.lima.ancho', {onclick: () => ir('ayuda')}, ico('chat'), 'Abrir una consulta')));
  }
  function iconoPorNombre(n) {
    n = txt(n).toLowerCase();
    if (/panel|placa/.test(n)) return 'panel'; if (/inversor/.test(n)) return 'inversor'; if (/bater/.test(n)) return 'bateria';
    if (/cargador/.test(n)) return 'enchufe'; if (/aero|bomba/.test(n)) return 'aero'; if (/dep/.test(n)) return 'deposito'; return 'caja';
  }

  function galeria(fotos, conPie) {
    return h('.galeria', fotos.map(f => h('button', {onclick: () => abrir({id: f.id}, f.nombre), 'aria-label': f.nombre},
      f.miniatura ? h('img', {src: f.miniatura, alt: f.nombre, loading: 'lazy'}) : h('.sin', f.nombre),
      conPie && (f.notas || f.subido) ? h('.pie', f.notas || fecha(f.subido)) : null)));
  }

  function vistaFotos(main) {
    const fotos = D.fotos || [];
    main.appendChild(h('.seccion', h('h2', 'Fotos de tu instalación', h('small', fotos.length ? fotos.length + '' : ''))));
    if (!fotos.length) { main.appendChild(h('.tarjeta', h('.vacio', h('span.ico', '📷'), 'Cuando el equipo empiece a trabajar, aquí verás las fotos de cada fase.'))); return; }
    const porDia = {};
    fotos.forEach(f => { const d = txt(f.subido).slice(0, 10); (porDia[d] = porDia[d] || []).push(f); });
    Object.keys(porDia).sort().reverse().forEach(d => main.appendChild(h('.tarjeta', h('h2', fechaLarga(d) || 'Fotos'), galeria(porDia[d], true))));
  }

  function filaDoc(icono, titulo, sub, alPulsar) {
    return h('button.doc', {onclick: alPulsar}, h('.ic', ico(icono)), h('div', h('b', titulo), sub ? h('small', sub) : null), h('span.baja', ico('descarga')));
  }

  function vistaDocumentos(main) {
    const docs = D.documentos || [];
    const manuales = D.manuales || [];
    const facturas = D.facturas || [];
    const ICO = {legalizacion: 'papel', certificado: 'escudo', manual: 'libro', garantia: 'escudo', aceptacion: 'firma', documento_cliente: 'doc'};
    main.appendChild(h('.seccion', h('h2', 'Documentos'), docs.length
      ? h('.docs', docs.map(d => filaDoc(ICO[d.clase] || 'doc', d.nombre, d.clase_nombre + ' · ' + fecha(d.subido), () => abrir({id: d.id}, d.nombre))))
      : h('.tarjeta', h('.vacio', h('span.ico', '📄'), 'Aquí irán apareciendo tu contrato, los certificados, la legalización y las garantías.'))));
    if (manuales.length) main.appendChild(h('.seccion', h('h2', 'Manuales de tus equipos'),
      h('.docs', manuales.map(m => filaDoc('libro', m.nombre, 'Ficha técnica · PDF', () => abrir({manual: m.clave}, m.nombre + '.pdf'))))));
    main.appendChild(h('.seccion', h('h2', 'Facturas'), facturas.length
      ? h('.docs', facturas.map(f => filaDoc('euro', 'Factura ' + f.numero, fecha(f.fecha) + ' · ' + eur(f.total) + ' (IVA incluido)' + (f.estado === 'cobrada' ? ' · Pagada' : ''),
          () => f.descargable ? abrir({factura_id: f.id}, 'Factura ' + f.numero + '.pdf') : toast('Esta factura aún no está para descargar. Pídenosla en «Ayuda».', 'error'))))
      : h('.tarjeta', h('.vacio', h('span.ico', '🧾'), 'Tus facturas aparecerán aquí.'))));
  }

  /* ======================================================================
     Ayuda / tickets (los dos)
     ====================================================================== */
  const PRIORIDADES = ES_CLIENTE
    ? [['urgente', 'Es urgente', 'Me he quedado sin calefacción, sin agua caliente o sin luz'], ['media', 'Algo no va bien', 'Funciona, pero hay algo raro o que no me convence'], ['baja', 'Tengo una duda', 'Una pregunta, una gestión o un papel']]
    : [['urgente', 'Urgente', 'No puedo seguir con la obra'], ['media', 'Media', 'Lo necesito para seguir en los próximos días'], ['baja', 'Baja', 'Consulta o gestión sin prisa']];
  const ESTADO_T = {abierto: ['Recibido', 'info'], en_curso: ['En marcha', 'aviso'], resuelto: ['Resuelto', 'ok'], cerrado: ['Cerrado', '']};
  const PRIO_T = {urgente: ['Urgente', 'mal'], media: ['Media', 'aviso'], baja: ['Baja', '']};
  function horasSla(p) { const s = (D.sla || {urgente: [4, 24], media: [24, 72], baja: [72, 168]})[p] || [24, 72]; const f = n => n < 48 ? n + ' h' : (n / 24) + ' días'; return 'respuesta en ' + f(s[0]) + ', solución en ' + f(s[1]); }

  function vistaAyuda(main, id) {
    const tickets = D.tickets || [];
    if (id) {
      const t = tickets.find(x => x.id === id);
      if (t) return vistaTicket(main, t);
    }
    main.appendChild(h('.seccion', h('h2', ES_CLIENTE ? '¿En qué te ayudamos?' : 'Tickets con Zero Wattios')));
    main.appendChild(h('button.btn.lima.ancho', {onclick: () => nuevoTicket()}, ico('mas'), ES_CLIENTE ? 'Abrir una consulta' : 'Abrir un ticket'));
    if (!tickets.length) main.appendChild(h('.tarjeta', h('.vacio', h('span.ico', '💬'), ES_CLIENTE ? 'No tienes consultas abiertas.' : 'No tienes tickets.')));
    else main.appendChild(h('div', {estilo: {display: 'grid', gap: '10px'}}, tickets.map(t => {
      const [et, cl] = ESTADO_T[t.estado] || [t.estado, ''];
      const abierto = t.estado === 'abierto' || t.estado === 'en_curso';
      return h('button.ticket', {onclick: () => ir((ES_CLIENTE ? 'ayuda/' : 'tickets/') + encodeURIComponent(t.id))},
        h('.arriba', h('span.chip.' + (cl || 'x'), et), !ES_CLIENTE ? h('span.chip.' + PRIO_T[t.prioridad][1], PRIO_T[t.prioridad][0]) : null,
          ultimoEsDeZW(t) && abierto ? h('span.chip.lima', 'Te hemos respondido') : null),
        h('b', t.titulo),
        h('small', 'Actualizado ' + haceCuanto(t.modificado) + (abierto ? ' · ' + (t.primera_respuesta ? quedan(t.limite_resolucion) + ' para resolverlo' : 'te respondemos ' + (quedan(t.limite_respuesta).replace('quedan', 'en menos de'))) : '')));
    })));
    if (D.contacto && D.contacto.telefono) main.appendChild(h('.tarjeta', h('h2', 'Si es muy urgente'),
      h('p.nota', {estilo: {marginTop: 0}}, 'Llámanos al ', h('b', {estilo: {userSelect: 'all', color: 'var(--texto)'}}, D.contacto.telefono), '.'),
      h('a.btn.borde.ancho', {href: 'tel:' + D.contacto.telefono.replace(/\s/g, '')}, ico('telefono'), 'Llamar')));
  }

  function nuevoTicket(obraId) {
    let prio = 'media';
    const opciones = h('.opciones', PRIORIDADES.map(([k, t, s]) => {
      const b = h('button.opcion' + (k === prio ? '.elegida' : ''), {type: 'button', onclick: () => { prio = k; opciones.querySelectorAll('.opcion').forEach(x => x.classList.remove('elegida')); b.classList.add('elegida'); plazo.textContent = 'Plazo: ' + horasSla(prio) + '.'; }},
        h('span.o'), h('div', h('b', t), h('small', s)));
      return b;
    }));
    const plazo = h('p.nota', {estilo: {margin: 0}}, 'Plazo: ' + horasSla(prio) + '.');
    const titulo = h('input', {type: 'text', maxlength: 200, placeholder: ES_CLIENTE ? 'Ej.: la app de las placas no muestra datos' : 'Ej.: falta material en obra'});
    const detalle = h('textarea', {placeholder: 'Cuéntanos qué pasa con el detalle que puedas.'});
    let obraSel = obraId || '';
    const selObra = !ES_CLIENTE && !obraId && (D.obras || []).length
      ? h('label.campo', h('span', 'Obra (si es de una obra)'), h('select', {onchange: e => { obraSel = e.target.value; }},
          h('option', {value: ''}, '— General —'), D.obras.map(o => h('option', {value: o.id}, o.direccion + ' · ' + o.especialidad)))) : null;
    const b = h('button.btn.lima.ancho', {type: 'submit'}, 'Enviar');
    const f = h('form.form', {onsubmit: async e => {
      e.preventDefault();
      if (!txt(titulo.value) && !txt(detalle.value)) return toast('Cuéntanos qué pasa.', 'error');
      b.disabled = true;
      try {
        const r = await pedir('portalTicket', {titulo: titulo.value, detalle: detalle.value, prioridad: prio, obra_id: obraSel});
        if (!r.ok) return toast(r.error, 'error');
        cerrar(); toast(ES_CLIENTE ? 'Recibido. Te responderemos pronto.' : 'Ticket enviado', 'ok');
        await refrescar(); ir((ES_CLIENTE ? 'ayuda/' : 'tickets/') + encodeURIComponent(r.ticket.id));
      } catch (er) { toast(er.message, 'error'); } finally { b.disabled = false; }
    }}, h('div.campo', h('span', '¿Cómo de urgente es?'), opciones), plazo, selObra,
      h('label.campo', h('span', 'En pocas palabras'), titulo), h('label.campo', h('span', 'Detalle'), detalle), b);
    const cerrar = hoja(ES_CLIENTE ? 'Nueva consulta' : 'Nuevo ticket', f);
  }

  function vistaTicket(main, t) {
    const [et, cl] = ESTADO_T[t.estado] || [t.estado, ''];
    const abierto = t.estado === 'abierto' || t.estado === 'en_curso';
    main.appendChild(h('button.btn.chico.borde', {onclick: () => ir(ES_CLIENTE ? 'ayuda' : 'tickets'), estilo: {justifySelf: 'start'}}, '‹ Todas'));
    main.appendChild(h('.tarjeta',
      h('div', {estilo: {display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px'}}, h('span.chip.' + (cl || 'x'), et), h('span.chip.' + PRIO_T[t.prioridad][1], PRIO_T[t.prioridad][0])),
      h('h2', {estilo: {marginBottom: '6px'}}, t.titulo),
      h('.plazo', h('span', 'Abierto ' + fecha(t.creado, true)),
        abierto ? h('span', '· ' + (t.primera_respuesta ? 'Solución: ' + quedan(t.limite_resolucion) : 'Respuesta: ' + quedan(t.limite_respuesta))) : null,
        t.resuelto ? h('span', '· Resuelto ' + fecha(t.resuelto, true)) : null)));
    const yo = ES_CLIENTE ? 'cliente' : 'contrata';
    main.appendChild(h('.chat', (t.mensajes || []).map(m => h('.msg.' + (m.de === yo ? 'mio' : 'suyo'), h('small', (m.de === 'zw' ? 'Zero Wattios' : m.autor || '') + ' · ' + fecha(m.fecha, true)), m.texto))));
    if (previa) return;
    const caja = h('textarea', {placeholder: abierto ? 'Escribe aquí…' : 'Si algo sigue mal, escríbelo y la volvemos a abrir.'});
    const b = h('button.btn.negro.ancho', {type: 'submit'}, ico('chat'), 'Enviar');
    main.appendChild(h('form.tarjeta.form', {onsubmit: async e => {
      e.preventDefault();
      if (!txt(caja.value)) return;
      b.disabled = true;
      try {
        const r = await pedir('portalMensaje', {ticket_id: t.id, texto: caja.value});
        if (!r.ok) return toast(r.error, 'error');
        const i = D.tickets.findIndex(x => x.id === t.id); if (i >= 0) D.tickets[i] = r.ticket;
        pintar();
      } catch (er) { toast(er.message, 'error'); } finally { b.disabled = false; }
    }}, h('label.campo', h('span', 'Responder'), caja), b));
  }

  /* ======================================================================
     SUBCONTRATA
     ====================================================================== */
  const ESTADO_O = {asignada: ['Asignada', 'info'], en_curso: ['En curso', 'aviso'], terminada: ['Terminada', 'ok'], validada: ['Validada', 'ok']};

  function tarjetaAviso(a, conObra) {
    const obra = conObra ? (D.obras || []).find(o => o.id === a.obra_id) : null;
    return h('.avisote' + (a.vencido ? '.vencido' : ''),
      h('.ic', a.vencido ? '⚠️' : a.fecha === hoyISO() ? '⏰' : '📅'),
      h('div', h('b', a.texto), h('small', (a.vencido ? 'Vencido: ' : 'Para el ') + fechaLarga(a.fecha) + (obra ? ' · ' + obra.direccion : ''))),
      a.marcable && !previa ? h('button.btn.chico.lima', {onclick: async () => {
        try { const r = await pedir('portalAviso', {obra_id: a.obra_id || (obraAbierta && obraAbierta.id), clave: a.clave}); if (!r.ok) return toast(r.error, 'error');
          toast('Hecho', 'ok'); if (r.obra) obraAbierta = r.obra; await refrescar(); pintar(); } catch (e) { toast(e.message, 'error'); }
      }}, 'Hecho') : conObra ? h('button.btn.chico.borde', {onclick: () => ir('obra/' + encodeURIComponent(a.obra_id))}, 'Ver') : null);
  }

  function vistaObras(main) {
    const obras = D.obras || [];
    const pend = (D.avisos || []).filter(a => a.vencido || a.fecha <= hoyISO());
    main.appendChild(h('.hola', h('h1', 'Hola, ' + (D.cuenta.empresa || D.cuenta.nombre || '')),
      h('p', obras.filter(o => o.estado === 'en_curso' || o.estado === 'asignada').length + ' obras activas · ' + fechaLarga(hoyISO()))));
    if (pend.length) main.appendChild(h('.seccion', h('h2', 'Para hoy'), h('.avisos', pend.slice(0, 4).map(a => tarjetaAviso(a, true)))));
    if (!obras.length) { main.appendChild(h('.tarjeta', h('.vacio', h('span.ico', '🏗️'), 'Todavía no tienes obras asignadas.'))); return; }
    const grupos = [['Activas', obras.filter(o => o.estado === 'en_curso' || o.estado === 'asignada')], ['Terminadas', obras.filter(o => o.estado === 'terminada' || o.estado === 'validada')]];
    grupos.forEach(([t, lista]) => { if (!lista.length) return;
      main.appendChild(h('.seccion', h('h2', t, h('small', lista.length + '')), h('div', {estilo: {display: 'grid', gap: '10px'}}, lista.map(o => {
        const [et, cl] = ESTADO_O[o.estado] || [o.estado, ''];
        return h('button.obra' + (o.en_obra ? '.en-obra' : ''), {onclick: () => ir('obra/' + encodeURIComponent(o.id))},
          h('.arriba', h('span.chip.' + cl, o.en_obra ? 'En obra ahora' : et), h('span.chip', o.especialidad === 'aerotermia' ? 'Aerotermia' : 'Fotovoltaica')),
          h('h3', o.direccion || o.cliente),
          h('.datos', h('span', '👤 ' + o.cliente), o.fecha_prevista ? h('span', '📅 ' + fechaLarga(o.fecha_prevista)) : null),
          h('.barra', h('i', {estilo: {width: (o.progreso || 0) + '%'}})));
      }))));
    });
  }

  function vistaAvisos(main) {
    const av = D.avisos || [];
    main.appendChild(h('.seccion', h('h2', 'Avisos', h('small', av.length + ''))));
    if (!av.length) main.appendChild(h('.tarjeta', h('.vacio', h('span.ico', '✅'), 'No tienes nada pendiente.')));
    else main.appendChild(h('.avisos', av.map(a => tarjetaAviso(a, true))));
    main.appendChild(h('.tarjeta', h('h2', 'Tiempos de los tickets'), h('.lista-mini', Object.keys(PRIO_T).map(k => h('div', h('span', PRIO_T[k][0]), h('b', horasSla(k)))))));
  }

  async function vistaObra(main, id) {
    if (!obraAbierta || obraAbierta.id !== id) {
      main.appendChild(h('.tarjeta', h('.vacio', 'Cargando la obra…')));
      try { const r = await pedir('portalObra', {id}); if (!r.ok) { toast(r.error, 'error'); return ir('inicio'); } obraAbierta = r.obra; }
      catch (e) { toast(e.message, 'error'); return; }
      if (ruta().id !== id) return;
      main.innerHTML = '';
    }
    pintaObra(main, obraAbierta);
  }

  async function accionObra(accion, params, okMsg) {
    try {
      const r = await pedir(accion, Object.assign({obra_id: obraAbierta.id}, params));
      if (!r.ok) { toast(r.error, 'error'); return r; }
      if (r.obra) obraAbierta = r.obra;
      if (okMsg) toast(okMsg, 'ok');
      refrescar();
      pintar();
      return r;
    } catch (e) { toast(e.message, 'error'); return {ok: false}; }
  }

  async function subirFotos(fase, archivos) {
    if (!archivos.length) return false;
    const fin = cargandoGrande('Subiendo ' + archivos.length + (archivos.length === 1 ? ' foto…' : ' fotos…'));
    let bien = 0;
    try {
      for (const f of archivos) {
        const a = await prepararArchivo(f);
        const r = await pedir('portalSubir', Object.assign({obra_id: obraAbierta.id, clase: 'obra_foto', notas: fase ? fase.titulo : ''}, a));
        if (!r.ok) { toast(r.error, 'error'); break; }
        bien++; if (r.obra) obraAbierta = r.obra;
      }
    } catch (e) { toast(e.message, 'error'); }
    fin();
    return bien > 0;
  }

  function pintaObra(main, o) {
    const [et, cl] = ESTADO_O[o.estado] || [o.estado, ''];
    const cerrada = o.estado === 'validada';
    const destino = encodeURIComponent([o.direccion, o.cp].filter(Boolean).join(' '));
    main.appendChild(h('.cab-obra',
      h('div', {estilo: {display: 'flex', gap: '8px', flexWrap: 'wrap'}}, h('span.chip.' + cl, o.en_obra ? 'En obra ahora' : et), h('span.chip', o.especialidad === 'aerotermia' ? 'Aerotermia' : 'Fotovoltaica')),
      h('h2', o.direccion),
      h('.ln', h('span', '👤 ' + o.cliente), o.fecha_prevista ? h('span', '📅 ' + fechaLarga(o.fecha_prevista)) : null),
      h('.ln',
        o.telefono ? h('a', {href: 'tel:' + o.telefono.replace(/\s/g, '')}, ico('telefono'), o.telefono) : null,
        h('a.lima', {href: 'https://www.google.com/maps/dir/?api=1&destination=' + destino, target: '_blank', rel: 'noopener'}, ico('mapa'), 'Cómo llegar')),
      h('div', h('div', {estilo: {display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px', color: '#c9cbc3'}}, h('span', 'Avance'), h('b', {estilo: {color: '#fff'}}, (o.progreso || 0) + '%')),
        h('.barra', {estilo: {background: '#3d3e38'}}, h('i', {estilo: {width: (o.progreso || 0) + '%'}})))));

    if (!cerrada && !previa) {
      const posicion = () => new Promise(ok => {
        if (!navigator.geolocation) return ok({});
        navigator.geolocation.getCurrentPosition(p => ok({lat: p.coords.latitude, lng: p.coords.longitude}), () => ok({}), {timeout: 6000, maximumAge: 60000});
      });
      main.appendChild(h('.grande-acc',
        h('button.btn.' + (o.en_obra ? 'borde' : 'lima'), {onclick: async e => { e.currentTarget.disabled = true; await accionObra('portalLlegada', Object.assign({tipo: 'llegada'}, await posicion()), 'Llegada apuntada'); }}, ico('entrar'), 'He llegado'),
        h('button.btn.' + (o.en_obra ? 'negro' : 'borde'), {onclick: async e => { e.currentTarget.disabled = true; await accionObra('portalLlegada', Object.assign({tipo: 'salida'}, await posicion()), 'Salida apuntada'); }}, ico('salir'), 'Me voy')));
    }

    const avisos = (o.avisos || []).filter(a => !a.hecho);
    if (avisos.length) main.appendChild(h('.seccion', h('h2', 'Tienes que…'), h('.avisos', avisos.map(a => tarjetaAviso(Object.assign({obra_id: o.id}, a), false)))));

    if (o.instrucciones) main.appendChild(h('.tarjeta', h('h2', 'Indicaciones de Zero Wattios'), h('.instr', o.instrucciones)));

    /* Ficha de obra: qué máquina va y dónde */
    main.appendChild(h('.tarjeta', h('h2', 'Ficha de obra · qué va y dónde'),
      (o.equipos || []).length ? h('.equipos', o.equipos.map(e => h('.equipo', h('.ic', ico(ICONO_EQUIPO[e.clave] || iconoPorNombre(e.equipo))),
        h('div', h('b', e.equipo), h('small', e.detalle)), h('.cant', e.cantidad > 1 ? '×' + e.cantidad : ''),
        e.ubicacion || e.notas ? h('.donde', e.ubicacion ? [h('b', '📍 Dónde: '), e.ubicacion] : null, e.notas ? h('div', {estilo: {marginTop: e.ubicacion ? '3px' : 0}}, e.notas) : null) : null)))
        : h('p.nota', 'Zero Wattios completará aquí los equipos.'),
      o.tejado ? h('p.nota', {estilo: {marginBottom: 0}}, 'Tejado: ' + o.tejado) : null));

    /* Fases con fotos */
    main.appendChild(h('.tarjeta', h('h2', 'Fases'), h('.fases', (o.fases || []).map(f => {
      const nFotos = (o.archivos || []).filter(a => a.clase === 'obra_foto' && txt(a.notas).toLowerCase() === f.titulo.toLowerCase()).length;
      const marcar = async () => {
        if (cerrada || previa) return;
        if (!f.hecho && f.pide_foto && !nFotos) {
          const fs = await elegirArchivos({camara: true, multiple: true});
          if (!(await subirFotos(f, fs))) return pintar();
        }
        await accionObra('portalFase', {clave: f.clave, hecho: !f.hecho}, f.hecho ? null : '¡' + f.titulo + '!');
      };
      return h('.fase' + (f.hecho ? '.hecha' : ''),
        h('button.chk', {onclick: marcar, 'aria-label': (f.hecho ? 'Desmarcar ' : 'Marcar ') + f.titulo}, ico('check')),
        h('div', h('b', f.titulo), h('small', f.hecho ? 'Hecho ' + fecha(f.hecho, true) : f.pide_foto ? 'Con foto' : 'Sin foto')),
        f.pide_foto && !cerrada && !previa ? h('button.foto', {onclick: async () => {
          const fs = await elegirArchivos({camara: true, multiple: true});
          if (await subirFotos(f, fs)) {
            if (!f.hecho) await accionObra('portalFase', {clave: f.clave, hecho: true}, '¡' + f.titulo + '!'); else { toast('Fotos subidas', 'ok'); pintar(); }
          }
        }, 'aria-label': 'Fotos de ' + f.titulo}, ico('camara'), nFotos ? h('i', nFotos) : null) : h('span'));
    }))));

    if (!cerrada && !previa && o.estado !== 'terminada') {
      const listo = (o.progreso || 0) >= 100;
      main.appendChild(h('button.btn.ancho.' + (listo ? 'lima' : 'borde'), {disabled: !listo, onclick: () => {
        const nota = h('textarea', {placeholder: 'Algo que debamos saber (opcional)'});
        const cerrar = hoja('¿Terminamos la obra?', h('.form', h('p.nota', {estilo: {margin: 0}}, 'Zero Wattios revisará las fotos y la validará. Después tendrás 7 días para subir la legalización.'),
          h('label.campo', h('span', 'Nota'), nota),
          h('button.btn.lima.ancho', {onclick: async () => { cerrar(); await accionObra('portalTerminar', {nota: nota.value}, '¡Obra terminada!'); }}, ico('fin'), 'Sí, obra terminada')));
      }}, ico('fin'), listo ? 'Marcar obra como terminada' : 'Completa todas las fases para terminar'));
    }

    /* Documentos: subir legalización, certificados… */
    const propios = (o.archivos || []).filter(a => a.obra_id === o.id && a.clase !== 'obra_foto');
    const deZW = (o.archivos || []).filter(a => a.obra_id !== o.id && a.clase !== 'foto');
    const fotosVisita = (o.archivos || []).filter(a => a.clase === 'foto');
    const fotosObra = (o.archivos || []).filter(a => a.clase === 'obra_foto');
    const subirDoc = async clase => {
      const fs = await elegirArchivos({aceptar: 'application/pdf,image/*', multiple: true});
      if (!fs.length) return;
      const fin = cargandoGrande('Subiendo…');
      try { for (const f of fs) { const a = await prepararArchivo(f); const r = await pedir('portalSubir', Object.assign({obra_id: o.id, clase}, a)); if (!r.ok) { toast(r.error, 'error'); break; } if (r.obra) obraAbierta = r.obra; } toast('Subido. Zero Wattios lo revisa.', 'ok'); }
      catch (e) { toast(e.message, 'error'); }
      fin(); refrescar(); pintar();
    };
    main.appendChild(h('.tarjeta', h('h2', 'Documentación'),
      !previa && !cerrada || (!previa && o.estado === 'validada') ? h('div', {estilo: {display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px'}},
        h('button.btn.chico.negro', {onclick: () => subirDoc('legalizacion')}, ico('subir'), 'Legalización'),
        h('button.btn.chico.negro', {onclick: () => subirDoc('certificado')}, ico('subir'), 'Certificado'),
        h('button.btn.chico.borde', {onclick: () => subirDoc('documento_obra'), estilo: {gridColumn: '1 / -1'}}, ico('subir'), 'Otro documento (albarán, esquema…)')) : null,
      propios.length ? h('.docs', propios.map(d => filaDoc('doc', d.nombre, d.clase_nombre + ' · ' + fecha(d.subido, true), () => abrir({id: d.id}, d.nombre)))) : h('p.nota', {estilo: {margin: 0}}, 'Aún no has subido documentos.')));

    if (deZW.length || (o.fichas || []).length) main.appendChild(h('.tarjeta', h('h2', 'Proyecto y fichas técnicas'), h('.docs',
      deZW.map(d => filaDoc(d.clase === 'proyecto' ? 'lista' : 'doc', d.nombre, d.clase_nombre, () => abrir({id: d.id}, d.nombre))),
      (o.fichas || []).map(m => filaDoc('libro', m.nombre, 'Ficha técnica', () => abrir({manual: m.clave}, m.nombre + '.pdf'))))));
    if (fotosVisita.length) main.appendChild(h('.tarjeta', h('h2', 'Fotos de la visita'), h('p.nota', {estilo: {marginTop: 0}}, 'Cómo es la casa: tejado, cuadro, sitio de los equipos.'), galeria(fotosVisita)));
    if (fotosObra.length) main.appendChild(h('.tarjeta', h('h2', 'Fotos de la obra'), galeria(fotosObra, true)));

    /* Bitácora y notas */
    const nota = h('textarea', {placeholder: 'Apunta algo para Zero Wattios (se queda en la obra)'});
    main.appendChild(h('.tarjeta', h('h2', 'Bitácora'),
      !previa && !cerrada ? h('form.form', {estilo: {marginBottom: '12px'}, onsubmit: async e => { e.preventDefault(); if (!txt(nota.value)) return; await accionObra('portalNota', {texto: nota.value}, 'Nota guardada'); }},
        h('label.campo', nota), h('button.btn.chico.borde', {type: 'submit'}, 'Guardar nota')) : null,
      h('.diario', (o.eventos || []).slice(0, 25).map(e => h('.ev', h('.ic', ico(ICONO_EVENTO[e.tipo] || 'nota')), h('div', h('b', e.detalle), h('small', fecha(e.fecha, true) + (e.autor ? ' · ' + e.autor : ''))))))));

    if (!previa) main.appendChild(h('button.btn.borde.ancho', {onclick: () => nuevoTicket(o.id)}, ico('alerta'), 'Abrir ticket de esta obra'));
  }

  /* ---------- arranque ---------- */
  window.addEventListener('hashchange', () => { if (D) pintar(); });
  document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible' && D && token) { await refrescar(); if (!document.querySelector('.fondo-hoja,.visor')) pintar(); } });
  arrancar();
})();
