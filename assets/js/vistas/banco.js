/* vistas/banco.js — los movimientos de la cuenta.
 *
 * Se sube el extracto que baja el banco y el CRM lo clasifica solo.
 * Desde aquí se casan los cobros de los clientes con el dinero que ha
 * entrado de verdad y se ve cuánto cuesta al mes tener la empresa abierta.
 */

import {h, poner, txt, num, eur, eur2, eurCorto, miles, pct, fechaCorta, mesLargo,
        normal, suma, hoyISO, primerDiaMes, sumarDias} from '../util.js';
import * as api from '../api.js';
import {tarjeta, tabla, kpi, kpis, etiquetaEstado, marca, ventana, ventanaFormulario,
        aviso, avisoError, confirmar, filtros, cargando} from '../ui.js';
import {barras, anillo} from '../graficos.js';

export async function vistaBanco({ir}) {
  const caja = h('div');
  const contenido = h('div', cargando('Leyendo la cuenta…'));
  const est = {texto: '', categoria: '', tipo: '', desde: '', hasta: '', limite: 120};
  let datos = null;

  const f = filtros([
    {id: 'texto', et: 'Buscar por concepto…'},
    {id: 'tipo', tipo: 'select', opciones: [['', 'Entradas y salidas'], ['ingreso', 'Solo entradas'],
      ['gasto', 'Solo salidas']]},
    {id: 'categoria', tipo: 'select',
     opciones: [['', 'Todas las categorías']].concat(api.opciones('categoriasBanco'))},
    {id: 'desde', tipo: 'fecha', et: 'Desde'},
    {tipo: 'boton', et: '+ Importar extracto', clase: 'primario', accion: () => importar(cargar)}
  ], v => { Object.assign(est, v); pinta(); });

  async function cargar() {
    poner(contenido, cargando('Leyendo la cuenta…'));
    datos = await api.pedir('banco', {});
    pinta();
  }

  function pinta() {
    if (!datos) return;
    const q = normal(est.texto);
    const lista = datos.movimientos.filter(m => {
      if (est.tipo && txt(m.tipo) !== est.tipo) return false;
      if (est.categoria && txt(m.categoria) !== est.categoria) return false;
      if (est.desde && txt(m.fecha) < est.desde) return false;
      return !q || normal(m.concepto).includes(q);
    });

    const mesActual = datos.meses.filter(m => m.mes === txt(hoyISO()).slice(0, 7))[0] ||
                      {ingresos: 0, gastos: 0, neto: 0, estructura: 0};
    const ultimos = datos.meses.slice(-8);

    const visibles = lista.slice(0, est.limite);
    const t = tabla([
      {clave: 'fecha', et: 'Fecha', pinta: m => fechaCorta(m.fecha)},
      {clave: 'concepto', et: 'Concepto', pinta: m => h('div', h('b', m.concepto),
        txt(m.notas) ? h('div.nota', m.notas) : null)},
      {clave: 'categoria', et: 'Categoría', pinta: m => {
        const s = h('select', {estilo: {minWidth: '170px', padding: '4px 8px', fontSize: '12.5px'},
          onchange: async () => {
            try { await api.pedir('guardarMovimiento', {movimiento: {id: m.id, categoria: s.value}});
                  m.categoria = s.value; aviso('Categoría cambiada.'); }
            catch (e) { avisoError(e); }
          }},
          api.opciones('categoriasBanco').map(([v, et]) =>
            h('option', {value: v, selected: v === txt(m.categoria)}, et)));
        return s;
      }},
      {clave: 'importe', et: 'Importe', num: true, valor: m => num(m.importe),
       pinta: m => h('b', {estilo: {color: num(m.importe) >= 0 ? 'var(--bien)' : 'var(--tx)'}},
         (num(m.importe) >= 0 ? '+' : '') + eur2(m.importe))},
      {clave: 'saldo', et: 'Saldo', num: true, valor: m => num(m.saldo),
       pinta: m => h('span.nota', eur2(m.saldo))},
      {clave: 'conciliado', et: 'Casado', pinta: m => normal(m.conciliado) === 'si'
        ? etiquetaEstado('ganado', 'Sí') : h('span.nota', '—')},
      {clave: 'acciones', et: '', noOrden: true, pinta: m => h('.acciones',
        num(m.importe) > 0 && normal(m.conciliado) !== 'si'
          ? h('button.btn.mini.lima', {onclick: () => casar(m, cargar)}, 'Casar con cobro') : null,
        num(m.importe) < 0 && normal(m.conciliado) !== 'si'
          ? h('button.btn.mini', {onclick: () => crearGasto(m, cargar)}, 'Pasar a gasto') : null)}
    ], visibles, {csv: 'movimientos_banco.csv', vacio: 'No hay movimientos con esos filtros.'});

    const desviacion = datos.estructura_config
      ? datos.estructura_real - datos.estructura_config : 0;

    poner(contenido,
      kpis(
        kpi('Dinero en el banco', eur(datos.saldo),
          (datos.cuentas || []).length > 1
            ? datos.cuentas.map(c => c.cuenta).join(' + ')
            : (datos.fecha_saldo ? 'a ' + fechaCorta(datos.fecha_saldo) : 'sin datos'),
          {destacado: true}),
        kpi('Entradas del mes', eurCorto(mesActual.ingresos), 'lo que ha llegado', {estado: 'bien'}),
        kpi('Salidas del mes', eurCorto(mesActual.gastos), 'lo que ha salido'),
        kpi('Coste real de estructura', eur(datos.estructura_real), 'media de los meses cerrados',
          {estado: desviacion > 500 ? 'aviso' : null}),
        kpi('Movimientos', miles(datos.total),
          datos.ingresos_sin_casar ? miles(datos.ingresos_sin_casar) + ' entradas sin casar' : 'todo casado')
      ),

      /* Con más de una cuenta conviene ver de dónde sale cada euro. */
      (datos.cuentas || []).length > 1
        ? tarjeta('Saldo por cuenta',
            tabla([
              {clave: 'cuenta', et: 'Cuenta'},
              {clave: 'movimientos', et: 'Movimientos', num: true, valor: c => num(c.movimientos)},
              {clave: 'fecha', et: 'Último apunte', pinta: c => fechaCorta(c.fecha)},
              {clave: 'saldo', et: 'Saldo', num: true, valor: c => num(c.saldo),
               pinta: c => h('b', eur2(c.saldo))}
            ], datos.cuentas,
            {pie: [{texto: 'Total', colspan: 3}, {texto: eur2(datos.saldo), num: true}]}),
            {sinRelleno: true})
        : null,

      datos.estructura_real && Math.abs(desviacion) > 200
        ? h('.tarjeta', h('.cuerpo',
            h('div', {estilo: {display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap'}},
              h('span.semaforo.aviso'),
              h('div', {estilo: {flex: '1', minWidth: '240px'}},
                h('h3', 'El coste de estructura que usan las cuentas no cuadra con el banco'),
                h('p.nota', {estilo: {margin: '2px 0 0'}},
                  'En Ajustes hay ' + eur(datos.estructura_config) + ' al mes y el banco dice ' +
                  eur(datos.estructura_real) + '. De ahí salen el beneficio neto y el punto de equilibrio.')),
              h('button.btn.primario', {onclick: async () => {
                try {
                  await api.pedir('ajustarEstructura', {valor: datos.estructura_real});
                  aviso('Coste de estructura actualizado.');
                  await cargar();
                } catch (e) { avisoError(e); }
              }}, 'Usar ' + eur(datos.estructura_real)))))
        : null,

      h('.doble',
        tarjeta('Entradas y salidas por mes',
          ultimos.length ? barras({
            etiquetas: ultimos.map(m => mesLargo(m.mes)),
            series: [{nombre: 'Entradas', valores: ultimos.map(m => m.ingresos)},
                     {nombre: 'Salidas', valores: ultimos.map(m => m.gastos)},
                     {nombre: 'Estructura', valores: ultimos.map(m => m.estructura)}],
            formato: 'eur'}) : h('.vacio', 'Sin movimientos todavía.')),
        tarjeta('En qué se va el dinero',
          datos.categorias.length ? anillo({
            datos: datos.categorias.filter(c => !['cobro_cliente', 'otros_ingresos'].includes(c.categoria))
              .slice(0, 8)
              .map(c => ({nombre: api.etiquetaCatalogo('categoriasBanco', c.categoria), valor: c.importe}))})
            : h('.vacio', 'Sin movimientos.'))),

      tarjeta(miles(lista.length) + ' movimiento(s)',
        h('div', t,
          lista.length > visibles.length
            ? h('div', {estilo: {padding: '12px', textAlign: 'center'}},
                h('button.btn', {onclick: () => { est.limite += 300; pinta(); }},
                  'Ver más (' + miles(lista.length - visibles.length) + ' sin mostrar)'))
            : null),
        {sinRelleno: true,
         subtitulo: 'La categoría se puede corregir a mano y manda sobre las reglas automáticas',
         acciones: [
           h('button.btn.mini', {onclick: async () => {
             try { const r = await api.pedir('reclasificarBanco');
                   aviso(r.cambiados + ' movimiento(s) reclasificados.'); await cargar(); }
             catch (e) { avisoError(e); }
           }}, 'Reclasificar'),
           h('button.btn.mini', {onclick: () => t.exportar && t.exportar()}, 'Exportar CSV')]}));
  }

  poner(caja, f.nodo, contenido);
  await cargar();
  return caja;
}

/* ---------- importar el extracto ---------- */
function importar(recargar) {
  const archivo = h('input', {type: 'file', accept: '.csv,text/csv,.txt'});
  const aviso1 = h('p.nota', 'Vale el CSV que descarga el banco. Reconozco las columnas ' +
    'Concepto, Fecha, Importe y Saldo, en el orden que vengan, y los importes con EUR, ' +
    'puntos de millar y coma decimal.');
  const resumen = h('div');
  const btn = h('button.btn.primario', 'Importar');

  const v = ventana({
    titulo: 'Importar movimientos del banco',
    cuerpo: h('div', aviso1, h('label.campo', h('span', 'Archivo del banco'), archivo), resumen),
    acciones: [h('button.btn', {onclick: () => v.cerrar()}, 'Cancelar'), btn]
  });

  btn.addEventListener('click', async () => {
    const f = archivo.files && archivo.files[0];
    if (!f) return aviso('Elige el archivo del banco.', 'error');
    btn.disabled = true;
    poner(btn, h('span.cargando'), ' Importando');
    try {
      const texto = await f.text();
      const movimientos = parsearExtracto(texto);
      if (!movimientos.length) throw new Error('No he reconocido ningún movimiento en ese archivo.');
      const r = await api.pedir('importarBanco', {movimientos});
      aviso(r.nuevos + ' movimiento(s) nuevos' +
        (r.repetidos ? ' · ' + r.repetidos + ' ya estaban' : '') + '.');
      v.cerrar();
      await recargar();
    } catch (e) {
      avisoError(e);
      btn.disabled = false; btn.textContent = 'Importar';
    }
  });
}

/** Convierte el CSV del banco en movimientos que entiende el CRM. */
export function parsearExtracto(texto) {
  const lineas = String(texto).split(/\r?\n/).filter(l => l.trim().length);
  if (!lineas.length) return [];
  const sep = (lineas[0].match(/;/g) || []).length >= (lineas[0].match(/,/g) || []).length ? ';' : ',';

  const cabecera = lineas[0].split(sep).map(x => normal(x).replace(/"/g, '').trim());
  const idx = {
    concepto: cabecera.findIndex(x => /concepto|descripcion|detalle|movimiento/.test(x)),
    fecha: cabecera.findIndex(x => /fecha|valor|operacion/.test(x)),
    importe: cabecera.findIndex(x => /importe|cantidad|cargo|abono/.test(x)),
    saldo: cabecera.findIndex(x => /saldo/.test(x))
  };
  const conCabecera = idx.fecha >= 0 && idx.importe >= 0;
  if (!conCabecera) { idx.concepto = 0; idx.fecha = 1; idx.importe = 2; idx.saldo = 3; }

  const numero = v => {
    let s = String(v || '').replace(/eur|€|\s/gi, '').trim();
    const negativo = s.indexOf('-') >= 0;
    s = s.replace(/[+-]/g, '');
    if (s.includes('.') && s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    const n = parseFloat(s);
    return isFinite(n) ? (negativo ? -n : n) : 0;
  };
  const fechaISO = v => {
    const s = String(v || '').trim();
    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m) {
      let a = m[3]; if (a.length === 2) a = '20' + a;
      return a + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[0] : '';
  };

  return lineas.slice(conCabecera ? 1 : 0).map(l => {
    const c = l.split(sep).map(x => x.replace(/^"|"$/g, '').trim());
    return {
      concepto: c[idx.concepto] || '',
      fecha: fechaISO(c[idx.fecha]),
      importe: numero(c[idx.importe]),
      saldo: idx.saldo >= 0 ? numero(c[idx.saldo]) : 0
    };
  }).filter(m => m.fecha && m.importe !== 0);
}

/* ---------- casar una entrada con un cobro ---------- */
async function casar(movimiento, recargar) {
  const d = await api.pedir('finanzas', {});
  const pendientes = (d.cobros || []).filter(c => !txt(c.fecha_cobro))
    .map(c => {
      const op = api.operacion(c.operacion_id) || {};
      const cli = api.cliente(op.cliente_id) || {};
      const parecido = Math.abs(num(c.importe) - num(movimiento.importe));
      return Object.assign({}, c, {_cliente: cli.nombre || '—', _ref: op.referencia || c.operacion_id,
        _parecido: parecido});
    })
    .sort((a, b) => a._parecido - b._parecido)
    .slice(0, 25);

  if (!pendientes.length) return aviso('No hay cobros pendientes que casar.', 'error');

  const v = ventana({
    titulo: 'Casar ' + eur2(movimiento.importe) + ' del ' + fechaCorta(movimiento.fecha),
    ancha: true,
    cuerpo: h('div',
      h('p.nota', 'Concepto del banco: "' + movimiento.concepto + '". Elige el cobro al que corresponde; ' +
        'quedará marcado como cobrado con la fecha del banco.'),
      tabla([
        {clave: '_cliente', et: 'Cliente'},
        {clave: '_ref', et: 'Instalación'},
        {clave: 'concepto', et: 'Concepto', valor: c => api.etiquetaCatalogo('conceptosCobro', c.concepto)},
        {clave: 'importe', et: 'Importe', num: true, pinta: c => h('b', eur2(c.importe))},
        {clave: 'fecha_prevista', et: 'Previsto', pinta: c => fechaCorta(c.fecha_prevista)},
        {clave: 'acciones', et: '', noOrden: true, pinta: c => h('button.btn.mini.lima', {
          onclick: async () => {
            try {
              await api.pedir('guardarMovimiento', {movimiento: {id: movimiento.id, cobro_id: c.id}});
              aviso('Cobro casado con el banco.');
              v.cerrar();
              await recargar();
            } catch (e) { avisoError(e); }
          }}, 'Es este')}
      ], pendientes, {vacio: 'Sin cobros pendientes.'}))
  });
}

/* ---------- convertir una salida en gasto de una instalación ---------- */
function crearGasto(movimiento, recargar) {
  const ops = [['', 'Gasto general de la empresa']].concat(api.estado.operaciones.map(o => {
    const c = api.cliente(o.cliente_id) || {};
    return [o.id, (o.referencia || o.id) + ' · ' + (c.nombre || '')];
  }));
  return ventanaFormulario({
    titulo: 'Pasar a gasto: ' + movimiento.concepto,
    campos: [
      {id: 'operacion_id', et: 'Instalación', tipo: 'select', opciones: ops, vacio: false, ancho: 2},
      {id: 'categoria', et: 'Categoría del gasto', tipo: 'select',
       opciones: api.opciones('categoriasGasto'), vacio: false},
      {id: 'proveedor', et: 'Proveedor'},
      {id: 'concepto', et: 'Concepto', ancho: 2},
      {id: 'iva_pct', et: 'IVA (%)', tipo: 'numero'}
    ],
    valores: {proveedor: movimiento.concepto, concepto: movimiento.concepto, iva_pct: 21,
              categoria: 'material_fv'},
    textoBoton: 'Crear el gasto de ' + eur2(Math.abs(num(movimiento.importe))),
    alGuardar: async d => {
      await api.pedir('gastoDesdeBanco', Object.assign({id: movimiento.id}, d));
      aviso('Gasto creado y movimiento casado.');
      await recargar();
    }
  });
}
