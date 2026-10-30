'use strict';

const readline = require('node:readline/promises');
const { cargarEntorno, conectar, crearSesion } = require('./conexion.js');
const { InterpreteGemini } = require('./gemini.js');
const { Agente_Analitico, Usuario, Sesion } = require('./modelo.js');
const { prepararConsulta } = require('./catalogo.js');

async function main() {
  cargarEntorno();
  const interprete = new InterpreteGemini({ apiKey: process.env.GEMINI_API_KEY,
    modelo: process.env.GEMINI_MODEL || undefined });
  let clienteDatos; let clienteP2; let consola;
  try {
    clienteDatos = await conectar('datos');
    clienteP2 = await conectar('bdoo');
    const ids = await crearSesion(clienteP2, {
      nombreUsuario: process.env.AGENTE_USUARIO || 'Equipo 01', modelo: interprete.modelo,
    });
    const usuario = new Usuario(ids.usuarioId, process.env.AGENTE_USUARIO || 'Equipo 01');
    const agente = new Agente_Analitico({ aa_id: ids.agenteId, interprete,
      contexto: { clienteDatos, clienteP2, sesionId: ids.sesionId } });
    const sesion = new Sesion(ids.sesionId, usuario, agente);
    consola = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log(`Sesión ${sesion.ses_id}. Escriba una pregunta, /cancelar o /salir.`);
    while (true) {
      const texto = (await consola.question('\nPregunta: ')).trim();
      if (texto === '/salir') break;
      if (!texto || texto === '/cancelar') continue;
      try {
        const pregunta = usuario.hacer_pregunta(texto);
        sesion.agregar(pregunta);
        let salida = await agente.procesar_pregunta(pregunta);
        let cancelada = false;
        while (salida.solicitud.estado === 'requiere_aclaracion') {
          console.log(salida.solicitud.aclaraciones_usuario.join('\n'));
          const respuesta = (await consola.question('Aclaración: ')).trim();
          if (respuesta === '/salir') return;
          if (respuesta === '/cancelar') { cancelada = true; break; }
          salida = await agente.aclarar(pregunta.pre_id, respuesta);
        }
        if (cancelada) continue;
        if (!prepararConsulta(salida.solicitud).listo_para_consulta) {
          console.log(salida.solicitud.motivo || 'Pregunta fuera del catálogo autorizado.');
          continue;
        }
        const resultado = await agente.responder(pregunta.pre_id);
        console.log(resultado.respuesta_ejecutiva);
        console.log(`Evidencia P2: pregunta ${resultado.pregunta_id}, consulta ${resultado.consulta_id_p2}, respuesta ${resultado.respuesta_id}.`);
      } catch (error) { console.error(`No se completó la interacción: ${error.message}`); }
    }
  } finally {
    consola?.close();
    await Promise.allSettled([clienteDatos?.end(), clienteP2?.end()]);
  }
}
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
