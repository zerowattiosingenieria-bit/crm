<?php
/**
 * base.php — Acceso a la base de datos (MySQL/MariaDB) y utilidades comunes.
 *
 * Es la traducción de 01_Base.gs: las mismas funciones, con los mismos
 * nombres y el mismo comportamiento, pero sobre MySQL en vez de sobre la
 * hoja de cálculo. El resto del backend no sabe dónde viven los datos.
 *
 * Convenciones:
 *  - Cada tabla del ESQUEMA es una tabla `zw_<nombre en minúsculas>` con una
 *    columna por campo (todas de texto) y una columna interna `_n`
 *    (autoincremental) que conserva el orden de inserción y hace de `_fila`.
 *  - Las filas se devuelven como arrays asociativos. Los valores que son
 *    números «puros» vuelven como int/float (igual que hacía la hoja), el
 *    resto como cadenas. Nunca null: lo vacío es ''.
 *  - Las propiedades del script (SEQ_*, ID_CARPETA_BACKUP…) viven en
 *    `zw_propiedades`.
 */

require_once __DIR__ . '/config.php';

/* ---------- conexión ---------- */

/** Configuración de conexión. La pone quien arranca (index.php, cron, pruebas). */
$GLOBALS['ZW_DB'] = $GLOBALS['ZW_DB'] ?? null;      // PDO
$GLOBALS['ZW_DB_CFG'] = $GLOBALS['ZW_DB_CFG'] ?? null; // ['dsn'=>..., 'usuario'=>..., 'clave'=>...]

function db_(): PDO {
  if ($GLOBALS['ZW_DB'] instanceof PDO) return $GLOBALS['ZW_DB'];
  $c = $GLOBALS['ZW_DB_CFG'];
  if (!$c) throw new Exception('El CRM no tiene configurada la base de datos.');
  $pdo = new PDO($c['dsn'], $c['usuario'] ?? '', $c['clave'] ?? '', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
    PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci, time_zone = '+00:00', sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION'",
  ]);
  $GLOBALS['ZW_DB'] = $pdo;
  return $pdo;
}

function tablaSql_(string $nombre): string {
  if (!isset(ESQUEMA[$nombre])) throw new Exception('Falta la tabla ' . $nombre . '. Vuelve a ejecutar instalar().');
  return 'zw_' . strtolower($nombre);
}

/* ---------- lectura ---------- */

/* Lo leído se guarda mientras dura la petición: muchas acciones leen la
   misma tabla varias veces. Al escribir en una tabla se tira su copia. */
$GLOBALS['ZW_CACHE'] = [];

function olvidarTabla_(string $nombre): void { unset($GLOBALS['ZW_CACHE'][$nombre]); }
function olvidarTodo_(): void { $GLOBALS['ZW_CACHE'] = []; $GLOBALS['ZW_CONFIG_CACHE'] = null; }

/* Un valor de la base de datos, como lo devolvía la hoja: los números puros
   como números, lo demás como texto. Nunca null. */
function valorHoja_($v) {
  if ($v === null) return '';
  if (is_int($v) || is_float($v)) return $v;
  $s = (string)$v;
  if ($s === '') return '';
  if (preg_match('/^-?(0|[1-9]\d{0,14})(\.\d+)?$/', $s)) {
    if (strpos($s, '.') === false) { $n = (int)$s; return (string)$n === $s ? $n : $s; }
    $f = (float)$s;
    return $f;
  }
  return $s;
}

/* Lo contrario: lo que se guarda. Todo texto; true/false como en JS. */
function valorCelda_($v): string {
  if ($v === null) return '';
  if (is_bool($v)) return $v ? 'true' : 'false';
  if (is_array($v)) return json_encode($v, JSON_UNESCAPED_UNICODE);
  if (is_float($v)) {
    if (floor($v) == $v && abs($v) < 1e15) return (string)(int)$v;
    return rtrim(rtrim(number_format($v, 10, '.', ''), '0'), '.');
  }
  return (string)$v;
}

/** Devuelve la tabla entera como lista de arrays {columna: valor}. */
function leer_(string $nombre): array {
  if (isset($GLOBALS['ZW_CACHE'][$nombre])) return $GLOBALS['ZW_CACHE'][$nombre];
  $t = tablaSql_($nombre);
  $cab = ESQUEMA[$nombre];
  $cols = implode(',', array_map(fn($c) => '`' . $c . '`', $cab));
  $filas = db_()->query("SELECT `_n`, $cols FROM `$t` ORDER BY `_n`")->fetchAll();
  $fuera = [];
  foreach ($filas as $f) {
    $o = ['_fila' => (int)$f['_n']];
    $vacia = true;
    foreach ($cab as $c) {
      $o[$c] = valorHoja_($f[$c]);
      if ($vacia && $f[$c] !== null && $f[$c] !== '') $vacia = false;
    }
    if (!$vacia) $fuera[] = $o;
  }
  $GLOBALS['ZW_CACHE'][$nombre] = $fuera;
  return $fuera;
}

/** Lee una tabla y la devuelve indexada por id (o por el campo que se diga). */
function indexar_(?array $lista, string $campo = 'id'): array {
  $m = [];
  foreach ($lista ?? [] as $x) $m[(string)($x[$campo] ?? '')] = $x;
  return $m;
}

function cabeceras_(string $nombre): array { tablaSql_($nombre); return ESQUEMA[$nombre]; }

/* Busca la primera fila que cumple la condición. */
function buscar1_(string $nombre, callable $fn): ?array {
  foreach (leer_($nombre) as $x) if ($fn($x)) return $x;
  return null;
}

/* Filtra una tabla. */
function filtrar_(string $nombre, callable $fn): array {
  return array_values(array_filter(leer_($nombre), $fn));
}

/* ---------- escritura ---------- */

/** Añade una fila a partir de un array. Devuelve el array con su id. */
function insertar_(string $nombre, array $obj): array {
  $t = tablaSql_($nombre);
  $cab = ESQUEMA[$nombre];
  if (in_array('id', $cab, true) && empty($obj['id'])) $obj['id'] = nuevoId_($nombre);
  $cols = []; $marcas = []; $vals = [];
  foreach ($cab as $c) { $cols[] = "`$c`"; $marcas[] = '?'; $vals[] = valorCelda_($obj[$c] ?? null); }
  db_()->prepare("INSERT INTO `$t` (" . implode(',', $cols) . ") VALUES (" . implode(',', $marcas) . ")")->execute($vals);
  $obj['_fila'] = (int)db_()->lastInsertId();
  olvidarTabla_($nombre);
  return $obj;
}

/** Escribe muchas filas de golpe. Devuelve cuántas. */
function insertarLote_(string $nombre, ?array $objetos): int {
  if (!$objetos) return 0;
  $t = tablaSql_($nombre);
  $cab = ESQUEMA[$nombre];
  $conId = in_array('id', $cab, true);
  $faltan = 0;
  if ($conId) foreach ($objetos as $o) if (empty($o['id'])) $faltan++;
  $sueltos = $faltan ? nuevosIds_($nombre, $faltan) : [];
  $k = 0;
  $cols = implode(',', array_map(fn($c) => "`$c`", $cab));
  $marcas = '(' . implode(',', array_fill(0, count($cab), '?')) . ')';
  $db = db_();
  $propia = !$db->inTransaction();
  if ($propia) $db->beginTransaction();
  try {
    /* En bloques de 200 filas para no pasarse del tamaño de consulta. */
    for ($i = 0; $i < count($objetos); $i += 200) {
      $trozo = array_slice($objetos, $i, 200);
      $vals = [];
      foreach ($trozo as &$o) {
        if ($conId && empty($o['id'])) $o['id'] = $sueltos[$k++];
        foreach ($cab as $c) $vals[] = valorCelda_($o[$c] ?? null);
      }
      unset($o);
      $db->prepare("INSERT INTO `$t` ($cols) VALUES " . implode(',', array_fill(0, count($trozo), $marcas)))->execute($vals);
    }
    if ($propia) $db->commit();
  } catch (Throwable $e) { if ($propia) $db->rollBack(); throw $e; }
  olvidarTabla_($nombre);
  return count($objetos);
}

/* Igual que insertarLote_ (en la hoja eran dos funciones gemelas). */
function anadirFilas_(string $nombre, ?array $objetos): int { return insertarLote_($nombre, $objetos); }

/** Actualiza por id solo los campos que vengan. Devuelve la fila entera o null. */
function actualizar_(string $nombre, $id, array $cambios): ?array {
  $t = tablaSql_($nombre);
  $cab = ESQUEMA[$nombre];
  if (!in_array('id', $cab, true)) throw new Exception('La tabla ' . $nombre . ' no tiene columna id.');
  $sets = []; $vals = [];
  foreach ($cab as $c) {
    if (array_key_exists($c, $cambios)) { $sets[] = "`$c` = ?"; $vals[] = valorCelda_($cambios[$c]); }
  }
  $db = db_();
  if ($sets) {
    $vals[] = (string)$id;
    $n = $db->prepare("UPDATE `$t` SET " . implode(', ', $sets) . " WHERE `id` = ? ORDER BY `_n` LIMIT 1")->execute($vals);
    olvidarTabla_($nombre);
  }
  $st = $db->prepare("SELECT * FROM `$t` WHERE `id` = ? ORDER BY `_n` LIMIT 1");
  $st->execute([(string)$id]);
  $f = $st->fetch();
  if (!$f) return null;
  $o = ['_fila' => (int)$f['_n']];
  foreach ($cab as $c) $o[$c] = valorHoja_($f[$c]);
  return $o;
}

/** Actualiza una fila por su número interno (`_fila`). Para tablas sin id. */
function escribirFila_(string $nombre, int $fila, array $cambios): void {
  $t = tablaSql_($nombre);
  $sets = []; $vals = [];
  foreach (ESQUEMA[$nombre] as $c) {
    if (array_key_exists($c, $cambios)) { $sets[] = "`$c` = ?"; $vals[] = valorCelda_($cambios[$c]); }
  }
  if (!$sets) return;
  $vals[] = $fila;
  db_()->prepare("UPDATE `$t` SET " . implode(', ', $sets) . " WHERE `_n` = ?")->execute($vals);
  olvidarTabla_($nombre);
}

function borrar_(string $nombre, $id): bool {
  $t = tablaSql_($nombre);
  if (!in_array('id', ESQUEMA[$nombre], true)) throw new Exception('La tabla ' . $nombre . ' no tiene columna id.');
  $st = db_()->prepare("DELETE FROM `$t` WHERE `id` = ? ORDER BY `_n` LIMIT 1");
  $st->execute([(string)$id]);
  olvidarTabla_($nombre);
  return $st->rowCount() > 0;
}

/** Borra varias filas por id de una vez. Devuelve cuántas. */
function borrarVarios_(string $nombre, ?array $ids): int {
  $quiero = [];
  foreach ($ids ?? [] as $x) if ((string)$x !== '') $quiero[(string)$x] = true;
  if (!$quiero) return 0;
  $t = tablaSql_($nombre);
  if (!in_array('id', ESQUEMA[$nombre], true)) throw new Exception('La tabla ' . $nombre . ' no tiene columna id.');
  $lista = array_keys($quiero);
  $n = 0;
  for ($i = 0; $i < count($lista); $i += 500) {
    $trozo = array_slice($lista, $i, 500);
    $st = db_()->prepare("DELETE FROM `$t` WHERE `id` IN (" . implode(',', array_fill(0, count($trozo), '?')) . ")");
    $st->execute($trozo);
    $n += $st->rowCount();
  }
  olvidarTabla_($nombre);
  return $n;
}

/** Borra una fila por su número interno. */
function borrarFila_(string $nombre, int $fila): bool {
  $t = tablaSql_($nombre);
  $st = db_()->prepare("DELETE FROM `$t` WHERE `_n` = ?");
  $st->execute([$fila]);
  olvidarTabla_($nombre);
  return $st->rowCount() > 0;
}

/** Borra las filas que cumplan una condición (se evalúa en PHP). Devuelve cuántas. */
function borrarDonde_(string $nombre, callable $fn): int {
  $filas = [];
  foreach (leer_($nombre) as $x) if ($fn($x)) $filas[] = $x['_fila'];
  if (!$filas) return 0;
  $t = tablaSql_($nombre);
  $st = db_()->prepare("DELETE FROM `$t` WHERE `_n` IN (" . implode(',', array_fill(0, count($filas), '?')) . ")");
  $st->execute($filas);
  olvidarTabla_($nombre);
  return $st->rowCount();
}

/** Vacía una tabla entera (para importaciones completas). */
function vaciar_(string $nombre): void {
  $t = tablaSql_($nombre);
  db_()->exec("DELETE FROM `$t`");
  olvidarTabla_($nombre);
}

/* ---------- propiedades del script y candado ---------- */

function prop_(string $clave): ?string {
  $st = db_()->prepare("SELECT `valor` FROM `zw_propiedades` WHERE `clave` = ?");
  $st->execute([$clave]);
  $v = $st->fetchColumn();
  return $v === false ? null : (string)$v;
}

function setProp_(string $clave, $valor): void {
  db_()->prepare("INSERT INTO `zw_propiedades` (`clave`, `valor`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `valor` = VALUES(`valor`)")
       ->execute([$clave, (string)$valor]);
}

function borrarProp_(string $clave): void {
  db_()->prepare("DELETE FROM `zw_propiedades` WHERE `clave` = ?")->execute([$clave]);
}

/* El candado de todo el script (LockService). Se suelta al acabar la petición. */
function conCandado_(callable $fn, int $segundos = 30) {
  $db = db_();
  $ok = $db->query("SELECT GET_LOCK('zw_crm', $segundos)")->fetchColumn();
  if (!$ok) throw new Exception('El servidor está ocupado. Vuelve a intentarlo.');
  try { return $fn(); }
  finally { $db->query("SELECT RELEASE_LOCK('zw_crm')"); }
}

/* ---------- identificadores ---------- */

const PREFIJO = [
  'USUARIOS' => 'U', 'CLIENTES' => 'C', 'OPERACIONES' => 'OP', 'COBROS' => 'CO', 'FACTURAS' => 'F',
  'GASTOS' => 'G', 'SEGUIMIENTO' => 'S', 'CAPTACIONES' => 'CA', 'PARTES' => 'P', 'NOMINAS' => 'N', 'JORNADAS' => 'J',
  'BANCO' => 'B', 'VACACIONES' => 'V', 'SESIONES' => 'SE', 'LOG' => 'L',
  'DIRECTORIO' => 'D', 'DIR_VISITAS' => 'DV', 'PUERTAS' => 'PU', 'EQUIPOS' => 'EQ',
  'PROYECTOS' => 'PR', 'ARCHIVOS' => 'AR', 'TAREAS' => 'T', 'CITAS_CAMBIOS' => 'CC', 'CAMBIOS' => 'CB'
];

/** Identificador corto, legible y único: C-000412. */
function nuevoId_(string $nombre): string { return nuevosIds_($nombre, 1)[0]; }

/** Reserva n identificadores seguidos de una vez (con candado). */
function nuevosIds_(string $nombre, int $n): array {
  $cuantos = max(1, $n);
  $clave = 'SEQ_' . $nombre;
  $db = db_();
  $enTransaccion = $db->inTransaction();
  if (!$enTransaccion) $db->beginTransaction();
  try {
    $st = $db->prepare("SELECT `valor` FROM `zw_propiedades` WHERE `clave` = ? FOR UPDATE");
    $st->execute([$clave]);
    $actual = $st->fetchColumn();
    $desde = (int)($actual === false ? 0 : $actual) + 1;
    $db->prepare("INSERT INTO `zw_propiedades` (`clave`, `valor`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `valor` = VALUES(`valor`)")
       ->execute([$clave, (string)($desde + $cuantos - 1)]);
    if (!$enTransaccion) $db->commit();
  } catch (Throwable $e) { if (!$enTransaccion) $db->rollBack(); throw $e; }
  $pref = (PREFIJO[$nombre] ?? 'X') . '-';
  $ids = [];
  for ($i = 0; $i < $cuantos; $i++) $ids[] = $pref . str_pad((string)($desde + $i), 6, '0', STR_PAD_LEFT);
  return $ids;
}

/* ---------- fechas y números ---------- */

function zonaHoraria_(): string { return 'Europe/Madrid'; }

function tz_(): DateTimeZone { static $z = null; return $z ?? ($z = new DateTimeZone('Europe/Madrid')); }

/* El «ahora» se puede fijar en las pruebas. */
$GLOBALS['ZW_AHORA'] = null;
function ahoraDT_(): DateTime {
  if ($GLOBALS['ZW_AHORA'] instanceof DateTime) return clone $GLOBALS['ZW_AHORA'];
  return new DateTime('now', tz_());
}

function hoyISO_(): string { return ahoraDT_()->format('Y-m-d'); }

function ahora_(): string { return ahoraDT_()->format('Y-m-d H:i:s'); }

/** Formatea una fecha (DateTime o marca de la hoja) con un patrón de Java/Apps Script. */
function formatearFecha_($d, string $patron): string {
  if (!($d instanceof DateTimeInterface)) $d = instante_($d) ?? ahoraDT_();
  $d = (clone $d)->setTimezone(tz_());
  /* Traducción de los patrones que usa el CRM. */
  $map = ['yyyy' => 'Y', 'MM' => 'm', 'dd' => 'd', 'HH' => 'H', 'mm' => 'i', 'ss' => 's', 'EEEE' => 'l', 'EEE' => 'D', 'MMMM' => 'F', 'MMM' => 'M', 'yy' => 'y', 'd' => 'j', 'M' => 'n', 'H' => 'G'];
  $out = '';
  $i = 0; $n = strlen($patron);
  while ($i < $n) {
    $ch = $patron[$i];
    if ($ch === "'") { $j = strpos($patron, "'", $i + 1); $out .= substr($patron, $i + 1, ($j === false ? $n : $j) - $i - 1); $i = ($j === false ? $n : $j + 1); continue; }
    if (ctype_alpha($ch)) {
      $j = $i; while ($j < $n && $patron[$j] === $ch) $j++;
      $tok = substr($patron, $i, $j - $i);
      $out .= isset($map[$tok]) ? $d->format($map[$tok]) : $tok;
      $i = $j; continue;
    }
    $out .= $ch; $i++;
  }
  return $out;
}

/* Una marca de tiempo a tantos minutos de ahora. Con minutos negativos, hacia atrás. */
function dentroDe_($minutos): string {
  $d = ahoraDT_();
  $seg = (int)round((float)($minutos ?: 0) * 60);
  $d->modify(($seg >= 0 ? '+' : '') . $seg . ' seconds');
  return $d->format('Y-m-d H:i:s');
}

function mesDe_($iso): string { return substr((string)($iso ?? ''), 0, 7); }

/** Una fecha ISO (solo el día) como DateTime a medianoche, o null. */
function fecha_($iso): ?DateTime {
  $s = substr((string)($iso ?? ''), 0, 10);
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return null;
  $d = DateTime::createFromFormat('!Y-m-d', $s, tz_());
  return $d ?: null;
}

function diasEntre_($isoA, $isoB): ?int {
  $a = fecha_($isoA); $b = fecha_($isoB);
  if (!$a || !$b) return null;
  return (int)round(($b->getTimestamp() - $a->getTimestamp()) / 86400);
}

function sumarDias_($iso, $dias): string {
  $d = fecha_($iso);
  if (!$d) return '';
  $n = (int)($dias ?: 0);
  $d->modify(($n >= 0 ? '+' : '') . $n . ' days');
  return $d->format('Y-m-d');
}

/** Convierte a número lo que venga: "12.345,67 €" -> 12345.67 */
function num_($v): float|int {
  if (is_int($v) || is_float($v)) return is_finite($v) ? $v : 0;
  if (is_bool($v)) return $v ? 1 : 0;
  $s = trim(preg_replace('/[^\d,.\-]/', '', (string)($v ?? '')));
  if ($s === '') return 0;
  if (strpos($s, ',') !== false && strpos($s, '.') !== false) {
    $s = strrpos($s, ',') > strrpos($s, '.') ? str_replace(',', '.', str_replace('.', '', $s)) : str_replace(',', '', $s);
  } elseif (strpos($s, ',') !== false) {
    $s = preg_replace('/,/', '.', $s, 1);
  }
  if (!is_numeric($s)) {
    /* parseFloat se queda con el principio que sea número */
    if (preg_match('/^-?\d*\.?\d+/', $s, $m) || preg_match('/^-?\d+/', $s, $m)) $s = $m[0]; else return 0;
  }
  $n = (float)$s;
  if (!is_finite($n)) return 0;
  return (floor($n) == $n && abs($n) < PHP_INT_MAX) ? (int)$n : $n;
}

function txt_($v): string {
  if ($v === null) return '';
  if (is_bool($v)) return $v ? 'true' : 'false';
  if (is_array($v)) return json_encode($v, JSON_UNESCAPED_UNICODE);
  return trim(valorCelda_($v));
}

function normal_($v): string {
  $s = mb_strtolower(txt_($v), 'UTF-8');
  if (class_exists('Normalizer')) {
    $s = Normalizer::normalize($s, Normalizer::FORM_D);
    $s = preg_replace('/[\x{0300}-\x{036f}]/u', '', $s);
  } else {
    $s = strtr($s, ['á'=>'a','é'=>'e','í'=>'i','ó'=>'o','ú'=>'u','ü'=>'u','ñ'=>'n','à'=>'a','è'=>'e','ì'=>'i','ò'=>'o','ù'=>'u','ç'=>'c']);
  }
  return preg_replace('/\s+/', ' ', $s);
}

function redondear_($n, $d = 2): float|int {
  $f = pow(10, $d === null ? 2 : $d);
  $r = round(((float)($n ?: 0)) * $f) / $f;
  return (floor($r) == $r && abs($r) < PHP_INT_MAX) ? (int)$r : $r;
}

function pct_($parte, $total): float|int {
  $t = (float)($total ?: 0);
  return $t ? redondear_(((float)($parte ?: 0)) * 100 / $t, 1) : 0;
}

/* ---------- claves y sesiones ---------- */

const ALFABETO = 'abcdefghijkmnopqrstuvwxyz23456789ACDEFGHJKLMNPQRSTUVWXYZ';

/** Clave de 10 caracteres, números y letras, sin los que se confunden. */
function claveAleatoria_($largo = null): string {
  $n = $largo ?: LARGO_CLAVE;
  $s = '';
  $L = strlen(ALFABETO);
  for ($i = 0; $i < $n; $i++) $s .= ALFABETO[random_int(0, $L - 1)];
  if (!preg_match('/\d/', $s)) $s = '2' . substr($s, 1);
  if (!preg_match('/[a-zA-Z]/', $s)) $s = substr($s, 0, -1) . 'k';
  return $s;
}

function uuidHex_(): string { return bin2hex(random_bytes(16)); }

function sal_(): string { return substr(uuidHex_(), 0, 16); }

/* El hash de una clave, dándole «vueltas» pasadas de SHA-256. Es el mismo
   cálculo que en Apps Script, byte a byte: las claves guardadas siguen valiendo. */
function hash_($clave, $sal, $vueltas = null): string {
  $n = max(1, (int)floor((float)($vueltas ?: 0))) ?: 1;
  $v = 'zw|' . $sal . '|' . $clave;
  for ($i = 0; $i < $n; $i++) $v = hash('sha256', $v);
  return $v;
}

function igualSecreto_($a, $b): bool {
  return hash_equals((string)($a ?? ''), (string)($b ?? ''));
}

/* Una marca de tiempo de la hoja («2026-10-07 09:14:22») como fecha de verdad. */
function instante_($marca): ?DateTime {
  $s = txt_($marca);
  if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/', $s, $m)) return null;
  $d = new DateTime('now', tz_());
  $d->setDate((int)$m[1], (int)$m[2], (int)$m[3]);
  $d->setTime((int)($m[4] ?? 0), (int)($m[5] ?? 0), (int)($m[6] ?? 0));
  return $d;
}

/* Minutos transcurridos desde una marca de tiempo. */
function minutosDesde_($marca): float {
  $f = instante_($marca);
  if (!$f) return 0;
  return (ahoraDT_()->getTimestamp() - $f->getTimestamp()) / 60;
}

function token_(): string { return uuidHex_() . substr(uuidHex_(), 0, 8); }

function dormir_(int $ms): void { if (empty($GLOBALS['ZW_PRUEBAS'])) usleep($ms * 1000); }

/* ---------- registro de actividad ---------- */

/* Cada acción que cambia algo lo cuenta aquí. Lo implementa registro.php. */
function registrar_($usuario, $accion, $entidad, $entidadId, $detalle): void {
  apuntarLog_(['usuario' => $usuario, 'accion' => $accion, 'entidad' => $entidad,
               'entidadId' => $entidadId, 'detalle' => $detalle]);
}

/* ---------- configuración ---------- */

$GLOBALS['ZW_CONFIG_CACHE'] = null;
function config_(): array {
  if (is_array($GLOBALS['ZW_CONFIG_CACHE'])) return $GLOBALS['ZW_CONFIG_CACHE'];
  $c = [];
  foreach (leer_('CONFIG') as $r) $c[(string)$r['clave']] = $r['valor'];
  $GLOBALS['ZW_CONFIG_CACHE'] = $c;
  return $c;
}

function olvidarConfig_(): void { $GLOBALS['ZW_CONFIG_CACHE'] = null; olvidarTabla_('CONFIG'); }

function configNum_(string $clave, $porDefecto = 0): float|int {
  $c = config_();
  return (!isset($c[$clave]) || $c[$clave] === '') ? num_($porDefecto ?: 0) : num_($c[$clave]);
}

/** Cambia (o crea) una clave de configuración. */
function escribirConfig_(string $clave, $valor, string $descripcion = ''): void {
  $f = buscar1_('CONFIG', fn($x) => (string)$x['clave'] === $clave);
  if ($f) escribirFila_('CONFIG', $f['_fila'], ['valor' => $valor]);
  else insertar_('CONFIG', ['clave' => $clave, 'valor' => $valor, 'descripcion' => $descripcion]);
  olvidarConfig_();
}

/* ---------- ayudas de traducción JS → PHP ---------- */

/** JSON como lo escribe JavaScript (sin escapar barras ni unicode). */
function aJson_($v): string {
  return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION | JSON_INVALID_UTF8_SUBSTITUTE);
}

/** JSON.parse tolerante: devuelve $porDefecto si no es válido. */
function deJson_($s, $porDefecto = null) {
  if (is_array($s)) return $s;
  $v = json_decode((string)$s, true);
  return $v === null ? $porDefecto : $v;
}

/** Equivalente a `String(a) === String(b)` de JS. */
function mismo_($a, $b): bool { return txt_($a) === txt_($b); }

/** `Object.assign({}, ...)` */
function unir_(array ...$arrays): array { return array_merge(...$arrays); }

/** `localeCompare` para ordenar textos. */
function comparar_($a, $b): int { return strcoll(txt_($a), txt_($b)); }

/** `lista.sort(fn)` devolviendo la lista (sort en JS ordena en sitio). */
function ordenar_(array $lista, callable $fn): array { usort($lista, $fn); return $lista; }

/** `str.split(sep)` como en JS (sin eliminar vacíos). */
function partir_($s, string $sep): array { return $sep === '' ? preg_split('//u', txt_($s), -1, PREG_SPLIT_NO_EMPTY) : explode($sep, txt_($s)); }

/** `str.slice(a, b)` */
function trozo_($s, int $a, ?int $b = null): string {
  $s = txt_($s);
  $n = mb_strlen($s);
  if ($a < 0) $a = max(0, $n + $a);
  if ($b === null) return mb_substr($s, $a);
  if ($b < 0) $b = max(0, $n + $b);
  return $b <= $a ? '' : mb_substr($s, $a, $b - $a);
}

/** Primer nombre: `txt.split(' ')[0]` */
function primerNombre_($s): string { return explode(' ', txt_($s))[0]; }

/** `encodeURIComponent` */
function uriComp_($s): string { return rawurlencode(txt_($s)); }

/** Hora actual en milisegundos (Date.now()). */
function msAhora_(): int { return (int)floor(ahoraDT_()->format('U.u') * 1000); }
