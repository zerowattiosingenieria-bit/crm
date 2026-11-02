<?php
/**
 * tablero.php — El tablero de cada uno y las cifras del Centro de Mando.
 * (Traducción de 19_Tablero.gs)
 *
 * Dos cosas que hasta ahora vivían fuera del CRM:
 *
 * 1. LAS CIFRAS. El Centro de Mando lleva las cifras buenas de la casa
 *    (cobrado en banco, firmado, operaciones del objetivo, facturado del
 *    mes…). El CRM calculaba las suyas por su cuenta y no siempre salía lo
 *    mismo. Ahora el agente del panel las vuelca aquí tres veces al día y
 *    el CRM enseña las dos columnas juntas: la del panel, la que sale de
 *    sus propias hojas y la diferencia. Lo que no cuadra se ve en el acto
 *    y se sabe qué falta meter.
 *
 * 2. LAS TAREAS. Cada uno entra y ve lo suyo: contabilidad y administración
 *    lo de Rubén, las aprobaciones y decisiones lo de dirección, y el resto
 *    lo que le hayan asignado. Las escribe el agente del Centro de Mando
 *    (origen "panel") o la propia dirección desde el CRM.
 *
 * Nadie ve tareas de otra área: se filtran en el servidor, no en el
 * navegador.
 */

require_once __DIR__ . '/base.php';

const AREAS = ['direccion', 'contabilidad', 'comercial', 'captacion'];
const ESTADOS_TAREA = ['pendiente', 'en_curso', 'hecha', 'descartada'];

/** El puesto de una persona. Si no está escrito, se deduce del rol. */
function areaDe_(?array $u): string {
  $a = normal_($u ? ($u['area'] ?? '') : '');
  if (in_array($a, AREAS, true)) return $a;
  if (!$u) return 'direccion';
  if (($u['rol'] ?? '') === 'comercial') return 'comercial';
  if (($u['rol'] ?? '') === 'captador') return 'captacion';
  return 'direccion';
}

function asegurarTablero_(): void {
  asegurarHoja_('CIFRAS');
  asegurarHoja_('TAREAS');
}

/* =========================================================================
   LAS CIFRAS
   ========================================================================= */

/* Lo que el agente del Centro de Mando vuelca en cada ronda. El CRM calcula
   su propia versión de las que llevan «crm» y enseña las dos. */
function catalogoCifras_(): array {
  return [
    ['clave' => 'cobrado', 'grupo' => 'Objetivo 2026', 'titulo' => 'Cobrado en banco',
     'unidad' => 'eur', 'orden' => 1, 'crm' => 'cobrado'],
    ['clave' => 'firmado', 'grupo' => 'Objetivo 2026', 'titulo' => 'Vendido en firme',
     'unidad' => 'eur', 'orden' => 2, 'crm' => 'firmado'],
    ['clave' => 'operaciones', 'grupo' => 'Objetivo 2026', 'titulo' => 'Operaciones',
     'unidad' => 'n', 'orden' => 3, 'crm' => 'operaciones'],
    ['clave' => 'clientes_vendidos', 'grupo' => 'Objetivo 2026', 'titulo' => 'Clientes vendidos',
     'unidad' => 'n', 'orden' => 4, 'crm' => 'clientes_vendidos'],
    ['clave' => 'ticket_medio', 'grupo' => 'Objetivo 2026', 'titulo' => 'Ticket medio',
     'unidad' => 'eur', 'orden' => 5, 'crm' => 'ticket_medio'],
    ['clave' => 'facturado_mes', 'grupo' => 'Del mes', 'titulo' => 'Facturado del mes',
     'unidad' => 'eur', 'orden' => 6, 'crm' => 'facturado_mes'],
    ['clave' => 'facturas_mes', 'grupo' => 'Del mes', 'titulo' => 'Facturas emitidas',
     'unidad' => 'n', 'orden' => 7, 'crm' => 'facturas_mes'],
    ['clave' => 'pendiente_cobro', 'grupo' => 'Por cobrar', 'titulo' => 'Pendiente de cobro',
     'unidad' => 'eur', 'orden' => 8, 'crm' => 'pendiente_cobro'],
    ['clave' => 'en_cierre', 'grupo' => 'Por cerrar', 'titulo' => 'En cierre',
     'unidad' => 'eur', 'orden' => 9, 'crm' => 'en_cierre'],
    ['clave' => 'en_cierre_n', 'grupo' => 'Por cerrar', 'titulo' => 'Operaciones en cierre',
     'unidad' => 'n', 'orden' => 10, 'crm' => 'en_cierre_n'],
    ['clave' => 'ops_aerotermia', 'grupo' => 'Objetivo 2026', 'titulo' => 'Con aerotermia',
     'unidad' => 'n', 'orden' => 11, 'crm' => 'ops_aerotermia'],
    ['clave' => 'ops_fv', 'grupo' => 'Objetivo 2026', 'titulo' => 'Con fotovoltaica',
     'unidad' => 'n', 'orden' => 12, 'crm' => 'ops_fv'],
    ['clave' => 'vendido_pendiente_cobro', 'grupo' => 'Por cobrar',
     'titulo' => 'Vendido pendiente de cobrar', 'unidad' => 'eur', 'orden' => 13]
  ];
}

/** ¿Cuenta esta operación como vendida? (lo mismo que mira contabilidad) */
function esVendida_(array $op): bool {
  return !in_array(normal_($op['estado'] ?? ''), ['cancelada', 'propuesta', 'financiacion'], true);
}

/**
 * Las mismas cifras, calculadas con lo que hay hoy en las hojas del CRM.
 * Si falta un cobro o una factura por meter, aquí sale más bajo que en el
 * panel, y esa diferencia es justo lo que hay que arreglar.
 */
function cifrasDelCrm_($refISO = ''): array {
  $hoy = txt_($refISO) ?: hoyISO_();
  $anyo = substr($hoy, 0, 4);
  $mes = mesDe_($hoy);

  $operaciones = leer_('OPERACIONES');
  $cobros = leer_('COBROS');
  $facturas = leer_('FACTURAS');

  $vendidas = array_values(array_filter($operaciones, 'esVendida_'));
  $enCierre = array_values(array_filter($operaciones, fn($o) => in_array(normal_($o['estado']), ['propuesta', 'financiacion'], true)));

  $clientes = [];
  foreach ($vendidas as $o) if (txt_($o['cliente_id']) !== '') $clientes[txt_($o['cliente_id'])] = true;

  $aero = count(array_filter($vendidas, fn($o) => num_($o['importe_aero']) > 0));
  $fv = count(array_filter($vendidas, fn($o) => num_($o['importe_fv']) > 0));

  $firmado = 0; foreach ($vendidas as $o) $firmado += num_($o['total']);
  $nClientes = count($clientes);
  $facturasMes = array_values(array_filter($facturas, fn($f) => mesDe_(txt_($f['fecha_emision'])) === $mes));

  $cobrado = 0;
  foreach ($cobros as $c) if (substr(txt_($c['fecha_cobro']), 0, 4) === $anyo) $cobrado += num_($c['importe']);
  $facturado = 0; foreach ($facturasMes as $f) $facturado += num_($f['total']);
  $pendiente = 0;
  foreach ($cobros as $c) if (txt_($c['fecha_cobro']) === '') $pendiente += num_($c['importe']);
  $cierre = 0; foreach ($enCierre as $o) $cierre += num_($o['total']);

  return [
    'cobrado' => redondear_($cobrado, 2),
    'firmado' => redondear_($firmado, 2),
    'operaciones' => $aero + $fv,
    'ops_aerotermia' => $aero,
    'ops_fv' => $fv,
    'clientes_vendidos' => $nClientes,
    'ticket_medio' => $nClientes ? redondear_($firmado / $nClientes, 2) : 0,
    'facturado_mes' => redondear_($facturado, 2),
    'facturas_mes' => count($facturasMes),
    'pendiente_cobro' => redondear_($pendiente, 2),
    'en_cierre' => redondear_($cierre, 2),
    'en_cierre_n' => count($enCierre)
  ];
}

/** Diferencia que ya merece mirarse: un euro en dinero, una unidad en cuentas. */
function descuadra_($unidad, $panel, $crm): bool {
  if ($panel === null || $panel === '') return false;
  $d = abs(num_($panel) - num_($crm));
  return $unidad === 'eur' ? $d >= 1 : $d >= 1;
}

/* NOTA PORT: escribirFila_(nombre, fila, obj) del original ya existe en base.php
   con la misma firma (campo => valor); aquí no se redefine. */

function accCifras_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  asegurarTablero_();
  $guardadas = indexar_(leer_('CIFRAS'), 'clave');
  $delCrm = cifrasDelCrm_(txt_($p['hasta'] ?? ''));

  $lista = array_map(function ($c) use ($guardadas, $delCrm) {
    $g = $guardadas[$c['clave']] ?? [];
    $tienePanel = txt_($g['valor'] ?? '') !== '';
    $panel = $tienePanel ? num_($g['valor']) : null;
    $crm = isset($c['crm']) ? num_($delCrm[$c['crm']] ?? '') : null;
    return [
      'clave' => $c['clave'],
      'grupo' => txt_($g['grupo'] ?? '') ?: $c['grupo'],
      'titulo' => txt_($g['titulo'] ?? '') ?: $c['titulo'],
      'unidad' => txt_($g['unidad'] ?? '') ?: $c['unidad'],
      'orden' => num_($g['orden'] ?? '') ?: $c['orden'],
      'panel' => $panel,
      'crm' => $crm,
      'meta' => num_($g['meta'] ?? '') ?: 0,
      'nota' => txt_($g['nota'] ?? ''),
      'fecha' => txt_($g['fecha'] ?? ''),
      'actualizado' => txt_($g['actualizado'] ?? ''),
      'diferencia' => ($panel === null || $crm === null) ? null : redondear_($panel - $crm, 2),
      'descuadre' => $crm === null ? false : descuadra_(txt_($g['unidad'] ?? '') ?: $c['unidad'], $panel, $crm)
    ];
  }, catalogoCifras_());

  /* Cifras que el panel manda y el CRM no sabe calcular: se enseñan igual. */
  $conocidas = [];
  foreach ($lista as $x) $conocidas[$x['clave']] = true;
  foreach (leer_('CIFRAS') as $g) {
    if (isset($conocidas[txt_($g['clave'])])) continue;
    $lista[] = [
      'clave' => txt_($g['clave']), 'grupo' => txt_($g['grupo']) ?: 'Otras', 'titulo' => txt_($g['titulo']) ?: txt_($g['clave']),
      'unidad' => txt_($g['unidad']) ?: 'n', 'orden' => num_($g['orden']) ?: 90,
      'panel' => txt_($g['valor']) === '' ? null : num_($g['valor']), 'crm' => null,
      'meta' => num_($g['meta']) ?: 0, 'nota' => txt_($g['nota']), 'fecha' => txt_($g['fecha']),
      'actualizado' => txt_($g['actualizado']), 'diferencia' => null, 'descuadre' => false
    ];
  }

  $lista = ordenar_($lista, fn($a, $b) => $a['orden'] <=> $b['orden']);
  $ultima = '';
  foreach ($lista as $x) if (strcmp(txt_($x['actualizado']), $ultima) > 0) $ultima = txt_($x['actualizado']);

  return [
    'ok' => true, 'cifras' => $lista, 'crm' => $delCrm,
    'descuadres' => count(array_filter($lista, fn($x) => $x['descuadre'])),
    'actualizado' => $ultima
  ];
}

/**
 * Lo que escribe el agente del Centro de Mando en cada ronda.
 * p.cifras = [{clave, valor, titulo, grupo, unidad, meta, nota, fecha}, …]
 */
function accGuardarCifras_(array $u, array $p): array {
  exigir_($u, 'editarTodo');
  asegurarTablero_();
  $pedidas = is_array($p['cifras'] ?? null) ? $p['cifras'] : (is_array($p['cifra'] ?? null) && $p['cifra'] ? [$p['cifra']] : []);
  if (!count($pedidas)) return ['ok' => false, 'error' => 'No has mandado ninguna cifra.'];

  $guardadas = indexar_(leer_('CIFRAS'), 'clave');
  $catalogo = indexar_(catalogoCifras_(), 'clave');
  $ahora = ahora_();
  $nuevas = 0; $cambiadas = 0;

  foreach ($pedidas as $c) {
    if (!is_array($c)) continue;
    $clave = txt_($c['clave'] ?? '');
    if ($clave === '') continue;
    $base = $catalogo[$clave] ?? [];
    $vieja = $guardadas[$clave] ?? null;
    $g = $vieja ?? [];
    $fila = [
      'clave' => $clave,
      'grupo' => txt_($c['grupo'] ?? '') ?: (txt_($g['grupo'] ?? '') ?: (txt_($base['grupo'] ?? '') ?: 'Otras')),
      'titulo' => txt_($c['titulo'] ?? '') ?: (txt_($g['titulo'] ?? '') ?: (txt_($base['titulo'] ?? '') ?: $clave)),
      'unidad' => txt_($c['unidad'] ?? '') ?: (txt_($g['unidad'] ?? '') ?: (txt_($base['unidad'] ?? '') ?: 'n')),
      'valor' => !isset($c['valor']) ? '' : num_($c['valor']),
      'meta' => !array_key_exists('meta', $c) ? num_($g['meta'] ?? '') : num_($c['meta']),
      'nota' => !array_key_exists('nota', $c) ? txt_($g['nota'] ?? '') : txt_($c['nota']),
      'fecha' => txt_($c['fecha'] ?? '') ?: hoyISO_(),
      'orden' => !array_key_exists('orden', $c) ? (num_($g['orden'] ?? '') ?: (num_($base['orden'] ?? '') ?: 90))
                                                 : num_($c['orden']),
      'actualizado' => $ahora,
      'actualizado_por' => $u['id'] ?? ''
    ];
    if ($vieja) { escribirFila_('CIFRAS', $vieja['_fila'], $fila); $cambiadas++; }
    else { insertar_('CIFRAS', $fila); $nuevas++; }
  }

  registrar_($u, 'guardar_cifras', 'CIFRAS', '',
    $nuevas . ' nuevas, ' . $cambiadas . ' actualizadas');
  return ['ok' => true, 'nuevas' => $nuevas, 'cambiadas' => $cambiadas];
}

/* =========================================================================
   LAS TAREAS
   ========================================================================= */

/** ¿Le toca a esta persona? */
function tareaMia_(array $u, array $t): bool {
  if (txt_($t['usuario_id'] ?? '') !== '') return mismo_($t['usuario_id'], $u['id'] ?? '');
  return normal_($t['area'] ?? '') === areaDe_($u);
}

function tareaPublica_(array $t, array $clientes, array $usuarios): array {
  $cli = $clientes[(string)($t['cliente_id'] ?? '')] ?? [];
  $pers = $usuarios[(string)($t['usuario_id'] ?? '')] ?? [];
  return [
    'id' => $t['id'] ?? '', 'area' => normal_($t['area'] ?? ''), 'usuario_id' => txt_($t['usuario_id'] ?? ''), 'usuario' => txt_($pers['nombre'] ?? ''),
    'titulo' => txt_($t['titulo'] ?? ''), 'detalle' => txt_($t['detalle'] ?? ''),
    'cliente_id' => txt_($t['cliente_id'] ?? ''), 'cliente' => txt_($cli['nombre'] ?? ''),
    'importe' => num_($t['importe'] ?? ''), 'prioridad' => normal_($t['prioridad'] ?? '') ?: 'normal',
    'vence' => txt_($t['vence'] ?? ''), 'estado' => normal_($t['estado'] ?? '') ?: 'pendiente',
    'origen' => txt_($t['origen'] ?? ''), 'origen_id' => txt_($t['origen_id'] ?? ''),
    'creado' => txt_($t['creado'] ?? ''), 'hecho' => txt_($t['hecho'] ?? '')
  ];
}

function accTareas_(array $u, array $p): array {
  asegurarTablero_();
  $per = permisos_($u);
  $clientes = indexar_(leer_('CLIENTES'));
  $usuarios = indexar_(leer_('USUARIOS'));
  $todas = !empty($p['todas']) && ($per['alcance'] ?? '') === 'todo';
  $cerradas = !empty($p['cerradas']);

  $lista = array_map(fn($t) => tareaPublica_($t, $clientes, $usuarios), filtrar_('TAREAS', function ($t) use ($cerradas, $todas, $u) {
    if (!$cerradas && in_array(normal_($t['estado']) ?: 'pendiente', ['hecha', 'descartada'], true)) return false;
    return $todas || tareaMia_($u, $t);
  }));

  /* Lo que vence antes, primero; y dentro del mismo día, lo urgente. */
  $peso = ['urgente' => 0, 'alta' => 1, 'normal' => 2, 'baja' => 3];
  $lista = ordenar_($lista, function ($a, $b) use ($peso) {
    $fa = $a['vence'] ?: '9999-12-31'; $fb = $b['vence'] ?: '9999-12-31';
    if ($fa !== $fb) return $fa < $fb ? -1 : 1;
    return ($peso[$a['prioridad']] ?? 2) - ($peso[$b['prioridad']] ?? 2);
  });

  return ['ok' => true, 'tareas' => $lista, 'area' => areaDe_($u), 'puede_asignar' => !empty($per['editarTodo'])];
}

/**
 * Crea o cambia una tarea.
 * - Dirección puede crear, asignar y cambiarlo todo.
 * - Los demás solo pueden mover el estado de las suyas y añadir detalle.
 * - Si llega con origen + origen_id y no existe, se crea; si existe, se
 *   actualiza. Así el agente del panel puede repetir el volcado sin
 *   duplicar nada.
 */
function accGuardarTarea_(array $u, array $p): array {
  asegurarTablero_();
  $per = permisos_($u);
  $d = is_array($p['tarea'] ?? null) ? $p['tarea'] : [];
  $todas = leer_('TAREAS');

  $actual = null;
  if (txt_($d['id'] ?? '') !== '') {
    foreach ($todas as $t) if (txt_($t['id']) === txt_($d['id'])) { $actual = $t; break; }
    if (!$actual) return ['ok' => false, 'error' => 'Esa tarea ya no existe.'];
  } elseif (txt_($d['origen'] ?? '') !== '' && txt_($d['origen_id'] ?? '') !== '') {
    foreach ($todas as $t) {
      if (normal_($t['origen']) === normal_($d['origen']) && txt_($t['origen_id']) === txt_($d['origen_id'])) { $actual = $t; break; }
    }
  }

  if (empty($per['editarTodo'])) {
    if (!$actual) return ['ok' => false, 'error' => 'Las tareas las reparte dirección.'];
    if (!tareaMia_($u, $actual)) return ['ok' => false, 'error' => 'Esa tarea no es tuya.'];
  }

  $cambios = [];
  $libres = ['titulo', 'detalle', 'area', 'usuario_id', 'cliente_id', 'importe',
             'prioridad', 'vence', 'estado', 'origen', 'origen_id'];
  $mios = ['detalle', 'estado'];
  foreach (!empty($per['editarTodo']) ? $libres : $mios as $c) {
    if (array_key_exists($c, $d)) $cambios[$c] = $c === 'importe' ? num_($d[$c]) : txt_($d[$c]);
  }

  if (($cambios['area'] ?? '') !== '' && !in_array(normal_($cambios['area']), AREAS, true)) {
    return ['ok' => false, 'error' => 'Esa área no existe.'];
  }
  if (($cambios['estado'] ?? '') !== '' && !in_array(normal_($cambios['estado']), ESTADOS_TAREA, true)) {
    return ['ok' => false, 'error' => 'Ese estado de tarea no existe.'];
  }
  if (($cambios['estado'] ?? '') !== '') {
    $cambios['estado'] = normal_($cambios['estado']);
    if (in_array($cambios['estado'], ['hecha', 'descartada'], true)) {
      $cambios['hecho'] = ahora_();
      $cambios['hecho_por'] = $u['id'] ?? '';
    } else {
      $cambios['hecho'] = '';
      $cambios['hecho_por'] = '';
    }
  }
  $cambios['modificado'] = ahora_();
  $cambios['modificado_por'] = $u['id'] ?? '';

  if ($actual) {
    $r = actualizar_('TAREAS', $actual['id'], $cambios);
    registrar_($u, 'editar_tarea', 'TAREAS', $actual['id'], $cambios);
    return ['ok' => true, 'tarea' => tareaPublica_($r ?? $actual, indexar_(leer_('CLIENTES')), indexar_(leer_('USUARIOS')))];
  }

  if (txt_($cambios['titulo'] ?? '') === '') return ['ok' => false, 'error' => 'La tarea necesita un título.'];
  $cambios['area'] = normal_($cambios['area'] ?? '') ?: (txt_($cambios['usuario_id'] ?? '') !== '' ? '' : 'direccion');
  if ($cambios['area'] === '' && txt_($cambios['usuario_id'] ?? '') !== '') {
    $dueno = buscar1_('USUARIOS', fn($x) => txt_($x['id']) === txt_($cambios['usuario_id']));
    $cambios['area'] = areaDe_($dueno);
  }
  $cambios['estado'] = ($cambios['estado'] ?? '') !== '' ? $cambios['estado'] : 'pendiente';
  $cambios['prioridad'] = normal_($cambios['prioridad'] ?? '') ?: 'normal';
  $cambios['creado'] = ahora_();
  $cambios['creado_por'] = $u['id'] ?? '';
  $nueva = insertar_('TAREAS', $cambios);
  registrar_($u, 'alta_tarea', 'TAREAS', $nueva['id'], ['titulo' => $cambios['titulo'], 'area' => $cambios['area']]);
  return ['ok' => true, 'tarea' => tareaPublica_($nueva, indexar_(leer_('CLIENTES')), indexar_(leer_('USUARIOS')))];
}

/** Marcar una tarea (hecha, en curso, otra vez pendiente…). */
function accEstadoTarea_(array $u, array $p): array {
  return accGuardarTarea_($u, ['tarea' => ['id' => txt_($p['id'] ?? ''), 'estado' => txt_($p['estado'] ?? '') ?: 'hecha']]);
}

function accBorrarTarea_(array $u, array $p): array {
  exigir_($u, 'editarTodo');
  asegurarTablero_();
  $id = txt_($p['id'] ?? '');
  if ($id === '') return ['ok' => false, 'error' => 'No has dicho qué tarea borrar.'];
  $n = borrarVarios_('TAREAS', [$id]);
  registrar_($u, 'borrar_tarea', 'TAREAS', $id, '');
  return ['ok' => $n > 0, 'borradas' => $n];
}

/* =========================================================================
   PUESTOS — se ejecuta UNA VEZ desde el editor al instalar esta versión
   ========================================================================= */

/**
 * Deja escrito el puesto de cada uno en la columna «area» de USUARIOS,
 * que es la que decide qué ve cada persona en su pestaña «Mi tablero».
 *
 * Por defecto va por el rol (comercial → comercial, captador → captación,
 * administrador y superadmin → dirección). La única excepción es Rubén,
 * que lleva contabilidad y administración (orden de Nando del 21/10/2026).
 * A partir de aquí se cambia desde Usuarios, sin tocar código.
 */
function ponerPuestos(): array {
  asegurarHoja_('USUARIOS');
  $hechos = [];
  foreach (leer_('USUARIOS') as $x) {
    if (txt_($x['area']) !== '') continue;
    $area = (str_starts_with(normal_($x['nombre']), 'ruben') && ($x['rol'] ?? '') === 'admin')
      ? 'contabilidad' : areaDe_($x);
    actualizar_('USUARIOS', $x['id'], ['area' => $area]);
    $hechos[] = txt_($x['nombre']) . ' → ' . $area;
  }
  error_log(count($hechos) ? implode("\n", $hechos) : 'Ya estaban todos puestos.');
  return $hechos;
}
