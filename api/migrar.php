<?php
/**
 * migrar.php — Carga en MySQL un volcado JSON del CRM ({tablas:{T:[...]}}),
 * el mismo formato que deja la copia de seguridad en Drive.
 *
 * Uso desde la línea de órdenes:  php migrar.php <volcado.json> [--vaciar]
 * Desde el servidor (mu-plugin): migrarVolcado_($json, $vaciar).
 *
 * Con --vaciar borra antes TODAS las tablas (migración completa). Sin él,
 * solo añade filas cuyo id no exista todavía.
 */

require_once __DIR__ . '/cargar.php';

function migrarVolcado_(array $volcado, bool $vaciar = false): array {
  $tablas = $volcado['tablas'] ?? $volcado;
  $out = [];
  instalarEsquema_();
  foreach (ESQUEMA as $t => $cab) {
    if (!isset($tablas[$t]) || !is_array($tablas[$t])) { $out[$t] = 'no viene'; continue; }
    $filas = $tablas[$t];
    if ($vaciar) vaciar_($t);
    $conId = in_array('id', $cab, true);
    $existen = [];
    if ($conId && !$vaciar) foreach (leer_($t) as $f) $existen[(string)$f['id']] = true;
    $nuevas = [];
    foreach ($filas as $f) {
      if (!is_array($f)) continue;
      unset($f['_fila']);
      if ($conId && !empty($f['id']) && isset($existen[(string)$f['id']])) continue;
      $o = [];
      foreach ($cab as $c) $o[$c] = $f[$c] ?? '';
      $nuevas[] = $o;
    }
    /* insertarLote_ reserva ids para las filas que no lo traen; las que lo
       traen (todas, en un volcado) lo conservan. */
    $n = insertarLote_($t, $nuevas);
    $out[$t] = $n . ' filas';
  }
  $out['secuencias'] = ajustarSecuencias_();
  olvidarTodo_();
  return $out;
}

if (PHP_SAPI === 'cli' && realpath($argv[0] ?? '') === realpath(__FILE__)) {
  $ruta = $argv[1] ?? '';
  if (!$ruta || !is_file($ruta)) { fwrite(STDERR, "uso: php migrar.php <volcado.json> [--vaciar]\n"); exit(1); }
  $v = json_decode(file_get_contents($ruta), true);
  if (!is_array($v)) { fwrite(STDERR, "El archivo no es un JSON válido.\n"); exit(1); }
  print_r(migrarVolcado_($v, in_array('--vaciar', $argv, true)));
}
