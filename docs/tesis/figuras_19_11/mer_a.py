from er import *
exec(open("mer.py").read().split("F = ")[0])  # T
xL, wL, xR, wR = 12, 209, 250, 156
C = Lienzo(436, 470)
C.tabla("auth.users", T["auth.users"], xL + (wL - 70) / 2, 8, 70)
C.tabla("usuarios", T["usuarios"], xL, 55, wL)
C.tabla("rostros", T["rostros"], xL, 290, 170)
C.tabla("sedes", T["sedes"], xR, 8, wR)
C.tabla("bloques", T["bloques"], xR, 124, wR)
C.tabla("marcaciones", T["marcaciones"], xR, 240, wR)
t = C.t
cx = xL + wL / 2
C.rel([(cx, t["auth.users"]["y"] + t["auth.users"]["h"]), (cx, 55)], "||", "o|")
u_id = C.puerto("usuarios", "id", "w"); r_u = C.puerto("rostros", "usuario_id", "w")
C.rel([u_id, (5, u_id[1]), (5, r_u[1]), r_u], "||", "o|")
s_id = C.puerto("sedes", "id", "w"); u_s = C.puerto("usuarios", "sede_id", "e")
C.rel([s_id, (233, s_id[1]), (233, u_s[1]), u_s], "o|", "o<")
u_ide = C.puerto("usuarios", "id", "e"); m_u = C.puerto("marcaciones", "usuario_id", "w")
C.rel([u_ide, (236, u_ide[1]), (236, m_u[1]), m_u], "||", "o<", saltos=[(233, u_ide[1])])
s_ide = C.puerto("sedes", "id", "e"); b_s = C.puerto("bloques", "sede_id", "e"); m_s = C.puerto("marcaciones", "sede_id", "e")
b_id = C.puerto("bloques", "id", "e"); m_b = C.puerto("marcaciones", "bloque_id", "e")
C.rel([b_id, (418, b_id[1]), (418, m_b[1]), m_b], "o|", "o<")
C.rel([s_ide, (424, s_ide[1]), (424, b_s[1]), b_s], "||", "o<", saltos=[(418, b_s[1])])
C.rel([s_ide, (430, s_ide[1]), (430, m_s[1]), m_s], "||", "o<", saltos=[(418, m_s[1]), (424, m_s[1])])
b_w = C.puerto("bloques", "id", "w"); u_b = C.puerto("usuarios", "bloque_id", "e")
print(b_w, u_b)
C.rel([b_w, (u_b[0], b_w[1])], "o|", "o<", saltos=[(236, b_w[1])])
C.guardar("F07a_mer_marcacion.png")
