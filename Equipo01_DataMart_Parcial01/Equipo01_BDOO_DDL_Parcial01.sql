-- Instalación NUEVA. Para una base existente usar Equipo01_BDOO_Migracion_Diagrama.sql.
-- Ejecutar en el esquema BDOO elegido. Persistencia objeto-relacional PostgreSQL.
BEGIN;

CREATE TABLE agentes_analiticos (
    aa_id SERIAL PRIMARY KEY,
    aa_nombre TEXT NOT NULL,
    aa_plataforma TEXT,
    aa_modelo TEXT
);

CREATE TABLE usuarios (
    u_id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL
);

CREATE TABLE sesiones (
    ses_id SERIAL PRIMARY KEY,
    ses_fech TIMESTAMP DEFAULT NOW(),
    u_id INT NOT NULL REFERENCES usuarios(u_id),
    aa_id INT NOT NULL REFERENCES agentes_analiticos(aa_id)
);

CREATE TABLE intenciones (
    int_id SERIAL PRIMARY KEY,
    int_nombre TEXT NOT NULL CONSTRAINT intenciones_nombre_uk UNIQUE,
    int_descripcion TEXT
);

CREATE TABLE preguntas (
    pre_id SERIAL PRIMARY KEY,
    pre_texto TEXT NOT NULL,
    pre_fecha TIMESTAMP DEFAULT NOW(),
    pre_filtro TEXT,
    ses_id INT NOT NULL REFERENCES sesiones(ses_id),
    -- NULL solo para preguntas rechazadas o fuera de alcance, sin intención analítica.
    int_id INT REFERENCES intenciones(int_id)
);

CREATE TABLE consultas_analiticas (
    ca_id SERIAL PRIMARY KEY,
    pre_id INT NOT NULL CONSTRAINT consulta_pregunta_uk UNIQUE REFERENCES preguntas(pre_id),
    ca_sql TEXT NOT NULL,
    ca_parametros TEXT,
    ca_validacion TEXT NOT NULL DEFAULT 'pendiente'
      CHECK (ca_validacion IN ('pendiente', 'aprobada', 'fallida'))
);

CREATE TABLE fuentes_datos (
    fd_id SERIAL PRIMARY KEY,
    ca_id INT NOT NULL REFERENCES consultas_analiticas(ca_id),
    fd_nombre_tabla TEXT,
    fd_atributo TEXT,
    fd_tipo_dato TEXT
);

CREATE TABLE reglas_validaciones (
    rv_id SERIAL,
    ca_id INT NOT NULL REFERENCES consultas_analiticas(ca_id),
    rv_nombre TEXT NOT NULL,
    rv_estado TEXT,
    rv_mensaje TEXT,
    PRIMARY KEY (rv_id)
);

CREATE TABLE reglas_seguridad (
    PRIMARY KEY (rv_id),
    FOREIGN KEY (ca_id) REFERENCES consultas_analiticas(ca_id),
    rv_nivel_acceso TEXT NOT NULL, 
    rv_rol_requerido TEXT          
) INHERITS (reglas_validaciones);

CREATE TABLE reglas_sintaxis (
    PRIMARY KEY (rv_id),
    FOREIGN KEY (ca_id) REFERENCES consultas_analiticas(ca_id),
    rv_dialecto_sql TEXT NOT NULL, 
    rv_max_joins INT               
) INHERITS (reglas_validaciones);

-- PostgreSQL no hereda las PK ni FK: se declaran en cada subtipo.
CREATE TABLE reglas_respuesta (
    PRIMARY KEY (rv_id),
    FOREIGN KEY (ca_id) REFERENCES consultas_analiticas(ca_id),
    rv_palabras_restringidas TEXT, 
    rv_tono_requerido TEXT         
) INHERITS (reglas_validaciones);

CREATE TABLE resultados_consultas (
    rc_id SERIAL PRIMARY KEY,
    ca_id INT NOT NULL CONSTRAINT resultado_consulta_uk UNIQUE REFERENCES consultas_analiticas(ca_id),
    rc_datos_brutos TEXT,
    rc_metadatos TEXT
);

CREATE TABLE respuestas_agente (
    ra_id SERIAL PRIMARY KEY,
    rc_id INT NOT NULL CONSTRAINT respuesta_resultado_uk UNIQUE REFERENCES resultados_consultas(rc_id),
    ra_explicacion TEXT NOT NULL,
    ra_fecha TIMESTAMP DEFAULT NOW()
);

-- Las cadenas 1:1 se completan al aprobar la consulta, dentro de una transacción.
-- Antes de responder puede no existir consulta o resultado (aclaraciones/errores).
CREATE FUNCTION comprobar_cadena_bdoo() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE consulta INT;
BEGIN
  IF TG_TABLE_NAME = 'consultas_analiticas' THEN
    consulta := COALESCE(NEW.ca_id, OLD.ca_id);
  ELSIF TG_TABLE_NAME = 'resultados_consultas' THEN
    consulta := COALESCE(NEW.ca_id, OLD.ca_id);
  ELSE
    SELECT ca_id INTO consulta FROM resultados_consultas
      WHERE rc_id = COALESCE(NEW.rc_id, OLD.rc_id);
  END IF;
  IF EXISTS (SELECT 1 FROM consultas_analiticas WHERE ca_id = consulta AND ca_validacion = 'aprobada')
     AND NOT EXISTS (SELECT 1 FROM resultados_consultas r JOIN respuestas_agente a USING (rc_id)
                     WHERE r.ca_id = consulta) THEN
    RAISE EXCEPTION 'Una consulta aprobada requiere exactamente un resultado y una respuesta';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER cadena_consulta AFTER INSERT OR UPDATE OR DELETE ON consultas_analiticas
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION comprobar_cadena_bdoo();
CREATE CONSTRAINT TRIGGER cadena_resultado AFTER INSERT OR UPDATE OR DELETE ON resultados_consultas
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION comprobar_cadena_bdoo();
CREATE CONSTRAINT TRIGGER cadena_respuesta AFTER INSERT OR UPDATE OR DELETE ON respuestas_agente
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION comprobar_cadena_bdoo();

INSERT INTO intenciones (int_nombre, int_descripcion) VALUES
 ('analizar_ventas', 'Ventas, clientes, canales y sucursales'),
 ('analizar_rentabilidad', 'Margen bruto por categoría'),
 ('comparar_rentabilidad', 'Margen de canales por mes'),
 ('identificar_producto_mas_vendido', 'Producto líder por unidades');
COMMIT;
