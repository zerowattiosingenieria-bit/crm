<?php
/* guardia.php — protección contra borrados o cambios en masa (19/11/2026,
   orden de Nando).

   Nando teme que algún día alguien del equipo se vuelva contra la empresa y
   borre o estropee información del CRM. Los comerciales y captadores ya no
   pueden borrar clientes, operaciones ni captaciones (eso exige «editarTodo»),
   pero sí cambiar, cancelar citas o quitar sus archivos. Esta guardia cuenta,
   por persona y en ventanas de 30 minutos, los cambios que hace y los que
   quitan cosas (borrar…, cancelar citas, fusionar fichas). Si pasa del
   límite:
     1. le desactiva la cuenta al momento (activo = «no»): la sesión se corta
        en su siguiente clic y no puede volver a entrar;
     2. lo apunta en el registro («bloqueo_automatico») con lo último que hizo;
     3. avisa por correo a la dirección.
   Solo la dirección la vuelve a activar (Ajustes › Usuarios › Activo = sí),
   cuando Nando lo autorice. No se deshace nada de lo que hizo: para eso están
   el registro, la copia nocturna y las de los viernes.

   No cuenta a la dirección (Nando, Fernando, Rubén, superadmin) ni a los
   agentes. Nunca rompe la petición: si algo falla aquí, se ignora. */

const GUARDIA_VENTANA_MIN = 30;
const GUARDIA_MAX_CAMBIOS = 150;   // cambios de cualquier tipo en la ventana
const GUARDIA_MAX_QUITAR = 8;      // borrados / cancelaciones en la ventana
/* 25/11/2026 (Nando): «si de repente se cambian más de 15 operaciones por alguna persona del equipo, paraliza la
   actividad y mándame un email, pero no le dejes seguir haciendo más cambios». Se cuentan fichas distintas
   (clientes / citas / operaciones) tocadas en la ventana: a la 16.ª se corta. */
const GUARDIA_MAX_FICHAS = 15;

/** Qué ficha ha tocado la petición (el cliente, o el id del registro si no lo hay). */
function guardiaFicha_($r): string {
  if (!is_array($r)) return '';
  foreach (['captacion', 'cliente', 'operacion', 'seguimiento', 'cita', 'obra', 'factura', 'cobro', 'tarea'] as $k) {
    $x = $r[$k] ?? null;
    if (is_array($x)) { $c = txt_($x['cliente_id'] ?? ''); if ($c === '' && $k === 'cliente') $c = txt_($x['id'] ?? ''); return $c !== '' ? $c : $k . ':' . txt_($x['id'] ?? ''); }
  }
  return '';
}
const GUARDIA_EXENTOS = ['U-000001', 'U-000002', 'U-000003', 'U-000004'];
const GUARDIA_ROLES_EXENTOS = ['superadmin', 'agente'];
const GUARDIA_QUITAN = ['cancelarCita', 'fusionarClientes', 'limpiarPuertasFuera'];
/* Borrados del día a día que no cuentan como «quitar» (sí como cambio): sus tareas y las puertas del puerta a puerta. */
const GUARDIA_NO_QUITAN = ['borrarTarea', 'borrarPuertas'];

function guardiaQuita_(string $accion): bool {
  if (in_array($accion, GUARDIA_NO_QUITAN, true)) return false;
  return strpos($accion, 'borrar') === 0 || in_array($accion, GUARDIA_QUITAN, true);
}

function guardia_($u, string $accion, $r): void {
  try {
    if (!is_array($u) || txt_($u['id'] ?? '') === '') return;
    if (in_array(txt_($u['id']), GUARDIA_EXENTOS, true)) return;
    if (in_array(txt_($u['rol'] ?? ''), GUARDIA_ROLES_EXENTOS, true)) return;
    if (tipoDePeticion_($accion) !== 'modificacion') return;
    if (is_array($r) && ($r['ok'] ?? null) === false) return;

    $clave = 'guardia_' . txt_($u['id']);
    $previo = config_()[$clave] ?? '';
    $g = is_string($previo) && $previo !== '' ? json_decode($previo, true) : null;
    $ahora = time();
    if (!is_array($g) || ($ahora - (int)($g['desde'] ?? 0)) > GUARDIA_VENTANA_MIN * 60) {
      $g = ['desde' => $ahora, 'cambios' => 0, 'quitan' => 0, 'ultimas' => [], 'fichas' => []];
    }
    $g['fichas'] = is_array($g['fichas'] ?? null) ? $g['fichas'] : [];
    $ficha = guardiaFicha_($r);
    if ($ficha !== '' && $ficha !== ':' && !in_array($ficha, $g['fichas'], true)) $g['fichas'][] = $ficha;
    $g['cambios'] = (int)$g['cambios'] + 1;
    if (guardiaQuita_($accion)) $g['quitan'] = (int)$g['quitan'] + 1;
    $g['ultimas'][] = (new DateTime('now', new DateTimeZone('Europe/Madrid')))->format('H:i') . ' ' . $accion;
    $g['ultimas'] = array_slice($g['ultimas'], -20);

    if ($g['cambios'] < GUARDIA_MAX_CAMBIOS && $g['quitan'] < GUARDIA_MAX_QUITAR && count($g['fichas']) <= GUARDIA_MAX_FICHAS) {
      escribirConfig_($clave, aJson_($g), 'Guardia: actividad de los últimos 30 minutos');
      return;
    }

    /* Límite superado: se corta el acceso y se avisa. */
    actualizar_('USUARIOS', $u['id'], ['activo' => 'no']);
    $motivo = $g['quitan'] >= GUARDIA_MAX_QUITAR
      ? $g['quitan'] . ' borrados o cancelaciones en menos de ' . GUARDIA_VENTANA_MIN . ' min'
      : (count($g['fichas']) > GUARDIA_MAX_FICHAS
        ? 'cambios en ' . count($g['fichas']) . ' fichas distintas en menos de ' . GUARDIA_VENTANA_MIN . ' min (el límite es ' . GUARDIA_MAX_FICHAS . ')'
        : $g['cambios'] . ' cambios en menos de ' . GUARDIA_VENTANA_MIN . ' min');
    registrar_($u, 'bloqueo_automatico', 'USUARIOS', $u['id'],
      ['motivo' => $motivo, 'ultimas' => $g['ultimas']]);
    escribirConfig_($clave, '', 'Guardia: actividad de los últimos 30 minutos');

    $quien = txt_($u['nombre'] ?? '') !== '' ? txt_($u['nombre']) : txt_($u['usuario'] ?? $u['id']);
    $destino = txt_(config_()['avisos_guardia_a'] ?? '') ?: 'fernandogarcia@zerowattios.com';
    correo_(['to' => $destino,
      'subject' => '🚨 CRM: acceso bloqueado a ' . $quien,
      'body' => "El CRM ha desactivado la cuenta de {$quien} ({$u['id']}) por {$motivo}.\n\n" .
        "Últimas acciones:\n- " . implode("\n- ", $g['ultimas']) . "\n\n" .
        "Fichas tocadas: " . implode(', ', array_slice($g['fichas'], 0, 30)) . "\n\n" .
        "No puede hacer ningún cambio más (ni entrar) hasta que le devuelvas el acceso. No se ha deshecho nada: revisa el registro del CRM (Registro › {$quien}) y decide qué hacemos.\n" .
        "Para devolverle el acceso: Ajustes › Usuarios › {$quien} › Activo = sí."]);
  } catch (Throwable $e) {
    /* La guardia nunca debe tumbar una petición. */
  }
}
