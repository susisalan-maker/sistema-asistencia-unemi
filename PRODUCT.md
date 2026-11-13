# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences with different weight:
- **Usuario** (personal/estudiantes de UNEMI): marca asistencia en segundos, al llegar o salir, normalmente desde el celular (app Expo). La web `/usuario` es solo contingencia (celular perdido, olvidado, dañado, sin batería) y es mínima: marcar y ver el resultado.
- **Administrador**: trabaja en escritorio durante la jornada (`/admin`): gestiona sedes y bloques con mapa, usuarios, revisa anomalías y justificaciones, consulta analítica y bitácora de auditoría, y ajusta parámetros.

## Product Purpose

Sistema de asistencia universitaria con IA (proyecto de titulación, UNEMI, Ingeniería de Software). Registra asistencia con geolocalización (sedes y bloques), verificación facial con detección de vida, detección de anomalías y justificación conversacional. Éxito: marcaciones confiables con mínima fricción para quien marca, y revisión humana eficiente de lo que la IA marca como anómalo.

## Positioning

La IA detecta y propone, pero la decisión final siempre es de una persona (el Administrador). Combina rostro + zona geográfica + reglas de secuencia, con marcación sin conexión firmada en el chip del celular.

## Operating Context

- Cuatro marcaciones por jornada: ingreso, salida a almuerzo, regreso de almuerzo, salida.
- Rutas: `/admin` (solo administradores), `/usuario` (contingencia con motivo obligatorio). Un solo login que redirige por rol.
- La sesión web del usuario se cierra sola tras 10 min de inactividad; siempre hay botón «Cerrar sesión».
- Sin cámara utilizable no se marca. La precisión del GPS tiene un mínimo configurable.
- Stack existente: React + Vite + Tailwind (`frontend/panel-web`), Expo (`frontend/app-movil`), FastAPI, Supabase.

## Capabilities and Constraints

- Los clientes solo leen de Supabase; todo lo que se escribe pasa por el microservicio.
- Permisos por rol aplicados con RLS; nada de seguridad solo en el frontend.
- Estados de marcación: `verificada`, `pendiente`, `fallida`; marcas visibles como «Sin conexión» y origen web/app.
- Rechazar una justificación exige comentario; nadie edita una justificación enviada.
- Pendiente de construir: anomalías, justificación y panel de analítica (parcialmente).

## Brand Commitments

Proyecto de UNEMI. Toda la interfaz y mensajes en español (Ecuador), tono institucional. Identidad institucional (logo/colores) no confirmada: no inventarla.

## Evidence on Hand

Documentación en `docs/` (lógica de negocio, arquitectura, modelo de datos). No hay testimonios, métricas de uso ni cifras de adopción: no fabricarlas.

## Product Principles

1. La persona decide, la IA sugiere: toda anomalía es revisable y explicada.
2. Marcar debe tomar segundos; la fricción se reserva para la seguridad real.
3. Tratar rostro y ubicación como datos sensibles: consentimiento claro, lenguaje sin tono de vigilancia.
4. Los errores explican qué hacer a continuación (cámara, GPS impreciso, hora del celular).
5. El administrador necesita escanear y decidir rápido: densidad y claridad sobre ornamento.

## Accessibility & Inclusion

Cumplimiento de la LOPDP para datos biométricos (consentimiento explícito, retirable). Nivel de accesibilidad (p. ej. WCAG AA) no establecido como requisito; undecidido.
