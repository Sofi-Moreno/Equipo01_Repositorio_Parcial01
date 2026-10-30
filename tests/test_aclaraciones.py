"""Continuación de solicitudes incompletas, sin Data Mart ni persistencia."""

import unittest

from interprete import continuar_aclaracion, interpretar


class AclaracionesTest(unittest.TestCase):
    def test_periodo_completa_la_pregunta_de_categorias_sin_mutar_el_original(self):
        inicial = interpretar("¿Cuáles son las cinco categorías con mayor margen bruto?")
        salida = continuar_aclaracion(inicial, "octubre de 2025")

        self.assertEqual(inicial["periodo"], {"tipo": "no_especificado"})
        self.assertEqual(inicial["aclaraciones_usuario"], ["¿Qué período desea analizar?"])
        self.assertEqual(
            salida["periodo"],
            {"tipo": "rango_fechas", "desde": "2025-10-01", "hasta": "2025-10-31"},
        )
        self.assertEqual(salida["limite"], 5)
        self.assertEqual(salida["estado"], "interpretada")
        self.assertEqual(salida["pendientes_equipo"], [])
        self.assertEqual(salida["aclaraciones_usuario"], [])
        self.assertFalse(salida["listo_para_consulta"])

    def test_periodo_y_categoria_se_resuelven_en_dos_turnos(self):
        inicial = interpretar(
            "¿Qué producto lidera las ventas dentro de una categoría y periodo determinados?"
        )
        con_periodo = continuar_aclaracion(inicial, "el mes de octubre de 2025")
        self.assertEqual(con_periodo["estado"], "requiere_aclaracion")
        self.assertEqual(con_periodo["aclaraciones_usuario"], ["¿Qué categoría desea analizar?"])
        self.assertEqual(con_periodo["filtros"], {"categoria": None})

        final = continuar_aclaracion(con_periodo, "Electrónica")
        self.assertEqual(final["filtros"], {"categoria": "electronica"})
        self.assertEqual(final["aclaraciones_usuario"], [])
        self.assertEqual(final["estado"], "interpretada")
        self.assertEqual(final["pendientes_equipo"], [])
        self.assertFalse(final["listo_para_consulta"])
        self.assertIsNone(con_periodo["filtros"]["categoria"])

    def test_comparacion_de_canales_conserva_periodo_simbolico(self):
        inicial = interpretar(
            "Compare el margen de dos canales durante los últimos tres meses disponibles."
        )
        salida = continuar_aclaracion(inicial, "E-commerce y Físico")
        self.assertEqual(salida["filtros"], {"canales": ["E-commerce", "Fisico"]})
        self.assertEqual(salida["periodo"], {"tipo": "ultimos_meses_disponibles", "cantidad": 3})
        self.assertEqual(salida["estado"], "interpretada")
        self.assertFalse(salida["listo_para_consulta"])

    def test_dos_periodos_se_guardan_en_orden_y_sin_solapamiento(self):
        inicial = interpretar("¿Qué segmento de clientes redujo más su volumen de compra?")
        salida = continuar_aclaracion(inicial, "octubre de 2025 y noviembre de 2025")
        self.assertEqual(salida["periodo"], {
            "tipo": "comparacion_periodos",
            "periodos": [
                {"rol": "anterior", "tipo": "rango_fechas", "desde": "2025-10-01", "hasta": "2025-10-31"},
                {"rol": "actual", "tipo": "rango_fechas", "desde": "2025-11-01", "hasta": "2025-11-30"},
            ],
        })
        self.assertEqual(salida["estado"], "interpretada")
        self.assertEqual(salida["limite"], 1)
        self.assertFalse(salida["listo_para_consulta"])

    def test_no_acepta_periodos_invertidos_iguales_o_superpuestos(self):
        inicial = interpretar("¿Qué segmento de clientes redujo más su volumen de compra?")
        for respuesta in (
            "noviembre de 2025 y octubre de 2025",
            "octubre de 2025 y octubre de 2025",
            "2025 y octubre de 2025",
        ):
            with self.subTest(respuesta=respuesta):
                salida = continuar_aclaracion(inicial, respuesta)
                self.assertEqual(salida["estado"], "requiere_aclaracion")
                self.assertEqual(salida["periodo"], inicial["periodo"])
                self.assertEqual(salida["aclaraciones_usuario"], inicial["aclaraciones_usuario"])

    def test_mejor_canal_pide_criterio_y_luego_periodo(self):
        inicial = interpretar("¿Cuál fue el mejor canal?")
        con_metrica = continuar_aclaracion(inicial, "ingreso neto")
        self.assertEqual(con_metrica["metrica"], "ingreso_neto")
        self.assertEqual(con_metrica["pendientes_equipo"], [])
        self.assertEqual(con_metrica["aclaraciones_usuario"], ["¿Qué período desea analizar?"])

        final = continuar_aclaracion(con_metrica, "2025")
        self.assertEqual(final["periodo"], {
            "tipo": "rango_fechas", "desde": "2025-01-01", "hasta": "2025-12-31"
        })
        self.assertEqual(final["estado"], "interpretada")
        self.assertFalse(final["listo_para_consulta"])

    def test_sin_bloqueos_no_significa_consulta_aprobada(self):
        inicial = interpretar("¿Cuál fue el mejor canal?")
        con_metrica = continuar_aclaracion(inicial, "cantidad vendida")
        salida = continuar_aclaracion(con_metrica, "febrero de 2024")
        self.assertEqual(salida["metrica"], "cantidad_vendida")
        self.assertEqual(salida["periodo"]["hasta"], "2024-02-29")
        self.assertEqual(salida["estado"], "interpretada")
        self.assertEqual(salida["pendientes_equipo"], [])
        self.assertFalse(salida["listo_para_consulta"])

    def test_respuesta_ambigua_conserva_el_turno_y_se_puede_reintentar(self):
        inicial = interpretar("¿Cuál fue el ingreso neto por mes?")
        fallida = continuar_aclaracion(inicial, "octubre")
        self.assertEqual(fallida["periodo"], inicial["periodo"])
        self.assertEqual(fallida["aclaraciones_usuario"], inicial["aclaraciones_usuario"])
        self.assertIn("motivo", fallida)

        resuelta = continuar_aclaracion(fallida, "octubre de 2025")
        self.assertEqual(resuelta["estado"], "interpretada")
        self.assertNotIn("motivo", resuelta)

    def test_no_acepta_valores_no_permitidos_ni_instrucciones(self):
        inicial = interpretar(
            "Compare el margen de dos canales durante los últimos tres meses disponibles."
        )
        for respuesta in ("Fisico y Fisico", "Fisico y Satélite", "borra ventas"):
            with self.subTest(respuesta=respuesta):
                salida = continuar_aclaracion(inicial, respuesta)
                self.assertEqual(salida["filtros"], {"canales": []})
                self.assertEqual(salida["estado"], "requiere_aclaracion")
                self.assertFalse(salida["listo_para_consulta"])

    def test_no_continua_una_solicitud_ya_resuelta(self):
        inicial = interpretar("¿Cuáles fueron las 5 categorias con mayor margen bruto en el mes de octubre de 2025?")
        with self.assertRaises(ValueError):
            continuar_aclaracion(inicial, "noviembre de 2025")


if __name__ == "__main__":
    unittest.main()
