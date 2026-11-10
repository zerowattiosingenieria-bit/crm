<?php
/**
 * api.php — Puerta de entrada del CRM. (Traducción de 10_Api.gs)
 *
 * El navegador envía una única petición POST con un JSON en el cuerpo. La
 * entrada HTTP (leer el cuerpo, devolver el JSON) la hace otro archivo;
 * aquí `despachar_($p)` comprueba la sesión y reparte el trabajo.
 */

require_once __DIR__ . '/base.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/registro.php';

/* El mapa se construye al recibir la petición. Son NOMBRES de función: así
   da igual que el módulo que define una acción no esté cargado todavía. */
function acciones_(): array {
  return [
    /* sesión */
    'salir' => 'accSalir_',
    'cambiarClave' => 'accCambiarClave_',
    'misEquipos' => 'accMisEquipos_',
    'olvidarEquipo' => 'accOlvidarEquipo_',

    /* datos */
    'datos' => 'accDatos_',
    'buscar' => 'accBuscar_',
    'guardarCliente' => 'accGuardarCliente_',
    'borrarCliente' => 'accBorrarCliente_',
    'guardarOperacion' => 'accGuardarOperacion_',
    'borrarOperacion' => 'accBorrarOperacion_',
    'guardarSeguimiento' => 'accGuardarSeguimiento_',
    'guardarCaptacion' => 'accGuardarCaptacion_',
    'borrarCaptacion' => 'accBorrarCaptacion_',

    /* carpeta del cliente y proyecto */
    'proyecto' => 'accProyecto_',
    'guardarProyecto' => 'accGuardarProyecto_',
    'cotizaciones' => 'accCotizaciones_',
    'fichaTecnica' => 'accFichaTecnica_',
    'guardarCotizacion' => 'accGuardarCotizacion_',
    'subirArchivo' => 'accSubirArchivo_',
    'descargarArchivo' => 'accDescargarArchivo_',
    'borrarArchivo' => 'accBorrarArchivo_',
    'entregarProyecto' => 'accEntregarProyecto_',
    'enviadoProyecto' => 'accEnviadoProyecto_',
    'estadoProyecto' => 'accEstadoProyecto_',
    'proyectosPendientes' => 'accProyectosPendientes_',

    /* tablero de cada uno: cifras del Centro de Mando y tareas */
    'cifras' => 'accCifras_',
    'guardarCifras' => 'accGuardarCifras_',
    'tareas' => 'accTareas_',
    'guardarTarea' => 'accGuardarTarea_',
    'estadoTarea' => 'accEstadoTarea_',
    'borrarTarea' => 'accBorrarTarea_',

    /* finanzas */
    'finanzas' => 'accFinanzas_',
    'guardarCobro' => 'accGuardarCobro_',
    'borrarCobro' => 'accBorrarCobro_',
    'guardarFactura' => 'accGuardarFactura_',
    'borrarFactura' => 'accBorrarFactura_',
    'guardarGasto' => 'accGuardarGasto_',
    'borrarGasto' => 'accBorrarGasto_',

    /* parte diario */
    'guardarParte' => 'accGuardarParte_',
    'aplicarParte' => 'accAplicarParte_',
    'reanalizar' => 'accReanalizar_',
    'partes' => 'accPartes_',

    /* resúmenes y analítica */
    'resumen' => 'accResumen_',
    'equipo' => 'accEquipo_',
    'analitica' => 'accAnalitica_',
    'alertas' => 'accAlertas_',

    /* nóminas */
    'nominas' => 'accNominas_',
    'nominaDias' => 'accNominaDias_',
    'generarNomina' => 'accGenerarNomina_',
    'guardarNomina' => 'accGuardarNomina_',
    'subirNomina' => 'accSubirNomina_',
    'descargarNomina' => 'accDescargarNomina_',
    'borrarNomina' => 'accBorrarNomina_',
    'guardarJornada' => 'accGuardarJornada_',

    /* vacaciones */
    'vacaciones' => 'accVacaciones_',
    'solicitarVacaciones' => 'accSolicitarVacaciones_',
    'resolverVacaciones' => 'accResolverVacaciones_',
    'cancelarVacaciones' => 'accCancelarVacaciones_',

    /* mapa */
    'mapa' => 'accMapa_',
    'geocodificar' => 'accGeocodificar_',

    /* administración */
    'usuarios' => 'accUsuarios_',
    'importar' => 'accImportar_',
    'guardarUsuario' => 'accGuardarUsuario_',
    'resetClave' => 'accResetClave_',
    'guardarConfig' => 'accGuardarConfig_',
    'registro' => 'accRegistro_',

    /* directorio histórico y puertas */
    'directorio' => 'accDirectorio_',
    'directorioFicha' => 'accDirectorioFicha_',
    'puertas' => 'accPuertas_',
    'importarDirectorio' => 'accImportarDirectorio_',
    'importarDirVisitas' => 'accImportarDirVisitas_',
    'importarPuertas' => 'accImportarPuertas_',
    'guardarDirectorio' => 'accGuardarDirectorio_',
    'borrarDirectorio' => 'accBorrarDirectorio_',
    'guardarPuerta' => 'accGuardarPuerta_',
    'borrarPuertas' => 'accBorrarPuertas_',
    'limpiarPuertasFuera' => 'accLimpiarPuertasFuera_',
    'avisoPuertas' => 'accAvisoPuertas_',

    /* banco */
    'banco' => 'accBanco_',
    'importarBanco' => 'accImportarBanco_',
    'guardarMovimiento' => 'accGuardarMovimiento_',
    'gastoDesdeBanco' => 'accGastoDesdeBanco_',
    'reclasificarBanco' => 'accReclasificarBanco_',
    'ajustarEstructura' => 'accAjustarEstructura_',

    /* copias de seguridad */
    'copias' => 'accCopias_',
    'copiaAhora' => 'accCopiaAhora_',
    'descargarCopia' => 'accDescargarCopia_',

    /* resumen semanal por correo */
    'resumenSemanalAhora' => 'accResumenSemanalAhora_',
    'probarResumen' => 'accProbarResumen_',

    /* Mejoras del 02/11/2026 (21_Mejoras.gs → mejoras.php) */
    'llaveServicio' => 'accLlaveServicio_',
    'revocarLlaves' => 'accRevocarLlaves_',
    'agendaHuecos' => 'accAgendaHuecos_',
    'comprobarCita' => 'accComprobarCita_',
    'pedirCambios' => 'accPedirCambios_',
    'casarAuto' => 'accCasarAuto_',
    'alertasBanco' => 'accAlertasBanco_',
    'catastro' => 'accCatastro_',

    /* Un cliente, una ficha (22_Ficha.gs → ficha.php) */
    'duplicados' => 'accDuplicados_',
    'fusionarClientes' => 'accFusionarClientes_',
    'recordarCRM' => 'accRecordarCRM_', 'recordatorios' => 'accRecordatorios_',
    /* Reagendar y cancelar citas, estadísticas e histórico del lead (estadisticas.php, historial.php) */
    'reagendarCita' => 'accReagendarCita_', 'cancelarCita' => 'accCancelarCita_', 'estadisticas' => 'accEstadisticas_',
    'historialCambios' => 'accHistorialCambios_', 'coordenadasZona' => 'accCoordenadasZona_',
    /* Incidencias para Rubén y dirección (incidencias.php, 03/11/2026) */
    'incidencias' => 'accIncidencias_', 'guardarIncidencia' => 'accGuardarIncidencia_', 'resolverIncidencia' => 'accResolverIncidencia_',
    'guardarAvisoIncidencia' => 'accGuardarAvisoIncidencia_',
    /* CAEs (Novawatt) y WIXER, y estado de la sincronización contable (tramites.php, 09/11/2026) */
    'tramites' => 'accTramites_', 'guardarTramite' => 'accGuardarTramite_', 'importarTramites' => 'accImportarTramites_',
    'syncContabilidad' => 'accSyncContabilidad_',
    /* Apps de clientes y subcontratas, lado CRM (portal.php, 10/11/2026) */
    'cuentasPortal' => 'accCuentasPortal_', 'guardarCuentaPortal' => 'accGuardarCuentaPortal_', 'verComoPortal' => 'accVerComoPortal_',
    'obrasPortal' => 'accObrasPortal_', 'obraPortal' => 'accObraPortal_', 'guardarObraPortal' => 'accGuardarObraPortal_',
    'responderTicketPortal' => 'accResponderTicketPortal_', 'visibleArchivoPortal' => 'accVisibleArchivoPortal_', 'subirArchivoObra' => 'accSubirArchivoObra_'
  ];
}

/* Cada petición queda en el registro (registro.php): la abre
   empezarPeticion_ y la cierra cerrarPeticion_, que apunta la fila si la
   acción no lo ha hecho ya. El «ping» no, que no es nadie haciendo nada. */
function despachar_($p): array {
  $p = is_array($p) ? $p : [];
  $accion = txt_($p['accion'] ?? '');
  if ($accion === 'ping') return ['ok' => true, 'version' => VERSION, 'servidor' => ahora_()];
  asegurarEsquema_();
  empezarPeticion_($p, $accion);
  try {
    $r = atender_($p, $accion);
  } catch (Throwable $err) {
    $r = ['ok' => false, 'error' => $err->getMessage() !== '' ? $err->getMessage() : get_class($err)];
  }
  cerrarPeticion_($r);
  return $r;
}

/**
 * Si el ESQUEMA ha cambiado (despliegue nuevo con tablas o columnas nuevas),
 * la primera petición crea lo que falta. Se mira con una huella guardada:
 * una lectura de una propiedad por petición.
 */
function asegurarEsquema_(): void {
  try {
    $huella = md5(json_encode(ESQUEMA));
    if (prop_('ESQUEMA_HUELLA') === $huella) return;
    require_once __DIR__ . '/esquema.php';
    instalarEsquema_();
    setProp_('ESQUEMA_HUELLA', $huella);
  } catch (Throwable $e) { error_log('CRM esquema: ' . $e->getMessage()); }
}

function atender_(array $p, string $accion): array {
  if ($accion === 'login') return accLogin_($p);
  if ($accion === 'loginCodigo') return accLoginCodigo_($p);
  /* Las apps de clientes y subcontratas llevan sus propias cuentas y sesiones:
     un token del portal nunca vale para el CRM ni al revés. */
  if (strpos($accion, 'portal') === 0) {
    if (!function_exists('atenderPortal_')) return ['ok' => false, 'error' => 'Acción no disponible.'];
    return atenderPortal_($p, $accion);
  }
  $fn = acciones_()[$accion] ?? null;
  if (!$fn) return ['ok' => false, 'error' => 'Acción desconocida: ' . $accion];
  if (!function_exists($fn)) return ['ok' => false, 'error' => 'Acción no disponible: ' . $accion];

  $u = sesion_($p['token'] ?? '');
  if (!$u) return ['ok' => false, 'error' => 'Sesión caducada. Vuelve a entrar.', 'sesion' => false];
  $r = $fn($u, $p);
  return is_array($r) ? $r : ['ok' => true];
}

/* ---------- configuración y registro ---------- */

function accGuardarConfig_(array $u, array $p): array {
  exigir_($u, 'config');
  olvidarConfig_();                      // lo que había en memoria ya no vale
  $cambios = is_array($p['config'] ?? null) ? $p['config'] : [];
  foreach ($cambios as $k => $v) escribirConfig_((string)$k, $v);   // cambia la clave o la crea (sin descripción)
  registrar_($u, 'config', 'CONFIG', '', implode(',', array_keys($cambios)));
  return ['ok' => true, 'config' => config_()];
}

/* accRegistro_ vive en registro.php, con el resto del registro. */
