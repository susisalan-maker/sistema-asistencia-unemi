-- Cerrar todas las sesiones de una cuenta (docs/logica-negocio.md, sección 8: cambio de celular).
--
-- Cuando Talento Humano reinicia el celular vinculado de una persona, las sesiones que ya estaban abiertas
-- (por ejemplo, en el celular perdido o robado) deben dejar de servir: quien las tenga abiertas tendría que
-- volver a escribir la contraseña. Supabase Auth no ofrece un «cerrar todas las sesiones de este usuario»
-- para el administrador, así que se hace aquí: al borrar la fila de `auth.sessions` también se borran sus
-- tokens de renovación (llave foránea con `on delete cascade`), y el token de acceso que quedara en circulación
-- deja de aceptarse porque Auth comprueba que su sesión exista.
--
-- Solo la llama el microservicio (service_role). Es seguro correrla más de una vez.
create or replace function cerrar_sesiones_usuario(p_usuario uuid) returns void
language sql security definer set search_path = public, auth as $$
  delete from auth.sessions where user_id = p_usuario;
$$;

revoke execute on function cerrar_sesiones_usuario(uuid) from public, anon, authenticated;
grant execute on function cerrar_sesiones_usuario(uuid) to service_role;
