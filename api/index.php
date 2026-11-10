<?php
/**
 * index.php — Puerta de entrada HTTP del CRM (lo que antes era doPost/doGet).
 *
 * El navegador manda un POST con el JSON en el cuerpo y tipo text/plain
 * (como siempre) y recibe JSON. La copia de GitHub Pages puede llamar
 * también: se le permite el origen.
 */

ini_set('display_errors', '0');
error_reporting(E_ALL);
set_time_limit(120);
ignore_user_abort(true);

require_once __DIR__ . '/cargar.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow, noarchive');
$origen = $_SERVER['HTTP_ORIGIN'] ?? '';
if (preg_match('#^https://(zerowattiosingenieria-bit\.github\.io|(crm|clientes|contratas)\.zerowattios\.com)$#', $origen)) {
  header('Access-Control-Allow-Origin: ' . $origen);
  header('Vary: Origin');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type');
  header('Access-Control-Max-Age: 86400');
  exit;
}

$p = [];
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
  $cuerpo = file_get_contents('php://input');
  $p = json_decode($cuerpo ?: '{}', true);
  if (!is_array($p)) { echo aJson_(['ok' => false, 'error' => 'La petición no es un JSON válido.']); exit; }
} else {
  $p = $_GET;
}

try {
  $r = despachar_($p);
} catch (Throwable $e) {
  error_log('CRM: ' . $e->getMessage() . ' en ' . $e->getFile() . ':' . $e->getLine());
  $r = ['ok' => false, 'error' => 'Error del servidor: ' . $e->getMessage()];
}
$json = aJson_($r);
if ($json === false) {
  /* Algún texto con bytes raros: se limpia y se vuelve a intentar. */
  $json = json_encode($r, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
}
echo $json;
