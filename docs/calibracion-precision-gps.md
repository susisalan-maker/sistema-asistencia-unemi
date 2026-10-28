# Cómo elegir la precisión mínima de la ubicación (calibración)

Esta guía responde a una pregunta concreta: **¿qué número pongo en «Precisión mínima de la ubicación»?** Nadie lo da hecho; se decide midiendo en las sedes reales. Aquí está cómo.

## 1. Qué es ese número

Cuando el celular (o el navegador) te da tu posición, también dice **cuánto se puede equivocar**: «±12 m» significa «estás a unos 12 metros, más o menos, del punto que te muestro». Es el radio de un círculo de incertidumbre alrededor del punto (en Android y en los navegadores, `accuracy`: hay ~68 % de probabilidad de estar dentro de ese círculo).

El sistema usa ese dato así:

- Si la incertidumbre es **menor o igual** que el límite → la marcación sigue su camino normal (rostro, zona, horario…).
- Si es **mayor** → no se deja marcar y se le dice a la persona: *«La precisión de tu ubicación es de ±80 m y para marcar se necesita ±50 m o menos. Acércate a una ventana o sal a un lugar abierto, espera unos segundos e inténtalo de nuevo»*.
- Si el equipo **no informa** la precisión, no se rechaza (no hay con qué comparar); el dato queda vacío.

**Por qué importa:** si el celular dice «estás dentro del bloque» pero puede errar por 300 m, esa frase no vale nada. El límite garantiza que «dentro de la zona» sea una afirmación creíble.

Son **dos números**, porque los equipos son muy distintos:

| Parámetro (panel → Configuración → Parámetros → Seguridad de la marcación) | Columna | Rango que acepta | Valor inicial |
|---|---|---|---|
| Precisión mínima de la ubicación en la app | `configuracion.precision_max_app_m` | 5 a 500 m | **50 m** |
| Precisión mínima de la ubicación en la web | `configuracion.precision_max_web_m` | 10 a 2000 m | **200 m** |

> **50 m y 200 m son valores provisionales** (un punto de partida razonable, no un estándar). Con ellos el sistema ya funciona; esta guía sirve para afinarlos.

## 2. Quién elige el número

**Lo elige la institución** (Talento Humano con apoyo de quien administra el sistema), **basándose en mediciones propias**. No existe una cifra oficial: depende de los celulares que usa el personal, de cómo son los edificios (techos de losa, subsuelos, patios abiertos) y de qué tan grandes son los bloques de marcación.

En la sustentación se puede decir: *«los límites iniciales son provisionales y se calibran con la metodología de este documento, a partir de la precisión que realmente reportan los equipos en cada sede»*.

## 3. Las dos reglas que acotan el número

1. **Techo — no más que el radio del bloque.** Si el límite es mayor que el radio del bloque más pequeño de la sede, el sistema aceptaría ubicaciones tan inciertas que «dentro del bloque» y «fuera del bloque» no se distinguen. Ejemplo: bloque de 60 m de radio → límite máximo 60 m (mejor, algo menos).
2. **Piso — que la gente correcta pueda marcar.** Si el límite es más exigente de lo que los celulares logran normalmente dentro del edificio, se bloqueará a personas que sí están donde deben. El piso lo da la medición: el **percentil 90–95** de las precisiones que reportan las marcaciones legítimas en esa sede (ver paso B). Con eso se bloquea como mucho a 1 de cada 10–20 intentos, y esos son justamente los de peor señal.

**El número final está entre el piso y el techo.** Si el piso es mayor que el techo (los celulares no logran la precisión que pide el bloque), el problema no es el límite: hay que agrandar el bloque o mejorar las condiciones (por ejemplo, marcar en la entrada, junto a una ventana).

## 4. Orden de magnitud (para tener una idea, no para decidir)

| Situación | Lo normal que reporta un celular | Lo normal que reporta un computador |
|---|---|---|
| Al aire libre, cielo despejado | ±3 a ±10 m | (sin GPS) ±20 a ±500 m |
| Dentro de un edificio, junto a una ventana | ±10 a ±30 m | (sin GPS) ±30 a ±1000 m |
| Dentro de un edificio, lejos de ventanas / subsuelo | ±30 m hasta sin ubicación | por red wifi: ±50 a ±200 m |

Un computador de escritorio **no tiene GPS**: el navegador estima la posición por la red wifi o la IP, y suele fallar por decenas o cientos de metros. Por eso la web tiene un límite aparte y más holgado (200 m).

## 5. Paso A — Medición en campo (una mañana, sin programar nada)

Sirve para sedes nuevas o antes de ajustar. Necesitas 2 o 3 celulares distintos (de gama baja y media: son los que usa el personal) y, si habrá marcación web, 1 o 2 computadores.

1. Elige los **puntos reales donde la gente marca**: la entrada, el pasillo del bloque, el interior de la oficina, el parqueadero.
2. En cada punto, con cada equipo, abre la pantalla de marcar (app: aviso previo; web: Inicio) y **anota el «±X m»** que se muestra. Repite 3 veces, esperando 20–30 segundos entre cada una (el GPS mejora al estabilizarse).
3. Anota también la hora y si estabas adentro o afuera.
4. Pon los datos en una tabla como esta:

| Punto | Equipo | Medición 1 | Medición 2 | Medición 3 | Observación |
|---|---|---|---|---|---|
| Entrada principal | Celular A | ±8 | ±6 | ±7 | afuera |
| Oficina, 2.º piso | Celular A | ±24 | ±19 | ±31 | junto a ventana |
| Oficina, 2.º piso | Celular B | ±42 | ±38 | ±55 | lejos de ventana |
| Oficina | Computador | ±110 | ±105 | ±240 | por wifi |

5. Ordena todas las mediciones **de la app** de menor a mayor y mira cuál deja fuera solo a las peores 5–10 %. Ese es el piso de la app. Haz lo mismo con las de la web.

## 6. Paso B — Con las marcaciones que ya hizo el sistema (la forma más fiable)

Cada marcación guarda en `marcaciones.precision_m` la incertidumbre que informó el equipo. Después de unas semanas de uso real, esta consulta (Supabase → SQL Editor) da el percentil 90 y 95 por sede y canal, solo con marcaciones **con conexión** y **dentro de la zona** (las legítimas):

```sql
select m.origen, s.nombre as sede, count(*) as marcaciones,
       round(percentile_cont(0.5)  within group (order by m.precision_m)::numeric, 1) as mediana_m,
       round(percentile_cont(0.9)  within group (order by m.precision_m)::numeric, 1) as p90_m,
       round(percentile_cont(0.95) within group (order by m.precision_m)::numeric, 1) as p95_m,
       round(max(m.precision_m)::numeric, 1) as maximo_m
from marcaciones m
join sedes s on s.id = m.sede_id
where m.precision_m is not null
  and m.sin_conexion = false
  and not exists (select 1 from anomalias a where a.marcacion_id = m.id and a.tipo = 'fuera_geocerca')
group by m.origen, s.nombre
order by s.nombre, m.origen;
```

Para ver el radio de los bloques de una sede (el techo del paso 3):

```sql
select s.nombre as sede, b.nombre as bloque, b.radio_metros
from bloques b join sedes s on s.id = b.sede_id
where b.activo order by s.nombre, b.radio_metros;
```

**Cómo leer el resultado:**

- Toma el `p95_m` (o `p90_m`) de la app y redondea **hacia arriba** a un número cómodo (10, 20, 25, 30, 40, 50…).
- Compáralo con el radio del bloque más pequeño de esa sede: el límite no debe pasarlo.
- Haz lo mismo con la web.

> **Ojo con estas dos limitaciones:** (1) con pocas marcaciones los percentiles no dicen nada (hacen falta, al menos, unas decenas por sede y canal); (2) las marcaciones **rechazadas por precisión no se guardan**, así que esta consulta solo ve a quienes sí pudieron marcar. Si el límite quedó muy bajo, la señal será que la gente se queja de «no me deja marcar», no que los números salgan mal.

### Ejemplo con los datos de prueba actuales (pocos; solo ilustran)

| Canal | Marcaciones | Mediana | Máximo |
|---|---|---|---|
| App | 3 | ~9 m | 12 m |
| Web | 3 | ~106 m | 108 m |

Con tan pocos datos no se puede concluir, pero muestran lo esperado: el celular reporta decenas de metros o menos y el computador, más de cien. Con 50 m en la app y 200 m en la web, todas esas marcaciones habrían pasado.

## 7. Cómo decidir (resumen en tres líneas)

1. **Mide** (paso A) o **consulta** (paso B) → obtén el percentil 95 de cada canal.
2. **Redondea hacia arriba** y comprueba que no supere el radio del bloque más pequeño.
3. **Guarda el número** en el panel y **pruébalo** (sección 8). Revísalo a las 2–4 semanas con la consulta del paso B y cuando cambien los celulares, los edificios o los bloques.

Reglas prácticas:

| Si ocurre esto | Qué hacer |
|---|---|
| Hay quejas de «no me deja marcar» y el personal está de verdad en el lugar | Sube el límite un poco (de a 10 m en la app, de a 50 m en la web) o revisa si el bloque queda en un sitio con mala señal |
| Marcan personas con ubicaciones muy imprecisas y salen muchas anomalías `fuera_geocerca` dudosas | Baja el límite, sin pasar del piso medido |
| El piso medido es mayor que el radio del bloque | No cambies el límite: agranda el bloque (Sedes → bloque) o pide marcar en un punto con mejor señal |
| La web casi nunca se usa | Deja 200 m; la web es contingencia y ya tiene su propia vigilancia (`uso_recurrente_web`) |

## 8. Cómo cambiarlo y probarlo

1. Entra al panel como Administrador → **Configuración → Parámetros → Seguridad de la marcación**.
2. Cambia **«Precisión mínima de la ubicación en la app»** y/o **«… en la web»** → *Guardar cambios* → confirma el antes y el después. Se aplica de inmediato, sin reiniciar nada, y queda en la bitácora.
3. **Para probar que funciona:** pon un valor muy bajo (5 m en la app) y trata de marcar dentro de un edificio. Debe aparecer *«La precisión de tu ubicación es de ±XX m y para marcar se necesita ±5 m o menos…»* y el botón «Iniciar verificación facial» (app) o «Registrar asistencia» (web) no debe dejarte seguir hasta que la medición mejore. **Vuelve a dejar el valor real** al terminar.

## 9. Qué cubre y qué no

- **Se aplica a las marcaciones con conexión**, en la app y en la web. La app y la web consultan el límite antes de marcar (`GET /marcaciones/zona`) y avisan antes de gastar una verificación facial; el servidor lo vuelve a comprobar al registrar (`precision_insuficiente`), antes de analizar el rostro.
- **No se aplica a las marcaciones sin conexión**: se hacen cuando la persona no puede repetirlas y, además, la app no conoce el límite sin internet. Su `precision_m` queda guardada como evidencia para auditoría.
- **No es una defensa contra el GPS falso.** La precisión la informa el propio equipo. El control contra ubicaciones simuladas es otro (`ubicacion_simulada`, anomalía del mismo nombre). Este límite protege la **calidad** del dato de ubicación, no su autenticidad.
- Las marcaciones rechazadas por precisión **no dejan anomalía**: no es una falta de la persona, solo una medición insuficiente que se corrige acercándose a una ventana o saliendo a un lugar abierto.

## 10. Para la documentación del trabajo de grado

Puntos que Dayanara puede citar (sin inventar cifras):

- El sistema valida la **precisión de la ubicación** informada por el dispositivo y rechaza marcaciones cuya incertidumbre supere un límite configurable por canal (app y web).
- Los límites son **parámetros del Administrador** (`precision_max_app_m`, `precision_max_web_m`), no valores fijos en el código, con cambios registrados en la bitácora.
- Los valores iniciales (50 m y 200 m) son **provisionales**; la metodología para calibrarlos es la de este documento (medición en campo y percentil 95 de las precisiones reales por sede y canal, sin superar el radio del bloque).
- Limitación declarada: no aplica a marcaciones sin conexión, y la precisión es autoinformada por el dispositivo.
