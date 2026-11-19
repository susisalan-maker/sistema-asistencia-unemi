"""MER actualizado (esquema real de Supabase, 16/11/2026) en Graphviz, notación pata de gallo."""
T = {
 "usuarios": [("id","uuid","PK, FK"),("nombres","text",""),("apellidos","text",""),("email","text","UQ"),("rol","enum",""),("sede_id","uuid","FK"),("bloque_id","uuid","FK"),("jornada_inicio","time",""),("jornada_fin","time",""),("dias_laborables","smallint[]",""),("dispositivo_id","text",""),("clave_publica","text",""),("clave_evidencia","jsonb",""),("clave_registrada_at","timestamptz",""),("push_token","text",""),("fecha_registro_rostro","timestamptz",""),("fecha_consentimiento_biometrico","timestamptz",""),("activo","boolean","")],
 "sedes": [("id","uuid","PK"),("nombre","text",""),("latitud","float8",""),("longitud","float8",""),("radio_metros","integer",""),("permite_fuera_geocerca","boolean",""),("activa","boolean","")],
 "bloques": [("id","uuid","PK"),("sede_id","uuid","FK"),("nombre","text",""),("latitud","float8",""),("longitud","float8",""),("radio_metros","integer",""),("activo","boolean","")],
 "marcaciones": [("id","uuid","PK"),("usuario_id","uuid","FK"),("sede_id","uuid","FK"),("bloque_id","uuid","FK"),("tipo","enum",""),("fecha_hora","timestamptz",""),("latitud","float8",""),("longitud","float8",""),("precision_m","real",""),("origen","enum",""),("dispositivo_id","text",""),("motivo_contingencia","enum",""),("verificacion","enum",""),("similitud_score","real",""),("sin_conexion","boolean",""),("firmada","boolean",""),("firma","text",""),("created_at","timestamptz","")],
 "rostros": [("id","uuid","PK"),("usuario_id","uuid","FK, UQ"),("vectores_cifrados","bytea",""),("version_clave","smallint",""),("created_at","timestamptz","")],
 "anomalias": [("id","uuid","PK"),("numero","bigint","UQ"),("marcacion_id","uuid","FK"),("usuario_id","uuid","FK"),("tipo","enum",""),("detector","enum",""),("score","real",""),("descripcion_ia","text",""),("detalle","text",""),("intentos_fallidos","smallint",""),("estado","enum",""),("fecha_jornada","date",""),("fecha_vencimiento","timestamptz",""),("created_at","timestamptz","")],
 "justificaciones": [("id","uuid","PK"),("anomalia_id","uuid","FK, UQ"),("resumen_ia","text",""),("clasificacion_ia","enum",""),("confianza_ia","real",""),("decision_final","enum",""),("comentario_admin","text",""),("revisado_por","uuid","FK"),("fecha_decision","timestamptz",""),("created_at","timestamptz","")],
 "mensajes_chat": [("id","uuid","PK"),("justificacion_id","uuid","FK"),("emisor","enum",""),("contenido","text",""),("created_at","timestamptz","")],
 "bitacora": [("id","uuid","PK"),("usuario_id","uuid","FK"),("evento","enum",""),("entidad","text",""),("entidad_id","text",""),("campo","text",""),("valor_anterior","text",""),("valor_nuevo","text",""),("motivo","text",""),("created_at","timestamptz","")],
 "configuracion": [("id","smallint","PK (= 1)"),("tolerancia_min","integer",""),("plazo_justificacion_h","integer",""),("plazo_revision_h","integer",""),("almuerzo_max_min","integer",""),("velocidad_max_kmh","integer",""),("max_marcaciones_web_30d","integer",""),("max_horas_sin_conexion","smallint",""),("precision_max_app_m","smallint",""),("precision_max_web_m","smallint",""),("ia_proveedor","text",""),("modelo_ia","text",""),("umbrales faciales (11)","numeric, int","")],
 "feriados": [("id","uuid","PK"),("nombre","text",""),("fecha_inicio","date",""),("fecha_fin","date",""),("activo","boolean","")],
 "ia_claves": [("id","uuid","PK"),("nombre","text",""),("proveedor","text",""),("modelo","text",""),("llave_cifrada","bytea",""),("version_clave","smallint",""),("ultimos_4","text",""),("activa","boolean","")],
 "auth.users": [("id","uuid","PK")],
}
F = "DejaVu Sans"
def nodo(n, cols):
    head = "#1b2a6e" if n != "auth.users" else "#6b7488"
    filas = "".join(
        f'<TR><TD PORT="{c}" ALIGN="LEFT" BALIGN="LEFT">{"<B>"+c+"</B>" if "PK" in k else c}</TD>'
        f'<TD ALIGN="LEFT">{("<FONT COLOR=\"#444444\">"+t+"</FONT>")}</TD><TD ALIGN="LEFT">{("<FONT COLOR=\"#a32a2a\">"+k+"</FONT>") if k else " "}</TD></TR>'
        for c, t, k in cols)
    return (f'"{n}" [label=<<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="2">'
            f'<TR><TD COLSPAN="3" BGCOLOR="{head}"><FONT COLOR="white"><B>{n}</B></FONT></TD></TR>{filas}</TABLE>>];')
# (hijo.col -> padre.col, cardinalidad del lado padre, del lado hijo)
R = [("usuarios","id","auth.users","id","tee","teeodot"),
     ("usuarios","sede_id","sedes","id","teeodot","crowodot"),
     ("bloques","sede_id","sedes","id","teetee","crowodot"),
     ("marcaciones","usuario_id","usuarios","id","teetee","crowodot"),
     ("marcaciones","sede_id","sedes","id","teetee","crowodot"),
     ("marcaciones","bloque_id","bloques","id","teeodot","crowodot"),
     ("rostros","usuario_id","usuarios","id","teetee","teeodot"),
     ("anomalias","usuario_id","usuarios","id","teetee","crowodot"),
     ("anomalias","marcacion_id","marcaciones","id","teeodot","crowodot"),
     ("justificaciones","anomalia_id","anomalias","id","teetee","teeodot"),
     ("justificaciones","revisado_por","usuarios","id","teeodot","crowodot"),
     ("mensajes_chat","justificacion_id","justificaciones","id","teetee","crowodot"),
     ("bitacora","usuario_id","usuarios","id","teeodot","crowodot")]
L = ['digraph MER {', 'graph [rankdir=LR, nodesep=0.25, ranksep=0.55, splines=spline, pad=0.1, fontname="%s"];' % F,
     f'node [shape=plain, fontname="{F}", fontsize=10];', f'edge [dir=both, arrowsize=0.9, penwidth=1.1, fontname="{F}"];']
for n, c in T.items(): L.append(nodo(n, c))
for h, hc, p, pc, ap, ah in R:
    L.append(f'"{p}":"{pc}":e -> "{h}":"{hc}":w [arrowtail={ap}, arrowhead={ah}];')
L.append('{rank=same; "auth.users"; "sedes";}')
L.append('{rank=same; "configuracion"; "feriados"; "ia_claves";}')
L.append('"auth.users" -> "configuracion" [style=invis]; "sedes" -> "feriados" [style=invis];')
L.append('}')
open("mer.dot","w").write("\n".join(L))
