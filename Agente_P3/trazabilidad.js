'use strict';

const { iniciarPregunta, continuarPregunta, consultarYResponder, prepararConsulta } = require('./flujo.js');
const { CATALOGO } = require('./catalogo.js');

// Fuentes revisadas junto con los siete bloques del DQL de P1, nunca derivadas del usuario.
const DIMENSIONES = Object.freeze({
  ingreso_neto_mensual: [['DimTiempo', 'AnioMes'], ['DimTiempo', 'FechaCompleta']],
  ranking_margen_categorias: [['DimTiempo', 'FechaCompleta'], ['DimProducto', 'Categoria']],
  ranking_ticket_sucursales: [['DimTiempo', 'FechaCompleta'], ['DimSucursal', 'NombreSucursal']],
  mayor_caida_segmento: [['DimTiempo', 'FechaCompleta'], ['DimCliente', 'Segmento']],
  ranking_valor_canales: [['DimTiempo', 'FechaCompleta'], ['DimCanal', 'TipoCanal']],
  comparacion_margen_canales: [['DimTiempo', 'AnioMes'], ['DimCanal', 'TipoCanal']],
  lider_producto_categoria: [['DimTiempo', 'FechaCompleta'], ['DimProducto', 'Categoria'], ['DimProducto', 'NombreProducto']],
});

function idValido(id) {
  return Number.isSafeInteger(id) && id > 0;
}

function exigirCliente(cliente, nombre) {
  if (!cliente || typeof cliente.query !== 'function') {
    throw new TypeError(`${nombre} debe proporcionar query(sql, parametros).`);
  }
}

async function transaccion(cliente, accion) {
  await cliente.query('BEGIN');
  try {
    const valor = await accion();
    await cliente.query('COMMIT');
    return valor;
  } catch (error) {
    try { await cliente.query('ROLLBACK'); } catch (rollbackError) { error.cause = rollbackError; }
    throw error;
  }
}

function json(valor) {
  return JSON.stringify(valor);
}

async function buscarPregunta(clienteP2, preguntaId, sesionId) {
  const { rows } = await clienteP2.query(
    'SELECT pre_filtro FROM preguntas WHERE pre_id = $1 AND ses_id = $2 FOR UPDATE',
    [preguntaId, sesionId],
  );
  if (rows.length !== 1) throw new Error('La pregunta no pertenece a la sesión.');
  const historial = JSON.parse(rows[0].pre_filtro);
  if (!historial || !historial.solicitud || !Array.isArray(historial.aclaraciones)) {
    throw new Error('La pregunta no tiene un estado de interpretación válido.');
  }
  return historial;
}

// P2 provee una sesión existente y exactamente una intención por nombre lógico.
async function crearPreguntaTrazada(pregunta, { clienteP2, sesionId }) {
  exigirCliente(clienteP2, 'clienteP2');
  if (!idValido(sesionId)) throw new TypeError('Se requiere un sesionId existente.');
  const solicitud = iniciarPregunta(pregunta);
  return transaccion(clienteP2, async () => {
    let intencionId = null;
    if (solicitud.intencion !== null) {
      const { rows } = await clienteP2.query(
        'SELECT int_id FROM intenciones WHERE int_nombre = $1 LIMIT 2', [solicitud.intencion],
      );
      if (rows.length !== 1) throw new Error('P2 debe registrar una única fila para la intención interpretada.');
      intencionId = rows[0].int_id;
    }
    const { rows } = await clienteP2.query(
      'INSERT INTO preguntas (pre_texto, pre_filtro, ses_id, int_id) VALUES ($1, $2, $3, $4) RETURNING pre_id',
      [pregunta, json({ solicitud, aclaraciones: [] }), sesionId, intencionId],
    );
    return { pregunta_id: rows[0].pre_id, solicitud };
  });
}

async function aclararPreguntaTrazada(preguntaId, respuesta, { clienteP2, sesionId }) {
  exigirCliente(clienteP2, 'clienteP2');
  if (!idValido(preguntaId) || !idValido(sesionId)) throw new TypeError('Se requieren IDs válidos.');
  return transaccion(clienteP2, async () => {
    const historial = await buscarPregunta(clienteP2, preguntaId, sesionId);
    const solicitud = continuarPregunta(historial.solicitud, respuesta);
    historial.aclaraciones.push({ pregunta: historial.solicitud.aclaraciones_usuario[0], respuesta });
    historial.solicitud = solicitud;
    await clienteP2.query('UPDATE preguntas SET pre_filtro = $1 WHERE pre_id = $2 AND ses_id = $3',
      [json(historial), preguntaId, sesionId]);
    return { pregunta_id: preguntaId, solicitud };
  });
}

async function prepararRegistro(clienteP2, preguntaId, sesionId) {
  return transaccion(clienteP2, async () => {
    const { solicitud } = await buscarPregunta(clienteP2, preguntaId, sesionId);
    const preparada = prepararConsulta(solicitud);
    if (!preparada.listo_para_consulta) throw new Error(`Consulta no habilitada: ${preparada.estado}`);
    const anteriores = await clienteP2.query(
      'SELECT ca_id FROM consultas_analiticas WHERE pre_id = $1 LIMIT 1', [preguntaId],
    );
    if (anteriores.rows.length) throw new Error('Esta pregunta ya tiene una consulta registrada.');
    const { rows } = await clienteP2.query(
      'INSERT INTO consultas_analiticas (pre_id, ca_sql, ca_parametros) VALUES ($1, $2, $3) RETURNING ca_id',
      [preguntaId, preparada.sql, json({ consulta_id: preparada.consulta_id, valores: preparada.parametros })],
    );
    const consultaId = rows[0].ca_id;
    const entrada = CATALOGO.find((c) => c.id === preparada.consulta_id);
    const fuentes = [
      ...entrada.camposFactVentas.map((atributo) => ['FactVentas', atributo]),
      ...DIMENSIONES[entrada.id],
    ];
    for (const [tabla, atributo] of fuentes) {
      await clienteP2.query(
        'INSERT INTO fuentes_datos (ca_id, fd_nombre_tabla, fd_atributo) VALUES ($1, $2, $3)',
        [consultaId, tabla, atributo],
      );
    }
    await clienteP2.query(
      'INSERT INTO reglas_validaciones (ca_id, rv_nombre, rv_estado, rv_mensaje) VALUES ($1, $2, $3, $4)',
      [consultaId, 'consulta_autorizada', 'aprobada', `Plantilla ${preparada.consulta_id}; parámetros validados.`],
    );
    return { solicitud, consultaId };
  });
}

async function consultarPreguntaTrazada(preguntaId, { clienteP2, clienteDatos, sesionId }) {
  exigirCliente(clienteP2, 'clienteP2');
  exigirCliente(clienteDatos, 'clienteDatos');
  if (clienteP2 === clienteDatos) throw new Error('P1 y P2 requieren clientes separados.');
  if (!idValido(preguntaId) || !idValido(sesionId)) throw new TypeError('Se requieren IDs válidos.');
  const { solicitud, consultaId } = await prepararRegistro(clienteP2, preguntaId, sesionId);
  let resultado;
  try {
    resultado = await consultarYResponder(solicitud, clienteDatos);
  } catch (error) {
    await clienteP2.query(
      'INSERT INTO reglas_validaciones (ca_id, rv_nombre, rv_estado, rv_mensaje) VALUES ($1, $2, $3, $4)',
      [consultaId, 'consulta_p1', 'fallida', 'No se pudo obtener una respuesta válida del Data Mart.'],
    );
    throw error;
  }
  const ids = await transaccion(clienteP2, async () => {
    await clienteP2.query(
      'INSERT INTO reglas_validaciones (ca_id, rv_nombre, rv_estado, rv_mensaje) VALUES ($1, $2, $3, $4)',
      [consultaId, 'consulta_p1', 'aprobada', `Filas agregadas: ${resultado.filas.length}.`],
    );
    const metadatos = {
      consulta_id: resultado.consulta_id, periodo: resultado.periodo,
      filtros: resultado.filtros, regla_calculo: resultado.regla_calculo,
      campos_fact_ventas: resultado.campos_fact_ventas,
      cantidad_filas: resultado.filas.length, sin_registros: resultado.sin_registros,
    };
    const { rows } = await clienteP2.query(
      'INSERT INTO resultados_consultas (ca_id, rc_datos_brutos, rc_metadatos) VALUES ($1, $2, $3) RETURNING rc_id',
      [consultaId, json(resultado.filas), json(metadatos)],
    );
    const respuesta = await clienteP2.query(
      'INSERT INTO respuestas_agente (rc_id, ra_explicacion) VALUES ($1, $2) RETURNING ra_id',
      [rows[0].rc_id, resultado.respuesta_ejecutiva],
    );
    return { resultado_id: rows[0].rc_id, respuesta_id: respuesta.rows[0].ra_id };
  });
  return { pregunta_id: preguntaId, consulta_id_p2: consultaId, ...ids, ...resultado };
}

module.exports = { crearPreguntaTrazada, aclararPreguntaTrazada, consultarPreguntaTrazada };
