"""Puente JSON por stdin/stdout para usar el intérprete Python desde Node."""

import json
import sys

from interprete import continuar_aclaracion, interpretar


def main():
    entrada = json.load(sys.stdin)
    if entrada.get("accion") == "interpretar":
        salida = interpretar(entrada["pregunta"])
    elif entrada.get("accion") == "aclarar":
        salida = continuar_aclaracion(entrada["solicitud"], entrada["respuesta"])
    else:
        raise ValueError("Acción desconocida")
    json.dump(salida, sys.stdout)


if __name__ == "__main__":
    main()
