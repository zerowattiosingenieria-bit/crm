<?php
/**
 * CRM · ZERO WATTIOS
 * ficha.php — Un cliente, una ficha (02/11/2026).
 * (Traducción de 22_Ficha.gs)
 *
 * Orden de Nando: «todo tiene que estar enlazado, sin duplicar cosas y
 * fácil de introducir». La revisión de los datos reales dio clientes
 * repetidos (mismo teléfono o misma casa), clientes con varias citas de las
 * que el CRM solo miraba la primera, el interés apuntado en dos sitios con
 * números distintos y fichas borradas que dejaban sueltos sus apuntes.
 *
 *  - Al dar de alta se busca si el cliente ya está (teléfono o dirección).
 *    Si está, no se crea otro: se avisa con su ficha, y si es una cita de un
 *    captador, la cita se apunta en el cliente que ya existía.
 *  - Dirección puede fusionar dos fichas: todo lo de una pasa a la otra.
 *  - La cita que manda es la última (o la de la instalación), no la primera.
 *  - El interés y el estado que deja una cita pasan al cliente: un solo dato.
 *  - Un cliente con cosas enlazadas no se borra: se fusiona.
 */

require_once __DIR__ . '/base.php';

/* ---------- duplicados ---------- */

function telefono9_($t): string {
  $d = preg_replace('/\D/', '', txt_($t));
  return strlen($d) >= 9 ? substr($d, -9) : '';
}

/* La calle sin «calle», «avenida», signos ni espacios: «C/ Gerifalte, 15» = «calle gerifalte 15». */
function direccionClave_($dir): string {
  $n = normal_($dir);
  $n = preg_replace('/\b(calle|c|cl|avenida|avda|av|plaza|pza|pl|paseo|po|camino|cm|urb|urbanizacion|carretera|ctra)\b\.?/', ' ', $n);
  $n = preg_replace('/[^a-z0-9]/', '', $n);
  return (preg_match('/\d/', $n) && strlen($n) >= 6) ? $n : '';
}

/** El cliente que ya existe con ese teléfono o esa dirección (o null). */
function buscarDuplicado_(array $d, $salvoId = null, ?array $todos = null): ?array {
  $tel = telefono9_($d['telefono'] ?? '');
  $dir = direccionClave_($d['direccion'] ?? '');
  if ($tel === '' && $dir === '') return null;
  $mun = normal_($d['municipio'] ?? '');
  $lista = $todos ?? leer_('CLIENTES');
  foreach ($lista as $c) {
    if (txt_($salvoId) !== '' && mismo_($c['id'], $salvoId)) continue;
    if ($tel !== '' && telefono9_($c['telefono']) === $tel) return ['cliente' => $c, 'por' => 'teléfono'];
  }
  if ($dir === '') return null;
  foreach ($lista as $k) {
    if (txt_($salvoId) !== '' && mismo_($k['id'], $salvoId)) continue;
    if (direccionClave_($k['direccion']) !== $dir) continue;
    $mk = normal_($k['municipio']);
    if ($mun === '' || $mk === '' || $mun === $mk) return ['cliente' => $k, 'por' => 'dirección'];
  }
  return null;
}

function etiquetaDuplicado_(array $u, array $dup): array {
  $c = $dup['cliente'];
  $visible = veCliente_($u, $c);
  $partes = array_values(array_filter([txt_($c['direccion']), txt_($c['nombre'])], fn($s) => $s !== ''));
  return [
    'id' => $c['id'], 'por' => $dup['por'], 'visible' => $visible,
    'etiqueta' => $visible ? implode(' · ', $partes) : 'cliente de otro compañero',
    'comercial' => nombreUsuario_($c['comercial_id'])
  ];
}

function nombreUsuario_($id, ?array $usuarios = null): string {
  if (txt_($id) === '') return '';
  $x = null;
  foreach ($usuarios ?? leer_('USUARIOS') as $v) { if (mismo_($v['id'], $id)) { $x = $v; break; } }
  return $x ? txt_($x['nombre']) : '';
}

/* Las tablas que cuelgan de un cliente (todas las que tienen cliente_id). */
function tablasDeCliente_(): array {
  return array_values(array_filter(array_keys(ESQUEMA), function ($t) {
    return $t !== 'CLIENTES' && in_array('cliente_id', ESQUEMA[$t], true);
  }));
}

function enlazadosDe_($clienteId): array {
  return conteoEnlazados_()[txt_($clienteId)] ?? [];
}

/* Cuántas cosas cuelgan de cada cliente, leyendo cada tabla una sola vez. */
function conteoEnlazados_(): array {
  $r = [];
  /* El histórico no cuenta como «cosas enlazadas»: no impide borrar una ficha. */
  foreach (array_diff(tablasDeCliente_(), ['CAMBIOS', 'CITAS_CAMBIOS']) as $t) {
    foreach (leer_($t) as $x) {
      $k = txt_($x['cliente_id'] ?? '');
      if ($k === '') continue;
      $r[$k] = $r[$k] ?? [];
      $r[$k][$t] = ($r[$k][$t] ?? 0) + 1;
    }
  }
  return $r;
}

/** Dirección: grupos de fichas que parecen el mismo cliente. */
function accDuplicados_(array $u, array $p): array {
  exigir_($u, 'editarTodo');
  $C = leer_('CLIENTES');
  $grupos = [];
  $add = function ($k, $c, $por) use (&$grupos) { if ($k === '') return; $grupos[$por . '|' . $k][] = $c; };
  foreach ($C as $c) {
    $add(telefono9_($c['telefono']), $c, 'teléfono');
    /* Por calle sin mirar el municipio: muchas fichas viejas no lo tienen.
       Si son de pueblos distintos, se ve en la lista y no se fusionan. */
    $add(direccionClave_($c['direccion']), $c, 'dirección');
  }
  $vistos = [];
  $lista = [];
  $cuenta = conteoEnlazados_();
  $U = leer_('USUARIOS');
  foreach ($grupos as $k => $g) {
    if (count($g) < 2) continue;
    $ids = array_map(fn($c) => txt_($c['id']), $g);
    sort($ids, SORT_STRING);
    $clave = implode('+', $ids);
    if (isset($vistos[$clave])) continue;
    $vistos[$clave] = 1;
    $lista[] = ['por' => partir_($k, '|')[0], 'clientes' => array_map(function ($c) use ($cuenta, $U) {
      return ['id' => $c['id'], 'nombre' => $c['nombre'], 'direccion' => $c['direccion'], 'municipio' => $c['municipio'], 'telefono' => $c['telefono'],
              'estado' => $c['estado'], 'comercial' => nombreUsuario_($c['comercial_id'], $U), 'creado' => $c['creado'],
              'enlazados' => $cuenta[txt_($c['id'])] ?? new stdClass()];
    }, $g)];
  }
  return ['ok' => true, 'grupos' => $lista];
}

/**
 * Dirección: pasa todo lo de «origen» a «destino» y borra «origen».
 * Lo que la ficha buena tenga vacío se rellena con lo de la otra; las notas
 * se juntan. Las citas, instalaciones, apuntes, facturas, archivos y tareas
 * pasan tal cual. Si las dos tenían proyecto, se queda el de destino con
 * los archivos y la descripción de los dos.
 */
function accFusionarClientes_(array $u, array $p): array {
  exigir_($u, 'editarTodo');
  $C = leer_('CLIENTES');
  $o = null; $d = null;
  foreach ($C as $c) { if ($o === null && mismo_($c['id'], $p['origen'] ?? '')) $o = $c; }
  foreach ($C as $c) { if ($d === null && mismo_($c['id'], $p['destino'] ?? '')) $d = $c; }
  if (!$o || !$d) return ['ok' => false, 'error' => 'Falta una de las dos fichas.'];
  if (mismo_($o['id'], $d['id'])) return ['ok' => false, 'error' => 'Es la misma ficha.'];

  $cambios = ['modificado' => ahora_(), 'modificado_por' => $u['id']];
  foreach (ESQUEMA['CLIENTES'] as $k) {
    if (in_array($k, ['id', 'creado', 'creado_por', 'modificado', 'modificado_por', 'perfil', 'otros'], true)) continue;
    if (txt_($d[$k]) === '' && txt_($o[$k]) !== '') $cambios[$k] = $o[$k];
  }
  foreach (['perfil', 'otros'] as $k) {
    $a = txt_($d[$k]); $b = txt_($o[$k]);
    if ($b !== '' && !str_contains(normal_($a), normal_($b))) $cambios[$k] = $a !== '' ? $a . "\n" . $b : $b;
  }
  /* Se queda la ficha más antigua como fecha de alta. */
  if (txt_($o['creado']) !== '' && strcmp(txt_($o['creado']), txt_($d['creado'])) < 0) $cambios['creado'] = $o['creado'];
  actualizar_('CLIENTES', $d['id'], $cambios);

  /* Proyecto: uno por cliente. */
  $po = buscar1_('PROYECTOS', fn($x) => mismo_($x['cliente_id'], $o['id']));
  $pd = buscar1_('PROYECTOS', fn($x) => mismo_($x['cliente_id'], $d['id']));
  if ($po && $pd) {
    foreach (filtrar_('ARCHIVOS', fn($a) => mismo_($a['proyecto_id'], $po['id'])) as $a) {
      actualizar_('ARCHIVOS', $a['id'], ['proyecto_id' => $pd['id'], 'cliente_id' => $d['id']]);
    }
    $desc = implode("\n\n", array_values(array_filter([txt_($pd['descripcion']), txt_($po['descripcion'])], fn($s) => $s !== '')));
    actualizar_('PROYECTOS', $pd['id'], ['descripcion' => $desc]);
    borrar_('PROYECTOS', $po['id']);
  }

  $movidos = [];
  foreach (tablasDeCliente_() as $t) {
    if (!in_array('id', ESQUEMA[$t], true)) continue;
    foreach (filtrar_($t, fn($x) => mismo_($x['cliente_id'], $o['id'])) as $x) {
      actualizar_($t, $x['id'], ['cliente_id' => $d['id']]);
      $movidos[$t] = ($movidos[$t] ?? 0) + 1;
    }
  }
  borrar_('CLIENTES', $o['id']);
  registrar_($u, 'fusionar_cliente', 'CLIENTES', $d['id'], $o['id'] . ' → ' . $d['id'] . ' ' . aJson_((object)$movidos));
  $r = buscar1_('CLIENTES', fn($c) => mismo_($c['id'], $d['id']));
  return ['ok' => true, 'cliente' => clienteParaVer_($u, $r), 'movidos' => $movidos ?: new stdClass()];
}

/* ---------- la cita que manda ---------- */

/** La cita de un cliente que cuenta: la de esa instalación, si no la última. */
function captacionActual_($clienteId, $operacionId = null): ?array {
  $lista = filtrar_('CAPTACIONES', fn($c) => mismo_($c['cliente_id'], $clienteId));
  if (!count($lista)) return null;
  if (txt_($operacionId) !== '') {
    foreach ($lista as $c) if (mismo_($c['operacion_id'], $operacionId)) return $c;
  }
  $clave = fn($c) => trozo_($c['fecha'], 0, 10) . ' ' . txt_($c['hora_cita']) . ' ' . txt_($c['creado']);
  return ordenar_($lista, fn($a, $b) => strcmp($clave($b), $clave($a)))[0];
}

/* Estado del cliente según el resultado de su cita, solo hacia delante. */
const ORDEN_ESTADO_ = ['nuevo', 'captado', 'frio', 'cita', 'sentada', 'propuesta', 'negociando', 'ganado'];

/**
 * Lo que una cita deja en el cliente: el interés (un solo dato, el del
 * cliente) y el estado, solo si avanza (una sentada no deshace un «propuesta»).
 */
function sincronizarCaptacionCliente_(array $u, ?array $cap, ?array $cli): void {
  if (!$cap || !$cli) return;
  $cambios = [];
  if (txt_($cap['interes']) !== '' && (float)num_($cap['interes']) !== (float)num_($cli['interes'])) $cambios['interes'] = $cap['interes'];
  $res = normal_($cap['resultado']);
  $actual = normal_($cli['estado']);
  $nuevo = '';
  if ($res === 'sentada' || $res === 'potencial') $nuevo = 'sentada';
  if ($res === 'no_sentada' && $actual === 'cita') $nuevo = 'captado';
  /* indexOf: -1 si no está (array_search devolvería false). */
  $pos = function ($e) { $i = array_search($e, ORDEN_ESTADO_, true); return $i === false ? -1 : $i; };
  if ($nuevo !== '' && $actual !== 'perdido' && $actual !== 'ganado' &&
      ($res === 'no_sentada' || $pos($nuevo) > $pos($actual))) {
    $cambios['estado'] = $nuevo;
    $cambios['fecha_estado'] = hoyISO_();
  }
  /* Con la visita hecha (o caída), la «Sentada concertada» automática deja de ser el próximo paso. */
  if ($res !== '' && $res !== 'pendiente' && normal_($cli['proxima_accion'] ?? '') === 'sentada concertada' &&
      strcmp(trozo_($cli['proxima_fecha'] ?? '', 0, 10), trozo_($cap['fecha'] ?? '', 0, 10) ?: hoyISO_()) <= 0) {
    $cambios['proxima_accion'] = '';
    $cambios['proxima_fecha'] = '';
  }
  if (count($cambios)) {
    $cambios['modificado'] = ahora_();
    $cambios['modificado_por'] = $u['id'];
    actualizar_('CLIENTES', $cli['id'], $cambios);
  }
}
