# CRM · ZERO WATTIOS

CRM interno de ZERO WATTIOS INGENIERÍA, S.L. para la venta e instalación de
fotovoltaica y aerotermia: clientes, captaciones, instalaciones, contabilidad,
equipo y nóminas, con permisos distintos para cada persona.

La aplicación es una web estática (se publica en GitHub Pages) y la base de
datos es una hoja de cálculo de Google gobernada por un proyecto de Google
Apps Script. No hay servidores que mantener ni cuotas que pagar.

- **Aplicación:** https://zerowattiosingenieria-bit.github.io/crm/
- **Instalación paso a paso:** [docs/INSTALACION.md](docs/INSTALACION.md)
- **Manual de uso:** [docs/MANUAL.md](docs/MANUAL.md)

## Qué hace

**Clientes y captaciones.** Ficha completa de cada cliente (vivienda, consumo
actual, perfil, coordenadas), historial de contactos y fichas de captación con
su resultado. El captador da de alta cliente y cita en una sola pantalla.

**Instalaciones.** Importes por partida, ayudas y CAE, forma de pago y
financiación, fechas de propuesta, contrato, firma, instalación y
legalización, componentes reales (paneles, inversor, batería, aerotermia,
depósitos) y calendario de cobros 50/25/25 generado solo al firmar en contado.

**Contabilidad.** Ingresos, costes y margen de cada instalación; cobros con su
estado y su previsión; gastos por categoría; facturas emitidas; tesorería
prevista a 30, 60 y 90 días; y una tabla de salud financiera con semáforos,
objetivos y consejos concretos para mejorar la caja.

**Agenda.** Lo que toca hoy: seguimientos con fecha, sentadas concertadas e
instalaciones previstas, separados en vencido, hoy, esta semana y más
adelante, con botón de llamar y de apuntar el contacto sin salir de la lista.

**Equipo.** Resumen individual de ventas o captaciones, objetivos por periodo
del 16 al 15, comisiones devengadas, embudo de puerta fría a venta, ranking,
tiempos medios por fase y avisos de clientes que se enfrían.

**Parte diario.** Los captadores anotan puertas y visitas; los comerciales,
sentadas, con quién, y un resumen escrito. El sistema lee ese resumen,
reconoce a los clientes, propone cambios de estado, próximos pasos y fechas, y
espera confirmación antes de tocar nada.

**Nóminas.** Sueldo, dietas y comisiones por periodo, con desglose día a día y
consulta entre dos fechas cualesquiera. Cada uno ve la suya; dirección, todas.

**Mapa.** Solo para dirección: todos los clientes visitados sobre el mapa, por
estado, comercial, captador, municipio e interés, con capa de calor por gasto
energético y ficha completa al pulsar cada punto.

## Quién ve qué

| | Superadmin | Rubén y Fernando | Nando y Rober | Sandra y Abraham |
|---|---|---|---|---|
| Clientes | todos | todos | solo los suyos | solo los suyos |
| Instalaciones e importes | sí | sí | las suyas | las de sus captaciones |
| Contabilidad, facturas, gastos y márgenes | sí | sí | no | no |
| Mapa de clientes | sí | sí | no | no |
| Equipo, partes y nóminas de todos | sí | sí | no | no |
| Su resumen y su nómina | sí | sí | sí | sí |
| Alta de usuarios y claves | sí | no | no | no |

El filtro se aplica **en el servidor**: aunque alguien manipule el navegador,
los datos que no le corresponden no salen de la hoja de cálculo.

## Cómo está montado

```
index.html              pantalla de entrada y armazón de la aplicación
assets/css/app.css      toda la hoja de estilo
assets/js/
  app.js                menú por rol y reparto de pantallas
  api.js                conversación con el servidor y estado en memoria
  ui.js                 ventanas, tablas, formularios y tarjetas
  graficos.js           gráficos en SVG, sin librerías externas
  util.js               formato de fechas, dinero y ayudas varias
  vistas/               una pantalla por archivo
assets/vendor/leaflet/  mapa (incluido en el repositorio, no depende de CDN)
apps-script/            el backend: 11 archivos .gs para el proyecto de Apps Script
docs/                   instalación y manual de uso
pruebas/                simulador del backend, pruebas y recorrido con navegador
```

## Pruebas

```bash
npm install                 # solo la primera vez (playwright)
node pruebas/prueba.js      # 77 comprobaciones del backend, sin tocar Google
node pruebas/servidor.js &  # CRM completo en http://localhost:8765 con datos de ejemplo
node pruebas/flujos.js      # alta de cliente, instalación, parte, cobro, nómina y mapa
node pruebas/navegador.js   # recorre todas las pantallas con cada rol y guarda capturas
```

El simulador de `pruebas/mock.js` imita los servicios de Apps Script, así que
todo se puede probar en local antes de tocar los datos reales.

---

Uso interno de ZERO WATTIOS INGENIERÍA, S.L. (CIF B25935073).
