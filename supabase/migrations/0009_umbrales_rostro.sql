-- Umbrales del reconocimiento facial, editables desde el panel (Configuración → Reconocimiento facial).
--
-- Hasta ahora vivían en el servidor (variables de entorno) o fijos en el código. Ahora son columnas de la fila única
-- de `configuracion`: el microservicio las lee en cada marcación y en cada registro de rostro, así que un cambio
-- se aplica de inmediato, sin reiniciar nada. Cada cambio queda en la bitácora (trigger configuracion_bitacora).
--
-- Los valores por defecto son los que ya usaba el sistema. Si ya habías cambiado ROSTRO_UMBRAL, ROSTRO_UMBRAL_REGISTRO
-- o VIDA_UMBRAL en el .env, ajusta aquí el valor desde el panel: lo que está en la base manda sobre el .env.
--
--   Parecido del rostro
--     rostro_umbral            similitud mínima (0 a 1) entre la selfie y el rostro registrado para dar por buena la marcación
--     rostro_umbral_registro   similitud mínima entre las fotos del registro para aceptar que son de la misma persona
--   Detección de vida
--     vida_umbral              probabilidad mínima (0 a 1) de «rostro real» (la detección se enciende con VIDA_ACTIVA en el servidor)
--   Giro de la cabeza (0 = de frente; cerca de 0.5 = de perfil)
--     giro_max_registro_frente giro máximo de la primera foto del registro (de frente)
--     giro_max_registro_leve   giro máximo de las fotos 2 en adelante («giros leves»)
--     giro_max_marcacion       giro máximo de la selfie al marcar
--   Calidad de la foto
--     brillo_min, brillo_max   luz promedio del rostro (0 a 255)
--     nitidez_min              nitidez mínima (varianza del laplaciano del recorte de 112×112)
--     rostro_min_px            lado menor mínimo de la caja del rostro, en la foto original
--     foto_min_px              lado menor mínimo de la foto
--
-- Es seguro correrla más de una vez.

alter table configuracion
  add column if not exists rostro_umbral          numeric(4,3) not null default 0.400 check (rostro_umbral between 0.100 and 0.950),
  add column if not exists rostro_umbral_registro numeric(4,3) not null default 0.350 check (rostro_umbral_registro between 0.100 and 0.950),
  add column if not exists vida_umbral            numeric(4,3) not null default 0.500 check (vida_umbral between 0.050 and 0.990),
  add column if not exists giro_max_registro_frente numeric(4,3) not null default 0.300 check (giro_max_registro_frente between 0.050 and 1.000),
  add column if not exists giro_max_registro_leve   numeric(4,3) not null default 0.600 check (giro_max_registro_leve between 0.050 and 1.000),
  add column if not exists giro_max_marcacion       numeric(4,3) not null default 0.400 check (giro_max_marcacion between 0.050 and 1.000),
  add column if not exists brillo_min     integer not null default 50  check (brillo_min between 0 and 254),
  add column if not exists brillo_max     integer not null default 215 check (brillo_max between 1 and 255),
  add column if not exists nitidez_min    integer not null default 40  check (nitidez_min between 1 and 1000),
  add column if not exists rostro_min_px  integer not null default 90  check (rostro_min_px between 40 and 600),
  add column if not exists foto_min_px    integer not null default 200 check (foto_min_px between 100 and 2000);

alter table configuracion drop constraint if exists configuracion_brillo_orden_check;
alter table configuracion
  add constraint configuracion_brillo_orden_check check (brillo_min < brillo_max);
