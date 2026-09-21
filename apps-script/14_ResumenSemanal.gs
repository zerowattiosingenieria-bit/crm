/**
 * 14_ResumenSemanal.gs — El correo de los viernes.
 *
 * Cada viernes por la tarde, cada persona recibe en su correo cómo le ha
 * ido la semana: lo que ha hecho, cómo va contra su objetivo, qué tiene
 * pendiente para la semana que viene y una frase para cerrar. Dirección
 * recibe además cómo va la casa.
 */

/* Frases para terminar. Rotan por semana, así que no se repite la misma
   dos viernes seguidos ni a todos les toca la misma. */
const FRASES = [
  'Las puertas que no se llaman son ventas que no existen.',
  'Una visita bien hecha vale más que diez propuestas enviadas a ciegas.',
  'El cliente no compra paneles: compra dejar de pagar de más.',
  'Lo que se apunta se sigue; lo que no, se pierde.',
  'La venta que se enfría casi siempre es la que nadie volvió a llamar.',
  'Mejor un no rápido que un quizá eterno.',
  'Cada instalación bien rematada trae la siguiente sin llamar a ninguna puerta.',
  'El mejor momento para llamar al que se lo está pensando fue ayer; el segundo mejor es el lunes.',
  'Se cierra explicando, no insistiendo.',
  'Quien enseña el ahorro con números no necesita bajar el precio.',
  'La constancia gana a la suerte, y encima repite.',
  'Un buen seguimiento es media venta hecha.',
  'El sol sale todos los días: el trabajo es estar delante de la casa correcta.',
  'No hace falta ser el más barato si eres el que mejor lo explica.',
  'Lo difícil no es que te digan que sí: es que te vuelvan a abrir la puerta.',
  'Cada ficha que subes es una oportunidad que antes no existía.',
  'La semana que viene empieza con lo que dejes preparado hoy.',
  'Un equipo que comparte lo que le funciona vende el doble.',
  'El que llama, cierra. El que espera, justifica.',
  'Hacer bien lo pequeño es lo que hace grande a una empresa.'
];

function fraseDeLaSemana_(semilla) {
  const s = Math.abs(Number(semilla) || 0);
  return FRASES[s % FRASES.length];
}

function numeroSemana_(fechaISO) {
  const d = fecha_(fechaISO) || new Date();
  const inicio = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - inicio) / 86400000 + inicio.getDay() + 1) / 7);
}

/* ---------- el correo ---------- */

const LOGO_CORREO = 'https://zerowattiosingenieria-bit.github.io/crm/assets/img/logo-h96.png';
const WEB_CRM = 'https://zerowattiosingenieria-bit.github.io/crm/';

function cajaHtml_(titulo, valor, pie) {
  return '<td style="padding:6px">' +
    '<div style="border:1px solid #e3e7e0;border-radius:10px;padding:12px 14px;background:#fff">' +
    '<div style="font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#5b6159;' +
    'font-weight:700">' + titulo + '</div>' +
    '<div style="font-size:23px;font-weight:750;color:#17191c;margin-top:4px">' + valor + '</div>' +
    (pie ? '<div style="font-size:12px;color:#8b918a;margin-top:2px">' + pie + '</div>' : '') +
    '</div></td>';
}

function listaHtml_(titulo, lineas) {
  if (!lineas.length) return '';
  return '<h3 style="font-size:15px;margin:22px 0 8px;color:#17191c">' + titulo + '</h3>' +
    '<ul style="margin:0;padding-left:18px;font-size:14px;color:#17191c;line-height:1.6">' +
    lineas.map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ul>';
}

function correoHtml_(persona, cuerpo, frase) {
  return '<div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#f4f6f3;padding:24px">' +
    '<div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e3e7e0;' +
    'border-radius:14px;overflow:hidden">' +
      '<div style="background:#242422;padding:18px 22px">' +
        '<img src="' + LOGO_CORREO + '" alt="ZERO WATTIOS" style="height:26px">' +
        '<div style="color:#b4fa1e;font-size:11px;letter-spacing:.14em;text-transform:uppercase;' +
        'margin-top:6px">Resumen de la semana</div>' +
      '</div>' +
      '<div style="padding:22px">' +
        '<h2 style="margin:0 0 4px;font-size:19px;color:#17191c">' + txt_(persona.nombre) + '</h2>' +
        '<p style="margin:0 0 16px;color:#5b6159;font-size:13.5px">Así ha ido del lunes al viernes.</p>' +
        cuerpo +
        '<div style="margin-top:24px;padding:14px 16px;background:#b4fa1e;border-radius:10px;' +
        'color:#242422;font-size:14.5px;font-weight:600;font-style:italic">' + frase + '</div>' +
        '<p style="margin:20px 0 0;font-size:13px">' +
        '<a href="' + WEB_CRM + '" style="color:#17191c;font-weight:600">Abrir el CRM</a></p>' +
      '</div>' +
      '<div style="padding:14px 22px;border-top:1px solid #e3e7e0;color:#8b918a;font-size:11.5px">' +
      'ZERO WATTIOS INGENIERÍA, S.L. · Correo automático del CRM, no hace falta contestar.' +
      '</div>' +
    '</div></div>';
}

/* ---------- qué cuenta cada correo ---------- */

function cuerpoComercial_(r, lunes, viernes) {
  const objetivo = r.objetivo_mes ? Math.round(r.logrado_objetivo * 100 / r.objetivo_mes) : 0;
  const filas =
    '<table style="width:100%;border-collapse:separate;border-spacing:0"><tr>' +
      cajaHtml_('Ventas', milesTxt_(r.ventas), eurTxt_(r.importe_vendido || 0)) +
      cajaHtml_('Sentadas', milesTxt_(r.sentadas), 'esta semana') +
      cajaHtml_('Propuestas', milesTxt_(r.propuestas), pctTxt_(r.conversion_propuesta_venta) + ' cierran') +
    '</tr><tr>' +
      cajaHtml_('Objetivo del periodo', r.logrado_objetivo + ' / ' + r.objetivo_mes, objetivo + ' %') +
      cajaHtml_('Cartera viva', eurTxt_(r.cartera_importe || 0), r.cartera_abierta + ' propuestas') +
      cajaHtml_('Comisiones', eurTxt_(r.comisiones.total), 'devengadas') +
    '</tr></table>';

  const proximas = (r.proximas || []).filter(function (p) { return txt_(p.fecha) >= viernes; })
    .slice(0, 8).map(function (p) {
      return '<b>' + p.nombre + '</b> · ' + (txt_(p.accion) || 'seguimiento') +
             ' · ' + selloFecha_(p.fecha);
    });
  const vencidas = (r.proximas || []).filter(function (p) { return p.vencida; })
    .slice(0, 8).map(function (p) {
      return '<b>' + p.nombre + '</b> · ' + (txt_(p.accion) || 'seguimiento') +
             ' · vencía el ' + selloFecha_(p.fecha);
    });
  const frios = (r.frios || []).slice(0, 6).map(function (c) {
    return '<b>' + c.nombre + '</b> · ' + txt_(c.municipio) + ' · ' + c.dias + ' días sin contacto';
  });

  return filas +
    listaHtml_('Se te ha pasado la fecha en', vencidas) +
    listaHtml_('Lo que tienes por delante', proximas) +
    listaHtml_('Clientes que se enfrían', frios);
}

function cuerpoCaptador_(r, lunes, viernes) {
  const objetivo = r.objetivo_mes ? Math.round(r.logrado_objetivo * 100 / r.objetivo_mes) : 0;
  const filas =
    '<table style="width:100%;border-collapse:separate;border-spacing:0"><tr>' +
      cajaHtml_('Fichas', milesTxt_(r.fichas), 'esta semana') +
      cajaHtml_('Puertas', milesTxt_(r.puertas), 'según tus partes') +
      cajaHtml_('Citas confirmadas', milesTxt_(r.citas_confirmadas), '') +
    '</tr><tr>' +
      cajaHtml_('Llegan a sentada', pctTxt_(r.conversion_ficha_sentada), milesTxt_(r.captaciones_sentada) + ' sentadas') +
      cajaHtml_('Acaban en venta', pctTxt_(r.conversion_ficha_venta), milesTxt_(r.captaciones_venta) + ' ventas') +
      cajaHtml_('Objetivo del mes', r.logrado_objetivo + ' / ' + r.objetivo_mes, objetivo + ' %') +
    '</tr></table>';

  const sinAdjudicar = leer_('CAPTACIONES').filter(function (c) {
    return String(c.captador_id) === String(r.persona.id) && !txt_(c.comercial_id) &&
           normal_(c.resultado) === 'pendiente';
  }).slice(0, 8).map(function (c) {
    const cli = leer_('CLIENTES').filter(function (x) { return String(x.id) === String(c.cliente_id); })[0];
    return '<b>' + (cli ? cli.nombre : c.cliente_id) + '</b> · visita del ' + selloFecha_(c.fecha) +
           ' · <i>sin comercial adjudicado</i>';
  });

  const proximas = (r.proximas || []).slice(0, 8).map(function (p) {
    return '<b>' + p.nombre + '</b> · ' + (txt_(p.accion) || 'visita') + ' · ' + selloFecha_(p.fecha);
  });

  return filas +
    listaHtml_('Fichas pendientes de adjudicar a un comercial', sinAdjudicar) +
    listaHtml_('Citas por delante', proximas);
}

function cuerpoDireccion_(r, lunes, viernes) {
  const fin = accFinanzas_({id: r.persona.id, rol: 'admin'}, {desde: sumarDias_(viernes, -365), hasta: viernes});
  const equipo = leer_('USUARIOS').filter(function (u) {
    return normal_(u.activo) === 'si' && ['comercial', 'captador'].indexOf(u.rol) >= 0;
  }).map(function (u) { return resumenPersona_(u, lunes, viernes, true); });

  const ventasSemana = equipo.reduce(function (a, x) { return a + num_(x.ventas); }, 0);
  const importeSemana = equipo.reduce(function (a, x) { return a + num_(x.importe_vendido || 0); }, 0);
  const fichasSemana = equipo.reduce(function (a, x) { return a + num_(x.fichas); }, 0);

  const filas =
    '<table style="width:100%;border-collapse:separate;border-spacing:0"><tr>' +
      cajaHtml_('Ventas de la semana', milesTxt_(ventasSemana), eurTxt_(importeSemana)) +
      cajaHtml_('Fichas captadas', milesTxt_(fichasSemana), 'esta semana') +
      cajaHtml_('Margen del año', pctTxt_(fin.resumen.margen_pct), eurTxt_(fin.resumen.margen_bruto)) +
    '</tr><tr>' +
      cajaHtml_('Pendiente de cobro', eurTxt_(fin.resumen.pendiente_cobro),
        fin.resumen.vencido_cobro ? eurTxt_(fin.resumen.vencido_cobro) + ' vencido' : 'todo en fecha') +
      cajaHtml_('Beneficio neto', eurTxt_(fin.resumen.beneficio_neto), 'del año') +
      cajaHtml_('Cobros vencidos', milesTxt_(leer_('COBROS').filter(function (c) {
        return !txt_(c.fecha_cobro) && txt_(c.fecha_prevista) && txt_(c.fecha_prevista) < viernes;
      }).length), 'por reclamar') +
    '</tr></table>';

  const porPersona = equipo.map(function (x) {
    return '<b>' + x.persona.nombre + '</b> · ' +
      (x.persona.rol === 'captador'
        ? x.fichas + ' fichas, ' + x.captaciones_sentada + ' sentadas'
        : x.ventas + ' ventas (' + eurTxt_(x.importe_vendido || 0) + '), ' + x.sentadas + ' sentadas') +
      ' · objetivo ' + x.logrado_objetivo + '/' + x.objetivo_mes;
  });

  const consejos = (fin.consejos || []).slice(0, 3).map(function (c) {
    return '<b>' + c.titulo + '</b> · ' + c.accion;
  });

  const sinParte = leer_('USUARIOS').filter(function (u) {
    if (normal_(u.activo) !== 'si' || ['comercial', 'captador'].indexOf(u.rol) < 0) return false;
    return !leer_('PARTES').some(function (p) {
      return String(p.usuario_id) === String(u.id) && txt_(p.fecha) >= lunes && txt_(p.fecha) <= viernes;
    });
  }).map(function (u) { return '<b>' + u.nombre + '</b> no ha enviado ningún parte esta semana'; });

  return filas +
    listaHtml_('Cómo ha ido cada uno', porPersona) +
    listaHtml_('Sin partes esta semana', sinParte) +
    listaHtml_('Qué conviene mirar', consejos);
}

/* ---------- utilidades de formato para el correo ---------- */
function milesTxt_(n) { return String(Math.round(num_(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function eurTxt_(n) { return milesTxt_(n) + ' €'; }
function pctTxt_(n) { return String(redondear_(num_(n), 1)).replace('.', ',') + ' %'; }
function selloFecha_(iso) {
  const s = txt_(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '—';
  const p = s.split('-');
  return p[2] + '/' + p[1];
}

/* ---------- el envío ---------- */

/**
 * Manda el resumen de la semana a cada persona. Lo llama el disparador de
 * los viernes; también se puede lanzar a mano desde el CRM o el editor.
 */
function resumenSemanal(soloA) {
  const cfg = config_();
  if (normal_(cfg.resumen_semanal) === 'no' && !soloA) {
    Logger.log('El resumen semanal está desactivado en Ajustes.');
    return {ok: true, enviados: 0, motivo: 'desactivado'};
  }

  const hoy = hoyISO_();
  const d = fecha_(hoy);
  const desdeLunes = (d.getDay() + 6) % 7;             // 0 = lunes
  const lunes = sumarDias_(hoy, -desdeLunes);
  const viernes = sumarDias_(lunes, 4);
  const semana = numeroSemana_(hoy);

  const gente = leer_('USUARIOS').filter(function (u) {
    if (normal_(u.activo) !== 'si' || !txt_(u.email)) return false;
    return soloA ? String(u.id) === String(soloA) || normal_(u.usuario) === normal_(soloA) : true;
  });

  let enviados = 0;
  const fallos = [];
  gente.forEach(function (u, i) {
    try {
      const r = resumenPersona_(u, lunes, viernes, true);
      const cuerpo = (u.rol === 'captador') ? cuerpoCaptador_(r, lunes, viernes)
                   : (['admin', 'superadmin'].indexOf(u.rol) >= 0
                        ? cuerpoDireccion_(r, lunes, viernes)
                        : cuerpoComercial_(r, lunes, viernes));
      const frase = fraseDeLaSemana_(semana + i);
      const html = correoHtml_(u, cuerpo, frase);
      const asunto = 'Tu semana en ZERO WATTIOS · ' + selloFecha_(lunes) + ' a ' + selloFecha_(viernes);

      MailApp.sendEmail({to: txt_(u.email), subject: asunto, htmlBody: html,
        name: 'CRM ZERO WATTIOS'});
      enviados++;
    } catch (e) { fallos.push(txt_(u.usuario) + ': ' + String(e)); }
  });

  /* Copia para quien lleve el control, si se ha puesto en Ajustes. */
  if (txt_(cfg.copia_resumen) && !soloA) {
    try {
      MailApp.sendEmail({to: txt_(cfg.copia_resumen),
        subject: 'Resúmenes semanales enviados · semana ' + semana,
        htmlBody: '<p>Se han enviado ' + enviados + ' resúmenes' +
          (fallos.length ? '. No han salido: ' + fallos.join(', ') : '.') + '</p>',
        name: 'CRM ZERO WATTIOS'});
    } catch (e) { /* la copia no puede tumbar el envío */ }
  }

  registrar_(null, 'resumen_semanal', 'USUARIOS', '', enviados + ' enviados' +
    (fallos.length ? ', fallos: ' + fallos.join(' | ') : ''));
  Logger.log('Resúmenes enviados: ' + enviados + (fallos.length ? ' · fallos: ' + fallos.join(' | ') : ''));
  return {ok: true, enviados: enviados, fallos: fallos, lunes: lunes, viernes: viernes};
}

/** Lanza el resumen a mano desde el CRM (dirección). */
function accResumenSemanalAhora_(u, p) {
  exigir_(u, 'config');
  const r = resumenSemanal(txt_(p.usuario_id) || null);
  return {ok: true, resultado: r};
}

/** Me lo mando solo a mí para ver cómo queda. */
function accProbarResumen_(u, p) {
  if (!txt_(u.email)) return {ok: false, error: 'Tu usuario no tiene correo puesto.'};
  const r = resumenSemanal(u.id);
  return {ok: true, resultado: r};
}

/**
 * Pone al día los correos de los usuarios ya creados con los de
 * 00_Config.gs. Útil si el CRM ya estaba instalado.
 */
function actualizarCorreos() {
  let cambiados = 0;
  USUARIOS_INICIALES.forEach(function (ini) {
    const u = leer_('USUARIOS').filter(function (x) { return normal_(x.usuario) === normal_(ini.usuario); })[0];
    if (u && txt_(ini.email) && txt_(u.email) !== txt_(ini.email)) {
      actualizar_('USUARIOS', u.id, {email: ini.email});
      cambiados++;
    }
  });
  Logger.log('Correos actualizados: ' + cambiados);
  return cambiados;
}
