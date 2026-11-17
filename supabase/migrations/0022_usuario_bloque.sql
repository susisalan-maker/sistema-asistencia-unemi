-- 0022: bloque asignado (opcional) a cada usuario.
-- NULL = sin restricción (comportamiento de siempre: vale cualquier bloque activo de su sede o, si la sede no tiene
-- bloques, el círculo de la sede). Con valor, la persona solo puede marcar dentro de ese bloque.

alter table public.usuarios
  add column if not exists bloque_id uuid references public.bloques(id) on delete set null;

comment on column public.usuarios.bloque_id is
  'Bloque único donde la persona puede marcar. NULL = cualquier bloque activo de su sede.';

create or replace function public.usuarios_validar_bloque()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.bloque_id is null then
    return new;
  end if;
  -- Si cambió la sede o el rol dejó de ser «usuario», el bloque anterior ya no aplica.
  if tg_op = 'UPDATE' and (new.sede_id is distinct from old.sede_id or new.rol <> 'usuario')
     and new.bloque_id is not distinct from old.bloque_id then
    new.bloque_id := null;
    return new;
  end if;
  if new.rol <> 'usuario' then
    raise exception 'Solo un usuario con rol usuario puede tener un bloque asignado';
  end if;
  if not exists (select 1 from public.bloques b where b.id = new.bloque_id and b.sede_id = new.sede_id) then
    raise exception 'El bloque debe pertenecer a la sede de la persona';
  end if;
  return new;
end;
$$;

drop trigger if exists usuarios_validar_bloque on public.usuarios;
create trigger usuarios_validar_bloque
  before insert or update of bloque_id, sede_id, rol on public.usuarios
  for each row execute function public.usuarios_validar_bloque();
