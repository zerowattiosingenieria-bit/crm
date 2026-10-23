/**
 * 10_Api.gs — Puerta de entrada del CRM.
 *
 * El navegador envía una única petición POST con un JSON en el cuerpo y
 * el tipo text/plain (así el navegador no hace petición previa de CORS).
 * Aquí se comprueba la sesión y se reparte el trabajo.
 */

/* El mapa se construye al recibir la petición, no al cargar el archivo: así
   da igual en qué orden evalúe Apps Script los archivos del proyecto. */
function acciones_() {
  return {
    /* sesión */
    salir: accSalir_,
    cambiarClave: accCambiarClave_,
    misEquipos: accMisEquipos_,
    olvidarEquipo: accOlvidarEquipo_,

    /* datos */
    datos: accDatos_,
    buscar: accBuscar_,
    guardarCliente: accGuardarCliente_,
    borrarCliente: accBorrarCliente_,
    guardarOperacion: accGuardarOperacion_,
    borrarOperacion: accBorrarOperacion_,
    guardarSeguimiento: accGuardarSeguimiento_,
    guardarCaptacion: accGuardarCaptacion_,
    borrarCaptacion: accBorrarCaptacion_,

    /* carpeta del cliente y proyecto */
    proyecto: accProyecto_,
    guardarProyecto: accGuardarProyecto_,
    subirArchivo: accSubirArchivo_,
    descargarArchivo: accDescargarArchivo_,
    borrarArchivo: accBorrarArchivo_,
    entregarProyecto: accEntregarProyecto_,
    enviadoProyecto: accEnviadoProyecto_,
    estadoProyecto: accEstadoProyecto_,
    proyectosPendientes: accProyectosPendientes_,

    /* tablero de cada uno: cifras del Centro de Mando y tareas */
    cifras: accCifras_,
    guardarCifras: accGuardarCifras_,
    tareas: accTareas_,
    guardarTarea: accGuardarTarea_,
    estadoTarea: accEstadoTarea_,
    borrarTarea: accBorrarTarea_,

    /* finanzas */
    finanzas: accFinanzas_,
    guardarCobro: accGuardarCobro_,
    borrarCobro: accBorrarCobro_,
    guardarFactura: accGuardarFactura_,
    borrarFactura: accBorrarFactura_,
    guardarGasto: accGuardarGasto_,
    borrarGasto: accBorrarGasto_,

    /* parte diario */
    guardarParte: accGuardarParte_,
    aplicarParte: accAplicarParte_,
    reanalizar: accReanalizar_,
    partes: accPartes_,

    /* resúmenes y analítica */
    resumen: accResumen_,
    equipo: accEquipo_,
    analitica: accAnalitica_,
    alertas: accAlertas_,

    /* nóminas */
    nominas: accNominas_,
    nominaDias: accNominaDias_,
    generarNomina: accGenerarNomina_,
    guardarNomina: accGuardarNomina_,
    subirNomina: accSubirNomina_,
    descargarNomina: accDescargarNomina_,
    borrarNomina: accBorrarNomina_,
    guardarJornada: accGuardarJornada_,

    /* vacaciones */
    vacaciones: accVacaciones_,
    solicitarVacaciones: accSolicitarVacaciones_,
    resolverVacaciones: accResolverVacaciones_,
    cancelarVacaciones: accCancelarVacaciones_,

    /* mapa */
    mapa: accMapa_,
    geocodificar: accGeocodificar_,

    /* administración */
    usuarios: accUsuarios_,
    importar: accImportar_,
    guardarUsuario: accGuardarUsuario_,
    resetClave: accResetClave_,
    guardarConfig: accGuardarConfig_,
    registro: accRegistro_,

    /* directorio histórico y puertas */
    directorio: accDirectorio_,
    directorioFicha: accDirectorioFicha_,
    puertas: accPuertas_,
    importarDirectorio: accImportarDirectorio_,
    importarDirVisitas: accImportarDirVisitas_,
    importarPuertas: accImportarPuertas_,
    guardarDirectorio: accGuardarDirectorio_,
    borrarDirectorio: accBorrarDirectorio_,
    guardarPuerta: accGuardarPuerta_,
    borrarPuertas: accBorrarPuertas_,
    limpiarPuertasFuera: accLimpiarPuertasFuera_,
    avisoPuertas: accAvisoPuertas_,

    /* banco */
    banco: accBanco_,
    importarBanco: accImportarBanco_,
    guardarMovimiento: accGuardarMovimiento_,
    gastoDesdeBanco: accGastoDesdeBanco_,
    reclasificarBanco: accReclasificarBanco_,
    ajustarEstructura: accAjustarEstructura_,

    /* copias de seguridad */
    copias: accCopias_,
    copiaAhora: accCopiaAhora_,
    descargarCopia: accDescargarCopia_,

    /* resumen semanal por correo */
    resumenSemanalAhora: accResumenSemanalAhora_,
    probarResumen: accProbarResumen_
  };
}

function doPost(e) {
  let p = {};
  try {
    p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ok: false, error: 'La petición no es un JSON válido.'});
  }
  return json_(despachar_(p));
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.accion === 'ping') return json_({ok: true, version: VERSION, servidor: ahora_()});
  return json_(despachar_(p));
}

/* Cada petición queda en el registro (20_Registro.gs): la abre
   empezarPeticion_ y la cierra cerrarPeticion_, que apunta la fila si la
   acción no lo ha hecho ya. El «ping» no, que no es nadie haciendo nada. */
function despachar_(p) {
  const accion = txt_(p && p.accion);
  if (accion === 'ping') return {ok: true, version: VERSION, servidor: ahora_()};
  empezarPeticion_(p, accion);
  let r;
  try {
    r = atender_(p, accion);
  } catch (err) {
    r = {ok: false, error: String(err && err.message ? err.message : err)};
  }
  cerrarPeticion_(r);
  return r;
}

function atender_(p, accion) {
  if (accion === 'login') return accLogin_(p);
  if (accion === 'loginCodigo') return accLoginCodigo_(p);
  const fn = acciones_()[accion];
  if (!fn) return {ok: false, error: 'Acción desconocida: ' + accion};

  const u = sesion_(p.token);
  if (!u) return {ok: false, error: 'Sesión caducada. Vuelve a entrar.', sesion: false};
  return fn(u, p) || {ok: true};
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- configuración y registro ---------- */

function accGuardarConfig_(u, p) {
  exigir_(u, 'config');
  olvidarConfig_();                      // lo que había en memoria ya no vale
  const cambios = p.config || {};
  const h = hoja_('CONFIG');
  const filas = leer_('CONFIG');
  Object.keys(cambios).forEach(function (k) {
    const f = filas.filter(function (x) { return x.clave === k; })[0];
    if (f) h.getRange(f._fila, 2).setValue(cambios[k]);
    else h.appendRow([k, cambios[k], '']);
  });
  registrar_(u, 'config', 'CONFIG', '', Object.keys(cambios).join(','));
  return {ok: true, config: config_()};
}

/* accRegistro_ vive en 20_Registro.gs, con el resto del registro. */
