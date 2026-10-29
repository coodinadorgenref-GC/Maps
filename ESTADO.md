# ESTADO — Prospectos & Rutas GC (Maps)
Última revisión: 2026-10-29 · Versión publicada: v76 (28-oct-2026)

## Qué es
PWA de Grupo Camejo para vendedores en ruta: prospectos en mapa, rutas, notas de venta y cotizaciones (PDF y WhatsApp), almacén móvil y clima. Funciona sin señal. App: https://coodinadorgenref-gc.github.io/Maps/ (GitHub Pages, sin compilación).

## Estado actual
- v76: precio sugerido de VENTO bloqueado en nota y cotizador; solo el admin lo edita.
- v75: Nueva venta con las mismas secciones que la cotización; borrador automático; sin captura manual de productos.
- v74: cotización con la interfaz del catálogo; Maps solo muestra las cotizaciones capturadas en Maps.
- Tabla de versiones: `MASTER.md` §14.

## Cómo está armado
`index.html` (app completa, ~11 700 líneas), `cotizador.js`, `nota-venta.js`, `logos-marcas.js` (se carga después de `nota-venta.js`), `sw.js`, `manifest.json` y datos `*.json`. Backend: Worker de Cloudflare (`LOGIN_API_URL`), Apps Script (`SHEET_ENDPOINT`) y Firebase (app `venta-ruta`). La hoja `Usuarios_Autorizados` se comparte con el catálogo.

## Reglas que no se rompen
- Cada cambio sube la versión en dos sitios: `CACHE_SHELL` en `sw.js` y `APP_BUILD` en `index.html`. Commit: `vNN: qué cambió y para quién`.
- Archivo nuevo que la app necesita sin señal: agregarlo a `SHELL_ASSETS`. Si cambia la forma de un dato en caché: cambiar el sufijo de su clave (`_v2` → `_v3`).
- El costo nunca llega a la app. Los folios se generan en el dispositivo, nunca en el servidor.
- Precio, en orden: liquidación > promoción o precio especial vigente > lista del REPORTEADOR (con IVA) > fórmula del servidor. En venta normal, un SKU del almacén móvil con precio propio manda sobre el calculado.
- Nunca commitear credenciales ni tokens. Los `aplicar_parche_*.py` y el `.patch` son históricos: no volver a ejecutarlos.
- La lista de precios sale del REPORTEADOR para todos los proyectos.

## Pendientes
- Confirmar los precios BAJAJ cargados en la lista del REPORTEADOR y su efecto en kits (alcance de kits: por confirmar).
- Actualizar el comentario de `PRECIOS_VENTA` sobre BAJAJ/SUZUKI.
- Documentar el contrato de cada `action` del Worker (vive en el repo `apps-script`).
- Reglas de seguridad de Firestore (por confirmar).
- Evaluar partir `index.html` en módulos sin romper el precacheo del service worker.

## Documentos
`README.md` (presentación) · `ESTADO.md` (este) · `MASTER.md` (arquitectura, datos, precios, sistema visual, reglas completas).
