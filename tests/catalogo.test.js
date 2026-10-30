'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { CATALOGO, seleccionarConsulta, validarConsulta, prepararConsulta, ejecutarConsulta } = require('../catalogo.js');

const raiz = path.resolve(__dirname, '..');
const casos = JSON.parse(readFileSync(path.join(raiz, 'interprete.json'), 'utf8')).casos;
const ids = [
  'ingreso_neto_mensual', 'ranking_margen_categorias', 'ranking_ticket_sucursales',
  'mayor_caida_segmento', 'ranking_valor_canales', 'comparacion_margen_canales',
  'lider_producto_categoria',
];
const copia = (valor) => structuredClone(valor);

test('catálogo cerrado con campos físicos de FactVentas y siete consultas', () => {
  assert.deepEqual(CATALOGO.map((entrada) => entrada.id), ids);
  for (const entrada of CATALOGO) {
    assert.ok(entrada.camposFactVentas.length > 0);
    assert.ok(entrada.reglaCalculo);
  }
});

test('el contrato refleja caída porcentual con empates y producto líder por unidades', () => {
  const caida = CATALOGO.find((entrada) => entrada.id === 'mayor_caida_segmento');
  const producto = CATALOGO.find((entrada) => entrada.id === 'lider_producto_categoria');
  assert.equal(caida.limite, 1); // Primer puesto, no una sola fila.
  assert.deepEqual(caida.columnasResultado,
    ['segmento', 'valor_anterior', 'valor_actual', 'caida_porcentual']);
  assert.match(caida.reglaCalculo, /todos los empates/);
  assert.deepEqual(producto.camposFactVentas, ['CantidadVendida']);
  assert.equal(producto.reglaCalculo, 'SUM(CantidadVendida)');
  assert.deepEqual(producto.columnasResultado, ['producto', 'unidades_vendidas']);
});

test('selecciona el ID esperado para las siete familias y el ejemplo de octubre', () => {
  casos.forEach((caso, indice) => {
    const id = ids[indice === 7 ? 1 : indice];
    assert.equal(seleccionarConsulta(caso.salida_esperada), id);
    const validacion = validarConsulta(caso.salida_esperada);
    assert.equal(validacion.consulta_id, id);
    assert.equal(validacion.listo_para_consulta, indice === 7);
    assert.deepEqual(validacion.pendientes_equipo, []);
    assert.equal(validacion.estado, indice === 7 ? 'lista_para_consulta' : 'requiere_aclaracion');
  });
});

test('valida los parámetros completos de las siete consultas antes de preparar SQL', () => {
  const rango = { tipo: 'rango_fechas', desde: '2025-10-01', hasta: '2025-10-31' };
  casos.slice(0, 7).forEach((caso, indice) => {
    const solicitud = copia(caso.salida_esperada);
    solicitud.aclaraciones_usuario = [];
    solicitud.estado = 'interpretada';
    if (indice === 3) {
      solicitud.periodo.periodos = [
        { rol: 'anterior', tipo: 'rango_fechas', desde: '2025-09-01', hasta: '2025-09-30' },
        { rol: 'actual', ...rango },
      ];
    } else if (indice !== 5) {
      solicitud.periodo = copia(rango);
    }
    if (indice === 5) solicitud.filtros.canales = ['E-commerce', 'Tienda Física'];
    if (indice === 6) solicitud.filtros.categoria = 'electronica';
    const validacion = validarConsulta(solicitud);
    assert.equal(validacion.consulta_id, ids[indice]);
    assert.equal(validacion.valida_estructuralmente, true, caso.pregunta);
    assert.equal(validacion.estado, 'lista_para_consulta');
    assert.equal(validacion.listo_para_consulta, true);
  });
});

test('el JSON emitido realmente por Python coincide con el contrato JavaScript', () => {
  const salida = JSON.parse(execFileSync('python', [
    '-B', 'interprete.py',
    '¿Cuáles fueron las 5 categorias con mayor margen bruto en el mes de octubre de 2025?',
  ], { cwd: raiz, encoding: 'utf8' }));
  assert.equal(validarConsulta(salida).consulta_id, 'ranking_margen_categorias');
  assert.equal(validarConsulta(salida).valida_estructuralmente, true);
  assert.equal(validarConsulta(salida).estado, 'lista_para_consulta');
});

test('valida dos períodos ordenados, sin aceptar rangos invertidos ni fechas imposibles', () => {
  const solicitud = copia(casos[3].salida_esperada);
  solicitud.periodo.periodos = [
    { rol: 'anterior', tipo: 'rango_fechas', desde: '2025-10-01', hasta: '2025-10-31' },
    { rol: 'actual', tipo: 'rango_fechas', desde: '2025-11-01', hasta: '2025-11-30' },
  ];
  solicitud.aclaraciones_usuario = [];
  solicitud.estado = 'interpretada';
  assert.equal(validarConsulta(solicitud).valida_estructuralmente, true);

  solicitud.periodo.periodos[1].desde = '2025-10-15';
  assert.equal(validarConsulta(solicitud).estado, 'invalida');
  solicitud.periodo.periodos[1].desde = '2025-02-30';
  assert.equal(validarConsulta(solicitud).estado, 'invalida');
});

test('valida cantidad y pertenencia de los dos canales', () => {
  const solicitud = copia(casos[5].salida_esperada);
  solicitud.filtros.canales = ['E-commerce', 'Tienda Física'];
  solicitud.aclaraciones_usuario = [];
  solicitud.estado = 'interpretada';
  assert.equal(validarConsulta(solicitud).valida_estructuralmente, true);
  solicitud.filtros.canales = ['Tienda Física', 'Tienda Física'];
  assert.equal(validarConsulta(solicitud).estado, 'invalida');
  solicitud.filtros.canales = ['Tienda Física', 'Otro'];
  assert.equal(validarConsulta(solicitud).estado, 'invalida');
});

test('no permite dimensiones, filtros, operaciones ni límites no catalogados', () => {
  const solicitud = copia(casos[7].salida_esperada);
  for (const cambio of [
    { dimensiones: [{ entidad: 'sucursal', nivel: 'sucursal' }] },
    { operacion: 'modificar_tabla' },
    { metrica: 'cantidad_vendida' },
  ]) {
    assert.equal(validarConsulta({ ...solicitud, ...cambio }).estado, 'no_admitida');
  }
  assert.equal(validarConsulta({ ...solicitud, limite: 2025 }).estado, 'invalida');
  assert.equal(validarConsulta({ ...solicitud, filtros: { canal: 'Físico' } }).estado, 'invalida');
  assert.equal(validarConsulta({ ...solicitud, periodo: { tipo: 'rango_fechas', desde: '2025-02-30', hasta: '2025-10-31' } }).estado, 'invalida');
});

test('los bloqueos declarados por un cliente no autorizan SQL distinto', () => {
  const solicitud = copia(casos[7].salida_esperada);
  solicitud.pendientes_equipo = [];
  solicitud.estado = 'interpretada';
  solicitud.listo_para_consulta = true;
  const validacion = validarConsulta(solicitud);
  assert.deepEqual(validacion.pendientes_equipo, []);
  assert.equal(validacion.estado, 'lista_para_consulta');
  assert.equal(validacion.listo_para_consulta, true);
  assert.equal(prepararConsulta(solicitud).consulta_id, 'ranking_margen_categorias');
});

test('solo prepara SQL fijo con parámetros derivados del período y los filtros', () => {
  const casosCompletos = casos.slice(0, 7).map((caso, indice) => {
    const solicitud = copia(caso.salida_esperada);
    solicitud.aclaraciones_usuario = [];
    solicitud.estado = 'interpretada';
    solicitud.periodo = { tipo: 'rango_fechas', desde: '2025-10-01', hasta: '2025-10-31' };
    if (indice === 3) solicitud.periodo = { tipo: 'comparacion_periodos', periodos: [
      { rol: 'anterior', tipo: 'rango_fechas', desde: '2025-10-01', hasta: '2025-10-31' },
      { rol: 'actual', tipo: 'rango_fechas', desde: '2025-11-01', hasta: '2025-11-30' },
    ] };
    if (indice === 5) {
      solicitud.periodo = { tipo: 'ultimos_meses_disponibles', cantidad: 3 };
      solicitud.filtros.canales = ['Tienda Física', 'E-commerce'];
    }
    if (indice === 6) solicitud.filtros.categoria = 'electronica';
    return solicitud;
  });
  const esperados = [
    ['2025-10-01', '2025-10-31'], ['2025-10-01', '2025-10-31', 5],
    ['2025-10-01', '2025-10-31'],
    ['2025-10-01', '2025-10-31', '2025-11-01', '2025-11-30'],
    ['2025-10-01', '2025-10-31'], ['Tienda Física', 'E-commerce'],
    ['2025-10-01', '2025-10-31', 'electronica'],
  ];
  casosCompletos.forEach((solicitud, indice) => {
    const preparada = prepararConsulta(solicitud);
    assert.equal(preparada.consulta_id, ids[indice]);
    assert.deepEqual(preparada.parametros, esperados[indice]);
    assert.match(preparada.sql, /^(SELECT|WITH) /);
    assert.equal(preparada.sql.split(';').length, 2);
    assert.equal(preparada.sql.includes('2025-10-01'), false);
  });
  assert.equal(prepararConsulta(casos[0].salida_esperada).sql, null);
});

test('las plantillas fijas conservan el porcentaje, empates y unidades', () => {
  const solicitudCaida = copia(casos[3].salida_esperada);
  solicitudCaida.estado = 'interpretada';
  solicitudCaida.aclaraciones_usuario = [];
  solicitudCaida.periodo.periodos = [
    { rol: 'anterior', tipo: 'rango_fechas', desde: '2025-10-01', hasta: '2025-10-31' },
    { rol: 'actual', tipo: 'rango_fechas', desde: '2025-11-01', hasta: '2025-11-30' },
  ];
  const preparadaCaida = prepararConsulta(solicitudCaida);
  assert.match(preparadaCaida.sql, /100\.0 \* \(a\.unidades - b\.unidades\) \/ NULLIF\(a\.unidades, 0\)/);
  assert.match(preparadaCaida.sql, /DENSE_RANK\(\) OVER \(ORDER BY caida_porcentual DESC\)/);
  assert.match(preparadaCaida.sql, /WHERE posicion = 1/);
  assert.doesNotMatch(preparadaCaida.sql, /LIMIT 1/);

  const solicitudProducto = copia(casos[6].salida_esperada);
  solicitudProducto.estado = 'interpretada';
  solicitudProducto.aclaraciones_usuario = [];
  solicitudProducto.periodo = { tipo: 'rango_fechas', desde: '2025-10-01', hasta: '2025-10-31' };
  solicitudProducto.filtros.categoria = 'electronica';
  const preparadaProducto = prepararConsulta(solicitudProducto);
  assert.match(preparadaProducto.sql, /SUM\(f\.CantidadVendida\) AS unidades_vendidas/);
  assert.doesNotMatch(preparadaProducto.sql, /MontoVenta|MontoDescuento/);
  assert.deepEqual(preparadaProducto.parametros, ['2025-10-01', '2025-10-31', 'electronica']);
});

test('ejecución inyectada conserva vacío y rechaza solicitudes sin aclarar', async () => {
  const consulta = casos[7].salida_esperada;
  let visto;
  const cliente = { query: async (sql, parametros) => {
    visto = { sql, parametros };
    return { rows: [] };
  } };
  const resultado = await ejecutarConsulta(consulta, cliente);
  assert.equal(resultado.sin_registros, true);
  assert.deepEqual(resultado.filas, []);
  assert.deepEqual(visto.parametros, ['2025-10-01', '2025-10-31', 5]);
  await assert.rejects(ejecutarConsulta(casos[0].salida_esperada, cliente), /no habilitada/);
});

test('rechaza preguntas fuera de alcance y estructuras no reconocidas', () => {
  assert.equal(validarConsulta(null).estado, 'no_admitida');
  assert.equal(validarConsulta({ estado: 'rechazada' }).estado, 'no_admitida');
  const solicitud = copia(casos[7].salida_esperada);
  solicitud.dimensiones[0].campo_desconocido = 'extra';
  assert.equal(validarConsulta(solicitud).estado, 'no_admitida');
});

test('un estado de aclaración contradictorio nunca puede ejecutar SQL', () => {
  const solicitud = copia(casos[7].salida_esperada);
  solicitud.estado = 'requiere_aclaracion';
  assert.equal(prepararConsulta(solicitud).sql, null);
});
