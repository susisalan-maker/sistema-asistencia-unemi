-- IA configurable por proveedor: Gemini, Claude (Anthropic) y OpenAI, con una sola IA activa a la vez.
--
--  * configuracion.ia_proveedor sigue siendo el proveedor ACTIVO (una sola celda: nunca hay dos activos). Ahora admite 'openai'.
--  * ia_llaves.modelo: el modelo de cada proveedor, para que al cambiar de uno a otro no se pierda. Vacío = el recomendado.
--  * ia_llaves ahora puede tener una fila SIN llave (solo el modelo): llave_cifrada, version_clave y ultimos_4 son todos
--    nulos o todos tienen valor.
--  * configuracion.modelo_ia queda sin uso (su valor pasa a la fila del proveedor activo).
--
-- Es seguro correrla más de una vez.

alter table configuracion drop constraint if exists configuracion_ia_proveedor_check;
alter table configuracion
  add constraint configuracion_ia_proveedor_check check (ia_proveedor in ('gemini', 'anthropic', 'openai'));

alter table ia_llaves drop constraint if exists ia_llaves_proveedor_check;
alter table ia_llaves
  add constraint ia_llaves_proveedor_check check (proveedor in ('gemini', 'anthropic', 'openai'));

alter table ia_llaves add column if not exists modelo text;
alter table ia_llaves drop constraint if exists ia_llaves_modelo_check;
alter table ia_llaves
  add constraint ia_llaves_modelo_check check (modelo is null or char_length(btrim(modelo)) between 1 and 80);

alter table ia_llaves alter column llave_cifrada drop not null;
alter table ia_llaves alter column version_clave drop not null;
alter table ia_llaves alter column ultimos_4 drop not null;
alter table ia_llaves drop constraint if exists ia_llaves_ultimos_4_check;
alter table ia_llaves drop constraint if exists ia_llaves_llave_completa_check;
alter table ia_llaves
  add constraint ia_llaves_llave_completa_check check (
    (llave_cifrada is null and version_clave is null and ultimos_4 is null)
    or (llave_cifrada is not null and version_clave is not null and char_length(ultimos_4) = 4)
  );

-- El modelo que había en configuracion pasa al proveedor activo (si ya tenía una fila, se completa; si no, se crea sin llave).
insert into ia_llaves (proveedor, modelo)
select c.ia_proveedor, btrim(c.modelo_ia)
from configuracion c
where c.modelo_ia is not null and btrim(c.modelo_ia) <> ''
on conflict (proveedor) do update set modelo = excluded.modelo
  where ia_llaves.modelo is null;
update configuracion set modelo_ia = null where modelo_ia is not null;
