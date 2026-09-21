# -*- coding: utf-8 -*-
"""Genera los manuales en PDF del CRM, uno por papel dentro de la empresa."""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
                                Spacer, Image, Table, TableStyle, KeepTogether)
from reportlab.lib.utils import ImageReader

BASE = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(BASE, '..', '..'))
SALIDA = os.environ.get('SALIDA_MANUALES', BASE)

CARBON = colors.HexColor('#242422')
LIMA = colors.HexColor('#b4fa1e')
LIMA_OSC = colors.HexColor('#7fb800')
TINTA = colors.HexColor('#17191c')
TX2 = colors.HexColor('#5b6159')
LINEA = colors.HexColor('#e3e7e0')
PAPEL2 = colors.HexColor('#fafbf9')

WEB = 'https://zerowattiosingenieria-bit.github.io/crm/'

def estilos():
    return {
        'titulo': ParagraphStyle('titulo', fontName='Helvetica-Bold', fontSize=27, leading=31,
                                 textColor=TINTA, spaceAfter=4),
        'subtitulo': ParagraphStyle('subtitulo', fontName='Helvetica', fontSize=13, leading=18,
                                    textColor=TX2, spaceAfter=18),
        'h2': ParagraphStyle('h2', fontName='Helvetica-Bold', fontSize=15, leading=19,
                             textColor=TINTA, spaceBefore=18, spaceAfter=7),
        'h3': ParagraphStyle('h3', fontName='Helvetica-Bold', fontSize=11.5, leading=15,
                             textColor=TINTA, spaceBefore=11, spaceAfter=4),
        'p': ParagraphStyle('p', fontName='Helvetica', fontSize=10.3, leading=15.4,
                            textColor=TINTA, alignment=TA_LEFT, spaceAfter=8),
        'nota': ParagraphStyle('nota', fontName='Helvetica-Oblique', fontSize=9.5, leading=14,
                               textColor=TX2, spaceAfter=8),
        'celda': ParagraphStyle('celda', fontName='Helvetica', fontSize=9.5, leading=13,
                                textColor=TINTA),
        'celdaneg': ParagraphStyle('celdaneg', fontName='Helvetica-Bold', fontSize=9.5, leading=13,
                                   textColor=TINTA),
        'pie': ParagraphStyle('pie', fontName='Helvetica', fontSize=8.6, leading=12,
                              textColor=TX2),
    }

def cabecera_pie(rol, personas):
    def dibujar(c, doc):
        ancho, alto = A4
        # banda superior
        c.setFillColor(CARBON)
        c.rect(0, alto - 24*mm, ancho, 24*mm, stroke=0, fill=1)
        logo = os.path.join(RAIZ, 'assets', 'img', 'logo-dark.png')
        if os.path.exists(logo):
            c.drawImage(logo, 18*mm, alto - 17*mm, width=42*mm, height=5.6*mm,
                        mask='auto', preserveAspectRatio=True, anchor='sw')
        c.setFillColor(LIMA)
        c.setFont('Helvetica-Bold', 8)
        c.drawRightString(ancho - 18*mm, alto - 14*mm, 'MANUAL DEL CRM · ' + rol.upper())
        # pie
        c.setFillColor(TX2)
        c.setFont('Helvetica', 7.8)
        c.drawString(18*mm, 12*mm, 'ZERO WATTIOS INGENIERÍA, S.L. · ' + WEB)
        c.drawRightString(ancho - 18*mm, 12*mm, 'Página %d' % doc.page)
        c.setStrokeColor(LINEA)
        c.line(18*mm, 16*mm, ancho - 18*mm, 16*mm)
    return dibujar

def doc_para(ruta, rol, personas):
    doc = BaseDocTemplate(ruta, pagesize=A4, title='Manual del CRM · ' + rol,
                          author='ZERO WATTIOS INGENIERÍA', subject='CRM interno',
                          leftMargin=18*mm, rightMargin=18*mm,
                          topMargin=32*mm, bottomMargin=20*mm)
    marco = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='cuerpo')
    doc.addPageTemplates([PageTemplate(id='normal', frames=[marco],
                                       onPage=cabecera_pie(rol, personas))])
    return doc

def tabla(datos, e, anchos=None):
    filas = [[Paragraph(str(c), e['celdaneg'] if i == 0 else e['celda']) for c in fila]
             for i, fila in enumerate(datos)]
    t = Table(filas, colWidths=anchos, hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), PAPEL2),
        ('LINEBELOW', (0, 0), (-1, -1), 0.6, LINEA),
        ('LINEBELOW', (0, 0), (-1, 0), 1.1, CARBON),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    return t

def recuadro(titulo, texto, e, color=LIMA):
    t = Table([[Paragraph('<b>' + titulo + '</b><br/>' + texto, e['celda'])]],
              colWidths=[170*mm], hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), PAPEL2),
        ('LINEBEFORE', (0, 0), (0, -1), 3, color),
        ('BOX', (0, 0), (-1, -1), 0.6, LINEA),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
    ]))
    return t

IMG = os.path.join(BASE, 'img')

def captura(nombre, pie, e, ancho=170*mm):
    """Una pantalla del CRM, a lo ancho de la caja, con su pie explicativo."""
    ruta = os.path.join(IMG, nombre + '.png')
    if not os.path.exists(ruta):
        raise FileNotFoundError('falta la captura ' + ruta)
    px, py = ImageReader(ruta).getSize()
    img = Image(ruta, width=ancho, height=ancho * py / float(px))
    t = Table([[img], [Paragraph(pie, e['pie'])]], colWidths=[ancho], hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BOX', (0, 0), (0, 0), 0.7, LINEA),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (0, 0), 0),
        ('BOTTOMPADDING', (0, 0), (0, 0), 0),
        ('TOPPADDING', (0, 1), (0, 1), 5),
        ('BOTTOMPADDING', (0, 1), (0, 1), 0),
    ]))
    return KeepTogether([t])

def construir(rol, personas, bloques, nombre_archivo):
    e = estilos()
    ruta = os.path.join(SALIDA, nombre_archivo)
    doc = doc_para(ruta, rol, personas)
    hist = [Paragraph('Manual del CRM', e['titulo']),
            Paragraph(rol + ' · ' + personas, e['subtitulo'])]
    for bloque in bloques:
        tipo = bloque[0]
        if tipo == 'h2':
            hist.append(Paragraph(bloque[1], e['h2']))
        elif tipo == 'h3':
            hist.append(Paragraph(bloque[1], e['h3']))
        elif tipo == 'p':
            hist.append(Paragraph(bloque[1], e['p']))
        elif tipo == 'nota':
            hist.append(Paragraph(bloque[1], e['nota']))
        elif tipo == 'tabla':
            hist.append(Spacer(1, 3))
            hist.append(tabla(bloque[1], e, bloque[2] if len(bloque) > 2 else None))
            hist.append(Spacer(1, 8))
        elif tipo == 'img':
            hist.append(Spacer(1, 4))
            hist.append(captura(bloque[1], bloque[2], e))
            hist.append(Spacer(1, 12))
        elif tipo == 'caja':
            hist.append(Spacer(1, 4))
            hist.append(recuadro(bloque[1], bloque[2], e))
            hist.append(Spacer(1, 10))
    doc.build(hist)
    return ruta
