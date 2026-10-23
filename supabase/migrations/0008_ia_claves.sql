-- Claves de IA con nombre: cada fila es una configuración completa (proveedor + modelo + llave de API cifrada) y UNA
-- sola está activa: la que responde en el chat de justificación. Reemplaza a ia_llaves (una fila por proveedor), de la
-- que copia lo que hubiera.
--
--  * Se pueden tener varias claves del mismo proveedor («Producción», «Pruebas»…).
--  * Un índice único parcial garantiza que nunca haya dos activas.
--  * La llave va cifrada por el microservicio (AES-256-GCM, contexto = proveedor, que no cambia tras crearla); solo el
--    service_role puede leer o escribir la tabla (RLS sin políticas, sin permisos para anon ni authenticated).
--  * ia_activar_clave cambia la activa en una sola transacción: nunca queda el sistema sin ninguna por un fallo a medias.
--  * configuracion.ia_proveedor y configuracion.modelo_ia ya no se usan (la activa se lee de ia_claves).
--
-- Es seguro correrla más de una vez.

create table if not exists ia_claves (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null check (char_length(btrim(nombre)) between 1 and 60),
  proveedor     text not null check (proveedor in ('gemini', 'anthropic', 'openai')),
  modelo        text check (modelo is null or char_length(btrim(modelo)) between 1 and 80),   -- null = el recomendado del proveedor
  llave_cifrada bytea not null,                         -- nonce (12 bytes) || texto cifrado || etiqueta (16 bytes)
  version_clave smallint not null,                      -- versión de la clave de cifrado del servidor
  ultimos_4     text not null check (char_length(ultimos_4) = 4),   -- solo para mostrar «termina en …1234»
  activa        boolean not null default false,
  created_at    timestamptz not null default now(),
  created_by    uuid references usuarios (id),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references usuarios (id)
);
create unique index if not exists ia_claves_una_activa on ia_claves (activa) where activa;
create unique index if not exists ia_claves_nombre_unico on ia_claves (lower(btrim(nombre)));
alter table ia_claves enable row level security;        -- sin políticas: solo el service_role entra
revoke all on ia_claves from anon, authenticated;

-- Lo que había en ia_llaves (solo las filas con llave) pasa a ia_claves; queda activa la del proveedor que estaba activo.
do $$
begin
  if to_regclass('public.ia_llaves') is not null then
    insert into ia_claves (nombre, proveedor, modelo, llave_cifrada, version_clave, ultimos_4, activa, created_by, updated_by)
    select case l.proveedor when 'gemini' then 'Gemini' when 'anthropic' then 'Claude' else 'OpenAI' end,
           l.proveedor, l.modelo, l.llave_cifrada, l.version_clave, l.ultimos_4,
           l.proveedor = coalesce((select c.ia_proveedor from configuracion c where c.id = 1), ''),
           l.created_by, l.updated_by
    from ia_llaves l
    where l.llave_cifrada is not null
    on conflict do nothing;
    drop table ia_llaves;
  end if;
end $$;

-- Deja activa a una clave y desactiva la que lo estuviera, en una sola transacción.
create or replace function ia_activar_clave(p_id uuid, p_usuario uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from ia_claves where id = p_id) then
    raise exception 'La clave no existe' using errcode = 'P0002';
  end if;
  update ia_claves set activa = false, updated_at = now(), updated_by = p_usuario where activa and id <> p_id;
  update ia_claves set activa = true, updated_at = now(), updated_by = p_usuario where id = p_id and not activa;
end $$;
revoke all on function ia_activar_clave(uuid, uuid) from public, anon, authenticated;
grant execute on function ia_activar_clave(uuid, uuid) to service_role;
