-- Firma de las marcaciones sin conexión con una clave del celular que no se puede copiar (Android Keystore / iOS Secure Enclave).
--
-- El problema: una marcación hecha sin internet se guarda en el celular hasta que vuelve la señal. Quien tiene el celular con
-- root o modo desarrollador puede abrir esa base y cambiar la hora, la ubicación o la foto antes de que se envíe.
--
-- La solución (docs/logica-negocio.md, «Firma de la marcación sin conexión»): al vincular el celular, la app crea un par de
-- claves DENTRO del chip de seguridad del teléfono (la clave privada no sale de ahí ni con root) y registra la clave PÚBLICA
-- aquí. Cada marcación sin conexión se firma al hacerla; el servidor comprueba la firma al recibirla. Cualquier cambio a lo
-- guardado la invalida.
--
--   usuarios.clave_publica        clave pública del celular vinculado (P-256, formato SPKI en base64). Null si no hay.
--   usuarios.clave_evidencia      lo que se pudo comprobar de esa clave al registrarla (plataforma, si la protege el hardware,
--                                 si el celular arrancó con el sistema original). Es evidencia, no un permiso.
--   usuarios.clave_registrada_at  cuándo se registró.
--   marcaciones.firmada           true si la marcación llegó con una firma válida de la clave registrada.
--   marcaciones.firma             la firma recibida (queda como prueba junto a la marcación).
--
-- Reiniciar el celular desde el panel (Administrador) borra también la clave: el celular nuevo registra la suya.
-- Es seguro correrla más de una vez.

alter table usuarios
  add column if not exists clave_publica       text,
  add column if not exists clave_evidencia     jsonb,
  add column if not exists clave_registrada_at timestamptz;

-- Una clave pertenece a una sola cuenta: si dos cuentas tuvieran la misma, una firma valdría para las dos.
create unique index if not exists usuarios_clave_publica_unica on usuarios (clave_publica)
  where clave_publica is not null;

alter table usuarios drop constraint if exists clave_evidencia_con_clave;
alter table usuarios
  add constraint clave_evidencia_con_clave check (clave_publica is not null or (clave_evidencia is null and clave_registrada_at is null));

alter table marcaciones
  add column if not exists firmada boolean not null default false,
  add column if not exists firma   text;

alter table marcaciones drop constraint if exists firma_solo_sin_conexion;
alter table marcaciones
  add constraint firma_solo_sin_conexion check (sin_conexion or (not firmada and firma is null));

comment on column usuarios.clave_publica is
  'Clave pública (P-256, SPKI en base64) del celular vinculado; la privada vive en el chip de seguridad del celular';
comment on column usuarios.clave_evidencia is
  'Qué se comprobó de la clave al registrarla: plataforma, nivel de seguridad (strongbox/tee/software/sin_prueba) y arranque verificado';
comment on column marcaciones.firmada is
  'true si la marcación sin conexión llegó con una firma válida de la clave del celular vinculado';
comment on column marcaciones.firma is
  'Firma ECDSA (DER en base64) recibida con la marcación sin conexión';
