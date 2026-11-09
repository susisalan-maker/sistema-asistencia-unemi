"""Archivos para exportar las marcaciones de una persona: un PDF (para presentar o imprimir) y un Excel (para revisar y filtrar).

Aquí solo se arma el archivo a partir de datos ya listos (`DatosExportacion`); de dónde salen los datos y quién puede pedirlos
lo decide el router (`routers/marcaciones.py`, GET /marcaciones/exportar). No se incluyen fotos, coordenadas ni el id del celular:
son datos sensibles y no hacen falta para presentar la asistencia. Las horas son las de Ecuador (UTC-5).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as pdf_canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

MARINO = colors.HexColor("#1b2a6e")
LIENZO = colors.HexColor("#eef1f5")
AVISO_FONDO = colors.HexColor("#fdf0d8")
AVISO_TEXTO = colors.HexColor("#7a4f0a")
TEXTO_SUAVE = colors.HexColor("#566079")

NOMBRES_TIPO = {
    "ingreso": "Ingreso",
    "salida_almuerzo": "Salida a almorzar",
    "entrada_almuerzo": "Regreso del almuerzo",
    "salida": "Salida",
}
NOMBRES_ANOMALIA = {
    "fuera_geocerca": "Marcaste fuera de la zona",
    "sin_ingreso": "No marcaste ese día",
    "sin_salida": "Falta tu salida",
    "sin_regreso_almuerzo": "Falta el regreso del almuerzo",
    "almuerzo_excedido": "Almuerzo más largo de lo permitido",
    "fuera_horario": "Marcación fuera de tu horario",
    "duplicada": "Marcación repetida o fuera de orden",
    "verificacion_fallida": "No se pudo verificar tu rostro",
    "desplazamiento_inusual": "Desplazamiento inusual",
    "uso_recurrente_web": "Uso frecuente de la marcación web",
    "dia_no_laborable": "Marcaste en un día no laborable",
    "ubicacion_simulada": "Ubicación simulada detectada",
}
NOMBRES_ESTADO = {
    "pendiente": "Abierta",
    "en_revision": "En revisión",
    "justificada": "Justificada",
    "rechazada": "Rechazada",
    "sin_justificar": "Sin justificar",
}
DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]


def nombre_de_tipo(tipo: str) -> str:
    return NOMBRES_TIPO.get(tipo, tipo)


def nombre_de_anomalia(tipo: str) -> str:
    return NOMBRES_ANOMALIA.get(tipo, "Observación en tu asistencia")


def nombre_de_estado(estado: str) -> str:
    return NOMBRES_ESTADO.get(estado, estado)


def fecha_corta(d: date) -> str:
    """'8 nov'."""
    return f"{d.day} {MESES[d.month - 1]}"


def fecha_con_dia(d: date) -> str:
    """'Dom 8 nov'."""
    return f"{DIAS[d.weekday()][:3].capitalize()} {fecha_corta(d)}"


def texto_periodo(desde: date, hasta: date) -> str:
    """'2 – 8 nov 2026', o '28 oct – 3 nov 2026' / '28 dic 2025 – 3 ene 2026' si cruza de mes o de año."""
    if desde == hasta:
        return f"{fecha_corta(desde)} {hasta.year}"
    if desde.year != hasta.year:
        return f"{fecha_corta(desde)} {desde.year} – {fecha_corta(hasta)} {hasta.year}"
    if desde.month != hasta.month:
        return f"{fecha_corta(desde)} – {fecha_corta(hasta)} {hasta.year}"
    return f"{desde.day} – {fecha_corta(hasta)} {hasta.year}"


def texto_dias(dias: list[int]) -> str:
    """Los días de trabajo (1 = lunes … 7 = domingo): 'Lunes a viernes', 'Lunes, miércoles, viernes'."""
    orden = sorted({d for d in dias if 1 <= d <= 7})
    if not orden:
        return "—"
    seguidos = len(orden) > 2 and orden[-1] - orden[0] == len(orden) - 1
    texto = f"{DIAS[orden[0] - 1]} a {DIAS[orden[-1] - 1]}" if seguidos else ", ".join(DIAS[d - 1] for d in orden)
    return texto.capitalize()


@dataclass
class FilaMarcacion:
    fecha: date
    tipo: str
    hora: str                          # 'HH:MM', hora de Ecuador
    lugar: str | None = None
    anomalia: str | None = None        # tipo de la observación, si dejó alguna
    estado_anomalia: str | None = None
    sin_conexion: bool = False


@dataclass
class DatosExportacion:
    nombre: str
    correo: str
    sede: str | None
    horario: str | None                # 'Lunes a viernes · 08:00 – 17:00'
    desde: date
    hasta: date
    generado: datetime                 # hora de Ecuador
    filas: list[FilaMarcacion] = field(default_factory=list)

    @property
    def total(self) -> int:
        return len(self.filas)

    @property
    def dias_con_marcacion(self) -> int:
        return len({f.fecha for f in self.filas})

    @property
    def con_observacion(self) -> int:
        return sum(1 for f in self.filas if f.anomalia)

    @property
    def sin_conexion(self) -> int:
        return sum(1 for f in self.filas if f.sin_conexion)

    @property
    def texto_generado(self) -> str:
        g = self.generado
        return f"{g.day} {MESES[g.month - 1]} {g.year}, {g:%H:%M}"


def nombre_de_archivo(datos: DatosExportacion, extension: str) -> str:
    return f"Marcaciones_{datos.desde.isoformat()}_a_{datos.hasta.isoformat()}.{extension}"


# ------------------------------------------------------------------------------------------------------------- Excel
def generar_xlsx(datos: DatosExportacion) -> bytes:
    """Hoja «Marcaciones» (una fila por marcación, con filtros) y hoja «Resumen» (la persona, el período y los totales)."""
    libro = Workbook()
    hoja = libro.active
    hoja.title = "Marcaciones"
    encabezados = ["Fecha", "Día", "Marcación", "Hora", "Lugar", "Observación", "Estado de la observación", "Enviada sin conexión"]
    hoja.append(encabezados)
    relleno_encabezado = PatternFill("solid", fgColor="1B2A6E")
    for celda in hoja[1]:
        celda.font = Font(bold=True, color="FFFFFF")
        celda.fill = relleno_encabezado
        celda.alignment = Alignment(vertical="center", wrap_text=True)
    relleno_aviso = PatternFill("solid", fgColor="FDF0D8")
    for f in datos.filas:
        hh, mm = (int(x) for x in f.hora.split(":")[:2])
        hoja.append([
            f.fecha, DIAS[f.fecha.weekday()], nombre_de_tipo(f.tipo), time(hh, mm), f.lugar or "",
            nombre_de_anomalia(f.anomalia) if f.anomalia else "",
            nombre_de_estado(f.estado_anomalia) if f.anomalia and f.estado_anomalia else "",
            "Sí" if f.sin_conexion else "No",
        ])
        fila = hoja.max_row
        hoja.cell(fila, 1).number_format = "yyyy-mm-dd"
        hoja.cell(fila, 4).number_format = "hh:mm"
        if f.anomalia:
            for col in range(1, len(encabezados) + 1):
                hoja.cell(fila, col).fill = relleno_aviso
    for i, ancho in enumerate([12, 12, 22, 8, 28, 36, 24, 20], start=1):
        hoja.column_dimensions[get_column_letter(i)].width = ancho
    hoja.freeze_panes = "A2"
    if datos.filas:
        hoja.auto_filter.ref = f"A1:{get_column_letter(len(encabezados))}{hoja.max_row}"

    resumen = libro.create_sheet("Resumen")
    negrita = Font(bold=True)
    filas = [
        ("Persona", datos.nombre), ("Correo", datos.correo), ("Sede", datos.sede or "—"), ("Horario", datos.horario or "—"),
        ("Período", texto_periodo(datos.desde, datos.hasta)), ("Generado", f"{datos.texto_generado} (horas de Ecuador)"),
        (None, None),
        ("Marcaciones", datos.total), ("Días con marcación", datos.dias_con_marcacion),
        ("Con observación", datos.con_observacion), ("Enviadas sin conexión", datos.sin_conexion),
    ]
    for etiqueta, valor in filas:
        resumen.append([etiqueta, valor])
        if etiqueta:
            resumen.cell(resumen.max_row, 1).font = negrita
            resumen.cell(resumen.max_row, 2).alignment = Alignment(horizontal="left")
    resumen.column_dimensions["A"].width = 24
    resumen.column_dimensions["B"].width = 44

    salida = BytesIO()
    libro.save(salida)
    return salida.getvalue()


# --------------------------------------------------------------------------------------------------------------- PDF
class _LienzoNumerado(pdf_canvas.Canvas):
    """Lienzo que sabe cuántas páginas hay en total, para «Página 1 de 3» y el pie con la fecha de generación."""

    texto_generado = ""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._paginas: list[dict] = []

    def showPage(self):
        self._paginas.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._paginas)
        for estado in self._paginas:
            self.__dict__.update(estado)
            self._pie(total)
            super().showPage()
        super().save()

    def _pie(self, total: int):
        ancho, _ = A4
        self.setStrokeColor(colors.HexColor("#e1e6ef"))
        self.line(18 * mm, 16 * mm, ancho - 18 * mm, 16 * mm)
        self.setFont("Helvetica", 8)
        self.setFillColor(TEXTO_SUAVE)
        self.drawString(18 * mm, 11 * mm, f"Generado el {self.texto_generado} · Horas de Ecuador (UTC-5)")
        self.drawRightString(ancho - 18 * mm, 11 * mm, f"Página {self._pageNumber} de {total}")


def generar_pdf(datos: DatosExportacion) -> bytes:
    """Reporte de marcaciones: datos de la persona y del período, cuatro totales y la tabla (que sigue en otras páginas si hace falta)."""
    salida = BytesIO()
    margen = 18 * mm
    ancho_util = A4[0] - 2 * margen
    doc = SimpleDocTemplate(
        salida, pagesize=A4, leftMargin=margen, rightMargin=margen, topMargin=0, bottomMargin=22 * mm,
        title="Reporte de marcaciones", author="Asistencia Universitaria",
    )
    base = ParagraphStyle("base", fontName="Helvetica", fontSize=9, leading=12, textColor=colors.HexColor("#3d4658"), alignment=TA_LEFT)
    etiqueta = ParagraphStyle("etiqueta", parent=base, fontName="Helvetica-Bold", fontSize=7, textColor=TEXTO_SUAVE, leading=9)
    valor = ParagraphStyle("valor", parent=base, fontName="Helvetica-Bold", fontSize=11, textColor=MARINO, leading=14)
    celda = ParagraphStyle("celda", parent=base, fontSize=8.5, leading=11)
    celda_b = ParagraphStyle("celda_b", parent=celda, fontName="Helvetica-Bold", textColor=MARINO)
    aviso = ParagraphStyle("aviso", parent=celda, textColor=AVISO_TEXTO)
    suave = ParagraphStyle("suave", parent=celda, textColor=colors.HexColor("#8a93a5"))

    def esc(texto: str) -> str:
        return texto.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    elementos: list = []
    banda = Table(
        [[Paragraph("ASISTENCIA UNIVERSITARIA", ParagraphStyle("b1", parent=base, fontName="Helvetica-Bold", fontSize=8, textColor=colors.HexColor("#b9c2e0"))),
          ], [Paragraph("Reporte de marcaciones", ParagraphStyle("b2", parent=base, fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=colors.white))]],
        colWidths=[ancho_util + 2 * margen],
    )
    banda.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), MARINO), ("LEFTPADDING", (0, 0), (-1, -1), margen), ("TOPPADDING", (0, 0), (0, 0), 20),
        ("BOTTOMPADDING", (0, 1), (0, 1), 16), ("TOPPADDING", (0, 1), (0, 1), 2), ("BOTTOMPADDING", (0, 0), (0, 0), 0),
    ]))
    elementos += [banda, Spacer(1, 14)]

    def bloque(titulo: str, principal: str, secundario: str | None = None):
        partes = [Paragraph(titulo, etiqueta), Paragraph(esc(principal), valor)]
        if secundario:
            partes.append(Paragraph(esc(secundario), base))
        return partes

    datos_persona = Table(
        [[bloque("PERSONA", datos.nombre, datos.correo), bloque("PERÍODO", texto_periodo(datos.desde, datos.hasta), f"{(datos.hasta - datos.desde).days + 1} días")],
         [bloque("SEDE", datos.sede or "—"), bloque("HORARIO", datos.horario or "—")]],
        colWidths=[ancho_util / 2, ancho_util / 2],
    )
    datos_persona.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    elementos += [datos_persona, Spacer(1, 4)]

    def total(numero: int, texto: str, aviso_: bool = False):
        color = AVISO_TEXTO if aviso_ else MARINO
        return [Paragraph(str(numero), ParagraphStyle("n", parent=base, fontName="Helvetica-Bold", fontSize=16, leading=19, textColor=color)),
                Paragraph(texto, ParagraphStyle("t", parent=base, fontName="Helvetica-Bold", fontSize=7.5, leading=9, textColor=color if aviso_ else TEXTO_SUAVE))]

    cajas = Table(
        [[total(datos.total, "Marcaciones"), total(datos.dias_con_marcacion, "Días con marcación"),
          total(datos.con_observacion, "Con observación", datos.con_observacion > 0), total(datos.sin_conexion, "Enviadas sin conexión")]],
        colWidths=[ancho_util / 4] * 4,
    )
    cajas.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIENZO), ("BACKGROUND", (2, 0), (2, 0), AVISO_FONDO if datos.con_observacion else LIENZO),
        ("LINEAFTER", (0, 0), (-2, -1), 4, colors.white), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8), ("LEFTPADDING", (0, 0), (-1, -1), 9),
    ]))
    elementos += [cajas, Spacer(1, 16)]

    if not datos.filas:
        elementos.append(Paragraph("No hay marcaciones en este período.", base))
    else:
        filas = [[Paragraph(f"<font color='white'><b>{t}</b></font>", celda) for t in ("Fecha", "Marcación", "Hora", "Lugar", "Observación")]]
        for f in datos.filas:
            extra = " · enviada sin conexión" if f.sin_conexion else ""
            if f.anomalia:
                estado = f" · {esc(nombre_de_estado(f.estado_anomalia))}" if f.estado_anomalia else ""
                obs_p = Paragraph(f"<b>{esc(nombre_de_anomalia(f.anomalia))}</b>{estado}{extra}", aviso)
            else:
                obs_p = Paragraph(f"Sin observación{extra}", suave)
            filas.append([
                Paragraph(fecha_con_dia(f.fecha), celda_b), Paragraph(esc(nombre_de_tipo(f.tipo)), celda),
                Paragraph(f"<b>{f.hora}</b>", celda), Paragraph(esc(f.lugar or "—"), celda), obs_p,
            ])
        tabla = Table(filas, colWidths=[ancho_util * p for p in (0.15, 0.20, 0.09, 0.26, 0.30)], repeatRows=1)
        estilo = [
            ("BACKGROUND", (0, 0), (-1, 0), MARINO), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f6f8fb")]),
        ]
        tabla.setStyle(TableStyle(estilo))
        elementos.append(tabla)

    _LienzoNumerado.texto_generado = datos.texto_generado
    doc.build(elementos, canvasmaker=_LienzoNumerado)
    return salida.getvalue()
