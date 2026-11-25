/* vistas/vistagestoria.js — Lo mismo que ve la gestoría, dentro del CRM (25/11/2026, Nando).
   «Exactamente lo mismo que ven ellas»: carga la misma app (assets/portal/gestoria.js) dentro de
   la pantalla y sus peticiones van por la acción vistaGestoria con la sesión del CRM.
   Solo Nando, Fernando y el superadmin (permiso «vistagestoria»). */
import {h} from '../util.js';
import * as api from '../api.js';
import {cargando, aviso} from '../ui.js';

function cargarApp() {
  if (window.ZWGestoria) return Promise.resolve();
  return new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = '/assets/portal/gestoria.js?v=5';
    s.onload = ok; s.onerror = () => mal(new Error('No se ha podido cargar la vista de la gestoría.'));
    document.head.appendChild(s);
  });
}

export async function vistaVistaGestoria() {
  const caja = h('div', {estilo: {margin: '-8px -4px 0'}}, cargando('Abriendo la vista de la gestoría…'));
  const pedir = async (accion, params = {}) => {
    try { return await api.pedir('vistaGestoria', Object.assign({}, params, {sub: accion})); }
    catch (e) { return {ok: false, error: e.message}; }
  };
  (async () => {
    try {
      await cargarApp();
      const D = await pedir('portalInicio');
      if (!D.ok) throw new Error(D.error || 'No se ha podido abrir.');
      caja.innerHTML = '';
      window.ZWGestoria.iniciar({D, pedir, previa: false, contenedor: caja, toast: (m, t) => aviso(m, t === 'error' ? 'error' : (t === 'ok' ? 'ok' : undefined))});
    } catch (e) { caja.innerHTML = ''; caja.appendChild(h('p.nota', e.message)); }
  })();
  return caja;
}
