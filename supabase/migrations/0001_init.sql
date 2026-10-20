-- =====================================================================
-- 0001_init.sql · Sistema de asistencia universitaria con IA
-- Supabase (PostgreSQL 15+). Ruta sugerida: supabase/migrations/0001_init.sql
--
-- Reglas de escritura (ver logica-negocio.md):
--  * Los clientes (app móvil y panel web) SOLO LEEN estas tablas. No hay políticas
--    de INSERT/UPDATE sobre marcaciones, anomalias, justificaciones ni mensajes_chat.
--  * Esas tablas las escribe el microservicio con la service_role key, porque la
--    verificación facial y la IA corren en el servidor y el cliente no es confiable.
--  * La decisión del administrador pasa por la función decidir_anomalia().
--
-- Datos biométricos:
--  * No se guarda ninguna foto. El microservicio calcula los vectores faciales, los CIFRA con
--    AES-256-GCM (la clave vive solo en las variables de entorno del servidor) y guarda el
--    texto cifrado en la tabla rostros.
--  * rostros NO tiene políticas de acceso: la app y el panel web no pueden leerla ni escribirla.
--    Solo el microservicio (service_role) la usa, mediante registrar_rostro(). El administrador
--    la resetea con resetear_rostro(). Al desactivar a un usuario su rostro se borra solo.
--
-- Zonas de marcación:
--  * Una sede es un campus o extensión (punto + radio amplio). Una sede puede tener bloques
--    (edificios), cada uno con su punto y su radio. Si la sede tiene bloques activos se valida
--    contra ellos; si no tiene, contra el círculo de la sede (lo hace el microservicio).
--
-- Convenciones (ver docs/convenciones-base-datos.md):
--  * snake_case en minúsculas, sin tildes; tablas en plural (excepciones: configuracion y bitacora).
--  * PK = id; FK = <entidad_singular>_id; FK con rol = participio + _por (revisado_por).
--  * Columnas de negocio en español. Columnas de auditoría estándar en inglés e idénticas
--    en toda tabla editable: created_at, created_by, updated_at, updated_by.
--  * Las tablas inmutables (marcaciones, mensajes_chat, bitacora) y rostros (nunca se edita:
--    se elimina y se vuelve a crear) solo llevan created_at.
--  * Los cambios del administrador quedan en la tabla bitacora (triggers automáticos).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tipos enumerados
-- ---------------------------------------------------------------------
create type rol_usuario as enum ('usuario', 'administrador');
create type tipo_marcacion as enum ('ingreso', 'salida_almuerzo', 'entrada_almuerzo', 'salida');
create type origen_marcacion as enum ('app', 'web');
create type motivo_contingencia as enum (
  'celular_perdido', 'celular_robado', 'celular_olvidado',
  'celular_danado', 'sin_bateria', 'otro'
);
create type verificacion_rostro as enum ('verificada', 'pendiente', 'fallida');
create type tipo_anomalia as enum (
  'fuera_geocerca', 'sin_salida', 'desplazamiento_inusual', 'fuera_horario',
  'duplicada', 'verificacion_fallida', 'uso_recurrente_web',
  'almuerzo_excedido', 'sin_regreso_almuerzo', 'dia_no_laborable'
);
create type detector_anomalia as enum ('regla', 'modelo');  -- hoy todas las anomalías las detectan reglas; 'modelo' queda reservado para trabajo futuro
create type estado_anomalia as enum (
  'pendiente', 'en_revision', 'justificada', 'rechazada', 'sin_justificar'
);
create type clasificacion_justificacion as enum ('aceptable', 'requiere_revision', 'sospechosa');
create type decision_caso as enum ('aprobada', 'rechazada', 'escalada');
create type emisor_mensaje as enum ('usuario', 'asistente');
create type evento_bitacora as enum (
  'crear', 'actualizar', 'activar', 'desactivar',
  'registrar_rostro', 'resetear_rostro', 'resetear_dispositivo', 'decidir_caso'
);

-- ---------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------
create table sedes (
  id                     uuid primary key default gen_random_uuid(),
  nombre                 text not null unique,
  latitud                double precision not null check (latitud between -90 and 90),
  longitud               double precision not null check (longitud between -180 and 180),
  radio_metros           integer not null check (radio_metros between 50 and 1000), -- cubre todo el campus
  permite_fuera_geocerca boolean not null default false,
  activa                 boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
  -- created_by y updated_by se agregan después de crear usuarios (referencia circular)
);

create table usuarios (
  id                           uuid primary key references auth.users (id) on delete restrict,
  nombres                      text not null,
  apellidos                    text not null,
  email                        text not null unique,
  rol                          rol_usuario not null default 'usuario',
  sede_id                      uuid references sedes (id),
  jornada_inicio               time not null default '08:00',
  jornada_fin                  time not null default '17:00',
  -- Días de la semana en que trabaja (ISO: 1 = lunes … 7 = domingo). Por defecto, de lunes a viernes.
  -- Turnos rotativos, vacaciones y permisos quedan fuera: se tomarán de las tablas reales de la institución.
  dias_laborables              smallint[] not null default '{1,2,3,4,5}',
  dispositivo_id               text,
  push_token                   text,
  -- El rostro en sí está cifrado en la tabla rostros; aquí solo queda el estado (sin datos biométricos).
  fecha_registro_rostro        timestamptz,
  fecha_consentimiento_biometrico timestamptz,
  activo                       boolean not null default true,
  created_at                   timestamptz not null default now(),
  created_by                   uuid references usuarios (id),
  updated_at                   timestamptz not null default now(),
  updated_by                   uuid references usuarios (id),
  constraint usuarios_nombres_no_vacio check (length(btrim(nombres)) > 0),
  constraint usuarios_apellidos_no_vacio check (length(btrim(apellidos)) > 0),
  constraint usuarios_dias_validos
    check (cardinality(dias_laborables) between 1 and 7 and dias_laborables <@ array[1,2,3,4,5,6,7]::smallint[]),
  constraint usuario_requiere_sede
    check (rol = 'administrador' or sede_id is not null),
  constraint rostro_requiere_consentimiento
    check (fecha_registro_rostro is null or fecha_consentimiento_biometrico is not null)
);
alter table sedes
  add column created_by uuid references usuarios (id),
  add column updated_by uuid references usuarios (id);
-- Un dispositivo solo puede estar vinculado a un usuario.
create unique index usuarios_dispositivo_unico on usuarios (dispositivo_id)
  where dispositivo_id is not null;

-- Una sola fila (id = 1): parámetros que el administrador edita desde el panel.
create table configuracion (
  id                    smallint primary key default 1 check (id = 1),
  plazo_justificacion_h integer not null default 48 check (plazo_justificacion_h > 0),
  plazo_revision_h      integer not null default 48 check (plazo_revision_h > 0),
  tolerancia_min        integer not null default 10 check (tolerancia_min >= 0),
  almuerzo_max_min      integer not null default 60 check (almuerzo_max_min between 15 and 180),
  velocidad_max_kmh     integer not null default 120 check (velocidad_max_kmh > 0),          -- regla desplazamiento_inusual
  max_marcaciones_web_30d integer not null default 3 check (max_marcaciones_web_30d >= 1),   -- regla uso_recurrente_web
  modelo_ia             text not null default 'gpt-4.1-mini',
  created_at            timestamptz not null default now(),
  created_by            uuid references usuarios (id),
  updated_at            timestamptz not null default now(),
  updated_by            uuid references usuarios (id)
);
insert into configuracion default values;

-- Bloques (edificios) de una sede, p. ej. "Bloque M" de la sede Milagro. El administrador los
-- registra eligiendo el punto en el mapa o escribiendo las coordenadas, y fija el radio.
create table bloques (
  id           uuid primary key default gen_random_uuid(),
  sede_id      uuid not null references sedes (id),
  nombre       text not null,
  latitud      double precision not null check (latitud between -90 and 90),
  longitud     double precision not null check (longitud between -180 and 180),
  radio_metros integer not null check (radio_metros between 20 and 200),
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  created_by   uuid references usuarios (id),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references usuarios (id),
  constraint bloques_nombre_por_sede_unico unique (sede_id, nombre),
  constraint bloques_id_sede_unico unique (id, sede_id)  -- permite que marcaciones verifique que bloque y sede coinciden
);
create index bloques_sede_idx on bloques (sede_id);

-- Días no laborables para toda la institución (feriados). Marcar en uno de estos días genera la
-- anomalía dia_no_laborable. Se desactivan, no se borran. `id` existe porque la bitácora identifica
-- cada fila por su id.
create table feriados (
  id         uuid primary key default gen_random_uuid(),
  fecha      date not null unique,
  nombre     text not null,
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references usuarios (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references usuarios (id),
  constraint feriados_nombre_no_vacio check (length(btrim(nombre)) > 0)
);

-- Rostro cifrado de cada usuario (relación 1 a 1 con usuarios). Solo lo usa el microservicio.
-- vectores_cifrados = nonce (12 bytes) || texto cifrado || etiqueta de autenticación (16 bytes),
-- resultado de cifrar con AES-256-GCM la lista de vectores del registro guiado (3 a 5 fotos).
create table rostros (
  id                uuid primary key default gen_random_uuid(),
  usuario_id        uuid not null unique references usuarios (id) on delete cascade,
  vectores_cifrados bytea not null,
  version_clave     smallint not null default 1,   -- permite rotar la clave de cifrado
  created_at        timestamptz not null default now()
);

create table marcaciones (
  id                  uuid primary key default gen_random_uuid(), -- la app lo genera antes de guardar en SQLite
  usuario_id          uuid not null references usuarios (id),
  sede_id             uuid not null references sedes (id),
  bloque_id           uuid,                                       -- null si la sede no tiene bloques registrados
  tipo                tipo_marcacion not null,
  fecha_hora          timestamptz not null,                       -- hora del dispositivo al marcar
  latitud             double precision not null,
  longitud            double precision not null,
  precision_m         real,
  origen              origen_marcacion not null default 'app',
  dispositivo_id      text,
  motivo_contingencia motivo_contingencia,
  verificacion        verificacion_rostro not null default 'pendiente',
  similitud_score     real check (similitud_score between 0 and 1),
  created_at          timestamptz not null default now(),         -- hora en que llegó al servidor
  constraint marcaciones_bloque_de_la_sede
    foreign key (bloque_id, sede_id) references bloques (id, sede_id),
  constraint contingencia_coherente
    check ((origen = 'web') = (motivo_contingencia is not null)),
  constraint web_sin_dispositivo
    check (origen = 'app' or dispositivo_id is null)
);
create index marcaciones_usuario_fecha_idx on marcaciones (usuario_id, fecha_hora desc);
create index marcaciones_sede_fecha_idx on marcaciones (sede_id, fecha_hora);
create index marcaciones_bloque_idx on marcaciones (bloque_id) where bloque_id is not null;

create table anomalias (
  id                uuid primary key default gen_random_uuid(),
  numero            bigint generated always as identity unique, -- se muestra como "A-" || numero
  marcacion_id      uuid references marcaciones (id),           -- null si la verificación facial falló y no se guardó
  usuario_id        uuid not null references usuarios (id),
  tipo              tipo_anomalia not null,
  detector          detector_anomalia not null,
  score             real,                                       -- solo si lo detectó el modelo
  detalle           text,                                       -- dato medido por la regla: «Ingreso 08:30; el límite era 08:10»
  descripcion_ia    text,                                       -- aviso redactado por la IA (no reemplaza a detalle)
  intentos_fallidos smallint not null default 0 check (intentos_fallidos >= 0),
  estado            estado_anomalia not null default 'pendiente',
  fecha_vencimiento timestamptz not null,                       -- plazo del usuario para justificar
  created_at        timestamptz not null default now(),
  constraint score_solo_modelo check (detector = 'modelo' or score is null)
);
create index anomalias_usuario_idx on anomalias (usuario_id, created_at desc);
create index anomalias_estado_idx on anomalias (estado, fecha_vencimiento);
create index anomalias_marcacion_idx on anomalias (marcacion_id);

create table justificaciones (
  id               uuid primary key default gen_random_uuid(),
  anomalia_id      uuid not null unique references anomalias (id),
  resumen_ia       text,
  clasificacion_ia clasificacion_justificacion,
  confianza_ia     real check (confianza_ia between 0 and 1),
  decision_final   decision_caso,
  comentario_admin text,
  -- null + decision_final informada = aprobada automáticamente por la IA (caso de menor riesgo)
  revisado_por     uuid references usuarios (id),
  fecha_decision   timestamptz,
  created_at       timestamptz not null default now(),
  constraint rechazo_con_comentario
    check (decision_final is distinct from 'rechazada'
           or nullif(trim(comentario_admin), '') is not null),
  constraint decision_con_fecha
    check ((decision_final is null) = (fecha_decision is null))
);

create table mensajes_chat (
  id               uuid primary key default gen_random_uuid(),
  justificacion_id uuid not null references justificaciones (id),
  emisor           emisor_mensaje not null,
  contenido        text not null check (length(contenido) between 1 and 2000),
  created_at       timestamptz not null default now()
);
create index mensajes_chat_justificacion_idx on mensajes_chat (justificacion_id, created_at);

-- Bitácora de auditoría: quién hizo qué y cuándo. Inmutable. Se llena con triggers
-- (sedes, usuarios, configuracion) y desde decidir_anomalia(). usuario_id nulo = el sistema.
create table bitacora (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid references usuarios (id),
  evento         evento_bitacora not null,
  entidad        text not null,                  -- nombre de la tabla afectada
  entidad_id     text not null,                  -- id del registro afectado
  campo          text,
  valor_anterior text,
  valor_nuevo    text,
  motivo         text,
  created_at     timestamptz not null default now()
);
create index bitacora_entidad_idx on bitacora (entidad, entidad_id, created_at desc);
create index bitacora_usuario_idx on bitacora (usuario_id, created_at desc);

-- ---------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------

-- Una marcación es evidencia de auditoría: no se borra ni se edita.
-- Solo se permite actualizar el resultado de la verificación facial (verificación diferida offline).
create function marcaciones_inmutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Las marcaciones no se pueden eliminar';
  end if;
  if (new.id, new.usuario_id, new.sede_id, new.bloque_id, new.tipo, new.fecha_hora, new.latitud,
      new.longitud, new.precision_m, new.origen, new.dispositivo_id, new.motivo_contingencia)
     is distinct from
     (old.id, old.usuario_id, old.sede_id, old.bloque_id, old.tipo, old.fecha_hora, old.latitud,
      old.longitud, old.precision_m, old.origen, old.dispositivo_id, old.motivo_contingencia)
  then
    raise exception 'Una marcación es inmutable; solo puede actualizarse su verificación';
  end if;
  return new;
end $$;

create trigger marcaciones_inmutable
  before update or delete on marcaciones
  for each row execute function marcaciones_inmutable();

-- El plazo para justificar sale de la configuración vigente.
create function anomalias_asignar_vencimiento() returns trigger
language plpgsql as $$
begin
  if new.fecha_vencimiento is null then
    new.fecha_vencimiento := now() + make_interval(
      hours => (select plazo_justificacion_h from configuracion where id = 1));
  end if;
  return new;
end $$;

create trigger anomalias_asignar_vencimiento
  before insert on anomalias
  for each row execute function anomalias_asignar_vencimiento();

-- Auditoría estándar (equivalente a una BaseModel): rellena created_*/updated_* en las
-- tablas editables. auth.uid() es nulo cuando escribe el microservicio con service_role;
-- en ese caso se respeta el updated_by que el microservicio envíe, y el microservicio debe enviarlo
-- SIEMPRE de forma explícita (el id del administrador, o nulo si lo hace el sistema).
create function asignar_auditoria() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.updated_at := now();
    new.updated_by := new.created_by;
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end $$;

create trigger sedes_auditoria
  before insert or update on sedes
  for each row execute function asignar_auditoria();
create trigger usuarios_auditoria
  before insert or update on usuarios
  for each row execute function asignar_auditoria();
create trigger configuracion_auditoria
  before insert or update on configuracion
  for each row execute function asignar_auditoria();
create trigger bloques_auditoria
  before insert or update on bloques
  for each row execute function asignar_auditoria();
create trigger feriados_auditoria
  before insert or update on feriados
  for each row execute function asignar_auditoria();

-- Al desactivar a un usuario se elimina su rostro cifrado y se retira el consentimiento:
-- no se conservan datos biométricos de quien ya no usa el sistema. Si se reactiva, debe
-- registrar su rostro y aceptar el consentimiento otra vez.
create function usuarios_borrar_rostro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from rostros where usuario_id = new.id;
  new.fecha_registro_rostro := null;
  new.fecha_consentimiento_biometrico := null;
  return new;
end $$;

create trigger usuarios_borrar_rostro
  before update of activo on usuarios
  for each row when (old.activo and not new.activo)
  execute function usuarios_borrar_rostro();

-- La bitácora no se edita ni se borra.
create function bitacora_inmutable() returns trigger
language plpgsql as $$
begin
  raise exception 'La bitácora no se puede modificar ni eliminar';
end $$;

create trigger bitacora_inmutable
  before update or delete on bitacora
  for each row execute function bitacora_inmutable();

-- Registra en la bitácora cada cambio, columna por columna (valor anterior y nuevo).
-- Nunca se guarda el push_token. Los datos biométricos no pasan por aquí (viven cifrados en
-- rostros, que no tiene este trigger): solo queda constancia del evento y de su fecha.
create function bitacora_registrar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_nuevo  jsonb := to_jsonb(new);
  v_viejo  jsonb;
  v_actor  uuid;
  k        text;
  v_evento evento_bitacora;
begin
  if tg_op = 'INSERT' then
    insert into bitacora (usuario_id, evento, entidad, entidad_id)
    values (new.created_by, 'crear', tg_table_name, v_nuevo ->> 'id');
    return new;
  end if;

  v_viejo := to_jsonb(old);
  v_actor := new.updated_by;

  for k in select jsonb_object_keys(v_nuevo) loop
    if k in ('created_at', 'created_by', 'updated_at', 'updated_by', 'push_token') then
      continue;
    end if;
    if v_viejo -> k is distinct from v_nuevo -> k then
      v_evento := case
        when k in ('activo', 'activa') then
          case when (v_nuevo ->> k)::boolean
               then 'activar'::evento_bitacora else 'desactivar'::evento_bitacora end
        when k = 'dispositivo_id' and (v_nuevo ->> k) is null then 'resetear_dispositivo'::evento_bitacora
        when k = 'fecha_registro_rostro' then
          case when (v_nuevo ->> k) is null
               then 'resetear_rostro'::evento_bitacora else 'registrar_rostro'::evento_bitacora end
        else 'actualizar'::evento_bitacora
      end;
      insert into bitacora (usuario_id, evento, entidad, entidad_id, campo, valor_anterior, valor_nuevo)
      values (v_actor, v_evento, tg_table_name, v_nuevo ->> 'id', k, v_viejo ->> k, v_nuevo ->> k);
    end if;
  end loop;
  return new;
end $$;

create trigger sedes_bitacora
  after insert or update on sedes
  for each row execute function bitacora_registrar();
create trigger usuarios_bitacora
  after insert or update on usuarios
  for each row execute function bitacora_registrar();
create trigger configuracion_bitacora
  after insert or update on configuracion
  for each row execute function bitacora_registrar();
create trigger bloques_bitacora
  after insert or update on bloques
  for each row execute function bitacora_registrar();
create trigger feriados_bitacora
  after insert or update on feriados
  for each row execute function bitacora_registrar();

-- ---------------------------------------------------------------------
-- 4. Funciones
-- ---------------------------------------------------------------------
create function es_administrador() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from usuarios
    where id = auth.uid() and rol = 'administrador' and activo
  );
$$;

-- Decisión del administrador sobre un caso (aprobar, rechazar o escalar), de forma atómica.
-- También sirve para casos 'sin_justificar': crea la justificación vacía y la resuelve.
create function decidir_anomalia(
  p_anomalia   uuid,
  p_decision   decision_caso,
  p_comentario text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_estado estado_anomalia;
begin
  if not es_administrador() then
    raise exception 'Solo un administrador puede decidir un caso';
  end if;

  select estado into v_estado from anomalias where id = p_anomalia for update;
  if v_estado is null then
    raise exception 'Anomalía no encontrada';
  end if;
  if v_estado not in ('en_revision', 'sin_justificar') then
    raise exception 'El caso ya está resuelto o aún espera la justificación del usuario';
  end if;

  insert into justificaciones (anomalia_id) values (p_anomalia)
  on conflict (anomalia_id) do nothing;

  update justificaciones
     set decision_final   = p_decision,
         comentario_admin = p_comentario,
         revisado_por     = auth.uid(),
         fecha_decision   = now()
   where anomalia_id = p_anomalia;

  insert into bitacora (usuario_id, evento, entidad, entidad_id, valor_nuevo, motivo)
  values (auth.uid(), 'decidir_caso', 'anomalias', p_anomalia::text, p_decision::text, p_comentario);

  -- 'escalada' deja el caso En revisión hasta que jefatura decida.
  update anomalias
     set estado = case p_decision
                    when 'aprobada'  then 'justificada'::estado_anomalia
                    when 'rechazada' then 'rechazada'::estado_anomalia
                    else 'en_revision'::estado_anomalia
                  end
   where id = p_anomalia;
end $$;

-- Pasa a 'sin_justificar' las anomalías cuyo plazo venció. Ejecutar cada 15 min.
create function marcar_sin_justificar() returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  update anomalias set estado = 'sin_justificar'
   where estado = 'pendiente' and fecha_vencimiento < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Guarda el rostro cifrado de un usuario y deja constancia de la fecha de registro y del
-- consentimiento, todo en una sola transacción. Solo la llama el microservicio (service_role).
-- Si el usuario ya tiene rostro, falla: el administrador debe resetearlo primero.
create function registrar_rostro(
  p_usuario              uuid,
  p_vectores_cifrados    bytea,
  p_version_clave        smallint,
  p_fecha_consentimiento timestamptz
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from rostros where usuario_id = p_usuario) then
    raise exception 'El usuario ya tiene un rostro registrado; el administrador debe resetearlo primero';
  end if;

  insert into rostros (usuario_id, vectores_cifrados, version_clave)
  values (p_usuario, p_vectores_cifrados, p_version_clave);

  update usuarios
     set fecha_consentimiento_biometrico = p_fecha_consentimiento,
         fecha_registro_rostro           = now()
   where id = p_usuario;
end $$;

-- El administrador resetea el rostro de un usuario (cambio de apariencia, error de registro).
-- Elimina el rostro cifrado y retira el consentimiento; el usuario debe registrarse de nuevo.
-- La bitácora deja el evento 'resetear_rostro' con el administrador que lo hizo.
create function resetear_rostro(p_usuario uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_administrador() then
    raise exception 'Solo un administrador puede resetear un rostro';
  end if;
  if not exists (select 1 from usuarios where id = p_usuario) then
    raise exception 'Usuario no encontrado';
  end if;

  delete from rostros where usuario_id = p_usuario;
  update usuarios
     set fecha_registro_rostro           = null,
         fecha_consentimiento_biometrico = null
   where id = p_usuario;
end $$;

revoke execute on function es_administrador() from public, anon;
revoke execute on function decidir_anomalia(uuid, decision_caso, text) from public, anon;
revoke execute on function marcar_sin_justificar() from public, anon, authenticated;
revoke execute on function registrar_rostro(uuid, bytea, smallint, timestamptz) from public, anon, authenticated;
revoke execute on function resetear_rostro(uuid) from public, anon;
grant execute on function es_administrador() to authenticated;
grant execute on function decidir_anomalia(uuid, decision_caso, text) to authenticated;
grant execute on function resetear_rostro(uuid) to authenticated;
grant execute on function registrar_rostro(uuid, bytea, smallint, timestamptz) to service_role;

-- Con pg_cron habilitado en Supabase (Database > Extensions):
-- select cron.schedule('anomalias-vencidas', '*/15 * * * *', $$select marcar_sin_justificar()$$);

-- ---------------------------------------------------------------------
-- 5. Vista para el dashboard, la tabla de anomalías y los reportes
-- ---------------------------------------------------------------------
create view v_anomalias_detalle with (security_invoker = true) as
select a.id,
       a.numero,
       'A-' || a.numero              as caso,
       a.tipo,
       a.detector,
       a.score,
       a.estado,
       a.created_at,
       a.fecha_vencimiento,
       a.usuario_id,
       (u.nombres || ' ' || u.apellidos) as colaborador,
       coalesce(m.sede_id, u.sede_id) as sede_id,
       s.nombre                      as sede,
       b.nombre                      as bloque,
       m.origen                      as origen_marcacion,
       j.clasificacion_ia,
       j.decision_final,
       j.comentario_admin,
       j.fecha_decision,
       (r.nombres || ' ' || r.apellidos) as revisado_por_nombre,
       a.detalle
  from anomalias a
  join usuarios u            on u.id = a.usuario_id
  left join marcaciones m    on m.id = a.marcacion_id
  left join sedes s          on s.id = coalesce(m.sede_id, u.sede_id)
  left join bloques b        on b.id = m.bloque_id
  left join justificaciones j on j.anomalia_id = a.id
  left join usuarios r       on r.id = j.revisado_por;

-- ---------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------
alter table sedes           enable row level security;
alter table bloques         enable row level security;
alter table feriados        enable row level security;
alter table rostros         enable row level security;
alter table usuarios        enable row level security;
alter table configuracion   enable row level security;
alter table marcaciones     enable row level security;
alter table anomalias       enable row level security;
alter table justificaciones enable row level security;
alter table mensajes_chat   enable row level security;
alter table bitacora        enable row level security;

-- sedes: todos los autenticados leen (la app necesita su geocerca); solo el admin escribe.
create policy sedes_leer on sedes
  for select to authenticated using (true);
create policy sedes_insertar on sedes
  for insert to authenticated with check (es_administrador());
create policy sedes_actualizar on sedes
  for update to authenticated using (es_administrador()) with check (es_administrador());

-- bloques: todos los autenticados leen (la app muestra la zona de marcación); solo el admin escribe.
create policy bloques_leer on bloques
  for select to authenticated using (true);
create policy bloques_insertar on bloques
  for insert to authenticated with check (es_administrador());
create policy bloques_actualizar on bloques
  for update to authenticated using (es_administrador()) with check (es_administrador());

-- feriados: todos los autenticados leen (la app puede avisar «hoy es feriado»); solo el admin escribe.
create policy feriados_leer on feriados
  for select to authenticated using (true);
create policy feriados_insertar on feriados
  for insert to authenticated with check (es_administrador());
create policy feriados_actualizar on feriados
  for update to authenticated using (es_administrador()) with check (es_administrador());

-- rostros: SIN políticas. Con RLS activo y sin políticas, la app y el panel no ven ni una fila;
-- además se les quitan los permisos de tabla. Solo el microservicio (service_role) la usa.
revoke all on rostros from anon, authenticated;

-- usuarios: cada uno ve su fila; el admin ve y gestiona todas. Nunca se borran (se desactivan).
create policy usuarios_leer on usuarios
  for select to authenticated using (id = auth.uid() or es_administrador());
create policy usuarios_insertar on usuarios
  for insert to authenticated with check (es_administrador());
create policy usuarios_actualizar on usuarios
  for update to authenticated using (es_administrador()) with check (es_administrador());

-- configuracion: solo el administrador (el microservicio la lee con service_role).
create policy configuracion_leer on configuracion
  for select to authenticated using (es_administrador());
create policy configuracion_actualizar on configuracion
  for update to authenticated using (es_administrador()) with check (es_administrador());

-- Tablas de solo lectura para el cliente: el usuario ve lo suyo; el admin ve todo.
create policy marcaciones_leer on marcaciones
  for select to authenticated using (usuario_id = auth.uid() or es_administrador());

create policy anomalias_leer on anomalias
  for select to authenticated using (usuario_id = auth.uid() or es_administrador());

create policy justificaciones_leer on justificaciones
  for select to authenticated using (
    es_administrador()
    or exists (select 1 from anomalias a
               where a.id = justificaciones.anomalia_id and a.usuario_id = auth.uid())
  );

create policy mensajes_chat_leer on mensajes_chat
  for select to authenticated using (
    es_administrador()
    or exists (select 1
                 from justificaciones j
                 join anomalias a on a.id = j.anomalia_id
                where j.id = mensajes_chat.justificacion_id and a.usuario_id = auth.uid())
  );

-- bitacora: solo el administrador la consulta; nadie escribe desde el cliente (la llenan los triggers).
create policy bitacora_leer on bitacora
  for select to authenticated using (es_administrador());
