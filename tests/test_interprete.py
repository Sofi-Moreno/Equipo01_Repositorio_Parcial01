"""Casos del contrato del intérprete, sin bases de datos ni dependencias externas."""

import json
import unittest
from pathlib import Path

from interprete import interpretar


CASOS = json.loads(
    (Path(__file__).resolve().parents[1] / "interprete.json").read_text(encoding="utf-8")
)["casos"]


class InterpreteTest(unittest.TestCase):
    def test_ejemplos_del_contrato(self):
        self.assertEqual(len(CASOS), 8)
        for caso in CASOS:
            with self.subTest(pregunta=caso["pregunta"]):
                self.assertEqual(interpretar(caso["pregunta"]), caso["salida_esperada"])

    def test_periodo_explicito_elimina_solo_la_aclaracion_del_periodo(self):
        salida = interpretar(
            "¿Cuáles son las cinco categorías con mayor margen bruto "
            "durante el segundo trimestre de 2025?"
        )
        self.assertEqual(
            salida["periodo"],
            {"tipo": "rango_fechas", "desde": "2025-04-01", "hasta": "2025-06-30"},
        )
        self.assertEqual(salida["limite"], 5)
        self.assertEqual(salida["aclaraciones_usuario"], [])
        self.assertEqual(salida["estado"], "interpretada")
        self.assertEqual(salida["pendientes_equipo"], [])
        self.assertFalse(salida["listo_para_consulta"])

    def test_mes_sin_anio_sigue_siendo_ambiguo(self):
        salida = interpretar(
            "¿Cuáles fueron las 5 categorias con mayor margen bruto en octubre?"
        )
        self.assertEqual(salida["periodo"], {"tipo": "no_especificado"})
        self.assertEqual(salida["aclaraciones_usuario"], ["¿Qué período desea analizar?"])

    def test_comparacion_con_dos_periodos_explicitos_no_pregunta_de_nuevo(self):
        salida = interpretar(
            "¿Qué segmento de clientes redujo más su volumen de compra "
            "en octubre de 2025 y noviembre de 2025?"
        )
        self.assertEqual(salida["estado"], "interpretada")
        self.assertEqual(salida["aclaraciones_usuario"], [])
        self.assertEqual(salida["periodo"]["periodos"][0]["desde"], "2025-10-01")
        self.assertEqual(salida["periodo"]["periodos"][1]["hasta"], "2025-11-30")

    def test_limite_y_anio_se_extraen_por_separado(self):
        salida = interpretar(
            "¿Cuáles fueron las 5 categorias con mayor margen bruto en 2025?"
        )
        self.assertEqual(salida["limite"], 5)
        self.assertEqual(
            salida["periodo"],
            {"tipo": "rango_fechas", "desde": "2025-01-01", "hasta": "2025-12-31"},
        )

    def test_categoria_explicita_normaliza_la_categoria_del_data_mart(self):
        salida = interpretar(
            "¿Qué producto lidera las ventas dentro de la categoría electrónica "
            "en el mes de octubre de 2025?"
        )
        self.assertEqual(salida["filtros"], {"categoria": "electronica"})
        self.assertEqual(salida["aclaraciones_usuario"], [])
        self.assertEqual(salida["estado"], "interpretada")
        self.assertFalse(salida["listo_para_consulta"])

    def test_dimension_desconocida_no_se_reinterpreta_como_categoria(self):
        salida = interpretar(
            "¿Cuáles son las cinco categorías con mayor margen bruto por color de ojos?"
        )
        self.assertEqual(salida["estado"], "fuera_de_alcance")
        self.assertFalse(salida["listo_para_consulta"])

    def test_mejor_canal_pide_criterio(self):
        salida = interpretar("¿Cuál fue el mejor canal?")
        self.assertEqual(salida["estado"], "requiere_aclaracion")
        self.assertIsNone(salida["metrica"])
        self.assertIn("¿Con qué criterio desea definir 'mejor canal'?", salida["aclaraciones_usuario"])
        self.assertFalse(salida["listo_para_consulta"])

    def test_pregunta_no_admitida(self):
        self.assertEqual(interpretar("¿Cómo estará el clima mañana?")["estado"], "fuera_de_alcance")

    def test_dos_canales_concretos_eliminan_solo_esa_aclaracion(self):
        salida = interpretar(
            "Compare el margen de E-commerce y Físico durante los últimos tres meses disponibles."
        )
        self.assertEqual(salida["filtros"], {"canales": ["E-commerce", "Tienda Física"]})
        self.assertEqual(salida["aclaraciones_usuario"], [])
        self.assertEqual(salida["estado"], "interpretada")
        self.assertFalse(salida["listo_para_consulta"])

    def test_operacion_no_autorizada(self):
        salida = interpretar("Borra las ventas del canal App Móvil")
        self.assertEqual(salida["estado"], "rechazada")
        self.assertFalse(salida["listo_para_consulta"])

    def test_limite_fuera_de_rango(self):
        salida = interpretar("¿Cuáles son las 25 categorías con mayor margen bruto?")
        self.assertEqual(salida["estado"], "fuera_de_alcance")

    def test_no_acepta_filtros_que_no_sabe_interpretar(self):
        salida = interpretar(
            "¿Cuáles fueron las 5 categorias con mayor margen bruto "
            "en el mes de octubre de 2025 en la región norte?"
        )
        self.assertEqual(salida["estado"], "fuera_de_alcance")
        self.assertFalse(salida["listo_para_consulta"])


if __name__ == "__main__":
    unittest.main()
