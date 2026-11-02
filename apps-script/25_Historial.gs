/**
 * CRM · ZERO WATTIOS
 * 25_Historial.gs — Histórico de cambios de cada lead (02/11/2026).
 *
 * Orden de Nando: «en el lead se tiene que ver un histórico de todos los
 * cambios que ha ido haciendo el captador o el comercial». Cada vez que
 * alguien cambia un dato de la ficha del cliente o de una de sus citas, se
 * apunta qué campo era, cómo estaba, cómo queda, quién y cuándo.
 */

/* Lo que no se apunta: marcas internas que cambian solas. */
const CAMPOS_SIN_HISTORIAL = ['id', 'creado', 'creado_por', 'modificado', 'modificado_por', 'fecha_estado', 'fecha_resultado',
  'cliente_id', 'operacion_id'];
/* Lo que se apunta sin el valor (que no salga en claro a quien no debe verlo). */
const CAMPOS_SIN_VALOR = ['dni', 'cotitular'];

const NOMBRE_CAMPO = {
  nombre: 'Nombre', telefono: 'Teléfono', email: 'Correo', direccion: 'Dirección', municipio: 'Municipio', cp: 'C.P.',
  coordenadas: 'Coordenadas', tipo_vivienda: 'Tipo de vivienda', regimen: 'Régimen', m2: 'm²', personas: 'Personas',
  anyo: 'Año', calefaccion: 'Calefacción', gasto_combustible: 'Gasto combustible', periodo_combustible: 'Periodo combustible',
  gasto_luz_mes: 'Gasto de luz/mes', comercializadora: 'Comercializadora', cups: 'CUPS', potencia_contratada: 'Potencia',
  ya_fv: 'Ya tiene FV', interes: 'Interés', perfil: 'Perfil', otros: 'Otros datos', origen: 'Origen', estado: 'Estado',
  proxima_accion: 'Próximo paso', proxima_fecha: 'Fecha próximo paso', etiquetas: 'Etiquetas', comercial_id: 'Comercial',
  captador_id: 'Captador', dni: 'DNI', cotitular: 'Cotitular',
  fecha: 'Día de la cita', hora_cita: 'Hora', estado_cita: 'Estado de la cita', tecnologia: 'Tecnología',
  resultado: 'Resultado', notas: 'Notas'
};

function valorHistorial_(campo, v) {
  const s = txt_(v);
  return s.length > 300 ? s.slice(0, 297) + '…' : s;
}

/**
 * Apunta los campos que cambian entre «antes» y «despues». Para un alta,
 * antes es null y se apunta una sola línea.
 */
function apuntarHistorial_(u, entidad, entidadId, clienteId, antes, despues, resumenAlta) {
  try {
    const filas = [];
    const base = {fecha: ahora_(), usuario_id: u ? u.id : '', cliente_id: txt_(clienteId), entidad: entidad, entidad_id: txt_(entidadId)};
    if (!antes) {
      filas.push(Object.assign({}, base, {campo: 'alta', antes: '', despues: txt_(resumenAlta).slice(0, 300)}));
    } else {
      Object.keys(despues || {}).forEach(function (k) {
        if (CAMPOS_SIN_HISTORIAL.indexOf(k) >= 0 || k.charAt(0) === '_') return;
        const a = txt_(antes[k]), d = txt_(despues[k]);
        if (a === d) return;
        if (!isNaN(parseFloat(a)) && !isNaN(parseFloat(d)) && /^-?[\d.,]+$/.test(a) && /^-?[\d.,]+$/.test(d) &&
            Math.abs(parseFloat(a.replace(',', '.')) - parseFloat(d.replace(',', '.'))) < 1e-9) return;
        const oculto = CAMPOS_SIN_VALOR.indexOf(k) >= 0;
        /* Un texto al que se le añade algo: solo lo añadido. */
        if (['notas', 'perfil', 'otros'].indexOf(k) >= 0 && a && d.indexOf(a) === 0) {
          filas.push(Object.assign({}, base, {campo: k, antes: '', despues: valorHistorial_(k, '+ ' + d.slice(a.length).trim())}));
          return;
        }
        filas.push(Object.assign({}, base, {campo: k,
          antes: oculto ? (a ? '(había)' : '') : valorHistorial_(k, a),
          despues: oculto ? (d ? '(cambiado)' : '(borrado)') : valorHistorial_(k, d)}));
      });
    }
    if (filas.length) añadirFilas_('CAMBIOS', filas);
  } catch (e) { /* el historial nunca impide guardar */ }
}

/** El histórico de un cliente y de sus citas, lo más nuevo arriba. */
function accHistorialCambios_(u, p) {
  const cli = leer_('CLIENTES').filter(function (c) { return String(c.id) === String(p.cliente_id); })[0];
  if (!cli) return {ok: false, error: 'No existe ese cliente.'};
  if (!veCliente_(u, cli)) return {ok: false, error: 'Ese cliente no es tuyo.'};
  const usuarios = indexar_(leer_('USUARIOS'), 'id');
  const nombre = function (id) { return (usuarios[String(id)] || {}).nombre || ''; };
  const capsDelCliente = {};
  leer_('CAPTACIONES').forEach(function (k) { if (String(k.cliente_id) === String(cli.id)) capsDelCliente[String(k.id)] = k; });
  const traducir = function (campo, v) {
    if ((campo === 'comercial_id' || campo === 'captador_id' || campo === 'usuario_id') && v) return nombre(v) || v;
    if (campo === 'estado_cita') return etiquetaCatalogo_('estadosCita', v);
    if (campo === 'resultado') return etiquetaCatalogo_('resultadosCaptacion', v);
    if (campo === 'estado') return etiquetaCatalogo_('estadosCliente', v);
    if (/fecha$/.test(campo) && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10).split('-').reverse().join('/');
    return v;
  };
  const filas = leer_('CAMBIOS').filter(function (x) { return String(x.cliente_id) === String(cli.id); })
    /* La nota automática de reagendar o cancelar ya se ve en el motivo y en el cambio de día. */
    .filter(function (x) { return !(x.campo === 'notas' && /^(\+ )?(Reagendada del|Cancelada el) /.test(txt_(x.despues))); })
    .map(function (x) {
      const cita = x.entidad === 'CAPTACIONES' ? capsDelCliente[String(x.entidad_id)] : null;
      return {fecha: txt_(x.fecha), quien: nombre(x.usuario_id) || 'Sistema', usuario_id: txt_(x.usuario_id),
              que: x.entidad === 'CAPTACIONES' ? 'Cita' + (cita ? ' del ' + fechaLarga_(cita.fecha) : '') : 'Ficha',
              campo: txt_(x.campo), nombre_campo: x.campo === 'alta' ? 'Alta' : (NOMBRE_CAMPO[x.campo] || x.campo),
              antes: traducir(x.campo, txt_(x.antes)), despues: traducir(x.campo, txt_(x.despues))};
    })
    .sort(function (a, b) { return b.fecha.localeCompare(a.fecha); });
  /* Los reagendados y cancelaciones llevan además el motivo. */
  leer_('CITAS_CAMBIOS').filter(function (x) { return String(x.cliente_id) === String(cli.id) && txt_(x.motivo); })
    .forEach(function (x) {
      filas.push({fecha: txt_(x.creado), quien: nombre(x.usuario_id) || 'Sistema', usuario_id: txt_(x.usuario_id),
        que: 'Cita del ' + fechaLarga_(x.fecha_antes), campo: 'motivo',
        nombre_campo: normal_(x.tipo) === 'cancelada' ? 'Motivo de la cancelación' : 'Motivo del cambio', antes: '', despues: txt_(x.motivo)});
    });
  filas.sort(function (a, b) { return b.fecha.localeCompare(a.fecha); });
  return {ok: true, cambios: filas.slice(0, 500)};
}

function etiquetaCatalogo_(lista, v) {
  const f = (CATALOGO[lista] || []).filter(function (x) { return x[0] === normal_(v); })[0];
  return f ? f[1] : txt_(v);
}
