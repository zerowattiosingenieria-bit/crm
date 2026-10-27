# Historial de cambios

Qué se ha ido tocando en el CRM y, sobre todo, por qué. Lo de arriba es lo
más reciente.

Esto no sustituye al manual: el manual cuenta cómo se usa el CRM hoy
(`docs/MANUAL.md`), y aquí queda la razón de cada cambio, que es lo que
luego no hay manera de reconstruir.



## 27/10/2026

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
