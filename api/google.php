<?php
/**
 * google.php — Lo que sigue haciendo Google: Drive, correo y mapas.
 *
 * El CRM vive en MySQL, pero las fotos, facturas, DNIs y nóminas se siguen
 * guardando en el Drive de la empresa y los correos salen desde la cuenta
 * de Google. Para eso el proyecto de Apps Script de siempre se queda como
 * «servicio»: este archivo le pide las cosas con una llave secreta y él
 * las hace (ver apps-script/30_Servicio.gs).
 *
 * Dónde está y con qué llave: propiedades GOOGLE_URL y GOOGLE_LLAVE
 * (zw_propiedades), que pone instalar.php. En las pruebas se sustituye
 * $GLOBALS['ZW_GOOGLE'] por un simulador.
 */

require_once __DIR__ . '/base.php';

$GLOBALS['ZW_GOOGLE'] = $GLOBALS['ZW_GOOGLE'] ?? null;   // callable(servicio, params) => array, para pruebas

/** Llama al servicio de Google. Devuelve el array de respuesta o lanza Exception. */
function googleServicio_(string $servicio, array $params = []): array {
  if (is_callable($GLOBALS['ZW_GOOGLE'])) return ($GLOBALS['ZW_GOOGLE'])($servicio, $params);
  $url = prop_('GOOGLE_URL'); $llave = prop_('GOOGLE_LLAVE');
  if (!$url || !$llave) throw new Exception('El servicio de Google (Drive y correo) no está configurado.');
  $cuerpo = aJson_(array_merge($params, ['accion' => 'servicio', 'servicio' => $servicio, 'llave' => $llave]));
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_POST => true, CURLOPT_POSTFIELDS => $cuerpo,
    CURLOPT_HTTPHEADER => ['Content-Type: text/plain;charset=utf-8'],
    CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 5,
    CURLOPT_CONNECTTIMEOUT => 15, CURLOPT_TIMEOUT => 120,
  ]);
  $texto = curl_exec($ch);
  $err = curl_error($ch);
  $codigo = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  curl_close($ch);
  if ($texto === false) throw new Exception('No hay conexión con el servicio de Google: ' . $err);
  $d = json_decode($texto, true);
  if (!is_array($d)) throw new Exception('Respuesta ilegible del servicio de Google (' . $codigo . ').');
  if (empty($d['ok'])) throw new Exception($d['error'] ?? 'El servicio de Google ha fallado.');
  return $d;
}

/* ---------- Drive ---------- */

/** Busca (por nombre, dentro de una carpeta si se dice) o crea una carpeta. Devuelve su id. */
function driveCarpeta_(string $nombre, string $padreId = '', bool $crear = true): string {
  $r = googleServicio_('driveCarpeta', ['nombre' => $nombre, 'padre' => $padreId, 'crear' => $crear]);
  return (string)($r['id'] ?? '');
}

/** Crea una carpeta nueva (siempre) dentro de otra. Devuelve su id. */
function driveCrearCarpeta_(string $nombre, string $padreId = ''): string {
  $r = googleServicio_('driveCrearCarpeta', ['nombre' => $nombre, 'padre' => $padreId]);
  return (string)$r['id'];
}

/** ¿Existe (y no está en la papelera) esa carpeta? */
function driveCarpetaExiste_(string $id): bool {
  if ($id === '') return false;
  try { $r = googleServicio_('driveInfo', ['id' => $id]); return !empty($r['existe']) && !empty($r['carpeta']); }
  catch (Throwable $e) { return false; }
}

/**
 * Sube un archivo (contenido en base64). Devuelve
 * ['id','nombre','mime','bytes','url'].
 */
function driveSubir_(string $carpetaId, string $nombre, string $base64, string $mime = 'application/octet-stream'): array {
  return googleServicio_('driveSubir', ['carpeta' => $carpetaId, 'nombre' => $nombre, 'base64' => $base64, 'mime' => $mime]);
}

/** Sube un texto (JSON, CSV…). Devuelve ['id','nombre','mime','bytes','url']. */
function driveSubirTexto_(string $carpetaId, string $nombre, string $texto, string $mime = 'text/plain'): array {
  return driveSubir_($carpetaId, $nombre, base64_encode($texto), $mime);
}

/** Descarga un archivo: ['nombre','mime','bytes','base64']. Lanza Exception si no está. */
function driveDescargar_(string $id): array {
  return googleServicio_('driveDescargar', ['id' => $id]);
}

/** Información de un archivo o carpeta: ['existe','carpeta','nombre','mime','bytes','creado','url']. */
function driveInfo_(string $id): array {
  return googleServicio_('driveInfo', ['id' => $id]);
}

/** Manda a la papelera. Nunca lanza: si ya no está, no pasa nada. */
function driveBorrar_(string $id): bool {
  if ($id === '') return false;
  try { googleServicio_('driveBorrar', ['id' => $id]); return true; } catch (Throwable $e) { return false; }
}

/** Archivos de una carpeta: lista de ['id','nombre','mime','bytes','creado','url']. */
function driveListar_(string $carpetaId): array {
  return googleServicio_('driveListar', ['carpeta' => $carpetaId])['archivos'] ?? [];
}

/** Archivos con ese nombre en todo el Drive: misma forma que driveListar_. */
function driveBuscarPorNombre_(string $nombre): array {
  return googleServicio_('driveBuscar', ['nombre' => $nombre])['archivos'] ?? [];
}

/** El texto de un archivo de Drive (JSON, CSV…). */
function driveLeerTexto_(string $id): string {
  $r = driveDescargar_($id);
  return base64_decode($r['base64'] ?? '') ?: '';
}

/* Carpetas «de la casa» que antes se guardaban en las propiedades del script. */
function carpetaDeLaCasa_(string $propiedad, string $nombre, bool $bajoEmpresa = false): string {
  $id = prop_($propiedad);
  if ($id && driveCarpetaExiste_($id)) return $id;
  $padre = '';
  if ($bajoEmpresa) { try { $padre = driveCarpeta_('ZERO WATTIOS', '', false); } catch (Throwable $e) { $padre = ''; } }
  $id = driveCarpeta_($nombre, $padre, true);
  setProp_($propiedad, $id);
  return $id;
}

/* ---------- correo ---------- */

/**
 * Envía un correo desde la cuenta de la empresa. $msg como MailApp.sendEmail:
 * ['to','cc','bcc','subject','body','htmlBody','name','replyTo',
 *  'attachments' => [['nombre','base64','mime'], ...]].
 * En las pruebas se guarda en $GLOBALS['ZW_CORREOS'].
 */
function correo_(array $msg): bool {
  if (!empty($GLOBALS['ZW_PRUEBAS'])) { $GLOBALS['ZW_CORREOS'][] = $msg; return true; }
  googleServicio_('correo', ['mensaje' => $msg]);
  return true;
}

/* ---------- mapas ---------- */

/** Geocodifica una dirección. Devuelve ['status' => 'OK', 'results' => [...]] como Maps.newGeocoder().geocode(). */
function geocodificar_(string $direccion): array {
  return googleServicio_('geocodificar', ['direccion' => $direccion])['resultado'] ?? ['status' => 'ERROR', 'results' => []];
}

/** Ruta en coche. Devuelve el resultado crudo de Maps (routes[0].legs[0].duration.value en segundos) o null. */
function rutaCoche_(string $origen, string $destino): ?array {
  try { return googleServicio_('ruta', ['origen' => $origen, 'destino' => $destino])['resultado'] ?? null; }
  catch (Throwable $e) { return null; }
}

/* ---------- caché corta (CacheService) ---------- */

function cacheLeer_(string $clave): ?string {
  $st = db_()->prepare("SELECT `valor` FROM `zw_propiedades` WHERE `clave` = ?");
  $st->execute(['CACHE_' . $clave]);
  $v = $st->fetchColumn();
  if ($v === false) return null;
  $d = json_decode((string)$v, true);
  if (!is_array($d) || ($d['hasta'] ?? 0) < time()) return null;
  return (string)$d['v'];
}

function cacheGuardar_(string $clave, string $valor, int $segundos): void {
  setProp_('CACHE_' . $clave, aJson_(['v' => $valor, 'hasta' => time() + $segundos]));
}
