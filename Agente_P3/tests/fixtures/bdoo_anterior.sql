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
    u_id INT REFERENCES usuarios(u_id),
    aa_id INT REFERENCES agentes_analiticos(aa_id)
);

CREATE TABLE intenciones (
    int_id SERIAL PRIMARY KEY,
    int_nombre TEXT NOT NULL,
    int_descripcion TEXT
);

CREATE TABLE preguntas (
    pre_id SERIAL PRIMARY KEY,
    pre_texto TEXT NOT NULL,
    pre_fecha TIMESTAMP DEFAULT NOW(),
    pre_filtro TEXT,
    ses_id INT REFERENCES sesiones(ses_id),
    int_id INT REFERENCES intenciones(int_id)
);

CREATE TABLE consultas_analiticas (
    ca_id SERIAL PRIMARY KEY,
    pre_id INT REFERENCES preguntas(pre_id),
    ca_sql TEXT NOT NULL,
    ca_parametros TEXT
);

CREATE TABLE fuentes_datos (
    fd_id SERIAL PRIMARY KEY,
    ca_id INT REFERENCES consultas_analiticas(ca_id),
    fd_nombre_tabla TEXT,
    fd_atributo TEXT,
    fd_tipo_dato TEXT
);

CREATE TABLE reglas_validaciones (
    rv_id SERIAL,
    ca_id INT REFERENCES consultas_analiticas(ca_id),
    rv_nombre TEXT NOT NULL,
    rv_estado TEXT,
    rv_mensaje TEXT,
    PRIMARY KEY (rv_id)
);

CREATE TABLE reglas_seguridad (
    rv_nivel_acceso TEXT NOT NULL, 
    rv_rol_requerido TEXT          
) INHERITS (reglas_validaciones);

CREATE TABLE reglas_sintaxis (
    rv_dialecto_sql TEXT NOT NULL, 
    rv_max_joins INT               
) INHERITS (reglas_validaciones);

CREATE TABLE reglas_repuesta (
    rv_palabras_restringidas TEXT, 
    rv_tono_requerido TEXT         
) INHERITS (reglas_validaciones);

CREATE TABLE resultados_consultas (
    rc_id SERIAL PRIMARY KEY,
    ca_id INT REFERENCES consultas_analiticas(ca_id),
    rc_datos_brutos TEXT,
    rc_metadatos TEXT
);

CREATE TABLE respuestas_agente (
    ra_id SERIAL PRIMARY KEY,
    rc_id INT REFERENCES resultados_consultas(rc_id),
    ra_explicacion TEXT NOT NULL,
    ra_fecha TIMESTAMP DEFAULT NOW()
);
