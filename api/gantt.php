<?php
/**
 * gantt.php — Diagramas de Gantt (19/11/2026, petición de Nando).
 *
 * «Un diagrama de Gantt para ver en qué estado están las operaciones, y un
 * Gantt general de empresa. Solo tendrán acceso Rubén y el superadmin. Si
 * hay que corregir algo, debajo un espacio para darle órdenes escritas. La
 * información sale del Google Calendar FECHAS AEROTERMIA Y FOTOVOLTAICA.»
 *
 *   · El calendario lo rellena Nando a mano y NO se toca nunca: el asistente
 *     lo lee y lo vuelca aquí (guardarGanttCalendario) en GANTT_EVENTOS.
 *     Cada evento se casa con su operación por la dirección
 *     («MATERIAL FOTOVOLTAICA ENEBRO 12» → la operación de C/ Enebro 12).
 *   · gantt: devuelve las operaciones en curso con sus fases (firma,
 *     material, instalación FV y aerotermia, legalización) y todos los
 *     eventos del calendario, para pintar los dos diagramas. Sin importes.
 *   · Órdenes: lo que Rubén o el superadmin escriban debajo del diagrama
 *     queda en GANTT_ORDENES y se avisa por correo a Nando; el asistente las
 *     lee (ganttOrdenes), las hace y las marca resueltas con su respuesta.
 *
 * Quién: ver, solo GANTT_USUARIOS (config.php). Volcar el calendario, leer
 * y resolver órdenes: además GANTT_GESTORES (la sesión con la que trabaja
 * el asistente).
 */

require_once __DIR__ . '/base.php';

const GANTT_ESTADOS_OP = ['firmada', 'financiacion', 'tramite', 'material', 'instalacion', 'instalada', 'legalizada'];
const GANTT_VIAS = ['calle', 'c', 'cl', 'avenida', 'avda', 'av', 'plaza', 'pza', 'paseo', 'po', 'camino', 'cm', 'urbanizacion', 'urb',
  'travesia', 'ronda', 'carretera', 'ctra', 'glorieta', 'via', 'de', 'del', 'la', 'las', 'los', 'el'];

function ganttGestor_(array $u): bool {
  return veGantt_($u) || in_array(txt_($u['id'] ?? ''), GANTT_GESTORES, true) || normal_($u['rol'] ?? '') === 'agente';
}

/* ---------- direcciones ---------- */

/** «C/ Río Tajo, 56 (Las Rozas)» → ['rio tajo', '56']. */
function ganttDir_(string $s): array {
  $s = normal_($s);
  $s = preg_replace('/[^a-z0-9 ]+/', ' ', $s);
  $num = '';
  if (preg_match('/\b(\d+)\s*[a-z]?\b/', $s, $m)) $num = $m[1];
  $antes = $num !== '' ? substr($s, 0, strpos($s, $m[0])) : $s;
  $pal = array_values(array_filter(explode(' ', $antes), fn($w) => $w !== '' && !in_array($w, GANTT_VIAS, true)));
  return [implode(' ', $pal), $num];
}

/** Qué dice el título del evento: tipo, especialidad y dirección. */
function ganttTitulo_(string $t): array {
  $n = normal_($t);
  $tipo = preg_match('/^\s*material/', $n) ? 'material' : (preg_match('/^\s*(finaliz|terminar|fin )/', $n) ? 'finalizar' : 'instalacion');
  $esp = preg_match('/aerotermia|aero\b|bomba de calor/', $n) ? 'aerotermia'
    : (preg_match('/fotovoltaica|\bfv\b|placas|paneles|solar/', $n) ? 'fotovoltaica' : '');
  if ($esp === '' && $tipo === 'instalacion') $tipo = 'otro';
  $resto = preg_replace('/\b(material|finalizar|finalizacion|terminar|instalacion|instalar|aerotermia|aero|fotovoltaica|fv|placas|paneles|bateria|baterias)\b/', ' ', $n);
  return ['tipo' => $tipo, 'esp' => $esp, 'dir' => ganttDir_($resto)];
}

/** Operación de esa dirección (mismo número y calle parecida). */
function ganttCasar_(array $dir, array $ops, array $clientes): ?array {
  [$calle, $num] = $dir;
  if ($calle === '' || $num === '') return null;
  $mejor = null; $nota = 99;
  foreach ($ops as $op) {
    $cli = $clientes[(string)$op['cliente_id']] ?? null;
    if (!$cli) continue;
    [$c2, $n2] = ganttDir_(txt_($cli['direccion'] ?? ''));
    if ($n2 !== $num || $c2 === '') continue;
    $d = levenshtein($calle, $c2);
    if (strpos($c2, $calle) !== false || strpos($calle, $c2) !== false) $d = min($d, 1);
    if ($d <= max(2, (int)floor(strlen($calle) / 5)) && ($d < $nota
        || ($d === $nota && strcmp(txt_($op['fecha_firma'] ?? ''), txt_($mejor['fecha_firma'] ?? '')) > 0))) { $mejor = $op; $nota = $d; }
  }
  return $mejor;
}

/* ---------- volcar el calendario ---------- */

/**
 * p.eventos = [{id, titulo, descripcion, inicio, fin, color}] (inicio/fin ISO
 * con hora o fecha sola), p.desde / p.hasta (AAAA-MM-DD): lo que había en ese
 * tramo y ya no está en el calendario se quita (se borró o se movió fuera).
 */
function accGuardarGanttCalendario_(array $u, array $p): array {
  if (!ganttGestor_($u)) return ['ok' => false, 'error' => 'Tu usuario no tiene acceso al Gantt.'];
  $eventos = is_array($p['eventos'] ?? null) ? $p['eventos'] : [];
  $desde = preg_match('/^\d{4}-\d{2}-\d{2}$/', txt_($p['desde'] ?? '')) ? $p['desde'] : '';
  $hasta = preg_match('/^\d{4}-\d{2}-\d{2}$/', txt_($p['hasta'] ?? '')) ? $p['hasta'] : '';

  $ops = filtrar_('OPERACIONES', fn($o) => !in_array(normal_($o['estado'] ?? ''), ['perdida', 'cancelada', 'anulada'], true));
  $activas = array_values(array_filter($ops, fn($o) => in_array(normal_($o['estado'] ?? ''), GANTT_ESTADOS_OP, true)));
  $clientes = indexar_(leer_('CLIENTES'));
  $ya = []; foreach (leer_('GANTT_EVENTOS') as $e) $ya[txt_($e['evento_id'])] = $e;

  $vistos = []; $nuevos = 0; $cambiados = 0; $sin = [];
  foreach ($eventos as $ev) {
    $eid = txt_($ev['id'] ?? ''); $tit = txt_($ev['titulo'] ?? '');
    if ($eid === '' || $tit === '') continue;
    $vistos[$eid] = true;
    $ini = txt_($ev['inicio'] ?? ''); $fin = txt_($ev['fin'] ?? '') ?: $ini;
    $todoDia = strlen($ini) === 10;
    $t = ganttTitulo_($tit);
    $op = ganttCasar_($t['dir'], $activas, $clientes) ?? ganttCasar_($t['dir'], $ops, $clientes);
    $fila = ['evento_id' => $eid, 'calendario' => 'FECHAS AEROTERMIA Y FOTOVOLTAICA', 'titulo' => $tit,
      'inicio' => substr(str_replace('T', ' ', $ini), 0, 16), 'fin' => substr(str_replace('T', ' ', $fin), 0, 16),
      'todo_dia' => $todoDia ? 'si' : 'no', 'tipo' => $t['tipo'], 'especialidad' => $t['esp'],
      'operacion_id' => $op ? txt_($op['id']) : '', 'cliente_id' => $op ? txt_($op['cliente_id']) : '',
      'descripcion' => mb_substr(txt_($ev['descripcion'] ?? ''), 0, 500), 'color' => txt_($ev['color'] ?? '')];
    if (!$op && $t['tipo'] !== 'otro') $sin[] = $tit;
    if (isset($ya[$eid])) {
      $antes = $ya[$eid]; $cambia = [];
      foreach ($fila as $k => $v) if (txt_($antes[$k] ?? '') !== $v) $cambia[$k] = $v;
      if ($cambia) { $cambia['actualizado'] = ahora_(); actualizar_('GANTT_EVENTOS', $antes['id'], $cambia); $cambiados++; }
    } else {
      insertar_('GANTT_EVENTOS', $fila + ['actualizado' => ahora_()]); $nuevos++;
    }
  }
  $quitados = 0;
  if ($desde !== '' && $hasta !== '') {
    foreach ($ya as $eid => $e) {
      $f = substr(txt_($e['inicio']), 0, 10);
      if (!isset($vistos[$eid]) && strcmp($f, $desde) >= 0 && strcmp($f, $hasta) <= 0) { borrar_('GANTT_EVENTOS', $e['id']); $quitados++; }
    }
  }
  setProp_('GANTT_SINCRONIZADO', ahora_());
  return ['ok' => true, 'nuevos' => $nuevos, 'cambiados' => $cambiados, 'quitados' => $quitados, 'sin_operacion' => $sin];
}

/* ---------- los diagramas ---------- */

function accGantt_(array $u, array $p): array {
  if (!veGantt_($u)) return ['ok' => false, 'error' => 'Esta parte del CRM solo la ven Rubén y el superadmin.'];
  $eventos = leer_('GANTT_EVENTOS');
  $conEv = []; foreach ($eventos as $e) if (txt_($e['operacion_id']) !== '') $conEv[txt_($e['operacion_id'])] = true;
  $ops = filtrar_('OPERACIONES', fn($o) => in_array(normal_($o['estado'] ?? ''), GANTT_ESTADOS_OP, true) || isset($conEv[txt_($o['id'])]));
  $clientes = indexar_(leer_('CLIENTES'));
  $usuarios = []; foreach (leer_('USUARIOS') as $x) $usuarios[(string)$x['id']] = txt_($x['nombre']);
  $contratas = []; foreach (filtrar_('PORTAL_CUENTAS', fn($c) => normal_($c['tipo'] ?? '') === 'contrata') as $c) $contratas[(string)$c['id']] = txt_($c['empresa']) ?: txt_($c['nombre']);
  $obras = []; foreach (filtrar_('OBRAS', fn($x) => normal_($x['estado'] ?? '') !== 'cancelada') as $ob) $obras[txt_($ob['operacion_id'])][] = $ob;

  $evOut = array_map(fn($e) => ['id' => txt_($e['evento_id']), 'titulo' => txt_($e['titulo']), 'inicio' => txt_($e['inicio']),
    'fin' => txt_($e['fin']), 'todo_dia' => txt_($e['todo_dia']) === 'si', 'tipo' => txt_($e['tipo']), 'esp' => txt_($e['especialidad']),
    'op_id' => txt_($e['operacion_id']), 'descripcion' => txt_($e['descripcion']),
    'pendiente' => (bool)preg_match('/\b(pte|pdte|pendiente|confirmar|modificar)\b/', normal_($e['descripcion'] ?? ''))], $eventos);
  usort($evOut, fn($a, $b) => strcmp($a['inicio'], $b['inicio']));

  $opOut = [];
  foreach ($ops as $o) {
    $cli = $clientes[txt_($o['cliente_id'])] ?? [];
    $opOut[] = ['id' => txt_($o['id']), 'referencia' => txt_($o['referencia']), 'cliente_id' => txt_($o['cliente_id']),
      'cliente' => etiquetaGantt_($cli), 'municipio' => txt_($cli['municipio'] ?? ''), 'tipo' => txt_($o['tipo']),
      'estado' => normal_($o['estado']), 'comercial' => $usuarios[txt_($o['comercial_id'])] ?? '',
      'firma' => substr(txt_($o['fecha_firma']) ?: txt_($o['fecha_contrato']), 0, 10),
      'prevista' => substr(txt_($o['fecha_prevista_instalacion']), 0, 10),
      'instalada' => substr(txt_($o['fecha_instalacion']), 0, 10),
      'legalizada' => substr(txt_($o['fecha_legalizacion']), 0, 10),
      'obras' => array_map(fn($ob) => ['esp' => normal_($ob['especialidad']) === 'aerotermia' ? 'aerotermia' : 'fotovoltaica',
        'quien' => $contratas[txt_($ob['contrata_id'])] ?? '', 'estado' => normal_($ob['estado']), 'progreso' => (int)num_($ob['progreso']),
        'prevista' => substr(txt_($ob['fecha_prevista']), 0, 10), 'llegada' => substr(txt_($ob['llegada']), 0, 10),
        'terminada' => substr(txt_($ob['terminada']), 0, 10)], $obras[txt_($o['id'])] ?? [])];
  }
  return ['ok' => true, 'hoy' => hoyISO_(), 'sincronizado' => prop_('GANTT_SINCRONIZADO') ?? '',
    'operaciones' => $opOut, 'eventos' => $evOut, 'ordenes' => ganttListaOrdenes_(60)];
}

function etiquetaGantt_(array $cli): string {
  $s = implode(' · ', array_values(array_filter([txt_($cli['direccion'] ?? ''), txt_($cli['nombre'] ?? '')], fn($x) => $x !== '')));
  return $s !== '' ? $s : txt_($cli['id'] ?? '');
}

/* ---------- órdenes escritas ---------- */

function ganttListaOrdenes_(int $max, bool $soloPendientes = false): array {
  $o = leer_('GANTT_ORDENES');
  if ($soloPendientes) $o = array_values(array_filter($o, fn($x) => txt_($x['estado']) === 'pendiente'));
  usort($o, fn($a, $b) => strcmp(txt_($b['fecha']), txt_($a['fecha'])));
  return array_map(fn($x) => ['id' => txt_($x['id']), 'fecha' => txt_($x['fecha']), 'usuario' => txt_($x['usuario']),
    'texto' => txt_($x['texto']), 'vista' => txt_($x['vista']), 'operacion_id' => txt_($x['operacion_id']), 'estado' => txt_($x['estado']),
    'respuesta' => txt_($x['respuesta']), 'resuelta' => txt_($x['resuelta'])], array_slice($o, 0, $max));
}

function accGuardarGanttOrden_(array $u, array $p): array {
  if (!veGantt_($u)) return ['ok' => false, 'error' => 'Esta parte del CRM solo la ven Rubén y el superadmin.'];
  $texto = trim(mb_substr(txt_($p['texto'] ?? ''), 0, 2000));
  if ($texto === '') return ['ok' => false, 'error' => 'Escribe la orden.'];
  $vista = in_array(txt_($p['vista'] ?? ''), ['operaciones', 'empresa', 'equipo'], true) ? $p['vista'] : 'operaciones';
  $fila = insertar_('GANTT_ORDENES', ['fecha' => ahora_(), 'usuario_id' => txt_($u['id']), 'usuario' => txt_($u['nombre']),
    'texto' => $texto, 'vista' => $vista, 'operacion_id' => txt_($p['operacion_id'] ?? ''), 'estado' => 'pendiente']);
  registrar_($u, 'orden_gantt', 'GANTT_ORDENES', $fila['id'], ['texto' => mb_substr($texto, 0, 200)]);
  $destino = txt_(config_()['avisos_guardia_a'] ?? '') ?: 'fernandogarcia@zerowattios.com';
  try {
    correo_(['to' => $destino, 'subject' => 'CRM · Orden en el Gantt de ' . txt_($u['nombre']),
      'body' => txt_($u['nombre']) . ' ha dejado una orden en el Gantt (' . $vista . "):\n\n" . $texto .
        "\n\nEl asistente la recoge en su siguiente ronda; también puedes verla en CRM › Gantt."]);
  } catch (Throwable $e) { /* el correo no debe impedir guardar la orden */ }
  return ['ok' => true, 'orden' => ganttListaOrdenes_(1)[0] ?? null];
}

function accGanttOrdenes_(array $u, array $p): array {
  if (!ganttGestor_($u)) return ['ok' => false, 'error' => 'Tu usuario no tiene acceso al Gantt.'];
  return ['ok' => true, 'ordenes' => ganttListaOrdenes_(100, !empty($p['pendientes']))];
}

/** p = {id, respuesta, estado: hecha|descartada|pendiente} */
function accResolverGanttOrden_(array $u, array $p): array {
  if (!ganttGestor_($u)) return ['ok' => false, 'error' => 'Tu usuario no tiene acceso al Gantt.'];
  $f = buscar1_('GANTT_ORDENES', fn($x) => txt_($x['id']) === txt_($p['id'] ?? ''));
  if (!$f) return ['ok' => false, 'error' => 'No encuentro esa orden.'];
  $estado = in_array(txt_($p['estado'] ?? ''), ['hecha', 'descartada', 'pendiente'], true) ? $p['estado'] : 'hecha';
  actualizar_('GANTT_ORDENES', $f['id'], ['estado' => $estado, 'respuesta' => mb_substr(txt_($p['respuesta'] ?? ''), 0, 2000),
    'resuelta' => $estado === 'pendiente' ? '' : ahora_(), 'resuelta_por' => txt_($u['nombre'])]);
  return ['ok' => true];
}

/* ---------- calendario del equipo (19/11/2026, petición de Nando) ----------
   «Un calendario para saber qué hace cada uno de los empleados por fecha, y
   que se pueda ver ahí su parte del día.» Por persona y día: el parte
   (visitas, puertas, fichas, sentadas, ventas y su resumen; sin importes),
   las fichas que metió, las visitas que tenía, los seguimientos que apuntó,
   las tareas que cerró y si estaba de vacaciones. p.mes = AAAA-MM. */
function accGanttEquipo_(array $u, array $p): array {
  if (!veGantt_($u)) return ['ok' => false, 'error' => 'Esta parte del CRM solo la ven Rubén y el superadmin.'];
  $mes = preg_match('/^\d{4}-\d{2}$/', txt_($p['mes'] ?? '')) ? $p['mes'] : substr(hoyISO_(), 0, 7);
  $en = fn($f) => substr(txt_($f), 0, 7) === $mes;
  $dia = fn($f) => substr(txt_($f), 0, 10);
  $personas = [];
  foreach (leer_('USUARIOS') as $x) {
    if (txt_($x['activo']) !== 'si' || in_array(normal_($x['rol']), ['superadmin', 'agente'], true)) continue;
    $personas[txt_($x['id'])] = ['id' => txt_($x['id']), 'nombre' => txt_($x['nombre']), 'rol' => normal_($x['rol']), 'color' => txt_($x['color'])];
  }
  $clientes = indexar_(leer_('CLIENTES'));
  $calle = fn($id) => txt_(($clientes[txt_($id)] ?? [])['direccion'] ?? '') ?: txt_($id);
  $dias = [];   // [usuario][fecha] => {...}
  $poner = function ($uid, $f, $clave, $valor) use (&$dias, $personas) {
    if (!isset($personas[$uid]) || $f === '') return;
    $dias[$uid][$f][$clave][] = $valor;
  };

  foreach (filtrar_('PARTES', fn($x) => $en($x['fecha'])) as $x) {
    $uid = txt_($x['usuario_id']); $f = $dia($x['fecha']);
    if (!isset($personas[$uid])) continue;
    $dias[$uid][$f]['parte'] = ['visitas' => (int)num_($x['visitas']), 'puertas' => (int)num_($x['puertas']), 'fichas' => (int)num_($x['fichas']),
      'sentadas' => (int)num_($x['sentadas']), 'ventas' => (int)num_($x['ventas']), 'sentadas_detalle' => mb_substr(txt_($x['sentadas_detalle']), 0, 600),
      'resumen' => mb_substr(txt_($x['resumen']), 0, 1500), 'estado' => txt_($x['estado'])];
  }
  foreach (filtrar_('CAPTACIONES', fn($x) => $en($x['creado']) || $en($x['fecha'])) as $x) {
    if ($en($x['creado'])) $poner(txt_($x['captador_id']), $dia($x['creado']), 'fichas', $calle($x['cliente_id']));
    if ($en($x['fecha']) && txt_($x['comercial_id']) !== '')
      $poner(txt_($x['comercial_id']), $dia($x['fecha']), 'visitas', trim(txt_($x['hora_cita']) . ' ' . $calle($x['cliente_id'])) .
        (txt_($x['resultado']) !== '' && txt_($x['resultado']) !== 'pendiente' ? ' · ' . txt_($x['resultado']) : ''));
  }
  foreach (filtrar_('SEGUIMIENTO', fn($x) => $en($x['fecha'])) as $x)
    $poner(txt_($x['usuario_id']), $dia($x['fecha']), 'seguimientos', $calle($x['cliente_id']) . ': ' . mb_substr(txt_($x['nota']), 0, 120));
  foreach (filtrar_('TAREAS', fn($x) => $en($x['hecho'])) as $x)
    $poner(txt_($x['hecho_por']) ?: txt_($x['usuario_id']), $dia($x['hecho']), 'tareas', mb_substr(txt_($x['titulo']), 0, 120));
  foreach (filtrar_('VACACIONES', fn($x) => in_array(normal_($x['estado']), ['aprobada', 'aprobado', 'disfrutada'], true)) as $x) {
    $d = $dia($x['desde']); $h = $dia($x['hasta']) ?: $d;
    if ($d === '') continue;
    for ($t = strtotime($d); $t <= strtotime($h); $t += 86400) {
      $f = date('Y-m-d', $t);
      if (substr($f, 0, 7) === $mes) $poner(txt_($x['usuario_id']), $f, 'ausencia', txt_($x['tipo']) ?: 'vacaciones');
    }
  }
  return ['ok' => true, 'mes' => $mes, 'hoy' => hoyISO_(), 'personas' => array_values($personas), 'dias' => $dias ?: new stdClass()];
}

/* ---------- calendario FECHAS (solo superadmin, Nando y Fernando) ---------- */
function veCalFechas_(array $u): bool {
  return in_array(txt_($u['id'] ?? ''), defined('CALFECHAS_USUARIOS') ? CALFECHAS_USUARIOS : [], true);
}

function accCalendarioFechas_(array $u, array $p): array {
  if (!veCalFechas_($u)) return ['ok' => false, 'error' => 'Este calendario solo lo ven el superadmin, Nando y Fernando.'];
  $g = accGantt_(['id' => GANTT_USUARIOS[0]], $p);   // mismos datos, sin órdenes
  $ops = array_map(fn($o) => ['id' => $o['id'], 'cliente_id' => $o['cliente_id'], 'cliente' => $o['cliente'], 'estado' => $o['estado']], $g['operaciones'] ?? []);
  return ['ok' => true, 'hoy' => $g['hoy'], 'sincronizado' => $g['sincronizado'], 'eventos' => $g['eventos'] ?? [], 'operaciones' => $ops, 'ordenes' => []];
}
