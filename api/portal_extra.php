<?php
/**
 * portal_extra.php — Más cosas en las apps de clientes y de instaladores (21/11/2026, Nando).
 *
 * REGLA DE ORO: no sale ningún WhatsApp ni correo a un cliente o a un proveedor sin la
 * aprobación de Nando o de Rubén. Todo lo que habría que mandar se prepara en MENSAJES
 * («pendiente») y solo se envía cuando uno de los aprobadores lo aprueba en el CRM.
 *
 *   1. Acceso del cliente al firmar: se prepara la bienvenida a su app; al aprobarla, su
 *      correo pasa a la lista permitida (para que pueda pedir su código) y se le envía.
 *   2. Instaladores que no entran en 48 h con una obra asignada: aviso a dirección y un
 *      recordatorio preparado para aprobar.
 *   3. App del cliente: su producción y su ahorro (SolaX).
 *   4. App del cliente: «lo que necesitamos de ti» (DNI, factura de luz, foto del contador,
 *      aceptar la fecha de instalación). Lo que sube entra en su ficha del CRM.
 *   5. App del cliente: sus ayudas paso a paso (CAE, IRPF, IBI/ICIO).
 *   6. App del cliente: su financiación (cuota, plazo, amortización anticipada a coste 0; sin TIN).
 *   7. App del cliente, SOLO cuando dirección da el ok en su ficha: conformidad de fin de obra
 *      firmada, reseña en Google y «recomienda a un vecino» (entra como lead).
 *   8. App del instalador: sube su factura de cada obra → Dinero › Facturas, enlazada al gasto.
 *   9. App del instalador: material de la obra (lo que va, recibido, roto o falta).
 *  10. App del instalador: su documentación al día (seguro, REA, PRL, TC2) con caducidad; se le
 *      solicita y dirección la valida.
 *  11. CRM: ficha de cada instalador (puntualidad, respuesta, incidencias, fotos que faltan).
 */

const APROBADORES_MENSAJES = ['U-000001', 'U-000002', 'U-000003', 'U-000004'];   // superadmin, Rubén, Fernando, Nando
const DOCS_CONTRATA = ['seguro' => 'Seguro de responsabilidad civil', 'rea' => 'Inscripción en el REA', 'prl' => 'Formación PRL de los trabajadores',
  'tc2' => 'TC2 / relación de trabajadores al día', 'otro' => 'Otro documento'];
const NECESITAMOS = ['dni' => 'Tu DNI (las dos caras)', 'factura_luz' => 'Una factura de la luz reciente', 'contador' => 'Una foto del contador de la luz'];

function esAprobador_(array $u): bool {
  $lista = array_filter(array_map('trim', explode(',', txt_(config_()['aprobadores_mensajes'] ?? ''))));
  return in_array(txt_($u['id'] ?? ''), $lista ?: APROBADORES_MENSAJES, true);
}
function exigirAprobador_(array $u): void { if (!esAprobador_($u)) throw new Exception('Solo Nando o Rubén pueden aprobar mensajes a clientes y proveedores.'); }

function ponerConfig_(string $clave, string $valor): void { escribirConfig_($clave, $valor, 'Correos que pueden entrar en el área de cliente'); }

/* ---------- mensajes pendientes de aprobar ---------- */

/** Prepara un mensaje (no lo envía). Si ya hay uno pendiente igual, no lo repite. */
function prepararMensaje_(array $m): ?array {
  $ya = buscar1_('MENSAJES', fn($x) => normal_($x['estado']) === 'pendiente' && txt_($x['tipo']) === txt_($m['tipo'] ?? '')
    && txt_($x['cliente_id']) === txt_($m['cliente_id'] ?? '') && txt_($x['cuenta_id']) === txt_($m['cuenta_id'] ?? '') && txt_($x['obra_id']) === txt_($m['obra_id'] ?? ''));
  if ($ya) return $ya;
  return insertar_('MENSAJES', $m + ['estado' => 'pendiente', 'creado' => ahora_(), 'creado_por' => $m['creado_por'] ?? 'sistema']);
}

function accMensajesPendientes_(array $u, array $p): array {
  exigirAprobador_($u);
  $l = array_values(array_filter(leer_('MENSAJES'), fn($x) => in_array(normal_($x['estado']), ['pendiente', 'aprobado'], true)));
  usort($l, fn($a, $b) => strcmp(txt_($b['creado']), txt_($a['creado'])));
  return ['ok' => true, 'mensajes' => array_map(fn($x) => array_diff_key($x, ['_fila' => 1]), $l)];
}

/** Lo prepara a mano alguien del CRM (p. ej. «Preparar acceso a su app» desde la ficha). */
function accPrepararAccesoCliente_(array $u, array $p): array {
  $v = clienteVisible_($u, $p['cliente_id'] ?? '');
  if (isset($v['error'])) return ['ok' => false, 'error' => $v['error']];
  $m = mensajeBienvenida_($v['cliente'], $u['id']);
  if (!$m) return ['ok' => false, 'error' => 'El cliente necesita un proyecto firmado y un correo o teléfono para darle acceso.'];
  return ['ok' => true, 'mensaje' => $m, 'aviso' => 'Preparado. Lo tienen que aprobar Nando o Rubén antes de que salga.'];
}

function mensajeBienvenida_(array $cli, string $quien = 'sistema'): ?array {
  if (!portalOperacionesFirmadas_(txt_($cli['id']))) return null;
  $email = normal_($cli['email']); $tel = preg_replace('/\D/', '', txt_($cli['telefono']));
  if (!filter_var($email, FILTER_VALIDATE_EMAIL) && strlen($tel) < 9) return null;
  $nombre = primerNombre_($cli['nombre']);
  $cuerpo = 'Hola ' . $nombre . ', ya tienes tu área de cliente de Zero Wattios. Ahí verás en tiempo real cómo va tu instalación, las fotos de la obra, tus documentos, '
    . 'tus ayudas y, cuando esté funcionando, lo que produce tu instalación.' . "\n\n"
    . 'Entra en https://clientes.zerowattios.com con tu correo (' . ($email ?: 'el que nos diste') . '), pide el código y crea tu clave. '
    . 'Cualquier duda, me dices. Un saludo · Zero Wattios';
  return prepararMensaje_(['tipo' => 'bienvenida', 'destino_tipo' => 'cliente', 'cliente_id' => $cli['id'],
    'canal' => filter_var($email, FILTER_VALIDATE_EMAIL) ? 'email' : 'whatsapp', 'destino' => filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : $tel,
    'telefono' => $tel, 'asunto' => 'Tu área de cliente de Zero Wattios', 'cuerpo' => $cuerpo, 'creado_por' => $quien]);
}

/**
 * Aprueba un mensaje. p.id, p.canal (email|whatsapp), p.cuerpo (editado), p.asunto.
 * Correo: se envía ya. WhatsApp: queda aprobado y se devuelve el enlace para que quien
 * aprueba lo mande desde su WhatsApp (luego se marca enviado).
 */
function accAprobarMensaje_(array $u, array $p): array {
  exigirAprobador_($u);
  $m = buscar1_('MENSAJES', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$m) return ['ok' => false, 'error' => 'Ese mensaje ya no está.'];
  $canal = normal_($p['canal'] ?? $m['canal']) === 'whatsapp' ? 'whatsapp' : 'email';
  $cuerpo = txt_($p['cuerpo'] ?? '') !== '' ? mb_substr(txt_($p['cuerpo']), 0, 4000) : txt_($m['cuerpo']);
  $asunto = txt_($p['asunto'] ?? '') !== '' ? txt_($p['asunto']) : txt_($m['asunto']);
  $cli = txt_($m['cliente_id']) !== '' ? buscar1_('CLIENTES', fn($x) => mismo_($x['id'], $m['cliente_id'])) : null;
  $cta = txt_($m['cuenta_id']) !== '' ? buscar1_('PORTAL_CUENTAS', fn($x) => mismo_($x['id'], $m['cuenta_id'])) : null;
  /* bienvenida aprobada: su correo entra en la lista permitida (para que reciba su código) y se crea la cuenta */
  if (txt_($m['tipo']) === 'bienvenida' && $cli && filter_var(normal_($cli['email']), FILTER_VALIDATE_EMAIL)) {
    $lista = portalCorreosPermitidos_();
    if (!in_array('*', $lista, true) && !in_array(normal_($cli['email']), $lista, true)) ponerConfig_('portal_correos_permitidos', implode(',', array_merge($lista, [normal_($cli['email'])])));
    portalCuentaParaCorreo_(normal_($cli['email']));
  }
  $cambios = ['canal' => $canal, 'cuerpo' => $cuerpo, 'asunto' => $asunto, 'revisado' => ahora_(), 'revisado_por' => $u['id']];
  if ($canal === 'email') {
    $to = normal_(txt_($m['destino']) !== '' && strpos(txt_($m['destino']), '@') ? $m['destino'] : ($cli['email'] ?? ($cta['email'] ?? '')));
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'No hay un correo válido para enviarlo. Usa WhatsApp.'];
    $web = PORTAL_WEB[txt_($m['destino_tipo']) === 'contrata' ? 'contrata' : 'cliente'];
    $html = '<p style="margin:0 0 12px">' . nl2br(htmlspecialchars($cuerpo)) . '</p>';
    $ok = correo_(['to' => $to, 'subject' => $asunto, 'htmlBody' => portalHtml_($asunto, $html, 'Entrar', $web), 'name' => 'Zero Wattios']);
    if (!$ok) return ['ok' => false, 'error' => 'No se ha podido enviar el correo.'];
    actualizar_('MENSAJES', $m['id'], $cambios + ['estado' => 'enviado', 'enviado' => ahora_(), 'destino' => $to]);
    registrar_($u, 'mensaje_aprobado', 'MENSAJES', $m['id'], 'correo → ' . $to);
    return ['ok' => true, 'enviado' => true];
  }
  $tel = preg_replace('/\D/', '', txt_($m['telefono']) ?: (txt_($m['destino']) ?: ($cli['telefono'] ?? ($cta['telefono'] ?? ''))));
  if (strlen($tel) === 9) $tel = '34' . $tel;
  if (strlen($tel) < 11) return ['ok' => false, 'error' => 'No hay un teléfono válido para WhatsApp.'];
  actualizar_('MENSAJES', $m['id'], $cambios + ['estado' => 'aprobado', 'telefono' => $tel]);
  registrar_($u, 'mensaje_aprobado', 'MENSAJES', $m['id'], 'whatsapp → ' . $tel);
  return ['ok' => true, 'whatsapp' => 'https://wa.me/' . $tel . '?text=' . rawurlencode($cuerpo)];
}

function accMarcarMensaje_(array $u, array $p): array {
  exigirAprobador_($u);
  $m = buscar1_('MENSAJES', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$m) return ['ok' => false, 'error' => 'Ese mensaje ya no está.'];
  $e = normal_($p['estado'] ?? '') === 'enviado' ? 'enviado' : 'descartado';
  actualizar_('MENSAJES', $m['id'], ['estado' => $e, 'revisado' => ahora_(), 'revisado_por' => $u['id']] + ($e === 'enviado' ? ['enviado' => ahora_()] : []));
  registrar_($u, 'mensaje_' . $e, 'MENSAJES', $m['id'], txt_($m['tipo']));
  return ['ok' => true];
}

/* ---------- tareas diarias (las llama cron.php) ---------- */
function portalExtraDiario_(): array {
  $n = ['bienvenidas' => 0, 'recordatorios' => 0, 'docs' => 0];
  /* 1. Clientes firmados sin acceso y sin bienvenida preparada o enviada */
  $cuentas = leer_('PORTAL_CUENTAS'); $msgs = leer_('MENSAJES');
  foreach (leer_('CLIENTES') as $cli) {
    $firm = portalOperacionesFirmadas_(txt_($cli['id']));
    if (!$firm) continue;
    /* solo los firmados en los últimos 30 días; a los antiguos se les prepara a mano desde su ficha */
    if (max(array_map(fn($o) => txt_($o['fecha_firma']), $firm)) < sumarDias_(hoyISO_(), -30)) continue;
    if (array_filter($cuentas, fn($c) => mismo_($c['cliente_id'], $cli['id']) && txt_($c['hash']) !== '')) continue;
    if (array_filter($msgs, fn($m) => txt_($m['tipo']) === 'bienvenida' && mismo_($m['cliente_id'], $cli['id']))) continue;
    if (mensajeBienvenida_($cli)) $n['bienvenidas']++;
  }
  /* 2. Instaladores con obra asignada hace más de 48 h que no han entrado desde entonces */
  foreach (leer_('OBRAS') as $o) {
    if (normal_($o['estado']) !== 'asignada' || txt_($o['contrata_id']) === '') continue;
    $desde = txt_($o['creado']); if ($desde === '' || minutosDesde_($desde) < 48 * 60) continue;
    $c = null; foreach ($cuentas as $x) if (mismo_($x['id'], $o['contrata_id'])) $c = $x;
    if (!$c || (txt_($c['ultimo_acceso']) !== '' && strcmp(txt_($c['ultimo_acceso']), $desde) > 0)) continue;
    $cli = buscar1_('CLIENTES', fn($x) => mismo_($x['id'], $o['cliente_id'])) ?: [];
    $donde = portalEtiquetaCliente_($cli);
    if (!buscar1_('TAREAS', fn($t) => txt_($t['origen']) === 'contrata_sin_entrar' && mismo_($t['origen_id'], $o['id']))) {
      insertar_('TAREAS', ['creado' => ahora_(), 'creado_por' => 'sistema', 'area' => 'direccion', 'titulo' => (txt_($c['empresa']) ?: txt_($c['nombre'])) . ' no ha entrado en su app: obra de ' . $donde,
        'detalle' => 'Tiene la obra asignada desde el ' . substr($desde, 0, 10) . ' y no ha entrado en contratas.zerowattios.com. Hay un recordatorio preparado para aprobar.',
        'cliente_id' => $o['cliente_id'], 'prioridad' => 'alta', 'estado' => 'pendiente', 'origen' => 'contrata_sin_entrar', 'origen_id' => $o['id']]);
    }
    prepararMensaje_(['tipo' => 'recordatorio_contrata', 'destino_tipo' => 'contrata', 'cuenta_id' => $c['id'], 'obra_id' => $o['id'],
      'canal' => txt_($c['telefono']) !== '' ? 'whatsapp' : 'email', 'destino' => txt_($c['telefono']) ?: txt_($c['email']), 'telefono' => preg_replace('/\D/', '', txt_($c['telefono'])),
      'asunto' => 'Tienes una obra asignada · Zero Wattios',
      'cuerpo' => 'Hola ' . primerNombre_($c['nombre'] ?: $c['empresa']) . ', tienes asignada la obra de ' . $donde . '. Entra en https://contratas.zerowattios.com con tu usuario (' . txt_($c['usuario']) . ') para ver la máquina, el proyecto y las fechas. Gracias · Zero Wattios']);
    $n['recordatorios']++;
  }
  /* 10. Documentación de instaladores que falta o caduca en 30 días: se les solicita (mensaje para aprobar) */
  $docs = leer_('DOCS_CONTRATA');
  foreach ($cuentas as $c) {
    if (normal_($c['tipo']) !== 'contrata' || normal_($c['activo']) === 'no') continue;
    $faltan = [];
    foreach (['seguro', 'rea', 'prl', 'tc2'] as $k) {
      $v = array_values(array_filter($docs, fn($d) => mismo_($d['cuenta_id'], $c['id']) && txt_($d['tipo']) === $k && normal_($d['estado']) !== 'rechazado'));
      usort($v, fn($a, $b) => strcmp(txt_($b['caduca']), txt_($a['caduca'])));
      if (!$v || (txt_($v[0]['caduca']) !== '' && txt_($v[0]['caduca']) <= sumarDias_(hoyISO_(), 30))) $faltan[] = DOCS_CONTRATA[$k];
    }
    if (!$faltan) continue;
    prepararMensaje_(['tipo' => 'docs_contrata', 'destino_tipo' => 'contrata', 'cuenta_id' => $c['id'],
      'canal' => txt_($c['email']) !== '' ? 'email' : 'whatsapp', 'destino' => txt_($c['email']) ?: txt_($c['telefono']), 'telefono' => preg_replace('/\D/', '', txt_($c['telefono'])),
      'asunto' => 'Documentación pendiente · Zero Wattios',
      'cuerpo' => 'Hola ' . primerNombre_($c['nombre'] ?: $c['empresa']) . ', para seguir asignándote obras necesitamos que subas en tu app (https://contratas.zerowattios.com → Mi documentación): ' . implode(', ', $faltan) . '. Gracias · Zero Wattios']);
    $n['docs']++;
  }
  return $n;
}

/* ---------- lo que el cliente ve de más en su app ---------- */
function portalExtrasCliente_(array $c, array $ops): array {
  $cid = txt_($c['cliente_id']);
  $cli = buscar1_('CLIENTES', fn($x) => mismo_($x['id'], $cid)) ?: [];
  /* 3. producción y ahorro */
  $lect = array_values(array_filter(leer_('MONITOREO'), fn($m) => mismo_($m['cliente_id'], $cid)));
  usort($lect, fn($a, $b) => strcmp(txt_($b['fecha']), txt_($a['fecha'])));
  $mon = null;
  if ($lect) {
    $u = $lect[0];
    $mes = substr(txt_($u['fecha']), 0, 7);
    $genMes = num_($u['gen_mes']) ?: array_sum(array_map(fn($x) => num_($x['gen_dia']), array_filter($lect, fn($x) => substr(txt_($x['fecha']), 0, 7) === $mes)));
    $precio = num_(config_()['precio_kwh_cliente'] ?? '') ?: 0.16;
    $mon = ['fecha' => txt_($u['fecha']), 'estado' => txt_($u['estado']), 'hoy' => num_($u['gen_dia']), 'mes' => round($genMes, 1), 'total' => num_($u['gen_total']),
      'bateria' => txt_($u['soc']) !== '' ? num_($u['soc']) : null, 'importado_mes' => txt_($u['importado_mes']) !== '' ? num_($u['importado_mes']) : null,
      'autoconsumo_mes' => txt_($u['autoconsumo_mes']) !== '' ? num_($u['autoconsumo_mes']) : null,
      'factura_mes_est' => txt_($u['factura_mes_est']) !== '' ? num_($u['factura_mes_est']) : null,
      'ahorro_mes_est' => round($genMes * $precio * (txt_($u['autoconsumo_mes']) !== '' ? max(0.3, num_($u['autoconsumo_mes']) / 100) : 0.7), 0),
      'co2_kg' => round(num_($u['gen_total']) * 0.25), 'dias' => array_map(fn($x) => ['fecha' => $x['fecha'], 'kwh' => num_($x['gen_dia'])], array_reverse(array_slice($lect, 0, 14)))];
  }
  /* 4. lo que necesitamos de ti */
  $arch = filtrar_('ARCHIVOS', fn($a) => mismo_($a['cliente_id'], $cid));
  $tiene = fn($clase, $nota = '') => (bool)array_filter($arch, fn($a) => normal_($a['clase']) === $clase && ($nota === '' || stripos(txt_($a['notas']) . ' ' . txt_($a['nombre']), $nota) !== false));
  $nec = [];
  if (!$tiene('dni')) $nec[] = ['clave' => 'dni', 'titulo' => NECESITAMOS['dni']];
  if (!$tiene('factura_luz')) $nec[] = ['clave' => 'factura_luz', 'titulo' => NECESITAMOS['factura_luz']];
  if (!$tiene('foto', 'contador')) $nec[] = ['clave' => 'contador', 'titulo' => NECESITAMOS['contador']];
  foreach ($ops as $op) {
    $fp = txt_($op['fecha_prevista_instalacion']);
    if ($fp === '' || $fp < hoyISO_() || in_array(normal_($op['estado']), ['instalada', 'legalizada', 'cerrada'], true)) continue;
    $resp = deJson_(prop_('PFECHA_' . $op['id']) ?? '', null);
    if (!is_array($resp) || ($resp['fecha'] ?? '') !== $fp) $nec[] = ['clave' => 'fecha', 'operacion_id' => $op['id'], 'fecha' => $fp, 'titulo' => 'Confirmar la fecha de instalación'];
  }
  /* 5. ayudas */
  $ayudas = [];
  foreach (filtrar_('TRAMITES', fn($t) => mismo_($t['cliente_id'], $cid)) as $t) {
    $e = normal_($t['estado']);
    if (normal_($t['tipo']) === 'cae') {
      $txt = ['documentacion' => 'Estamos reuniendo la documentación.', 'completo' => 'Documentación completa: la presentamos en breve.', 'presentado' => 'Presentado. Esperando la resolución.', 'cobrado' => 'Terminado.', 'cancelado' => 'Cancelado.'][$e] ?? 'En marcha.';
      $ayudas[] = ['titulo' => 'Certificado de Ahorro Energético (CAE)', 'estado' => $e, 'hecho' => $e === 'cobrado', 'texto' => $txt];
    } else {
      $txt = ['pendiente' => 'Vamos a solicitar el cambio de compañía con batería virtual.', 'solicitado' => 'Solicitado a la compañía.', 'pte_facturar' => 'Hecho.', 'finalizado' => 'Hecho: ya tienes tu nueva tarifa.'][$e] ?? 'En marcha.';
      $ayudas[] = ['titulo' => 'Cambio de compañía y batería virtual', 'estado' => $e, 'hecho' => in_array($e, ['pte_facturar', 'finalizado'], true), 'texto' => $txt];
    }
  }
  $hayCee = (bool)array_filter($arch, fn($a) => preg_match('/\bcee\b|certificado energ/i', txt_($a['nombre']) . ' ' . txt_($a['notas'])));
  $hayAero = (bool)array_filter($ops, fn($o) => num_($o['aero_kw']) || txt_($o['aero_modelo']) !== '' || in_array(normal_($o['tipo']), ['aero', 'fv_aero'], true));
  if ($hayAero) $ayudas[] = ['titulo' => 'Deducción en el IRPF (hasta el 60 %)', 'estado' => $hayCee ? 'en_marcha' : 'pendiente', 'hecho' => false,
    'texto' => 'Te damos el certificado energético de antes y de después. Con ellos desgravas en tu declaración de la renta durante 3 años.'];
  $ayudas[] = ['titulo' => 'Bonificación del IBI y del ICIO', 'estado' => 'info', 'hecho' => false,
    'texto' => 'Te preparamos la documentación para pedir la rebaja del IBI en tu ayuntamiento y la bonificación del ICIO de la licencia.'];
  /* 6. financiación (sin TIN) */
  $fin = [];
  foreach ($ops as $op) if (normal_($op['forma_pago']) === 'financiado') $fin[] = ['financiera' => txt_($op['financiera']), 'cuota' => num_($op['cuota']),
    'meses' => num_($op['plazo_meses']), 'texto' => 'Puedes adelantar pagos o cancelar la financiación cuando quieras sin ningún coste (amortización anticipada a coste 0).'];
  /* 7. fin de obra: solo cuando dirección lo activa */
  $finOk = normal_(prop_('PFIN_' . $cid) ?? '') === 'si';
  $conf = deJson_(prop_('PCONF_' . $cid) ?? '', null);
  return ['monitor' => $mon, 'necesitamos' => $nec, 'ayudas' => $ayudas, 'financiacion' => $fin,
    'fin' => $finOk ? ['activo' => true, 'conformidad' => is_array($conf) ? $conf : null, 'resenas' => txt_(config_()['google_resenas_url'] ?? '') ?: 'https://www.google.com/search?q=Zero+Wattios+Ingenieria+opiniones'] : null];
}

/* ---------- acciones del cliente ---------- */
function portalSubirCliente_(array $c, array $p): array {
  if (normal_($c['tipo']) !== 'cliente') return ['ok' => false, 'error' => 'Solo para clientes.'];
  $cli = buscar1_('CLIENTES', fn($x) => mismo_($x['id'], $c['cliente_id']));
  if (!$cli) return ['ok' => false, 'error' => 'No encontramos tu ficha.'];
  $k = normal_($p['que'] ?? '');
  $clase = ['dni' => 'dni', 'factura_luz' => 'factura_luz', 'contador' => 'foto'][$k] ?? 'documento';
  $datos = txt_($p['datos'] ?? '');
  if ($datos === '') return ['ok' => false, 'error' => 'No ha llegado el archivo.'];
  if (strlen($datos) > TOPE_ARCHIVO_MB * 1024 * 1024 * 1.37) return ['ok' => false, 'error' => 'El archivo pasa de ' . TOPE_ARCHIVO_MB . ' MB.'];
  $quien = portalQuien_($c);
  $proy = proyectoDe_($cli, $quien);
  $carpeta = carpetaDeProyecto_($proy, $cli);
  $nombre = mb_substr(preg_replace('#[\\\\/:*?"<>|]+#', '-', txt_($p['nombre'] ?? '')) ?: ($k . '-' . hoyISO_()), 0, 120);
  $mime = txt_($p['mime'] ?? '') ?: 'application/octet-stream';
  $a = driveSubir_($carpeta, portalEtiquetaCliente_($cli) . ' · ' . (NECESITAMOS[$k] ?? 'Documento del cliente') . ' · ' . $nombre, $datos, $mime);
  $fila = insertar_('ARCHIVOS', ['cliente_id' => $cli['id'], 'proyecto_id' => $proy['id'], 'clase' => $clase, 'nombre' => $nombre, 'archivo_id' => $a['id'] ?? '',
    'mime' => $mime, 'bytes' => $a['bytes'] ?? 0, 'miniatura' => trozo_($p['miniatura'] ?? '', 0, TOPE_MINIATURA), 'subido_por' => $quien['id'], 'subido' => ahora_(),
    'notas' => 'Subido por el cliente desde su app' . ($k === 'contador' ? ' · contador' : ''), 'visible_cliente' => 'no']);
  insertar_('SEGUIMIENTO', ['cliente_id' => $cli['id'], 'fecha' => hoyISO_(), 'canal' => 'otro', 'usuario_id' => $quien['id'], 'origen' => 'portal',
    'nota' => 'El cliente ha subido desde su app: ' . (NECESITAMOS[$k] ?? $nombre) . '.']);
  registrar_($quien, 'portal_cliente_sube', 'ARCHIVOS', $fila['id'], $k);
  return ['ok' => true];
}

function portalAceptarFecha_(array $c, array $p): array {
  if (normal_($c['tipo']) !== 'cliente') return ['ok' => false, 'error' => 'Solo para clientes.'];
  $op = buscar1_('OPERACIONES', fn($x) => mismo_($x['id'], $p['operacion_id'] ?? '') && mismo_($x['cliente_id'], $c['cliente_id']));
  if (!$op) return ['ok' => false, 'error' => 'No encontramos esa instalación.'];
  $acepta = !empty($p['acepta']); $nota = mb_substr(txt_($p['nota'] ?? ''), 0, 400);
  setProp_('PFECHA_' . $op['id'], aJson_(['fecha' => txt_($op['fecha_prevista_instalacion']), 'acepta' => $acepta, 'nota' => $nota, 'cuando' => ahora_()]));
  $quien = portalQuien_($c);
  insertar_('SEGUIMIENTO', ['cliente_id' => $c['cliente_id'], 'operacion_id' => $op['id'], 'fecha' => hoyISO_(), 'canal' => 'otro', 'usuario_id' => $quien['id'], 'origen' => 'portal',
    'nota' => ($acepta ? 'El cliente CONFIRMA desde su app' : 'El cliente NO puede') . ' la fecha de instalación del ' . txt_($op['fecha_prevista_instalacion']) . ($nota !== '' ? ': ' . $nota : '.')]);
  if (!$acepta) insertar_('TAREAS', ['creado' => ahora_(), 'creado_por' => 'portal', 'area' => 'direccion', 'titulo' => 'El cliente no puede la fecha de instalación',
    'detalle' => $nota, 'cliente_id' => $c['cliente_id'], 'prioridad' => 'alta', 'estado' => 'pendiente', 'origen' => 'portal_fecha', 'origen_id' => $op['id']]);
  return ['ok' => true];
}

function portalConformidad_(array $c, array $p): array {
  if (normal_($c['tipo']) !== 'cliente') return ['ok' => false, 'error' => 'Solo para clientes.'];
  $cid = txt_($c['cliente_id']);
  if (normal_(prop_('PFIN_' . $cid) ?? '') !== 'si') return ['ok' => false, 'error' => 'Todavía no está disponible.'];
  $cli = buscar1_('CLIENTES', fn($x) => mismo_($x['id'], $cid));
  $firma = txt_($p['firma'] ?? '');
  if ($firma === '') return ['ok' => false, 'error' => 'Falta tu firma.'];
  $quien = portalQuien_($c);
  $proy = proyectoDe_($cli, $quien);
  $a = driveSubir_(carpetaDeProyecto_($proy, $cli), portalEtiquetaCliente_($cli) . ' · Conformidad fin de obra firmada · ' . hoyISO_() . '.png', $firma, 'image/png');
  insertar_('ARCHIVOS', ['cliente_id' => $cid, 'proyecto_id' => $proy['id'], 'clase' => 'aceptacion', 'nombre' => 'Conformidad fin de obra firmada.png', 'archivo_id' => $a['id'] ?? '',
    'mime' => 'image/png', 'bytes' => $a['bytes'] ?? 0, 'subido_por' => $quien['id'], 'subido' => ahora_(),
    'notas' => 'Firmada por el cliente en su app · valoración ' . (int)($p['valoracion'] ?? 0) . '/5' . (txt_($p['comentario'] ?? '') !== '' ? ' · ' . mb_substr(txt_($p['comentario']), 0, 300) : ''), 'visible_cliente' => 'si']);
  setProp_('PCONF_' . $cid, aJson_(['fecha' => ahora_(), 'valoracion' => (int)($p['valoracion'] ?? 0), 'comentario' => mb_substr(txt_($p['comentario'] ?? ''), 0, 300)]));
  insertar_('SEGUIMIENTO', ['cliente_id' => $cid, 'fecha' => hoyISO_(), 'canal' => 'otro', 'usuario_id' => $quien['id'], 'origen' => 'portal',
    'nota' => 'El cliente ha firmado la conformidad de fin de obra en su app · valoración ' . (int)($p['valoracion'] ?? 0) . '/5.']);
  return ['ok' => true];
}

function portalRecomendar_(array $c, array $p): array {
  if (normal_($c['tipo']) !== 'cliente') return ['ok' => false, 'error' => 'Solo para clientes.'];
  $cid = txt_($c['cliente_id']);
  if (normal_(prop_('PFIN_' . $cid) ?? '') !== 'si') return ['ok' => false, 'error' => 'Todavía no está disponible.'];
  $nombre = mb_substr(txt_($p['nombre'] ?? ''), 0, 120); $tel = preg_replace('/[^\d+ ]/', '', txt_($p['telefono'] ?? ''));
  if ($nombre === '' || strlen(preg_replace('/\D/', '', $tel)) < 9) return ['ok' => false, 'error' => 'Pon el nombre y el teléfono de la persona.'];
  $cli = buscar1_('CLIENTES', fn($x) => mismo_($x['id'], $cid)) ?: [];
  $quien = portalQuien_($c);
  $nuevo = insertar_('CLIENTES', ['creado' => hoyISO_(), 'creado_por' => $quien['id'], 'nombre' => $nombre, 'telefono' => $tel,
    'direccion' => mb_substr(txt_($p['direccion'] ?? ''), 0, 200), 'municipio' => mb_substr(txt_($p['municipio'] ?? ''), 0, 80),
    'comercial_id' => txt_($cli['comercial_id'] ?? ''), 'captador_id' => txt_($cli['captador_id'] ?? ''), 'origen' => 'referido', 'estado' => 'nuevo',
    'otros' => 'Recomendado por ' . portalEtiquetaCliente_($cli) . ' desde su app' . (txt_($p['nota'] ?? '') !== '' ? ' · ' . mb_substr(txt_($p['nota']), 0, 200) : ''),
    'proxima_accion' => 'Llamar: recomendado por un cliente', 'proxima_fecha' => hoyISO_(), 'modificado' => ahora_(), 'modificado_por' => $quien['id']]);
  insertar_('TAREAS', ['creado' => ahora_(), 'creado_por' => 'portal', 'area' => 'comercial', 'usuario_id' => txt_($cli['comercial_id'] ?? ''), 'titulo' => 'Llamar a ' . $nombre . ' (recomendado por un cliente)',
    'detalle' => 'Recomendado por ' . portalEtiquetaCliente_($cli) . '.', 'cliente_id' => $nuevo['id'], 'prioridad' => 'alta', 'estado' => 'pendiente', 'origen' => 'referido', 'origen_id' => $cid]);
  registrar_($quien, 'portal_recomendar', 'CLIENTES', $nuevo['id'], $nombre);
  return ['ok' => true];
}

/** CRM, dirección: activar la parte de fin de obra (conformidad, reseña, recomendar) para un cliente. */
function accPortalActivarFin_(array $u, array $p): array {
  if ((permisos_($u)['alcance'] ?? '') !== 'todo') return ['ok' => false, 'error' => 'Solo dirección.'];
  $cid = txt_($p['cliente_id'] ?? '');
  setProp_('PFIN_' . $cid, !empty($p['activo']) ? 'si' : 'no');
  registrar_($u, 'portal_fin_' . (!empty($p['activo']) ? 'activar' : 'quitar'), 'CLIENTES', $cid, '');
  return ['ok' => true, 'activo' => !empty($p['activo'])];
}
function accPortalEstadoCliente_(array $u, array $p): array {
  $v = clienteVisible_($u, $p['cliente_id'] ?? '');
  if (isset($v['error'])) return ['ok' => false, 'error' => $v['error']];
  $cid = $v['cliente']['id'];
  $cta = buscar1_('PORTAL_CUENTAS', fn($x) => normal_($x['tipo']) === 'cliente' && mismo_($x['cliente_id'], $cid));
  $m = array_values(array_filter(leer_('MENSAJES'), fn($x) => mismo_($x['cliente_id'], $cid) && txt_($x['tipo']) === 'bienvenida'));
  return ['ok' => true, 'cuenta' => $cta ? ['activa' => txt_($cta['hash']) !== '', 'ultimo_acceso' => txt_($cta['ultimo_acceso'])] : null,
    'bienvenida' => $m ? txt_(end($m)['estado']) : '', 'firmado' => (bool)portalOperacionesFirmadas_($cid),
    'fin_activo' => normal_(prop_('PFIN_' . $cid) ?? '') === 'si', 'conformidad' => deJson_(prop_('PCONF_' . $cid) ?? '', null)];
}

/* ---------- acciones del instalador ---------- */
function portalSubirFactura_(array $c, array $p): array {
  if (normal_($c['tipo']) !== 'contrata') return ['ok' => false, 'error' => 'Solo para instaladores.'];
  $o = portalObraMia_($c, txt_($p['obra_id'] ?? ''));
  if (!$o) return ['ok' => false, 'error' => 'Esa obra no es tuya.'];
  $num = mb_substr(txt_($p['numero'] ?? ''), 0, 60); $total = num_($p['total'] ?? 0);
  if ($num === '' || $total <= 0) return ['ok' => false, 'error' => 'Pon el número de factura y el total con IVA.'];
  if (buscar1_('FACTURAS_DOC', fn($x) => normal_($x['numero']) === normal_($num) && txt_($x['origen'] ?? '') === 'contrata' && normal_($x['emisor']) === normal_(txt_($c['empresa']) ?: txt_($c['nombre']))))
    return ['ok' => false, 'error' => 'Esa factura ya está subida.'];
  $datos = txt_($p['datos'] ?? '');
  if ($datos === '') return ['ok' => false, 'error' => 'Adjunta el PDF o la foto de la factura.'];
  $fecha = txt_($p['fecha'] ?? '') ?: hoyISO_();
  $iva = txt_($p['iva_pct'] ?? '') === '' ? 21 : num_($p['iva_pct']);
  $base = num_($p['base'] ?? 0) ?: round($total / (1 + $iva / 100), 2);
  $mime = txt_($p['mime'] ?? '') ?: 'application/pdf';
  $cli = buscar1_('CLIENTES', fn($x) => mismo_($x['id'], $o['cliente_id'])) ?: [];
  $emisor = txt_($c['empresa']) ?: txt_($c['nombre']);
  $nombre = 'FACTURA ' . $emisor . ' ' . $num . ' - ' . portalEtiquetaCliente_($cli) . (strpos($mime, 'pdf') !== false ? '.pdf' : '.jpg');
  $a = driveSubir_(carpetaFacturasDoc_($fecha), $nombre, $datos, $mime);
  $quien = portalQuien_($c);
  $f = insertar_('FACTURAS_DOC', ['tipo' => 'recibida', 'numero' => $num, 'fecha' => $fecha, 'emisor' => $emisor, 'receptor' => 'ZERO WATTIOS INGENIERÍA, S.L.',
    'concepto' => 'Montaje ' . (PORTAL_ESPECIALIDADES[normal_($o['especialidad'])] ?? '') . ' · ' . portalEtiquetaCliente_($cli), 'base' => $base, 'iva_pct' => $iva,
    'iva' => round($total - $base, 2), 'total' => $total, 'cliente_id' => $o['cliente_id'], 'operacion_id' => $o['operacion_id'], 'categoria' => 'montaje',
    'estado_pago' => 'pendiente', 'archivo_id' => $a['id'] ?? '', 'archivo_nombre' => $nombre, 'mime' => $mime, 'origen' => 'contrata',
    'notas' => 'Subida por ' . $emisor . ' desde su app · obra ' . $o['id'], 'creado' => ahora_(), 'creado_por' => $quien['id']]);
  contabilizarFacturaDoc_($quien, $f);
  portalEvento_($o, $c, 'documento', 'Factura ' . $num . ' subida', false);
  registrar_($quien, 'portal_factura', 'FACTURAS_DOC', $f['id'], $emisor . ' ' . $num);
  return ['ok' => true];
}

function portalFacturasObra_(array $c, array $o): array {
  return array_values(array_map(fn($f) => ['numero' => txt_($f['numero']), 'fecha' => txt_($f['fecha']), 'total' => num_($f['total']), 'pagada' => normal_($f['casada']) === 'si'],
    array_filter(leer_('FACTURAS_DOC'), fn($f) => txt_($f['origen'] ?? '') === 'contrata' && strpos(txt_($f['notas']), 'obra ' . $o['id']) !== false)));
}

/** 9. Material de la obra: recibido completo, o algo roto / falta (con nota; las fotos van como foto de obra «material»). */
function portalMaterial_(array $c, array $p): array {
  if (normal_($c['tipo']) !== 'contrata') return ['ok' => false, 'error' => 'Solo para instaladores.'];
  $o = portalObraMia_($c, txt_($p['obra_id'] ?? ''));
  if (!$o) return ['ok' => false, 'error' => 'Esa obra no es tuya.'];
  $estado = normal_($p['estado'] ?? '') === 'incidencia' ? 'incidencia' : 'recibido';
  $nota = mb_substr(txt_($p['nota'] ?? ''), 0, 500);
  if ($estado === 'incidencia' && $nota === '') return ['ok' => false, 'error' => 'Cuenta qué falta o qué ha llegado roto.'];
  setProp_('PMAT_' . $o['id'], aJson_(['estado' => $estado, 'nota' => $nota, 'fecha' => ahora_(), 'quien' => txt_($c['empresa']) ?: txt_($c['nombre'])]));
  portalEvento_($o, $c, 'nota', $estado === 'recibido' ? 'Material recibido completo' : 'Material con incidencia: ' . $nota, false);
  if ($estado === 'incidencia') {
    $cli = buscar1_('CLIENTES', fn($x) => mismo_($x['id'], $o['cliente_id'])) ?: [];
    insertar_('INCIDENCIAS', ['creado' => ahora_(), 'creado_por' => portalQuien_($c)['id'], 'fecha' => hoyISO_(), 'titulo' => 'Material: falta o llega roto · ' . portalEtiquetaCliente_($cli),
      'detalle' => $nota, 'cliente_id' => $o['cliente_id'], 'urgencia' => 'alta', 'estado' => 'abierta', 'origen' => 'portal', 'origen_id' => $o['id']]);
  }
  return ['ok' => true];
}
function portalMaterialObra_(array $o, array $op): array {
  $eq = function_exists('portalEquiposOp_') ? portalEquiposOp_($op, normal_($o['especialidad'])) : [];
  return ['lista' => array_map(fn($e) => ['equipo' => $e['equipo'], 'detalle' => $e['detalle'], 'cantidad' => $e['cantidad']], $eq),
    'estado' => deJson_(prop_('PMAT_' . $o['id']) ?? '', null), 'fecha_prevista' => txt_($o['fecha_prevista'])];
}

/** 10. Documentación del instalador. */
function portalDocsContrata_(array $c, array $p): array {
  if (normal_($c['tipo']) !== 'contrata') return ['ok' => false, 'error' => 'Solo para instaladores.'];
  $l = array_values(array_filter(leer_('DOCS_CONTRATA'), fn($d) => mismo_($d['cuenta_id'], $c['id'])));
  usort($l, fn($a, $b) => strcmp(txt_($b['subido']), txt_($a['subido'])));
  return ['ok' => true, 'tipos' => DOCS_CONTRATA, 'docs' => array_map(fn($d) => ['id' => $d['id'], 'tipo' => $d['tipo'], 'nombre' => $d['nombre'], 'caduca' => $d['caduca'],
    'estado' => $d['estado'], 'subido' => $d['subido'], 'notas' => $d['notas']], $l), 'faltan' => docsQueFaltan_($c['id'])];
}
function docsQueFaltan_(string $cuentaId): array {
  $docs = filtrar_('DOCS_CONTRATA', fn($d) => mismo_($d['cuenta_id'], $cuentaId) && normal_($d['estado']) !== 'rechazado');
  $o = [];
  foreach (['seguro', 'rea', 'prl', 'tc2'] as $k) {
    $v = array_values(array_filter($docs, fn($d) => txt_($d['tipo']) === $k));
    usort($v, fn($a, $b) => strcmp(txt_($b['caduca']), txt_($a['caduca'])));
    if (!$v) $o[] = ['tipo' => $k, 'nombre' => DOCS_CONTRATA[$k], 'motivo' => 'falta'];
    elseif (txt_($v[0]['caduca']) !== '' && txt_($v[0]['caduca']) < hoyISO_()) $o[] = ['tipo' => $k, 'nombre' => DOCS_CONTRATA[$k], 'motivo' => 'caducado el ' . $v[0]['caduca']];
    elseif (txt_($v[0]['caduca']) !== '' && txt_($v[0]['caduca']) <= sumarDias_(hoyISO_(), 30)) $o[] = ['tipo' => $k, 'nombre' => DOCS_CONTRATA[$k], 'motivo' => 'caduca el ' . $v[0]['caduca']];
  }
  return $o;
}
function portalSubirDocContrata_(array $c, array $p): array {
  if (normal_($c['tipo']) !== 'contrata') return ['ok' => false, 'error' => 'Solo para instaladores.'];
  $tipo = normal_($p['tipo'] ?? '');
  if (!isset(DOCS_CONTRATA[$tipo])) return ['ok' => false, 'error' => 'Elige qué documento es.'];
  $datos = txt_($p['datos'] ?? '');
  if ($datos === '') return ['ok' => false, 'error' => 'No ha llegado el archivo.'];
  $mime = txt_($p['mime'] ?? '') ?: 'application/pdf';
  $emp = txt_($c['empresa']) ?: txt_($c['nombre']);
  $carpeta = '';
  try { $raiz = driveCarpeta_('DOCUMENTACIÓN SUBCONTRATAS · CRM ZERO WATTIOS', '', true); $carpeta = driveCarpeta_($emp, $raiz, true); } catch (Throwable $e) { $carpeta = ''; }
  $nombre = $emp . ' · ' . DOCS_CONTRATA[$tipo] . ' · ' . hoyISO_() . (strpos($mime, 'pdf') !== false ? '.pdf' : '.jpg');
  $a = driveSubir_($carpeta, $nombre, $datos, $mime);
  insertar_('DOCS_CONTRATA', ['cuenta_id' => $c['id'], 'tipo' => $tipo, 'nombre' => $nombre, 'archivo_id' => $a['id'] ?? '', 'mime' => $mime,
    'caduca' => txt_($p['caduca'] ?? ''), 'subido' => ahora_(), 'subido_por' => portalQuien_($c)['id'], 'estado' => 'pendiente', 'notas' => mb_substr(txt_($p['notas'] ?? ''), 0, 200)]);
  registrar_(portalQuien_($c), 'portal_doc_contrata', 'DOCS_CONTRATA', '', $tipo);
  return ['ok' => true];
}

/* ---------- CRM, dirección: documentación y ficha de cada instalador ---------- */
function accDocsContratas_(array $u, array $p): array {
  if ((permisos_($u)['alcance'] ?? '') !== 'todo') return ['ok' => false, 'error' => 'Solo dirección.'];
  $o = [];
  foreach (filtrar_('PORTAL_CUENTAS', fn($c) => normal_($c['tipo']) === 'contrata') as $c) {
    $o[] = ['id' => $c['id'], 'empresa' => txt_($c['empresa']) ?: txt_($c['nombre']), 'especialidad' => txt_($c['especialidad']), 'activo' => txt_($c['activo']),
      'ultimo_acceso' => txt_($c['ultimo_acceso']), 'faltan' => docsQueFaltan_($c['id']),
      'docs' => array_values(array_map(fn($d) => array_diff_key($d, ['_fila' => 1]), filtrar_('DOCS_CONTRATA', fn($d) => mismo_($d['cuenta_id'], $c['id'])))),
      'stats' => statsContrata_($c)];
  }
  return ['ok' => true, 'contratas' => $o, 'tipos' => DOCS_CONTRATA];
}
function accValidarDocContrata_(array $u, array $p): array {
  if ((permisos_($u)['alcance'] ?? '') !== 'todo') return ['ok' => false, 'error' => 'Solo dirección.'];
  $d = buscar1_('DOCS_CONTRATA', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$d) return ['ok' => false, 'error' => 'Ese documento ya no está.'];
  $e = normal_($p['estado'] ?? '') === 'rechazado' ? 'rechazado' : 'valido';
  actualizar_('DOCS_CONTRATA', $d['id'], ['estado' => $e] + (txt_($p['caduca'] ?? '') !== '' ? ['caduca' => txt_($p['caduca'])] : []) + (txt_($p['notas'] ?? '') !== '' ? ['notas' => mb_substr(txt_($p['notas']), 0, 200)] : []));
  registrar_($u, 'doc_contrata_' . $e, 'DOCS_CONTRATA', $d['id'], txt_($d['tipo']));
  return ['ok' => true];
}
function accVerDocContrata_(array $u, array $p): array {
  if ((permisos_($u)['alcance'] ?? '') !== 'todo') return ['ok' => false, 'error' => 'Solo dirección.'];
  $d = buscar1_('DOCS_CONTRATA', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$d) return ['ok' => false, 'error' => 'Ese documento ya no está.'];
  $a = driveDescargar_(txt_($d['archivo_id']));
  return ['ok' => true, 'nombre' => txt_($d['nombre']), 'mime' => txt_($d['mime']) ?: ($a['mime'] ?? ''), 'datos' => $a['base64'] ?? ''];
}

/** 11. Puntualidad, respuesta a tickets, incidencias y fotos de fases que faltan. */
function statsContrata_(array $c): array {
  $obras = filtrar_('OBRAS', fn($o) => mismo_($o['contrata_id'], $c['id']) && normal_($o['estado']) !== 'cancelada');
  $conFecha = array_filter($obras, fn($o) => txt_($o['fecha_prevista']) !== '' && txt_($o['llegada']) !== '');
  $puntuales = array_filter($conFecha, fn($o) => substr(txt_($o['llegada']), 0, 10) <= txt_($o['fecha_prevista']));
  $tickets = filtrar_('TICKETS', fn($t) => mismo_($t['contrata_id'], $c['id']));
  $resp = array_filter($tickets, fn($t) => txt_($t['primera_respuesta']) !== '');
  $enPlazo = array_filter($resp, fn($t) => txt_($t['limite_respuesta']) === '' || strcmp(txt_($t['primera_respuesta']), txt_($t['limite_respuesta'])) <= 0);
  $incid = count(filtrar_('INCIDENCIAS', fn($i) => in_array(txt_($i['origen_id']), array_map(fn($o) => txt_($o['id']), $obras), true)));
  $faltanFotos = 0;
  $ops = indexar_(leer_('OPERACIONES'));
  foreach ($obras as $o) {
    if (!in_array(normal_($o['estado']), ['terminada', 'validada'], true)) continue;
    $hechas = deJson_($o['checklist'] ?? '', []) ?: [];
    foreach (portalFasesDe_($o, $ops[txt_($o['operacion_id'])] ?? []) as $f) if (!empty($f[2]) && empty($hechas[$f[0]])) $faltanFotos++;
  }
  return ['obras' => count($obras), 'terminadas' => count(array_filter($obras, fn($o) => in_array(normal_($o['estado']), ['terminada', 'validada'], true))),
    'puntualidad' => count($conFecha) ? round(count($puntuales) * 100 / count($conFecha)) : null, 'tickets' => count($tickets),
    'respuesta_en_plazo' => count($resp) ? round(count($enPlazo) * 100 / count($resp)) : null, 'incidencias' => $incid, 'fases_sin_foto' => $faltanFotos];
}
