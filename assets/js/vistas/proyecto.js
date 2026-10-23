/* vistas/proyecto.js — la carpeta del cliente dentro de su ficha.
 *
 * Aquí el comercial cuenta de qué va el proyecto y sube las fotos de la casa
 * y los documentos. En cuanto hay descripción y una foto, el proyecto entra
 * solo en la cola del Centro de Mando. Cuando allí lo montan, el PDF aparece
 * arriba del todo listo para descargar.
 */

import {h, poner, txt, fechaCorta} from '../util.js';
import * as api from '../api.js';
import {tarjeta, marca, aviso, avisoError, confirmar, cargando} from '../ui.js';

const ESTADOS = {
  borrador:     ['Sin pedir', ''],
  pedido:       ['Proyecto pedido', 'aviso'],
  en_curso:     ['En preparación', 'aviso'],
  faltan_datos: ['Falta algo', 'mal'],
  entregado:    ['Proyecto listo', 'bien'],
  enviado:      ['Enviado al cliente', 'bien'],
  cancelado:    ['Cancelado', 'mal']
};

const LADO_MAXIMO = 1600;     // una foto de obra no necesita más
const LADO_MINIATURA = 220;

/* ---------- preparar los archivos antes de mandarlos ---------- */

const leerComoDataURL = f => new Promise((ok, mal) => {
  const l = new FileReader();
  l.onload = () => ok(l.result);
  l.onerror = () => mal(new Error('No se ha podido leer ' + f.name));
  l.readAsDataURL(f);
});

const soloBase64 = d => String(d).slice(String(d).indexOf(',') + 1);

function dibuja(img, lado, calidad) {
  const escala = Math.min(1, lado / Math.max(img.width, img.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(img.width * escala);
  lienzo.height = Math.round(img.height * escala);
  lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
  return lienzo.toDataURL('image/jpeg', calidad);
}

/* Las fotos del móvil pesan varios megas y no hace falta: se reducen aquí,
   en el propio navegador, antes de salir. Así subir desde la obra es rápido
   aunque haya poca cobertura. */
async function prepara(archivo) {
  const url = await leerComoDataURL(archivo);
  if (!/^image\//.test(archivo.type)) {
    return {clase: 'documento', nombre: archivo.name, mime: archivo.type || 'application/pdf',
            datos: soloBase64(url), miniatura: ''};
  }
  const img = await new Promise((ok, mal) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => mal(new Error('No se ha podido abrir ' + archivo.name));
    i.src = url;
  });
  const grande = dibuja(img, LADO_MAXIMO, 0.82);
  return {clase: 'foto',
          nombre: archivo.name.replace(/\.(heic|heif|png|webp)$/i, '.jpg'),
          mime: 'image/jpeg',
          datos: soloBase64(grande),
          miniatura: dibuja(img, LADO_MINIATURA, 0.55)};
}

/* ---------- abrir y descargar ---------- */

export async function abrirArchivo(a) {
  const r = await api.descargarArchivo(a.id);
  const binario = atob(r.datos);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], {type: r.mime || 'application/octet-stream'}));
  const a2 = document.createElement('a');
  a2.href = url;
  a2.download = r.nombre || 'archivo';
  document.body.appendChild(a2);
  a2.click();
  a2.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/* ---------- la pestaña ---------- */

export function panelProyecto(cliente) {
  const caja = h('div', cargando('Abriendo la carpeta del cliente…'));
  pinta();
  return caja;

  async function pinta() {
    let d;
    try { d = await api.proyectoDe(cliente.id); }
    catch (e) { poner(caja, tarjeta('Proyecto', h('p.nota', txt(e.message)))); return; }

    const proy = d.proyecto || {};
    const archivos = d.archivos || [];
    const fotos = archivos.filter(a => a.clase === 'foto');
    const docs = archivos.filter(a => a.clase === 'documento');
    const proyectos = archivos.filter(a => a.clase === 'proyecto');
    const puedeEntregar = api.puede('editarTodo');
    const [etiqueta, color] = ESTADOS[txt(proy.estado)] || ESTADOS.borrador;

    /* --- el proyecto, cuando ya está hecho --- */
    const entregado = proyectos.length ? tarjeta('Proyecto',
      h('div',
        h('.dato', h('.et', 'Archivo'), h('.v', txt(proyectos[0].nombre))),
        h('.dato', h('.et', 'Entregado'), h('.v', fechaCorta(proy.entregado))),
        txt(proy.enviado) ? h('.dato', h('.et', 'Enviado al cliente'),
          h('.v', fechaCorta(proy.enviado) + ' · ' + txt(proy.enviado).slice(11, 16) +
            (api.persona(proy.enviado_por) ? ' · ' + api.persona(proy.enviado_por).nombre : ''))) : null,
        h('.acciones', {estilo: {marginTop: '10px'}},
          h('button.btn.primario', {onclick: e => conEspera(e, () => abrirArchivo(proyectos[0]))},
            '⤓ Descargar el proyecto'),
          proyectos.length > 1
            ? h('span.nota', 'Hay ' + (proyectos.length - 1) + ' versión(es) anterior(es)')
            : null)),
      {subtitulo: txt(proy.estado) === 'enviado'
        ? 'Enviado al cliente el ' + fechaCorta(proy.enviado) : 'Listo para enviar al cliente'}) : null;

    /* --- lo que escribe el comercial --- */
    const texto = h('textarea', {
      placeholder: 'Qué tiene la casa, qué quiere el cliente, qué has visto en la visita: ' +
                   'metros, calefacción actual, cubierta, orientación, consumo, lo que haga falta.',
      estilo: {minHeight: '150px'}
    });
    texto.value = txt(proy.descripcion);

    const guardar = h('button.btn.primario', {onclick: async e => {
      await conEspera(e, async () => {
        const r = await api.guardarProyecto({cliente_id: cliente.id, descripcion: texto.value});
        aviso(r.proyecto && r.proyecto.estado === 'pedido'
          ? 'Guardado. El proyecto ya está pedido al Centro de Mando.'
          : 'Descripción guardada.');
        await pinta();
      });
    }}, 'Guardar descripción');

    /* --- subir fotos y documentos --- */
    const entrada = h('input', {type: 'file', multiple: true,
      accept: 'image/*,application/pdf', estilo: {display: 'none'}});
    const camara = h('input', {type: 'file', accept: 'image/*', capture: 'environment',
      estilo: {display: 'none'}});
    const marcador = h('.nota');

    async function suben(lista) {
      const archivos = Array.from(lista || []);
      if (!archivos.length) return;
      let hechos = 0, fallos = 0;
      for (const f of archivos) {
        marcador.textContent = 'Subiendo ' + (hechos + fallos + 1) + ' de ' + archivos.length + '…';
        try {
          const listo = await prepara(f);
          await api.subirArchivo(Object.assign({cliente_id: cliente.id}, listo));
          hechos++;
        } catch (e) { fallos++; avisoError(e); }
      }
      marcador.textContent = '';
      aviso(hechos + ' archivo(s) subido(s)' + (fallos ? ' · ' + fallos + ' con error' : ''));
      /* Solo se repinta esta pestaña: refrescar la ficha entera devolvería
         al comercial al Resumen y perdería de vista lo que está subiendo. */
      await pinta();
    }
    entrada.addEventListener('change', () => { suben(entrada.files); entrada.value = ''; });
    camara.addEventListener('change', () => { suben(camara.files); camara.value = ''; });

    const subidor = h('.acciones',
      h('button.btn.lima', {onclick: () => entrada.click()}, '+ Fotos y documentos'),
      h('button.btn', {onclick: () => camara.click()}, '📷 Hacer una foto'),
      entrada, camara, marcador);

    /* --- galería --- */
    const rejillaFotos = fotos.length
      ? h('.zw-fotos', fotos.map(f => h('.zw-foto',
          f.miniatura ? h('img', {src: f.miniatura, alt: txt(f.nombre), loading: 'lazy'})
                      : h('.sinfoto', '🖼'),
          h('button.quitar', {title: 'Quitar', onclick: e => quitar(e, f)}, '×'),
          h('button.abrir', {title: 'Descargar',
            onclick: e => conEspera(e, () => abrirArchivo(f))}, '⤓'))))
      : h('p.nota', 'Todavía no hay fotos. Sin al menos una, el proyecto no se pide.');

    const listaDocs = docs.length
      ? h('ul.zw-docs', docs.map(doc => h('li',
          h('span', txt(doc.nombre)),
          h('span.nota', fechaCorta(doc.subido)),
          h('button.btn.plano', {onclick: e => conEspera(e, () => abrirArchivo(doc))}, '⤓'),
          h('button.btn.plano', {onclick: e => quitar(e, doc)}, '×'))))
      : h('p.nota', 'Ningún documento todavía (factura de la luz, catastro, presupuestos…).');

    async function quitar(e, a) {
      if (!await confirmar('¿Quitar «' + txt(a.nombre) + '»?')) return;
      await conEspera(e, async () => {
        await api.borrarArchivo(a.id);
        await pinta();
      });
    }

    /* --- lo que solo ve la dirección --- */
    const subirProyecto = h('input', {type: 'file', accept: 'application/pdf',
      estilo: {display: 'none'}});
    subirProyecto.addEventListener('change', async () => {
      const f = subirProyecto.files[0];
      subirProyecto.value = '';
      if (!f) return;
      try {
        const url = await leerComoDataURL(f);
        await api.entregarProyecto({cliente_id: cliente.id, nombre: f.name,
          mime: f.type || 'application/pdf', datos: soloBase64(url)});
        aviso('Proyecto entregado. El comercial ya lo tiene en su ficha.');
        await pinta();
      } catch (e) { avisoError(e); }
    });

    const direccion = puedeEntregar ? tarjeta('Centro de mando',
      h('div',
        h('p.nota', 'Lo que sube el comercial se guarda en la carpeta del cliente en Drive. ' +
                    'Cuando el proyecto esté montado, súbelo aquí y le llega un aviso.'),
        h('.acciones',
          h('button.btn.primario', {onclick: () => subirProyecto.click()}, '⤒ Subir el PDF del proyecto'),
          subirProyecto,
          txt(proy.estado) === 'pedido'
            ? h('button.btn', {onclick: e => conEspera(e, async () => {
                await api.estadoProyecto(cliente.id, 'en_curso');
                await pinta();
              })}, 'Marcar en preparación')
            : null))) : null;

    /* --- parado porque falta algo: lo primero que se ve --- */
    const faltan = txt(proy.estado) === 'faltan_datos'
      ? tarjeta('Falta esto para poder sacar el proyecto',
          h('div',
            h('ul.zw-faltan', txt(proy.faltan).split(' · ').filter(Boolean)
              .map(x => h('li', x))),
            h('p.nota', {estilo: {marginTop: '10px', marginBottom: 0}},
              'Súbelo aquí abajo o escríbelo en la descripción: en cuanto lo tengas, ' +
              'el proyecto vuelve solo a la cola del Centro de Mando.')),
          {subtitulo: 'Lo pide quien está montando la propuesta'})
      : null;

    poner(caja,
      faltan,
      entregado,
      tarjeta('Qué hay que proyectar',
        h('div',
          h('.acciones', {estilo: {marginBottom: '10px'}},
            marca(etiqueta, color),
            txt(proy.pedido) ? h('span.nota', 'Pedido el ' + fechaCorta(proy.pedido)) : null,
            txt(proy.enviado) ? h('span.nota', 'Enviado el ' + fechaCorta(proy.enviado)) : null),
          texto,
          h('.acciones', {estilo: {marginTop: '10px'}}, guardar,
            h('span.nota', 'Con la descripción y una foto, el proyecto se pide solo.'))),
        {subtitulo: 'Lo lee el ingeniero que monta la propuesta'}),
      tarjeta('Fotos (' + fotos.length + ')', h('div', subidor, rejillaFotos)),
      tarjeta('Documentos (' + docs.length + ')', listaDocs),
      direccion);
  }
}

/* Un botón que se desactiva mientras hace lo suyo, para no llamar dos veces. */
async function conEspera(ev, fn) {
  const b = ev && ev.currentTarget;
  if (b) b.disabled = true;
  try { await fn(); }
  catch (e) { avisoError(e); }
  finally { if (b) b.disabled = false; }
}
