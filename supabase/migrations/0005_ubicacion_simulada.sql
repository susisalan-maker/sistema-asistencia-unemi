-- Detección de ubicación simulada (GPS falso) al marcar.
--
-- Nuevo tipo de anomalía `ubicacion_simulada`: la app avisa que Android marcó la posición como simulada.
-- La marcación NO se registra; solo queda esta anomalía (sin marcación) para que Talento Humano vea el intento.
--
-- Es seguro correrla más de una vez.
alter type tipo_anomalia add value if not exists 'ubicacion_simulada';
