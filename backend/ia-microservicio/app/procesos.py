"""Proceso periódico de ausencias: genera `sin_ingreso`, `sin_salida` y `sin_regreso_almuerzo`.

Lo dispara un programador externo (ver README) llamando a POST /procesos/ausencias cada 15–30 minutos. Es
idempotente: se puede ejecutar las veces que se quiera, porque cada anomalía queda amarrada al día de la jornada
(`fecha_jornada`) y la base impide duplicarla. Las reglas están en `app/reglas_ausencia.py`.
"""
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from app import reglas_ausencia as reglas
from app.reglas_marcacion import a_local, limites_del_dia
from app.supabase_client import SupabaseClient, SupabaseError


def _iso(momento: datetime) -> str:
    return momento.astimezone(timezone.utc).isoformat()


async def ejecutar_ausencias(sb: SupabaseClient, ahora: datetime, gracia_min: int, dias_atras: int) -> dict:
    hoy = a_local(ahora).date()
    primer_dia = hoy - timedelta(days=dias_atras)
    resumen: dict = {
        "personas": 0, "jornadas_revisadas": 0, "ya_registradas": 0,
        "creadas": {t: 0 for t in reglas.TIPOS_AUSENCIA}, "pasaron_a_sin_justificar": 0,
    }

    usuarios = await sb.usuarios_para_ausencias()
    resumen["personas"] = len(usuarios)
    if usuarios:
        desde, _ = limites_del_dia(datetime.combine(primer_dia, datetime.min.time(), tzinfo=reglas.ZONA_LOCAL))
        marcaciones = await sb.marcaciones_de_todos(_iso(desde), _iso(ahora + timedelta(minutes=1)))
        feriados = await sb.feriados_activos_entre(primer_dia.isoformat(), hoy.isoformat())
        previas = {
            (a["usuario_id"], a["fecha_jornada"]) for a in await sb.ausencias_registradas(primer_dia.isoformat(), hoy.isoformat())
        }

        por_dia: dict[tuple[str, str], list[dict]] = defaultdict(list)
        for m in marcaciones:  # ya vienen de la más antigua a la más reciente
            por_dia[(m["usuario_id"], a_local(datetime.fromisoformat(m["fecha_hora"])).date().isoformat())].append(m)

        for u in usuarios:
            for dia in reglas.dias_a_revisar(ahora, u, feriados, gracia_min, dias_atras):
                resumen["jornadas_revisadas"] += 1
                if (u["id"], dia.isoformat()) in previas:
                    resumen["ya_registradas"] += 1
                    continue
                resultado = reglas.evaluar_jornada(dia, por_dia.get((u["id"], dia.isoformat()), []), u)
                if resultado is None:
                    continue
                hallazgo, marcacion_id = resultado
                try:
                    await sb.insertar_anomalia(
                        {
                            "usuario_id": u["id"],
                            "marcacion_id": marcacion_id,
                            "tipo": hallazgo.tipo,
                            "detector": "regla",
                            "detalle": hallazgo.descripcion,
                            "fecha_jornada": dia.isoformat(),
                        }
                    )
                except SupabaseError as e:
                    # Otro proceso la creó un instante antes: el índice único lo impide y no es un error.
                    if e.status == 409 and "duplicate" in e.message.lower():
                        resumen["ya_registradas"] += 1
                        continue
                    raise
                resumen["creadas"][hallazgo.tipo] += 1

    # Aprovecha la misma corrida para cerrar los plazos vencidos (así no hace falta pg_cron).
    resumen["pasaron_a_sin_justificar"] = await sb.marcar_sin_justificar()
    return resumen
