# Historial de cambios

Qué se ha ido tocando en el CRM y, sobre todo, por qué. Lo de arriba es lo
más reciente.

Esto no sustituye al manual: el manual cuenta cómo se usa el CRM hoy
(`docs/MANUAL.md`), y aquí queda la razón de cada cambio, que es lo que
luego no hay manera de reconstruir.



## 12/11/2026 · Mis visitas: botón de WhatsApp

- Junto al de llamar, botón verde de WhatsApp que abre el chat con el cliente (wa.me, prefijo 34 si el número tiene 9 cifras) con un saludo ya escrito: «Hola <nombre>, soy <comercial> de Zero Wattios.».

## 12/11/2026 · Nóminas: solo los PDF

- La pantalla de Nóminas solo enseña los meses con su botón «Descargar PDF»: sin importes, KPIs ni devengo día a día. Dirección sigue pudiendo subir, corregir y borrar.
- Estimación de comisiones del periodo en curso (16→15) con los clientes de los que vienen, por qué, fecha de firma, estado y comisión; las firmadas sin aprobar se marcan aparte. Acción `estimacionComisiones` (cada uno la suya, dirección la de todos). Sin importes de venta.
- Botón «⚠ Reportar un error» en la estimación: hueco para el comentario y le llega por correo a Nando (`avisos_nominas_a`) con la estimación que se estaba viendo.
- Listado «✓ Ya comisionadas»: solo cliente y dirección de todo lo comisionado hasta el corte, sin fechas ni importes.
- Cada persona solo puede descargarse su ÚLTIMA nómina (también comprobado en el servidor); dirección las sigue viendo todas.
- Aviso fijo: «Comisiones ajustadas hasta el periodo anterior al actual (hasta el 15/10/26 incluido)», sale de `comisiones_pagadas_hasta`.

## 12/11/2026 · Comisiones ya pagadas y captador por recomendación

- Nóminas: todo lo anterior al periodo actual (comisiones hasta el 15/10/2026 incluido) sale marcado «✓ Comisionado» para todo el equipo: en el día a día, en el KPI de comisiones (ya comisionado / pendiente) y en las nóminas de octubre y anteriores. Solo es una marca: no cambia importes ni reglas. Se mueve con la configuración `comisiones_pagadas_hasta`.
- Ficha del cliente: la línea «Captador por recomendación…» se queda siempre en «Últimos movimientos» con su fecha, aunque haya movimientos más nuevos.
- Habana 29D (C-000011): captador Abraham por recomendación desde el 03/09/2026, comisión ya pagada.

## 12/11/2026 · Calendario de instalaciones

- Pestaña nueva «Calendario de instalaciones» (vista mes y lista): obras de cada instalador (FV en lima, aerotermia en azul; discontinua si aún no ha empezado) con su avance, fases hechas el día que se marcaron, lo que queda por hacer con fecha (en rojo si va atrasado), visitas de instaladores, instalación prevista sin instalador asignado, firma, instalada y legalizada.
- Al pulsar cualquier cosa: la instalación entera (qué se instala, quién, fases, pendientes, visitas e hitos).
- Dirección ve todas y puede filtrar por comercial; cada comercial solo sus operaciones. Sin importes.
- Acción `calendarioInstalaciones` (api/calinstalaciones.php).

## 12/11/2026 · Los comentarios de «Mis visitas» actualizan los estados solos

- Al guardar un apunte, el CRM lee el comentario y actualiza: operación (firmada, financiación en estudio, aprobada → en trámite, cancelada), cliente (negociando), sentada (no se presentó) y proyecto enviado (con su llamada a la semana). Si el cliente dice que ha pagado, se avisa a dirección para que compruebe y apunte el cobro.
- Prudente: las frases negadas no cuentan («todavía no ha firmado»), la operación solo avanza salvo que el cliente diga que no, y el estado elegido a mano en el desplegable manda sobre el comentario. El comercial ve en el aviso qué se ha cambiado.
- Acción para dirección `revisarComentariosVisitas` (30 días; con aplicar=true aplica) para repasar los comentarios ya apuntados.
- Arreglo: un cliente que se sentó y pasa a «perdido» ya no marca la cita como «no llegó a sentada».

## 12/11/2026 · Mis visitas: descargar o pedir el proyecto

- Cada visita muestra el proyecto: si está hecho, botón «Descargar proyecto»; si está pedido, desde cuándo y si el ingeniero lo prepara.
- Si no está hecho: «Describir el proyecto y pedírselo al ingeniero» con descripción, hacer foto o subir fotos/PDF. Con al menos una foto entra solo en la cola y avisa al ingeniero.
- Si el ingeniero marca «faltan datos», sale en rojo lo que necesita y se completa y vuelve a pedir desde la misma tarjeta.
- Acción nueva `visitaProyecto`.
- Las visitas pasan de 14 a 30 días.
- Paso nuevo «Venta», AUTOMÁTICO (nadie lo marca a mano): sale cuando la financiera aprueba (operación en trámite o más allá) o el cliente ha pagado algo (cobro cobrado o parcial). Firmada o en estudio de financiación aún no cuenta. KPI de ventas y filtro «Sin venta».

## 10/11/2026 · Seguimiento de operaciones editable y copia editable del Excel

Lo pidió Nando: «el seguimiento de operaciones se tiene que poder editar si se
da sobre un cliente» y «se creará un Excel duplicado… que sí se podrá tocar»;
Rubén sigue trabajando en el original.

- Pulsando en una operación (o en una celda) se abre su ficha de seguimiento
  con los 26 checks: Hecho / Pendiente / No / No aplica, y «↺ Excel» para
  quitar el cambio. Cada cambio se guarda en SEGUIMIENTO_CAMBIOS (quién y
  cuándo) y manda sobre el original hasta que el original diga lo mismo.
- Copia en Google Sheets «SEGUIMIENTO OPERACIONES ZERO WATTIOS · COPIA
  EDITABLE» (misma carpeta ADMINISTRACION). Se rehace con original + cambios
  en cada lectura, en cada cambio y en el tic de 10 minutos. Lo que alguien
  marque o desmarque a mano en la copia se detecta comparando con lo último
  que escribió el CRM (SEGUIMIENTO_COPIA_FOTO) y pasa a ser un cambio.
  Operaciones nuevas del original se añaden al final de la copia.
- Al convertir el .xlsm a Google Sheets se pierden las casillas: el CRM las
  vuelve a poner (casillas de verificación) en las columnas de checks.
- Apps Script: servicios nuevos hojaLeer y hojaEscribir (30_Servicio.gs);
  hace falta publicar una versión nueva de la implementación.
- El original de Rubén no se toca nunca.

## 10/11/2026 · Visitas de instaladores desde la ficha del cliente

Ficha del cliente → pestaña «Instaladores» (dirección): agendar una visita a
una subcontrata (replanteo, visita técnica, instalación, revisión,
incidencia) con día, hora y qué tiene que hacer. Al instalador le sale en su
app (Próximas visitas y Avisos) con la dirección, el teléfono, «Cómo llegar»,
las fotos de la casa y lo que se le haya dejado; la marca como hecha con el
resultado y a dirección le llega un correo. Tabla VISITAS_INSTALADOR; en
Obras de subcontratas, pestaña «Visitas» con todas. Al cliente no le llega nada.

## 10/11/2026 · Apps de clientes y de subcontratas

Lo pidió Nando: «hazme la app para clientes y la app para proveedores… que sea
muy fácil, sencillo e intuitivo». Dos webs separadas del CRM pero con el mismo
backend y la misma base de datos:

- **clientes.zerowattios.com** — el cliente entra con su correo. Solo si su
  proyecto está FIRMADO (firmada, financiación, trámite, material,
  instalación, instalada, legalizada, cerrada). Ve de forma muy visual en qué
  punto está (anillo con el % y el camino de 7 pasos), el avance de la obra,
  el diario, sus fotos, documentos, manuales de sus equipos (salen solos de
  los modelos: FICHAS_TECNICAS), facturas y un botón de ayuda con tickets.
  La primera vez crea su clave con un código que le llega al correo.
- **contratas.zerowattios.com** — cada instalador (RoberGas aerotermia,
  Greenfield y Climassine fotovoltaica) entra con su usuario y ve SOLO sus
  obras: ficha de obra (qué máquina va y dónde, la escribe dirección), fotos
  de la visita, proyecto y fichas técnicas, avisos con fecha (llamar al
  cliente 2 días antes, llegada, fases, legalización en 7 días y los que
  ponga dirección), «He llegado» / «Me voy», fases con foto obligatoria,
  subir legalización y certificados, bitácora y tickets.
- Cada ticket nuevo (y cada respuesta del cliente o la subcontrata) se avisa por
  correo a administracion@zerowattios.com y fernandogarcia@zerowattios.com
  (configuración portal_avisos_tickets).
- Tickets con tiempos: urgente 4 h / 24 h, media 24 h / 72 h, baja 72 h /
  7 días (respuesta / solución). Cada ticket se refleja en Incidencias. Fuera
  de plazo: aviso a dirección y escalado a Fernando (cron, ticPortal_).
- **Nada llega al cliente sin aprobación de Rubén o dirección** (orden de
  Nando): todo lo que sube la subcontrata entra «pendiente»
  (ARCHIVOS.visible_cliente) y se aprueba o deniega en CRM → Obras de
  subcontratas → Para aprobar. A Rubén le llega un aviso (portal_aprobador).
  El cliente sí ve el avance (fase, llegada, terminada) en tiempo real.
- Correos a clientes y subcontratas: solo a `portal_correos_permitidos`
  (de momento nandete.salamanca@gmail.com, el cliente de pruebas). Lo demás
  se queda sin mandar y se apunta en el registro (portal_correo_retenido).
- OPERACIONES no se toca: al terminar una obra se crea una tarea para
  dirección (Fernando) para validarla y cambiar el estado.
- CRM: «Obras de subcontratas» (dirección: aprobar, asignar, ficha de obra,
  validar, tickets, cómo cumple cada subcontrata) y «Cuentas de clientes y
  subcontratas» (solo superadmin: altas, claves, activar, desbloquear y «Ver
  como», una vista previa de 20 minutos de solo lectura).
- Cuentas y sesiones propias (PORTAL_CUENTAS, PORTAL_SESIONES): un token del
  portal no vale en el CRM ni al revés. Tablas nuevas OBRAS, OBRA_EVENTOS,
  TICKETS; ARCHIVOS gana obra_id, visible_cliente, aprobado_por, aprobado.
- Las claves no las pone Claude: las pone Nando desde la pantalla de cuentas.
- Nada se indexa: robots.txt Disallow, cabecera X-Robots-Tag y meta noindex
  en las dos webs.
- El mu-plugin (servidor/zw-crm.php) sirve los dos subdominios y ahora se
  actualiza solo al desplegar (desplegar.php comprueba que es PHP válido y
  guarda el anterior como zw-crm.php.anterior).
- Direcciones: IONOS solo deja colgar un dominio del WordPress del CRM (conectar
  otro le quitaría crm.zerowattios.com), así que clientes.zerowattios.com y
  contratas.zerowattios.com son redirecciones HTTP (con SSL) a
  crm.zerowattios.com/clientes/ y /contratas/. Si un día tienen alojamiento
  propio, el mu-plugin ya sabe servirlas por su nombre.
- Solo PHP: el espejo de Apps Script (00_Config.gs) lleva las tablas, pero
  las acciones del portal no existen en el mock de node.

## 09/11/2026 · Simulación 3D para todos los comerciales

Lo pidió Nando: el Visor 3D y la pestaña «Simulación 3D» de la ficha dejan
de estar solo para dirección y Nando y se abren a todos los comerciales.
Los captadores siguen sin verlo. Sigue siendo uso interno: nunca va en el
PDF de la propuesta.

## 09/11/2026 · CAEs (Novawatt), WIXER y sincronización de la contabilidad

Lo pidió Nando: «para la parte de contabilidad siempre sincronízate con
BankTrack, es donde Rubén suele subir todo, y también en el Drive (dentro de
facturación). Crea un apartado también para WIXER y para los CAEs», que Rubén
lleva en Drive › 10-CAES (NOVAWATT) y 11 - WIXER con un Excel de seguimiento
y una carpeta por casa.

- Menú «CAEs y WIXER» (tabla TRAMITES, tipo cae | wixer). Quién lo ve
  (orden de Nando): CAEs → responsable Abraham + dirección; WIXER →
  responsable Sandra, lo ven también Abraham y dirección; nadie más. Se
  cambia en configuración (tramites_cae_usuarios, tramites_wixer_usuarios).
- Muy visual: arriba un embudo con cuántos hay en cada paso (tocar uno
  filtra) y en cada expediente una fila de pasos coloreada; un toque en el
  paso cambia el estado. Lo actualizan el responsable y dirección, y queda
  quién y cuándo.
  CAE: los 10 papeles que pide Novawatt marcables uno a uno; el progreso sale
  solo y con todos pasa a «Papeles completos». Estados: documentación,
  completo, presentado, cobrado, cancelado. WIXER: compañía actual → nueva,
  tarifa, potencia, peaje, CUPS, factura; estados pendiente, solicitado,
  pte. facturar, finalizado, cancelado.
- Cada expediente enlaza su carpeta de Drive y la ficha del cliente (se casa
  por la dirección, aunque esté escrita distinto).
- Solo clientes de Zero Wattios (orden de Nando): los antiguos de Aurus
  (etiqueta «Aurus» sin etiqueta de Zero Wattios) no entran ni se ven.
- Importes (CAE a cobrar, WIXER facturado) solo con permiso de finanzas.
- Nunca se guardan IBAN ni DNI: se quedan en el Excel y en Drive.
- «importarTramites» da de alta o actualiza en bloque sin duplicar (por
  carpeta, dirección o número): es lo que usa la sincronización diaria.
- Contabilidad enseña la última sincronización con BankTrack y con Drive ›
  01-FACTURACION y lo que no cuadra (acción «syncContabilidad», solo
  finanzas; la escribe la tarea programada diaria).

## 09/11/2026 · Cotizador desde una dirección (y visor 3D en pruebas)

Lo pidió Nando: un cotizador con nuestros precios y márgenes, que salga de
una dirección con los datos del Catastro; los márgenes no los pueden ver
comerciales ni captadores, y los directivos pueden moverlos para las
propuestas futuras.

- Menú «Cotizador» y pestaña «Cotizar» en la ficha del cliente, solo para
  comerciales y dirección (los captadores no lo ven).
- Dirección → Catastro (m² construidos, año y uso por la sede electrónica;
  planta del tejado y plantas por el WFS de edificios) → equipo
  recomendado: aerotermia por m² y época de la casa (12/16/19/22 kW; la de
  22 kW solo trifásica), paneles por consumo y lo que cabe en el mejor faldón.
- Precio con la tarifa de Ajustes (precio_fv_*, precio_aero_*, batería,
  cargador y suplementos de 1.000 €), IVA incluido, cuota a 10 años,
  deducción IRPF 60 % (base máx. 15.000 €), ahorro y retorno orientativos.
- Solo dirección: coste estimado con el catálogo de costes (mismas reglas
  que Materiales y costes), margen de la tarifa, horquilla de margen
  (margen_min_pct 35 % / margen_max_pct 45 % por defecto, guardable),
  regla para probar otro margen y «Usar este precio como tarifa», que
  cambia los precios del tramo para las propuestas futuras. El servidor no
  manda la horquilla a quien no tiene finanzas.
- Versiones: en la pestaña «Cotizar» de la ficha, cada «Guardar versión»
  crea una cotización nueva (v1, v2…, tabla COTIZACIONES, sin costes ni
  márgenes) que se puede volver a cargar. La última se copia en la
  descripción del proyecto entre «⟦Cotización vN⟧» y «⟦fin cotización⟧»
  para que el ingeniero la tenga en cuenta.
- Depósitos de aerotermia: se calcula el adecuado (ACS 200/300 L según
  personas, inercia 100/200 L según suelo radiante o m²) y se pueden
  cambiar; por encima de 200/100 L se suma el suplemento (1.000 €, 2.000 €
  con ACS de 500 L) y el precio al cliente se recalcula.
- Elección de producto: panel, inversor y potencia (SolaX X1 Hybrid 6,
  X1-VAST 10, X3 Hybrid 5/10/15, Deye 10 o automático), máquina Domusa (HT,
  HTT, EC PRO o All in One con su modelo y ACS integrado), depósitos de
  ACS e inercia y modelo de cargador (SolaX X1/X3-HAC).
- Documentación del producto propuesto: «Ficha técnica» descarga el PDF
  del Drive de la empresa (acción fichaTecnica; la lista se puede ampliar
  con la clave fichas_tecnicas en Ajustes) y «Manual» abre el de la web
  oficial del fabricante (SolaX, Deye; Domusa abre su buscador oficial).
- Visor 3D y pestaña «Simulación 3D»: en pruebas, solo dirección y el
  comercial Nando.


## 09/11/2026 · Visor 3D de la vivienda

Lo pidió Nando: un visor como el de Open Solar al que se le da la
dirección y saca la casa y el tejado, con el logo de Zero Wattios y el
material que montamos de fotovoltaica y aerotermia, para enseñarlo en la
visita.

- Menú «Visor 3D» (dirección y comerciales) y botón «⌂ Visor 3D» en la
  ficha del cliente, que lo abre ya con su dirección o coordenadas.
- Dirección → coordenadas: las de la ficha o CartoCiudad (IGN), con
  Nominatim de reserva. Planta y nº de plantas de cada volumen: Catastro
  INSPIRE WFS (BuildingPart). Foto aérea: ortofoto PNOA del IGN pegada al
  suelo y a los tejados. Todo público y sin clave, desde el navegador.
- El tejado (2 aguas, 4 aguas, 1 agua o plano, inclinación y vuelo) se
  dibuja sobre el rectángulo mínimo de cada volumen; la orientación real
  de cada faldón sale de la planta. Por defecto se marcan los paneles en
  el faldón principal que más mira al sur.
- Paneles (Hanersun 625/620, Risen 590, Full Black 500, 450 W), inversor
  SolaX/Deye automático o elegido, baterías T58, cargador; aerotermia
  Domusa HT/HTT/EC PRO, Saunier Duval o Panasonic, cascada, ACS e inercia.
  Si el cliente tiene instalación en el CRM, sale ya con sus equipos.
- Sol por hora y mes con sombras, kWp, producción orientativa
  (≈1.650 kWh/kWp corregido por orientación e inclinación), lista de
  material, «Descargar imagen» (con logo) y «Copiar resumen».
- La casa es el conjunto de volúmenes de la parcela pegados al punto (el
  Catastro trocea cada vivienda por nº de plantas); la altura del alero se
  calcula con la media de plantas y se puede corregir.
- Pestaña «Simulación 3D» en la ficha del cliente: sale con los equipos de
  la instalación apuntada o, si no hay, con lo que diga el proyecto pedido
  por el comercial o el captador. Es solo de uso interno: no entra en el PDF
  de la propuesta.
- three.js r128 va en assets/vendor/three. Prueba: pruebas/visor-navegador.js
  (servicios externos simulados).


## 06/11/2026 · Aviso de margen por debajo del 35 %

Lo pidió Nando: que el CRM le avise cuando una propuesta salga con un
margen estimado inferior al 35 %. El margen se estima con el mismo
catálogo de costes de las facturas de proveedores (venta sin IVA frente
al coste estimado de material, montaje y legalización).

- Panel de dirección: tarjeta «Margen por debajo del 35 %» con las
  operaciones en propuesta, financiación, firmadas o en curso que no
  llegan, de peor a mejor. Pulsando se abre la ficha.
- Ficha del cliente: aviso en rojo encima de «Materiales a pedir» y el
  porcentaje en el indicador de margen.
- Materiales y costes: filtro nuevo «Margen por debajo del 35 %» y el
  porcentaje en cada fila.
- Solo lo ve quien tiene las finanzas abiertas (dirección). Las
  operaciones sin equipos apuntados no se pueden estimar y no avisan.

## 05/11/2026 · Materiales a pedir y costes de cada instalación (solo dirección)

Lo pidió Nando: que a dirección le salga, en cada proyecto, la lista de
materiales que hay que pedir con lo que cuesta cada pieza, sacado de las
facturas reales (SeisSolar, PolarStock, Sumsol, Rober Gas, Greenfield,
legalizaciones), y que las instalaciones ya hechas tengan sus gastos reales.

- **Catálogo de costes** en CONFIG (`catalogo_costes`, JSON). Mediana de lo
  pagado en las facturas de 02 GASTOS (Drive), sin IVA. Solo viaja a quien
  tiene las finanzas abiertas: `configVisible_` lo quita al resto.
- **Ficha de la instalación** (ficha del cliente): «Materiales a pedir y
  coste estimado» con cada pieza, cantidad, coste unitario y total con y sin
  IVA, más los gastos reales apuntados y el margen. Las piezas salen de los
  equipos apuntados en la instalación (paneles, inversor, baterías,
  aerotermia, depósitos, cargador). La aerotermia de 22 kW se trata como
  trifásica (no existe monofásica).
- **Pedido por proveedor**: en la misma ficha, el texto del pedido para cada
  proveedor (SeisSolar, PolarStock…) con las piezas y el coste estimado, con
  un botón para copiarlo y mandarlo por correo o WhatsApp.
- **Dinero › Materiales y costes**: por pedir, ya instaladas (estimado frente
  a real) y el catálogo, que dirección puede ajustar a mano.
- **Gastos «Estimado»**: nuevo estado de pago para costes sin factura. No
  cuentan como pendientes de pago ni en la previsión de tesorería.
- Se cargaron en GASTOS las facturas de proveedor que faltaban (91), con su
  instalación, importe sin IVA y número de factura.

## 04/11/2026 · Captaciones pendientes de reagendar

Lo pidió un captador: a veces el cliente aún no puede dar fecha por motivos
personales, y el CRM obligaba a poner una, así que la captación quedaba con
una fecha que no era la buena.

- En la ficha de captación nueva, el estado **«Pendiente de reagendar»**
  (antes «A recontactar») deja guardar sin fecha. Opcionalmente se pone el
  día para **volver a llamar** (campo nuevo `volver_llamar` en CAPTACIONES).
  El cliente queda con la próxima acción «Llamar para dar cita».
- **↻ Reagendar** tiene ahora la opción «Aún no puede: queda pendiente de
  reagendar». Quita la fecha, apunta la nota y cuenta como cita aplazada en
  las estadísticas. Cuando ya tiene día, el mismo botón le da fecha.
- En **Hoy** sale la tarjeta **Pendientes de reagendar**, ordenada por el día
  de volver a llamar, con «Dar fecha». En Captaciones salen como «SIN FECHA».
- Sin fecha no entran en la agenda ni en las reglas de visitas del comercial.

## 03/11/2026 (noche) · Ventas y comisiones en el objetivo del periodo

- En **Panel › Objetivo del periodo** (16 al 15) sale la lista de ventas
  firmadas del periodo con **dirección, importe y comisión** de cada una, y
  el total. Cada uno ve solo lo suyo; dirección ve a cada persona en Equipo.
- Reglas de Nando: Nando 700 € por venta suya y 400 € por cada venta de
  Rober (es su responsable); Rober 400 € por venta; captadores 400 € por cada
  venta de lo que captaron; Rubén 400 € por cada venta que venga de Sandra o
  Abraham. **Una doble (aerotermia + fotovoltaica) cuenta como dos ventas.**
- El captador de una venta sale de la operación o, si no lo tiene, del
  cliente. Las ampliaciones y extras (tipo «otro») no comisionan.
- Las nóminas usan las mismas reglas.
- Las ampliaciones y extras (tipo «otro») tampoco cuentan para el objetivo.
- Campo nuevo en la operación, **«Cuenta como (ventas)»**: vacío cuenta según el tipo;
  se pone 2 cuando, por ejemplo, una aerotermia lleva dos máquinas (Lomas 66).
- Al cumplir el objetivo, lo que se firme después sigue contando en el mismo periodo
  (no pasa al siguiente); corregido el aviso del panel que decía lo contrario.
- El objetivo del periodo muestra también lo **facturado** por las ventas propias de
  cada comercial (IVA incluido, ampliaciones incluidas), en su panel y en Equipo.

## 03/11/2026 · Todo el mundo puede avisar de una incidencia

- Comerciales y captadores tienen **Avisar incidencia** en el menú (y el
  botón «⚠ Incidencia» en la ficha del cliente, que ya la deja con el
  cliente puesto). Escriben qué pasa, urgencia, cliente y detalle y se envía.
- No ven el listado ni las de los demás: solo reciben la confirmación con el
  número. A dirección (Rubén y Fernando) le sale en Incidencias con quién la
  abrió. Rubén, como dirección, las crea desde el propio listado.

## 03/11/2026 · Incidencias para dirección

- Menú **Incidencias** (solo dirección: Rubén y Fernando) y tarjeta
  «Incidencias abiertas» arriba del todo en Hoy de dirección.
- Ordenadas por urgencia (alta, media, baja) y, dentro, la más antigua
  arriba. También «más antiguas» o «más recientes».
- Al lado de cada una, un campo para apuntar cómo va o cómo se ha
  solucionado: «Guardar actualización» la deja en el historial; «✓ Resuelta»
  la cierra con esa solución. Las resueltas se pueden ver y reabrir.
- Indicadores: abiertas, urgentes, más de 7 días y resueltas este mes.
- Pedido por Nando: «a Rubén y a la dirección les tiene que saltar en el CRM
  un listado de incidencias…».

## 02/11/2026 (noche) · Llamadas y próximos pasos, y la sentada del captador

- **Llamadas y próximos pasos** (Hoy), la agenda, «Se te está pasando» del
  tablero y los vencidos del correo de los viernes ya no enseñan: clientes
  que ya han comprado (operación firmada o más adelante, o cita con venta),
  ganados o perdidos, ni la «Sentada concertada» que se pone sola al dar una
  cita (esa visita ya sale en las visitas). Salían, por ejemplo, Requexada 8
  y Auseva 44, ya firmadas. De 68 pasos «pendientes» quedan 26 de verdad.
- Cuando una cita tiene resultado (sentada, potencial, no sentada,
  cancelada), la «Sentada concertada» deja de ser el próximo paso del cliente.
- **El captador puede marcar la sentada**: botón «✓ Sentada» en las citas
  pendientes cuyo día ya ha llegado (Captaciones y ficha › Citas). Si el
  resultado lo pone el propio captador, no le llega el aviso de su cambio.


## 02/11/2026 (noche) · Reglas de la agenda de Nando

Regla para los captadores: a Nando no se le pueden dar **más de 3 visitas al
día**, **ni los viernes**, **ni después de las 17:30**, salvo que él lo
autorice. Si la cita no cumple, el CRM lo avisa mientras se rellena la ficha
y no la adjudica; ofrece guardarla **sin adjudicar** y le manda a Nando un
correo para autorizarla (la acepta adjudicándosela). El cliente pasa a su
cartera para que lo vea. Vale para fichas nuevas, adjudicar, cambiar el día
o la hora y reagendar. Dirección, Nando y el agente no tienen ese freno (solo
el aviso). Las reglas están en Ajustes › `agenda_bloqueos`
(`{"U-000004":{"dias":[5],"max_dia":3,"hasta":"17:30"}}`).


## 02/11/2026 (noche) · Reagendar, cancelar, estadísticas, misma zona e histórico del lead

Orden de Nando para que captadores y comerciales trabajen todo desde el CRM.

- **Reagendar y cancelar.** Cada cita tiene «↻ Reagendar» (nuevo día, hora,
  motivo) y «✕ Cancelar» (motivo de una lista y una línea de detalle), en
  Captaciones y en la ficha del cliente (pestaña Citas). Cada cambio queda
  guardado en `CITAS_CAMBIOS`. Cambiar el día de una cita por otro camino
  (editarla, el agente que copia Trello) también cuenta como reagendada.
- **Estadísticas** (menú «Estadísticas», para todos). Por captador y del grupo,
  hoy / semana / mes / trimestre / año: citas sacadas, reagendadas,
  canceladas (con %), sentadas, ventas y citas por venta. También las
  citas por día de los últimos 14 días, las citas que hacen falta para una
  venta en los últimos 12 meses y las ventas cerradas por semana, mes,
  trimestre y año. Los captadores ven a sus compañeros para picarse; solo
  números, sin importes ni clientes. Dirección ve además a los comerciales.
  Cada cosa cuenta el día que pasa (la cita, el día que se mete; la venta,
  el día de la firma).
- **Misma zona.** Al meter una ficha, si otro captador sacó otra a menos de
  200 m en las últimas 48 horas, sale el aviso en pantalla y llega un correo
  a los dos captadores y a dirección (una vez por pareja de fichas). Usa
  las coordenadas de la ficha; si no tiene y la dirección lleva número, se
  buscan en Google solo si las da en el portal. Se apaga con `aviso_zona = no`.
- **Histórico del lead.** En la ficha, pestaña Historial, «Histórico de
  cambios»: cada campo que cambia el captador, el comercial o dirección en
  la ficha y en sus citas, cómo estaba, cómo queda, quién y cuándo (tabla
  `CAMBIOS`). El DNI se apunta sin el número.
- La columna «Vendido» (euros) del rendimiento de captación solo la ve dirección.
- Servidor: las tablas nuevas se crean solas en la primera petición tras el
  despliegue (huella del ESQUEMA en `ESQUEMA_HUELLA`).


## 02/11/2026 (noche) · «Eso también va en el CRM»

Desde el 3 de noviembre comerciales y captadores lo apuntan todo en el CRM.
Para que no se quede nada fuera, les llega un correo cuando se les olvida
algo o lo ponen en otro sitio. Solo a comerciales y captadores: dirección
no recibe nada (tampoco la cuenta de comercial de Nando, que usa su correo).

- **Lo puesto fuera.** Los agentes, al leer WhatsApp, Trello o el correo,
  apuntan con `recordarCRM` lo que alguien ha puesto allí y no en el CRM.
- **Lo que se queda a medias** (solo en el correo de la tarde): visita ya
  pasada sin resultado, sentada sin proyecto pedido a los 2 días, propuesta
  lista sin marcar como enviada a los 2 días, proyecto parado por falta de
  datos 2 días, ficha de captación sin teléfono o dirección, y el
  parte del día anterior sin mandar.
- **Cuándo:** lunes a viernes hacia las 13:30 y las 19:30, un solo correo por
  persona y nada si no hay nada. Lo mismo no se repite antes de 3 días.
- **Se apaga** con `avisos_crm = no` en Ajustes. Solo cuenta lo que pasa
  desde `recordatorios_desde` (03/11/2026), para no llenarles el correo de
  cosas viejas.


## 02/11/2026 (tarde) · Un cliente, una ficha

Revisión de los datos reales: 872 clientes, de los que 7 parejas eran el
mismo cliente dos veces (mismo teléfono o misma casa); 12 clientes con
varias citas de las que la ficha solo enseñaba la primera; el interés
apuntado en la cita y en el cliente con números distintos en 17 casos;
fichas borradas que dejaban apuntes y proyectos sueltos.

- **Sin duplicados al dar de alta.** Si el teléfono o la dirección ya están,
  el CRM avisa mientras se escribe y no crea otra ficha. Si es la cita de un
  captador, se apunta en la ficha que ya existía y se aprovecha lo que esta
  no tenía (m², gastos…). Dirección puede forzarlo (otra vivienda del mismo dueño).
- **Fichas repetidas** (Clientes, solo dirección): lista y botón de fusionar.
  Todo lo de la repetida pasa a la buena y la repetida desaparece.
- **Un cliente con cosas enlazadas no se borra**: se fusiona.
- **La cita que manda es la última** (o la de la instalación), no la primera.
- **Un solo dato de interés y de estado**: lo que deja la cita pasa al cliente;
  una sentada pasa el cliente a «Sentada» y una cita nueva no lo hace retroceder.
- **Ficha nueva**: un solo botón «+ Apuntar» (llamada, visita, cita,
  comentario, instalación); pestaña Historial con todo en una línea de tiempo;
  pestaña Citas con todas; «Falta por meter» con el botón que abre cada dato;
  vivienda y contacto se editan por partes; aviso de posible ficha repetida.

## 02/11/2026

### Pantalla «Hoy» para todos

Primera opción del menú. El comercial ve sus visitas de hoy y mañana (con
Modo visita, cómo llegar y la ficha), las llamadas y pasos que le tocan y un
semáforo de su cartera (rojo si lleva más de 7 días sin tocarse, ámbar a los
3), sentadas sin propuesta y visitas sin resultado. El captador ve lo que
tiene sin adjudicar y la comisión en juego de sus citas de la semana.
Dirección ve además los cobros vencidos o de esta semana y los pagos raros
del banco. Hay un menú corto por rol (se cambia al largo con un botón).

### Dar citas desde el CRM (Trello sigue mandando un mes)

«+ Nueva cita» en la Agenda y en la ficha del cliente. Al elegir comercial y
día se ve lo que ya tiene y el CRM avisa si no le da tiempo: cada visita
dura como mínimo 1 h 45 min y se suma lo que tarda en coche hasta la
siguiente (Google Maps; si falla, 30 min). También avisa los viernes de
Nando. Tabla de huecos de los comerciales de la semana. La agenda que manda
sigue siendo Trello (`agenda_fuente = trello`); cuando se deje Trello se
cambia a `crm` en Ajustes. Duración, días bloqueados y avisos se tocan en
Ajustes › Agenda y avisos.

### Modo visita en el móvil

Una pantalla con fotos de la casa y facturas de luz y gas desde la cámara,
la nota (escrita o dictada), resultado y próximo paso, y «Guardar y mandar
al ingeniero». Sin cobertura, la nota se guarda en el móvil y se manda sola
al volver. Dictado por voz en todos los cuadros de texto largos.

### Captaciones más rápidas

«📍 Estoy en la puerta» rellena la dirección por GPS y «🏠 Datos del
Catastro» trae referencia, m² y año. El captador recibe un correo cuando su
cita pasa a sentada, venta, no sentada o potencial.

### Propuesta: enviar, pedir cambios y aceptación firmada

En la pestaña Proyecto: enviar el PDF por WhatsApp o correo con el texto
preparado (lo manda el comercial desde su móvil, el CRM no envía nada al
cliente), pedir cambios al ingeniero y recoger la firma del cliente en
pantalla con foto del DNI.

### Contabilidad

Casar cobros solos con el banco (solo los que no tienen duda), pagos raros
(posibles dobles y salidas de 500 € o más sin gasto), facturar un cobro con
un clic (número FZW siguiente), reserva de impuestos del trimestre, obras
sin factura de proveedor y paquete Excel para la gestoría.

### Llave de servicio para los agentes

Rol nuevo «Agente» y botón «Llave de servicio» en Ajustes › Usuarios: una
llave de un año que no caduca por inactividad, sin acceso a usuarios ni
configuración, y que se puede revocar. Los cobros apuntados a mano ya no se
rehacen al recalcular.


## 30/10/2026

### Control de versiones del proyecto

En la pestaña Proyecto de cada cliente salen ahora todas las versiones del
PDF (v1, v2…, la vigente arriba), cada una con su fecha, hora, quién la
subió y qué cambiaba, y con su botón para descargarla. Debajo, el
historial de cambios del proyecto (sacado del registro): cada vez que
alguien guarda la descripción o la ficha, sube un archivo, entrega una
versión, cambia el estado o lo marca como enviado, con fecha, hora y quién.
Lo ven el comercial y el captador del cliente y la dirección.

### Agenda: cada uno ve sus visitas

El comercial ve en su agenda las visitas que le han puesto a él (el comercial
de la cita; si la cita no lo tiene, el del cliente). El captador ve solo las
citas que ha captado él y ya ha puesto a un comercial, con el nombre del
comercial que va.

### Los captadores ven y descargan los proyectos enviados

En su panel, el captador tiene ahora la tarjeta «Proyectos enviados de tus
clientes»: los proyectos ya mandados al cliente en los últimos 90 días de
los clientes que ha captado él, con el botón «⤓ PDF» para descargarlos. Desde
la ficha del cliente (pestaña Proyecto) también lo puede descargar. Solo ve
los enviados, no los que están en cola ni los listos para enviar.

### Lo financiero y contable, solo para dirección

Comerciales y captadores ya no reciben cobros (antes el comercial veía el
calendario de cobro de sus operaciones). Facturas, gastos, banco y cifras ya
estaban cerrados para ellos.

## 29/10/2026

### Ficha de dimensionado: «¿Qué se ofrece?» manda sobre lo que se ve

Orden de Nando: la ficha empieza por «¿Qué se ofrece?» (las dos, solo
aerotermia o solo fotovoltaica) y oculta lo que no hace falta meter. Con solo
FV desaparecen calefacción actual, combustible, emisor, Easy Connect,
refrigeración, ACS e inercia, factor de sustitución, CAE, precio y garantía
de aerotermia; con solo aerotermia, placas, inversor, tejado, batería,
cobertura FV, precio y garantía de FV. Lo común (cliente, luz, consumo,
potencia, fase, IBI, financiación y cierre) siempre se ve. El cálculo solo
cuenta lo elegido. Igual en la ficha suelta del móvil (repositorio `ficha`).

### Factura de luz, factura de gas y fotos de la vivienda, cada una en su sitio

Orden de Nando: en la pestaña Proyecto de la ficha, el comercial sube por
separado la factura de la luz, la del gas (o gasóleo, propano) y las fotos
de la vivienda. Cada zona tiene su botón y su lista; las facturas aceptan
PDF o foto. Se guardan con clase propia (`factura_luz`, `factura_gas`,
`foto`), así que el ingeniero las distingue en `proyectosPendientes()`.

### El correo de los viernes: tu semana y tus vencidos

Orden de Nando: el correo de los vencidos pasa a «Tu semana y tus vencidos
en el CRM» y sale siempre. Lleva lo de lunes a viernes (sobre captaciones y
operaciones): al comercial, sentadas, propuestas hechas con cliente e
importe, ventas y los ratios sentadas/citas, propuestas/sentadas y
ventas/sentadas; al captador, fichas, citas, sentadas y los ratios ficha →
sentada y sentada → venta.

### Los vencidos, solo para dirección; al equipo, por correo los viernes

Orden de Nando: en la Agenda, el bloque «Vencido» y la cifra «Vencidas»
solo los ve dirección (Rubén, Fernando y el superadmin). A comerciales y
captadores no les sale nada pasado de fecha: ni en las listas ni en el
calendario; su agenda empieza hoy.

A cambio, cada viernes, con el resumen semanal (sobre las 18:00), cada
comercial y captador recibe en su correo «Tus vencidos en el CRM»: la lista
completa de lo suyo pasado de fecha (seguimientos, citas sin resultado e
instalaciones previstas sin hacer). Va a su propio correo aunque el resumen
semanal esté en pruebas con «resumen_a»; si no tiene nada vencido, no se le
manda nada. Función `avisoVencidos()` en `14_ResumenSemanal.gs`; se puede
lanzar a mano desde el editor. Prueba: `pruebas/agenda-navegador.js`.

## 27/10/2026

### Ficha de dimensionado con las cuotas nuevas de Finlight

Orden de Nando: la ficha calcula las cuotas con los coeficientes de Finlight
vigentes desde el 16/10/2026 (TIN 8,95 % con la comisión de apertura del 2 %
prorrateada): a 10 años 0,012894, es decir, 128,94 €/mes por cada 10.000 €
(antes 0,01234902). De 10 a 20 años son los oficiales; 72, 84 y 108 meses se
calculan con la misma fórmula.

### El email del cliente, completo para todos

Orden de Nando: el email lo ve completo todo el mundo (comerciales y
captadores incluidos). Solo el DNI (y los DNI dentro de «cotitular») sigue
tapado con asteriscos para quien no es dirección.

### Documentos «solo dirección» en la carpeta del cliente

En la pestaña Proyecto de la ficha, la dirección (Rubén, Fernando y el
superadmin) tiene una tarjeta nueva, «🔒 Solo dirección», para subir PDF o
fotos que no debe ver nadie más: el primero, el resumen de los CAE de cada
cliente con lo que va a cobrar, sacado de Novawatt.

Son archivos de clase `direccion`. El servidor no se los manda a nadie sin
alcance «todo»: no salen en la carpeta, ni en las listas de proyectos, ni
se pueden descargar, borrar o subir aunque alguien conozca su id (responde
«No existe ese archivo»). En Drive van a la misma carpeta del cliente, que
no está compartida con nadie. Prueba: `pruebas/direccion-navegador.js`.

## 23/10/2026

### Nóminas con todas las cifras de la gestoría

La lista de nóminas solo enseñaba el neto. Ahora cada mes lleva devengado
(con comisiones y dietas), IRPF con su tipo, Seguridad Social del
trabajador, otras deducciones (retribución en especie, embargo), neto y,
para dirección, el coste para la empresa (devengado más la Seguridad Social
que paga la empresa). Arriba, los totales del año.

Las cifras se guardan tal cual vienen en el PDF de Cygnus (`guardarNomina`
con `exacto`): recalcularlas con el tipo de IRPF da otro neto, porque la
base de IRPF no es el devengado y la especie se descuenta aparte. Lo que no
tiene columna propia va en `detalle` (JSON).

Arreglo de paso: la hoja convierte «2026-04» en la fecha 1/4/2026, así que
al subir el PDF de un mes que ya existía no lo encontraba y duplicaba la
fila, y la lista enseñaba «2026-04-01». El mes se normaliza siempre a
aaaa-mm al leer y al casar.


### «✓ Enviado al cliente» en el panel

En «Proyectos listos para enviar» cada proyecto tiene ahora el botón
«✓ Enviado al cliente». Se confirma en la misma línea («¿Ya se lo has
mandado? Sí, enviado / No») y el proyecto sale de la lista. No manda nada
a nadie: solo apunta cuándo y quién lo marcó (estado nuevo `enviado`,
después de `entregado`, con las columnas `enviado` y `enviado_por` en
PROYECTOS, que se añaden solas a la hoja de antes) y queda en el registro.
Lo puede marcar el comercial del cliente y la dirección; ni los
captadores ni otro comercial. La pestaña Proyecto de la ficha dice
«Enviado al cliente» con la fecha.

La dirección tiene debajo de los listos la tarjeta «Enviados al cliente,
últimos 14 días», con «dirección · nombre», comercial y fecha y hora, y
un «deshacer» que lo devuelve a «listos para enviar» (por si se pulsó sin
querer; el comercial no puede deshacer).

La regla de llamar a la semana: al marcarlo, se apunta un seguimiento
(canal email, origen `proyecto_enviado`) con el próximo paso «Llamar:
seguimiento de la propuesta» a 7 días, que sale en la agenda como los
demás. Si el cliente ya tiene un próximo paso entre hoy y esos 7 días, se
respeta y el aviso lo dice; uno vencido de antes sí se sustituye.

### Registro de conexiones para el superadmin

El superadmin tiene en Sistema una pantalla nueva, «Registro de
conexiones», que sustituye al antiguo «Registro» (las últimas 300 líneas).
Ahí sale quién ha entrado, cuándo (con segundos), desde qué equipo
(«Windows · Chrome · #a1b2c3», el número es la marca del navegador),
desde qué IP y ciudad, y qué ha mirado o cambiado. Se filtra por día y
hora de inicio y de fin, con atajos Hoy, Ayer y Últimos 7 días, por
persona, por tipo (conexiones, modificaciones, consultas) y por texto.
Arriba, por persona: entradas, entradas fallidas, acciones, cambios,
primera y última hora, equipos y sitios. Se descarga en Excel (con el
filtro escrito encima y una pestaña por persona) y en PDF apaisado (con
el filtro y la hora en que se sacó). Solo el superadmin: ni el menú ni
el servidor se lo dan a nadie más, administradores incluidos.

Qué se apunta: cada petición con sesión, una fila. Si la acción ya se
apuntaba sola («alta_cliente C-000412 Ana Lara»), se queda esa, que dice
más, y no se escribe otra; si no (sobre todo las consultas), sale una
fila con la acción y un resumen corto de lo pedido, sin token, claves,
códigos ni archivos, y como mucho 300 caracteres. Si la acción falla, el
error va al final del detalle. También las entradas buenas y fallidas
(con el usuario que se tecleó, aunque no exista; la clave nunca), los
bloqueos, el código del correo, las salidas y las sesiones que caducan
(una vez, y la sesión se borra). El «ping» no se apunta.

La IP no la ve Google: la pregunta el navegador a GeoJS (y si no
contesta, a ipapi.co), gratis y sin clave, una vez por hora y pestaña, y
la manda con cada petición. Si está bloqueado va vacío y no pasa nada. No
se usa la ubicación del aparato, así que no sale ningún permiso: el lugar
es la ciudad de la conexión, aproximada (con datos del móvil puede salir
otra ciudad). Lo que manda el navegador se guarda como texto recortado y
sin poder colarse como fórmula en la hoja.

La pestaña LOG gana cinco columnas al final (tipo, equipo, agente, ip,
lugar). En la hoja de verdad se añaden solas con la primera petición que
escriba en el registro, igual que haría instalar(); las filas viejas no se
tocan y salen clasificadas por su acción. Para que vaya rápido, la
consulta solo lee la columna de fechas y luego el tramo que cae dentro,
de abajo arriba, hasta 5.000 filas (si hay más, lo dice). Nada se borra
solo: cuando pese, se archiva a mano. Además el documento se abre una
sola vez por petición, que antes se abría en cada lectura.

Ojo: avisar a la plantilla por escrito de que el CRM registra conexiones,
equipo, IP y ubicación aproximada (RGPD y art. 87 LOPDGDD), y añadirlo al
registro de actividades de tratamiento. Además, la IP de cada uno sale a
un servicio externo para saber la ciudad.

Pruebas: 36 comprobaciones nuevas en `pruebas/prueba.js` y
`pruebas/registro-navegador.js` (con navegador: comercial, administrador,
superadmin, Excel, PDF y móvil).

### Leads caídos y desaparecidos, por captador

Hasta ahora una ficha de captación que no llegaba a nada se perdía de
vista. Ahora se cuentan dos cosas. Caído: la cita se canceló, no llegó a
sentada o el cliente dijo que no le interesa. Desaparecido: sigue
pendiente y la visita pasó hace más de un día sin sentada ni venta, la
nota dice que ya no está en Trello, o quedó como potencial sacada de la
agenda («sin día»).

Cada captador ve en su panel sus fichas, caídos, desaparecidos y % de
caída del mes (con los últimos 90 días debajo) y la lista de sus leads
perdidos con «dirección · nombre», fecha, motivo y comercial. Solo los
suyos: se filtra por el captador de la ficha, además de que el servidor
ya solo le manda sus clientes. La dirección tiene en su panel la tabla
por captador (fichas, sentadas, caídos, desaparecidos, % caída y %
desaparición, este mes o 90 días, con total) y debajo la lista, con
filtros por captador y motivo y exportación a CSV. En Captaciones hay un
filtro «Caídos / desaparecidos» y el motivo sale junto al resultado. El
periodo se mide por el día en que se metió la ficha, como el resto de la
captación.

### La ficha de dimensionado, siempre al día con el cliente y su instalación

Una ficha guardada ya no enseña datos viejos. Al abrirla, lo que viene
del cliente (nombre, dirección, municipio, CP, teléfono, correo, CUPS, m²,
personas, año, calefacción, gastos de luz y combustible, potencia) y de
su última instalación (importes con IVA por partida, placas, inversor,
batería, cargador, depósitos, plazo, reserva) se lee del CRM, y si algo
había cambiado lo dice: «Actualizado desde el CRM: m², importe FV…». Lo
que solo existe en la ficha (altura, zona, emisor, distancias,
observaciones…) se queda como se guardó.

Va en los dos sentidos con el cliente: si el comercial cambia en la ficha
los m², la calefacción, un gasto o el CUPS, al guardar se guarda también
en el cliente (solo esos campos, con `guardarCliente`, que acepta cambios
parciales). Lo de la instalación no se toca desde aquí: sale bloqueado,
con la pista «se cambia en Instalaciones», y arriba una tarjeta lo resume
(tipo, estado, importe, pago, financiera, depósitos). Con el año de
construcción, el aislamiento sale solo.

### La ficha le llega al ingeniero en cada guardado

Cada «Guardar ficha» escribe el bloque completo en la descripción del
proyecto (secciones 1 a 8, resultado con equipo, kW, depósitos, placas y
kWp, inversor, batería, inversión con IVA, cuota a 10 años y ahorro, la
instalación del CRM, los avisos y «Versión vN · fecha · comercial»),
cambiando solo lo que hay entre las marcas. «Pasar al proyecto» pasa a
llamarse «Enviar al ingeniero»: guarda y, si el proyecto todavía no tiene
ninguna foto, avisa de que sin una foto no entra en la cola (es la regla
del servidor) y lleva a la pestaña Proyecto para subirla. Arriba de la
ficha se ve en qué estado está el proyecto.

### IRPF siempre al 60 %, por tecnología

La deducción ya no tiene desplegable: el 60 % de un máximo de 15.000 €,
7.500 € de aerotermia y 7.500 € de fotovoltaica (batería y cargador van en
la parte de FV), es decir, como mucho 4.500 € + 4.500 € = 9.000 €. Cada
parte se redondea por separado y el resumen lo desglosa: «Deducción IRPF
60 %: aerotermia X € + fotovoltaica Y € = Z €». Entra en el coste real,
la amortización, el esfuerzo neto, los avisos y el bloque del ingeniero.

### Auditoría de los cálculos contra la ficha del móvil

Se han comparado 600 casos al azar (y los límites de cada tramo) con la
ficha original cargada en un navegador. Salieron y se corrigieron: la
cuota se calculaba sobre el total y no partida a partida con la reserva
repartida (diferencias de un céntimo); no se aplicaban los topes de cada
número; faltaban avisos y otros tenían el texto cambiado, y las notas de
IBI estaban recortadas; faltaban el depósito de inercia BT/BTS, las
unidades en cascada, el texto completo del acumulador fuera de catálogo
y las garantías; y los valores por defecto de una ficha en blanco no
eran los de la original. Ahora todo coincide con la original salvo la
regla del IRPF, que es la de la casa.

### Versiones de la ficha

Cada guardado con cambios crea una versión (v1, v2…) que se guarda con el
cliente, en las mismas notas del proyecto: la ficha actual completa y,
por cada versión, solo lo que cambió ({campo: [antes, después]}), quién,
cuándo y si vino del comercial o de los datos del CRM. Si no cambia nada,
no hay versión. El historial se ve en la ficha, de la más nueva a la más
vieja; cada versión se despliega para ver qué cambió, se puede ver
entera (se reconstruye deshaciendo las posteriores) y restaurar en el
formulario. Para no pasar del tope de una celda de Google Sheets
(50.000 caracteres) se podan las más viejas si hace falta, pero nunca la
v1 (como resumen), ni las 20 últimas, ni la ficha actual. Las fichas
guardadas con el formato anterior se abren igual y pasan a ser la v1 al
guardarlas.

### Guardar la ficha, sin sustos

Un botón «Guardar ficha» claro, en una barra que se queda abajo a la
vista también en el móvil, y otro al final del formulario. Mientras
guarda se bloquea (un doble clic no guarda dos veces) y luego dice
«Guardado · vN · hh:mm» en verde o el error en rojo con «Reintentar».
Después de guardar se vuelve a leer del servidor y se comprueba que ha
quedado igual; si no, se dice. Si lo que falla es solo actualizar el
cliente, se dice exactamente eso. Lo escrito se va guardando como
borrador en el propio equipo: si algo falla o se cierra la página, al
volver sale «Tienes cambios sin guardar de las hh:mm · Recuperar /
Descartar». Salir a otra pestaña o pantalla con cambios sin guardar
avisa, y Ctrl/Cmd+S guarda.

### El panel de dirección, con IVA y con lo que dice el banco

Las seis tarjetas de arriba enseñaban la base sin IVA y un margen sacado
de los gastos apuntados por instalación, que casi nunca están completos.
Ahora la facturación del año es la suma del total con IVA de las
instalaciones vendidas este año, con lo cobrado en el año debajo; la
cartera abierta, el total con IVA de las propuestas y financiaciones
vivas; y el ticket medio se calcula por cliente, no por instalación.

Margen bruto y beneficio neto salen de los movimientos del banco del año
(acción `banco`, que ya existía): cobros de clientes menos proveedores y
montaje da el margen, y restando la estructura (nóminas, Seguridad Social,
servicios, seguros, comisiones, préstamos, transporte, dietas, teléfono,
EPI, marketing, gestoría y otros gastos) queda el beneficio. Los traspasos
entre cuentas y los impuestos no cuentan. Esa petición va aparte y sin
esperar: el panel se pinta al momento con «…» y esas dos tarjetas se
rellenan al llegar; si el banco falla o no hay movimientos, dicen «—».

### Citas sin confirmar, en rojo

Una sentada que nadie ha confirmado lleva ahora la marca «NO CONFIRMADA»
en la agenda, en el calendario (punto rojo, con su leyenda), en el listado
de captaciones del panel y en el de clientes. El comercial tiene que
saberlo antes de coger el coche.

### Clientes por calle y nombre, y más filtros

En el listado, la agenda y el panel los clientes se nombran «dirección ·
nombre», que es como los recuerda el equipo. El listado de clientes suma
filtros por tipo de instalación, forma de pago (financiación aprobada o
pendiente, contado, sin definir, sin operación), estado de la operación y
visita sin confirmar, y dos columnas nuevas: Pago (con la financiera) y
Comentario. Todo sale de la última operación del cliente: con la
financiera, de firmada en adelante cuenta como aprobada y antes como
pendiente.

### Comentarios propios de cada comercial

Cada uno puede dejar su comentario sobre un cliente desde el listado o
desde la ficha («✎ Comentario»), y se ve en el listado. No hay campo nuevo
en el servidor: se guarda como un apunte de seguimiento con origen
`comentario`. Se descartó usar un campo del cliente porque `etiquetas` lo
usa la importación como referencia y `otros` o `perfil` ya tienen texto
que se perdería. Así queda quién lo escribió y cuándo, y cada uno edita el
suyo sin crear otro. En el listado sale el último de cada persona, el
tuyo primero. El apunte cuenta como actividad del cliente, igual que una
llamada; el «Último contacto» de la ficha no lo tiene en cuenta.

### La ficha de dimensionado, dentro del cliente

La ficha de visita que se usaba suelta en el móvil vive ahora en una
pestaña de la ficha del cliente: comercial y cliente, vivienda,
instalación actual, gastos, ACS, fotovoltaica, oferta y financiación y
cierre, con el resumen en vivo (equipo, ahorro, ayudas, coste real, cuota
a 10 años) y los avisos. Sale rellena con lo que ya hay del cliente y de
su última instalación. Sin fotos ni conexión con el motor, que aquí ya
están en la pestaña Proyecto.

Se guarda en el campo `notas` del proyecto, como `FICHA_DIM_V1:` seguido
del JSON. Si en notas ya había texto, se conserva dentro del mismo JSON.
Como el servidor reescribe siempre la descripción al guardar el proyecto,
antes de guardar se vuelve a leer y se manda tal cual, para no borrarla.
«Pasar al proyecto» escribe, tras confirmarlo, un resumen legible al final
de la descripción (entre marcas, para que la segunda vez lo sustituya en
vez de duplicarlo). Guardar puede devolver a la cola un proyecto que
estaba parado esperando datos, igual que si se hubiera escrito en la
descripción.

## 07/10/2026

### La entrada al CRM, bastante más dura de forzar

Cuatro cosas, que juntas cierran casi todo lo que estaba abierto.

Las claves ya no se guardan con una sola pasada de SHA-256, que es
instantánea de probar a lo bruto, sino con cuatro mil. Las que ya estaban
se reescriben reforzadas la primera vez que su dueño entra, sin que nadie
tenga que cambiar nada ni enterarse.

Cinco fallos seguidos cierran la entrada de ese usuario diez minutos, y
cada tanda siguiente el triple, hasta una hora. A dirección le llega un
aviso por correo cuando pasa. Antes solo había una espera de 0,7 segundos
por intento, que da para unos cinco mil intentos por hora.

Una sesión parada dos horas deja de valer, además del tope de doce, y
cambiar la clave echa fuera a quien estuviera dentro con la anterior
—menos a quien la está cambiando, que si no se quedaría en la calle—.
Resetearle la clave a alguien le cierra todo y le olvida los equipos.

Y entrar desde un ordenador o un móvil nuevo pide un código de seis
dígitos que llega al correo de esa persona. Desde un aparato ya conocido
no se pide; los conocidos se ven y se quitan desde Mi perfil. Si un día
el correo falla y deja a alguien fuera, se apaga desde Ajustes con
«dos_pasos» en «no», que para eso está.


## 05/10/2026

### El README lleva al historial

_Sin más detalle._

### El porqué de cada cambio queda en el repositorio

_Sin más detalle._

### Pruebas del cuadre de facturación

_Sin más detalle._

### Aviso automático cuando la facturación no cuadra

_Sin más detalle._

### Pruebas del orden por lo más reciente

_Sin más detalle._

### La pantalla respeta el orden por lo más reciente

_Sin más detalle._

### Las fechas se ordenan como fechas, no como números

_Sin más detalle._

### Las puertas se ordenan en el servidor, de la más nueva a la más vieja

_Sin más detalle._

### Prueba de la hora suelta

_Sin más detalle._

### La hora sale como hora, no como una fecha de 1899

_Sin más detalle._

### Pruebas de exportar, crear, corregir y borrar

_Sin más detalle._

### Botones de exportar y de tocar las fichas y las puertas

_Sin más detalle._

### Excel y PDF sin librerías de fuera

_Sin más detalle._

### Directorio y puertas: alta, edición y borrado desde el CRM

_Sin más detalle._

### Pruebas del cliente con coordenada de fuera

_Sin más detalle._

### La regla de España vale también para los clientes

_Sin más detalle._

### Pruebas de la regla de España

_Sin más detalle._

### Solo España: las puertas de fuera no entran, y las coladas se borran

_Sin más detalle._

### El mapa se encaja donde está el grueso

_Sin más detalle._

### Prueba del aviso de la semana cerrada

_Sin más detalle._

### El aviso de puertas sale solo los lunes

_Sin más detalle._

### Prueba de la puerta sin fecha

_Sin más detalle._

### Las puertas sin fecha se cuentan aparte

_Sin más detalle._

### Una puerta sin fecha no es una puerta de esta semana

_Sin más detalle._

### Pruebas del directorio, los permisos y las puertas nuevas

_Sin más detalle._

### Pantalla del directorio y arreglo del mapa en blanco

_Sin más detalle._

### El directorio entra en el menú

_Sin más detalle._

### El directorio histórico y las puertas tocadas

_Sin más detalle._


## 22/09/2026

### Regenerar el paquete de una sola pieza

_Sin más detalle._

### Pruebas: conceptos cortados y sesiones que no caducan al nacer

_Sin más detalle._

### Ningún gasto se queda sin clasificar

_Sin más detalle._

### Las sesiones ya no nacen caducadas

_Sin más detalle._

### Las sesiones ya no nacen caducadas

_Sin más detalle._

### Ningún gasto se queda sin clasificar

_Sin más detalle._

### Regenerar el paquete de una sola pieza

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._


## 21/09/2026

### Pruebas de la segunda cuenta bancaria

_Sin más detalle._

### Cada apunte del banco sabe de qué cuenta es

_Sin más detalle._

### El banco admite más de una cuenta

_Sin más detalle._

### El banco enseña el saldo de cada cuenta

_Sin más detalle._

### Regenerar el paquete de una sola pieza

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Importador del histórico de la empresa

_Sin más detalle._

### Pruebas: comisiones, importador y correo de los viernes

_Sin más detalle._

### Ajustes: cada forma de comisionar con su sitio

_Sin más detalle._

### Cuatro formas de comisionar, no una

_Sin más detalle._

### Cuatro formas de comisionar, no una

_Sin más detalle._

### Al instalar, cada uno nace con su tarifa y su responsable

_Sin más detalle._

### El detalle de comisiones dice por qué se cobra cada una

_Sin más detalle._

### El resumen de los viernes puede ir todo a un solo correo

_Sin más detalle._

### El buzón de pruebas se puede vaciar entre envíos

_Sin más detalle._

### Marcar en la ficha si se bajó el precio de tarifa

_Sin más detalle._

### La nómina cuenta también lo que vende el equipo

_Sin más detalle._

### Los cuatro campos de comisión viajan al navegador

_Sin más detalle._

### Registrar la acción de importar en la API

_Sin más detalle._

### Recortar la cabecera al regenerar el paquete

Sin esto, TODO_EN_UNO.gs ganaba dos lineas en blanco cada vez que se regeneraba.

### La cabecera del paquete ya no engorda

unir.js conservaba la cabecera de la vuelta anterior con las lineas en blanco que le habia dejado el separador, asi que el archivo ganaba dos lineas en cada regeneracion. Ahora se recorta antes de pegar.

### El texto de los cuatro manuales

Bloques compartidos (entrar, vacaciones, nomina, el correo de los viernes) y lo propio de cada papel, con la captura de pantalla debajo del parrafo que la explica.

### La maqueta de los manuales

ReportLab: banda negra con el logo en cada pagina, tipografias, tablas, recuadros de aviso y las capturas de pantalla con su pie.

### Las capturas de los manuales se sacan solas

Recorre el CRM de pruebas con cada rol y guarda 24 capturas recortadas a lo que se ve sin bajar, que es lo que entra en el PDF.

### Cómo se hacen los manuales

Un PDF por perfil, y los dos comandos para regenerarlos con sus capturas.

### Fuera del repositorio los PDF y las capturas

Se regeneran con los comandos del README de docs/manuales.

### Dos comprobaciones para el cargo repetido

Cubren el caso real del extracto: un cargo, su devolucion y el mismo cargo otra vez, con el saldo volviendo al mismo sitio. Y que una repeticion de mas si entra al reimportar. 149 comprobaciones en verde.

### El paquete de una sentada, con los dos arreglos

Regenerado con node pruebas/unir.js: identificadores por lotes y el conteo de repeticiones del banco. Es el mismo codigo que corre ya en Apps Script.

### El banco cuenta las repeticiones en lugar de descartarlas

La clave de un movimiento llevaba fecha, concepto, importe y saldo, dando por hecho que el saldo separa dos apuntes iguales del mismo dia. No siempre: un cargo, su devolucion y el mismo cargo otra vez dejan el saldo igual las dos veces, y los dos son de verdad. En el extracto real habia dos casos asi y el CRM se comia un movimiento de cada par. Ahora se compara cuantas veces aparece cada apunte en el extracto contra cuantas hay guardadas, y solo entra lo que sobra: reimportar el mismo archivo sigue sin duplicar nada.

### Identificadores por lotes al insertar

insertarLote_ pedia un id por fila, cada uno con su propio candado y su escritura en PropertiesService: importar un extracto de 344 apuntes tardaba mas de un minuto y dos importaciones a la vez se pisaban y duplicaban los movimientos. Ahora se reservan todos los ids de una vez. De paso, BANCO, VACACIONES, SESIONES y LOG tienen su propio prefijo en lugar de X.

### Resumen semanal por correo los viernes y correos del equipo

_Sin más detalle._

### README: resumen semanal por correo

_Sin más detalle._

### Manual: el correo de los viernes

_Sin más detalle._

### 147 comprobaciones, con el correo de los viernes

_Sin más detalle._

### Ajustes: quien recibe el resumen semanal y envio a mano

_Sin más detalle._

### README: captaciones adjudicadas, calendario y ruta en coche

_Sin más detalle._

### Manual: adjudicar captaciones, calendario y ruta en coche

_Sin más detalle._

### 135 comprobaciones y prueba de adjudicacion, calendario y ruta

_Sin más detalle._

### Estilos del calendario de visitas

_Sin más detalle._

### Agenda con calendario, adjudicacion de captaciones y boton de ir en coche

_Sin más detalle._

### Calendario mensual reutilizable y enlaces de navegacion en coche

_Sin más detalle._

### Adjudicar la captacion a un comercial sincroniza la cartera del cliente

_Sin más detalle._

### Script que junta el backend en un solo archivo

_Sin más detalle._

### README: el backend tambien viene en un solo archivo

_Sin más detalle._

### Instalacion: la forma rapida con TODO_EN_UNO.gs

_Sin más detalle._

### Backend en un solo archivo para instalar de golpe

_Sin más detalle._

### Add files via upload

_Sin más detalle._

### Add files via upload

_Sin más detalle._

### Add files via upload

_Sin más detalle._

### Add files via upload

_Sin más detalle._

### Add files via upload

_Sin más detalle._

### Add files via upload

_Sin más detalle._

### Instalacion: donde quedan las copias y como llegan al Escritorio

_Sin más detalle._

### Simulador de Drive con carpetas anidadas

_Sin más detalle._

### Las copias van dentro de ZERO WATTIOS en el Drive, para que se sincronicen solas

_Sin más detalle._

### README con vacaciones y copias de seguridad

_Sin más detalle._

### Manual e instalacion con vacaciones y copia semanal

_Sin más detalle._

### 109 comprobaciones: vacaciones, copias y cobros

_Sin más detalle._

### Estilos del calendario de vacaciones

_Sin más detalle._

### Menu con vacaciones y pintado sin pisarse entre pantallas

_Sin más detalle._

### Pantalla de vacaciones y copias de seguridad en ajustes

_Sin más detalle._

### Vacaciones con aprobacion, copia de seguridad semanal y recalculo de cobros

_Sin más detalle._

### README con la agenda y las nominas en PDF

_Sin más detalle._

### Manual e instalacion al dia con las nominas en PDF

_Sin más detalle._

### Pruebas de la nomina en PDF y Drive simulado

_Sin más detalle._

### Nominas: subida y descarga del PDF mensual con permisos

_Sin más detalle._

### Pantallas del CRM: panel, agenda, clientes, finanzas, equipo, parte, nominas y mapa

_Sin más detalle._

### Simulador de Apps Script y pruebas automaticas

_Sin más detalle._

### Instalacion paso a paso y manual de uso por rol

_Sin más detalle._

### Iconos de Leaflet

_Sin más detalle._

### Leaflet dentro del repositorio: el mapa no depende de ningun CDN

_Sin más detalle._

### Nucleo de la interfaz: armazon, API, componentes y graficos

_Sin más detalle._

### Logotipo de ZERO WATTIOS e iconos

_Sin más detalle._

### Hoja de estilo del CRM

_Sin más detalle._

### Backend en Apps Script: datos, permisos, finanzas, partes, nominas y mapa

_Sin más detalle._

### CRM de ZERO WATTIOS: raíz del proyecto

_Sin más detalle._

## 10/11/2026 · Seguimiento de operaciones (Rubén)
- Nueva pantalla «Seguimiento de operaciones» (solo dirección): lee las pestañas CORREOS-WHATSSAP y DOCUMENTACIÓN PROYECTOS del Excel «SEGUIMIENTO OPERACIONES ZERO WATTIOS BUENO» (Drive, solo lectura, caché 10 min, botón Actualizar). Contadores, pastillas de lo que falta por check (filtran), matriz de checks con avance por bloque y siguiente paso. No muestra DNI, teléfono ni email.

## 12/11/2026 · Pestaña «Mis visitas» (petición de Nando)
- Nueva pantalla `#visitas` para comerciales («Mis visitas») y dirección («Visitas de los comerciales», con filtro por comercial).
- Visitas de las dos últimas semanas, de la más nueva a la más antigua, agrupadas por día.
- En cada visita, tres botones grandes: sentada (sin marcar → sí → no llegó), proyecto hecho y enviado al cliente. Hecho/enviado salen solos del proyecto del CRM; si se hizo fuera, se marcan a mano (columnas nuevas `CAPTACIONES.proyecto_creado` y `proyecto_enviado`).
- Campo «¿Qué te ha dicho el cliente?» con fecha, «Siguiente acción» con fecha y desplegable de estado de la operación: se guarda como contacto del historial (SEGUIMIENTO, mueve la próxima acción de la ficha) y el estado en la operación sin tocar importes (si no hay operación, se crea).
- Pulsar en el nombre o la dirección abre la ficha del cliente. Resumen arriba (visitas, sentadas, proyectos, enviados, sin apuntar) y filtros rápidos.
- Backend: `api/visitas.php` (visitasRecientes, visitaMarcar, visitaApunte). Pruebas contra MariaDB local: 16/16.

## 13/11/2026 · Ficha de dimensionado: nada de 22 kW en monofásica
- La Dual Clima de 22 kW solo existe en trifásica. En una casa monofásica que por superficie pediría 22 kW, la ficha pregunta en «3 · Instalación actual» si va con **una máquina de 19 kW** o con **dos de 12 kW en cascada**.
- Mientras no se elija, la ficha marca un error («pregunta al cliente…»). Con la elección, el equipo recomendado, la cascada y los avisos salen ya con 19 kW o 2 × 12 kW.
- Ajuste (Nando, 13/11): por defecto va con la de **19 kW**; el comercial solo cambia a dos de 12 kW si el cliente lo prefiere. Ya no sale error; con más de 500 m² avisa de que una de 19 kW puede quedarse corta.

## 13/11/2026 · Monitorización de plantas SolaX Cloud
- Tabla nueva `MONITOREO`: una lectura por planta y día (estado, red, kWp, batería, generación del día, carga/descarga, incidencia y recomendación).
- `importarMonitorizacion` (solo dirección): la tarea diaria manda las plantas de global.solaxcloud.com; cada planta se enlaza con su cliente por la dirección, por el nombre o por un mapa fijo (`SOLAX_MAPA`).
- `monitorizacionCliente` y la tarjeta **Monitorización SolaX** en la ficha del cliente: última lectura, generación de hoy, 7 y 30 días (kWh/kWp), batería, incidencia y recomendación, e incidencias anteriores. Solo aparece si el cliente tiene planta.
