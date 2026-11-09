<?php
/**
 * esquema.php — Crea o actualiza las tablas en MySQL a partir del ESQUEMA.
 *
 * Es la parte de «instalar()» que en la hoja creaba pestañas y cabeceras.
 * Se puede ejecutar las veces que haga falta: añade las columnas que falten
 * y no toca las que ya están.
 */

require_once __DIR__ . '/base.php';

/* Columnas que se buscan a menudo y conviene indexar. */
const INDICES = [
  'USUARIOS' => ['usuario'],
  'CLIENTES' => ['comercial_id', 'captador_id', 'estado', 'telefono'],
  'OPERACIONES' => ['cliente_id', 'comercial_id', 'estado'],
  'COBROS' => ['operacion_id', 'estado'],
  'FACTURAS' => ['operacion_id', 'cliente_id'],
  'GASTOS' => ['operacion_id'],
  'SEGUIMIENTO' => ['cliente_id', 'operacion_id', 'usuario_id'],
  'CAPTACIONES' => ['cliente_id', 'captador_id', 'comercial_id'],
  'CITAS_CAMBIOS' => ['captacion_id', 'cliente_id', 'captador_id'],
  'CAMBIOS' => ['cliente_id'],
  'INCIDENCIAS' => ['estado', 'urgencia'],
  'TRAMITES' => ['tipo', 'cliente_id'],
  'PARTES' => ['usuario_id', 'fecha'],
  'NOMINAS' => ['usuario_id', 'periodo'],
  'JORNADAS' => ['usuario_id', 'fecha'],
  'BANCO' => ['fecha', 'clave'],
  'VACACIONES' => ['usuario_id', 'anio'],
  'SESIONES' => ['token', 'usuario_id'],
  'EQUIPOS' => ['usuario_id', 'pendiente'],
  'DIRECTORIO' => ['ref', 'telefono'],
  'DIR_VISITAS' => ['ref'],
  'PROYECTOS' => ['cliente_id'],
  'COTIZACIONES' => ['cliente_id'],
  'ARCHIVOS' => ['cliente_id', 'proyecto_id'],
  'TAREAS' => ['usuario_id', 'estado'],
  'LOG' => ['fecha', 'usuario_id'],
  'CONFIG' => ['clave'],
  'CIFRAS' => ['clave'],
];

/* Columnas que pueden ser largas (textos, JSON, miniaturas en base64). */
function tipoColumna_(string $tabla, string $col): string {
  if ($col === 'id' || substr($col, -3) === '_id' || in_array($col, INDICES[$tabla] ?? [], true) || in_array($col, ['token', 'clave', 'ref', 'huella', 'pendiente', 'periodo', 'fecha', 'usuario', 'estado', 'tipo', 'numero'], true)) return 'VARCHAR(191) NOT NULL DEFAULT \'\'';
  if (in_array($col, ['miniatura', 'detalle', 'analisis', 'resumen', 'sentadas_detalle', 'propuestas_aplicadas', 'nota', 'notas', 'otros', 'tarjeta', 'datos'], true)) return 'MEDIUMTEXT NULL';
  return 'TEXT NULL';
}

function instalarEsquema_(): array {
  $db = db_();
  $hecho = [];
  $db->exec("CREATE TABLE IF NOT EXISTS `zw_propiedades` (`clave` VARCHAR(191) NOT NULL PRIMARY KEY, `valor` TEXT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  foreach (ESQUEMA as $nombre => $cab) {
    $t = tablaSql_($nombre);
    $existe = $db->query("SHOW TABLES LIKE " . $db->quote($t))->fetchColumn();
    if (!$existe) {
      $cols = ['`_n` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY'];
      foreach ($cab as $c) $cols[] = "`$c` " . tipoColumna_($nombre, $c);
      foreach (INDICES[$nombre] ?? [] as $c) if (in_array($c, $cab, true)) $cols[] = "INDEX `ix_$c` (`$c`)";
      $db->exec("CREATE TABLE `$t` (" . implode(', ', $cols) . ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
      $hecho[] = "creada $t";
      continue;
    }
    $actuales = array_column($db->query("SHOW COLUMNS FROM `$t`")->fetchAll(), 'Field');
    foreach ($cab as $c) {
      if (!in_array($c, $actuales, true)) {
        $db->exec("ALTER TABLE `$t` ADD COLUMN `$c` " . tipoColumna_($nombre, $c));
        $hecho[] = "$t + $c";
      }
    }
  }
  return $hecho;
}

/** Ajusta los contadores SEQ_* al mayor id que haya en cada tabla (tras importar). */
function ajustarSecuencias_(): array {
  $out = [];
  foreach (PREFIJO as $nombre => $pref) {
    if (!isset(ESQUEMA[$nombre]) || !in_array('id', ESQUEMA[$nombre], true)) continue;
    $t = tablaSql_($nombre);
    $max = 0;
    foreach (db_()->query("SELECT `id` FROM `$t`")->fetchAll(PDO::FETCH_COLUMN) as $id) {
      if (preg_match('/^' . preg_quote($pref, '/') . '-(\d+)$/', (string)$id, $m)) $max = max($max, (int)$m[1]);
    }
    $actual = (int)(prop_('SEQ_' . $nombre) ?? 0);
    if ($max > $actual) { setProp_('SEQ_' . $nombre, $max); $out[$nombre] = $max; }
  }
  return $out;
}
