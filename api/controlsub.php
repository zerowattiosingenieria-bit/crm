<?php
/**
 * controlsub.php — Control de subcontratas de un vistazo (25/11/2026, Nando).
 *
 * «Un apartado aparte donde solo Nando, Fernando y el superadmin vean de un
 *  vistazo cómo van las subcontratas, muy gráfico y sencillo. Desde ahí tengo
 *  que poder mandarles algo, resolver sus incidencias o aclararles cómo hacer
 *  la instalación.»
 *
 * Solo CONTROL_SUB_USUARIOS (config.php). Lee lo mismo que «Obras de
 * subcontratas» (portal.php) y añade lo que hace falta para el semáforo:
 * último acceso, documentos que faltan, actividad de los últimos días y
 * próximas obras. Acciones: mensaje o documento a una subcontrata (sale como
 * conversación en su app, sin plazo), instrucciones de una obra y responder
 * o resolver sus tickets.
 */

function exigirControlSub_(array $u): void {
  if (empty(permisos_($u)['controlsub'])) throw new Exception('El control de subcontratas es solo para Nando, Fernando y el superadmin.');
}

function accControlSubcontratas_(array $u, array $p): array {
  exigirControlSub_($u);
  $d = datosObrasPortal_();
  $cuentas = indexar_(leer_('PORTAL_CUENTAS'));
  $obrasPorId = indexar_(leer_('OBRAS'));
  $desde = sumarDias_(hoyISO_(), -7) . ' 00:00:00';
  /* actividad de los últimos 7 días (llegadas, fases, fotos, avisos…) */
  $act = [];
  foreach (leer_('OBRA_EVENTOS') as $e) {
    if (strcmp(txt_($e['fecha']), $desde) < 0) continue;
    $o = $obrasPorId[txt_($e['obra_id'])] ?? null; if (!$o) continue;
    $act[] = ['fecha' => txt_($e['fecha']), 'obra_id' => txt_($e['obra_id']), 'contrata_id' => txt_($o['contrata_id']), 'tipo' => normal_($e['tipo']),
      'detalle' => trozo_(txt_($e['detalle']), 0, 160), 'autor' => txt_($e['autor'])];
  }
  usort($act, fn($a, $b) => strcmp($b['fecha'], $a['fecha']));
  $porContrata = [];
  foreach ($act as $a) $porContrata[$a['contrata_id']] = ($porContrata[$a['contrata_id']] ?? 0) + 1;
  foreach ($d['contratas'] as &$k) {
    $c = $cuentas[$k['id']] ?? [];
    $k['ultimo_acceso'] = txt_($c['ultimo_acceso'] ?? '');
    $k['telefono'] = txt_($c['telefono'] ?? ''); $k['email'] = txt_($c['email'] ?? ''); $k['contacto'] = txt_($c['nombre'] ?? '');
    $k['docs_faltan'] = function_exists('docsQueFaltan_') ? docsQueFaltan_($k['id']) : [];
    $k['actividad_7d'] = $porContrata[$k['id']] ?? 0;
    $abiertos = array_filter($d['tickets'], fn($t) => $t['contrata_id'] === $k['id'] && in_array($t['estado'], ['abierto', 'en_curso'], true));
    $k['tickets_abiertos'] = count($abiertos);
    $k['tickets_esperando'] = count(array_filter($abiertos, fn($t) => $t['origen'] !== 'zw' && ($t['mensajes'] ? end($t['mensajes'])['de'] !== 'zw' : true)));
    $k['tickets_fuera_ahora'] = count(array_filter($abiertos, fn($t) => !empty($t['fuera_de_plazo']) && $t['origen'] !== 'zw'));
    $suyas = array_values(array_filter($d['obras'], fn($o) => $o['contrata_id'] === $k['id']));
    $k['en_obra'] = count(array_filter($suyas, fn($o) => !empty($o['en_obra'])));
    $k['por_validar'] = count(array_filter($suyas, fn($o) => $o['estado'] === 'terminada'));
    $hechas = array_filter($suyas, fn($o) => in_array($o['estado'], ['terminada', 'validada'], true));
    $k['progreso_medio'] = $suyas ? (int)round(array_sum(array_map(fn($o) => $o['progreso'], array_filter($suyas, fn($o) => $o['estado'] === 'en_curso'))) / max(1, count(array_filter($suyas, fn($o) => $o['estado'] === 'en_curso')))) : 0;
    /* semáforo: rojo si hay obras retrasadas o tickets fuera de plazo; ámbar si faltan documentos, hay tickets esperando o lleva 7 días sin entrar con obras activas */
    $sinEntrar = $k['activas'] > 0 && ($k['ultimo_acceso'] === '' || minutosDesde_($k['ultimo_acceso']) > 7 * 1440);
    $k['semaforo'] = ($k['retrasadas'] > 0 || $k['tickets_fuera_ahora'] > 0) ? 'rojo' : (($k['docs_faltan'] || $k['tickets_esperando'] > 0 || $sinEntrar) ? 'ambar' : 'verde');
    $motivos = [];
    if ($k['retrasadas']) $motivos[] = $k['retrasadas'] . ($k['retrasadas'] === 1 ? ' obra retrasada' : ' obras retrasadas');
    if ($k['tickets_fuera_ahora']) $motivos[] = $k['tickets_fuera_ahora'] . ' incidencia(s) fuera de plazo';
    if ($k['tickets_esperando']) $motivos[] = $k['tickets_esperando'] . ' mensaje(s) esperando respuesta';
    if ($k['docs_faltan']) $motivos[] = 'Documentación pendiente: ' . implode(', ', array_map(fn($x) => ['seguro' => 'seguro RC', 'rea' => 'REA', 'prl' => 'PRL', 'tc2' => 'TC2'][$x['tipo']] . ($x['motivo'] === 'falta' ? '' : ' (' . $x['motivo'] . ')'), $k['docs_faltan']));
    if ($sinEntrar) $motivos[] = 'lleva más de 7 días sin entrar en su app';
    $k['motivos'] = $motivos;
  }
  unset($k);
  /* detalle útil de cada obra para el tablero */
  foreach ($d['obras'] as &$o) {
    $x = $obrasPorId[$o['id']] ?? [];
    $o['instrucciones'] = txt_($x['instrucciones'] ?? '');
    $o['contacto_obra'] = txt_($x['contacto_obra'] ?? '');
    $o['ultima_actividad'] = '';
    foreach ($act as $a) if ($a['obra_id'] === $o['id']) { $o['ultima_actividad'] = $a['fecha'] . ' · ' . $a['detalle']; break; }
  }
  unset($o);
  return $d + ['actividad' => array_slice($act, 0, 60), 'hoy' => hoyISO_()];
}

/**
 * Mensaje (y si se quiere, un documento) de Zero Wattios a una subcontrata. Sale en su app como
 * una conversación más; puede ir sobre una obra concreta. p.contrata_id, p.obra_id, p.titulo,
 * p.texto, p.prioridad, p.datos / p.nombre / p.mime (archivo opcional, solo con obra).
 */
function accMensajeContrata_(array $u, array $p): array {
  exigirControlSub_($u);
  $cta = buscar1_('PORTAL_CUENTAS', fn($x) => mismo_($x['id'], $p['contrata_id'] ?? '') && normal_($x['tipo']) === 'contrata');
  if (!$cta) return ['ok' => false, 'error' => 'Elige la subcontrata.'];
  $texto = mb_substr(txt_($p['texto'] ?? ''), 0, 3000);
  $titulo = mb_substr(txt_($p['titulo'] ?? ''), 0, 200) ?: mb_substr($texto, 0, 80);
  if ($texto === '' && $titulo === '') return ['ok' => false, 'error' => 'Escribe el mensaje.'];
  $obra = null;
  if (txt_($p['obra_id'] ?? '') !== '') {
    $obra = buscar1_('OBRAS', fn($x) => mismo_($x['id'], $p['obra_id']));
    if (!$obra) return ['ok' => false, 'error' => 'Esa obra ya no está.'];
  }
  $archivo = null;
  if (txt_($p['datos'] ?? '') !== '') {
    if (!$obra) return ['ok' => false, 'error' => 'Para mandar un documento elige la obra.'];
    $r = portalGuardarArchivo_($obra, ['datos' => $p['datos'], 'nombre' => $p['nombre'] ?? '', 'mime' => $p['mime'] ?? '', 'notas' => mb_substr($titulo, 0, 60)],
      'documento_instalador', $u, 'no');
    if (empty($r['ok'])) return $r;
    $archivo = $r['archivo'];
  }
  $prio = isset(PORTAL_SLA[normal_($p['prioridad'] ?? '')]) ? normal_($p['prioridad']) : 'media';
  $ahora = ahora_();
  $autor = 'Zero Wattios · ' . primerNombre_($u['nombre'] ?? '');
  $t = insertar_('TICKETS', ['obra_id' => txt_($obra['id'] ?? ''), 'cliente_id' => txt_($obra['cliente_id'] ?? ''), 'contrata_id' => $cta['id'], 'cuenta_id' => '',
    'origen' => 'zw', 'titulo' => $titulo, 'detalle' => $texto, 'prioridad' => $prio, 'estado' => 'en_curso', 'creado' => $ahora,
    /* lo manda Zero Wattios: no corre plazo ni se escala */
    'limite_respuesta' => dentroDe_(60 * 24 * 365), 'limite_resolucion' => dentroDe_(60 * 24 * 365), 'primera_respuesta' => $ahora,
    'mensajes' => aJson_([['fecha' => $ahora, 'de' => 'zw', 'autor' => $autor, 'texto' => ($texto ?: $titulo) . ($archivo ? "\n\n📎 Documento: " . $archivo['nombre'] . ' (en la ficha de la obra)' : ''), 'para' => 'contrata']]),
    'modificado' => $ahora]);
  if ($obra) portalEvento_($obra, ['id' => $u['id'], 'nombre' => 'Zero Wattios', 'empresa' => 'Zero Wattios'], 'nota', 'Mensaje de Zero Wattios: ' . mb_substr($titulo, 0, 120), false);
  $enviado = portalCorreo_(txt_($cta['email']), 'Mensaje de Zero Wattios · ' . $titulo, 'Tienes un mensaje de Zero Wattios',
    '<p><b>' . htmlspecialchars($titulo) . '</b></p><p style="background:#f4f6f3;border-left:3px solid #B4FA1E;padding:10px 12px">' . nl2br(htmlspecialchars($texto)) . '</p>' .
    '<p>Contéstalo desde la app, en «Tickets».</p>', $cta);
  registrar_($u, 'mensaje_contrata', 'TICKETS', $t['id'], (txt_($cta['empresa']) ?: txt_($cta['usuario'])) . ' · ' . $titulo);
  return ['ok' => true, 'ticket' => portalTicketPublico_($t, 'zw'), 'correo' => $enviado];
}

/** Instrucciones de una obra para el instalador (las ve en la ficha de la obra). */
function accInstruccionesObra_(array $u, array $p): array {
  exigirControlSub_($u);
  $o = buscar1_('OBRAS', fn($x) => mismo_($x['id'], $p['obra_id'] ?? ''));
  if (!$o) return ['ok' => false, 'error' => 'Esa obra ya no está.'];
  $ins = mb_substr(txt_($p['instrucciones'] ?? ''), 0, 3000);
  $o = actualizar_('OBRAS', $o['id'], ['instrucciones' => $ins, 'modificado' => ahora_(), 'modificado_por' => $u['id']]);
  portalEvento_($o, ['id' => $u['id'], 'nombre' => 'Zero Wattios', 'empresa' => 'Zero Wattios'], 'nota', 'Zero Wattios ha actualizado las instrucciones de la obra', false);
  registrar_($u, 'instrucciones_obra', 'OBRAS', $o['id'], mb_substr($ins, 0, 120));
  return ['ok' => true];
}

/** Responder, resolver o reabrir un ticket desde el control (mismo camino que dirección). */
function accTicketControl_(array $u, array $p): array {
  exigirControlSub_($u);
  $GLOBALS['ZW_CONTROL_SUB'] = true;
  try { return accResponderTicketPortal_($u, $p); } finally { $GLOBALS['ZW_CONTROL_SUB'] = false; }
}
