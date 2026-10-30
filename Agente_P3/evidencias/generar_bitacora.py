"""Genera la bitácora P3: prompts reconstruidos y validaciones realizadas."""
from pathlib import Path
from html import escape
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

RAIZ = Path(__file__).resolve().parents[2]
SALIDA = RAIZ / "output" / "pdf" / "Equipo01_BitacoraIA_P3_Parcial01.pdf"
SALIDA.parent.mkdir(parents=True, exist_ok=True)

filas = [
    ["1", "Diseña la interpretación de las siete preguntas gerenciales de P3; identifica intención, métrica, dimensiones, período y filtros, y solicita los datos que falten.",
     "Codex", "Intérprete controlado con siete familias, solicitudes estructuradas y continuación de aclaraciones.",
     "Interpretación de preguntas y contexto conversacional.",
     "Pruebas Python de preguntas válidas, ambigüedad, períodos, dimensiones no admitidas y operaciones prohibidas.",
     "Aceptar", "La estructura permite identificar lo solicitado y detener la consulta cuando faltan parámetros, sin inventar datos."],
    ["2", "Conecta el intérprete con consultas parametrizadas del data mart y redacta respuestas con resultados, cálculo, período y fuentes.",
     "Codex", "Catálogo cerrado de siete plantillas SQL, validación de parámetros y respuestas con evidencia.",
     "Catálogo, ejecución SQL y respuesta gerencial.",
     "Pruebas Node del catálogo y las respuestas; revisión de reglas de ingreso neto, ticket, margen, unidades y resultados vacíos.",
     "Modificar", "Se ajustaron las reglas para preservar unidades y empates, evitar contar líneas como tickets e informar ausencia de registros sin convertirla en cero."],
    ["3", "Integra Gemini para reconocer paráfrasis, conservando las consultas autorizadas y el manejo de aclaraciones.",
     "Codex + Gemini API", "Normalización JSON con gemini-3.5-flash-lite; validación posterior mediante el intérprete local y el catálogo.",
     "Integración de IA e interpretación del lenguaje.",
     "Interpretación real con Gemini y prueba de regresión: una aclaración explícita como octubre de 2025 se resuelve localmente.",
     "Modificar", "La prueba remota detectó que Gemini reformulaba una aclaración como otra pregunta. Se corrigió el flujo y se mantuvo el SQL bajo control del catálogo."],
    ["4", "Configura conexiones independientes al data mart y a la BDOO en Supabase, con TLS verificado y acceso de lectura a P1.",
     "Codex", "Conexión por pooler 6543, CA oficial y contexto local por transacción; P1 utiliza BEGIN READ ONLY.",
     "Acceso a datos y configuración del agente.",
     "Comprobación real de las dos bases; diagnóstico de puertos y certificado; pruebas del contexto transaccional y rechazo de escritura en P1.",
     "Modificar", "El puerto 5432 no respondía al SSLRequest. El 6543 permitió conectar; se adaptó el contexto por transacción y se añadió la CA sin desactivar la verificación TLS."],
    ["5", "Ejecuta una pregunta completa y verifica que su intención, SQL, parámetros, validaciones, resultado y respuesta queden guardados en la BDOO.",
     "Codex + Gemini API", "Pregunta de ingreso neto mensual, aclaración octubre de 2025 y resultado 5580,00. Trazabilidad persistida en P2.",
     "Orquestación P3 y adaptador de trazabilidad hacia P2.",
     "Control independiente en P1: 5580,00. Relectura desde otra conexión P2: sesión 2, pregunta 2, consulta 1, resultado 1, respuesta 1; cinco reglas aprobadas.",
     "Aceptar", "La respuesta coincide con el data mart y la cadena se recupera después de cerrar la conexión de escritura, demostrando persistencia efectiva."],
]

estilo = ParagraphStyle("celda", fontName="Helvetica", fontSize=8, leading=10.4, textColor=colors.black)
cabecera = ParagraphStyle("cabecera", parent=estilo, fontName="Helvetica-Bold", fontSize=8.4, leading=11)
titulo = ParagraphStyle("titulo", fontName="Helvetica-Bold", fontSize=17, leading=21)
nota = ParagraphStyle("nota", fontName="Helvetica", fontSize=8.4, leading=11)

def par(texto, formato=estilo):
    return Paragraph(escape(texto), formato)

encabezados = ["N", "Prompt enviado a la IA", "Herramienta empleada", "Resultado obtenido",
               "Componente del proyecto afectado", "Validación técnica realizada", "Decisión", "Justificación de la decisión"]
datos = [[par(x, cabecera) for x in encabezados]] + [[par(x) for x in fila] for fila in filas]
tabla = Table(datos, colWidths=[20, 135, 64, 112, 83, 130, 55, 194], repeatRows=1, hAlign="LEFT")
tabla.setStyle(TableStyle([
    ("GRID", (0, 0), (-1, -1), 0.65, colors.black),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eeeeee")),
    ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
]))

def pie(canvas, doc):
    canvas.setFont("Helvetica", 7)
    canvas.drawString(25, 17, "Equipo 01 | Parcial 01 | Bitácora P3 | 30 de octubre de 2026")
    canvas.drawRightString(816, 17, str(doc.page))

doc = SimpleDocTemplate(str(SALIDA), pagesize=landscape(A4), leftMargin=25, rightMargin=25,
                        topMargin=24, bottomMargin=30,
                        title="Bitácora de Inteligencia Artificial Generativa y Criterio Técnico - P3",
                        author="Equipo 01")
doc.build([
    Paragraph("Bitácora de Inteligencia Artificial Generativa y Criterio Técnico", titulo),
    Spacer(1, 6), Paragraph("Equipo 01 · P3: agente analítico · 30 de octubre de 2026", nota),
    Spacer(1, 5), Paragraph("Registro reconstruido a partir del trabajo realizado. Los prompts se presentan resumidos; no son transcripciones literales.", nota),
    Spacer(1, 12), tabla,
], onFirstPage=pie, onLaterPages=pie)
print(SALIDA)
