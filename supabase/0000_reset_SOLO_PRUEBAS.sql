-- =====================================================================
-- 0000_reset.sql · BORRA las tablas del esquema anterior para poder ejecutar 0001_init.sql
-- ⚠ DESTRUCTIVO: elimina los datos de estas tablas. Úsalo solo en un proyecto de pruebas.
-- No toca el esquema auth (los usuarios de Authentication se conservan).
-- =====================================================================
drop view if exists v_anomalias_detalle;

drop table if exists bitacora         cascade;
drop table if exists mensajes_chat    cascade;
drop table if exists justificaciones  cascade;
drop table if exists anomalias        cascade;
drop table if exists marcaciones      cascade;
drop table if exists rostros          cascade;
drop table if exists bloques          cascade;
drop table if exists configuracion    cascade;
drop table if exists usuarios         cascade;
drop table if exists sedes            cascade;

drop type if exists evento_bitacora            cascade;
drop type if exists emisor_mensaje             cascade;
drop type if exists decision_caso              cascade;
drop type if exists clasificacion_justificacion cascade;
drop type if exists estado_anomalia            cascade;
drop type if exists detector_anomalia          cascade;
drop type if exists tipo_anomalia              cascade;
drop type if exists verificacion_rostro        cascade;
drop type if exists motivo_contingencia        cascade;
drop type if exists origen_marcacion           cascade;
drop type if exists tipo_marcacion             cascade;
drop type if exists rol_usuario                cascade;

drop function if exists es_administrador()        cascade;
drop function if exists decidir_anomalia(uuid, decision_caso, text) cascade;
drop function if exists marcar_sin_justificar()   cascade;
drop function if exists registrar_rostro(uuid, bytea, smallint, timestamptz) cascade;
drop function if exists resetear_rostro(uuid)     cascade;
drop function if exists usuarios_borrar_rostro()  cascade;
drop function if exists marcaciones_inmutable()   cascade;
drop function if exists anomalias_vence_default() cascade;        -- nombre de la versión anterior
drop function if exists anomalias_asignar_vencimiento() cascade;
drop function if exists asignar_auditoria()       cascade;
drop function if exists bitacora_inmutable()      cascade;
drop function if exists bitacora_registrar()      cascade;
