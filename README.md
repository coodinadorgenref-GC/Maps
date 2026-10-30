# Prospectos & Rutas GC (Maps)

PWA de Grupo Camejo para **vendedores en ruta**: registra prospectos en un mapa, planea rutas de visita, genera **notas de venta** y **cotizaciones** (con PDF y WhatsApp), controla el **almacén móvil** y consulta clima y radar de lluvia. Funciona **sin señal** una vez instalada.

- **App en vivo:** https://coodinadorgenref-gc.github.io/Maps/
- **Versión actual:** v80 (29-oct-2026)
- **Documentación técnica completa:** [`MASTER.md`](./MASTER.md)

## Qué hace

| Área | Descripción |
|---|---|
| **Mapa y prospectos** | Alta/edición de prospectos con estatus (Prospecto, Visitado, Cliente, Competencia, Unidad de negocio, Descartado), capas, filtros y catálogo DENUE importable. |
| **Rutas** | Selección de prospectos en el mapa, orden sugerido (OSRM), rutas próximas y descarga de zonas para trabajar sin señal. |
| **Ventas en ruta** | Nueva venta con 3 secciones (1 Cliente · 2 Tipo de nota y pago · 3 Productos), borrador automático, ticket en PDF y envío por WhatsApp. Historial en "Mis notas". |
| **Cotizaciones** | Mismo cotizador que el catálogo de refacciones: folio `C000xx`, vista previa de la hoja, seguimiento de estado, edición y reenvío. |
| **Precios, promociones y kits** | Lista de precios del REPORTEADOR, precios especiales (admin), promociones de mayoreo y kits de servicio con descuento. |
| **Almacén móvil** | Inventario propio del vendedor, traspasos y descarga de fin de ruta. |
| **Vendedores en vivo** | Panel admin con ubicación, batería y visitas en tiempo real. |
| **Clima** | Pronóstico, radar de lluvia, nubes, rayos, huracanes, viento y temperaturas. |
| **Sesión y roles** | Login compartido con el catálogo; roles **admin** y **vendedor**; acceso sin señal con "Recuérdame". |

## Estructura

```
index.html        App completa (HTML + CSS + JS)
cotizador.js      Cotizaciones (módulo aislado)
nota-venta.js     Nota de venta en PDF y número a letras (MXN)
logos-marcas.js   Logos de marcas en base64 para el PDF
sw.js             Service worker (caché y modo sin señal)
manifest.json     Manifiesto PWA
*.json            Datos: denue-import, estados, fronteras, localidades
aplicar_parche_*.py, *.patch   Parches históricos de precios
```

No hay paso de compilación ni gestor de paquetes: son archivos estáticos publicados con **GitHub Pages**.

## Ejecutar en local

```bash
git clone https://github.com/coodinadorgenref-GC/Maps.git
cd Maps
python3 -m http.server 8000
```

Abre `http://localhost:8000`. El login y los datos dependen del backend de Grupo Camejo (Worker de Cloudflare + Google Apps Script), por lo que se necesita una cuenta autorizada en `Usuarios_Autorizados`.

## Publicar un cambio

Cada cambio debe subir la versión en **dos** lugares, o los celulares seguirán con la caché vieja:

1. `CACHE_SHELL` en `sw.js` (por ejemplo `rutas-gc-shell-v77`).
2. `APP_BUILD` en `index.html` (por ejemplo `'29-oct · v77 · descripción'`).

Después, `git push` a `main`: GitHub Pages publica solo.

## Proyectos relacionados

- **CATALOGO-DE-INVENTARIO**: catálogo de refacciones; comparte login, cotizador y lista de precios.
- **REPORTEADOR**: dashboard que alimenta la lista de precios (hoja `LISTA_PRECIOS`).

Más detalle (arquitectura, datos, permisos, claves de caché, sistema visual y reglas de mantenimiento) en [`MASTER.md`](./MASTER.md).
