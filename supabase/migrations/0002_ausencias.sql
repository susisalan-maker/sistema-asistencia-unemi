-- Proceso periódico de ausencias (docs/logica-negocio.md, sección 2.3).
--
-- 1) Nuevo tipo de anomalía `sin_ingreso`: un día laborable sin ninguna marcación.
-- 2) `anomalias.fecha_jornada`: el día (hora de Ecuador) al que se refiere una anomalía del proceso periódico.
--    Con el índice único, correr el proceso dos veces —o dos procesos a la vez— nunca duplica la anomalía de
--    esa persona, de ese tipo, en ese día. Las anomalías que se detectan al marcar la dejan en null.
--
-- Es seguro correrla más de una vez.
alter type tipo_anomalia add value if not exists 'sin_ingreso';

alter table anomalias add column if not exists fecha_jornada date;

create unique index if not exists anomalias_jornada_unica
  on anomalias (usuario_id, tipo, fecha_jornada)
  where fecha_jornada is not null;
