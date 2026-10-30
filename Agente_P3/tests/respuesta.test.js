'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { redactarRespuesta } = require('../respuesta.js');
const { iniciarPregunta, continuarPregunta, consultarYResponder } = require('../flujo.js');

const octubre = { tipo: 'rango_fechas', desde: '2025-10-01', hasta: '2025-10-31' };
const resultado = (consulta_id, filas, periodo = octubre, filtros = {}) => ({
  consulta_id, filas, periodo, filtros, sin_registros: filas.length === 0,
});

test('las siete respuestas usan únicamente las filas y el período del resultado', () => {
  const casos = [
    [resultado('ingreso_neto_mensual', [
      { mes: '2025-10', ingreso_neto: '5580.00' },
      { mes: '2025-11', ingreso_neto: '1700.00' },
    ]), /Ingreso neto por mes: 2025-10: 5580\.00; 2025-11: 1700\.00/],
    [resultado('ranking_margen_categorias', [
      { categoria: 'Electrónica', margen_bruto: '1100.00' },
      { categoria: 'Hogar', margen_bruto: '900.00' },
    ]), /Margen bruto por categoría: Electrónica: 1100\.00; Hogar: 900\.00/],
    [resultado('ranking_ticket_sucursales', [
      { sucursal: 'Sucursal Caracas Principal', ticket_promedio: '1700.0000000000000000' },
    ]), /Sucursal con mayor ticket promedio: Sucursal Caracas Principal \(1700\.00\)/],
    [resultado('ranking_valor_canales', [
      { canal: 'Tienda Física', valor_ventas: '3400.00' },
    ]), /Canal con mayor ingreso neto: Tienda Física \(3400\.00\)/],
    [resultado('lider_producto_categoria', [
      { producto: 'Laptop Pro 15', unidades_vendidas: '2.00' },
    ], octubre, { categoria: 'electronica' }), /Producto líder por unidades vendidas en la categoría «electronica»: Laptop Pro 15 \(2 unidades\)/],
  ];
  for (const [datos, esperado] of casos) {
    const texto = redactarRespuesta(datos);
    assert.match(texto, /^Período: 2025-10-01 a 2025-10-31\./);
    assert.match(texto, esperado);
  }
});

test('la mayor caída preserva ambos períodos y todos los segmentos empatados', () => {
  const periodos = { tipo: 'comparacion_periodos', periodos: [
    { rol: 'anterior', ...octubre },
    { rol: 'actual', tipo: 'rango_fechas', desde: '2025-11-01', hasta: '2025-11-30' },
  ] };
  const texto = redactarRespuesta(resultado('mayor_caida_segmento', [
    { segmento: 'Regular', valor_anterior: '20.00', valor_actual: '10.00', caida_porcentual: '50.0000' },
    { segmento: 'VIP', valor_anterior: '8.00', valor_actual: '4.00', caida_porcentual: '50.0000' },
  ], periodos));
  assert.match(texto, /^Períodos: 2025-10-01 a 2025-10-31 frente a 2025-11-01 a 2025-11-30\./);
  assert.match(texto, /Empate en la mayor caída/);
  assert.match(texto, /Regular: 20 a 10 unidades \(50 %\); VIP: 8 a 4 unidades \(50 %\)/);
});

test('últimos meses muestran solo las combinaciones con ventas sin inventar ceros', () => {
  const texto = redactarRespuesta(resultado('comparacion_margen_canales', [
    { mes: '2026-08', canal: 'Tienda Física', margen: '300.00' },
    { mes: '2026-10', canal: 'E-commerce', margen: '440.00' },
  ], { tipo: 'ultimos_meses_disponibles', cantidad: 3 }, { canales: ['Tienda Física', 'E-commerce'] }));
  assert.match(texto, /Meses con resultados: 2026-08, 2026-10/);
  assert.match(texto, /2026-08, Tienda Física: 300\.00; 2026-10, E-commerce: 440\.00/);
  assert.doesNotMatch(texto, /2026-09|2026-08, E-commerce|2026-10, Tienda Física/);
});

test('sin filas comunica ausencia de registros, no ventas cero ni meses imaginados', () => {
  const vacio = redactarRespuesta(resultado('ranking_margen_categorias', [], octubre));
  assert.match(vacio, /No se encontraron registros/);
  assert.doesNotMatch(vacio, /margen bruto: 0/);
  const sinMeses = redactarRespuesta(resultado('comparacion_margen_canales', [],
    { tipo: 'ultimos_meses_disponibles', cantidad: 3 }));
  assert.doesNotMatch(sinMeses, /Meses con resultados:/);
  assert.match(redactarRespuesta(resultado('mayor_caida_segmento', [],
    { tipo: 'comparacion_periodos', periodos: [
      { rol: 'anterior', ...octubre },
      { rol: 'actual', tipo: 'rango_fechas', desde: '2025-11-01', hasta: '2025-11-30' },
    ] })), /No se encontraron segmentos con una caída comparable/);
});

test('no redacta consultas desconocidas, filas incompletas ni cifras inválidas', () => {
  assert.throws(() => redactarRespuesta(resultado('otra_consulta', [], octubre)), /no corresponde/);
  assert.throws(() => redactarRespuesta(resultado('ingreso_neto_mensual', [{ mes: '2025-10' }])),
    /columnas esperadas/);
  assert.throws(() => redactarRespuesta(resultado('ingreso_neto_mensual', [
    { mes: '2025-10', ingreso_neto: 'incorrecto' },
  ])), /valor numérico inválido/);
  assert.throws(() => redactarRespuesta(resultado('lider_producto_categoria', [
    { producto: 'Laptop Pro 15', unidades_vendidas: '2.00' },
  ])), /Falta la categoría/);
});

test('el recorrido pregunta → aclaración → respuesta rechaza consultas incompletas', async () => {
  const inicial = iniciarPregunta('¿Cuál fue el ingreso neto por mes?');
  let llamadas = 0;
  const cliente = { query: async (sql, parametros) => {
    llamadas += 1;
    assert.match(sql, /SUM\(f\.MontoVenta - f\.MontoDescuento\)/);
    assert.deepEqual(parametros, ['2025-10-01', '2025-10-31']);
    return { rows: [{ mes: '2025-10', ingreso_neto: '5580.00' }] };
  } };
  await assert.rejects(consultarYResponder(inicial, cliente), /no habilitada/);
  assert.equal(llamadas, 0);

  const aclarada = continuarPregunta(inicial, 'octubre de 2025');
  const salida = await consultarYResponder(aclarada, cliente);
  assert.equal(llamadas, 1);
  assert.deepEqual(salida.filas, [{ mes: '2025-10', ingreso_neto: '5580.00' }]);
  assert.equal(salida.respuesta_ejecutiva,
    'Período: 2025-10-01 a 2025-10-31. Ingreso neto por mes: 2025-10: 5580.00.');
});
