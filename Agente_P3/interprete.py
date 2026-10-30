"""Interpretación controlada de preguntas de ventas; no ejecuta consultas SQL."""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from calendar import monthrange
from copy import deepcopy


MESES = {
    nombre: numero
    for numero, nombre in enumerate(
        (
            "enero", "febrero", "marzo", "abril", "mayo", "junio",
            "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
        ),
        start=1,
    )
}
MESES["setiembre"] = 9
TRIMESTRES = {"primer": 1, "segundo": 2, "tercer": 3, "cuarto": 4}
NUMEROS = {
    "uno": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5,
    "seis": 6, "siete": 7, "ocho": 8, "nueve": 9, "diez": 10,
}
CANALES = {
    "e-commerce": "E-commerce",
    "fisico": "Tienda Física",
    "tienda fisica": "Tienda Física",
}
CRITERIOS_CANAL = {
    "ingreso neto": ("ingreso_neto", []),
    "margen bruto": ("margen_bruto", []),
    "cantidad vendida": ("cantidad_vendida", []),
    "ticket promedio": (
        "ticket_promedio", []
    ),
}

# Las métricas de las siete familias se fijan en el contrato del Data Mart.
ESPECIFICACIONES = (
    (
        r"cual fue el ingreso neto por mes",
        "analizar_ventas", "ingreso_neto", [("tiempo", "mes")],
        "serie_temporal", None, (),
    ),
    (
        r"cuales (?:son|fueron) las (?P<limite>\d+|[a-z]+) categorias con mayor margen bruto",
        "analizar_rentabilidad", "margen_bruto", [("producto", "categoria")],
        "ranking_descendente", None, (),
    ),
    (
        r"que sucursal presenta el ticket promedio mas alto",
        "analizar_ventas", "ticket_promedio", [("sucursal", "sucursal")],
        "ranking_descendente", 1, (),
    ),
    (
        r"que segmento de clientes redujo mas su volumen de compra",
        "analizar_ventas", "volumen_compra", [("cliente", "segmento")],
        "comparar_periodos_y_ordenar_caida", 1,
        (),
    ),
    (
        r"que canal concentra el mayor valor de ventas",
        "analizar_ventas", "valor_ventas", [("canal", "tipo_canal")],
        "ranking_descendente", 1, (),
    ),
    (
        r"compare el margen de (?:dos canales|(?P<canal1>tienda fisica|e-commerce|fisico) y (?P<canal2>tienda fisica|e-commerce|fisico))",
        "comparar_rentabilidad", "margen_bruto",
        [("tiempo", "mes"), ("canal", "tipo_canal")],
        "comparacion_de_series_temporales", None,
        (),
    ),
    (
        r"que producto lidera las ventas dentro de (?:una categoria y periodo determinados|la categoria (?P<categoria>[a-z]+(?: [a-z]+)*?)(?= (?:en|durante) |$))",
        "identificar_producto_mas_vendido", "ventas_producto",
        [("producto", "producto")], "ranking_descendente", 1,
        (),
    ),
)

OPERACIONES_NO_AUTORIZADAS = re.compile(
    r"\b(?:borra|borrar|elimina|eliminar|modifica|modificar|actualiza|actualizar|"
    r"inserta|insertar|drop|delete|update|truncate|insert)\b"
)


def normalizar(texto: str) -> str:
    """Normaliza para reconocer palabras sin alterar los datos del Data Mart."""
    texto = "".join(
        letra for letra in unicodedata.normalize("NFD", texto.casefold())
        if unicodedata.category(letra) != "Mn"
    )
    return re.sub(r"\s+", " ", texto.strip(" ¿?!.\t\n\r"))


def _periodo(texto: str) -> dict | None:
    """Devuelve un período explícito o simbólico; None significa que falta aclarar."""
    if not texto:
        return None

    ultimos = re.fullmatch(
        r"durante los ultimos (?P<cantidad>\d+|[a-z]+) meses disponibles", texto
    )
    if ultimos:
        palabra = ultimos["cantidad"]
        cantidad = int(palabra) if palabra.isdigit() else NUMEROS.get(palabra)
        if cantidad is not None and 1 <= cantidad <= 20:
            return {"tipo": "ultimos_meses_disponibles", "cantidad": cantidad}
        return None

    mes = re.fullmatch(
        r"(?:en|durante) (?:el )?(?:mes de )?"
        r"(?P<mes>enero|febrero|marzo|abril|mayo|junio|julio|agosto|"
        r"septiembre|setiembre|octubre|noviembre|diciembre)(?: de (?P<anio>\d{4}))?",
        texto,
    )
    if mes:
        if not mes["anio"] or int(mes["anio"]) == 0:
            return None
        anio, numero = int(mes["anio"]), MESES[mes["mes"]]
        return _rango(anio, numero, 1, numero, monthrange(anio, numero)[1])

    trimestre = re.fullmatch(
        r"(?:en|durante) (?:el )?(?P<orden>primer|segundo|tercer|cuarto)"
        r" trimestre(?: de (?P<anio>\d{4}))?",
        texto,
    )
    if trimestre:
        if not trimestre["anio"] or int(trimestre["anio"]) == 0:
            return None
        anio = int(trimestre["anio"])
        inicio = (TRIMESTRES[trimestre["orden"]] - 1) * 3 + 1
        fin = inicio + 2
        return _rango(anio, inicio, 1, fin, monthrange(anio, fin)[1])

    anio = re.fullmatch(r"(?:en|durante) (?:el ano )?(?P<anio>\d{4})", texto)
    if anio and int(anio["anio"]) != 0:
        return _rango(int(anio["anio"]), 1, 1, 12, 31)
    return None


def _rango(anio: int, mes_inicio: int, dia_inicio: int, mes_fin: int, dia_fin: int) -> dict:
    return {
        "tipo": "rango_fechas",
        "desde": f"{anio:04d}-{mes_inicio:02d}-{dia_inicio:02d}",
        "hasta": f"{anio:04d}-{mes_fin:02d}-{dia_fin:02d}",
    }


def _sin_soporte(estado: str, motivo: str) -> dict:
    return {
        "estado": estado,
        "intencion": None,
        "metrica": None,
        "dimensiones": [],
        "periodo": {"tipo": "no_especificado"},
        "filtros": {},
        "operacion": None,
        "limite": None,
        "aclaraciones_usuario": [],
        "pendientes_equipo": [],
        "listo_para_consulta": False,
        "motivo": motivo,
    }


def interpretar(pregunta: str) -> dict:
    """Reconoce únicamente las siete familias previstas, sin crear ni ejecutar SQL."""
    if not isinstance(pregunta, str):
        raise TypeError("La pregunta debe ser una cadena de texto")
    texto = normalizar(pregunta)
    if OPERACIONES_NO_AUTORIZADAS.search(texto):
        return _sin_soporte("rechazada", "Solo se admiten consultas analíticas de lectura.")

    if texto == "cual fue el mejor canal":
        return {
            "estado": "requiere_aclaracion",
            "intencion": "analizar_ventas",
            "metrica": None,
            "dimensiones": [{"entidad": "canal", "nivel": "tipo_canal"}],
            "periodo": {"tipo": "no_especificado"},
            "filtros": {},
            "operacion": "ranking_descendente",
            "limite": 1,
            "aclaraciones_usuario": [
                "¿Con qué criterio desea definir 'mejor canal'?",
                "¿Qué período desea analizar?",
            ],
            "pendientes_equipo": [],
            "listo_para_consulta": False,
        }

    for patron, intencion, metrica, dimensiones, operacion, limite, bloqueos in ESPECIFICACIONES:
        encontrado = re.match(rf"^(?:{patron})(?=$| )", texto)
        if not encontrado:
            continue

        resto = texto[encontrado.end():].strip()
        if resto and not re.match(
            r"^(?:en|durante) (?:el |los )?(?:mes de |ano |ultimos |"
            r"primer |segundo |tercer |cuarto |\d{4}|"
            r"enero|febrero|marzo|abril|mayo|junio|julio|agosto|"
            r"septiembre|setiembre|octubre|noviembre|diciembre)",
            resto,
        ):
            return _sin_soporte("fuera_de_alcance", "La pregunta contiene filtros o dimensiones no admitidos.")
        if resto and re.search(r"\b(?:en la|en el canal|por)\b", resto):
            return _sin_soporte("fuera_de_alcance", "La pregunta contiene filtros o dimensiones no admitidos.")

        if "limite" in encontrado.groupdict():
            palabra = encontrado["limite"]
            limite = int(palabra) if palabra.isdigit() else NUMEROS.get(palabra)
            if limite is None or not 1 <= limite <= 20:
                return _sin_soporte("fuera_de_alcance", "El límite admitido es de 1 a 20 resultados.")

        categoria = encontrado.groupdict().get("categoria")
        filtros = {"canales": []} if metrica == "margen_bruto" and operacion == "comparacion_de_series_temporales" else {}
        if "canales" in filtros and encontrado.groupdict().get("canal1"):
            filtros["canales"] = [
                CANALES[encontrado["canal1"]], CANALES[encontrado["canal2"]]
            ]
            if filtros["canales"][0] == filtros["canales"][1]:
                filtros["canales"] = []
        if metrica == "ventas_producto":
            filtros["categoria"] = categoria

        aclaraciones = []
        if operacion == "comparar_periodos_y_ordenar_caida":
            periodo = _comparacion_periodos(resto) if resto else None
            if periodo is None:
                periodo = {
                "tipo": "comparacion_periodos",
                "periodos": [
                    {"rol": "anterior", "tipo": "no_especificado"},
                    {"rol": "actual", "tipo": "no_especificado"},
                ],
                }
                aclaraciones.append("¿Qué dos períodos desea comparar?")
        else:
            periodo = _periodo(resto)
            if periodo is None:
                periodo = {"tipo": "no_especificado"}
                aclaraciones.append("¿Qué período desea analizar?")

        if "canales" in filtros and len(filtros["canales"]) != 2:
            aclaraciones.append("¿Cuáles dos canales desea comparar?")
        if "categoria" in filtros and filtros["categoria"] is None:
            aclaraciones.append("¿Qué categoría desea analizar?")

        return {
            "estado": "requiere_aclaracion" if aclaraciones else "interpretada",
            "intencion": intencion,
            "metrica": metrica,
            "dimensiones": [
                {"entidad": entidad, "nivel": nivel} for entidad, nivel in dimensiones
            ],
            "periodo": periodo,
            "filtros": filtros,
            "operacion": operacion,
            "limite": limite,
            "aclaraciones_usuario": aclaraciones,
            "pendientes_equipo": list(bloqueos),
            "listo_para_consulta": False,
        }

    return _sin_soporte("fuera_de_alcance", "No se reconoce una consulta analítica admitida.")


def _periodo_de_respuesta(respuesta: str) -> dict | None:
    if respuesta.startswith(("en ", "durante ")):
        texto = respuesta
    elif respuesta.startswith("los ultimos "):
        texto = "durante " + respuesta
    else:
        texto = "en " + respuesta
    return _periodo(texto)


def _comparacion_periodos(texto: str) -> dict | None:
    partes = re.fullmatch(r"(.+?) y (.+)", texto)
    if not partes:
        return None
    anterior = _periodo_de_respuesta(partes[1])
    actual = _periodo_de_respuesta(partes[2])
    if (not anterior or not actual or anterior["tipo"] != "rango_fechas"
            or actual["tipo"] != "rango_fechas" or anterior["hasta"] >= actual["desde"]):
        return None
    return {
        "tipo": "comparacion_periodos",
        "periodos": [{"rol": "anterior", **anterior}, {"rol": "actual", **actual}],
    }


def continuar_aclaracion(solicitud: dict, respuesta: str) -> dict:
    """Resuelve la primera aclaración pendiente y devuelve una nueva solicitud.

    Cada llamada procesa una sola respuesta. El llamador conserva el resultado
    para la siguiente vuelta; aquí no se persisten sesiones ni se autoriza SQL.
    """
    if not isinstance(solicitud, dict) or solicitud.get("estado") != "requiere_aclaracion":
        raise ValueError("La solicitud no tiene una aclaración pendiente")
    if not isinstance(respuesta, str):
        raise TypeError("La respuesta debe ser una cadena de texto")
    preguntas = solicitud.get("aclaraciones_usuario")
    if not isinstance(preguntas, list) or not preguntas:
        raise ValueError("La solicitud no tiene una aclaración pendiente")

    nueva = deepcopy(solicitud)
    nueva.pop("motivo", None)
    pregunta = preguntas[0]
    texto = normalizar(respuesta)
    if not texto or OPERACIONES_NO_AUTORIZADAS.search(texto):
        nueva["motivo"] = "La respuesta no aclara lo solicitado."
        return nueva

    if pregunta == "¿Qué período desea analizar?":
        periodo = _periodo_de_respuesta(texto)
        if periodo is None:
            nueva["motivo"] = "Indique un período inequívoco, por ejemplo: octubre de 2025."
            return nueva
        nueva["periodo"] = periodo

    elif pregunta == "¿Qué dos períodos desea comparar?":
        periodo = _comparacion_periodos(texto)
        if periodo is None:
            nueva["motivo"] = "Indique dos períodos distintos, sin solapamiento, en orden anterior y actual."
            return nueva
        nueva["periodo"] = periodo

    elif pregunta == "¿Cuáles dos canales desea comparar?":
        partes = re.fullmatch(
            r"(tienda fisica|e-commerce|fisico) y "
            r"(tienda fisica|e-commerce|fisico)", texto
        )
        if not partes or CANALES[partes[1]] == CANALES[partes[2]]:
            nueva["motivo"] = "Indique dos canales distintos: Tienda Física o E-commerce."
            return nueva
        nueva["filtros"]["canales"] = [CANALES[partes[1]], CANALES[partes[2]]]

    elif pregunta == "¿Qué categoría desea analizar?":
        if not re.fullmatch(r"[a-z]+(?:[ -][a-z]+){0,4}", texto):
            nueva["motivo"] = "Indique el nombre de una categoría, sin instrucciones adicionales."
            return nueva
        nueva["filtros"]["categoria"] = texto

    elif pregunta == "¿Con qué criterio desea definir 'mejor canal'?":
        criterio = CRITERIOS_CANAL.get(texto)
        if criterio is None:
            nueva["motivo"] = "Elija ingreso neto, margen bruto, cantidad vendida o ticket promedio."
            return nueva
        nueva["metrica"] = criterio[0]
        nueva["pendientes_equipo"] = list(criterio[1])

    else:
        raise ValueError("Aclaración no reconocida")

    nueva["aclaraciones_usuario"] = preguntas[1:]
    nueva["estado"] = (
        "requiere_aclaracion" if nueva["aclaraciones_usuario"]
        else "pendiente_definicion_equipo" if nueva["pendientes_equipo"]
        else "interpretada"
    )
    # La autorización final corresponde al catálogo, no al texto interpretado.
    nueva["listo_para_consulta"] = False
    return nueva


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit('Uso: python interprete.py "¿Pregunta sobre ventas?"')
    print(json.dumps(interpretar(" ".join(sys.argv[1:])), ensure_ascii=False, indent=2))
