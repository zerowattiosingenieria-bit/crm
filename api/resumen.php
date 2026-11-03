<?php
/**
 * resumen.php — Cómo va cada persona y cómo va la casa.
 * (Traducción de 07_Resumen.gs)
 *
 * Un comercial solo puede pedir su propio resumen; los administradores
 * pueden pedir el de cualquiera y el del equipo entero.
 */

require_once __DIR__ . '/base.php';

/* Los objetivos de venta se computan del 16 al 15 del mes siguiente. */
function periodoObjetivos_($refISO = ''): array {
  $ref = txt_($refISO) ?: hoyISO_();
  $d = fecha_($ref);
  /* NOTA PORT: en JS una fecha inválida reventaba al llamar a d.getFullYear(); aquí se avisa igual. */
  if (!$d) throw new Exception('Fecha no válida: ' . $ref);
  $inicio = (clone $d)->setDate((int)$d->format('Y'), (int)$d->format('n'), 16);
  if ((int)$d->format('j') < 16) $inicio->modify('-1 month');
  $fin = (clone $inicio)->setDate((int)$inicio->format('Y'), (int)$inicio->format('n') + 1, 15);
  return [
    'desde' => formatearFecha_($inicio, 'yyyy-MM-dd'),
    'hasta' => formatearFecha_($fin, 'yyyy-MM-dd')
  ];
}

function accResumen_(array $u, array $p): array {
  $per = permisos_($u);
  $objetivoId = txt_($p['usuario_id'] ?? '') ?: ($u['id'] ?? '');
  if (!mismo_($objetivoId, $u['id'] ?? '') && empty($per['partesAjenos'])) {
    return ['ok' => false, 'error' => 'Solo puedes consultar tu propio resumen.'];
  }
  $persona = buscar1_('USUARIOS', fn($x) => mismo_($x['id'], $objetivoId));
  if (!$persona) return ['ok' => false, 'error' => 'No existe esa persona.'];

  $hasta = txt_($p['hasta'] ?? '') ?: hoyISO_();
  $desde = txt_($p['desde'] ?? '') ?: sumarDias_($hasta, -180);
  return ['ok' => true, 'resumen' => resumenPersona_($persona, $desde, $hasta, !empty(permisos_($u)['costes']))];
}

function resumenPersona_(array $persona, string $desde, string $hasta, bool $conImportes): array {
  $rol = $persona['rol'] ?? '';
  $esComercial = $rol === 'comercial' || $rol === 'admin' || $rol === 'superadmin';
  $clientes = leer_('CLIENTES');
  $operaciones = leer_('OPERACIONES');
  $captaciones = leer_('CAPTACIONES');
  $partes = filtrar_('PARTES', fn($x) => mismo_($x['usuario_id'], $persona['id'] ?? '') && txt_($x['fecha']) >= $desde && txt_($x['fecha']) <= $hasta);
  $seguimiento = filtrar_('SEGUIMIENTO', fn($s) => mismo_($s['usuario_id'], $persona['id'] ?? ''));
  $hoy = hoyISO_();
  $obj = periodoObjetivos_($hasta);

  $misClientes = array_values(array_filter($clientes, fn($c) => $rol === 'captador'
    ? mismo_($c['captador_id'], $persona['id'] ?? '')
    : mismo_($c['comercial_id'], $persona['id'] ?? '')));
  $misOps = array_values(array_filter($operaciones, fn($o) => $rol === 'captador'
    ? mismo_($o['captador_id'], $persona['id'] ?? '')
    : mismo_($o['comercial_id'], $persona['id'] ?? '')));
  $enRango = fn($f) => txt_($f) >= $desde && txt_($f) <= $hasta;
  $ganadas = array_values(array_filter($misOps, fn($o) => esGanada_($o)));
  $ganadasRango = array_values(array_filter($ganadas, fn($o) => $enRango(txt_($o['fecha_firma']) ?: txt_($o['creado']))));
  $perdidas = array_values(array_filter($misOps, fn($o) => normal_($o['estado']) === 'cancelada'));
  $abiertas = array_values(array_filter($misOps, fn($o) => in_array(normal_($o['estado']), ['propuesta', 'financiacion'], true)));

  $sentadas = 0; foreach ($partes as $x) $sentadas += num_($x['sentadas']);
  $puertas = 0; foreach ($partes as $x) $puertas += num_($x['puertas']);
  $visitas = 0; foreach ($partes as $x) $visitas += num_($x['visitas']);
  $fichas = array_values(array_filter($captaciones, fn($c) => mismo_($c['captador_id'], $persona['id'] ?? '') && $enRango($c['fecha'])));
  $citasConfirmadas = array_values(array_filter($fichas, fn($c) => normal_($c['estado_cita']) === 'confirmada'));
  /* Se cuentan sobre las fichas del periodo, para que las conversiones
     comparen siempre lo mismo y no pasen del 100 %. */
  $captacionesVenta = array_values(array_filter($fichas, fn($c) => normal_($c['resultado']) === 'venta'));
  $captacionesSentada = array_values(array_filter($fichas, fn($c) => in_array(normal_($c['resultado']), ['sentada', 'venta'], true)));
  $captacionesVentaTodas = array_values(array_filter($captaciones, fn($c) => mismo_($c['captador_id'], $persona['id'] ?? '') && normal_($c['resultado']) === 'venta'));

  $importeVendido = 0; foreach ($ganadasRango as $o) $importeVendido += num_($o['total']);
  /* Comisiones: lo que ha vendido, lo que ha captado (sea captador o
     comercial) y lo que vende o capta la gente que tiene a su cargo. */
  $comisiones = comisionesPeriodo_($persona, $desde, $hasta);

  /* Objetivo del periodo 16-15: una operación doble cuenta por dos. */
  $delPeriodo = array_values(array_filter($misOps, function ($o) use ($obj) {
    $f = txt_($o['fecha_firma']) ?: txt_($o['creado']);
    return esGanada_($o) && $f >= $obj['desde'] && $f <= $obj['hasta'];
  }));
  $sencillasPeriodo = 0;
  /* Las ampliaciones y extras (tipo «otro») no cuentan como venta. */
  foreach ($delPeriodo as $o) $sencillasPeriodo += (normal_($o['tipo']) === 'fv_aero' ? 2 : (in_array(normal_($o['tipo']), ['fv', 'aero'], true) ? 1 : 0));
  $objetivoMes = num_($persona['objetivo_mes'] ?? '') ?: ($rol === 'captador' ? 60 : 6);
  $logradoObjetivo = $rol === 'captador'
    ? count(array_filter($fichas, fn($c) => txt_($c['fecha']) >= $obj['desde'] && txt_($c['fecha']) <= $obj['hasta']))
    : $sencillasPeriodo;

  /* Evolución mes a mes */
  $meses = [];
  $m_ = function ($k) use (&$meses) {
    if (!isset($meses[$k])) $meses[$k] = ['mes' => $k, 'ventas' => 0, 'importe' => 0, 'sentadas' => 0, 'fichas' => 0, 'propuestas' => 0];
    return $k;
  };
  foreach ($ganadas as $o) {
    $f = txt_($o['fecha_firma']) ?: txt_($o['creado']);
    if ($enRango($f)) { $k = $m_(mesDe_($f)); $meses[$k]['ventas'] += 1; $meses[$k]['importe'] = redondear_($meses[$k]['importe'] + num_($o['total']), 2); }
  }
  foreach ($misOps as $o) {
    $f = txt_($o['fecha_propuesta']) ?: txt_($o['creado']);
    if ($enRango($f)) { $k = $m_(mesDe_($f)); $meses[$k]['propuestas'] += 1; }
  }
  foreach ($partes as $x) { $k = $m_(mesDe_(txt_($x['fecha']))); $meses[$k]['sentadas'] += num_($x['sentadas']); }
  foreach ($fichas as $c) { $k = $m_(mesDe_(txt_($c['fecha']))); $meses[$k]['fichas'] += 1; }
  $clavesMeses = array_keys($meses);
  sort($clavesMeses, SORT_STRING);
  $evolucion = array_map(fn($k) => $meses[$k], $clavesMeses);

  /* Cartera y avisos */
  $ultimoContacto = [];
  foreach ($seguimiento as $s) {
    $k = txt_($s['cliente_id']);
    if (!isset($ultimoContacto[$k]) || $ultimoContacto[$k] < txt_($s['fecha'])) $ultimoContacto[$k] = txt_($s['fecha']);
  }
  $frios = array_values(array_filter($misClientes, function ($c) use ($ultimoContacto, $hoy) {
    if (in_array(normal_($c['estado']), ['ganado', 'perdido'], true)) return false;
    $ult = ($ultimoContacto[txt_($c['id'])] ?? '') ?: (txt_($c['fecha_estado']) ?: txt_($c['creado']));
    return (diasEntre_($ult, $hoy) ?? 0) > 15;
  }));
  $frios = array_map(fn($c) => [
    'id' => $c['id'], 'nombre' => $c['nombre'], 'municipio' => $c['municipio'], 'estado' => $c['estado'],
    'dias' => diasEntre_(($ultimoContacto[txt_($c['id'])] ?? '') ?: (txt_($c['fecha_estado']) ?: txt_($c['creado'])), $hoy)
  ], $frios);
  $frios = array_slice(ordenar_($frios, fn($a, $b) => ($b['dias'] ?? 0) <=> ($a['dias'] ?? 0)), 0, 25);

  $proximas = array_values(array_filter($misClientes, fn($c) => txt_($c['proxima_fecha']) !== ''));
  $proximas = array_map(fn($c) => [
    'id' => $c['id'], 'nombre' => $c['nombre'], 'accion' => $c['proxima_accion'], 'fecha' => txt_($c['proxima_fecha']),
    'vencida' => txt_($c['proxima_fecha']) < $hoy, 'estado' => $c['estado']
  ], $proximas);
  $proximas = array_slice(ordenar_($proximas, fn($a, $b) => comparar_($a['fecha'], $b['fecha'])), 0, 30);

  $tasa = fn($a, $b) => pct_($a, $b);

  $nPropuestas = count(array_filter($misOps, fn($o) => $enRango(txt_($o['fecha_propuesta']) ?: txt_($o['creado']))));

  $r = [
    'persona' => publico_($persona),
    'desde' => $desde, 'hasta' => $hasta,
    'periodo_objetivos' => $obj,
    'clientes' => count($misClientes),
    'clientes_activos' => count(array_filter($misClientes, fn($c) => !in_array(normal_($c['estado']), ['ganado', 'perdido'], true))),
    'propuestas' => $nPropuestas,
    'ventas' => count($ganadasRango),
    'perdidas' => count(array_filter($perdidas, fn($o) => $enRango(txt_($o['modificado']) ?: txt_($o['creado'])))),
    'sentadas' => $sentadas, 'puertas' => $puertas, 'visitas' => $visitas,
    'fichas' => count($fichas), 'citas_confirmadas' => count($citasConfirmadas),
    'captaciones_sentada' => count($captacionesSentada), 'captaciones_venta' => count($captacionesVenta),
    'conversion_sentada_venta' => $tasa(count($ganadasRango), $sentadas),
    'conversion_propuesta_venta' => $tasa(count($ganadasRango), $nPropuestas),
    'conversion_ficha_sentada' => $tasa(count($captacionesSentada), count($fichas)),
    'conversion_ficha_venta' => $tasa(count($captacionesVenta), count($fichas)),
    'conversion_puerta_ficha' => $tasa(count($fichas), $puertas),
    'objetivo_mes' => $objetivoMes, 'logrado_objetivo' => $logradoObjetivo,
    'objetivo_pct' => pct_($logradoObjetivo, $objetivoMes),
    'cartera_abierta' => count($abiertas),
    'evolucion' => $evolucion,
    'frios' => $frios, 'proximas' => $proximas,
    'partes_enviados' => count($partes),
    'dias_sin_parte' => diasSinParte_($persona, $partes),
    'comisiones' => $comisiones,
    /* Las ventas del periodo 16-15 de esta persona, con dirección, importe y
       lo que cobra por cada una. Cada uno solo pide su propio resumen. */
    'objetivo_periodo' => comisionesPeriodo_($persona, $obj['desde'], $obj['hasta'])
  ];

  if ($conImportes || $rol !== 'captador') {
    $r['importe_vendido'] = redondear_($importeVendido, 2);
    $r['ticket_medio'] = count($ganadasRango) ? redondear_($importeVendido / count($ganadasRango), 2) : 0;
    $cartera = 0; foreach ($abiertas as $o) $cartera += num_($o['total']);
    $r['cartera_importe'] = redondear_($cartera, 2);
    /* Cartera ponderada: lo que razonablemente va a entrar. */
    $ponderada = 0;
    foreach ($abiertas as $o) {
      $peso = normal_($o['estado']) === 'financiacion' ? 0.6 : 0.35;
      $ponderada += num_($o['total']) * $peso;
    }
    $r['cartera_ponderada'] = redondear_($ponderada, 2);
  }
  return $r;
}

function esGanada_(array $o): bool {
  return in_array(normal_($o['estado'] ?? ''), ['firmada','tramite','material','instalacion','instalada','legalizada','cerrada'], true);
}

/**
 * Lo que cobra una persona por su trabajo comercial. Hay cuatro formas de
 * comisionar y no se excluyen entre sí:
 *
 *   venta      · la instalación que ha cerrado, a su tarifa
 *   ajustada   · la misma venta cuando se ha bajado el precio estándar
 *   captación  · haber abierto la puerta de algo que acabó vendiéndose,
 *                aunque la venta la cerrara otro
 *   equipo     · cada venta de alguien que tiene a esta persona de
 *                responsable; es lo que cobra un sénior por lo que cierra
 *                su júnior
 *
 * Las tarifas son las de la persona; si no las tiene puestas, las de Ajustes.
 */
function comisionesDe_(array $persona, array $ganadas, ?array $captacionesVenta, ?array $ventasEquipo): array {
  $cfg = config_();
  $tarifa = function ($campo, $porDefecto = '') use ($persona, $cfg) {
    $propia = num_($persona[$campo] ?? '');
    return $propia ?: num_($cfg[$porDefecto ?: $campo] ?? '');
  };
  $cFV = $tarifa('comision_fv');
  $cAero = $tarifa('comision_aero');
  $cFVaj = $tarifa('comision_fv_ajustada');
  $cAeroaj = $tarifa('comision_aero_ajustada');
  $cCapFV = $tarifa('comision_captacion_fv');
  $cCapAero = $tarifa('comision_captacion_aero');
  $cEqFV = $tarifa('comision_equipo_fv');
  $cEqAero = $tarifa('comision_equipo_aero');

  $total = 0;
  $detalle = [];
  $apuntar = function ($importe, $concepto, ?array $o, ?array $extra = null) use (&$total, &$detalle) {
    if (!$importe) return;
    $total += $importe;
    $detalle[] = unir_([
      'operacion_id' => ($o && txt_($o['id'] ?? '') !== '') ? $o['id'] : '', 'referencia' => ($o && txt_($o['referencia'] ?? '') !== '') ? $o['referencia'] : '',
      'tipo' => $o ? ($o['tipo'] ?? '') : '', 'concepto' => $concepto, 'importe' => redondear_($importe, 2),
      'fecha' => $o ? (txt_($o['fecha_firma'] ?? '') ?: txt_($o['creado'] ?? '')) : '',
      'cliente_id' => $o ? txt_($o['cliente_id'] ?? '') : '', 'direccion' => $o ? txt_($o['_direccion'] ?? '') : '',
      'importe_venta' => $o ? redondear_(num_($o['total'] ?? 0), 2) : 0,
      'sencillas' => $o ? (normal_($o['tipo'] ?? '') === 'fv_aero' ? 2 : (in_array(normal_($o['tipo'] ?? ''), ['fv', 'aero'], true) ? 1 : 0)) : 1
    ], $extra ?? []);
  };
  $porTipo = function (array $o, $fv, $aero) {
    $t = normal_($o['tipo'] ?? '');
    return (($t === 'fv' || $t === 'fv_aero') ? $fv : 0) + (($t === 'aero' || $t === 'fv_aero') ? $aero : 0);
  };

  foreach ($ganadas as $o) {
    $ajustada = normal_($o['precio_ajustado'] ?? '') === 'si';
    $apuntar($porTipo($o, $ajustada ? $cFVaj : $cFV, $ajustada ? $cAeroaj : $cAero),
             $ajustada ? 'venta con precio ajustado' : 'venta', $o);
  }

  foreach ($captacionesVenta ?? [] as $c) {
    /* Si es una operación vendida, cuenta como la venta (una doble, por dos). */
    if (txt_($c['tipo'] ?? '') !== '' && txt_($c['tecnologia'] ?? '') === '') {
      $apuntar($porTipo($c, $cCapFV, $cCapAero), 'captación vendida', $c, ['de' => $c['_de'] ?? '']);
      continue;
    }
    $tipo = tipoDeTecnologia_($c['tecnologia'] ?? '');
    $importe = (($tipo === 'fv' || $tipo === 'fv_aero') ? $cCapFV : 0) +
               (($tipo === 'aero' || $tipo === 'fv_aero') ? $cCapAero : 0);
    $apuntar($importe, 'captación vendida', null,
      ['operacion_id' => (txt_($c['operacion_id'] ?? '') !== '' ? $c['operacion_id'] : ''), 'referencia' => 'Captación ' . txt_($c['id'] ?? ''), 'tipo' => $tipo,
       'fecha' => txt_($c['fecha_resultado'] ?? '') ?: txt_($c['fecha'] ?? '')]);
  }

  foreach ($ventasEquipo ?? [] as $o) {
    $apuntar($porTipo($o, $cEqFV, $cEqAero), ($o['_como'] ?? '') === 'captacion' ? 'captación de su equipo' : 'venta de su equipo',
      $o, ['de' => $o['_de'] ?? '']);
  }

  return ['total' => redondear_($total, 2), 'detalle' => $detalle];
}

/** «FOTOVOLTAICA», «AEROTERMIA + FOTOVOLTAICA»… → fv, aero o fv_aero. */
function tipoDeTecnologia_($t): string {
  $t = normal_($t);
  if (in_array($t, ['fv', 'aero', 'fv_aero'], true)) return $t;
  $fv = strpos($t, 'fotov') !== false || strpos($t, 'placa') !== false || strpos($t, 'solar') !== false;
  $ae = strpos($t, 'aerot') !== false;
  return $fv && $ae ? 'fv_aero' : ($ae ? 'aero' : 'fv');
}

/** Quién captó una operación: el de la operación o, si no lo tiene, el del cliente. */
function captadorDe_(array $o, array $clientesPorId): string {
  return txt_($o['captador_id'] ?? '') ?: txt_(($clientesPorId[txt_($o['cliente_id'] ?? '')] ?? [])['captador_id'] ?? '');
}

/**
 * Comisiones de una persona entre dos fechas (por fecha de firma), con el
 * detalle por venta: dirección, importe y lo que cobra por cada una.
 *   · venta: sus operaciones firmadas, a su tarifa (una doble cuenta por dos).
 *   · captación: operaciones firmadas de clientes que captó, las cerrara quien las cerrara.
 *   · equipo: lo que venden o captan las personas que la tienen de responsable.
 * Las ampliaciones y extras (tipo «otro») no comisionan.
 */
function comisionesPeriodo_(array $persona, string $desde, string $hasta): array {
  $yo = txt_($persona['id'] ?? '');
  $clientes = indexar_(leer_('CLIENTES'));
  $usuarios = leer_('USUARIOS');
  $nombre = [];
  foreach ($usuarios as $x) $nombre[txt_($x['id'])] = txt_($x['nombre']);
  $suyos = [];
  foreach ($usuarios as $x) if (mismo_(txt_($x['responsable_id'] ?? ''), $yo) && !mismo_($x['id'], $yo)) $suyos[txt_($x['id'])] = true;
  $ventas = []; $captadas = []; $equipo = [];
  foreach (leer_('OPERACIONES') as $o) {
    if (!esGanada_($o)) continue;
    $f = txt_($o['fecha_firma']) ?: txt_($o['creado']);
    if ($f < $desde || $f > $hasta) continue;
    $o['_direccion'] = txt_(($clientes[txt_($o['cliente_id'])] ?? [])['direccion'] ?? '');
    $com = txt_($o['comercial_id']); $cap = captadorDe_($o, $clientes);
    if (mismo_($com, $yo)) $ventas[] = $o;
    if ($cap !== '' && mismo_($cap, $yo)) { $c = $o; $c['_de'] = $nombre[$com] ?? ''; $captadas[] = $c; }
    if (isset($suyos[$com])) { $c = $o; $c['_de'] = $nombre[$com]; $c['_como'] = 'venta'; $equipo[] = $c; }
    elseif ($cap !== '' && isset($suyos[$cap])) { $c = $o; $c['_de'] = $nombre[$cap]; $c['_como'] = 'captacion'; $equipo[] = $c; }
  }
  $r = comisionesDe_($persona, $ventas, $captadas, $equipo);
  $r['desde'] = $desde; $r['hasta'] = $hasta;
  $r['ventas'] = count($ventas); $r['captadas'] = count($captadas); $r['de_equipo'] = count($equipo);
  return $r;
}

/** Las ventas cerradas por la gente que tiene a esta persona de responsable. */
function ventasDeSuEquipo_(array $persona, string $desde, string $hasta): array {
  $suyos = filtrar_('USUARIOS', fn($x) => mismo_(txt_($x['responsable_id']), $persona['id'] ?? '') && !mismo_($x['id'], $persona['id'] ?? ''));
  if (!count($suyos)) return [];
  $nombre = [];
  foreach ($suyos as $x) $nombre[txt_($x['id'])] = txt_($x['nombre']);
  $lista = filtrar_('OPERACIONES', function ($o) use ($nombre, $desde, $hasta) {
    if (($nombre[txt_($o['comercial_id'])] ?? '') === '' || !esGanada_($o)) return false;
    $f = txt_($o['fecha_firma']) ?: txt_($o['creado']);
    return $f >= $desde && $f <= $hasta;
  });
  return array_map(function ($o) use ($nombre) {
    $copia = unir_([], $o);
    $copia['_de'] = $nombre[txt_($o['comercial_id'])];
    return $copia;
  }, $lista);
}

function diasSinParte_(array $persona, array $partes): ?int {
  if (!count($partes)) return null;
  $fechas = array_map(fn($x) => txt_($x['fecha']), $partes);
  sort($fechas, SORT_STRING);
  $ultimo = end($fechas);
  return diasEntre_($ultimo, hoyISO_());
}

/* ---------- el equipo al completo ---------- */

function accEquipo_(array $u, array $p): array {
  exigir_($u, 'partesAjenos');
  $hasta = txt_($p['hasta'] ?? '') ?: hoyISO_();
  $desde = txt_($p['desde'] ?? '') ?: sumarDias_($hasta, -90);
  $gente = filtrar_('USUARIOS', fn($x) => normal_($x['activo']) === 'si');
  $resumenes = array_map(fn($g) => resumenPersona_($g, $desde, $hasta, true), $gente);

  $comerciales = ordenar_(
    array_values(array_filter($resumenes, fn($r) => ($r['persona']['rol'] ?? '') === 'comercial')),
    fn($a, $b) => ($b['importe_vendido'] ?? 0) <=> ($a['importe_vendido'] ?? 0));
  $captadores = ordenar_(
    array_values(array_filter($resumenes, fn($r) => ($r['persona']['rol'] ?? '') === 'captador')),
    fn($a, $b) => $b['fichas'] <=> $a['fichas']);

  return ['ok' => true, 'desde' => $desde, 'hasta' => $hasta, 'equipo' => $resumenes,
          'ranking_comerciales' => $comerciales, 'ranking_captadores' => $captadores];
}

/* ---------- analítica de la casa ---------- */

function accAnalitica_(array $u, array $p): array {
  exigir_($u, 'partesAjenos');
  $hasta = txt_($p['hasta'] ?? '') ?: hoyISO_();
  $desde = txt_($p['desde'] ?? '') ?: sumarDias_($hasta, -365);
  $clientes = leer_('CLIENTES');
  $operaciones = leer_('OPERACIONES');
  $captaciones = leer_('CAPTACIONES');
  $partes = filtrar_('PARTES', fn($x) => txt_($x['fecha']) >= $desde && txt_($x['fecha']) <= $hasta);
  $usuarios = indexar_(leer_('USUARIOS'));
  $enRango = fn($f) => txt_($f) >= $desde && txt_($f) <= $hasta;

  /* Embudo: puerta -> ficha -> sentada -> propuesta -> venta */
  $puertas = 0; foreach ($partes as $x) $puertas += num_($x['puertas']);
  $fichas = count(array_filter($captaciones, fn($c) => $enRango($c['fecha'])));
  $sentadas = 0; foreach ($partes as $x) $sentadas += num_($x['sentadas']);
  $propuestas = count(array_filter($operaciones, fn($o) => $enRango(txt_($o['fecha_propuesta']) ?: txt_($o['creado']))));
  $ventas = count(array_filter($operaciones, fn($o) => esGanada_($o) && $enRango(txt_($o['fecha_firma']) ?: txt_($o['creado']))));

  $embudo = [
    ['fase' => 'Puertas', 'valor' => $puertas],
    ['fase' => 'Fichas de captación', 'valor' => $fichas, 'conversion' => pct_($fichas, $puertas)],
    ['fase' => 'Sentadas', 'valor' => $sentadas, 'conversion' => pct_($sentadas, $fichas)],
    ['fase' => 'Propuestas', 'valor' => $propuestas, 'conversion' => pct_($propuestas, $sentadas)],
    ['fase' => 'Ventas', 'valor' => $ventas, 'conversion' => pct_($ventas, $propuestas)]
  ];

  /* Por municipio */
  $mun = [];
  foreach ($clientes as $c) {
    $k = txt_($c['municipio']) ?: 'Sin municipio';
    if (!isset($mun[$k])) $mun[$k] = ['municipio' => $k, 'clientes' => 0, 'ventas' => 0, 'importe' => 0, 'interes' => 0, 'n' => 0];
    $mun[$k]['clientes'] += 1;
    if (num_($c['interes'])) { $mun[$k]['interes'] += num_($c['interes']); $mun[$k]['n'] += 1; }
  }
  foreach (array_filter($operaciones, 'esGanada_') as $o) {
    $c = null;
    foreach ($clientes as $x) if (mismo_($x['id'], $o['cliente_id'])) { $c = $x; break; }
    $k = $c ? (txt_($c['municipio']) ?: 'Sin municipio') : 'Sin municipio';
    if (!isset($mun[$k])) $mun[$k] = ['municipio' => $k, 'clientes' => 0, 'ventas' => 0, 'importe' => 0, 'interes' => 0, 'n' => 0];
    $mun[$k]['ventas'] += 1;
    $mun[$k]['importe'] = redondear_($mun[$k]['importe'] + num_($o['total']), 2);
  }
  $municipios = [];
  foreach ($mun as $m) {
    $m['conversion'] = pct_($m['ventas'], $m['clientes']);
    $m['interes_medio'] = $m['n'] ? redondear_($m['interes'] / $m['n'], 1) : 0;
    $municipios[] = $m;
  }
  $municipios = ordenar_($municipios, fn($a, $b) => $b['importe'] <=> $a['importe']);

  /* Tiempos medios por fase */
  $tiempos = ['propuesta_firma' => [], 'firma_instalacion' => [], 'instalacion_legalizacion' => []];
  foreach ($operaciones as $o) {
    $a = diasEntre_(txt_($o['fecha_propuesta']), txt_($o['fecha_firma']));
    if ($a !== null && $a >= 0) $tiempos['propuesta_firma'][] = $a;
    $b = diasEntre_(txt_($o['fecha_firma']), txt_($o['fecha_instalacion']));
    if ($b !== null && $b >= 0) $tiempos['firma_instalacion'][] = $b;
    $c = diasEntre_(txt_($o['fecha_instalacion']), txt_($o['fecha_legalizacion']));
    if ($c !== null && $c >= 0) $tiempos['instalacion_legalizacion'][] = $c;
  }
  $media = fn(array $l) => count($l) ? redondear_(array_sum($l) / count($l), 1) : 0;

  /* Motivos de pérdida */
  $motivos = [];
  foreach (array_filter($operaciones, fn($o) => normal_($o['estado']) === 'cancelada') as $o) {
    $k = txt_($o['motivo_perdida']) ?: 'Sin indicar';
    $motivos[$k] = ($motivos[$k] ?? 0) + 1;
  }

  /* Mezcla de producto */
  $tipos = [];
  foreach (array_filter($operaciones, 'esGanada_') as $o) {
    $k = txt_($o['tipo']) ?: 'otro';
    if (!isset($tipos[$k])) $tipos[$k] = ['tipo' => $k, 'ventas' => 0, 'importe' => 0];
    $tipos[$k]['ventas'] += 1;
    $tipos[$k]['importe'] = redondear_($tipos[$k]['importe'] + num_($o['total']), 2);
  }

  /* Previsión: cartera abierta ponderada por estado */
  $abiertas = array_values(array_filter($operaciones, fn($o) => in_array(normal_($o['estado']), ['propuesta', 'financiacion'], true)));
  $prev = 0;
  foreach ($abiertas as $o) $prev += num_($o['total']) * (normal_($o['estado']) === 'financiacion' ? 0.6 : 0.35);
  $prevision = redondear_($prev, 2);

  $listaMotivos = [];
  foreach ($motivos as $k => $n) $listaMotivos[] = ['motivo' => (string)$k, 'n' => $n];

  return ['ok' => true, 'desde' => $desde, 'hasta' => $hasta,
    'embudo' => $embudo, 'municipios' => $municipios,
    'tiempos' => ['propuesta_firma' => $media($tiempos['propuesta_firma']),
                  'firma_instalacion' => $media($tiempos['firma_instalacion']),
                  'instalacion_legalizacion' => $media($tiempos['instalacion_legalizacion'])],
    'motivos' => ordenar_($listaMotivos, fn($a, $b) => $b['n'] <=> $a['n']),
    'producto' => array_values($tipos),
    'cartera_abierta' => count($abiertas), 'prevision_ponderada' => $prevision
  ];
}

/* ---------- avisos ---------- */

function accAlertas_(array $u, array $p): array {
  $per = permisos_($u);
  $hoy = hoyISO_();
  $clientes = misClientes_($u);
  $operaciones = misOperaciones_($u);
  $avisos = [];

  foreach ($clientes as $c) {
    if (txt_($c['proxima_fecha']) !== '' && txt_($c['proxima_fecha']) < $hoy &&
        !in_array(normal_($c['estado']), ['ganado', 'perdido'], true)) {
      $avisos[] = ['tipo' => 'accion_vencida', 'nivel' => 'alto', 'cliente_id' => $c['id'],
        'texto' => txt_($c['nombre']) . ': "' . (txt_($c['proxima_accion']) ?: 'seguimiento') . '" venció el ' . txt_($c['proxima_fecha']) . '.'];
    }
  }

  foreach ($operaciones as $o) {
    $f = txt_($o['fecha_propuesta']);
    if (normal_($o['estado']) === 'propuesta' && $f !== '' && (diasEntre_($f, $hoy) ?? 0) > 15) {
      $avisos[] = ['tipo' => 'propuesta_dormida', 'nivel' => 'medio', 'operacion_id' => $o['id'], 'cliente_id' => $o['cliente_id'],
        'texto' => 'Propuesta de ' . diasEntre_($f, $hoy) . ' días sin cerrar (' . (txt_($o['referencia']) ?: txt_($o['id'])) . ').'];
    }
    if (in_array(normal_($o['estado']), ['material', 'instalacion'], true) && txt_($o['fecha_prevista_instalacion']) === '') {
      $avisos[] = ['tipo' => 'sin_fecha', 'nivel' => 'medio', 'operacion_id' => $o['id'], 'cliente_id' => $o['cliente_id'],
        'texto' => 'Obra en marcha sin fecha prevista de instalación (' . (txt_($o['referencia']) ?: txt_($o['id'])) . ').'];
    }
  }

  if (!empty($per['finanzas'])) {
    $opIds = [];
    foreach (leer_('OPERACIONES') as $o) $opIds[txt_($o['id'])] = $o;
    foreach (leer_('COBROS') as $c) {
      if (txt_($c['fecha_cobro']) === '' && txt_($c['fecha_prevista']) !== '' && txt_($c['fecha_prevista']) < $hoy) {
        $op = $opIds[txt_($c['operacion_id'])] ?? [];
        $avisos[] = ['tipo' => 'cobro_vencido', 'nivel' => 'alto', 'operacion_id' => $c['operacion_id'],
          'texto' => 'Cobro vencido de ' . redondear_(num_($c['importe']), 0) . ' € (' . (txt_($op['referencia'] ?? '') ?: txt_($c['operacion_id'])) . ') desde el ' . txt_($c['fecha_prevista']) . '.'];
      }
    }
    foreach (leer_('FACTURAS') as $f) {
      if (txt_($f['fecha_cobro']) === '' && txt_($f['fecha_vencimiento']) !== '' && txt_($f['fecha_vencimiento']) < $hoy) {
        $avisos[] = ['tipo' => 'factura_vencida', 'nivel' => 'alto', 'texto' =>
          'Factura ' . txt_($f['numero']) . ' vencida el ' . txt_($f['fecha_vencimiento']) . ' (' . redondear_(num_($f['total']), 0) . ' €).'];
      }
    }
    foreach (cuadreFacturacion_() as $x) $avisos[] = $x;
  }

  /* ¿Falta el parte de hoy? */
  if (($u['rol'] ?? '') === 'comercial' || ($u['rol'] ?? '') === 'captador') {
    $hayParte = buscar1_('PARTES', fn($x) => mismo_($x['usuario_id'], $u['id'] ?? '') && txt_($x['fecha']) === $hoy) !== null;
    if (!$hayParte) $avisos[] = ['tipo' => 'parte_pendiente', 'nivel' => 'bajo',
      'texto' => 'Todavía no has enviado el parte de hoy.'];
  }

  $orden = ['alto' => 0, 'medio' => 1, 'bajo' => 2];
  $avisos = ordenar_($avisos, fn($a, $b) => ($orden[$a['nivel']] ?? 0) <=> ($orden[$b['nivel']] ?? 0));
  return ['ok' => true, 'alertas' => array_slice($avisos, 0, 80)];
}


/* ---------- que la facturación cuadre con las operaciones ----------
 *
 * Esto nació de un lío de verdad: a una operación se le emitió primero el
 * 50% y luego otra factura por el total en vez de por la mitad que
 * faltaba, y nadie se dio cuenta hasta que se cruzaron las facturas con el
 * banco meses después. Y al revés: cinco facturas que estaban en la
 * carpeta del Drive nunca llegaron al CRM, y la numeración saltaba de la
 * 141 a la 147 sin que saltara ningún aviso.
 *
 * Son tres comprobaciones de aritmética, baratas, que cualquiera de las
 * dos cosas la cantan el mismo día que pasa.
 */
function cuadreFacturacion_(): array {
  $avisos = [];
  $operaciones = leer_('OPERACIONES');
  $facturas = leer_('FACTURAS');
  $cobros = leer_('COBROS');

  $porOp = [];
  foreach ($operaciones as $o) {
    $porOp[txt_($o['id'])] = ['op' => $o, 'facturado' => 0, 'cobrado' => 0];
  }
  foreach ($facturas as $f) {
    $k = txt_($f['operacion_id']);
    if (isset($porOp[$k])) $porOp[$k]['facturado'] += num_($f['total']);
  }
  foreach ($cobros as $c) {
    $k = txt_($c['operacion_id']);
    if (isset($porOp[$k]) && normal_($c['estado']) === 'cobrado') $porOp[$k]['cobrado'] += num_($c['importe']);
  }

  /* Un euro de margen: los redondeos del IVA no son un descuadre. */
  foreach ($porOp as $k => $r) {
    $k = (string)$k;
    $total = num_($r['op']['total']);
    if (!$total) continue;
    $nombre = txt_($r['op']['referencia']) ?: $k;
    if ($r['facturado'] > $total + 1) {
      $avisos[] = ['tipo' => 'sobrefacturado', 'nivel' => 'alto', 'operacion_id' => $k, 'cliente_id' => $r['op']['cliente_id'],
        'texto' => 'Facturado de más en ' . $nombre . ': ' . redondear_($r['facturado'], 0) . ' € en facturas para ' .
                   'una operación de ' . redondear_($total, 0) . ' €. Sobran ' . redondear_($r['facturado'] - $total, 0) . ' €.'];
    }
    if ($r['cobrado'] > $r['facturado'] + 1) {
      $avisos[] = ['tipo' => 'cobrado_sin_factura', 'nivel' => 'alto', 'operacion_id' => $k, 'cliente_id' => $r['op']['cliente_id'],
        'texto' => 'Cobrado sin factura en ' . $nombre . ': ' . redondear_($r['cobrado'], 0) . ' € cobrados y solo ' .
                   redondear_($r['facturado'], 0) . ' € facturados.'];
    }
  }

  /* Si la numeración salta, es que hay facturas emitidas que no se han
     metido. Se mira por serie y por año, que cada una va por su cuenta. */
  $series = [];
  $anchos = [];
  foreach ($facturas as $f) {
    if (!preg_match('/^(.*?)(\d+)$/', txt_($f['numero']), $m)) continue;
    $serie = $m[1];
    $series[$serie][] = (int)$m[2];
    /* El número que falta se escribe con los mismos ceros delante que
       llevan los que sí están, que si no no se encuentra en la carpeta. */
    $anchos[$serie] = max($anchos[$serie] ?? 0, strlen($m[2]));
  }
  foreach ($series as $serie => $nums) {
    $serie = (string)$serie;
    sort($nums, SORT_NUMERIC);
    $faltan = [];
    for ($i = $nums[0] + 1; $i < $nums[count($nums) - 1]; $i++) {
      if (!in_array($i, $nums, true)) $faltan[] = $serie . str_pad((string)$i, $anchos[$serie], '0', STR_PAD_LEFT);
    }
    if (!count($faltan)) continue;
    $avisos[] = ['tipo' => 'hueco_facturas', 'nivel' => 'medio', 'texto' =>
      (count($faltan) === 1 ? 'Falta una factura por registrar: ' : 'Faltan ' . count($faltan) .
       ' facturas por registrar: ') . implode(', ', array_slice($faltan, 0, 12)) .
      (count($faltan) > 12 ? ' y ' . (count($faltan) - 12) . ' más' : '') . '.'];
  }

  return $avisos;
}
