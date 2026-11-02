<?php
/**
 * mapa.php — Mapa de clientes visitados. Solo dirección.
 *
 * Devuelve un punto por cliente con todo lo que hace falta para
 * decidir dónde merece la pena volver: estado, tecnología, gasto
 * energético, interés, quién lo lleva y qué se vendió.
 *
 * (Traducción de 09_Mapa.gs.)
 */

require_once __DIR__ . '/base.php';
require_once __DIR__ . '/google.php';

function soloDireccion_(array $u): void {
  if ((permisos_($u)['alcance'] ?? '') !== 'todo') {
    throw new Exception('El mapa de clientes es solo para dirección.');
  }
}

function accMapa_(array $u, array $p): array {
  soloDireccion_($u);
  $clientes = leer_('CLIENTES');
  $operaciones = leer_('OPERACIONES');
  $captaciones = leer_('CAPTACIONES');
  $usuarios = indexar_(leer_('USUARIOS'));
  $seguimiento = leer_('SEGUIMIENTO');

  $opPorCliente = [];
  foreach ($operaciones as $o) {
    $k = txt_($o['cliente_id']);
    if (!isset($opPorCliente[$k]) || esGanada_($o)) $opPorCliente[$k] = $o;
  }
  $capPorCliente = indexar_($captaciones, 'cliente_id');
  $ultimoContacto = [];
  foreach ($seguimiento as $s) {
    $k = txt_($s['cliente_id']);
    if (!isset($ultimoContacto[$k]) || $ultimoContacto[$k] < txt_($s['fecha'])) $ultimoContacto[$k] = txt_($s['fecha']);
  }

  $puntos = [];
  $sinCoordenadas = 0;

  foreach ($clientes as $c) {
    $co = coordenadas_($c['coordenadas']);
    if (!$co) { $sinCoordenadas++; continue; }
    $op = $opPorCliente[txt_($c['id'])] ?? null;
    $cap = $capPorCliente[txt_($c['id'])] ?? null;
    $puntos[] = [
      'id' => $c['id'], 'nombre' => $c['nombre'], 'lat' => $co[0], 'lng' => $co[1],
      'direccion' => $c['direccion'], 'municipio' => $c['municipio'], 'cp' => $c['cp'],
      'telefono' => $c['telefono'], 'email' => $c['email'],
      'estado' => $c['estado'], 'fecha_estado' => $c['fecha_estado'], 'origen' => $c['origen'],
      'comercial' => (($usuarios[txt_($c['comercial_id'])] ?? [])['nombre'] ?? '') ?: '',
      'comercial_id' => $c['comercial_id'],
      'captador' => (($usuarios[txt_($c['captador_id'])] ?? [])['nombre'] ?? '') ?: '',
      'captador_id' => $c['captador_id'],
      'interes' => num_($c['interes']), 'm2' => num_($c['m2']), 'personas' => num_($c['personas']),
      'tipo_vivienda' => $c['tipo_vivienda'], 'calefaccion' => $c['calefaccion'],
      'gasto_luz_mes' => num_($c['gasto_luz_mes']),
      'gasto_combustible' => num_($c['gasto_combustible']),
      'periodo_combustible' => $c['periodo_combustible'],
      'gasto_anual' => gastoAnual_($c),
      'creado' => $c['creado'], 'ultimo_contacto' => $ultimoContacto[txt_($c['id'])] ?? '',
      'proxima_accion' => $c['proxima_accion'], 'proxima_fecha' => $c['proxima_fecha'],
      'perfil' => $c['perfil'],
      'tecnologia' => $cap ? $cap['tecnologia'] : ($op ? $op['tipo'] : ''),
      'operacion' => $op ? ['id' => $op['id'], 'referencia' => $op['referencia'], 'tipo' => $op['tipo'], 'estado' => $op['estado'],
        'total' => num_($op['total']), 'fecha_firma' => $op['fecha_firma'], 'fecha_instalacion' => $op['fecha_instalacion'],
        'paneles' => num_($op['paneles_num']), 'aero_kw' => num_($op['aero_kw']), 'bateria_kwh' => num_($op['bateria_kwh'])] : null
    ];
  }

  /* Resumen por municipio, para las zonas calientes. */
  $mun = [];
  foreach ($puntos as $x) {
    $k = txt_($x['municipio']) ?: 'Sin municipio';
    if (!isset($mun[$k])) $mun[$k] = ['municipio' => $k, 'clientes' => 0, 'ventas' => 0, 'importe' => 0, 'gasto' => 0, 'lat' => 0, 'lng' => 0];
    $mun[$k]['clientes'] += 1; $mun[$k]['gasto'] += $x['gasto_anual']; $mun[$k]['lat'] += $x['lat']; $mun[$k]['lng'] += $x['lng'];
    if ($x['operacion'] && in_array(normal_($x['operacion']['estado']),
        ['firmada','tramite','material','instalacion','instalada','legalizada','cerrada'], true)) {
      $mun[$k]['ventas'] += 1; $mun[$k]['importe'] += $x['operacion']['total'];
    }
  }
  $municipios = [];
  foreach ($mun as $k => $m) {
    $municipios[] = ['municipio' => $k, 'clientes' => $m['clientes'], 'ventas' => $m['ventas'],
            'importe' => redondear_($m['importe'], 2), 'conversion' => pct_($m['ventas'], $m['clientes']),
            'gasto_medio' => redondear_($m['gasto'] / $m['clientes'], 0),
            'lat' => redondear_($m['lat'] / $m['clientes'], 6), 'lng' => redondear_($m['lng'] / $m['clientes'], 6)];
  }
  $municipios = ordenar_($municipios, fn($a, $b) => $b['clientes'] <=> $a['clientes']);

  return ['ok' => true, 'puntos' => $puntos, 'municipios' => $municipios,
          'sin_coordenadas' => $sinCoordenadas, 'total' => count($clientes)];
}

function gastoAnual_(array $c) {
  $luz = num_($c['gasto_luz_mes'] ?? '') * 12;
  $comb = num_($c['gasto_combustible'] ?? '');
  $per = normal_($c['periodo_combustible'] ?? '');
  $combAnual = $per === 'al mes' ? $comb * 12 : (($per === 'por deposito' || $per === 'por depósito') ? $comb * 2 : $comb);
  return redondear_($luz + $combAnual, 0);
}

function coordenadas_($v): ?array {
  $s = preg_replace('/\s/u', '', txt_($v));
  if ($s === '') return null;
  $p = partir_($s, ',');
  if (count($p) !== 2) return null;
  if (!is_numeric($p[0]) || !is_numeric($p[1])) return null;   // parseFloat → NaN → isFinite falso
  $lat = (float)$p[0]; $lng = (float)$p[1];
  if (!is_finite($lat) || !is_finite($lng)) return null;
  if (abs($lat) > 90 || abs($lng) > 180) return null;
  return [redondear_($lat, 6), redondear_($lng, 6)];
}

/**
 * Busca las coordenadas de los clientes que no las tienen, a partir de
 * su dirección. Va de 20 en 20 para no agotar el tiempo de ejecución.
 */
function accGeocodificar_(array $u, array $p): array {
  soloDireccion_($u);
  $limite = min(num_($p['limite'] ?? '') ?: 20, 40);
  $pendientes = array_slice(array_values(array_filter(leer_('CLIENTES'), function ($c) {
    return !coordenadas_($c['coordenadas']) && txt_($c['direccion']) !== '';
  })), 0, (int)$limite);

  $hechos = 0; $fallos = 0;
  foreach ($pendientes as $c) {
    $dir = implode(', ', array_values(array_filter([txt_($c['direccion']), txt_($c['municipio']), txt_($c['cp']), 'España'],
      fn($s) => $s !== '')));
    try {
      $r = geocodificar_($dir);
      if (($r['status'] ?? '') === 'OK' && !empty($r['results'])) {
        $loc = $r['results'][0]['geometry']['location'];
        actualizar_('CLIENTES', $c['id'], ['coordenadas' => redondear_($loc['lat'], 6) . ',' . redondear_($loc['lng'], 6)]);
        $hechos++;
      } else { $fallos++; }
    } catch (Throwable $e) { $fallos++; }
    dormir_(120);
  }
  registrar_($u, 'geocodificar', 'CLIENTES', '', $hechos . ' de ' . count($pendientes));
  $quedan = count(array_filter(leer_('CLIENTES'), function ($c) {
    return !coordenadas_($c['coordenadas']) && txt_($c['direccion']) !== ''; }));
  return ['ok' => true, 'hechos' => $hechos, 'fallos' => $fallos, 'pendientes' => $quedan];
}
