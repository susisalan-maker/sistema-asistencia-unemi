---
name: Asistencia Universitaria
description: Panel institucional marino y ámbar para registrar y revisar asistencia con rostro y ubicación.
colors:
  marino: "#1b2a6e"
  marino-suave: "#5566a3"
  menu-texto: "#b9c4e4"
  ambar: "#f5a623"
  ambar-tinta: "#20180a"
  lienzo: "#eef1f5"
  cabecera: "#f7f9fc"
  borde: "#dde3ec"
  borde-suave: "#e1e6ef"
  texto: "#3d4658"
  texto-suave: "#6b7488"
  etiqueta: "#8a93a5"
  placeholder: "#9aa3b2"
  celeste: "#e4eaf8"
  ok: "#1e5c3a"
  ok-fondo: "#e8f2ea"
  ok-borde: "#cbe2d2"
  aviso: "#a66e12"
  aviso-fondo: "#fdf0d8"
  aviso-borde: "#f6dfb3"
  error: "#a32a2a"
  error-fondo: "#fbeaea"
  error-borde: "#f0c9c9"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, Helvetica, Arial, sans-serif"
    fontSize: "44px"
    fontWeight: 800
    lineHeight: 1.12
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Plus Jakarta Sans, Helvetica, Arial, sans-serif"
    fontSize: "25px"
    fontWeight: 800
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Plus Jakarta Sans, Helvetica, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  label:
    fontFamily: "Plus Jakarta Sans, Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 800
    letterSpacing: "0.08em"
rounded:
  sm: "10px"
  md: "13px"
  lg: "18px"
  xl: "22px"
  pill: "9999px"
components:
  button-primary:
    backgroundColor: "{colors.ambar}"
    textColor: "{colors.ambar-tinta}"
    rounded: "14px"
    padding: "14px 16px"
  button-marino:
    backgroundColor: "{colors.marino}"
    textColor: "#ffffff"
    rounded: "14px"
    padding: "14px 16px"
  button-borde:
    backgroundColor: "#ffffff"
    textColor: "{colors.marino}"
    rounded: "14px"
    padding: "14px 16px"
  input:
    backgroundColor: "{colors.lienzo}"
    textColor: "{colors.marino}"
    rounded: "{rounded.md}"
    height: "52px"
    padding: "0 16px"
  chip-ok:
    backgroundColor: "{colors.ok-fondo}"
    textColor: "{colors.ok}"
    rounded: "{rounded.pill}"
    padding: "5px 10px"
  chip-neutro:
    backgroundColor: "{colors.celeste}"
    textColor: "{colors.marino}"
    rounded: "{rounded.pill}"
    padding: "5px 10px"
  card-acceso:
    backgroundColor: "#ffffff"
    rounded: "{rounded.xl}"
    padding: "34px"
---

# Design System: Asistencia Universitaria

## Overview

**Creative North Star: "El Registro Confiable"**

Un libro de registro institucional hecho pantalla: sereno, legible y sin dramatismo. El marino profundo da autoridad; el ámbar aparece solo donde hay una acción que hacer. Es institucional y cálido: formal sin ser frío, con esquinas amplias y texto en negrita que se lee rápido tanto en un celular como en el escritorio de quien revisa anomalías.

La densidad es media-alta en el panel de administración (tablas, tarjetas de anomalía, mapa) y baja en la marcación del usuario. Nada comunica vigilancia: los datos de rostro y ubicación se presentan con lenguaje claro y estados explícitos (verificada, pendiente, fallida).

**Key Characteristics:**
- Marino + ámbar sobre un lienzo gris-azulado claro.
- Plus Jakarta Sans en pesos 600–800 casi en todas partes.
- Esquinas redondeadas generosas (10–22px) y chips en píldora.
- Superficies planas con borde; la sombra es la excepción.
- Estados semánticos (ok, aviso, error) siempre con fondo, borde y texto propios.

## Colors

Paleta de dos voces sobre neutros fríos: marino institucional y un único ámbar de acción.

### Primary
- **Marino Institucional** (#1b2a6e): títulos, menú lateral, panel de bienvenida, texto de campos y botones secundarios.
- **Ámbar de Acción** (#f5a623): el botón primario y el visto de la marca. Texto encima en **Tinta Ámbar** (#20180a).

### Neutral
- **Lienzo** (#eef1f5): fondo de pantalla y de los campos.
- **Cabecera de Tabla** (#f7f9fc), **Borde** (#dde3ec), **Borde Suave** (#e1e6ef): estructura de tablas y tarjetas.
- **Texto** (#3d4658), **Texto Suave** (#6b7488), **Etiqueta** (#8a93a5), **Placeholder** (#9aa3b2): jerarquía de lectura.
- **Celeste** (#e4eaf8): avatares, chips neutros y anillo de foco. **Marino Suave** (#5566a3) y **Menú Texto** (#b9c4e4): iconos y texto inactivos sobre marino.

### Semantic
- **Ok** (#1e5c3a / fondo #e8f2ea / borde #cbe2d2), **Aviso** (#a66e12 / #fdf0d8 / #f6dfb3), **Error** (#a32a2a / #fbeaea / #f0c9c9).

### Named Rules
**The One Action Rule.** El ámbar identifica la acción principal de la pantalla y la marca; no se usa como decoración ni para estados.
**The Triplet Rule.** Cada estado semántico se expresa con su trío fondo + borde + texto, nunca con color de texto solo.

## Typography

**Display / Body / Label Font:** Plus Jakarta Sans (con Helvetica, Arial, sans-serif)

**Character:** Geométrica y amable, usada en peso fuerte para dar firmeza institucional sin serifas.

### Hierarchy
- **Display** (800, 44px, 1.12): solo el titular del panel de bienvenida del acceso.
- **Headline** (800, 25px, tracking -0.025em): título de tarjetas y pantallas de acceso.
- **Title** (800, 14–16px): nombres de marca, botones y encabezados de bloque.
- **Body** (600, 15px): texto de campos y contenido; 14px para ayudas.
- **Label** (800, 11–12px, +0.07–0.08em, MAYÚSCULAS): etiquetas de campo y encabezados de columna.

### Named Rules
**The Heavy Label Rule.** Las etiquetas pequeñas van siempre en mayúsculas con tracking amplio y peso 800; el peso compensa el tamaño.

## Layout

Aplicación con menú lateral marino y área de contenido sobre lienzo. El acceso usa dos columnas (44 % marino, máx. 560px) que colapsan a una tarjeta centrada bajo `lg`. Las tablas miden su propio contenedor (container queries): a menos de 56rem (7–6 columnas) o 42rem (5–4) cada fila pasa a tarjeta con etiquetas por celda, porque el menú lateral le quita ancho. Espaciado en pasos de 4px; campos de 52px de alto para tocar con comodidad.

## Elevation & Depth

Plano por defecto: la profundidad la dan el borde fino y el cambio de fondo (blanco sobre lienzo). Las sombras son acentos, no un sistema.

### Shadow Vocabulary
- **Acción ámbar** (`0 6px 16px rgba(245,166,35,.3)`; `0 4px 12px` en tamaños menores): solo botón primario.
- **Acción marino** (`0 4px 10px rgba(27,42,110,.35)`): botón marino.
- **Reposo de tarjeta** (`0 2px 8px rgba(27,42,110,.04)`): tarjetas de lista, apenas perceptible.
- **Flotante** (`0 10px 24px rgba(27,42,110,.12)`): menús desplegables.
- **Modal / tarjeta de acceso** (`0 24px 60px rgba(27,42,110,.14–.22)`; acceso `0 14px 40px rgba(27,42,110,.08)`): diálogos.

### Named Rules
**The Flat-Until-Floating Rule.** Una superficie solo lleva sombra notable si flota sobre otra (menú, modal) o es la acción principal.

## Shapes

Esquinas amplias y suaves: 10px (controles pequeños), 11–14px (botones y campos, el más frecuente), 18–22px (tarjetas y diálogos) y píldora completa para chips, avatares y badges. Bordes de 1px en `borde`/`borde-suave`. La marca es un cuadrado de esquina 24/96 con anillo punteado (la geocerca) y un visto ámbar.

## Components

### Buttons
- **Shape:** esquina 14px, ancho completo por defecto, texto 16px peso 800.
- **Primary (ámbar):** fondo ámbar, texto tinta, sombra ámbar; hover oscurece (`brightness-95`).
- **Marino:** fondo marino, texto blanco; hover aclara (`brightness-110`).
- **Borde:** blanco con borde, texto marino; hover a lienzo.
- **Cargando / deshabilitado:** texto «Un momento…», opacidad 60 %.

### Chips
- **Style:** píldora, 11px peso 800, trío semántico (ok, aviso, error) o neutro celeste con texto marino. No se parte en dos líneas.

### Cards / Containers
- **Corner Style:** 18–22px. **Background:** blanco sobre lienzo. **Border:** 1px `borde-suave`. **Shadow:** reposo o ninguna. **Padding:** 32–34px en acceso, menos en listas.

### Inputs / Fields
- **Style:** 52px de alto, esquina 13px, fondo lienzo, borde `borde`, texto marino 15px peso 600, etiqueta superior en mayúsculas.
- **Focus:** borde marino + anillo de 2px celeste. Contraseña con botón «Ver/Ocultar» alineado a la derecha.

### Alerts (Aviso)
- Bloque de esquina 12px con trío semántico, texto 14px peso 700; `role="alert"` para error, `status` para el resto.

### Toasts
- Entran con deslizamiento de 8px en 200ms (solo si no hay preferencia de movimiento reducido) y una barra marca el tiempo restante.

### Tables
- Cabecera `cabecera` con etiquetas en mayúsculas; filas que se vuelven tarjetas de dos columnas al estrecharse.

## Do's and Don'ts

### Do:
- **Do** usar ámbar solo para la acción principal y la marca (The One Action Rule).
- **Do** expresar todo estado con fondo, borde y texto semánticos juntos.
- **Do** mantener etiquetas en mayúsculas, peso 800, tracking +0.08em.
- **Do** respetar `prefers-reduced-motion` en toda animación.
- **Do** redactar en español de Ecuador, tono institucional y explicativo ante errores.

### Don't:
- **Don't** añadir sombras a superficies en reposo más allá de la sombra de reposo apenas perceptible.
- **Don't** usar rojo o ámbar para decorar; son semántica.
- **Don't** introducir otra familia tipográfica ni pesos menores a 600 en texto de interfaz.
- **Don't** usar lenguaje o iconografía de vigilancia para rostro y ubicación.
- **Don't** inventar identidad institucional de UNEMI (logo, colores) sin que se confirme.
