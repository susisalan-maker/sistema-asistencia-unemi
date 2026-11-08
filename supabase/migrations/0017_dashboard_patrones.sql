-- 0017: lo que faltaba del Dashboard — cuándo ocurren las anomalías, quién cerró cada caso y a quién conviene escuchar.
--
--   atencion_hoy(ahora)        igual que en 0016, y `revision.por_vencer_casos`: los números de caso (A-n) que vencen en menos de 6 h.
--   reporte_anomalias(...)     igual que en 0016, con dos datos más:
--     por_dia_hora  [{dia 1..7 (1 = lunes), hora 0..23, total}]: casos por día de la semana y hora de Ecuador (mapa de calor).
--     cierre        {aprobadas, rechazadas, sin_justificar, sin_persona}: cómo terminaron los casos del periodo.
--                   «aprobadas» y «rechazadas» son decisiones de UNA PERSONA (revisado_por informado). «sin_persona» cuenta
--                   los casos cerrados sin que una persona los decidiera: no debería haber ninguno; si aparece, hay que mirarlo.
--   patrones_anomalias(ahora, sede)  personas con 3 o más casos en los últimos 30 días, con su tipo más frecuente.
--                                    Sirve para conversar con la persona, no para sancionar.
--
-- Todo es SOLO LECTURA, security invoker y solo para el administrador.

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
    select a.id, a.numero,
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
      'por_vencer', (select count(*) from en_rev where limite > p_ahora and limite <= p_ahora + interval '6 hours'),
      'por_vencer_casos', coalesce((
        select jsonb_agg('A-' || t.numero order by t.limite, t.numero)
          from (select numero, limite from en_rev where limite > p_ahora and limite <= p_ahora + interval '6 hours'
                 order by limite, numero limit 5) t
      ), '[]'::jsonb)
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
    'por_dia_hora', coalesce((
      select jsonb_agg(jsonb_build_object('dia', dia, 'hora', hora, 'total', n) order by dia, hora)
        from (
          select extract(isodow from created_at at time zone 'America/Guayaquil')::int as dia,
                 extract(hour from created_at at time zone 'America/Guayaquil')::int as hora, count(*) as n
            from base group by 1, 2
        ) t
    ), '[]'::jsonb),
    'cierre', (
      select jsonb_build_object(
               'aprobadas',     count(*) filter (where estado = 'justificada' and revisado_por is not null),
               'rechazadas',    count(*) filter (where estado = 'rechazada' and revisado_por is not null),
               'sin_justificar', count(*) filter (where estado = 'sin_justificar'),
               'sin_persona',   count(*) filter (where estado in ('justificada', 'rechazada') and revisado_por is null))
        from base
    ),
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

create or replace function patrones_anomalias(p_ahora timestamptz default now(), p_sede uuid default null)
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_res jsonb;
begin
  if not es_administrador() then
    raise exception 'Solo un administrador puede ver los patrones';
  end if;

  with base as (
    select a.usuario_id, a.tipo, a.estado
      from anomalias a join usuarios u on u.id = a.usuario_id
     where a.created_at > p_ahora - interval '30 days' and a.created_at <= p_ahora
       and u.rol = 'usuario'
       and (p_sede is null or u.sede_id = p_sede)
  ),
  por_usuario as (
    select usuario_id, count(*) as total, count(*) filter (where estado = 'justificada') as justificadas
      from base group by usuario_id having count(*) >= 3
  ),
  por_tipo as (
    select distinct on (usuario_id) usuario_id, tipo, count(*) as n
      from base group by usuario_id, tipo order by usuario_id, count(*) desc, tipo
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'usuario_id', t.usuario_id, 'nombre', t.nombre, 'sede', t.sede, 'total', t.total,
           'justificadas', t.justificadas, 'tipo', t.tipo, 'tipo_total', t.n)
         order by t.total desc, t.nombre), '[]'::jsonb)
    into v_res
    from (
      select p.usuario_id, btrim(u.nombres || ' ' || u.apellidos) as nombre, s.nombre as sede,
             p.total, p.justificadas, pt.tipo, pt.n
        from por_usuario p
        join usuarios u on u.id = p.usuario_id
        join por_tipo pt on pt.usuario_id = p.usuario_id
        left join sedes s on s.id = u.sede_id
       order by p.total desc, 2
       limit 8
    ) t;

  return v_res;
end $$;

revoke execute on function patrones_anomalias(timestamptz, uuid) from public, anon;
grant execute on function patrones_anomalias(timestamptz, uuid) to authenticated;
