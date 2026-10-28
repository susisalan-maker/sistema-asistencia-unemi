-- Precisión mínima de la ubicación para poder marcar.
--
-- El GPS de un celular (o el navegador de un computador) no solo da una posición: también informa cuánto se puede equivocar
-- («±12 m»). Si esa incertidumbre es muy grande, «estar dentro de la zona» no significa nada. Estos dos parámetros fijan hasta
-- cuántos metros de incertidumbre se acepta para registrar una marcación; si el equipo informa más, el servidor la rechaza
-- (código `precision_insuficiente`) y le dice a la persona que se acerque a una ventana o a un lugar abierto y reintente.
--
--   configuracion.precision_max_app_m   límite para marcar desde la app del celular (GPS del celular).   Por omisión 50 m.
--   configuracion.precision_max_web_m   límite para marcar desde la web (ubicación del navegador, casi siempre de un
--                                       computador sin GPS, por eso es más holgado).                    Por omisión 200 m.
--
-- Los valores por omisión son PROVISIONALES: no hay un número oficial. Se calibran con mediciones reales en cada sede
-- (ver docs/calibracion-precision-gps.md). Se editan en el panel (Configuración → Parámetros → Seguridad de la marcación)
-- y cada cambio queda en la bitácora (trigger configuracion_bitacora).
--
-- Solo se aplica a marcaciones hechas con conexión: la marcación sin conexión se hizo cuando la persona ya no está para repetir.
-- Es seguro correrla más de una vez.

alter table configuracion
  add column if not exists precision_max_app_m smallint not null default 50
    check (precision_max_app_m between 5 and 500),
  add column if not exists precision_max_web_m smallint not null default 200
    check (precision_max_web_m between 10 and 2000);

comment on column configuracion.precision_max_app_m is
  'Incertidumbre máxima (± metros) de la ubicación para marcar desde la app (5 a 500); más que eso se rechaza';
comment on column configuracion.precision_max_web_m is
  'Incertidumbre máxima (± metros) de la ubicación para marcar desde la web (10 a 2000); más que eso se rechaza';
