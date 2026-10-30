'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { prepararConsulta, ejecutarConsulta } = require('./catalogo.js');
const { redactarRespuesta } = require('./respuesta.js');

// Python reconoce la intención; el catálogo, no Python, decide qué SQL está permitido.
function pasarAlInterprete(entrada) {
  // JSON ASCII evita diferencias de codificación de stdin/stdout en Windows.
  const input = JSON.stringify(entrada).replace(/[\u007f-\uffff]/g,
    (caracter) => `\\u${caracter.charCodeAt(0).toString(16).padStart(4, '0')}`);
  const salida = execFileSync(process.env.PYTHON_BIN || 'python', ['-B', path.join(__dirname, 'puente_interprete.py')], {
    cwd: __dirname, input, encoding: 'utf8',
  });
  return JSON.parse(salida);
}

function iniciarPregunta(pregunta) {
  return pasarAlInterprete({ accion: 'interpretar', pregunta });
}

function continuarPregunta(solicitud, respuesta) {
  return pasarAlInterprete({ accion: 'aclarar', solicitud, respuesta });
}

// Un cliente PostgreSQL inyectado debe usar una cuenta con privilegios SELECT.
// La primera llamada devuelve la aclaración; solo después se consulta.
async function consultarSolicitud(solicitud, cliente) {
  return ejecutarConsulta(solicitud, cliente);
}

async function consultarYResponder(solicitud, cliente) {
  const resultado = await consultarSolicitud(solicitud, cliente);
  return { ...resultado, respuesta_ejecutiva: redactarRespuesta(resultado) };
}

module.exports = { iniciarPregunta, continuarPregunta, prepararConsulta, consultarSolicitud, consultarYResponder };
