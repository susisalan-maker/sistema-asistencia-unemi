-- Dashboard «en vivo» (docs/logica-negocio.md, sección 9): lo que pasa HOY y lo que necesita atención.
--
--   estado_hoy(sede, ahora)   el estado de cada persona que debe marcar hoy, resumido: cuántas hay en cada estado,
--                             el desglose por sede y quiénes no han marcado su ingreso.
--   atencion_hoy(ahora)       lo que espera una decisión o una revisión del administrador.
--   reporte_anomalias(...)    la misma función de números de 0015, con tres datos más para el Dashboard:
--                             tiempo medio de resolución, coincidencia IA–persona y rechazo facial.
--   Realtime                  `marcaciones` y `anomalias` se publican para que el panel se entere de una marcación nueva.
--
-- Todo es SOLO LECTURA, security invoker y solo para el administrador (las políticas RLS siguen valiendo).
-- `p_ahora` existe para poder probar la función en otro momento; el panel nunca lo envía.
--
-- Estados de una persona hoy (se calculan con sus marcaciones de HOY en hora de Ecuador, su jornada y los feriados):
--   salio         marcó su salida.
--   en_almuerzo   su última marcación de hoy fue «salida_almuerzo».
--   en_jornada    marcó algo hoy y no ha salido ni está de almuerzo.
--   sin_ingreso   no ha marcado nada y ya pasó su hora de ingreso más la tolerancia.
--   por_llegar    no ha marcado nada y todavía no es su hora (o está dentro de la tolerancia).
-- Deben marcar hoy quienes son usuarios activos con sede, hoy es un día laborable suyo y no es feriado. Quien marca un día
-- en que no debía (un sábado, por ejemplo) también se cuenta: lo que marcó se muestra tal cual.
-- La aplicación NO sabe si alguien faltó con permiso, de vacaciones o enfermo: solo que no ha marcado.

create or replace function estado_hoy(
  p_sede  uuid default null,
  p_ahora timestamptz default now()
) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_zona    constant text := 'America/Guayaquil';
  v_hoy     date        := (p_ahora at time zone v_zona)::date;
  v_ini     timestamptz := v_hoy::timestamp at time zone v_zona;
  v_fin     timestamptz := (v_hoy + 1)::timestamp at time zone v_zona;
  v_dow     smallint    := extract(isodow from v_hoy)::smallint;
  v_tol     integer;
  v_feriado text;
  v_res     jsonb;
begin
  if not es_administrador() then
    raise exception 'Solo un administrador puede ver el estado de hoy';
  end if;

  select tolerancia_min into v_tol from configuracion where id = 1;
  v_tol := coalesce(v_tol, 10);
  select nombre into v_feriado from feriados where activo and v_hoy between fecha_inicio and fecha_fin limit 1;

  with marcas as (
    select m.usuario_id,
           count(*) as n,
           bool_or(m.tipo = 'salida') as salio,
           (array_agg(m.tipo order by m.fecha_hora desc, m.created_at desc))[1] as ultimo_tipo
      from marcaciones m
     where m.fecha_hora >= v_ini and m.fecha_hora < v_fin
     group by m.usuario_id
  ),
  estados as (
    select u.id, u.nombres, u.apellidos, u.sede_id, u.jornada_inicio,
           (v_hoy + u.jornada_inicio)::timestamp at time zone v_zona as inicio,
           case
             when ma.salio then 'salio'
             when ma.n is not null and ma.ultimo_tipo = 'salida_almuerzo' then 'en_almuerzo'
             when ma.n is not null then 'en_jornada'
             when p_ahora >= (v_hoy + u.jornada_inicio)::timestamp at time zone v_zona + make_interval(mins => v_tol) then 'sin_ingreso'
             else 'por_llegar'
           end as estado
      from usuarios u
      left join marcas ma on ma.usuario_id = u.id
     where u.rol = 'usuario' and u.activo and u.sede_id is not null
       and (p_sede is null or u.sede_id = p_sede)
       and (ma.n is not null or (v_feriado is null and v_dow = any (u.dias_laborables)))
  )
  select jsonb_build_object(
    'ahora', p_ahora,
    'hoy', to_char(v_hoy, 'YYYY-MM-DD'),
    'feriado', v_feriado,
    'esperadas', (select count(*) from estados),
    'por_estado', jsonb_build_object(
      'por_llegar',  (select count(*) from estados where estado = 'por_llegar'),
      'en_jornada',  (select count(*) from estados where estado = 'en_jornada'),
      'en_almuerzo', (select count(*) from estados where estado = 'en_almuerzo'),
      'salio',       (select count(*) from estados where estado = 'salio'),
      'sin_ingreso', (select count(*) from estados where estado = 'sin_ingreso')
    ),
    'por_sede', coalesce((
      select jsonb_agg(jsonb_build_object(
               'sede_id', t.sede_id, 'sede', s.nombre, 'esperadas', t.esperadas, 'presentes', t.presentes,
               'salieron', t.salieron, 'por_llegar', t.por_llegar, 'sin_ingreso', t.sin_ingreso) order by s.nombre)
        from (
          select sede_id, count(*) as esperadas,
                 count(*) filter (where estado in ('en_jornada', 'en_almuerzo')) as presentes,
                 count(*) filter (where estado = 'salio') as salieron,
                 count(*) filter (where estado = 'por_llegar') as por_llegar,
                 count(*) filter (where estado = 'sin_ingreso') as sin_ingreso
            from estados group by sede_id
        ) t join sedes s on s.id = t.sede_id
    ), '[]'::jsonb),
    'faltan', coalesce((
      select jsonb_agg(jsonb_build_object(
               'usuario_id', f.id,
               'nombre', btrim(f.nombres || ' ' || f.apellidos),
               'sede', f.sede,
               'jornada_inicio', to_char(f.jornada_inicio, 'HH24:MI'),
               'minutos_retraso', floor(extract(epoch from (p_ahora - f.inicio)) / 60)::int,
               'ultima', case when f.u_tipo is null then null
                              else jsonb_build_object('tipo', f.u_tipo, 'fecha_hora', f.u_fecha) end
             ) order by f.inicio, f.nombres, f.apellidos)
        from (
          select e.*, s.nombre as sede, ult.tipo as u_tipo, ult.fecha_hora as u_fecha
            from estados e
            left join sedes s on s.id = e.sede_id
            left join lateral (
              select m.tipo, m.fecha_hora from marcaciones m
               where m.usuario_id = e.id and m.fecha_hora < p_ahora
               order by m.fecha_hora desc limit 1
            ) ult on true
           where e.estado = 'sin_ingreso'
           order by e.inicio, e.nombres, e.apellidos
           limit 50
        ) f
    ), '[]'::jsonb)
  ) into v_res;

  return v_res;
end $$;

revoke execute on function estado_hoy(uuid, timestamptz) from public, anon;
grant execute on function estado_hoy(uuid, timestamptz) to authenticated;

-- Lo que necesita al administrador.
--   revision      casos «en revisión» y cuántos ya pasaron el plazo de revisión (`plazo_revision_h`) o lo pasan en menos de 6 h.
--                 El plazo corre desde el último mensaje de la persona (cuando el caso llegó a la bandeja).
--   sin_justificar  casos cuyo plazo venció sin justificar: los decide el administrador.
--   sospechosas   casos en revisión que la IA clasificó como «sospechosa». La IA solo sugiere: decide una persona.
--   rostro        personas con 3 o más verificaciones faciales fallidas en los últimos 7 días (hasta 5, las de más intentos).
--   sin_celular   usuarios activos con sede que todavía no vinculan su celular.
create or replace function atencion_hoy(p_ahora timestamptz default now())
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_plazo integer;
  v_res   jsonb;
begin
  if not es_administrador() then
    raise exception 'Solo un administrador puede ver lo que requiere atención';
  end if;
  select plazo_revision_h into v_plazo from configuracion where id = 1;
  v_plazo := coalesce(v_plazo, 48);

  with en_rev as (
    select a.id,
           coalesce(
             (select max(mc.created_at) from mensajes_chat mc where mc.justificacion_id = j.id),
             j.created_at
           ) + make_interval(hours => v_plazo) as limite,
           j.clasificacion_ia
      from anomalias a
      left join justificaciones j on j.anomalia_id = a.id
     where a.estado = 'en_revision'
  )
  select jsonb_build_object(
    'plazo_revision_h', v_plazo,
    'revision', jsonb_build_object(
      'total',      (select count(*) from en_rev),
      'vencidos',   (select count(*) from en_rev where limite <= p_ahora),
      'por_vencer', (select count(*) from en_rev where limite > p_ahora and limite <= p_ahora + interval '6 hours')
    ),
    'sin_justificar', (select count(*) from anomalias where estado = 'sin_justificar'),
    'sospechosas',    (select count(*) from en_rev where clasificacion_ia = 'sospechosa'),
    'rostro', coalesce((
      select jsonb_agg(jsonb_build_object('usuario_id', t.usuario_id, 'nombre', t.nombre, 'intentos', t.n) order by t.n desc, t.nombre)
        from (
          select a.usuario_id, btrim(u.nombres || ' ' || u.apellidos) as nombre, count(*) as n
            from anomalias a join usuarios u on u.id = a.usuario_id
           where a.tipo = 'verificacion_fallida' and a.created_at >= p_ahora - interval '7 days' and a.created_at <= p_ahora
           group by a.usuario_id, u.nombres, u.apellidos
          having count(*) >= 3
           order by count(*) desc, 2
           limit 5
        ) t
    ), '[]'::jsonb),
    'sin_celular', (
      select count(*) from usuarios u
       where u.rol = 'usuario' and u.activo and u.sede_id is not null and u.dispositivo_id is null
    )
  ) into v_res;

  return v_res;
end $$;

revoke execute on function atencion_hoy(timestamptz) from public, anon;
grant execute on function atencion_hoy(timestamptz) to authenticated;

-- Los números del periodo: lo de 0015, más lo que usa el Dashboard.
--   resolucion  {decididos, horas_medias}: de los casos del periodo que UNA PERSONA ya decidió, cuántos son y cuántas horas
--               pasaron en promedio entre que se detectó el caso y se decidió. Las aprobaciones automáticas no cuentan.
--   ia_persona  {comparables, coinciden}: de los casos que una persona decidió y la IA había clasificado como «aceptable»
--               o «sospechosa», en cuántos la decisión coincide con lo que la IA sugirió (aceptable→aprobada,
--               sospechosa→rechazada). «Requiere revisión» no sugiere nada y no entra. La IA no decide: se mide qué tanto
--               acierta su sugerencia.
--   rostro      {fallidas}: casos de «verificación facial fallida» del periodo. Esa marcación no se guarda, así que el
--               rechazo es fallidas / (marcaciones + fallidas).
create or replace function reporte_anomalias(
  p_desde timestamptz,
  p_hasta timestamptz,
  p_sede  uuid default null
) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_res jsonb;
begin
  if not es_administrador() then
    raise exception 'Solo un administrador puede ver los reportes';
  end if;
  if p_desde is null or p_hasta is null or p_hasta <= p_desde then
    raise exception 'El periodo del reporte no es válido';
  end if;

  with base as (
    select a.id, a.tipo, a.estado, a.created_at, a.fecha_vencimiento,
           coalesce(m.sede_id, u.sede_id) as sede_id,
           j.clasificacion_ia,
           j.created_at as justificada_el,
           j.decision_final, j.fecha_decision, j.revisado_por
      from anomalias a
      join usuarios u            on u.id = a.usuario_id
      left join marcaciones m    on m.id = a.marcacion_id
      left join justificaciones j on j.anomalia_id = a.id
     where a.created_at >= p_desde and a.created_at < p_hasta
       and (p_sede is null or coalesce(m.sede_id, u.sede_id) = p_sede)
  ),
  evaluadas as (
    select * from base where estado <> 'pendiente' or fecha_vencimiento < now()
  ),
  por_persona as (
    select * from base where decision_final is not null and revisado_por is not null and fecha_decision is not null
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'marcaciones', (
      select count(*) from marcaciones m
       where m.fecha_hora >= p_desde and m.fecha_hora < p_hasta
         and (p_sede is null or m.sede_id = p_sede)
    ),
    'por_estado', coalesce((
      select jsonb_object_agg(estado, n) from (select estado, count(*) as n from base group by estado) t
    ), '{}'::jsonb),
    'por_tipo', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', tipo, 'total', n) order by n desc, tipo)
        from (select tipo, count(*) as n from base group by tipo) t
    ), '[]'::jsonb),
    'por_sede', coalesce((
      select jsonb_agg(jsonb_build_object('sede_id', t.sede_id, 'sede', s.nombre, 'total', t.n) order by t.n desc, s.nombre)
        from (select sede_id, count(*) as n from base group by sede_id) t
        left join sedes s on s.id = t.sede_id
    ), '[]'::jsonb),
    'por_dia', coalesce((
      select jsonb_agg(jsonb_build_object('dia', dia, 'total', n, 'justificadas', j) order by dia)
        from (
          select to_char((created_at at time zone 'America/Guayaquil')::date, 'YYYY-MM-DD') as dia, count(*) as n,
                 count(*) filter (where estado = 'justificada') as j
            from base group by 1
        ) t
    ), '[]'::jsonb),
    'por_hora', coalesce((
      select jsonb_agg(jsonb_build_object('hora', hora, 'total', n) order by hora)
        from (
          select extract(hour from created_at at time zone 'America/Guayaquil')::int as hora, count(*) as n
            from base group by 1
        ) t
    ), '[]'::jsonb),
    'por_clasificacion', coalesce((
      select jsonb_object_agg(clasificacion_ia, n)
        from (select clasificacion_ia, count(*) as n from base where clasificacion_ia is not null group by 1) t
    ), '{}'::jsonb),
    'jornada', (
      select jsonb_build_object(
               'marcaciones', count(*),
               'con_falta', count(*) filter (where exists (
                 select 1 from anomalias f where f.marcacion_id = m.id and f.tipo = 'fuera_horario')))
        from marcaciones m
       where m.tipo in ('ingreso', 'salida')
         and m.fecha_hora >= p_desde and m.fecha_hora < p_hasta
         and (p_sede is null or m.sede_id = p_sede)
    ),
    'resolucion', (
      select jsonb_build_object(
               'decididos', count(*),
               'horas_medias', round((avg(extract(epoch from (fecha_decision - created_at)) / 3600))::numeric, 1))
        from por_persona
    ),
    'ia_persona', (
      select jsonb_build_object(
               'comparables', count(*),
               'coinciden', count(*) filter (where
                  (clasificacion_ia = 'aceptable' and decision_final = 'aprobada')
               or (clasificacion_ia = 'sospechosa' and decision_final = 'rechazada')))
        from por_persona where clasificacion_ia in ('aceptable', 'sospechosa')
    ),
    'rostro', jsonb_build_object('fallidas', (select count(*) from base where tipo = 'verificacion_fallida')),
    'evaluadas', (select count(*) from evaluadas),
    'a_tiempo', (select count(*) from evaluadas where justificada_el is not null and justificada_el <= fecha_vencimiento)
  ) into v_res;

  return v_res;
end $$;

revoke execute on function reporte_anomalias(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function reporte_anomalias(timestamptz, timestamptz, uuid) to authenticated;

-- Realtime: el panel se entera de una marcación o un caso nuevo sin recargar. Las políticas RLS siguen valiendo: cada
-- persona solo recibe los eventos de las filas que podría leer (el administrador, todas). Es seguro correrlo más de una vez.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'marcaciones') then
      alter publication supabase_realtime add table public.marcaciones;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'anomalias') then
      alter publication supabase_realtime add table public.anomalias;
    end if;
  end if;
end $$;
