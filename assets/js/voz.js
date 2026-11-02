/* voz.js — dictar en vez de escribir (02/11/2026).
 * Usa el reconocimiento de voz del propio navegador (Chrome y Safari del
 * móvil lo traen). Si el aparato no lo tiene, el botón no sale. */

import {h} from './util.js';

const Reconocedor = window.SpeechRecognition || window.webkitSpeechRecognition;
export const hayDictado = !!Reconocedor;

export function botonDictado(campo) {
  if (!Reconocedor || !campo) return null;
  const b = h('button.boton-voz', {type: 'button', title: 'Dictar'}, '🎤 Dictar');
  let rec = null;
  b.addEventListener('click', () => {
    if (rec) { rec.stop(); return; }
    rec = new Reconocedor();
    rec.lang = 'es-ES'; rec.continuous = true; rec.interimResults = false;
    const base = campo.value ? campo.value.replace(/\s*$/, ' ') : '';
    let dicho = '';
    rec.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) dicho += e.results[i][0].transcript + ' ';
      campo.value = base + dicho.trim();
      campo.dispatchEvent(new Event('input', {bubbles: true}));
    };
    rec.onend = () => { rec = null; b.classList.remove('oyendo'); b.textContent = '🎤 Dictar'; };
    rec.onerror = () => { if (rec) rec.stop(); };
    b.classList.add('oyendo'); b.textContent = '■ Parar';
    rec.start();
  });
  return b;
}

/* Pone el botón de dictar debajo de cada cuadro de texto largo que aparezca. */
export function dictadoEnTodo(raiz = document.body) {
  if (!Reconocedor) return;
  const poner = () => raiz.querySelectorAll('textarea:not([data-voz])').forEach(t => {
    t.setAttribute('data-voz', '1');
    const b = botonDictado(t);
    if (b && t.parentNode) t.insertAdjacentElement('afterend', b);
  });
  new MutationObserver(poner).observe(raiz, {childList: true, subtree: true});
  poner();
}
