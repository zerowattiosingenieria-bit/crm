<?php
/**
 * proyectos.php (= 18_Proyectos.gs) — La carpeta de cada cliente y el proyecto que sale de ella.
 *
 * El comercial, desde la ficha del cliente, escribe de qué va el proyecto y
 * sube las fotos de la casa y los PDF que hagan falta (factura de la luz,
 * catastro, lo que sea). En cuanto hay descripción y al menos una foto, el
 * proyecto entra solo en la cola del Centro de Mando y llega un aviso por
 * correo. Cuando allí se monta, el PDF del proyecto vuelve a esta misma
 * pantalla y el comercial lo ve y se lo puede descargar.
 *
 * Quién ve qué: exactamente lo mismo que el resto de la ficha. El comercial
 * ve lo de sus clientes y la dirección lo ve todo.
 *
 * Excepción: los documentos de clase «direccion» (p. ej. el resumen de los
 * CAE con el dinero de cada cliente) solo los ven, suben, descargan y quitan
 * quienes tienen alcance «todo». Al resto ni siquiera les llega que existen.
 */

require_once __DIR__ . '/base.php';
require_once __DIR__ . '/google.php';

/* Constantes que en Apps Script viven en 14_ResumenSemanal.gs; aquí se
   definen solo si resumen_semanal.php no las ha definido antes. */
if (!defined('LOGO_CORREO')) define('LOGO_CORREO', 'https://zerowattiosingenieria-bit.github.io/crm/assets/img/logo-h96.png');
if (!defined('WEB_CRM')) define('WEB_CRM', 'https://zerowattiosingenieria-bit.github.io/crm/');

const CLASES_ARCHIVO = ['foto', 'documento', 'proyecto', 'direccion', 'factura_luz', 'factura_gas',
                        'aceptacion', 'dni'];

/** ¿Puede este usuario saber que existe este archivo? */
function veArchivo_(array $u, array $a): bool {
  return normal_($a['clase'] ?? '') !== 'direccion' || (permisos_($u)['alcance'] ?? '') === 'todo';
}
const TOPE_ARCHIVO_MB = 12;        // lo que aguanta cómodamente una petición
const TOPE_MINIATURA = 24000;      // caracteres de la miniatura guardada en la hoja

/* ---------- la hoja, sin tener que volver a ejecutar instalar() ---------- */

/**
 * En la hoja devolvía la pestaña, creándola con sus columnas si no existía.
 * En MySQL las columnas siempre están (esquema.php): no hay nada que hacer.
 */
function asegurarHoja_(string $nombre): void {}

function asegurarProyectos_(): void {}

/* ---------- las carpetas del Drive ---------- */

/** Id de la carpeta raíz de los proyectos (se busca o se crea). */
function carpetaRaizProyectos_(): string {
  return carpetaDeLaCasa_('ID_CARPETA_PROYECTOS', 'PROYECTOS · CRM ZERO WATTIOS');
}

/** Una carpeta por cliente, con su id guardado en la ficha del proyecto. Devuelve el id. */
function carpetaDeProyecto_(array &$proy, array $cli): string {
  if (txt_($proy['carpeta_id'] ?? '') !== '') {
    if (driveCarpetaExiste_(txt_($proy['carpeta_id']))) return txt_($proy['carpeta_id']);
    /* si no existe, se recrea */
  }
  $nombre = txt_($cli['id'] ?? '') . ' · ' . (txt_($cli['nombre'] ?? '') !== '' ? txt_($cli['nombre']) : 'sin nombre');
  $carpetaId = driveCrearCarpeta_($nombre, carpetaRaizProyectos_());
  actualizar_('PROYECTOS', $proy['id'], ['carpeta_id' => $carpetaId]);
  $proy['carpeta_id'] = $carpetaId;
  return $carpetaId;
}

/* ---------- utilidades ---------- */

function clienteVisible_(array $u, $clienteId): array {
  $cli = buscar1_('CLIENTES', fn($c) => mismo_($c['id'], $clienteId));
  if (!$cli) return ['error' => 'No existe ese cliente.'];
  if (!veCliente_($u, $cli)) return ['error' => 'Ese cliente no es tuyo.'];
  return ['cliente' => $cli];
}

/** La ficha de proyecto del cliente; se crea en blanco la primera vez. */
function proyectoDe_(array $cli, array $u): array {
  asegurarProyectos_();
  $ya = buscar1_('PROYECTOS', fn($x) => mismo_($x['cliente_id'], $cli['id']));
  if ($ya) return $ya;
  return insertar_('PROYECTOS', ['cliente_id' => $cli['id'], 'descripcion' => '', 'estado' => 'borrador',
    'creado' => ahora_(), 'creado_por' => $u['id']]);
}

function archivosDe_($clienteId): array {
  return filtrar_('ARCHIVOS', fn($a) => mismo_($a['cliente_id'], $clienteId));
}

/**
 * La regla de la cola: con descripción y al menos una foto, el proyecto se
 * pide solo. Nadie tiene que acordarse de pulsar nada.
 *
 * Y lo mismo al revés: si el proyecto estaba parado esperando datos y el
 * comercial acaba de subir o escribir algo, vuelve solo a la cola y se
 * borra la lista de lo que faltaba.
 */
function revisarCola_(array $proy, array $cli, array $u): array {
  $estado = normal_($proy['estado'] ?? '');
  if ($estado !== 'borrador' && $estado !== 'faltan_datos') return $proy;
  $fotos = array_values(array_filter(archivosDe_($cli['id']), fn($a) => normal_($a['clase']) === 'foto'));
  if (txt_($proy['descripcion'] ?? '') === '' || !count($fotos)) return $proy;
  $r = actualizar_('PROYECTOS', $proy['id'], ['estado' => 'pedido', 'faltan' => '',
    'pedido' => ahora_(), 'pedido_por' => $u['id']]);
  registrar_($u, $estado === 'faltan_datos' ? 'proyecto_completado' : 'proyecto_pedido',
    'PROYECTOS', $proy['id'], $cli['nombre'] ?? '');
  avisarProyectoPedido_($r, $cli, $u, count($fotos));
  return $r;
}

function correoDeAvisos_(): string {
  $cfg = config_();
  if (txt_($cfg['resumen_a'] ?? '') !== '') return txt_($cfg['resumen_a']);
  $jefes = filtrar_('USUARIOS', fn($x) => in_array(normal_($x['rol']), ['superadmin', 'admin'], true) && txt_($x['email']) !== '');
  return implode(',', array_map(fn($x) => txt_($x['email']), $jefes));
}

function avisarProyectoPedido_(array $proy, array $cli, array $u, int $nFotos): void {
  $destino = correoDeAvisos_();
  if ($destino === '') return;
  $archivos = archivosDe_($cli['id']);
  $html =
    '<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f6f3;padding:22px">' .
    '<div style="max-width:620px;margin:auto;background:#fff;border:1px solid #e3e7e0;border-radius:10px">' .
    '<div style="padding:16px 22px;background:#242422;color:#B4FA1E;font-weight:700">' .
    'Proyecto pedido · ' . txt_($cli['nombre']) . '</div>' .
    '<div style="padding:18px 22px;color:#17191c;font-size:13.5px;line-height:1.5">' .
    '<p style="margin:0 0 10px"><b>' . txt_($cli['nombre']) . '</b><br>' .
    txt_($cli['direccion']) . (txt_($cli['municipio']) !== '' ? ', ' . txt_($cli['municipio']) : '') . '</p>' .
    '<p style="margin:0 0 10px">Lo pide ' . txt_($u['nombre'] ?? '') . ' · ' .
    $nFotos . ' foto(s) y ' . (count($archivos) - $nFotos) . ' documento(s).</p>' .
    '<p style="margin:0 0 14px;white-space:pre-wrap;background:#fafbf9;border:1px solid #e3e7e0;' .
    'border-radius:8px;padding:12px">' . txt_($proy['descripcion']) . '</p>' .
    '<p style="margin:0"><a href="' . WEB_CRM . '#cliente/' . txt_($cli['id']) .
    '" style="color:#17191c;font-weight:600">Abrir la ficha en el CRM</a></p>' .
    '</div>' .
    '<div style="padding:14px 22px;border-top:1px solid #e3e7e0;color:#8b918a;font-size:11.5px">' .
    'ZERO WATTIOS INGENIERÍA, S.L. · Correo automático del CRM, no hace falta contestar.' .
    '</div></div></div>';
  try {
    correo_(['to' => $destino, 'subject' => 'Proyecto pedido · ' . txt_($cli['nombre']),
             'htmlBody' => $html, 'name' => 'CRM ZERO WATTIOS']);
  } catch (Throwable $e) { /* si el correo falla, el proyecto se queda pedido igual */ }
}

function avisarProyectoEntregado_(array $proy, array $cli): void {
  $com = buscar1_('USUARIOS', fn($x) => mismo_($x['id'], $cli['comercial_id'] ?? ''));
  $destino = ($com && txt_($com['email']) !== '') ? txt_($com['email']) : correoDeAvisos_();
  if ($destino === '') return;
  $html =
    '<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f6f3;padding:22px">' .
    '<div style="max-width:620px;margin:auto;background:#fff;border:1px solid #e3e7e0;border-radius:10px">' .
    '<div style="padding:16px 22px;background:#242422;color:#B4FA1E;font-weight:700">' .
    'Proyecto listo · ' . txt_($cli['nombre']) . '</div>' .
    '<div style="padding:18px 22px;color:#17191c;font-size:13.5px;line-height:1.5">' .
    '<p style="margin:0 0 12px">Ya tienes el proyecto de <b>' . txt_($cli['nombre']) .
    '</b> en su ficha del CRM, listo para descargar y enviar.</p>' .
    '<p style="margin:0"><a href="' . WEB_CRM . '#cliente/' . txt_($cli['id']) .
    '" style="color:#17191c;font-weight:600">Abrir la ficha</a></p>' .
    '</div></div></div>';
  try {
    correo_(['to' => $destino, 'subject' => 'Proyecto listo · ' . txt_($cli['nombre']),
             'htmlBody' => $html, 'name' => 'CRM ZERO WATTIOS']);
  } catch (Throwable $e) { /* igual que arriba: el aviso es un extra */ }
}

function sinDatos_(array $a): array {
  return ['id' => $a['id'] ?? '', 'cliente_id' => $a['cliente_id'] ?? '', 'clase' => $a['clase'] ?? '', 'nombre' => $a['nombre'] ?? '',
          'mime' => $a['mime'] ?? '', 'bytes' => $a['bytes'] ?? '', 'subido' => $a['subido'] ?? '', 'subido_por' => $a['subido_por'] ?? '',
          'miniatura' => $a['miniatura'] ?? '', 'notas' => $a['notas'] ?? ''];
}

/* ---------- acciones ---------- */

/** Todo lo que hay que pintar en la pestaña Proyecto de un cliente. */
function accProyecto_(array $u, array $p): array {
  $v = clienteVisible_($u, $p['cliente_id'] ?? '');
  if (isset($v['error'])) return ['ok' => false, 'error' => $v['error']];
  $proy = proyectoDe_($v['cliente'], $u);
  $archivos = array_map('sinDatos_', array_values(array_filter(archivosDe_($v['cliente']['id']), fn($a) => veArchivo_($u, $a))));
  $archivos = ordenar_($archivos, fn($a, $b) => comparar_(txt_($b['subido']), txt_($a['subido'])));
  return ['ok' => true, 'proyecto' => $proy,
          'archivos' => $archivos,
          'historial' => historialProyecto_($u, $proy, $v['cliente'])];
}

/* Control de versiones del proyecto (30/10/2026): qué se ha cambiado, cuándo
   y quién, sacado del registro. Las versiones del PDF son los archivos de
   clase «proyecto», que ya llegan todos en «archivos». */
const ACCIONES_PROYECTO = [
  'guardar_proyecto' => 'Descripción o ficha actualizada',
  'entregar_proyecto' => 'Nueva versión del proyecto (PDF)',
  'estado_proyecto' => 'Cambio de estado',
  'proyecto_enviado' => 'Enviado al cliente',
  'proyecto_no_enviado' => 'Envío deshecho',
  'subir_archivo' => 'Archivo subido'
];
function historialProyecto_(array $u, array $proy, array $cli): array {
  try {
    $suyos = [];
    foreach (archivosDe_($cli['id']) as $a) { if (veArchivo_($u, $a)) $suyos[txt_($a['id'])] = true; }
    $nombres = [];
    foreach (leer_('USUARIOS') as $x) $nombres[txt_($x['id'])] = txt_($x['nombre']);
    $lista = array_values(array_filter(leer_('LOG'), function ($l) use ($suyos, $proy) {
      $acc = txt_($l['accion']);
      if (!isset(ACCIONES_PROYECTO[$acc])) return false;
      if ($acc === 'subir_archivo') return !empty($suyos[txt_($l['entidad_id'])]);
      return mismo_($l['entidad_id'], $proy['id']);
    }));
    $lista = array_map(function ($l) use ($nombres) {
      $acc = txt_($l['accion']);
      $sinDetalle = $acc === 'guardar_proyecto' || $acc === 'proyecto_enviado' || $acc === 'proyecto_no_enviado';
      $trozos = partir_($l['detalle'], ' · ');
      $det = $acc === 'entregar_proyecto' ? (string)end($trozos) : txt_($l['detalle']);
      $quien = $nombres[txt_($l['usuario_id'])] ?? '';
      return ['fecha' => txt_($l['fecha']), 'quien' => $quien !== '' ? $quien : txt_($l['usuario']),
              'que' => ACCIONES_PROYECTO[$acc],
              'detalle' => $sinDetalle ? '' : trozo_($det, 0, 160)];
    }, $lista);
    $lista = ordenar_($lista, fn($a, $b) => comparar_($b['fecha'], $a['fecha']));
    return array_slice($lista, 0, 150);
  } catch (Throwable $e) { return []; }
}

/** Guarda la descripción del proyecto (y mira si ya se puede pedir). */
function accGuardarProyecto_(array $u, array $p): array {
  $v = clienteVisible_($u, $p['cliente_id'] ?? '');
  if (isset($v['error'])) return ['ok' => false, 'error' => $v['error']];
  $proy = proyectoDe_($v['cliente'], $u);
  $cambios = ['descripcion' => txt_($p['descripcion'] ?? ''), 'modificado' => ahora_(), 'modificado_por' => $u['id']];
  if (txt_($p['notas'] ?? '') !== '') $cambios['notas'] = txt_($p['notas']);
  $proy = actualizar_('PROYECTOS', $proy['id'], $cambios);
  registrar_($u, 'guardar_proyecto', 'PROYECTOS', $proy['id'], $v['cliente']['nombre']);
  $proy = revisarCola_($proy, $v['cliente'], $u);
  return ['ok' => true, 'proyecto' => $proy];
}

/** Sube una foto o un documento a la carpeta del cliente. */
function accSubirArchivo_(array $u, array $p): array {
  $v = clienteVisible_($u, $p['cliente_id'] ?? '');
  if (isset($v['error'])) return ['ok' => false, 'error' => $v['error']];
  $datos = txt_($p['datos'] ?? '');
  if ($datos === '') return ['ok' => false, 'error' => 'No ha llegado el archivo.'];
  if (strlen($datos) > TOPE_ARCHIVO_MB * 1024 * 1024) {
    return ['ok' => false, 'error' => 'El archivo pasa de ' . TOPE_ARCHIVO_MB . ' MB.'];
  }
  $clase = in_array(normal_($p['clase'] ?? ''), CLASES_ARCHIVO, true) ? normal_($p['clase'] ?? '') : 'documento';
  if ($clase === 'proyecto') return ['ok' => false, 'error' => 'El proyecto lo sube la dirección.'];
  if ($clase === 'direccion' && (permisos_($u)['alcance'] ?? '') !== 'todo') {
    return ['ok' => false, 'error' => 'Los documentos de dirección solo los sube la dirección.'];
  }

  $proy = proyectoDe_($v['cliente'], $u);
  $carpetaId = carpetaDeProyecto_($proy, $v['cliente']);
  $nombre = txt_($p['nombre'] ?? '') !== '' ? txt_($p['nombre']) : ('archivo-' . hoyISO_());
  $mime = txt_($p['mime'] ?? '') !== '' ? txt_($p['mime']) : 'application/octet-stream';
  $archivo = driveSubir_($carpetaId, $nombre, $datos, $mime);

  $fila = insertar_('ARCHIVOS', [
    'cliente_id' => $v['cliente']['id'], 'proyecto_id' => $proy['id'], 'clase' => $clase, 'nombre' => $nombre,
    'archivo_id' => $archivo['id'] ?? '', 'mime' => $mime, 'bytes' => $archivo['bytes'] ?? 0,
    'miniatura' => trozo_($p['miniatura'] ?? '', 0, TOPE_MINIATURA),
    'subido_por' => $u['id'], 'subido' => ahora_(), 'notas' => txt_($p['notas'] ?? '')]);
  registrar_($u, 'subir_archivo', 'ARCHIVOS', $fila['id'], $v['cliente']['nombre'] . ' · ' . $nombre);

  $proy = revisarCola_($proy, $v['cliente'], $u);
  return ['ok' => true, 'archivo' => sinDatos_($fila), 'proyecto' => $proy];
}

/** Devuelve el archivo en base64 para verlo o descargarlo. */
function accDescargarArchivo_(array $u, array $p): array {
  asegurarProyectos_();
  $a = buscar1_('ARCHIVOS', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$a || !veArchivo_($u, $a)) return ['ok' => false, 'error' => 'No existe ese archivo.'];
  $v = clienteVisible_($u, $a['cliente_id']);
  if (isset($v['error'])) return ['ok' => false, 'error' => $v['error']];
  try { $archivo = driveDescargar_(txt_($a['archivo_id'])); }
  catch (Throwable $e) { return ['ok' => false, 'error' => 'El archivo ya no está en el Drive de la empresa.']; }
  return ['ok' => true, 'nombre' => txt_($a['nombre']) !== '' ? txt_($a['nombre']) : ($archivo['nombre'] ?? ''),
          'mime' => $archivo['mime'] ?? '',
          'datos' => $archivo['base64'] ?? ''];
}

/** Quita un archivo: quien lo subió o la dirección. */
function accBorrarArchivo_(array $u, array $p): array {
  asegurarProyectos_();
  $a = buscar1_('ARCHIVOS', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$a || !veArchivo_($u, $a)) return ['ok' => false, 'error' => 'No existe ese archivo.'];
  $v = clienteVisible_($u, $a['cliente_id']);
  if (isset($v['error'])) return ['ok' => false, 'error' => $v['error']];
  if (!mismo_($a['subido_por'], $u['id']) && empty(permisos_($u)['editarTodo'])) {
    return ['ok' => false, 'error' => 'Ese archivo lo subió otra persona.'];
  }
  if (normal_($a['clase']) === 'proyecto' && empty(permisos_($u)['editarTodo'])) {
    return ['ok' => false, 'error' => 'El proyecto solo lo quita la dirección.'];
  }
  try { driveBorrar_(txt_($a['archivo_id'])); } catch (Throwable $e) {}
  borrar_('ARCHIVOS', $a['id']);
  registrar_($u, 'borrar_archivo', 'ARCHIVOS', $a['id'], txt_($a['nombre']));
  return ['ok' => true];
}

/**
 * La vuelta: el Centro de Mando deja aquí el PDF del proyecto y el comercial
 * lo ve en la ficha. Solo dirección.
 */
function accEntregarProyecto_(array $u, array $p): array {
  exigir_($u, 'editarTodo');
  $v = clienteVisible_($u, $p['cliente_id'] ?? '');
  if (isset($v['error'])) return ['ok' => false, 'error' => $v['error']];
  $datos = txt_($p['datos'] ?? '');
  if ($datos === '') return ['ok' => false, 'error' => 'No ha llegado el PDF del proyecto.'];

  $proy = proyectoDe_($v['cliente'], $u);
  $carpetaId = carpetaDeProyecto_($proy, $v['cliente']);
  $nombre = txt_($p['nombre'] ?? '') !== '' ? txt_($p['nombre']) : ('Proyecto_' . txt_($v['cliente']['id']) . '.pdf');
  $mime = txt_($p['mime'] ?? '') !== '' ? txt_($p['mime']) : 'application/pdf';
  $archivo = driveSubir_($carpetaId, $nombre, $datos, $mime);

  /* Si ya había un proyecto entregado, el anterior se queda como histórico:
     no se borra nada, solo deja de ser el vigente. */
  $fila = insertar_('ARCHIVOS', [
    'cliente_id' => $v['cliente']['id'], 'proyecto_id' => $proy['id'], 'clase' => 'proyecto', 'nombre' => $nombre,
    'archivo_id' => $archivo['id'] ?? '', 'mime' => $mime, 'bytes' => $archivo['bytes'] ?? 0,
    'subido_por' => $u['id'], 'subido' => ahora_(), 'notas' => txt_($p['notas'] ?? '')]);

  $proy = actualizar_('PROYECTOS', $proy['id'], ['estado' => 'entregado', 'entregado' => ahora_(),
    'entregado_por' => $u['id'], 'archivo_id' => $fila['id'], 'archivo_nombre' => $nombre]);
  registrar_($u, 'entregar_proyecto', 'PROYECTOS', $proy['id'], $v['cliente']['nombre'] . ' · ' . $nombre);
  avisarProyectoEntregado_($proy, $v['cliente']);
  return ['ok' => true, 'proyecto' => $proy, 'archivo' => sinDatos_($fila)];
}

/**
 * Cambia el estado a mano (ponerlo «en curso», o pararlo porque faltan
 * datos). Solo dirección, que es quien monta los proyectos.
 *
 * Con estado "faltan_datos" se manda además «faltan»: la lista corta de lo
 * que hace falta para poder sacarlo (una frase por cosa, o un array). Eso
 * es justo lo que ve el comercial en su panel y en la ficha del cliente.
 */
function accEstadoProyecto_(array $u, array $p): array {
  exigir_($u, 'editarTodo');
  $v = clienteVisible_($u, $p['cliente_id'] ?? '');
  if (isset($v['error'])) return ['ok' => false, 'error' => $v['error']];
  $estados = ['borrador', 'pedido', 'en_curso', 'faltan_datos', 'entregado', 'enviado', 'cancelado'];
  $estado = normal_($p['estado'] ?? '');
  if (!in_array($estado, $estados, true)) return ['ok' => false, 'error' => 'Ese estado no existe.'];

  $faltanLista = is_array($p['faltan'] ?? null) ? $p['faltan'] : [$p['faltan'] ?? ''];
  $faltan = implode(' · ', array_values(array_filter(array_map(fn($x) => txt_($x), $faltanLista), fn($x) => $x !== '')));
  if ($estado === 'faltan_datos' && $faltan === '') {
    return ['ok' => false, 'error' => 'Di qué falta para poder sacar el proyecto.'];
  }

  $proy = proyectoDe_($v['cliente'], $u);
  $r = actualizar_('PROYECTOS', $proy['id'], ['estado' => $estado,
    'faltan' => $estado === 'faltan_datos' ? trozo_($faltan, 0, 500) : '',
    'modificado' => ahora_(), 'modificado_por' => $u['id']]);
  registrar_($u, 'estado_proyecto', 'PROYECTOS', $proy['id'], $estado . ($faltan !== '' ? ': ' . $faltan : ''));
  if ($estado === 'faltan_datos') avisarFaltanDatos_($r, $v['cliente'], $faltan);
  return ['ok' => true, 'proyecto' => $r];
}

/**
 * «Enviado al cliente»: el comercial dice que ya le ha mandado el proyecto.
 * Esto NO manda nada a nadie; solo deja constancia de cuándo y quién, y el
 * proyecto sale de «listos para enviar». Lo puede marcar el comercial del
 * cliente y la dirección; nadie más (ni captadores ni otros comerciales).
 *
 * Con deshacer: true, la dirección lo devuelve a «entregado» (por si se
 * pulsó sin querer). El comercial no deshace: que lo pida.
 *
 * Y la regla de la casa: a la semana de mandar una propuesta, se llama.
 * Se apunta un seguimiento con ese próximo paso a 7 días, salvo que el
 * cliente ya tenga uno pendiente antes (de hoy a 7 días): ese se respeta.
 */
function accEnviadoProyecto_(array $u, array $p): array {
  $v = clienteVisible_($u, $p['cliente_id'] ?? '');
  if (isset($v['error'])) return ['ok' => false, 'error' => $v['error']];
  $cli = $v['cliente'];
  $per = permisos_($u);
  $suyo = mismo_($cli['comercial_id'], $u['id']);
  if (empty($per['editarTodo']) && !(($u['rol'] ?? '') === 'comercial' && $suyo)) {
    return ['ok' => false, 'error' => 'Solo el comercial del cliente o la dirección pueden marcarlo.'];
  }
  $proy = proyectoDe_($cli, $u);
  $estado = normal_($proy['estado']);

  if (!empty($p['deshacer'])) {
    if (empty($per['editarTodo'])) return ['ok' => false, 'error' => 'Deshacerlo solo puede la dirección.'];
    if ($estado !== 'enviado') return ['ok' => false, 'error' => 'Ese proyecto no está marcado como enviado.'];
    $r = actualizar_('PROYECTOS', $proy['id'], ['estado' => 'entregado', 'enviado' => '', 'enviado_por' => '',
      'modificado' => ahora_(), 'modificado_por' => $u['id']]);
    registrar_($u, 'proyecto_no_enviado', 'PROYECTOS', $proy['id'], etiquetaCliente_($cli));
    return ['ok' => true, 'proyecto' => $r];
  }

  if ($estado === 'enviado') return ['ok' => true, 'proyecto' => $proy, 'ya' => true];
  if ($estado !== 'entregado') {
    return ['ok' => false, 'error' => 'El proyecto todavía no está hecho: no se puede marcar como enviado.'];
  }
  $r = actualizar_('PROYECTOS', $proy['id'], ['estado' => 'enviado', 'enviado' => ahora_(), 'enviado_por' => $u['id'],
    'modificado' => ahora_(), 'modificado_por' => $u['id']]);
  registrar_($u, 'proyecto_enviado', 'PROYECTOS', $proy['id'], etiquetaCliente_($cli));

  /* El recordatorio de llamar a la semana. */
  $llamada = ''; $yaTenia = '';
  try {
    $dentro7 = sumarDias_(hoyISO_(), 7);
    $hay = trozo_($cli['proxima_fecha'] ?? '', 0, 10);
    $antes = $hay !== '' && $hay >= hoyISO_() && $hay <= $dentro7;
    if (!$antes) {
      insertar_('SEGUIMIENTO', ['cliente_id' => $cli['id'], 'operacion_id' => '', 'usuario_id' => $u['id'],
        'fecha' => hoyISO_(), 'canal' => 'email', 'nota' => 'Proyecto enviado al cliente (marcado en el CRM).',
        'proximo_paso' => 'Llamar: seguimiento de la propuesta', 'proxima_fecha' => $dentro7,
        'estado_resultante' => '', 'origen' => 'proyecto_enviado', 'creado' => ahora_()]);
      actualizar_('CLIENTES', $cli['id'], ['proxima_accion' => 'Llamar: seguimiento de la propuesta',
        'proxima_fecha' => $dentro7, 'modificado' => ahora_(), 'modificado_por' => $u['id']]);
      $llamada = $dentro7;
    } else {
      $yaTenia = $hay;
    }
  } catch (Throwable $e) { /* el recordatorio es un extra: el enviado queda igual */ }
  return ['ok' => true, 'proyecto' => $r, 'llamada' => $llamada, 'proximo_ya' => $yaTenia];
}

/* Los clientes se nombran siempre «dirección · nombre». */
function etiquetaCliente_(array $cli): string {
  $partes = array_values(array_filter([txt_($cli['direccion'] ?? ''), txt_($cli['nombre'] ?? '')], fn($s) => $s !== ''));
  $s = implode(' · ', $partes);
  return $s !== '' ? $s : txt_($cli['id'] ?? '');
}

/** Aviso por correo al comercial del cliente cuando el proyecto se para. */
function avisarFaltanDatos_(array $proy, array $cli, string $faltan): void {
  $usuarios = indexar_(leer_('USUARIOS'));
  $comercial = $usuarios[txt_($cli['comercial_id'] ?? '')] ?? [];
  $destino = implode(',', array_values(array_filter([txt_($comercial['email'] ?? ''), correoDeAvisos_()], fn($s) => $s !== '')));
  if ($destino === '') return;
  $html =
    '<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f6f3;padding:22px">' .
    '<div style="max-width:620px;margin:auto;background:#fff;border:1px solid #e3e7e0;border-radius:10px">' .
    '<div style="padding:16px 22px;background:#242422;color:#B4FA1E;font-weight:700">' .
    'Falta algo para sacar el proyecto · ' . txt_($cli['nombre']) . '</div>' .
    '<div style="padding:18px 22px;color:#17191c;font-size:13.5px;line-height:1.5">' .
    '<p style="margin:0 0 10px"><b>' . txt_($cli['nombre']) . '</b><br>' .
    txt_($cli['direccion']) . (txt_($cli['municipio']) !== '' ? ', ' . txt_($cli['municipio']) : '') . '</p>' .
    '<p style="margin:0 0 6px"><b>Qué falta:</b></p><ul style="margin:0 0 12px;padding-left:18px">' .
    implode('', array_map(fn($x) => '<li>' . $x . '</li>', partir_($faltan, ' · '))) . '</ul>' .
    '<p style="margin:0">En cuanto lo subas a la pestaña Proyecto del cliente, vuelve solo a la cola.</p>' .
    '</div></div></div>';
  try {
    correo_(['to' => $destino, 'subject' => 'Proyecto parado: falta algo · ' . txt_($cli['nombre']),
             'htmlBody' => $html]);
  } catch (Throwable $e) { /* si el correo falla, el panel lo sigue enseñando igual */ }
}

/** La cola para el Centro de Mando: lo que está pedido y sin entregar. */
/**
 * La cola de proyectos. La dirección la ve entera; un comercial, solo la de
 * sus clientes; los captadores no la ven. Sin estado, devuelve los pedidos y
 * los que están en preparación; con estado "entregado", los que ya tienen el
 * PDF y están listos para enviar al cliente; con "faltan_datos", los que
 * están parados esperando algo del comercial.
 */
function accProyectosPendientes_(array $u, array $p): array {
  $per = permisos_($u);
  /* El captador también ve los proyectos ya enviados de los clientes que
     ha captado, para poder descargarlos (orden de Nando, 30/10/2026). */
  $esCaptador = ($per['alcance'] ?? '') === 'captador';
  if (($per['alcance'] ?? '') !== 'todo' && ($u['rol'] ?? '') !== 'comercial' && !$esCaptador) {
    return ['ok' => true, 'proyectos' => []];
  }
  asegurarProyectos_();
  $clientes = [];
  foreach (leer_('CLIENTES') as $c) $clientes[txt_($c['id'])] = $c;
  $usuarios = [];
  foreach (leer_('USUARIOS') as $x) $usuarios[txt_($x['id'])] = txt_($x['nombre']);
  $archivos = leer_('ARCHIVOS');
  $quiero = $esCaptador ? ['enviado']
    : (txt_($p['estado'] ?? '') !== '' ? [normal_($p['estado'])] : ['pedido', 'en_curso']);
  /* Con «dias», solo los enviados en esos últimos días (lo que mira la
     dirección para ver quién ha mandado qué). */
  $desdeEnvio = num_($p['dias'] ?? 0) > 0 ? sumarDias_(hoyISO_(), -num_($p['dias'])) : '';
  $lista = array_values(array_filter(leer_('PROYECTOS'), function ($x) use ($quiero, $desdeEnvio, $clientes, $per, $esCaptador, $u) {
    if (!in_array(normal_($x['estado']), $quiero, true)) return false;
    if ($desdeEnvio !== '' && trozo_($x['enviado'], 0, 10) < $desdeEnvio) return false;
    $c = $clientes[txt_($x['cliente_id'])] ?? null;
    if (!$c) return false;
    if (($per['alcance'] ?? '') === 'todo') return true;
    return $esCaptador ? mismo_($c['captador_id'], $u['id']) : mismo_($c['comercial_id'], $u['id']);
  }));
  $lista = array_map(function ($x) use ($clientes, $usuarios, $archivos, $u) {
    $c = $clientes[txt_($x['cliente_id'])] ?? [];
    $pdfs = array_values(array_filter($archivos, fn($a) => mismo_($a['cliente_id'], $x['cliente_id']) && normal_($a['clase']) === 'proyecto'));
    $pdfs = ordenar_($pdfs, fn($a, $b) => comparar_(txt_($b['subido']), txt_($a['subido'])));
    $pdf = $pdfs[0] ?? null;
    $suyos = array_values(array_filter($archivos, fn($a) => mismo_($a['cliente_id'], $x['cliente_id']) && veArchivo_($u, $a)));
    $cuenta = fn($clase) => count(array_filter($suyos, fn($a) => normal_($a['clase']) === $clase));
    $modificado = txt_($x['modificado']) !== '' ? txt_($x['modificado']) : (txt_($x['pedido']) !== '' ? txt_($x['pedido']) : txt_($x['creado']));
    return ['id' => $x['id'], 'cliente_id' => $x['cliente_id'], 'cliente' => txt_($c['nombre'] ?? ''),
            'direccion' => txt_($c['direccion'] ?? ''), 'municipio' => txt_($c['municipio'] ?? ''),
            'telefono' => txt_($c['telefono'] ?? ''), 'email' => txt_($c['email'] ?? ''),
            'comercial' => $usuarios[txt_($c['comercial_id'] ?? '')] ?? '',
            'descripcion' => txt_($x['descripcion']), 'estado' => txt_($x['estado']), 'pedido' => txt_($x['pedido']),
            'entregado' => txt_($x['entregado']), 'faltan' => txt_($x['faltan']),
            'enviado' => txt_($x['enviado']), 'enviado_por' => $usuarios[txt_($x['enviado_por'])] ?? '',
            'modificado' => $modificado,
            'archivo_id' => $pdf ? $pdf['id'] : '', 'archivo_nombre' => $pdf ? txt_($pdf['nombre']) : '',
            'fotos' => $cuenta('foto'),
            'documentos' => $cuenta('documento'),
            'facturas_luz' => $cuenta('factura_luz'),
            'facturas_gas' => $cuenta('factura_gas'),
            'archivos' => array_values(array_map(fn($a) => ['id' => $a['id'], 'clase' => $a['clase'], 'nombre' => $a['nombre']],
                             array_filter($suyos, fn($a) => normal_($a['clase']) !== 'proyecto')))];
  }, $lista);
  /* Los listos para enviar, el más reciente primero; la cola, el más viejo. */
  $lista = ordenar_($lista, function ($a, $b) {
    if (normal_($a['estado']) === 'enviado') return comparar_(txt_($b['enviado']), txt_($a['enviado']));
    return normal_($a['estado']) === 'entregado'
      ? comparar_(txt_($b['entregado']), txt_($a['entregado']))
      : comparar_(txt_($a['pedido']), txt_($b['pedido']));
  });
  return ['ok' => true, 'proyectos' => $lista];
}
