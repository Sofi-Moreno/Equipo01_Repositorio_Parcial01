-- Migración de UNA SOLA EJECUCIÓN desde el DDL anterior del repositorio.
-- Conserva los datos; si hay nulos, huérfanos o duplicados incompatibles,
-- PostgreSQL rechaza las restricciones y revierte toda la transacción.
-- No ejecutar el DDL de instalación nueva sobre una BDOO existente.
-- Seleccionar primero el esquema correcto con SET search_path.
BEGIN;

CREATE TABLE IF NOT EXISTS agentes_analiticos (
 aa_id SERIAL PRIMARY KEY, aa_nombre TEXT NOT NULL, aa_plataforma TEXT, aa_modelo TEXT
);
ALTER TABLE sesiones ADD COLUMN IF NOT EXISTS aa_id INT REFERENCES agentes_analiticos(aa_id);
-- Para sesiones anteriores sin agente se crea una identidad histórica explícita.
INSERT INTO agentes_analiticos (aa_nombre, aa_plataforma, aa_modelo)
 SELECT 'Agente histórico', 'No documentada', 'No documentado'
 WHERE EXISTS (SELECT 1 FROM sesiones WHERE aa_id IS NULL);
UPDATE sesiones SET aa_id = (SELECT MIN(aa_id) FROM agentes_analiticos WHERE aa_nombre = 'Agente histórico')
 WHERE aa_id IS NULL;

ALTER TABLE sesiones ALTER COLUMN u_id SET NOT NULL, ALTER COLUMN aa_id SET NOT NULL;
ALTER TABLE preguntas ALTER COLUMN ses_id SET NOT NULL;
ALTER TABLE intenciones ADD CONSTRAINT intenciones_nombre_uk UNIQUE (int_nombre);
ALTER TABLE consultas_analiticas
 ALTER COLUMN pre_id SET NOT NULL,
 ADD CONSTRAINT consulta_pregunta_uk UNIQUE (pre_id),
 ADD COLUMN ca_validacion TEXT NOT NULL DEFAULT 'pendiente'
   CHECK (ca_validacion IN ('pendiente', 'aprobada', 'fallida'));
ALTER TABLE fuentes_datos ALTER COLUMN ca_id SET NOT NULL;
ALTER TABLE reglas_validaciones ALTER COLUMN ca_id SET NOT NULL;

DO $$ BEGIN
 IF to_regclass('reglas_repuesta') IS NOT NULL AND to_regclass('reglas_respuesta') IS NULL THEN
   ALTER TABLE reglas_repuesta RENAME TO reglas_respuesta;
 END IF;
END $$;
ALTER TABLE reglas_seguridad ADD PRIMARY KEY (rv_id),
 ADD FOREIGN KEY (ca_id) REFERENCES consultas_analiticas(ca_id);
ALTER TABLE reglas_sintaxis ADD PRIMARY KEY (rv_id),
 ADD FOREIGN KEY (ca_id) REFERENCES consultas_analiticas(ca_id);
ALTER TABLE reglas_respuesta ADD PRIMARY KEY (rv_id),
 ADD FOREIGN KEY (ca_id) REFERENCES consultas_analiticas(ca_id);
ALTER TABLE resultados_consultas ALTER COLUMN ca_id SET NOT NULL,
 ADD CONSTRAINT resultado_consulta_uk UNIQUE (ca_id);
ALTER TABLE respuestas_agente ALTER COLUMN rc_id SET NOT NULL,
 ADD CONSTRAINT respuesta_resultado_uk UNIQUE (rc_id);

CREATE FUNCTION comprobar_cadena_bdoo() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE consulta INT;
BEGIN
 IF TG_TABLE_NAME IN ('consultas_analiticas', 'resultados_consultas') THEN
   consulta := COALESCE(NEW.ca_id, OLD.ca_id);
 ELSE
   SELECT ca_id INTO consulta FROM resultados_consultas WHERE rc_id = COALESCE(NEW.rc_id, OLD.rc_id);
 END IF;
 IF EXISTS (SELECT 1 FROM consultas_analiticas WHERE ca_id = consulta AND ca_validacion = 'aprobada')
 AND NOT EXISTS (SELECT 1 FROM resultados_consultas r JOIN respuestas_agente a USING (rc_id) WHERE r.ca_id = consulta) THEN
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

UPDATE consultas_analiticas c SET ca_validacion = 'aprobada'
 WHERE EXISTS (SELECT 1 FROM resultados_consultas r JOIN respuestas_agente a USING (rc_id) WHERE r.ca_id = c.ca_id);
INSERT INTO intenciones (int_nombre) VALUES
 ('analizar_ventas'), ('analizar_rentabilidad'), ('comparar_rentabilidad'), ('identificar_producto_mas_vendido')
 ON CONFLICT (int_nombre) DO NOTHING;
COMMIT;
