from er import *
exec(open("mer.py").read().split("F = ")[0])  # T
xL, wL, xR = 26, 152, 212
C = Lienzo(430, 525)
C.tabla("usuarios", [T["usuarios"][0]], xL, 8, 80, stub=True)
C.tabla("marcaciones", [T["marcaciones"][0]], xL, 44, 80, stub=True)
C.tabla("anomalias", T["anomalias"], xL, 86, wL)
C.tabla("justificaciones", T["justificaciones"], xL, 282, wL)
C.tabla("mensajes_chat", T["mensajes_chat"], xL, 432, wL)
C.tabla("bitacora", T["bitacora"], xR, 8, 182)
C.tabla("configuracion", T["configuracion"], xR, 158, 182)
C.tabla("feriados", T["feriados"], xR, 342, 100)
C.tabla("ia_claves", T["ia_claves"], xR + 107, 342, 105)
P = C.puerto
u = P("usuarios", "id", "w"); a_u = P("anomalias", "usuario_id", "w")
C.rel([u, (8, u[1]), (8, a_u[1]), a_u], "||", "o<")
m = P("marcaciones", "id", "w"); a_m = P("anomalias", "marcacion_id", "w")
C.rel([m, (14, m[1]), (14, a_m[1]), a_m], "o|", "o<")
a = P("anomalias", "id", "e"); j_a = P("justificaciones", "anomalia_id", "e")
C.rel([a, (189, a[1]), (189, j_a[1]), j_a], "||", "o|")
j = P("justificaciones", "id", "w"); mc = P("mensajes_chat", "justificacion_id", "w")
C.rel([j, (12, j[1]), (12, mc[1]), mc], "||", "o<")
ue = P("usuarios", "id", "e"); j_r = P("justificaciones", "revisado_por", "e"); b_u = P("bitacora", "usuario_id", "w")
C.rel([ue, (196, ue[1]), (196, j_r[1]), j_r], "o|", "o<")
C.rel([(196, b_u[1]), b_u], None, "o<")
C.s = None
C.guardar("F07b_mer_anomalias.png")
