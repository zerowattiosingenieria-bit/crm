<?php
/**
 * exportar.php — Todas las tablas en JSON, para el espejo de Google Sheets.
 *
 * Lo llama el Apps Script cada noche (espejoDesdeServidor) con la llave
 * LLAVE_EXPORTAR (propiedad zw_propiedades). Devuelve el mismo formato que
 * el volcado de la copia de seguridad: {ok, generado, version, tablas:{T:[...]}}.
 * Las sesiones no salen; de los usuarios no salen hash ni salt.
 */

ini_set('display_errors', '0');
set_time_limit(300);
require_once __DIR__ . '/cargar.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');

$p = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
$llave = txt_($p['llave'] ?? ($_SERVER['HTTP_X_EXPORT_KEY'] ?? ''));
$buena = prop_('LLAVE_EXPORTAR');
if (!$buena || !$llave || !hash_equals($buena, $llave)) {
  http_response_code(403);
  echo aJson_(['ok' => false, 'error' => 'Llave incorrecta.']);
  exit;
}

$tablas = [];
foreach (ESQUEMA as $t => $cab) {
  if ($t === 'SESIONES') continue;
  $filas = [];
  foreach (leer_($t) as $f) {
    unset($f['_fila']);
    if ($t === 'USUARIOS') { $f['hash'] = ''; $f['salt'] = ''; }
    $filas[] = $f;
  }
  $tablas[$t] = $filas;
}
echo aJson_(['ok' => true, 'generado' => ahora_(), 'version' => VERSION, 'tablas' => $tablas]);
