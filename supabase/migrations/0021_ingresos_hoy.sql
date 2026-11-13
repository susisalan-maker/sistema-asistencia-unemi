-- Dashboard «Hoy en vivo»: la gráfica «Ingresos a lo largo del día» y la última marcación.
--
--   ingresos_hoy(sede, ahora)   cuántas personas se esperaban y cuántas ya habían marcado, a cada hora del día de HOY,
--                               más lo último que marcó alguien.
--
-- Mismo criterio que `estado_hoy` (0016): se espera a quienes son usuarios activos con sede, hoy es un día laborable suyo y
-- no es feriado; quien marca un día en que no debía también se cuenta (lo que marcó se muestra tal cual).
--
--   esperados(h)  personas cuya hora de ingreso (`jornada_inicio`) es igual o anterior a las h:00. Es la curva «esperada»:
--                 llega al total cuando ya pasó la hora de ingreso de la última persona.
--   reales(h)     personas cuya PRIMERA marcación de hoy fue igual o anterior a las h:00. Solo hasta ahora: las horas
--                 que todavía no llegan van en null (no se dibuja lo que no ha pasado).
--   *_ahora       lo mismo, pero medido en el instante `p_ahora` (el punto de «Ahora» de la gráfica).
--   ultima        la última marcación registrada hoy (quién, qué, dónde y cómo quedó su verificación); null si no hay.
--
-- Es SOLO LECTURA, security invoker y solo para el administrador (las políticas RLS siguen valiendo). No mira la ubicación
-- ni si alguien tiene la app abierta. `p_ahora` existe para poder probar la función en otro momento; el panel no lo envía.
-- La aplicación NO sabe si alguien faltó con permiso o enfermo: solo que no ha marcado.

create or replace function ingresos_hoy(
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
  v_feriado text;
  v_res     jsonb;
begin
  if not es_administrador() then
    raise exception 'Solo un administrador puede ver los ingresos de hoy';
  end if;

  select nombre into v_feriado from feriados where activo and v_hoy between fecha_inicio and fecha_fin limit 1;

  with marcas as (
    select m.usuario_id, min(m.fecha_hora) as primera
      from marcaciones m
     where m.fecha_hora >= v_ini and m.fecha_hora < v_fin
     group by m.usuario_id
  ),
  gente as (
    select u.id,
           extract(epoch from u.jornada_inicio)::int as inicio_s,
           ma.primera
      from usuarios u
      left join marcas ma on ma.usuario_id = u.id
     where u.rol = 'usuario' and u.activo and u.sede_id is not null
       and (p_sede is null or u.sede_id = p_sede)
       and (ma.primera is not null or (v_feriado is null and v_dow = any (u.dias_laborables)))
  ),
  ultima as (
    select btrim(u.nombres || ' ' || u.apellidos) as nombre, s.nombre as sede,
           m.tipo, m.fecha_hora, m.verificacion, m.sin_conexion
      from marcaciones m
      join usuarios u on u.id = m.usuario_id
      join sedes s    on s.id = m.sede_id
     where m.fecha_hora >= v_ini and m.fecha_hora <= p_ahora
       and (p_sede is null or m.sede_id = p_sede)
     order by m.fecha_hora desc, m.created_at desc
     limit 1
  )
  select jsonb_build_object(
    'hoy', to_char(v_hoy, 'YYYY-MM-DD'),
    'ahora', p_ahora,
    'ahora_hora', round((extract(epoch from (p_ahora - v_ini)) / 3600.0)::numeric, 2),
    'esperadas', (select count(*) from gente),
    'esperados_ahora', (select count(*) from gente where inicio_s <= extract(epoch from (p_ahora - v_ini))),
    'reales_ahora', (select count(*) from gente where primera is not null and primera <= p_ahora),
    'puntos', (
      select jsonb_agg(jsonb_build_object(
               'hora', h,
               'esperados', (select count(*) from gente g where g.inicio_s <= h * 3600),
               'reales', case when v_ini + make_interval(hours => h) <= p_ahora
                              then (select count(*) from gente g where g.primera is not null and g.primera <= v_ini + make_interval(hours => h))
                              else null end
             ) order by h)
        from generate_series(0, 24) as h
    ),
    'ultima', (
      select jsonb_build_object('nombre', nombre, 'sede', sede, 'tipo', tipo, 'fecha_hora', fecha_hora,
                                'verificacion', verificacion, 'sin_conexion', sin_conexion)
        from ultima
    )
  ) into v_res;

  return v_res;
end $$;

revoke execute on function ingresos_hoy(uuid, timestamptz) from public, anon;
grant execute on function ingresos_hoy(uuid, timestamptz) to authenticated;
