# Historial de cambios

Qué se ha ido tocando en el CRM y, sobre todo, por qué. Lo de arriba es lo
más reciente.

Esto no sustituye al manual: el manual cuenta cómo se usa el CRM hoy
(`docs/MANUAL.md`), y aquí queda la razón de cada cambio, que es lo que
luego no hay manera de reconstruir.



## 05/10/2026

### El CRM avisa solo cuando la facturación no cuadra

Hoy han aparecido dos cosas cruzando el Drive, el banco y el CRM a mano:
a una operación se le emitió el 50% y luego otra factura por el total en
vez de por la mitad que faltaba, y cinco facturas que estaban en la
carpeta no habían llegado nunca al CRM, con la numeración saltando sin
que nadie lo notara.

Son tres cuentas de sumar, así que ahora las hace el CRM: avisa si lo
facturado de una operación pasa de su total, si lo cobrado pasa de lo
facturado, y si la numeración de una serie tiene huecos, diciendo qué
números faltan con sus ceros delante para poder buscarlos en la carpeta.
Sale en los avisos del panel, y solo a quien ve las finanzas.

### Directorio y puertas, siempre lo más reciente arriba

Las puertas se ordenaban en la pantalla, pero el listado solo pinta las
600 primeras y el corte se hacía antes de ordenar: salían las primeras de
la hoja, o sea las más viejas. Ahora el servidor las entrega de la más
nueva a la más vieja, con la hora desempatando dentro del mismo día y las
que no tienen fecha al final. Eso arrastra también al mapa, al Excel y al
informe en PDF, que salen en ese mismo orden.

En el directorio manda la última visita, como hasta ahora, y entre los
que no tienen ninguna apuntada va por delante el que se ha dado de alta
después, para que una ficha recién creada a mano no se hunda al final.

De camino, un fallo que afectaba a todas las tablas de la casa: una fecha
como 2026-01-22 es solo dígitos y guiones, así que colaba por número y
parseFloat se quedaba en 2026 — todo un año ordenaba igual. Las fechas se
comparan como texto, y las celdas vacías se van al final se ordene como se
ordene.

### La hora de una puerta sale como hora, no como una fecha de 1899

Google guarda una celda que solo lleva la hora como una fecha del 30 de
diciembre de 1899, su día cero, y en el listado se leía «1899-12-30
09:22:00». Ahora sale «09:22», que es lo que pone en la hoja.

### El directorio y las puertas se sacan a Excel y a PDF, y se pueden tocar

Dos botones en cada pantalla sacan lo que se está mirando, con los filtros
puestos: un .xlsx de verdad (escrito a mano, un xlsx no es más que un zip
con unos XML dentro, así que no hace falta librería de nadie) y un informe
con la marca de la casa, los totales y el reparto por zona o municipio que
se manda a imprimir para guardarlo como PDF.

Y ya no hace falta esperar al Excel del lunes para arreglar algo: se da de
alta una ficha o una puerta, se corrige la que esté mal y se borra la que
sobre, de una en una o marcando varias. Borrar una ficha se lleva también
sus visitas, la referencia no se puede cambiar para que el Excel semanal
siga casando, y una puerta de fuera de España no entra ni a mano.

### La regla de España vale también para los clientes

Un cliente con una coordenada de fuera entra en el directorio como
cualquier otro, pero se queda sin punto: la ficha sirve igual y el mapa
no se va a la otra punta del mundo. El listado del mapa descarta además
cualquier coordenada rara que ya estuviera guardada.

### Solo España: las puertas de fuera no entran, y las coladas se borran

Las chinchetas que venían del Maps traían diez marcadores de viajes
(nueve de China) que no son puertas y abrían el mapa en el mundo entero.
Ahora el importador descarta todo lo que caiga fuera del recuadro de
España (Canarias incluidas) y «limpiarPuertasFuera» saca lo que ya
estuviera metido.

### El mapa se encaja donde está el grueso, no en los puntos perdidos

En el export de Google Maps venían diez sitios guardados de viajes —nueve
en China y un apartamento en Lanzarote— y con ellos dentro el mapa abría
en vista planeta. Ahora se encaja sobre la nube principal de puntos; los
raros siguen viéndose, pero no deciden el zoom.

### El aviso de puertas sale solo los lunes

Un disparador del propio Apps Script manda el lunes a las 8:00 el correo
con las puertas de la semana que acaba de cerrar, de lunes a domingo, a
quien puede ver el directorio. Sin depender de que nadie abra nada.

Pedido a mano sigue contando la semana en curso, y acepta una semana
concreta para poder rehacer un aviso viejo.

### Una puerta sin fecha no es una puerta de esta semana

Al cargar el histórico, las 47 puertas que no traían día se contaban como
tocadas esta semana solo porque el Excel entró hoy. Ahora «nueva» mira el
día en que se tocó y nada más; las que no lo traen se cuentan aparte, que
para eso no sabemos cuándo fueron.

### Pantalla del directorio: buscador, mapa y puertas de la semana

Dos pantallas en una. El archivo de clientes se busca por nombre,
dirección o teléfono, se filtra por empresa y municipio, y se puede mirar
en el mapa: solo salen los que tienen coordenada, y los situados únicamente
por el municipio se pintan más pequeños para no dar una precisión que no
tienen. Cada ficha abre con sus visitas.

Las puertas van en mapa o en listado, con las de esta semana en verde y
etiquetadas, el reparto por semanas y el filtro por zona y por fechas.

De paso, un fallo de los mapas: se creaban antes de que la pantalla
colgara del documento, así que si Leaflet ya estaba cargado de una
pantalla anterior el mapa salía en blanco. Ahora espera a tener sitio.

### El directorio histórico y las puertas tocadas

Los 1.174 clientes de Zero Wattios y Aurus, sus visitas y las puertas que
se han ido tocando entran en el CRM, pero en tablas aparte: el pipeline
del día a día sigue con sus operaciones y sus cobros sin descuadrarse.

Quién entra no va por rol sino por lista de personas, en Ajustes. A quien
no está ni le aparece la lista de quién puede. Al cargar de nuevo el
Excel de la semana no se duplica nada ni se pisa con vacío lo que ya
había, y cada puerta se compara por dónde está y qué día se tocó, así que
las nuevas se saben solas.


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
