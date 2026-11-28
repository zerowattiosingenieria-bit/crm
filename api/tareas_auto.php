<?php
/**
 * tareas_auto.php — Tareas que no se repiten y que se cierran solas.
 *
 * Nando (28/11/2026, mejora 11): había tareas iguales repetidas (cuatro
 * «Apuntar resultado de la visita» de la misma casa) y tareas que seguían
 * abiertas aunque lo que pedían ya estaba hecho (visita apuntada, cliente
 * firmado o perdido).
 *
 *  - claveTarea_: el título sin fechas, horas, paréntesis ni palabras de
 *    relleno. Dos tareas con la misma clave son la misma tarea.
 *  - tareaRepetida_: al crear una tarea nueva, si ya hay una abierta igual
 *    (mismo cliente o sin cliente), se actualiza esa en vez de crear otra.
 *  - cerrarTareasResueltas_: cuando pasa algo que resuelve la tarea (se
 *    apunta la visita, el cliente firma, se pierde, KO…), las tareas abiertas
 *    de ese cliente que pedían eso se marcan como hechas solas.
 *  - tareaSistema_: crea (sin duplicar) una tarea automática con origen.
 */

const TAREA_RELLENO = ['de', 'del', 'la', 'las', 'el', 'los', 'a', 'al', 'y', 'e', 'en', 'con', 'para', 'por', 'o',
  'c', 'cl', 'calle', 'avda', 'av', 'avenida', 'plaza', 'pza', 'paseo', 'urb', 'urbanizacion',
  'hoy', 'urgente', 'repetida', 'repetido', 'duplicada', 'duplicado', 'otra', 'vez',
  'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];

/* Qué tareas se dan por resueltas en cada caso (en forma de clave: sin tildes ni relleno). */
const TAREAS_DE_VISITA = ['apuntar resultado', 'confirmar visita', 'posponer', 'llamar posponer', 'nueva fecha', 'dar nueva fecha'];
const TAREAS_DE_CLIENTE_CERRADO = ['apuntar resultado', 'confirmar visita', 'posponer', 'llamar posponer', 'nueva fecha', 'dar nueva fecha',
  'llamar', 'seguimiento propuesta', 'propuesta', 'sacar propuesta', 'enviar propuesta', 'registrar operacion', 'poner importe'];

function claveTarea_(string $titulo): string {
  $n = sinAbreviaturas_(normal_($titulo));
  $n = preg_replace('/\([^)]*\)/u', ' ', $n);                          // (11/11 18:00), (repetida)…
  $n = preg_replace('/\b\d{1,2}[\/.-]\d{1,2}([\/.-]\d{2,4})?\b/', ' ', $n); // fechas
  $n = preg_replace('/\b\d{1,2}:\d{2}(h)?\b/', ' ', $n);                   // horas
  $n = preg_replace('/[^a-z0-9]+/', ' ', $n);
  $w = array_values(array_filter(explode(' ', $n), fn($x) => $x !== '' && !in_array($x, TAREA_RELLENO, true)));
  return implode(' ', $w);
}

function tareaAbierta_(array $t): bool {
  return !in_array(normal_($t['estado'] ?? '') ?: 'pendiente', ['hecha', 'descartada'], true);
}

/** La tarea abierta que ya pide lo mismo (o null). */
function tareaRepetida_(array $nueva, ?array $todas = null): ?array {
  $clave = claveTarea_(txt_($nueva['titulo'] ?? ''));
  if (mb_strlen($clave) < 6) return null;
  $cli = txt_($nueva['cliente_id'] ?? '');
  foreach ($todas ?? leer_('TAREAS') as $t) {
    if (!tareaAbierta_($t)) continue;
    $tc = txt_($t['cliente_id'] ?? '');
    if ($cli !== '' && $tc !== '' && $cli !== $tc) continue;
    if (claveTarea_(txt_($t['titulo'])) === $clave) return $t;
  }
  return null;
}

const TIPOS_VIA_TAREA = '/\b(calle|c|cl|avenida|avda|av|plaza|pza|pl|paseo|po|camino|cm|urb|urbanizacion|carretera|ctra)\b\.?/';

/** Abreviaturas que se escriben de dos maneras («Sta. Ana» = «Santa Ana»). */
function sinAbreviaturas_(string $n): string {
  return preg_replace(['/\bsta\b\.?/', '/\bsto\b\.?/', '/\bsan\b/'], ['santa', 'santo', 'san'], $n);
}

/** «C. Ejemplo, 37» → patrón que encuentra «ejemplo 37» en un título (calle y primer número). */
function patronCalleTarea_(string $dir): string {
  $n = sinAbreviaturas_(preg_replace(TIPOS_VIA_TAREA, ' ', normal_($dir)));
  if (!preg_match('/^(.*?)(\d+)/', $n, $m)) return '';
  $pal = array_values(array_filter(preg_split('/[^a-z0-9]+/', $m[1]), fn($x) => $x !== ''));
  $letras = implode('', $pal);
  if (strlen($letras) < 4) return '';
  $trozos = array_map(fn($w) => in_array($w, ['de', 'del', 'la', 'las', 'el', 'los'], true) ? '(?:' . $w . '\s*)?' : preg_quote($w, '/') . '\s*', $pal);
  return '/\b' . implode('', $trozos) . preg_quote($m[2], '/') . '(?!\d)/';
}

/** Clave corta de la tarea para comparar (fechas fuera, abreviaturas igualadas). */
function textoTituloTarea_(string $t): string {
  $n = sinAbreviaturas_(preg_replace(TIPOS_VIA_TAREA, ' ', normal_($t)));
  $n = ' ' . trim(preg_replace('/[^a-z0-9]+/', ' ', $n)) . ' ';
  return trim(preg_replace('/ (de|del|la|las|el|los)(?= )/', '', $n));
}

/** ¿La tarea es de este cliente? Por cliente_id o porque su calle y número salen en el título. */
function tareaDeCliente_(array $t, array $cli): bool {
  if (txt_($t['cliente_id'] ?? '') !== '') return mismo_($t['cliente_id'], $cli['id']);
  $pat = patronCalleTarea_(txt_($cli['direccion'] ?? ''));
  if ($pat === '') return false;
  return (bool)preg_match($pat, textoTituloTarea_(txt_($t['titulo'] ?? '')));
}

/**
 * Marca como hechas las tareas abiertas de un cliente cuya clave empieza por
 * alguno de los prefijos. Devuelve cuántas ha cerrado.
 */
function cerrarTareasResueltas_(array $u, ?array $cli, array $prefijos, string $motivo): int {
  if (!$cli || txt_($cli['id'] ?? '') === '') return 0;
  try {
    if (function_exists('asegurarTablero_')) asegurarTablero_();
    $n = 0;
    foreach (leer_('TAREAS') as $t) {
      if (!tareaAbierta_($t) || !tareaDeCliente_($t, $cli)) continue;
      $clave = claveTarea_(txt_($t['titulo']));
      $toca = false;
      foreach ($prefijos as $p) { if ($clave === $p || strpos($clave, $p . ' ') === 0) { $toca = true; break; } }
      if (!$toca) continue;
      $detalle = trim(txt_($t['detalle'] ?? '') . ' · Cerrada sola el ' . hoyISO_() . ': ' . $motivo, ' ·');
      actualizar_('TAREAS', $t['id'], ['estado' => 'hecha', 'hecho' => ahora_(), 'hecho_por' => 'sistema',
        'detalle' => trozo_($detalle, 0, 2000), 'modificado' => ahora_(), 'modificado_por' => 'sistema']);
      registrar_($u, 'tarea_cerrada_sola', 'TAREAS', $t['id'], $motivo);
      $n++;
    }
    return $n;
  } catch (Throwable $e) { error_log('CRM cerrarTareasResueltas_: ' . $e->getMessage()); return 0; }
}

/** Tareas que se cierran al cambiar el estado de un cliente. */
function cerrarTareasPorEstado_(array $u, ?array $cli, string $estado): int {
  $e = normal_($estado);
  if (in_array($e, ['ganado', 'perdido', 'ko', 'frio'], true)) return cerrarTareasResueltas_($u, $cli, TAREAS_DE_CLIENTE_CERRADO, 'cliente en «' . $e . '»');
  if (in_array($e, ['sentada', 'propuesta', 'negociando', 'reagendar', 'reagendado'], true)) return cerrarTareasResueltas_($u, $cli, TAREAS_DE_VISITA, 'visita apuntada (cliente en «' . $e . '»)');
  return 0;
}

/**
 * Crea una tarea automática solo si no hay ya una abierta con el mismo
 * origen y origen_id (o con el mismo título para ese cliente).
 */
function tareaSistema_(array $u, array $t): ?array {
  try {
    if (function_exists('asegurarTablero_')) asegurarTablero_();
    $todas = leer_('TAREAS');
    foreach ($todas as $x) {
      if (!tareaAbierta_($x)) continue;
      if (txt_($t['origen'] ?? '') !== '' && normal_($x['origen']) === normal_($t['origen']) && txt_($x['origen_id']) === txt_($t['origen_id'] ?? '')) return $x;
    }
    if (tareaRepetida_($t, $todas)) return null;
    $fila = ['titulo' => trozo_(txt_($t['titulo'] ?? ''), 0, 300), 'detalle' => txt_($t['detalle'] ?? ''),
      'area' => txt_($t['area'] ?? '') ?: 'direccion', 'usuario_id' => txt_($t['usuario_id'] ?? ''),
      'cliente_id' => txt_($t['cliente_id'] ?? ''), 'importe' => '', 'prioridad' => txt_($t['prioridad'] ?? '') ?: 'alta',
      'vence' => txt_($t['vence'] ?? '') ?: hoyISO_(), 'estado' => 'pendiente', 'origen' => txt_($t['origen'] ?? ''),
      'origen_id' => txt_($t['origen_id'] ?? ''), 'creado' => ahora_(), 'creado_por' => 'sistema',
      'modificado' => ahora_(), 'modificado_por' => 'sistema'];
    $r = insertar_('TAREAS', $fila);
    registrar_($u, 'alta_tarea', 'TAREAS', $r['id'], ['titulo' => $fila['titulo'], 'area' => $fila['area'], 'auto' => 1]);
    return $r;
  } catch (Throwable $e) { error_log('CRM tareaSistema_: ' . $e->getMessage()); return null; }
}

/* ---------- mejora 6: operación con importe ---------- */

/* Estados de operación en los que ya tiene que haber importe. */
const OP_CON_IMPORTE = ['propuesta', 'financiacion', 'firmada', 'tramite', 'material', 'instalacion', 'instalada', 'legalizada', 'cerrada'];

/** ¿El cliente tiene alguna operación viva con importe? */
function clienteConOperacionValorada_($clienteId): bool {
  foreach (leer_('OPERACIONES') as $o) {
    if (!mismo_($o['cliente_id'], $clienteId)) continue;
    if (normal_($o['estado'] ?? '') === 'cancelada') continue;
    if (num_($o['total'] ?? '') > 0) return true;
  }
  return false;
}

function etiquetaClienteTarea_(array $cli): string {
  return implode(' · ', array_values(array_filter([txt_($cli['direccion'] ?? ''), txt_($cli['nombre'] ?? '')], fn($s) => $s !== '')));
}

/** Tarea «Registrar la operación con su importe» para el comercial del cliente. */
function avisarFaltaOperacion_(array $u, array $cli, string $estado): void {
  $com = txt_($cli['comercial_id'] ?? '');
  tareaSistema_($u, ['titulo' => 'Registrar la operación con su importe (IVA incl.) · ' . etiquetaClienteTarea_($cli),
    'detalle' => 'El cliente está en «' . $estado . '» y no tiene ninguna operación con importe: sin ella no cuenta en la previsión ni en el Centro de Mando.',
    'area' => $com !== '' ? '' : 'direccion', 'usuario_id' => $com, 'cliente_id' => $cli['id'], 'prioridad' => 'alta',
    'origen' => 'falta_operacion', 'origen_id' => $cli['id']]);
}

/** Tarea «Poner el importe» para una operación creada sola sin precio. */
function avisarFaltaImporte_(array $u, array $op, ?array $cli): void {
  $cli = $cli ?: (buscar1_('CLIENTES', fn($c) => mismo_($c['id'], $op['cliente_id'] ?? '')) ?? []);
  $com = txt_($op['comercial_id'] ?? '') ?: txt_($cli['comercial_id'] ?? '');
  tareaSistema_($u, ['titulo' => 'Poner el importe (IVA incl.) a la operación · ' . etiquetaClienteTarea_($cli),
    'detalle' => 'La operación ' . txt_($op['id']) . ' está en «' . txt_($op['estado']) . '» sin importe.',
    'area' => $com !== '' ? '' : 'direccion', 'usuario_id' => $com, 'cliente_id' => txt_($cli['id'] ?? ''), 'prioridad' => 'alta',
    'origen' => 'falta_importe', 'origen_id' => txt_($op['id'])]);
}

/** Cuando la operación ya tiene importe, sus avisos se cierran solos. */
function cerrarAvisosImporte_(array $u, array $op): void {
  if (num_($op['total'] ?? '') <= 0) return;
  try {
    foreach (leer_('TAREAS') as $t) {
      if (!tareaAbierta_($t)) continue;
      $o = normal_($t['origen'] ?? '');
      if (($o === 'falta_importe' && txt_($t['origen_id']) === txt_($op['id'])) ||
          ($o === 'falta_operacion' && txt_($t['origen_id']) === txt_($op['cliente_id']))) {
        actualizar_('TAREAS', $t['id'], ['estado' => 'hecha', 'hecho' => ahora_(), 'hecho_por' => 'sistema',
          'detalle' => trim(txt_($t['detalle'] ?? '') . ' · Cerrada sola el ' . hoyISO_() . ': la operación ya tiene importe.', ' ·'),
          'modificado' => ahora_(), 'modificado_por' => 'sistema']);
      }
    }
  } catch (Throwable $e) { error_log('CRM cerrarAvisosImporte_: ' . $e->getMessage()); }
}
