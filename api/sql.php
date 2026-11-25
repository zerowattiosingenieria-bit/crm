<?php
/** sql.php — Volcado SQL de la base de datos del CRM (lo usan copia.php y la copia de los viernes). */
require_once __DIR__ . '/base.php';

/** Genera el volcado SQL de todas las tablas zw_* como texto. */
function volcadoSql_(): string {
  $todo = '';
  volcadoSqlA_(function ($t) use (&$todo) { $todo .= $t; });
  return $todo;
}

/** El volcado por trozos, sin tenerlo entero en memoria (25/11/2026: la base ya pesa bastante). */
function volcadoSqlA_(callable $escribir): void {
  $db = db_();
  $out = "-- CRM ZERO WATTIOS · volcado " . ahora_() . " · versión " . VERSION . "\n";
  $out .= "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n\n";
  $tablas = $db->query("SHOW TABLES LIKE 'zw\\_%'")->fetchAll(PDO::FETCH_COLUMN);
  foreach ($tablas as $t) {
    $crea = $db->query("SHOW CREATE TABLE `$t`")->fetch(PDO::FETCH_NUM)[1];
    $out .= "DROP TABLE IF EXISTS `$t`;\n$crea;\n\n";
    $st = $db->query("SELECT * FROM `$t`");
    $lote = [];
    $cols = null;
    while ($f = $st->fetch(PDO::FETCH_ASSOC)) {
      if ($cols === null) $cols = '(' . implode(',', array_map(fn($c) => "`$c`", array_keys($f))) . ')';
      $vals = [];
      foreach ($f as $v) $vals[] = $v === null ? 'NULL' : $db->quote((string)$v);
      $lote[] = '(' . implode(',', $vals) . ')';
      if (count($lote) >= 200) { $out .= "INSERT INTO `$t` $cols VALUES\n" . implode(",\n", $lote) . ";\n"; $lote = []; $escribir($out); $out = ''; }
    }
    if ($lote) $out .= "INSERT INTO `$t` $cols VALUES\n" . implode(",\n", $lote) . ";\n";
    $out .= "\n";
    $escribir($out); $out = '';
  }
  $out .= "SET FOREIGN_KEY_CHECKS=1;\n";
  $escribir($out);
}

