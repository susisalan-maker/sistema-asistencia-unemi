-- 0019: al exportar un reporte se elige qué partes lleva (resumen, indicadores, gráficas, tabla…) y la constancia en Auditoría lo dice.
--
-- El resumen con IA ya no tiene estado de «borrador» o «revisado»: solo se redacta a partir de las cifras. `registrar_exportacion`
-- ahora acepta `con_resumen` (los valores anteriores siguen siendo válidos, por las filas ya guardadas y por clientes viejos) y un
-- texto opcional con las partes incluidas. No guarda el contenido del reporte, solo los datos de la exportación.

drop function if exists registrar_exportacion(text, timestamptz, timestamptz, uuid, integer, text);

create or replace function registrar_exportacion(
  p_formato    text,
  p_desde      timestamptz,
  p_hasta      timestamptz,
  p_sede       uuid,
  p_casos      integer,
  p_resumen    text,
  p_secciones  text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_sede   text;
  v_estado text;
  v_partes text;
begin
  if not es_administrador() then
    raise exception 'Solo un administrador puede exportar reportes';
  end if;
  if p_formato not in ('pdf', 'csv', 'xlsx') then
    raise exception 'El formato de exportación no es válido';
  end if;
  if p_desde is null or p_hasta is null or p_hasta <= p_desde then
    raise exception 'El periodo de la exportación no es válido';
  end if;
  if p_resumen not in ('sin_resumen', 'con_resumen', 'borrador', 'revisado') then
    raise exception 'El estado del resumen no es válido';
  end if;

  select nombre into v_sede from sedes where id = p_sede;
  v_estado := case p_resumen
    when 'con_resumen' then 'con resumen redactado por IA'
    when 'revisado' then 'resumen con IA revisado por una persona'
    when 'borrador' then 'resumen con IA como borrador sin revisar'
    else 'sin resumen con IA' end;
  v_partes := nullif(left(btrim(coalesce(p_secciones, '')), 300), '');

  insert into bitacora (usuario_id, evento, entidad, entidad_id, campo, valor_nuevo, motivo)
  values (
    auth.uid(), 'exportar_reporte', 'reportes',
    to_char(p_desde at time zone 'America/Guayaquil', 'YYYY-MM-DD') || ' a ' || to_char((p_hasta - interval '1 second') at time zone 'America/Guayaquil', 'YYYY-MM-DD'),
    p_formato,
    greatest(coalesce(p_casos, 0), 0)::text || ' casos',
    'Sede: ' || coalesce(v_sede, 'todas') || ' · ' || v_estado || case when v_partes is null then '' else ' · Incluye: ' || v_partes end
  );
end $$;

revoke execute on function registrar_exportacion(text, timestamptz, timestamptz, uuid, integer, text, text) from public, anon;
grant execute on function registrar_exportacion(text, timestamptz, timestamptz, uuid, integer, text, text) to authenticated;
