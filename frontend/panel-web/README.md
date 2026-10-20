# panel-web

App web (React + Vite + TypeScript + Tailwind) con dos áreas por rol:
- `/admin` — Talento Humano (hoy: Usuarios con alta por invitación y edición de horario, Sedes y bloques con mapa y Feriados; el resto del menú aparece deshabilitado).
- `/usuario` — contingencia del Usuario (hoy: pantalla de inicio vacía).

Páginas públicas: `/login`, `/aceptar-invitacion`, `/recuperar-contrasena`, `/restablecer-contrasena`.

El estilo (colores, tipografía, componentes) sale del mockup «Asistencia Universitaria 4.0 Completo» y está definido como *tokens* en `src/index.css` (`@theme`) y en `src/components/ui.tsx`.

## Correr en local

```bash
cd panel-web
npm install
cp .env.example .env.local     # completar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (públicas)
npm run dev                    # http://localhost:5173
```

El panel necesita el microservicio corriendo (`VITE_API_URL`) para crear usuarios, reenviar invitaciones y guardar sedes y bloques. El mapa usa Leaflet + OpenStreetMap (sin API key) y se descarga solo al abrir una pantalla con mapa; necesita internet para mostrar los mosaicos. El buscador de lugares usa Photon (`photon.komoot.io`, gratis, uso razonable y sin garantía de disponibilidad): se consulta al dejar de escribir, solo con el texto buscado y limitado a Ecuador; si falla, se puede elegir el punto en el mapa o escribir las coordenadas.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Pruebas (Vitest) |
| `npm run build` | Compila para producción (revisa tipos) |
| `npm run lint` | Revisión de código (oxlint) |

## Reglas
- Solo se usa la **anon key** de Supabase. La `service_role key` jamás va aquí.
- Este cliente solo **lee** de Supabase; lo que se escribe (usuarios, etc.) pasa por el microservicio.
