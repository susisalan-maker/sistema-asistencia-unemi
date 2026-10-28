-- Marcación sin conexión (app Android): la persona marca sin internet y la app envía la marcación cuando vuelve la señal.
--
--   marcaciones.sin_conexion
--     true cuando la marcación se hizo sin internet y se envió después. En ese caso `fecha_hora` es la hora que
--     tenía el celular al marcar (el servidor la valida: no puede ser futura, ni más antigua que el máximo
--     permitido, ni anterior a otra marcación ya registrada) y `created_at` sigue siendo la hora en que llegó
--     al servidor, así que la diferencia entre ambas queda como evidencia. En las marcaciones normales
--     `fecha_hora` es la hora del servidor.
--
--   configuracion.max_horas_sin_conexion
--     Cuántas horas puede tardar en llegar una marcación hecha sin conexión. Pasado ese tiempo el servidor la rechaza
--     y la persona debe justificar desde Avisos. Se edita en el panel (Configuración → Parámetros → Seguridad de la
--     marcación) y cada cambio queda en la bitácora (trigger configuracion_bitacora).
--
-- Es seguro correrla más de una vez.

alter table marcaciones
  add column if not exists sin_conexion boolean not null default false;

alter table marcaciones drop constraint if exists sin_conexion_solo_app;
alter table marcaciones
  add constraint sin_conexion_solo_app check (origen = 'app' or not sin_conexion);

comment on column marcaciones.fecha_hora is
  'Momento de la marcación: la hora del servidor o, si sin_conexion es true, la hora del celular validada por el servidor';
comment on column marcaciones.sin_conexion is
  'true si se hizo sin internet y se envió después (la hora es la del celular; created_at es la de llegada)';

alter table configuracion
  add column if not exists max_horas_sin_conexion smallint not null default 48
    check (max_horas_sin_conexion between 1 and 168);

comment on column configuracion.max_horas_sin_conexion is
  'Horas máximas que puede tardar en llegar una marcación hecha sin conexión (1 a 168)';
