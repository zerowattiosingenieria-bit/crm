<?php
/**
 * backup.php (= 12_Backup.gs) — Copia de seguridad semanal.
 *
 * Todos los viernes a las 19:15 se guarda una copia completa de la base
 * de datos en una carpeta del Drive de la empresa: un JSON con todas las
 * tablas (y el Excel, que sigue generando el Apps Script a partir del
 * espejo). Las copias de más de tres meses se borran solas.
 */

require_once __DIR__ . '/base.php';
require_once __DIR__ . '/google.php';

const CARPETA_BACKUP = 'BACKUP CRM ZERO WATTIOS';
const MESES_BACKUP = 3;

/* La carpeta cuelga de "ZERO WATTIOS" en el Drive de la empresa cuando esa
   carpeta existe: así las copias aparecen solas en el ordenador de la
   oficina a través de Google Drive, sin tener que bajarlas a mano.
   Devuelve el id de la carpeta. */
function carpetaBackup_(): string {
  return carpetaDeLaCasa_('ID_CARPETA_BACKUP', CARPETA_BACKUP, true);
}

/**
 * Hace la copia. La ejecuta el disparador de los viernes (cron.php), y
 * también se puede lanzar a mano desde el CRM.
 */
function copiaSeguridad(): array {
  $carpetaId = carpetaBackup_();
  $sello = formatearFecha_(ahoraDT_(), 'yyyy-MM-dd_HH-mm');
  $salida = ['fecha' => ahora_(), 'version' => VERSION, 'archivos' => []];

  /* 1. El libro entero en Excel, que es lo que abre cualquiera. */
  // NOTA PORT: el Excel lo sigue generando el Apps Script a partir del espejo

  /* 2. Un JSON con todas las tablas, por si algún día hay que mudarse. */
  $volcado = ['generado' => ahora_(), 'version' => VERSION, 'tablas' => []];
  foreach (array_keys(ESQUEMA) as $t) {
    if ($t === 'SESIONES') continue;                    // las sesiones no se guardan
    try { $volcado['tablas'][$t] = leer_($t); } catch (Throwable $e) { $volcado['tablas'][$t] = []; }
  }
  $json = driveSubirTexto_($carpetaId, 'CRM_ZERO_WATTIOS_' . $sello . '.json', aJson_($volcado), 'application/json');
  $salida['archivos'][] = ['nombre' => $json['nombre'] ?? ('CRM_ZERO_WATTIOS_' . $sello . '.json'), 'id' => $json['id'] ?? '', 'tipo' => 'json'];

  /* 3. Fuera lo que pase de tres meses. */
  $limite = ahoraDT_();
  $limite->modify('-' . MESES_BACKUP . ' months');
  $borrados = 0;
  foreach (driveListar_($carpetaId) as $f) {
    $creado = instante_($f['creado'] ?? '');
    if ($creado && $creado < $limite) { driveBorrar_((string)($f['id'] ?? '')); $borrados++; }
  }
  $salida['borrados'] = $borrados;

  registrar_(null, 'copia_seguridad', 'BACKUP', $sello,
    count($salida['archivos']) . ' archivo(s), ' . $borrados . ' copia(s) antigua(s) borrada(s)');
  error_log(aJson_($salida));
  return $salida;
}

/**
 * En Apps Script dejaba listos los disparadores de los viernes (resumen
 * semanal a las 18:00, copia de seguridad a las 19:15) y el de los lunes
 * (aviso de puertas a las 8:00).
 */
function instalarDisparadores(): bool {
  // NOTA PORT: la programación la hace cron.php
  //   resumenSemanal()      → viernes 18:00
  //   copiaSeguridad()      → viernes 19:15
  //   avisoPuertasSemana()  → lunes 8:00
  error_log('Disparadores creados: resumen semanal los viernes sobre las 18:00, ' .
    'copia de seguridad sobre las 19:15 y aviso de puertas los lunes sobre las 8:00 ' .
    '(zona horaria del proyecto).');
  return true;
}

/** Lo que hay guardado ahora mismo, para verlo desde el CRM. */
function accCopias_(array $u, array $p): array {
  exigir_($u, 'config');
  $carpetaId = carpetaBackup_();
  $lista = [];
  foreach (driveListar_($carpetaId) as $f) {
    $lista[] = ['id' => $f['id'] ?? '', 'nombre' => $f['nombre'] ?? '', 'url' => $f['url'] ?? '',
      'creado' => formatearFecha_($f['creado'] ?? '', 'yyyy-MM-dd HH:mm'),
      'tamano' => $f['bytes'] ?? 0];
  }
  $lista = ordenar_($lista, fn($a, $b) => comparar_(txt_($b['creado']), txt_($a['creado'])));
  $carpetaUrl = 'https://drive.google.com/drive/folders/' . $carpetaId;
  try { $info = driveInfo_($carpetaId); if (!empty($info['url'])) $carpetaUrl = $info['url']; } catch (Throwable $e) {}
  return ['ok' => true, 'carpeta' => $carpetaUrl, 'copias' => $lista, 'meses' => MESES_BACKUP];
}

/** Lanza una copia a mano desde el CRM. */
function accCopiaAhora_(array $u, array $p): array {
  exigir_($u, 'config');
  $r = copiaSeguridad();
  return ['ok' => true, 'resultado' => $r];
}

/**
 * Devuelve la última copia en base64 para que se pueda guardar fuera de
 * Google (por ejemplo, en el ordenador de la oficina).
 */
function accDescargarCopia_(array $u, array $p): array {
  exigir_($u, 'config');
  $carpetaId = carpetaBackup_();
  $mejor = null;
  foreach (driveListar_($carpetaId) as $f) {
    if (txt_($p['id'] ?? '') !== '' ? ($f['id'] ?? '') === txt_($p['id'])
                                    : (!$mejor || txt_($f['creado'] ?? '') > txt_($mejor['creado'] ?? ''))) $mejor = $f;
  }
  if (!$mejor) return ['ok' => false, 'error' => 'Todavía no hay ninguna copia guardada.'];
  if (num_($mejor['bytes'] ?? 0) > 25 * 1024 * 1024) {
    return ['ok' => false, 'error' => 'La copia pesa demasiado para enviarla por aquí: ' . ($mejor['url'] ?? '')];
  }
  $archivo = driveDescargar_((string)$mejor['id']);
  return ['ok' => true, 'nombre' => $archivo['nombre'] ?? ($mejor['nombre'] ?? ''), 'tipo' => $archivo['mime'] ?? ($mejor['mime'] ?? ''),
          'creado' => formatearFecha_($mejor['creado'] ?? '', 'yyyy-MM-dd HH:mm'),
          'datos' => $archivo['base64'] ?? ''];
}
