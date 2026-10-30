'use strict';

const { readFileSync } = require('node:fs');
const path = require('node:path');

// El catálogo autoriza únicamente consultas fijas del DQL sobre el esquema P1.
const CATALOGO = Object.freeze([
  {
    id: 'ingreso_neto_mensual', intencion: 'analizar_ventas', metrica: 'ingreso_neto',
    dimensiones: [['tiempo', 'mes']], operacion: 'serie_temporal', periodo: 'rango',
    limite: null, filtros: [], pendientesEquipo: [],
    camposFactVentas: ['MontoVenta', 'MontoDescuento'], reglaCalculo: 'SUM(MontoVenta - MontoDescuento)',
    columnasResultado: ['mes', 'ingreso_neto'],
  },
  {
    id: 'ranking_margen_categorias', intencion: 'analizar_rentabilidad', metrica: 'margen_bruto',
    dimensiones: [['producto', 'categoria']], operacion: 'ranking_descendente', periodo: 'rango',
    limite: 'ranking', filtros: [], pendientesEquipo: [],
    camposFactVentas: ['MontoVenta', 'MontoDescuento', 'CostoTotal'],
    reglaCalculo: 'SUM(MontoVenta - MontoDescuento - CostoTotal)',
    columnasResultado: ['categoria', 'margen_bruto'],
  },
  {
    id: 'ranking_ticket_sucursales', intencion: 'analizar_ventas', metrica: 'ticket_promedio',
    dimensiones: [['sucursal', 'sucursal']], operacion: 'ranking_descendente', periodo: 'rango',
    limite: 1, filtros: [], pendientesEquipo: [],
    camposFactVentas: ['MontoVenta', 'MontoDescuento', 'NumeroTransaccion'],
    reglaCalculo: 'SUM(MontoVenta - MontoDescuento) / COUNT(DISTINCT NumeroTransaccion)',
    columnasResultado: ['sucursal', 'ticket_promedio'],
  },
  {
    id: 'mayor_caida_segmento', intencion: 'analizar_ventas', metrica: 'volumen_compra',
    dimensiones: [['cliente', 'segmento']], operacion: 'comparar_periodos_y_ordenar_caida',
    periodo: 'comparacion', limite: 1, filtros: [], pendientesEquipo: [],
    camposFactVentas: ['CantidadVendida'],
    reglaCalculo: '100 * (SUM(CantidadVendida) anterior - SUM(CantidadVendida) actual) / SUM(CantidadVendida) anterior; solo caídas con ventas en ambos períodos y todos los empates en el primer puesto',
    columnasResultado: ['segmento', 'valor_anterior', 'valor_actual', 'caida_porcentual'],
  },
  {
    id: 'ranking_valor_canales', intencion: 'analizar_ventas', metrica: 'valor_ventas',
    dimensiones: [['canal', 'tipo_canal']], operacion: 'ranking_descendente', periodo: 'rango',
    limite: 1, filtros: [], pendientesEquipo: [],
    camposFactVentas: ['MontoVenta', 'MontoDescuento'], reglaCalculo: 'SUM(MontoVenta - MontoDescuento)',
    columnasResultado: ['canal', 'valor_ventas'],
  },
  {
    id: 'comparacion_margen_canales', intencion: 'comparar_rentabilidad', metrica: 'margen_bruto',
    dimensiones: [['tiempo', 'mes'], ['canal', 'tipo_canal']],
    operacion: 'comparacion_de_series_temporales', periodo: 'ultimos_tres',
    limite: null, filtros: ['canales'], pendientesEquipo: [],
    camposFactVentas: ['MontoVenta', 'MontoDescuento', 'CostoTotal'],
    reglaCalculo: 'SUM(MontoVenta - MontoDescuento - CostoTotal)',
    columnasResultado: ['mes', 'canal', 'margen'],
  },
  {
    id: 'lider_producto_categoria', intencion: 'identificar_producto_mas_vendido',
    metrica: 'ventas_producto', dimensiones: [['producto', 'producto']],
    operacion: 'ranking_descendente', periodo: 'rango', limite: 1, filtros: ['categoria'],
    pendientesEquipo: [],
    camposFactVentas: ['CantidadVendida'], reglaCalculo: 'SUM(CantidadVendida)',
    columnasResultado: ['producto', 'unidades_vendidas'],
  },
].map((entrada) => Object.freeze({
  ...entrada,
  dimensiones: Object.freeze(entrada.dimensiones.map((d) => Object.freeze(d))),
  filtros: Object.freeze(entrada.filtros),
  pendientesEquipo: Object.freeze(entrada.pendientesEquipo),
  camposFactVentas: Object.freeze(entrada.camposFactVentas),
  columnasResultado: Object.freeze(entrada.columnasResultado),
})));

const CANALES = new Set(['Tienda Física', 'E-commerce']);
const objeto = (valor) => valor !== null && typeof valor === 'object'
  && !Array.isArray(valor) && (Object.getPrototypeOf(valor) === Object.prototype
    || Object.getPrototypeOf(valor) === null);
const claves = (valor, esperadas) => objeto(valor)
  && Object.keys(valor).length === esperadas.length
  && esperadas.every((clave) => Object.hasOwn(valor, clave));

function seleccionarConsulta(solicitud) {
  if (!objeto(solicitud) || ['rechazada', 'fuera_de_alcance'].includes(solicitud.estado)) {
    return null;
  }
  const entrada = CATALOGO.find((c) => c.intencion === solicitud.intencion
    && c.metrica === solicitud.metrica && c.operacion === solicitud.operacion
    && Array.isArray(solicitud.dimensiones)
    && solicitud.dimensiones.length === c.dimensiones.length
    && solicitud.dimensiones.every((d, i) => claves(d, ['entidad', 'nivel'])
      && d.entidad === c.dimensiones[i][0] && d.nivel === c.dimensiones[i][1]));
  return entrada?.id ?? null;
}

function fechaValida(fecha) {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha.startsWith('0000')) {
    return false;
  }
  const valor = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(valor.getTime()) && valor.toISOString().slice(0, 10) === fecha;
}

function rangoValido(periodo, rol = false) {
  const campos = rol ? ['rol', 'tipo', 'desde', 'hasta'] : ['tipo', 'desde', 'hasta'];
  return claves(periodo, campos) && periodo.tipo === 'rango_fechas'
    && fechaValida(periodo.desde) && fechaValida(periodo.hasta)
    && periodo.desde <= periodo.hasta;
}

function validarPeriodo(periodo, tipo, errores, faltantes) {
  if (tipo === 'ultimos_tres') {
    if (!claves(periodo, ['tipo', 'cantidad']) || periodo.tipo !== 'ultimos_meses_disponibles'
        || periodo.cantidad !== 3) {
      errores.push('Se requieren los últimos tres meses disponibles.');
    }
    return;
  }
  if (tipo === 'comparacion') {
    if (!claves(periodo, ['tipo', 'periodos']) || periodo.tipo !== 'comparacion_periodos'
        || !Array.isArray(periodo.periodos) || periodo.periodos.length !== 2) {
      errores.push('Se requieren dos períodos de comparación.');
      return;
    }
    const [anterior, actual] = periodo.periodos;
    if (anterior?.tipo === 'no_especificado' || actual?.tipo === 'no_especificado') {
      faltantes.push('Indique los dos períodos en orden anterior y actual.');
    } else if (!rangoValido(anterior, true) || !rangoValido(actual, true)
        || anterior.rol !== 'anterior' || actual.rol !== 'actual'
        || anterior.hasta >= actual.desde) {
      errores.push('Los períodos deben ser rangos válidos, ordenados y sin solapamiento.');
    }
    return;
  }
  if (claves(periodo, ['tipo']) && periodo.tipo === 'no_especificado') {
    faltantes.push('Indique un período explícito.');
  } else if (!rangoValido(periodo)) {
    errores.push('Se requiere un rango de fechas válido.');
  }
}

function validarFiltros(filtros, entrada, errores, faltantes) {
  if (!claves(filtros, entrada.filtros)) {
    errores.push('Los filtros no coinciden con los permitidos para esta consulta.');
    return;
  }
  if (entrada.filtros.includes('canales')) {
    if (!Array.isArray(filtros.canales) || filtros.canales.length > 2) {
      errores.push('Se requieren exactamente dos canales.');
    } else if (filtros.canales.length < 2) {
      faltantes.push('Indique dos canales distintos.');
    } else if (!filtros.canales.every((canal) => CANALES.has(canal))
        || filtros.canales[0] === filtros.canales[1]) {
      errores.push('Los canales deben ser distintos y estar autorizados.');
    }
  }
  if (entrada.filtros.includes('categoria')) {
    if (filtros.categoria === null) {
      faltantes.push('Indique la categoría.');
    } else if (typeof filtros.categoria !== 'string'
        || !/^[a-z]+(?:[ -][a-z]+){0,4}$/.test(filtros.categoria)) {
      errores.push('La categoría debe ser un valor normalizado, no una expresión SQL.');
    }
  }
}

function validarConsulta(solicitud) {
  const id = seleccionarConsulta(solicitud);
  const base = {
    consulta_id: id, estado: 'no_admitida', valida_estructuralmente: false,
    errores: [], faltantes: [], pendientes_equipo: [], columnas_resultado: [],
    listo_para_consulta: false,
  };
  if (id === null) {
    base.errores.push('No hay una combinación de intención, métrica, dimensiones y operación permitida.');
    return base;
  }
  const entrada = CATALOGO.find((c) => c.id === id);
  base.pendientes_equipo = [...entrada.pendientesEquipo];
  base.columnas_resultado = [...entrada.columnasResultado];

  if (!['requiere_aclaracion', 'pendiente_definicion_equipo', 'interpretada'].includes(solicitud.estado)
      || !Array.isArray(solicitud.aclaraciones_usuario)
      || !solicitud.aclaraciones_usuario.every((pregunta) => typeof pregunta === 'string')
      || !Array.isArray(solicitud.pendientes_equipo)) {
    base.errores.push('El estado o las aclaraciones de la solicitud no son válidos.');
  }
  if (entrada.limite === 'ranking') {
    if (!Number.isInteger(solicitud.limite) || solicitud.limite < 1 || solicitud.limite > 20) {
      base.errores.push('El límite debe estar entre 1 y 20.');
    }
  } else if (solicitud.limite !== entrada.limite) {
    base.errores.push('El límite no corresponde a esta consulta.');
  }
  validarPeriodo(solicitud.periodo, entrada.periodo, base.errores, base.faltantes);
  validarFiltros(solicitud.filtros, entrada, base.errores, base.faltantes);
  if (solicitud.aclaraciones_usuario?.length > 0 && base.faltantes.length === 0) {
    base.errores.push('Hay aclaraciones pendientes que no corresponden a los parámetros.');
  }
  if (solicitud.aclaraciones_usuario?.length === 0 && base.faltantes.length > 0) {
    base.errores.push('Faltan parámetros sin una aclaración pendiente.');
  }
  if (base.faltantes.length === 0 && solicitud.estado === 'requiere_aclaracion') {
    base.errores.push('La solicitud indica aclaración pendiente aunque todos los parámetros están completos.');
  }
  if (base.faltantes.length > 0 && solicitud.estado !== 'requiere_aclaracion') {
    base.errores.push('La solicitud incompleta debe requerir aclaración.');
  }

  base.estado = base.errores.length ? 'invalida'
    : base.faltantes.length ? 'requiere_aclaracion' : 'lista_para_consulta';
  base.valida_estructuralmente = base.errores.length === 0 && base.faltantes.length === 0;
  base.listo_para_consulta = base.valida_estructuralmente && base.pendientes_equipo.length === 0;
  return base;
}

// Se extraen exclusivamente los siete bloques identificados del archivo revisado.
// No se construye SQL a partir de las palabras del usuario.
const DQL = readFileSync(path.join(__dirname, '..', 'Equipo01_DataMart_Parcial01',
  'Equipo01_DataMart_DQL_Parcial01.sql'), 'utf8').replace(/\r\n/g, '\n');
const PLANTILLAS = Object.freeze(Object.fromEntries(CATALOGO.map(({ id }) => {
  const inicio = `-- BEGIN QUERY ${id}\n`;
  const fin = `-- END QUERY ${id}`;
  if (DQL.split(inicio).length !== 2 || DQL.split(fin).length !== 2) {
    throw new Error(`La plantilla ${id} debe aparecer exactamente una vez en el DQL.`);
  }
  const bloque = DQL.split(inicio)[1].split(fin)[0];
  const sql = bloque.split('\n').filter((linea) => !linea.trimStart().startsWith('--'))
    .join('\n').trim();
  if (!/^(SELECT|WITH)\s/i.test(sql) || !sql.endsWith(';') || sql.slice(0, -1).includes(';')) {
    throw new Error(`La plantilla ${id} no es una única consulta de lectura.`);
  }
  return [id, sql];
})));

function parametrosDe(solicitud, entrada) {
  if (entrada.periodo === 'ultimos_tres') return [...solicitud.filtros.canales];
  if (entrada.periodo === 'comparacion') {
    const [anterior, actual] = solicitud.periodo.periodos;
    return [anterior.desde, anterior.hasta, actual.desde, actual.hasta];
  }
  const parametros = [solicitud.periodo.desde, solicitud.periodo.hasta];
  if (entrada.limite === 'ranking') parametros.push(solicitud.limite);
  if (entrada.filtros.includes('categoria')) parametros.push(solicitud.filtros.categoria);
  return parametros;
}

function prepararConsulta(solicitud) {
  const validacion = validarConsulta(solicitud);
  if (!validacion.listo_para_consulta) return { ...validacion, sql: null, parametros: [] };
  const entrada = CATALOGO.find((item) => item.id === validacion.consulta_id);
  return {
    ...validacion, sql: PLANTILLAS[entrada.id], parametros: parametrosDe(solicitud, entrada),
    regla_calculo: entrada.reglaCalculo, campos_fact_ventas: [...entrada.camposFactVentas],
  };
}

async function ejecutarConsulta(solicitud, cliente) {
  const preparada = prepararConsulta(solicitud);
  if (!preparada.listo_para_consulta) {
    throw new Error(`Consulta no habilitada: ${preparada.estado}`);
  }
  if (!cliente || typeof cliente.query !== 'function') {
    throw new TypeError('Se requiere un cliente PostgreSQL de solo lectura con query(sql, parametros).');
  }
  const resultado = await cliente.query(preparada.sql, preparada.parametros);
  if (!Array.isArray(resultado?.rows)) throw new Error('El Data Mart no devolvió filas válidas.');
  return {
    consulta_id: preparada.consulta_id, periodo: solicitud.periodo,
    filtros: solicitud.filtros, regla_calculo: preparada.regla_calculo,
    campos_fact_ventas: preparada.campos_fact_ventas,
    filas: resultado.rows, sin_registros: resultado.rows.length === 0,
  };
}

module.exports = { CATALOGO, seleccionarConsulta, validarConsulta, prepararConsulta, ejecutarConsulta };
