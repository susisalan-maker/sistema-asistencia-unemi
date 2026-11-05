-- Módulo de Reportes (docs/logica-negocio.md, sección 10): los números de un periodo, calculados por la base.
--
--   reporte_anomalias(desde, hasta, sede)   conteos de las anomalías creadas en [desde, hasta) y de las marcaciones
--                                           del mismo periodo, como un solo JSON.
--
-- Es SOLO LECTURA y corre con los permisos de quien la llama (security invoker): las políticas RLS siguen valiendo y,
-- además, se exige ser administrador. No hay tope de casos: cuenta en la base, no en el navegador.
--
-- «Justificadas a tiempo»: la persona justificó antes de vencer su plazo si existe su justificación y se creó (con su primer
-- mensaje) a más tardar en `fecha_vencimiento`. Cuando el administrador decide un caso «sin justificar», su justificación
-- vacía se crea DESPUÉS del plazo, así que no cuenta como a tiempo. Solo se evalúan los casos cuyo plazo ya terminó o que
-- ya tienen justificación: los que aún están dentro del plazo no se cuentan ni a favor ni en contra.
--
-- Las horas y los días se agrupan en hora de Ecuador (America/Guayaquil), que es la del panel.

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
           j.created_at as justificada_el
      from anomalias a
      join usuarios u            on u.id = a.usuario_id
      left join marcaciones m    on m.id = a.marcacion_id
      left join justificaciones j on j.anomalia_id = a.id
     where a.created_at >= p_desde and a.created_at < p_hasta
       and (p_sede is null or coalesce(m.sede_id, u.sede_id) = p_sede)
  ),
  evaluadas as (
    select * from base where estado <> 'pendiente' or fecha_vencimiento < now()
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
      select jsonb_agg(jsonb_build_object('dia', dia, 'total', n) order by dia)
        from (
          select to_char((created_at at time zone 'America/Guayaquil')::date, 'YYYY-MM-DD') as dia, count(*) as n
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
    'evaluadas', (select count(*) from evaluadas),
    'a_tiempo', (select count(*) from evaluadas where justificada_el is not null and justificada_el <= fecha_vencimiento)
  ) into v_res;

  return v_res;
end $$;

revoke execute on function reporte_anomalias(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function reporte_anomalias(timestamptz, timestamptz, uuid) to authenticated;
