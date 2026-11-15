"""La fecha que se le da a la IA debe ser la de Ecuador, no la de UTC."""
from app.ia import fecha_para_la_ia


def test_pasa_de_utc_a_hora_de_ecuador():
    assert fecha_para_la_ia("2026-11-09T01:35:12+00:00") == "8 de noviembre de 2026, 20:35 (hora de Ecuador)"


def test_acepta_la_z_del_final():
    assert fecha_para_la_ia("2026-11-09T01:35:00Z") == "8 de noviembre de 2026, 20:35 (hora de Ecuador)"


def test_sin_fecha_devuelve_nada():
    assert fecha_para_la_ia(None) is None
    assert fecha_para_la_ia("") is None


def test_un_texto_que_no_es_fecha_se_deja_igual():
    assert fecha_para_la_ia("sin dato") == "sin dato"
