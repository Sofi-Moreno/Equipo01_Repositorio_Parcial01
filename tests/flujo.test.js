'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { iniciarPregunta, continuarPregunta, prepararConsulta, consultarSolicitud } = require('../flujo.js');

test('pregunta sin período no consulta; aclaración produce rango y SQL enlazado', async () => {
  const inicial = iniciarPregunta('¿Cuáles son las cinco categorías con mayor margen bruto?');
  assert.equal(inicial.estado, 'requiere_aclaracion');
  assert.equal(prepararConsulta(inicial).sql, null);
  let llamadas = 0;
  const cliente = { query: async (sql, parametros) => {
    llamadas += 1;
    assert.match(sql, /JOIN DimProducto p/);
    assert.deepEqual(parametros, ['2025-10-01', '2025-10-31', 5]);
    return { rows: [{ categoria: 'Electrónica', margen_bruto: '1000.00' }] };
  } };
  await assert.rejects(consultarSolicitud(inicial, cliente), /no habilitada/);
  assert.equal(llamadas, 0);
  const aclarada = continuarPregunta(inicial, 'octubre de 2025');
  assert.equal(aclarada.estado, 'interpretada');
  const resultado = await consultarSolicitud(aclarada, cliente);
  assert.equal(llamadas, 1);
  assert.equal(resultado.sin_registros, false);
  assert.equal(resultado.filas[0].categoria, 'Electrónica');
});

test('producto conserva aclaraciones de período y categoría en dos turnos', () => {
  let solicitud = iniciarPregunta('¿Qué producto lidera las ventas dentro de una categoría y periodo determinados?');
  assert.equal(prepararConsulta(solicitud).sql, null);
  solicitud = continuarPregunta(solicitud, 'octubre de 2025');
  assert.equal(prepararConsulta(solicitud).sql, null);
  solicitud = continuarPregunta(solicitud, 'Electrónica');
  assert.deepEqual(prepararConsulta(solicitud).parametros, [
    '2025-10-01', '2025-10-31', 'electronica',
  ]);
});

test('comparación de canales usa los tres meses con ventas, no la fecha de hoy', () => {
  let solicitud = iniciarPregunta('Compare el margen de dos canales durante los últimos tres meses disponibles.');
  solicitud = continuarPregunta(solicitud, 'Fisico y E-commerce');
  assert.deepEqual(prepararConsulta(solicitud).parametros, ['Fisico', 'E-commerce']);
  assert.match(prepararConsulta(solicitud).sql, /SELECT DISTINCT t\.AnioMes/);
});

test('comparación de segmentos conserva el orden temporal elegido por el usuario', () => {
  let solicitud = iniciarPregunta('¿Qué segmento de clientes redujo más su volumen de compra?');
  solicitud = continuarPregunta(solicitud, 'octubre de 2025 y noviembre de 2025');
  assert.deepEqual(prepararConsulta(solicitud).parametros, [
    '2025-10-01', '2025-10-31', '2025-11-01', '2025-11-30',
  ]);
});
