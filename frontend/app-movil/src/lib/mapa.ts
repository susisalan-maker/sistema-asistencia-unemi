/** Lo que el mapa necesita dibujar: el círculo de la zona y, si se conoce, dónde está la persona. */
export interface DatosMapa {
  centro: { latitud: number; longitud: number }
  radio_m: number
  usuario: { latitud: number; longitud: number } | null
  dentro: boolean
}

/** «42 m», «950 m», «7,5 km» (coma decimal, sin decimales por debajo de 10 km redondos). */
export function formatoDistancia(metros: number): string {
  if (metros < 1000) return `${Math.round(metros)} m`
  const km = metros / 1000
  return `${(km >= 100 ? Math.round(km) : Math.round(km * 10) / 10).toString().replace('.', ',')} km`
}

const num = (n: number) => (Number.isFinite(n) ? n : 0)

/**
 * Página con el mapa de OpenStreetMap (Leaflet, sin llave ni cuenta): la misma que usa el panel web.
 * Dibuja el círculo de la zona y un punto con la posición de la persona, y encuadra ambos.
 */
export function htmlDelMapa(d: DatosMapa): string {
  const datos = JSON.stringify({
    c: [num(d.centro.latitud), num(d.centro.longitud)],
    r: num(d.radio_m),
    u: d.usuario ? [num(d.usuario.latitud), num(d.usuario.longitud)] : null,
    dentro: d.dentro,
  })
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#m{margin:0;height:100%;background:#e4eaf8}.leaflet-control-attribution{font-size:9px}</style>
</head><body><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var d=${datos};
var m=L.map('m',{zoomControl:false,attributionControl:true});
var base=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(m);
// la app muestra un esqueleto hasta que los mosaicos terminan de bajar
base.on('load',function(){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage('listo');});
L.circle(d.c,{radius:d.r,color:'#1b2a6e',weight:2,fillColor:'#1b2a6e',fillOpacity:0.1}).addTo(m);
var b=L.latLng(d.c).toBounds(d.r*2);   // el recuadro se calcula sin que el círculo esté ya en el mapa
if(d.u){
  L.circleMarker(d.u,{radius:8,color:'#ffffff',weight:3,fillColor:d.dentro?'#1e5c3a':'#f5a623',fillOpacity:1}).addTo(m);
  b.extend(d.u);
}
function encuadrar(){m.invalidateSize();m.fitBounds(b,{padding:[24,24],maxZoom:18});}
encuadrar();
// en el WebView el contenedor puede medir 0 al arrancar: se vuelve a encuadrar cuando ya tiene tamaño
window.addEventListener('load',encuadrar);
window.addEventListener('resize',encuadrar);
setTimeout(encuadrar,300);
</script></body></html>`
}
