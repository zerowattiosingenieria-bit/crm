# Manuales del CRM

Un PDF por perfil, para entregar a cada persona:

| Manual | Para quién |
| --- | --- |
| `Manual_CRM_Direccion.pdf` | Rubén y Fernando |
| `Manual_CRM_Comercial.pdf` | Nando y Rober |
| `Manual_CRM_Captador.pdf` | Sandra y Abraham |
| `Manual_CRM_Superadmin.pdf` | Superadmin |

Los PDF generados no se guardan en el repositorio: están en Drive, en
`ZERO WATTIOS/CRM/Manuales`. Aquí vive lo que los produce.

Se generan con:

```bash
pip install reportlab
python3 contenido.py            # deja los PDF en esta misma carpeta
SALIDA_MANUALES=/otra/ruta python3 contenido.py
```

Las capturas de pantalla que ilustran los manuales tampoco se versionan: se
sacan solas con el CRM de pruebas levantado, y acaban en `img/`.

```bash
node pruebas/servidor.js &        # el CRM con datos de ejemplo
node pruebas/capturas-manual.js   # 24 capturas en docs/manuales/img/
```

`generar.py` tiene la maqueta (banda negra con el logo, tipografías, tablas y
recuadros) y `contenido.py` el texto de cada manual. Si cambia una pantalla del
CRM, se toca el texto en `contenido.py` y se vuelven a generar.
