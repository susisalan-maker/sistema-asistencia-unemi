-- 0020: Auditoría por acciones: cada acción (que la bitácora guarda como un cambio por fila) se muestra como una sola fila,
-- con búsqueda por nombre, atajos de un toque y exportación a Excel con constancia.
--
--   auditoria_acciones()              solo el administrador; agrupa los cambios hechos en un mismo instante, por la misma
--                                     persona, sobre el mismo registro (así los guarda el trigger: una fila por dato) y
--                                     devuelve una página de acciones, los totales y cuántas acciones tiene cada atajo.
--   registrar_exportacion_auditoria() deja constancia de que alguien descargó la bitácora (entidad `auditoria`).
--
-- No cambia ningún dato ni la bitácora misma, que sigue siendo inmutable.

create or replace function auditoria_acciones(
  p_desde         timestamptz,
  p_hasta         timestamptz,
  p_evento        text    default null,   -- un valor de evento_bitacora
  p_entidad       text    default null,   -- nombre de la tabla afectada
  p_por           text    default null,   -- null = cualquiera, 'sistema' o el id de un administrador
  p_grupo         text    default null,   -- atajo: configuracion | personas_sedes | rostros_celulares | decisiones | exportaciones | sistema
  p_buscar        text    default null,   -- palabras del nombre de la persona, sede o caso afectado, o de quien lo hizo
  p_limite        integer default 20,
  p_desplazamiento integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_buscar    text;
  v_palabras  text[];
  v_limite    integer := least(greatest(coalesce(p_limite, 20), 1), 5000);
  v_desde     integer := greatest(coalesce(p_desplazamiento, 0), 0);
  v_resultado jsonb;
begin
  if not es_administrador() then
    raise exception 'Solo un administrador puede ver la auditoría';
  end if;
  if p_desde is null or p_hasta is null or p_hasta <= p_desde then
    raise exception 'El periodo no es válido';
  end if;
  if p_grupo is not null and p_grupo <> ''
     and p_grupo not in ('configuracion', 'personas_sedes', 'rostros_celulares', 'decisiones', 'exportaciones', 'sistema') then
    raise exception 'El atajo no es válido';
  end if;
  if p_por is not null and p_por <> '' and p_por <> 'sistema'
     and p_por !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'La persona no es válida';
  end if;

  -- Búsqueda sin mayúsculas ni tildes; cada palabra tiene que aparecer (en cualquier orden).
  v_buscar := nullif(btrim(translate(lower(left(coalesce(p_buscar, ''), 80)), 'áéíóúüñ', 'aeiouun')), '');
  v_palabras := case when v_buscar is null then null else regexp_split_to_array(v_buscar, '\s+') end;

  with filas as (
    select b.id, b.created_at, b.usuario_id, b.evento, b.entidad, b.entidad_id, b.campo, b.valor_anterior, b.valor_nuevo, b.motivo,
           translate(lower(concat_ws(' ',
             case b.entidad
               when 'sedes'     then (select x.nombre from sedes x where x.id::text = b.entidad_id)
               when 'bloques'   then (select x.nombre from bloques x where x.id::text = b.entidad_id)
               when 'feriados'  then (select x.nombre from feriados x where x.id::text = b.entidad_id)
               when 'usuarios'  then (select x.nombres || ' ' || x.apellidos from usuarios x where x.id::text = b.entidad_id)
               when 'anomalias' then (select 'a-' || a.numero || ' ' || u.nombres || ' ' || u.apellidos
                                        from anomalias a join usuarios u on u.id = a.usuario_id where a.id::text = b.entidad_id)
             end,
             (select x.nombres || ' ' || x.apellidos from usuarios x where x.id = b.usuario_id)
           )), 'áéíóúüñ', 'aeiouun') as texto
      from bitacora b
     where b.created_at >= p_desde and b.created_at < p_hasta
       and (p_evento is null or p_evento = '' or b.evento = p_evento::evento_bitacora)
       and (p_entidad is null or p_entidad = '' or b.entidad = p_entidad)
       and (p_por is null or p_por = ''
            or (p_por = 'sistema' and b.usuario_id is null)
            or (p_por <> 'sistema' and b.usuario_id = p_por::uuid))
  ),
  buscadas as (
    select * from filas f
     where v_palabras is null
        or not exists (select 1 from unnest(v_palabras) w where position(w in f.texto) = 0)
  ),
  acciones as (
    select (array_agg(f.id order by f.id))[1] as id,
           f.created_at, f.usuario_id, f.entidad, f.entidad_id,
           -- Si en la misma acción hubo un cambio más específico que «actualizar» (activar, resetear rostro…), ese es el evento.
           coalesce((array_agg(f.evento order by f.id) filter (where f.evento <> 'actualizar'))[1]::text, 'actualizar') as evento,
           case
             when f.usuario_id is null then 'sistema'
             when bool_or(f.evento in ('registrar_rostro', 'resetear_rostro', 'resetear_dispositivo')) then 'rostros_celulares'
             when f.entidad in ('configuracion', 'ia_claves') then 'configuracion'
             when f.entidad = 'anomalias' then 'decisiones'
             when f.entidad in ('reportes', 'auditoria') then 'exportaciones'
             when f.entidad in ('usuarios', 'sedes', 'bloques', 'feriados') then 'personas_sedes'
             else 'otros'
           end as grupo,
           (array_agg(f.motivo) filter (where f.motivo is not null))[1] as motivo,
           count(*) filter (where f.campo is not null and f.evento <> 'exportar_reporte') as datos,
           jsonb_agg(jsonb_build_object('id', f.id, 'evento', f.evento, 'campo', f.campo, 'valor_anterior', f.valor_anterior,
                                         'valor_nuevo', f.valor_nuevo, 'motivo', f.motivo)
                     order by f.campo nulls first, f.id) as cambios
      from buscadas f
     group by f.created_at, f.usuario_id, f.entidad, f.entidad_id
  ),
  elegidas as (
    select * from acciones a where p_grupo is null or p_grupo = '' or a.grupo = p_grupo
  ),
  pagina as (
    select a.*, (select jsonb_build_object('nombres', u.nombres, 'apellidos', u.apellidos) from usuarios u where u.id = a.usuario_id) as autor
      from elegidas a
     order by a.created_at desc, a.id desc
     limit v_limite offset v_desde
  )
  select jsonb_build_object(
    'total',   (select count(*) from elegidas),
    'datos',   (select coalesce(sum(datos), 0) from elegidas),
    -- Filas que tendría un Excel «una fila por dato»: una por dato cambiado y una para la acción que no cambió ningún dato.
    'filas',   (select coalesce(sum(greatest(datos, 1)), 0) from elegidas),
    'conteos', (select jsonb_build_object(
                  'todo',              count(*),
                  'configuracion',     count(*) filter (where grupo = 'configuracion'),
                  'personas_sedes',    count(*) filter (where grupo = 'personas_sedes'),
                  'rostros_celulares', count(*) filter (where grupo = 'rostros_celulares'),
                  'decisiones',        count(*) filter (where grupo = 'decisiones'),
                  'exportaciones',     count(*) filter (where grupo = 'exportaciones'),
                  'sistema',           count(*) filter (where grupo = 'sistema'))
                from acciones),
    'acciones', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', p.id, 'created_at', p.created_at, 'usuario_id', p.usuario_id, 'autor', p.autor,
                  'entidad', p.entidad, 'entidad_id', p.entidad_id, 'evento', p.evento, 'grupo', p.grupo,
                  'motivo', p.motivo, 'datos', p.datos, 'cambios', p.cambios) order by p.created_at desc, p.id desc) from pagina p), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end $$;

revoke execute on function auditoria_acciones(timestamptz, timestamptz, text, text, text, text, text, integer, integer) from public, anon;
grant execute on function auditoria_acciones(timestamptz, timestamptz, text, text, text, text, text, integer, integer) to authenticated;


-- Constancia de que alguien descargó la bitácora (no guarda su contenido, solo los datos de la descarga).
create or replace function registrar_exportacion_auditoria(
  p_desde  timestamptz,
  p_hasta  timestamptz,
  p_filas  integer,
  p_detalle text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_administrador() then
    raise exception 'Solo un administrador puede exportar la auditoría';
  end if;
  if p_desde is null or p_hasta is null or p_hasta <= p_desde then
    raise exception 'El periodo de la exportación no es válido';
  end if;

  insert into bitacora (usuario_id, evento, entidad, entidad_id, campo, valor_nuevo, motivo)
  values (
    auth.uid(), 'exportar_reporte', 'auditoria',
    to_char(p_desde at time zone 'America/Guayaquil', 'YYYY-MM-DD') || ' a ' || to_char((p_hasta - interval '1 second') at time zone 'America/Guayaquil', 'YYYY-MM-DD'),
    'xlsx',
    greatest(coalesce(p_filas, 0), 0)::text || ' filas',
    nullif(left(btrim(coalesce(p_detalle, '')), 300), '')
  );
end $$;

revoke execute on function registrar_exportacion_auditoria(timestamptz, timestamptz, integer, text) from public, anon;
grant execute on function registrar_exportacion_auditoria(timestamptz, timestamptz, integer, text) to authenticated;
