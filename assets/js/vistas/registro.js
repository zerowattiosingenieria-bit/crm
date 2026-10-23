/* vistas/registro.js — el registro de conexiones y actividad (solo superadmin).
 *
 * Quién ha entrado, cuándo, desde qué equipo y desde dónde, y qué ha mirado
 * o cambiado. Se filtra por días y horas, por persona, por tipo y por texto,
 * y se saca a Excel o a PDF tal cual se está viendo.
 *
 * El filtro lo hace el servidor: la pestaña LOG crece cada día y no tiene
 * sentido traerla entera para quedarse con una mañana.
 */

import {h, poner, txt, normal, miles, fechaCorta, hoyISO, sumarDias, capital, debounce} from '../util.js';
import * as api from '../api.js';
import {tarjeta, tabla, kpi, kpis, marca, aviso, avisoError, cargando} from '../ui.js';
import {descargarExcel, informeImprimible, conFecha} from '../exportar.js';

/* En pantalla, como mucho estas filas: el Excel y el PDF llevan todas. */
const EN_PANTALLA = 1000;

const TIPOS = [
  ['', 'Todos los tipos'],
  ['conexion', 'Conexiones'],
  ['modificacion', 'Modificaciones'],
  ['consulta', 'Consultas'],
  ['sistema', 'Del sistema']
];
const NOMBRE_TIPO = {conexion: 'Conexión', modificacion: 'Modificación', consulta: 'Consulta',
                     sistema: 'Sistema'};

/* Entradas que no han salido bien: van en rojo aunque sean «conexión». */
const FALLOS = {login_fallido: 1, login_bloqueado: 1, usuario_bloqueado: 1, codigo_fallido: 1};

/* Lo que pone el servidor, dicho como lo diría una persona. Lo que no esté
   aquí se lee igual: «guardarCliente» sale como «Guardar cliente». */
const QUE = {
  /* entrar y salir */
  login: 'Entra en el CRM', salir: 'Sale del CRM', login_fallido: 'Intento de entrada fallido',
  login_bloqueado: 'Intento con el usuario bloqueado', usuario_bloqueado: 'Usuario bloqueado por fallos',
  codigo_enviado: 'Se le manda el código al correo', codigo_fallido: 'Código de entrada equivocado',
  equipo_verificado: 'Verifica un equipo nuevo', sesion_caducada: 'Sesión caducada',
  /* consultas */
  datos: 'Abre o recarga el CRM', buscar: 'Busca', misEquipos: 'Mira sus equipos',
  proyecto: 'Abre la carpeta de un cliente', descargarArchivo: 'Descarga un archivo',
  proyectosPendientes: 'Mira los proyectos pendientes', cifras: 'Mira las cifras',
  tareas: 'Mira las tareas', finanzas: 'Abre la contabilidad', partes: 'Mira los partes',
  resumen: 'Mira un resumen', equipo: 'Mira el equipo', analitica: 'Mira la analítica',
  alertas: 'Mira las alertas', nominas: 'Mira las nóminas', nominaDias: 'Mira los días de nómina',
  descargarNomina: 'Descarga una nómina', ver_nomina: 'Abre una nómina',
  vacaciones: 'Mira las vacaciones', mapa: 'Abre el mapa', usuarios: 'Mira los usuarios',
  registro: 'Mira el registro', directorio: 'Busca en el directorio',
  directorioFicha: 'Abre una ficha del directorio', puertas: 'Mira las puertas', banco: 'Abre el banco',
  copias: 'Mira las copias', descargarCopia: 'Descarga una copia',
  /* cambios que se cuentan solos */
  alta_cliente: 'Da de alta un cliente', editar_cliente: 'Cambia un cliente',
  borrar_cliente: 'Borra un cliente', alta_operacion: 'Da de alta una instalación',
  editar_operacion: 'Cambia una instalación', borrar_operacion: 'Borra una instalación',
  importe_cambiado_con_cobros: 'Cambia el importe con cobros hechos',
  seguimiento: 'Apunta un seguimiento', alta_captacion: 'Da de alta una captación',
  adjudicar_captacion: 'Adjudica una captación', borrar_captacion: 'Borra una captación',
  alta_cobro: 'Apunta un cobro', editar_cobro: 'Cambia un cobro',
  alta_factura: 'Apunta una factura', editar_factura: 'Cambia una factura',
  alta_gasto: 'Apunta un gasto', editar_gasto: 'Cambia un gasto',
  parte_diario: 'Guarda el parte del día', aplicar_parte: 'Aplica el parte a las fichas',
  nomina: 'Genera una nómina', editar_nomina: 'Cambia una nómina', subir_nomina: 'Sube una nómina',
  borrar_nomina: 'Borra una nómina', config: 'Cambia los ajustes',
  alta_usuario: 'Da de alta un usuario', editar_usuario: 'Cambia un usuario',
  reset_clave: 'Resetea una clave', cambio_clave: 'Cambia su clave',
  equipo_olvidado: 'Olvida un equipo de confianza',
  solicitar_vacaciones: 'Pide vacaciones', aprobar_vacaciones: 'Aprueba vacaciones',
  denegar_vacaciones: 'Deniega vacaciones', cancelar_vacaciones: 'Cancela vacaciones',
  importar_banco: 'Importa un extracto', editar_movimiento: 'Cambia un movimiento del banco',
  gasto_desde_banco: 'Crea un gasto desde el banco', reclasificar_banco: 'Reclasifica el banco',
  copia_seguridad: 'Copia de seguridad', resumen_semanal: 'Manda el resumen semanal',
  importar_historico: 'Importa el histórico', importar_puertas: 'Importa puertas',
  importar_directorio: 'Importa el directorio', limpiar_puertas: 'Limpia puertas de fuera',
  alta_directorio: 'Da de alta una ficha del directorio', editar_directorio: 'Cambia una ficha del directorio',
  borrar_directorio: 'Borra fichas del directorio', alta_puerta: 'Apunta una puerta',
  editar_puerta: 'Cambia una puerta', borrar_puertas: 'Borra puertas',
  guardar_proyecto: 'Guarda el proyecto de un cliente', subir_archivo: 'Sube un archivo',
  borrar_archivo: 'Borra un archivo', entregar_proyecto: 'Entrega un proyecto',
  estado_proyecto: 'Cambia el estado de un proyecto', proyecto_completado: 'Completa un proyecto',
  guardar_cifras: 'Actualiza las cifras', alta_tarea: 'Crea una tarea', editar_tarea: 'Cambia una tarea',
  borrar_tarea: 'Borra una tarea', geocodificar: 'Sitúa clientes en el mapa'
};

export function queEs(accion) {
  const a = txt(accion);
  if (QUE[a]) return QUE[a];
  return capital(a.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()) || '—';
}

const claseTipo = r => FALLOS[r.accion] ? 'mal'
  : ({conexion: 'info', modificacion: 'aviso', consulta: '', sistema: 'marca'})[r.tipo] || '';
const nombreTipo = r => FALLOS[r.accion] ? 'Conexión fallida' : (NOMBRE_TIPO[r.tipo] || '—');

/* «2026-10-23 08:30:00» → «23/10/26» y «08:30:00». */
const dia = f => fechaCorta(txt(f).slice(0, 10));
const hora = f => txt(f).slice(11, 19);

/* A quién se refiere una fila: por id si lo lleva, si no por el usuario
   tecleado (los intentos fallidos con un nombre que no existe). */
function personaDe(r) {
  const p = api.estado.usuarios.find(u => String(u.id) === String(r.usuario_id)) ||
            api.estado.usuarios.find(u => normal(u.usuario) === normal(r.usuario));
  return p ? p.nombre : (txt(r.usuario) || (r.tipo === 'sistema' ? 'Sistema' : '—'));
}
const dondeFicha = r => [txt(r.entidad), txt(r.entidad_id)].filter(Boolean).join(' · ');
const ipLugar = r => [txt(r.ip), txt(r.lugar)].filter(Boolean).join(' · ');

/* En el resumen, los dos primeros y cuántos más: con veinte equipos la
   celda se comía la pantalla. La lista entera, al pasar el ratón y en el
   Excel. */
const resumirLista = conjunto => {
  const l = [...conjunto];
  return l.slice(0, 2).join(' / ') + (l.length > 2 ? ' y ' + (l.length - 2) + ' más' : '');
};

/* Por persona: cuántas veces ha entrado, cuántas cosas ha hecho, cuándo
   empezó y acabó, y desde cuántos equipos y sitios. */
function porPersona(filas) {
  const m = new Map();
  filas.forEach(r => {
    const k = personaDe(r);
    if (!m.has(k)) m.set(k, {persona: k, entradas: 0, fallos: 0, acciones: 0, cambios: 0,
      primera: r.fecha, ultima: r.fecha, equipos: new Set(), sitios: new Set()});
    const x = m.get(k);
    if (r.accion === 'login') x.entradas++;
    if (FALLOS[r.accion]) x.fallos++;
    if (r.tipo !== 'conexion') x.acciones++;
    if (r.tipo === 'modificacion') x.cambios++;
    if (r.fecha < x.primera) x.primera = r.fecha;
    if (r.fecha > x.ultima) x.ultima = r.fecha;
    if (txt(r.equipo)) x.equipos.add(txt(r.equipo));
    const sitio = txt(r.lugar) || txt(r.ip);
    if (sitio) x.sitios.add(sitio);
  });
  return [...m.values()].sort((a, b) => b.ultima.localeCompare(a.ultima));
}

export async function vistaRegistro() {
  const hoy = hoyISO();
  const f = {desdeDia: hoy, desdeHora: '00:00', hastaDia: hoy, hastaHora: '23:59',
             usuario: '', tipo: '', texto: ''};
  let ultimo = null;

  const zonaFiltros = h('div');
  const zonaResumen = h('div');
  const zonaTabla = h('div.registro-lista', cargando('Leyendo el registro…'));
  const caja = h('div', zonaFiltros, zonaResumen, zonaTabla);

  const params = () => ({
    desde: f.desdeDia ? f.desdeDia + (f.desdeHora ? ' ' + f.desdeHora : '') : '',
    hasta: f.hastaDia ? f.hastaDia + (f.hastaHora ? ' ' + f.hastaHora : '') : '',
    usuario: f.usuario, tipo: f.tipo, texto: f.texto
  });

  /* Cómo se ha filtrado, en una línea: va en la pantalla, el Excel y el PDF. */
  function comoSeFiltro() {
    const p = params();
    const trozos = [];
    if (p.desde && p.hasta) trozos.push('del ' + dia(p.desde) + ' ' + (f.desdeHora || '00:00') +
      ' al ' + dia(p.hasta) + ' ' + (f.hastaHora || '23:59'));
    else if (p.desde) trozos.push('desde el ' + dia(p.desde) + ' ' + (f.desdeHora || '00:00'));
    else if (p.hasta) trozos.push('hasta el ' + dia(p.hasta) + ' ' + (f.hastaHora || '23:59'));
    else trozos.push('todas las fechas');
    if (f.usuario) trozos.push('persona: ' + (api.persona(f.usuario) || {}).nombre);
    if (f.tipo) trozos.push('tipo: ' + TIPOS.find(t => t[0] === f.tipo)[1].toLowerCase());
    if (f.texto) trozos.push('texto «' + f.texto + '»');
    return trozos.join(' · ');
  }

  async function pedir() {
    poner(zonaTabla, cargando('Leyendo el registro…'));
    poner(zonaResumen);
    try {
      ultimo = await api.pedir('registro', params());
      pintaResumen();
      pintaTabla();
    } catch (e) {
      ultimo = null;
      avisoError(e);
      poner(zonaTabla, h('.vacio', txt(e.message)));
    }
  }
  const pedirEnUnRato = debounce(pedir, 400);

  /* ---------- filtros ---------- */

  const campoFecha = (et, kDia, kHora) => {
    const d = h('input', {type: 'date', value: f[kDia], 'aria-label': et + ' (día)',
      onchange: () => { f[kDia] = d.value; pedir(); }});
    const t = h('input', {type: 'time', value: f[kHora], 'aria-label': et + ' (hora)',
      estilo: {minWidth: '96px'},
      onchange: () => { f[kHora] = t.value; pedir(); }});
    return h('label.campo.registro-fecha', h('span', et), h('div', d, t));
  };

  function rango(desde, hasta) {
    Object.assign(f, {desdeDia: desde, desdeHora: '00:00', hastaDia: hasta, hastaHora: '23:59'});
    pintaFiltros();
    pedir();
  }

  function pintaFiltros() {
    const personas = api.estado.usuarios.slice()
      .sort((a, b) => txt(a.nombre).localeCompare(txt(b.nombre), 'es'));
    const selPersona = h('select', {'aria-label': 'Persona',
      onchange: () => { f.usuario = selPersona.value; pedir(); }},
      h('option', {value: ''}, 'Todas las personas'),
      personas.map(u => h('option', {value: u.id, selected: String(u.id) === f.usuario},
        u.nombre + ' (' + u.usuario + ')')));
    const selTipo = h('select', {'aria-label': 'Tipo',
      onchange: () => { f.tipo = selTipo.value; pedir(); }},
      TIPOS.map(([v, e]) => h('option', {value: v, selected: v === f.tipo}, e)));
    const buscar = h('input', {placeholder: 'Buscar en qué, ficha, detalle, equipo, IP…',
      value: f.texto, 'aria-label': 'Buscar',
      oninput: () => { f.texto = txt(buscar.value); pedirEnUnRato(); }});

    poner(zonaFiltros, tarjeta('Qué quieres ver', h('div',
      h('.filtros.registro-fechas',
        campoFecha('Desde', 'desdeDia', 'desdeHora'),
        campoFecha('Hasta', 'hastaDia', 'hastaHora'),
        h('.registro-rapidos',
          h('button.btn.mini', {onclick: () => rango(hoyISO(), hoyISO())}, 'Hoy'),
          h('button.btn.mini', {onclick: () => { const a = sumarDias(hoyISO(), -1); rango(a, a); }}, 'Ayer'),
          h('button.btn.mini', {onclick: () => rango(sumarDias(hoyISO(), -6), hoyISO())}, 'Últimos 7 días'))),
      h('.filtros', selPersona, selTipo, h('div.crece', buscar)),
      h('.filtros.registro-sacar', {estilo: {marginBottom: 0}},
        h('button.btn', {onclick: () => sacar('excel')}, 'Descargar Excel'),
        h('button.btn', {onclick: () => sacar('pdf')}, 'Descargar PDF'),
        h('span.nota', 'El PDF se guarda desde el diálogo de imprimir: «Guardar como PDF».')))));
  }

  /* ---------- resumen por persona ---------- */

  function pintaResumen() {
    const filas = ultimo.registro;
    const gente = porPersona(filas);
    const entradas = filas.filter(r => r.accion === 'login').length;
    const fallos = filas.filter(r => FALLOS[r.accion]).length;
    const cambios = filas.filter(r => r.tipo === 'modificacion').length;
    poner(zonaResumen,
      kpis(
        kpi('Movimientos', miles(filas.length), ultimo.truncado ? 'hay más: afina el filtro' : comoSeFiltro()),
        kpi('Personas', miles(gente.length)),
        kpi('Entradas', miles(entradas)),
        kpi('Entradas fallidas', miles(fallos), null, {estado: fallos ? 'mal' : null}),
        kpi('Modificaciones', miles(cambios))),
      ultimo.truncado ? h('p.nota', {estilo: {margin: '-6px 0 12px', color: 'var(--aviso)'}},
        'Salen los ' + miles(ultimo.tope) + ' movimientos más recientes de este filtro. ' +
        'Acorta las horas o elige una persona para ver el resto.') : null,
      tarjeta('Conexiones por persona', tabla([
        {clave: 'persona', et: 'Persona', pinta: x => h('b', x.persona)},
        {clave: 'entradas', et: 'Entradas', num: true},
        {clave: 'fallos', et: 'Fallidas', num: true, pinta: x => x.fallos
          ? marca(miles(x.fallos), 'mal') : '0'},
        {clave: 'acciones', et: 'Acciones', num: true},
        {clave: 'cambios', et: 'Cambios', num: true},
        {clave: 'primera', et: 'Primera', pinta: x => h('div', dia(x.primera), h('div.nota', hora(x.primera)))},
        {clave: 'ultima', et: 'Última', pinta: x => h('div', dia(x.ultima), h('div.nota', hora(x.ultima)))},
        {clave: 'equipos', et: 'Equipos', noOrden: true, pinta: x => x.equipos.size
          ? h('div.registro-corto', {title: [...x.equipos].join('\n')}, h('b', x.equipos.size),
              h('div.nota', resumirLista(x.equipos))) : '—'},
        {clave: 'sitios', et: 'Desde dónde', noOrden: true, pinta: x => x.sitios.size
          ? h('span.nota.registro-corto', {title: [...x.sitios].join('\n')}, resumirLista(x.sitios)) : '—'}
      ], gente, {vacio: 'Nadie en este rango.'}), {sinRelleno: true}));
  }

  /* ---------- la tabla ---------- */

  function pintaTabla() {
    const filas = ultimo.registro;
    const vistas = filas.slice(0, EN_PANTALLA);
    poner(zonaTabla, tarjeta(miles(filas.length) + (filas.length === 1 ? ' movimiento' : ' movimientos'),
      tabla([
        {clave: 'fecha', et: 'Cuándo', pinta: r => h('div', {estilo: {whiteSpace: 'nowrap'}},
          h('b', dia(r.fecha)), h('div.nota', hora(r.fecha)))},
        {clave: 'usuario', et: 'Quién', valor: r => personaDe(r), pinta: r => h('div',
          h('b', personaDe(r)), r.usuario ? h('div.nota', r.usuario) : null)},
        {clave: 'tipo', et: 'Tipo', valor: r => nombreTipo(r), pinta: r => marca(nombreTipo(r), claseTipo(r))},
        {clave: 'accion', et: 'Qué', valor: r => queEs(r.accion), pinta: r => h('div',
          queEs(r.accion), h('div.nota', {estilo: {fontSize: '11.5px'}}, r.accion))},
        {clave: 'entidad', et: 'Dónde / ficha', valor: r => dondeFicha(r), pinta: r => dondeFicha(r) || '—'},
        {clave: 'detalle', et: 'Detalle', noOrden: true, pinta: r => h('span.nota.registro-detalle',
          txt(r.detalle) || '—')},
        {clave: 'equipo', et: 'Equipo', pinta: r => h('span.nota', {title: txt(r.agente)},
          txt(r.equipo) || '—')},
        {clave: 'ip', et: 'IP · lugar', valor: r => ipLugar(r), pinta: r => h('div',
          txt(r.ip) || '—', r.lugar ? h('div.nota', r.lugar) : null)}
      ], vistas, {vacio: 'No hay movimientos con este filtro.'}),
      {sinRelleno: true, subtitulo: filas.length > EN_PANTALLA
        ? 'En pantalla, los ' + miles(EN_PANTALLA) + ' más recientes; el Excel y el PDF los llevan todos.'
        : comoSeFiltro()}));
  }

  /* ---------- sacarlo ---------- */

  function sacar(formato) {
    if (!ultimo) return aviso('Espera a que cargue el registro.');
    const filas = ultimo.registro;
    const gente = porPersona(filas);
    const ahora = new Date().toLocaleString('es-ES', {day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'});

    if (formato === 'excel') {
      descargarExcel(conFecha('registro-conexiones'), [
        {nombre: 'Registro',
         antes: [['Registro de conexiones y actividad · ZERO WATTIOS'],
                 ['Filtro: ' + comoSeFiltro()],
                 ['Sacado el ' + ahora + ' · ' + miles(filas.length) + ' movimientos' +
                  (ultimo.truncado ? ' (los ' + miles(ultimo.tope) + ' más recientes; hay más)' : '')]],
         cabeceras: ['Fecha', 'Hora', 'Persona', 'Usuario', 'Tipo', 'Qué', 'Acción', 'Dónde', 'Ficha',
                     'Detalle', 'Equipo', 'IP', 'Lugar', 'Navegador'],
         filas: filas.map(r => [txt(r.fecha).slice(0, 10), hora(r.fecha), personaDe(r), txt(r.usuario),
           nombreTipo(r), queEs(r.accion), txt(r.accion), txt(r.entidad), txt(r.entidad_id),
           txt(r.detalle), txt(r.equipo), txt(r.ip), txt(r.lugar), txt(r.agente)])},
        {nombre: 'Por persona',
         antes: [['Conexiones por persona'], ['Filtro: ' + comoSeFiltro()]],
         cabeceras: ['Persona', 'Entradas', 'Fallidas', 'Acciones', 'Cambios', 'Primera', 'Última',
                     'Equipos', 'Desde dónde'],
         filas: gente.map(x => [x.persona, x.entradas, x.fallos, x.acciones, x.cambios, x.primera, x.ultima,
           [...x.equipos].join(' / '), [...x.sitios].join(' / ')])}
      ]);
      return aviso(miles(filas.length) + ' movimientos en el Excel.');
    }

    informeImprimible({
      titulo: 'Registro de conexiones y actividad',
      subtitulo: comoSeFiltro() + (ultimo.truncado
        ? ' · solo los ' + miles(ultimo.tope) + ' más recientes' : ''),
      resumen: [
        {et: 'Movimientos', valor: miles(filas.length)},
        {et: 'Personas', valor: miles(gente.length)},
        {et: 'Entradas', valor: miles(filas.filter(r => r.accion === 'login').length)},
        {et: 'Entradas fallidas', valor: miles(filas.filter(r => FALLOS[r.accion]).length)},
        {et: 'Modificaciones', valor: miles(filas.filter(r => r.tipo === 'modificacion').length)}
      ],
      reparto: {titulo: 'Por persona (entradas · acciones · equipos)',
        partes: gente.map(x => ({et: x.persona,
          n: x.entradas + ' · ' + x.acciones + ' · ' + x.equipos.size}))},
      cabeceras: [{et: 'Cuándo'}, {et: 'Quién'}, {et: 'Tipo'}, {et: 'Qué'}, {et: 'Ficha'},
                  {et: 'Detalle'}, {et: 'Equipo'}, {et: 'IP · lugar'}],
      filas: filas.map(r => [dia(r.fecha) + ' ' + hora(r.fecha), personaDe(r), nombreTipo(r),
        queEs(r.accion), dondeFicha(r), txt(r.detalle), txt(r.equipo), ipLugar(r)]),
      pie: 'ZERO WATTIOS INGENIERÍA · Registro interno de conexiones. Sacado el ' + ahora +
           '. En el diálogo de impresión, elige «Guardar como PDF».'
    });
  }

  pintaFiltros();
  pedir();
  return caja;
}
