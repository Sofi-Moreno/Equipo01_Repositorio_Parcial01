'use strict';

const { CATALOGO } = require('./catalogo.js');
const { fuentesDe } = require('./fuentes.js');

const entradas = new Map(CATALOGO.map((entrada) => [entrada.id, entrada]));

const ADVERTENCIA_SCD2 = 'Advertencia: los segmentos son históricos (SCD2); una caída puede reflejar migración de clientes entre segmentos y no necesariamente menor compra de los mismos clientes.';

function evidenciaDe(entrada, resultado) {
  const filtros = [];
  if (resultado.filtros?.categoria) filtros.push(`categoría: ${resultado.filtros.categoria}`);
  if (resultado.filtros?.canales) filtros.push(`canales: ${resultado.filtros.canales.join(' y ')}`);
  return `Consulta autorizada: ${entrada.id}. Regla de cálculo: ${entrada.reglaCalculo}. Fuentes: ${fuentesDe(entrada)
    .map(([tabla, atributo]) => `${tabla}.${atributo}`).join(', ')}.${filtros.length ? ` Filtros: ${filtros.join('; ')}.` : ''}`;
}

function periodoDe({ periodo, filas }) {
  if (periodo?.tipo === 'rango_fechas') {
    return `Período: ${periodo.desde} a ${periodo.hasta}.`;
  }
  if (periodo?.tipo === 'comparacion_periodos') {
    const [anterior, actual] = periodo.periodos;
    return `Períodos: ${anterior.desde} a ${anterior.hasta} frente a ${actual.desde} a ${actual.hasta}.`;
  }
  if (periodo?.tipo === 'ultimos_meses_disponibles') {
    const meses = [...new Set(filas.map(({ mes }) => mes))].sort();
    return `Período solicitado: últimos tres meses con ventas.${meses.length
      ? ` Meses con resultados: ${meses.join(', ')}.` : ''}`;
  }
  throw new Error('El período del resultado no es válido.');
}

function numero(valor) {
  const texto = String(valor);
  if (!/^-?\d+(?:\.\d+)?$/.test(texto)) throw new Error('El Data Mart devolvió un valor numérico inválido.');
  return texto;
}

function unidades(valor) {
  return numero(valor).replace(/\.0+$/, '');
}

function importe(valor) {
  const texto = numero(valor);
  if (!texto.includes('.')) return `${texto}.00`;
  const [entero, decimales] = texto.split('.');
  const significativos = decimales.replace(/0+$/, '');
  return significativos.length <= 2
    ? `${entero}.${significativos.padEnd(2, '0')}` : texto;
}

function porcentaje(valor) {
  const valorNumerico = Number(numero(valor));
  if (!Number.isFinite(valorNumerico)) throw new Error('El porcentaje devuelto no es válido.');
  return `${new Intl.NumberFormat('es', { maximumFractionDigits: 2 }).format(valorNumerico)} %`;
}

function redactarRespuesta(resultado) {
  const entrada = entradas.get(resultado?.consulta_id);
  if (!entrada || !Array.isArray(resultado.filas)
      || resultado.sin_registros !== (resultado.filas.length === 0)) {
    throw new Error('El resultado no corresponde a una consulta válida.');
  }
  for (const fila of resultado.filas) {
    if (fila === null || typeof fila !== 'object'
        || entrada.columnasResultado.some((columna) => fila[columna] === null || fila[columna] === undefined)) {
      throw new Error('El resultado no contiene las columnas esperadas.');
    }
  }

  const contexto = periodoDe(resultado);
  const evidencia = evidenciaDe(entrada, resultado);
  const advertencia = entrada.id === 'mayor_caida_segmento' ? ` ${ADVERTENCIA_SCD2}` : '';
  if (resultado.sin_registros) {
    const detalle = resultado.consulta_id === 'mayor_caida_segmento'
      ? 'No se encontraron segmentos con una caída comparable; esto no implica ventas iguales a cero.'
      : 'No se encontraron registros para los criterios consultados; esto no implica un valor igual a cero.';
    return `${contexto} ${detalle} ${evidencia}${advertencia}`;
  }

  const filas = resultado.filas;
  let resumen;
  switch (resultado.consulta_id) {
    case 'ingreso_neto_mensual':
      resumen = `Ingreso neto por mes: ${filas.map((f) => `${f.mes}: ${importe(f.ingreso_neto)}`).join('; ')}.`;
      break;
    case 'ranking_margen_categorias':
      resumen = `Margen bruto por categoría: ${filas.map((f) => `${f.categoria}: ${importe(f.margen_bruto)}`).join('; ')}.`;
      break;
    case 'ranking_ticket_sucursales':
      resumen = `Sucursal con mayor ticket promedio: ${filas[0].sucursal} (${importe(filas[0].ticket_promedio)}).`;
      break;
    case 'mayor_caida_segmento':
      resumen = `${filas.length > 1 ? 'Empate en la mayor caída' : 'Mayor caída'} del volumen en unidades: ${filas.map((f) => `${f.segmento}: ${unidades(f.valor_anterior)} a ${unidades(f.valor_actual)} unidades (${porcentaje(f.caida_porcentual)})`).join('; ')}.`;
      break;
    case 'ranking_valor_canales':
      resumen = `Canal con mayor ingreso neto: ${filas[0].canal} (${importe(filas[0].valor_ventas)}).`;
      break;
    case 'comparacion_margen_canales':
      resumen = `Margen bruto por mes y canal: ${filas.map((f) => `${f.mes}, ${f.canal}: ${importe(f.margen)}`).join('; ')}.`;
      break;
    case 'lider_producto_categoria':
      if (typeof resultado.filtros?.categoria !== 'string') {
        throw new Error('Falta la categoría consultada.');
      }
      resumen = `Producto líder por unidades vendidas en la categoría «${resultado.filtros.categoria}»: ${filas[0].producto} (${unidades(filas[0].unidades_vendidas)} unidades).`;
      break;
    default:
      throw new Error('No existe una respuesta para esta consulta.');
  }
  return `${contexto} ${resumen} ${evidencia}${advertencia}`;
}

module.exports = { redactarRespuesta };
