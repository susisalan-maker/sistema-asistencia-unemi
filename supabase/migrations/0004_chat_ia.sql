-- Chat de justificación con IA (docs/logica-negocio.md, secciones 5 y 6).
--
-- Antes, justificar era UN mensaje que pasaba el caso a `en_revision`. Con la IA hay una conversación corta:
-- la persona escribe, el asistente repregunta una vez si hace falta, y recién al cerrar el caso llega al
-- administrador (o se aprueba solo si es de riesgo mínimo). Mientras dura la conversación el caso sigue `pendiente`.
--
--   registrar_mensaje_usuario()    guarda lo que escribe la persona (crea la justificación la primera vez)
--   registrar_mensaje_asistente()  guarda lo que responde el asistente
--   cerrar_justificacion()         guarda la clasificación de la IA y pasa el caso a `en_revision`
--                                  (o a `justificada` si es una aprobación automática, que queda en la bitácora)
--
-- Solo las llama el microservicio (service_role), que ya validó la sesión. Es seguro correrla más de una vez.

create or replace function registrar_mensaje_usuario(
  p_usuario  uuid,
  p_anomalia uuid,
  p_texto    text,
  p_max      int default 3          -- máximo de mensajes de la persona por caso
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_dueno       uuid;
  v_estado      estado_anomalia;
  v_vencimiento timestamptz;
  v_texto       text := btrim(coalesce(p_texto, ''));
  v_just        uuid;
  v_nuevo       boolean := false;
  v_minimo      int;
begin
  select usuario_id, estado, fecha_vencimiento
    into v_dueno, v_estado, v_vencimiento
    from anomalias where id = p_anomalia for update;

  -- Una anomalía ajena se trata igual que una que no existe: no se revela que existe.
  if v_dueno is null or v_dueno <> p_usuario then
    raise exception 'Anomalía no encontrada';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Esta anomalía ya no admite justificación';
  end if;
  if v_vencimiento < now() then
    raise exception 'El plazo para justificar esta anomalía venció';
  end if;

  select id into v_just from justificaciones where anomalia_id = p_anomalia;
  if v_just is null then
    v_nuevo := true;
  end if;

  -- La primera explicación necesita contenido; las respuestas a la repregunta pueden ser cortas («sí», «no tengo»).
  v_minimo := case when v_nuevo then 10 else 2 end;       -- (fuera del IF: un THEN dentro del CASE confunde al intérprete)
  if length(v_texto) > 1000 or length(v_texto) < v_minimo then
    raise exception 'La justificación debe tener entre % y 1000 caracteres', v_minimo;
  end if;

  if v_nuevo then
    insert into justificaciones (anomalia_id) values (p_anomalia) returning id into v_just;
  elsif (select count(*) from mensajes_chat where justificacion_id = v_just and emisor = 'usuario') >= p_max then
    raise exception 'Se alcanzó el máximo de mensajes para esta justificación';
  end if;

  insert into mensajes_chat (justificacion_id, emisor, contenido) values (v_just, 'usuario', v_texto);
  return v_just;
end $$;

create or replace function registrar_mensaje_asistente(
  p_justificacion uuid,
  p_contenido     text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from justificaciones where id = p_justificacion) then
    raise exception 'Justificación no encontrada';
  end if;
  insert into mensajes_chat (justificacion_id, emisor, contenido)
  values (p_justificacion, 'asistente', left(btrim(coalesce(p_contenido, '')), 2000));
end $$;

create or replace function cerrar_justificacion(
  p_anomalia      uuid,
  p_clasificacion clasificacion_justificacion default null,
  p_confianza     real default null,
  p_resumen       text default null,
  p_auto_aprobar  boolean default false
) returns estado_anomalia
language plpgsql security definer set search_path = public as $$
declare
  v_estado estado_anomalia;
  v_nuevo  estado_anomalia;
begin
  select estado into v_estado from anomalias where id = p_anomalia for update;
  if v_estado is null then
    raise exception 'Anomalía no encontrada';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Esta anomalía ya no admite justificación';
  end if;
  if not exists (select 1 from justificaciones where anomalia_id = p_anomalia) then
    raise exception 'La anomalía todavía no tiene justificación';
  end if;

  update justificaciones
     set clasificacion_ia = p_clasificacion,
         confianza_ia     = p_confianza,
         resumen_ia       = left(p_resumen, 1000)
   where anomalia_id = p_anomalia;

  if p_auto_aprobar then
    -- Aprobación automática: decision_final informada y revisado_por vacío (así se distingue de una humana).
    update justificaciones
       set decision_final = 'aprobada', fecha_decision = now()
     where anomalia_id = p_anomalia;
    insert into bitacora (usuario_id, evento, entidad, entidad_id, valor_nuevo, motivo)
    values (null, 'decidir_caso', 'anomalias', p_anomalia::text, 'aprobada', 'Aprobación automática (riesgo mínimo)');
    v_nuevo := 'justificada';
  else
    v_nuevo := 'en_revision';
  end if;

  update anomalias set estado = v_nuevo where id = p_anomalia;
  return v_nuevo;
end $$;

revoke execute on function registrar_mensaje_usuario(uuid, uuid, text, int) from public, anon, authenticated;
revoke execute on function registrar_mensaje_asistente(uuid, text) from public, anon, authenticated;
revoke execute on function cerrar_justificacion(uuid, clasificacion_justificacion, real, text, boolean) from public, anon, authenticated;
grant execute on function registrar_mensaje_usuario(uuid, uuid, text, int) to service_role;
grant execute on function registrar_mensaje_asistente(uuid, text) to service_role;
grant execute on function cerrar_justificacion(uuid, clasificacion_justificacion, real, text, boolean) to service_role;
