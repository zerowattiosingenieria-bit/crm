<?php
/**
 * CRM · ZERO WATTIOS
 * recordatorios.php (= 23_Recordatorios.gs) — «Eso también va en el CRM» (02/11/2026).
 *
 * Orden de Nando: desde el 03/11/2026 comerciales y captadores lo apuntan
 * todo en el CRM. Cuando se les olvida algo, o lo ponen en otro sitio
 * (WhatsApp, Trello, un correo) y no en el CRM, les llega un correo que se
 * lo recuerda. Solo a comerciales y captadores; dirección no recibe nada.
 *
 *  - Los agentes, al leer WhatsApp, Trello o el correo, apuntan con
 *    recordarCRM lo que alguien ha puesto fuera y no está en el CRM.
 *  - Dos veces al día (13:30 y 19:30, lunes a viernes) sale UN correo por
 *    persona con todo lo suyo. A las 19:30 se añade además lo que se ha
 *    quedado a medias: visitas sin resultado, sentadas sin proyecto pedido,
 *    propuestas listas sin enviar, fichas sin teléfono o dirección y el
 *    parte del día sin mandar.
 *  - Lo mismo no se repite antes de 3 días. Se apaga con avisos_crm = no.
 */

require_once __DIR__ . '/base.php';
require_once __DIR__ . '/google.php';
/* WEB_CRM la define también resumen_semanal.php; por si este módulo se carga solo (cron.php). */
if (!defined('WEB_CRM')) define('WEB_CRM', 'https://zerowattiosingenieria-bit.github.io/crm/');

const K_COLA_RECORD = 'recordatorios_cola';
const K_ENVIADOS_RECORD = 'recordatorios_enviados';
const DIAS_REPETIR_RECORD = 3;
const ROLES_RECORD = ['comercial', 'captador'];
const DONDE_RECORD = ['whatsapp' => 'en WhatsApp', 'trello' => 'en Trello', 'correo' => 'por correo', 'otro' => 'fuera del CRM'];

function leerProp_(string $k, $defecto) {
  try { $v = prop_($k); return ($v !== null && $v !== '') ? deJson_($v, $defecto) : $defecto; } catch (Throwable $e) { return $defecto; }
}
function guardarProp_(string $k, $v): void { setProp_($k, aJson_($v)); }

function desdeRecordatorios_(): string { return txt_(config_()['recordatorios_desde'] ?? '') ?: '2026-11-03'; }

/**
 * Un agente (o dirección) apunta que alguien ha puesto algo fuera del CRM.
 * p: {usuario_id | usuario (nombre), que, donde, cliente, clave}
 */
function accRecordarCRM_(array $u, array $p): array {
  exigir_($u, 'editarTodo');
  $usuarios = leer_('USUARIOS');
  $quien = null;
  if (txt_($p['usuario_id'] ?? '') !== '') {
    foreach ($usuarios as $x) if (mismo_($x['id'], $p['usuario_id'])) { $quien = $x; break; }
  } else {
    foreach ($usuarios as $x) if (normal_($x['nombre']) === normal_($p['usuario'] ?? '') || normal_($x['usuario']) === normal_($p['usuario'] ?? '')) { $quien = $x; break; }
  }
  if (!$quien) return ['ok' => false, 'error' => 'No sé quién es esa persona.'];
  if (!in_array(normal_($quien['rol']), ROLES_RECORD, true)) return ['ok' => true, 'encolado' => false, 'motivo' => 'Solo se recuerda a comerciales y captadores.'];
  $que = trozo_($p['que'] ?? '', 0, 220);
  if ($que === '') return ['ok' => false, 'error' => 'Di qué falta por meter en el CRM.'];
  $clave = txt_($p['clave'] ?? '') ?: ('fuera|' . trozo_(normal_($que), 0, 80) . '|' . trozo_(normal_($p['cliente'] ?? ''), 0, 60));
  $cola = leerProp_(K_COLA_RECORD, []);
  if (!is_array($cola)) $cola = [];
  foreach ($cola as $x) {
    if (mismo_($x['usuario_id'] ?? '', $quien['id']) && ($x['clave'] ?? '') === $clave) return ['ok' => true, 'encolado' => false, 'motivo' => 'Ya estaba apuntado.'];
  }
  $cola[] = ['usuario_id' => $quien['id'], 'que' => $que, 'donde' => normal_($p['donde'] ?? '') ?: 'otro', 'cliente' => trozo_($p['cliente'] ?? '', 0, 120),
             'clave' => $clave, 'fecha' => ahora_()];
  guardarProp_(K_COLA_RECORD, array_values(array_slice($cola, -300)));
  registrar_($u, 'recordar_crm', 'USUARIOS', $quien['id'], $que);
  return ['ok' => true, 'encolado' => true];
}

/** Lo que cada comercial y captador ha dejado a medias en el CRM. */
function pendientesCRM_(string $hoy): array {
  $desde = desdeRecordatorios_();
  $C = indexar_(leer_('CLIENTES'), 'id');
  $P = []; foreach (leer_('PROYECTOS') as $x) $P[txt_($x['cliente_id'])] = $x;
  $fuera = [];
  $add = function ($uid, $clave, $texto, $como) use (&$fuera) {
    if (txt_($uid) === '') return;
    $uid = txt_($uid);
    if (!isset($fuera[$uid])) $fuera[$uid] = [];
    $fuera[$uid][] = ['clave' => $clave, 'texto' => $texto, 'como' => $como];
  };
  $nombre = fn($c) => $c ? implode(' · ', array_values(array_filter([txt_($c['direccion']), txt_($c['nombre'])], fn($s) => $s !== ''))) : '';
  $desdeYa = function ($f) use ($desde) { $d = trozo_($f, 0, 10); return $d !== '' && strcmp($d, $desde) >= 0; };
  $ddmmaaaa = fn($f) => implode('/', array_reverse(explode('-', $f)));

  foreach (leer_('CAPTACIONES') as $k) {
    $c = $C[txt_($k['cliente_id'])] ?? null;
    $f = trozo_($k['fecha'], 0, 10);
    $res = normal_(txt_($k['resultado']) !== '' ? $k['resultado'] : 'pendiente');
    /* Comercial: visita ya pasada sin resultado. */
    if (txt_($k['comercial_id']) !== '' && $desdeYa($f) && strcmp($f, $hoy) < 0 && $res === 'pendiente') {
      $add($k['comercial_id'], 'sinres|' . $k['id'], 'La visita del ' . $ddmmaaaa($f) . ' a ' . $nombre($c) . ' no tiene resultado.',
        'Ficha del cliente › + Apuntar › La visita (o pestaña Citas › Resultado).');
    }
    /* Comercial: sentada hace 2 días o más y el proyecto sin pedir. */
    $fr = trozo_($k['fecha_resultado'], 0, 10) ?: $f;
    if (txt_($k['comercial_id']) !== '' && ($res === 'sentada' || $res === 'potencial') && $desdeYa($fr) && diasEntre_($fr, $hoy) >= 2) {
      $pr = $P[txt_($k['cliente_id'])] ?? null;
      if (!$pr || in_array(normal_($pr['estado']), ['', 'borrador'], true)) {
        $add($k['comercial_id'], 'sinproy|' . $k['cliente_id'], 'Sentada en ' . $nombre($c) . ' sin proyecto pedido al ingeniero.',
          'Modo visita › Guardar y mandar al ingeniero (con al menos una foto).');
      }
    }
    /* Captador: ficha de captación incompleta. */
    if (txt_($k['captador_id']) !== '' && $c && $desdeYa(txt_($k['creado']) ?: $f)) {
      $falta = [];
      if (strlen(preg_replace('/\D/', '', txt_($c['telefono']))) < 9) $falta[] = 'teléfono';
      if (txt_($c['direccion']) === '') $falta[] = 'dirección';
      if (!num_($c['gasto_luz_mes']) && !num_($c['gasto_combustible'])) $falta[] = 'lo que gasta';
      if (count($falta)) $add($k['captador_id'], 'ficha|' . $k['id'] . '|' . implode(',', $falta),
        'A la ficha de ' . ($nombre($c) ?: 'un cliente') . ' le falta: ' . implode(', ', $falta) . '.',
        'Ficha del cliente › Falta por meter.');
    }
  }
  /* Comercial: propuesta lista hace 2 días o más y sin marcar como enviada. */
  foreach (leer_('PROYECTOS') as $pr) {
    $c = $C[txt_($pr['cliente_id'])] ?? null;
    if (!$c || txt_($c['comercial_id']) === '') continue;
    $fe = trozo_(txt_($pr['entregado']) !== '' ? $pr['entregado'] : $pr['modificado'], 0, 10);
    if (normal_($pr['estado']) === 'entregado' && txt_($pr['enviado']) === '' && $desdeYa($fe) && diasEntre_($fe, $hoy) >= 2) {
      $add($c['comercial_id'], 'sinenviar|' . $pr['id'], 'La propuesta de ' . $nombre($c) . ' está lista desde el ' . $ddmmaaaa($fe) . ' y no está marcada como enviada.',
        'Ficha › Proyecto › Enviar la propuesta › «Ya se lo he enviado».');
    }
    if (normal_($pr['estado']) === 'faltan_datos' && $desdeYa(txt_($pr['modificado'])) && diasEntre_(trozo_($pr['modificado'], 0, 10), $hoy) >= 2) {
      $add($c['comercial_id'], 'faltan|' . $pr['id'], 'El proyecto de ' . $nombre($c) . ' sigue parado: falta ' . txt_($pr['faltan']) . '.',
        'Ficha › Proyecto: súbelo ahí y vuelve solo a la cola.');
    }
  }
  /* Todos: el parte del último día laborable. */
  $ayer = sumarDias_($hoy, -1);
  while (($dd = fecha_($ayer)) && in_array((int)$dd->format('w'), [0, 6], true)) $ayer = sumarDias_($ayer, -1);
  if (strcmp($ayer, $desde) >= 0) {
    $conParte = [];
    foreach (leer_('PARTES') as $x) if (trozo_($x['fecha'], 0, 10) === $ayer) $conParte[txt_($x['usuario_id'])] = 1;
    foreach (leer_('USUARIOS') as $us) {
      if (in_array(normal_($us['rol']), ROLES_RECORD, true) && normal_($us['activo']) === 'si' && empty($conParte[txt_($us['id'])])) {
        $add($us['id'], 'parte|' . $ayer, 'No está el parte del día del ' . $ddmmaaaa($ayer) . '.', 'Menú › Parte del día.');
      }
    }
  }
  return $fuera;
}

/** El correo de cada persona: lo de fuera del CRM y lo que está a medias. */
function cuerpoRecordatorio_(array $us, array $deFuera, array $aMedias): string {
  $li = fn($t, $nota) => '<li style="margin:0 0 8px">' . $t . ($nota ? '<br><span style="color:#5b6159;font-size:13px">→ ' . $nota . '</span>' : '') . '</li>';
  $html = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#17191c;max-width:620px">' .
    '<p>Hola ' . txt_($us['nombre']) . ',</p>' .
    '<p>Desde el 3 de noviembre <b>todo se apunta en el CRM</b>, para que el equipo, el ingeniero y dirección lo vean a la vez y no se pierda nada.</p>';
  if (count($deFuera)) {
    $html .= '<p style="margin:18px 0 6px"><b>Esto lo has puesto en otro sitio y también tiene que estar en el CRM:</b></p><ul style="padding-left:20px;margin:0">' .
      implode('', array_map(fn($x) => $li((isset(DONDE_RECORD[$x['donde'] ?? '']) ? 'Lo pusiste ' . DONDE_RECORD[$x['donde']] . ': ' : '') . ($x['que'] ?? '') .
        (txt_($x['cliente'] ?? '') !== '' ? ' <b>(' . $x['cliente'] . ')</b>' : ''), 'Mételo tú en el CRM; si ya lo ha pasado el sistema, la próxima vez hazlo directamente allí.'), $deFuera)) . '</ul>';
  }
  if (count($aMedias)) {
    $html .= '<p style="margin:18px 0 6px"><b>Esto se ha quedado sin terminar en el CRM:</b></p><ul style="padding-left:20px;margin:0">' .
      implode('', array_map(fn($x) => $li($x['texto'], $x['como']), $aMedias)) . '</ul>';
  }
  $html .= '<p style="margin:22px 0"><a href="' . WEB_CRM . '" style="background:#b4fa1e;color:#17191c;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">Abrir el CRM</a></p>' .
    '<p style="color:#5b6159;font-size:12px">Este correo sale solo, como mucho dos veces al día, y no repite lo mismo antes de ' . DIAS_REPETIR_RECORD . ' días. ' .
    'Si algo de la lista ya está hecho, no hagas nada.</p></div>';
  return $html;
}

/**
 * Manda los recordatorios. Lo llama cron.php a las 13:30 y las 19:30.
 * Con simular no manda nada: devuelve lo que mandaría.
 */
function enviarRecordatorios_(array $opciones = []): array {
  $conf = config_();
  $simular = !empty($opciones['simular']);
  if (normal_($conf['avisos_crm'] ?? '') === 'no' && !$simular) return ['ok' => true, 'apagado' => true, 'correos' => []];
  $hoy = txt_($opciones['hoy'] ?? '') ?: hoyISO_();
  $dHoy = fecha_($hoy);
  if (!$dHoy) throw new Exception('Fecha ilegible: ' . $hoy); // NOTA PORT: el original fallaba aquí con un TypeError.
  $dia = (int)$dHoy->format('w');
  if (($dia === 0 || $dia === 6) && empty($opciones['forzar'])) return ['ok' => true, 'finde' => true, 'correos' => []];
  $tarde = array_key_exists('tarde', $opciones) && $opciones['tarde'] !== null ? (bool)$opciones['tarde']
    : ((int)formatearFecha_(ahoraDT_(), 'H') >= 16);
  $cola = leerProp_(K_COLA_RECORD, []);
  if (!is_array($cola)) $cola = [];
  $enviados = leerProp_(K_ENVIADOS_RECORD, []);
  if (!is_array($enviados)) $enviados = [];
  $reciente = function ($uid, $clave) use (&$enviados, $hoy) {
    $f = $enviados[txt_($uid) . '#' . $clave] ?? null;
    return $f && diasEntre_($f, $hoy) < DIAS_REPETIR_RECORD;
  };
  $aMedias = $tarde ? pendientesCRM_($hoy) : [];
  $todos = leer_('USUARIOS');
  /* Si alguien de dirección también tiene cuenta de comercial con su mismo
     correo (Nando), tampoco le llega: los recordatorios son para el equipo. */
  $deDireccion = [];
  foreach ($todos as $x) if (!in_array(normal_($x['rol']), ROLES_RECORD, true) && txt_($x['email']) !== '') $deDireccion[normal_($x['email'])] = 1;
  $usuarios = array_values(array_filter($todos, fn($x) =>
    in_array(normal_($x['rol']), ROLES_RECORD, true) && normal_($x['activo']) === 'si' && txt_($x['email']) !== '' && empty($deDireccion[normal_($x['email'])])));
  $correos = [];
  foreach ($usuarios as $us) {
    $fuera = array_values(array_filter($cola, fn($x) => mismo_($x['usuario_id'] ?? '', $us['id']) && !$reciente($us['id'], $x['clave'] ?? '')));
    $medias = array_values(array_filter($aMedias[txt_($us['id'])] ?? [], fn($x) => !$reciente($us['id'], $x['clave'])));
    if (!count($fuera) && !count($medias)) continue;
    $n = count($fuera) + count($medias);
    $correo = ['to' => txt_($us['email']), 'name' => 'CRM · ZERO WATTIOS',
      'subject' => 'Falta' . ($n > 1 ? 'n ' . $n . ' cosas' : ' 1 cosa') . ' por meter en el CRM',
      'htmlBody' => cuerpoRecordatorio_($us, $fuera, $medias)];
    $correos[] = ['usuario' => $us['nombre'], 'email' => $us['email'], 'fuera' => array_map(fn($x) => $x['que'] ?? '', $fuera),
                  'aMedias' => array_map(fn($x) => $x['texto'], $medias), 'asunto' => $correo['subject']];
    if ($simular) continue;
    try {
      correo_($correo);
      foreach (array_merge($fuera, $medias) as $x) $enviados[txt_($us['id']) . '#' . ($x['clave'] ?? '')] = $hoy;
    } catch (Throwable $e) { /* sin cuota o sin correo: se intenta en la siguiente vuelta */ }
  }
  if (!$simular) {
    /* Lo de la cola ya avisado sale de la cola; los avisados viejos se olvidan. */
    guardarProp_(K_COLA_RECORD, array_values(array_filter($cola, fn($x) => empty($enviados[txt_($x['usuario_id'] ?? '') . '#' . ($x['clave'] ?? '')]))));
    foreach (array_keys($enviados) as $k) if (diasEntre_($enviados[$k], $hoy) > 30) unset($enviados[$k]);
    guardarProp_(K_ENVIADOS_RECORD, $enviados ?: new stdClass());
  }
  return ['ok' => true, 'correos' => $correos];
}

/** Lo que ejecuta cron.php (13:30 y 19:30, lunes a viernes). */
function recordatoriosCRM(): array { return enviarRecordatorios_([]); }

/** Dirección: ver lo que saldría ahora (simular) o mandarlo ya. */
function accRecordatorios_(array $u, array $p): array {
  exigir_($u, 'config');
  return enviarRecordatorios_(['simular' => ($p['simular'] ?? null) !== false, 'tarde' => ($p['tarde'] ?? null) !== false,
    'forzar' => !empty($p['forzar']), 'hoy' => txt_($p['hoy'] ?? '') ?: null]);
}

/** En Apps Script creaba los dos disparadores diarios; aquí no hay nada que instalar. */
function instalarRecordatorios(): bool {
  // NOTA PORT: la programación la hace cron.php (recordatoriosCRM a las 13:30 y 19:30; los fines de semana no sale nada).
  return true;
}
