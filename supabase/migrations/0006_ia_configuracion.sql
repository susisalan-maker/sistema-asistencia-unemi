-- IA del chat de justificación configurable desde el panel (Configuración → Inteligencia artificial).
--
--  * configuracion.ia_proveedor: qué proveedor responde (gemini o anthropic).
--  * configuracion.modelo_ia: el modelo. Vacío (null) = el modelo recomendado del proveedor. Antes tenía por defecto
--    'gpt-4.1-mini', que no corresponde a ningún proveedor del sistema y nunca se usó.
--  * ia_llaves: la llave de API de cada proveedor, CIFRADA por el microservicio (AES-256-GCM). Solo el microservicio
--    (service_role) puede leerla o escribirla: la tabla tiene RLS activado y ninguna política, y el panel nunca la
--    consulta. Si no hay llave aquí, el microservicio usa la del servidor (.env).
--
-- Es seguro correrla más de una vez.

alter table configuracion
  add column if not exists ia_proveedor text not null default 'gemini';
alter table configuracion drop constraint if exists configuracion_ia_proveedor_check;
alter table configuracion
  add constraint configuracion_ia_proveedor_check check (ia_proveedor in ('gemini', 'anthropic'));

alter table configuracion alter column modelo_ia drop not null;
alter table configuracion alter column modelo_ia drop default;
update configuracion set modelo_ia = null where modelo_ia = 'gpt-4.1-mini';
alter table configuracion drop constraint if exists configuracion_modelo_ia_check;
alter table configuracion
  add constraint configuracion_modelo_ia_check check (modelo_ia is null or char_length(btrim(modelo_ia)) between 1 and 80);

create table if not exists ia_llaves (
  id            uuid primary key default gen_random_uuid(),
  proveedor     text not null unique check (proveedor in ('gemini', 'anthropic')),
  llave_cifrada bytea not null,                        -- nonce (12 bytes) || texto cifrado || etiqueta (16 bytes)
  version_clave smallint not null,                     -- versión de la clave de cifrado del servidor
  ultimos_4     text not null check (char_length(ultimos_4) = 4),   -- solo para mostrar «termina en …1234»
  created_at    timestamptz not null default now(),
  created_by    uuid references usuarios (id),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references usuarios (id)
);
alter table ia_llaves enable row level security;       -- sin políticas: solo el service_role entra
revoke all on ia_llaves from anon, authenticated;
