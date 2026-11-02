<?php
/**
 * copia.php — Volcado SQL completo (.sql.gz) de la base de datos del CRM.
 *
 * Lo descarga la tarea semanal de copias del Escritorio de Nando con la
 * cabecera X-Backup-Key = propiedad LLAVE_BACKUP. También lo usa la copia
 * de los viernes para dejar el .sql.gz en Drive.
 */

ini_set('display_errors', '0');
set_time_limit(300);
require_once __DIR__ . '/cargar.php';

$llave = txt_($_SERVER['HTTP_X_BACKUP_KEY'] ?? ($_GET['llave'] ?? ''));
$buena = prop_('LLAVE_BACKUP');
if (!$buena || !$llave || !hash_equals($buena, $llave)) {
  http_response_code(403);
  header('Content-Type: text/plain; charset=utf-8');
  echo "Llave incorrecta.\n";
  exit;
}
require_once __DIR__ . '/sql.php';
$sql = volcadoSql_();
$nombre = 'crm_bd_' . ahoraDT_()->format('Y-m-d_H-i') . '.sql.gz';
header('Content-Type: application/gzip');
header('Content-Disposition: attachment; filename="' . $nombre . '"');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
echo gzencode($sql, 6);
