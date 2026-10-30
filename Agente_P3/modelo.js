'use strict';

const { prepararConsulta, ejecutarConsulta } = require('./catalogo.js');
const { redactarRespuesta } = require('./respuesta.js');
const { fuentesDe } = require('./fuentes.js');
const { CATALOGO } = require('./catalogo.js');
const { crearPreguntaTrazada, aclararPreguntaTrazada, consultarPreguntaTrazada } = require('./trazabilidad.js');

class Usuario {
  constructor(u_id, nombre) { this.u_id = u_id; this.nombre = nombre; }
  hacer_pregunta(texto) { return new Pregunta({ pre_texto: texto }); }
}
class Sesion {
  constructor(ses_id, usuario, agente) {
    this.ses_id = ses_id; this.usuario = usuario; this.agente = agente;
    this.ses_fech = new Date(); this.preguntas = [];
  }
  agregar(pregunta) { pregunta.sesion = this; this.preguntas.push(pregunta); }
}
class Intencion {
  constructor(int_nombre, int_descripcion = '', int_id = null) {
    Object.assign(this, { int_id, int_nombre, int_descripcion });
  }
}
class Pregunta {
  constructor({ pre_id = null, pre_texto, pre_fecha = new Date(), pre_filtro = null }) {
    if (typeof pre_texto !== 'string' || !pre_texto.trim()) throw new Error('La pregunta no puede estar vacía.');
    Object.assign(this, { pre_id, pre_texto, pre_fecha, pre_filtro });
  }
}
class Fuente_Dato {
  constructor(fd_nombre_tabla, fd_atributo, fd_tipo_dato) {
    Object.assign(this, { fd_nombre_tabla, fd_atributo, fd_tipo_dato });
  }
}
class Regla_Validacion {
  constructor(rv_nombre) { this.rv_nombre = rv_nombre; this.rv_estado = 'pendiente'; this.rv_mensaje = ''; }
  evaluar(condicion, mensaje) {
    this.rv_estado = condicion ? 'aprobada' : 'fallida'; this.rv_mensaje = mensaje;
    if (!condicion) throw new Error(mensaje);
    return this;
  }
}
class Regla_Seguridad extends Regla_Validacion {
  constructor() { super('seguridad_lectura'); this.rv_nivel_acceso = 'SELECT'; this.rv_rol_requerido = 'lector_datamart'; }
  validar(sql) { return this.evaluar(/^(SELECT|WITH)\s/i.test(sql) && !/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i.test(sql),
    'Solo se autoriza una plantilla de lectura del catálogo.'); }
}
class Regla_Sintaxis extends Regla_Validacion {
  constructor() { super('sintaxis_catalogo'); this.rv_dialecto_sql = 'PostgreSQL'; this.rv_max_joins = 6; }
  validar(consulta) { return this.evaluar(consulta.listo_para_consulta
    && (consulta.sql.match(/\bJOIN\b/gi) || []).length <= this.rv_max_joins,
  'Parámetros, dimensiones y plantilla PostgreSQL autorizados.'); }
}
class Regla_Respuesta extends Regla_Validacion {
  constructor() { super('respuesta_con_evidencia'); this.rv_palabras_restringidas = ''; this.rv_tono_requerido = 'ejecutivo'; }
  validar(texto) { return this.evaluar(typeof texto === 'string' && texto.trim().length > 0,
    'Respuesta construida con las filas y la evidencia del catálogo.'); }
}
class Consulta_Analitica {
  #solicitud;
  constructor(solicitud) {
    this.#solicitud = structuredClone(solicitud);
    this.preparada = prepararConsulta(this.#solicitud);
    if (!this.preparada.listo_para_consulta) throw new Error('La pregunta necesita aclaraciones o está fuera de alcance.');
    this.reglas = [new Regla_Seguridad().validar(this.preparada.sql),
      new Regla_Sintaxis().validar(this.preparada)];
    const entrada = CATALOGO.find((c) => c.id === this.preparada.consulta_id);
    this.fuentes = fuentesDe(entrada).map(([tabla, campo]) => new Fuente_Dato(tabla, campo, tipoDato(campo)));
  }
  get ca_sql() { return this.preparada.sql; }
  get ca_parametros() { return [...this.preparada.parametros]; }
  get ca_validacion() { return this.reglas.every((r) => r.rv_estado === 'aprobada') ? 'aprobada' : 'fallida'; }
  async ejecutar(cliente) { return new Resultado_Consulta(await ejecutarConsulta(this.#solicitud, cliente)); }
}
class Resultado_Consulta {
  constructor(resultado) {
    this.resultado = resultado; this.rc_datos_brutos = resultado.filas;
    this.rc_metadatos = { consulta_id: resultado.consulta_id, periodo: resultado.periodo,
      filtros: resultado.filtros, cantidad_filas: resultado.filas.length };
  }
}
class Respuesta_Agente {
  constructor(resultado) {
    this.ra_explicacion = redactarRespuesta(resultado.resultado); this.ra_fecha = new Date();
    this.regla = new Regla_Respuesta().validar(this.ra_explicacion);
  }
}
function tipoDato(campo) {
  if (campo === 'FechaCompleta') return 'date';
  return ['MontoVenta', 'MontoDescuento', 'CostoTotal', 'CantidadVendida'].includes(campo) ? 'numeric' : 'varchar';
}

class Agente_Analitico {
  #nombre;
  constructor({ aa_id, aa_nombre = 'Agente Equipo 01', interprete, contexto }) {
    this.aa_id = aa_id; this.aa_nombre = aa_nombre;
    this.aa_plataforma = 'Gemini API'; this.aa_modelo = interprete.modelo;
    this.interprete = interprete;
    this.contexto = { ...contexto,
      interpretar: (texto) => interprete.interpretar(texto),
      aclarar: (solicitud, texto) => interprete.aclarar(solicitud, texto),
      consultar: async (solicitud, cliente) => {
        const consulta = this.generar_sql(solicitud);
        const inicio = performance.now();
        const resultado = await this.consultar_datamart(consulta, cliente);
        return { ...resultado.resultado, duracion_ms: Math.round(performance.now() - inicio),
          respuesta_ejecutiva: this.sintetizar_respuesta(resultado) };
      },
      registrarReglas: registrarReglasObjetos,
    };
  }
  get aa_nombre() { return this.#nombre; }
  set aa_nombre(nombre) {
    if (typeof nombre !== 'string' || !nombre.trim()) throw new Error('Nombre de agente inválido.');
    this.#nombre = nombre.trim();
  }
  async procesar_pregunta(pregunta) {
    const salida = await crearPreguntaTrazada(pregunta.pre_texto, this.contexto);
    pregunta.pre_id = salida.pregunta_id; pregunta.pre_filtro = salida.solicitud;
    pregunta.intencion = new Intencion(salida.solicitud.intencion);
    return salida;
  }
  aclarar(preguntaId, texto) { return aclararPreguntaTrazada(preguntaId, texto, this.contexto); }
  responder(preguntaId) { return consultarPreguntaTrazada(preguntaId, this.contexto); }
  generar_sql(solicitud) { return new Consulta_Analitica(solicitud); }
  consultar_datamart(consulta, cliente = this.contexto.clienteDatos) {
    if (!(consulta instanceof Consulta_Analitica)) throw new Error('Se requiere una Consulta_Analitica autorizada.');
    return consulta.ejecutar(cliente);
  }
  sintetizar_respuesta(resultado) { return new Respuesta_Agente(resultado).ra_explicacion; }
}

async function registrarReglasObjetos(cliente, caId, solicitud, resultado) {
  const consulta = new Consulta_Analitica(solicitud);
  const reglas = [...consulta.reglas, new Regla_Respuesta().validar(resultado.respuesta_ejecutiva)];
  for (const regla of reglas) {
    let sql; let extra;
    const base = [caId, regla.rv_nombre, regla.rv_estado, regla.rv_mensaje];
    if (regla instanceof Regla_Seguridad) {
      sql = 'INSERT INTO reglas_seguridad (ca_id, rv_nombre, rv_estado, rv_mensaje, rv_nivel_acceso, rv_rol_requerido) VALUES ($1,$2,$3,$4,$5,$6)';
      extra = [regla.rv_nivel_acceso, regla.rv_rol_requerido];
    } else if (regla instanceof Regla_Sintaxis) {
      sql = 'INSERT INTO reglas_sintaxis (ca_id, rv_nombre, rv_estado, rv_mensaje, rv_dialecto_sql, rv_max_joins) VALUES ($1,$2,$3,$4,$5,$6)';
      extra = [regla.rv_dialecto_sql, regla.rv_max_joins];
    } else {
      sql = 'INSERT INTO reglas_respuesta (ca_id, rv_nombre, rv_estado, rv_mensaje, rv_palabras_restringidas, rv_tono_requerido) VALUES ($1,$2,$3,$4,$5,$6)';
      extra = [regla.rv_palabras_restringidas, regla.rv_tono_requerido];
    }
    await cliente.query(sql, [...base, ...extra]);
  }
  for (const fuente of consulta.fuentes) {
    await cliente.query('UPDATE fuentes_datos SET fd_tipo_dato = $1 WHERE ca_id = $2 AND fd_nombre_tabla = $3 AND fd_atributo = $4',
      [fuente.fd_tipo_dato, caId, fuente.fd_nombre_tabla, fuente.fd_atributo]);
  }
  await cliente.query("UPDATE consultas_analiticas SET ca_validacion = 'aprobada' WHERE ca_id = $1", [caId]);
}

module.exports = { Usuario, Sesion, Pregunta, Intencion, Fuente_Dato, Consulta_Analitica,
  Resultado_Consulta, Respuesta_Agente, Regla_Validacion, Regla_Seguridad, Regla_Sintaxis,
  Regla_Respuesta, Agente_Analitico, registrarReglasObjetos };
