<?php
/**
 * cargar.php — Carga el backend entero y conecta con la base de datos.
 *
 * La conexión sale, por este orden, de:
 *   1. $GLOBALS['ZW_DB_CFG'] si ya lo ha puesto quien nos carga (pruebas, cron);
 *   2. las constantes de WordPress (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD) si
 *      estamos dentro de WordPress (crm.zerowattios.com, vía el mu-plugin);
 *   3. el archivo `config_local.php` de esta carpeta (fuera del repositorio).
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/base.php';
require_once __DIR__ . '/google.php';
require_once __DIR__ . '/esquema.php';

if (empty($GLOBALS['ZW_DB_CFG']) && !($GLOBALS['ZW_DB'] ?? null)) {
  if (defined('DB_NAME') && defined('DB_USER')) {
    $host = defined('DB_HOST') ? DB_HOST : 'localhost';
    $puerto = '';
    if (strpos($host, ':') !== false) { [$host, $puerto] = explode(':', $host, 2); }
    $dsn = 'mysql:host=' . $host . ($puerto ? ';port=' . $puerto : '') . ';dbname=' . DB_NAME . ';charset=utf8mb4';
    $GLOBALS['ZW_DB_CFG'] = ['dsn' => $dsn, 'usuario' => DB_USER, 'clave' => defined('DB_PASSWORD') ? DB_PASSWORD : ''];
  } elseif (is_file(__DIR__ . '/config_local.php')) {
    require __DIR__ . '/config_local.php';
  }
}

/* Los módulos, en el mismo orden que en Apps Script. */
foreach (['auth', 'registro', 'clientes', 'finanzas', 'partes', 'resumen', 'nominas', 'mapa', 'api',
          'vacaciones', 'backup', 'banco', 'resumen_semanal', 'importar', 'directorio', 'proyectos',
          'tablero', 'mejoras', 'ficha', 'recordatorios', 'estadisticas', 'historial', 'incidencias', 'tramites', 'portal', 'instalar'] as $m) {
  $f = __DIR__ . '/' . $m . '.php';
  if (is_file($f)) require_once $f;
}
