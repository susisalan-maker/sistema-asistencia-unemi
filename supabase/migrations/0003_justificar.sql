-- Justificación de una anomalía por parte de la persona (docs/logica-negocio.md, secciones 3 y 4).
--
-- `justificar_anomalia()` hace en UNA transacción lo que el cliente no puede escribir (no hay políticas de
-- escritura sobre estas tablas): comprobar que la anomalía es de esa persona, está `pendiente` y dentro del plazo;
-- crear la justificación; guardar el mensaje; y pasar la anomalía a `en_revision`. Como bloquea la fila
-- (`for update`), dos envíos a la vez no pueden justificarla dos veces.
--
-- Solo la llama el microservicio (service_role), que ya validó la sesión. Es seguro correrla más de una vez.
create or replace function justificar_anomalia(
  p_usuario  uuid,
  p_anomalia uuid,
  p_texto    text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_dueno       uuid;
  v_estado      estado_anomalia;
  v_vencimiento timestamptz;
  v_texto       text := btrim(coalesce(p_texto, ''));
  v_just        uuid;
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
  if length(v_texto) < 10 or length(v_texto) > 1000 then
    raise exception 'La justificación debe tener entre 10 y 1000 caracteres';
  end if;

  insert into justificaciones (anomalia_id) values (p_anomalia) returning id into v_just;
  insert into mensajes_chat (justificacion_id, emisor, contenido) values (v_just, 'usuario', v_texto);
  update anomalias set estado = 'en_revision' where id = p_anomalia;
end $$;

revoke execute on function justificar_anomalia(uuid, uuid, text) from public, anon, authenticated;
grant execute on function justificar_anomalia(uuid, uuid, text) to service_role;
