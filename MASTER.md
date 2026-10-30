# MASTER — Prospectos & Rutas GC (Maps)

Documento maestro del proyecto: qué es, cómo está armado, de qué depende y cuáles son las reglas para modificarlo. Se escribió a partir del código en la versión **v76** (commit `84ed7aa`, 28-oct-2026) y se actualizó en **v80** (29-oct-2026). Si algo aquí contradice al código, manda el código; corrige este documento.

> Convención: lo marcado como **(por confirmar)** no se pudo comprobar leyendo este repositorio (vive en el backend o en otros proyectos).

---

## 1. Propósito

Herramienta móvil (PWA) para vendedores y coordinadores de Grupo Camejo que trabajan en ruta:

1. Registrar y visitar **prospectos** (refaccionarias, talleres) sobre un mapa.
2. Planear **rutas** de visita.
3. Hacer **notas de venta** y **cotizaciones** en campo, con PDF y envío por WhatsApp.
4. Controlar el **almacén móvil** del vendedor y sus traspasos.
5. Consultar **clima, radar y huracanes** para decidir la ruta.

Debe funcionar **sin señal** una vez que el dispositivo cargó la app.

## 2. Ecosistema

| Pieza | Rol | Dónde vive |
|---|---|---|
| **Maps** (este repo) | App de ruta, ventas y cotizaciones | GitHub Pages: `coodinadorgenref-gc.github.io/Maps/` |
| **CATALOGO-DE-INVENTARIO** | Catálogo de refacciones; mismo cotizador y mismo historial de cotizaciones (folio `C000xx`) | Repo hermano en la misma organización |
| **REPORTEADOR** | Dashboard que sube la lista de precios (hoja `LISTA_PRECIOS`, con IVA) y alimenta a todos los proyectos | Repo/Apps Script aparte |
| **Worker de Cloudflare** (`LOGIN_API_URL`) | Punto de entrada único: login, sesión, cotizaciones, precios, inventario, existencias | Constante `LOGIN_API_URL` en `index.html` |
| **Apps Script / Google Sheet** (`SHEET_ENDPOINT`) | Persistencia de prospectos, ventas, almacén, traspasos, promociones, kits y catálogos | Constante `SHEET_ENDPOINT` en `index.html` |
| **Firebase** (proyecto `prospectos-y-rutas-gc`) | Auth y Firestore para ventas en ruta y seguimiento en vivo (app secundaria `"venta-ruta"`) | `firebaseConfig` en `index.html` |

La hoja `Usuarios_Autorizados` es compartida con el catálogo: mismos usuarios, roles y expiración de sesión.

## 3. Arquitectura

- **Sin compilación ni dependencias locales.** Archivos estáticos; no hay `package.json`.
- `index.html` (~11 700 líneas) contiene HTML, CSS y casi toda la lógica en un solo `<script>`. Los módulos grandes se separaron en archivos propios.
- Las librerías se cargan por CDN y **sw.js las precachea** para el modo sin señal.
- Estado en memoria + `localStorage` (claves `gc_*`). Los envíos al servidor pasan por **colas con reintento** que sobreviven al cierre de la app.

### Librerías externas (versiones fijadas)

| Librería | Versión | Uso |
|---|---|---|
| Leaflet | 1.9.4 | Mapa clásico |
| leaflet.markercluster | 1.5.3 | Agrupar pines |
| `leaflet-rotate.js` | local | Rotación del mapa |
| MapLibre GL + OpenFreeMap | — | Mapa base vectorial |
| Firebase (app, auth, firestore, compat) | 10.14.1 | Sesión y Firestore |
| jsPDF | 2.5.1 | Tickets y cotizaciones en PDF |
| SheetJS (xlsx) | 0.18.5 | Importar/exportar Excel y CSV |

### Servicios externos de datos

Open-Meteo (clima y cuadrícula), RainViewer (radar), NASA GIBS (nubes GOES), SSEC RealEarth (rayos), NHC/NOAA (ciclones), OSRM (rutas), Nominatim (geocodificación inversa), Esri World Imagery (satélite), OpenFreeMap (vectorial), OpenStreetMap (tiles).

## 4. Mapa de archivos

| Archivo | Contenido |
|---|---|
| `index.html` | App: login, mapa, prospectos, rutas, ventas, almacén móvil, clima, ajustes, panel admin, cola de sincronización |
| `cotizador.js` | IIFE aislada. Cotizaciones: API, secciones y permisos, buscador de productos, vista previa de la hoja, seguimiento de estado, PDF/WhatsApp |
| `nota-venta.js` | Nota de venta en PDF (jsPDF) y `numeroALetrasMX` |
| `logos-marcas.js` | `window.LOGO_MARCAS` (Suzuki, Bajaj, Carabela, Vento, BDS, American Piston, Islo, ATUL, TVS, Piaggio) en base64. **Se carga después de `nota-venta.js`** y lo sobrescribe |
| `sw.js` | Service worker. `CACHE_SHELL` (versionado) y `CACHE_TILES` (`rutas-gc-tiles-v1`) |
| `manifest.json` | PWA: `standalone`, vertical, tema `#14181C` |
| `denue-import.json` | Catálogo DENUE de prospectos importables (~885 KB) |
| `estados.json` | Estados de México (Natural Earth admin-1, simplificado) |
| `fronteras.json` | Fronteras para la capa del mapa |
| `localidades.json` | Lista `[nombre, lat, lng, valor]` para la cuadrícula de clima |
| `aplicar_parche_precios*.py`, `precio-almacen-movil.patch` | Parches históricos de precios (ver §13) |
| `icon*.png/svg`, `apple-touch-icon.png`, `favicon.ico` | Íconos |

Orden de carga de scripts: `nota-venta.js` → `logos-marcas.js` → `cotizador.js` → jsPDF y SheetJS (`defer`). `cotizador.js` solo usa variables globales de `index.html` **al ejecutarse**, nunca al cargar.

## 5. Sesión y roles

- Login contra el Worker (`action: "login"`); validación periódica (`validarSesion`) y cierre (`cerrarSesionServidor`).
- Expiración por inactividad: **15 min** (debe coincidir con el servidor); con "Recuérdame", **60 min**. Latido cada **3 min**.
- **Entrar sin señal:** con "Recuérdame" se guarda una huella del código (PBKDF2-SHA-256 con sal, 150 000 iteraciones; nunca el código). Máximo 3 cuentas por dispositivo, con bloqueo temporal tras intentos fallidos. Tope de espera del login: 12 s.
- Claves de sesión: `sesion_maps_gc`, `cred_offline_maps_gc`, `cred_offline_maps_gc_intentos`.

### Roles

| Rol | Alcance |
|---|---|
| **admin** (columna F de `Usuarios_Autorizados`) | Todo: todas las secciones (VENTO, SUZUKI, BAJAJ), vendedores en vivo, precios especiales |
| **vendedor** | Notas y cotizaciones solo de su agencia/sección; almacén móvil propio |

La función `puedeVenderEnRuta()` decide quién ve "Nueva venta". Las secciones permitidas salen de `seccionesDeVentaMaps()`: admin → todas; zona Valladolid, "TODAS" o sin agencia → todas; zona Mérida → VENTO; en otro caso, la de su agencia. **La validación real la hace el servidor** (`Secciones.js`); el front solo oculta lo que no se puede.

## 6. Pantallas (menú lateral)

Lista de prospectos · Ver todos en el mapa · Planear ruta nueva · Ruta actual · Próximas rutas · Ventas en ruta (Nueva venta o cotización, Cotizaciones del catálogo, Historial, Mis notas, Almacén móvil, Vendedores en vivo, Catálogo de refacciones, Precios especiales) · Clima (Pronóstico, Radar de lluvia, Satélite) · Configuración · Cerrar sesión.

Estatus de prospecto: `Prospecto`, `Visitado`, `Cliente`, `Competencia`, `Unidad de negocio`, `Descartado`.

## 7. Datos y sincronización

### 7.1 Worker (`LOGIN_API_URL`, POST `text/plain`, cuerpo JSON `{action, correo, token, ...}`)

`login`, `validarSesion`, `cerrarSesionServidor`, `obtenerInventario`, `obtenerExistenciasOrigen`, `obtenerPreciosVenta`, `obtenerPreciosCatalogo`, `obtenerCarritosActivos`, `listarVendedoresMaps`, `guardarCotizacion`, `editarCotizacion`, `consultarCotizaciones`, `cambiarEstadoCotizacion`, `marcarCotizacionEnviada`, `listarMotos`, `consultarParteVento`, `buscarMecanico`. Si la respuesta trae `sesionInvalida`, se cierra la sesión con aviso.

### 7.2 Apps Script (`SHEET_ENDPOINT`)

Recursos: `precios`, `ventasRuta`, `almacenMovil`, `movimientosAlmacen`, `traspasos`, `promociones`, `kits`, `kitItems`, `catalogos`, además de los prospectos.

### 7.3 Firestore

App secundaria `venta-ruta` para ventas en ruta; los envíos pendientes se reintentan (`gc_ventas_pendientes_firestore_v1`).

### 7.4 Colas offline-first

Todo lo que se captura sin señal queda en cola local y se reenvía solo: `gc_cola_sheet_v1`, `gc_ventas_pendientes_sheet_v1`, `gc_traspasos_pendientes_sheet_v1`, `gc_movimientos_pendientes_sheet_v1`, `gc_almacen_pendientes_sheet_v1`, `gc_catalogos_pendientes_sheet_v1`, `gc_pendientes_eliminar_v1`, `gc_cotizacion_pendiente`, `gc_cotizacion_marcas_pend`.

### 7.5 Claves de `localStorage` más importantes

| Clave | Contenido | TTL |
|---|---|---|
| `gc_prospectos_v1` | Prospectos locales | — |
| `gc_precios_venta_v3` | Precios calculados en servidor | 30 min |
| `gc_lista_precios_v1` | Lista de precios del REPORTEADOR | 3 min |
| `gc_promociones_v1`, `gc_kits_v1` | Promociones y kits | — |
| `gc_inventario_gc_cache_v1`, `gc_existencias_catalogo_v1`, `gc_existencias_origen_v2` | Inventario y existencias | — |
| `gc_cotizaciones_cache_v1`, `gc_mis_ventas_cache_v1`, `gc_notas_vendedor_cache_v1` | Historiales | — |
| `gc_almacen_propio_cache_v1`, `gc_vendedores_api_v1` | Almacén móvil y vendedores | — |
| `gc_prefs_v1`, `gc_tema_v1`, `gc_modo_mapa_v1`, `gc_mapa_oculto_v1` | Preferencias (persisten al cerrar sesión desde v73) | — |
| `gc_zonas_descargadas_v1`, `gc_cuadricula_guardada_v1` | Zonas y cuadrículas guardadas sin señal | — |

**Cuota:** `localStorage` se comparte con el catálogo (mismo origen de GitHub Pages). Desde v72, ante `QuotaExceededError` la app libera cachés regenerables en lugar de fallar el login.

**Cambiar la forma de un dato en caché = cambiar el sufijo de la clave** (`_v2` → `_v3`) para que nadie lea el formato viejo.

## 8. Precios

Regla de negocio: **el costo nunca llega a la app**; el servidor calcula y solo manda el resultado.

Jerarquía vigente (según v69 y v75–v76):

1. **Liquidación** (precio calculado, editable, marcada como tal).
2. **Promoción o precio especial vigente** (hoja `Promociones`, con `vigenteDesde` / `vigenteHasta`; el último día se incluye).
3. **Lista de precios del REPORTEADOR** (`LISTA_PRECIOS`, ya con IVA): manda sobre la fórmula.
4. **Precio calculado por fórmula** (`obtenerPreciosVenta`).
5. En venta normal, un SKU del **almacén móvil con precio propio** manda sobre el calculado (la liquidación conserva el suyo).

Redondeo en cotizador: pesos enteros hacia arriba (`194.60 → 195`). El SKU se normaliza igual que en el servidor (`skuN` / `normSkuMaps`: sin ceros a la izquierda si es numérico).

**VENTO:** desde v75–v76, el precio sugerido de VENTO está bloqueado en nota y cotizador; solo el admin lo edita.

> Nota histórica: el comentario de `PRECIOS_VENTA` aún dice que BAJAJ y SUZUKI llevan precio capturado a mano en la hoja `Precios`. Desde v69 se alimentan de la lista del REPORTEADOR **(por confirmar el estado de los precios BAJAJ/SUZUKI cargados)**. Conviene actualizar ese comentario.

## 9. Promociones y kits

- **Mayoreo:** hoja `Promociones` (`sku`, `producto`, `marca`, `precioUnitario`, `precioMayoreo`, `minMayoreo`, `vigenteDesde`, `vigenteHasta`).
- **Kits de servicio:** hojas `Kits` y `KitItems` del mismo Sheet. El kit solo guarda **qué piezas lleva y cuántas**; el precio sale de la misma lista de venta (`resolverProductoPorSku`) y **encima se aplica el descuento** (`descuentoPct`, p. ej. 15 %). El kit **no se combina con mayoreo**. La hoja puede devolver `0.15` si la celda tiene formato de porcentaje; `_kitPct` lo normaliza.
- Los kits aplican a la marca **BAJAJ** **(por confirmar el alcance final)**.

## 10. Notas de venta y cotizaciones

- **Nueva venta / cotización** comparten interfaz: **1 Cliente · 2 Tipo de nota y pago · 3 Productos**, con campos obligatorios, total con IVA y botón fijos al pie.
- La nota admite **solo productos con inventario** (sin captura manual). Hay **borrador automático** por cuenta: se recupera al abrir y se borra al generar el ticket.
- **Folios:** se generan **en el dispositivo**, nunca en el servidor (también un identificador interno que no se muestra al cliente). Cotizaciones: `C000xx`, compartidas con el catálogo.
- **Borradores (v79, nota y cotización, mismas reglas que el catálogo):** se guardan solos en este celular (`ventaBorrador:<cuenta>`, `czBorrador:<cuenta>:<sección>`), 7 días, cada cambio con 400 ms de espera, y además al cerrar con la X, al ir al historial, al pasar de nota a cotización (o al revés), al ocultar la app (`visibilitychange`) y en `pagehide`. Al abrir «Nueva» se recuperan solos y se avisa con «Borrador recuperado». El cotizador busca el borrador más reciente **en todas las secciones de la cuenta** (antes solo en la sección inicial). Si se abre con datos precargados (desde un punto del mapa o al pasar de nota a cotización), el borrador anterior **no se pierde**: queda de respaldo (`ventaRespaldo:<cuenta>`, `czRespaldo:<cuenta>`) con el aviso «Tienes otra nota/cotización a medias» y los botones Recuperar (intercambia con lo actual) y Descartar. Se borran al guardar/generar el ticket; no se guarda borrador al editar algo ya registrado.
- **Estados de cotización:** `Borrador`, `Enviada`, `Vendido`, `Traspaso`, `Rechazado`, `Pedido`. Una cotización `Borrador` o `Enviada` con vigencia pasada se considera **vencida**. Vigencia por omisión: **7 días**.
- Vista previa de la hoja: descargar PDF, compartir, editar, cambiar estado y reenviar. Maps solo muestra las cotizaciones **capturadas en Maps**; las del catálogo se consultan aparte.
- Nota ↔ cotización: los productos se pasan en los dos sentidos.
- **Cotización única (v80):** el cotizador ya no tiene selector de sección: una cotización puede mezclar productos de Vento/Carabela, Suzuki y Bajaj. Cada partida guarda su `seccion` (`seccionDe(info)`: la de tu almacén si hay existencia ahí; si no, la primera donde hay y tu cuenta cotiza; bajo pedido: la tuya; sin permiso = solo consulta). Al servidor se envía `seccion` por partida y, a nivel cotización, `agencia`/`seccion` de la sección con más partidas (`seccionPrincipal()`). La hoja PDF agrupa por sección y pone la franja «Surte: …» solo si hay más de una. **(Por confirmar)** que `guardarCotizacion`/`editarCotizacion` del Worker acepten partidas de varias secciones en una cotización de piso; si las rechaza, hay que relajar esa validación en el servidor.
- **Hoja con PROMOCIONES (v80):** debajo de la tabla, un bloque «PROMOCIONES» lista, por producto cotizado con promoción vigente (`promoDe`), «Promoción $X · hasta D mes» y «Mayoreo desde N pzas: $X · hasta D mes». Se calcula al generar la hoja con las promociones que tenga el celular en ese momento.
- **Sección 2 · Motocicleta y vigencia es opcional** (desde v78): modelo, año y vigencia pueden ir vacíos. Si el año se captura debe ser de 4 dígitos; si la vigencia se deja vacía se envía la de omisión (hoy + 7 días); una fecha pasada sigue siendo error. El modelo usa una **lista desplegable flotante** (`.cz-combo` + `.cz-desplegable`): al tocar el campo vacío muestra los modelos y al escribir filtra. **(Por confirmar)** que `guardarCotizacion` del Worker acepte `moto` y `anio` vacíos; el PDF ya omite la línea MOTOCICLETA si no hay datos.

## 11. Modo sin señal (sw.js)

| Tipo de petición | Estrategia |
|---|---|
| Shell y librerías (`SHELL_ASSETS`) | Cache-first con actualización en segundo plano (`cache:'reload'`) |
| Tiles OSM | Cache-first en `CACHE_TILES`, se guardan al navegar |
| Radar, clima, GIBS, NOAA, Esri | Siempre red (datos en vivo) |
| OpenFreeMap, MapLibre, RealEarth | Siempre red; sin señal la app usa el mapa clásico |
| `favicon.ico`, métodos distintos de GET | No se interceptan |

La precarga es **tolerante**: cada archivo por separado; si uno falla no se pierde el resto. El `activate` borra cachés viejos.

## 12. Sistema visual

Tema `oscuro` / `claro` / `sistema` (clave `gc_tema_v1`, aplicado en `<html data-theme>` antes de pintar para evitar parpadeo).

| Token | Oscuro | Claro |
|---|---|---|
| `--bg` | `#14181C` | `#F2F4F6` |
| `--surface` | `#1E242B` | `#FFFFFF` |
| `--surface-2` | `#262D35` | `#E9ECEF` |
| `--line` | `#333B44` | `#D7DCE1` |
| `--text` | `#EDEFF1` | `#1B2126` |
| `--text-dim` | `#9AA4AE` | `#63707A` |
| `--accent` | `#C4D600` | igual |
| `--teal` | `#4FA8A0` | `#2F8F87` |
| `--ochre` | `#FF8A1E` | `#DB7300` |
| `--danger` | `#D65F5F` | `#C0392B` |

- Radio base `14px`; tipografía del sistema (`-apple-system`, Segoe UI, Roboto).
- Íconos **SVG**, no emoji.
- Avisos, confirmaciones y preguntas con la fachada propia de Maps (**sin `alert`/`confirm`/`prompt` nativos**; el cotizador solo cae a `alert` si falla `mostrarToast`).
- Login con las mismas medidas que REPORTEADOR (448×512); el cierre de sesión avisa con Tab/Shift+Tab y Esc.
- Indicadores: punto de sincronización (ok / pendiente / sin conexión) y punto de señal de red, independientes entre sí.

### 12.1 Capa de refinamiento (v77)

Principio: **profesional y minimalista**, misma identidad (lima `#C4D600` sobre gris carbón). Se resolvió con una **capa de CSS al final del bloque `<style>` de `index.html`** (comentario `v77 · Refinamiento visual`) que solo ajusta tokens, sombras, foco y estados; no toca la estructura ni las medidas del login. Criterios tomados de la guía UI/UX (accesibilidad y toque primero).

| Tema | Regla vigente |
|---|---|
| **Foco** | Un solo anillo visible: `:focus-visible` con `--ring` (lima en oscuro, teal `#2F8F87` en claro). Campos: borde + halo `--ring-soft`. Nunca quitar el foco sin reemplazo. |
| **Sombras** | Tres niveles: `--shadow-1` (elementos), `--shadow-2` (barra, botones flotantes), `--shadow-3` (menús, hojas, diálogos). Sin sombras sueltas nuevas. |
| **Toque** | Objetivos de **≥ 44 px** (botones de barra, menú, +/− de cantidad, resultados de búsqueda, quitar línea); separación ≥ 8 px. Botones primarios de **48 px**. |
| **Movimiento** | Transiciones de **150 ms** solo en color, borde, sombra y opacidad (nunca tamaño). Respeta `prefers-reduced-motion` (bloque ya existente). |
| **Jerarquía** | Títulos con interletrado negativo ligero; rótulos de sección en mayúsculas pequeñas con `letter-spacing:.08em`; importes y tablas con `tabular-nums`. |
| **Menú lateral** | Elemento activo con filete de 2 px a la izquierda y degradado tenue; *hover* solo con puntero fino. |
| **Contraste** | Texto normal ≥ 4.5:1 en ambos temas; en claro el texto secundario del menú sube a `#56626C`. |
| **Tipografía** | Se mantiene la **fuente del sistema**. No cargar fuentes web (Inter, etc.): rompen el modo sin señal salvo que se precacheen en `SHELL_ASSETS`. |
| **Nuevos tokens** | `--ring`, `--ring-soft`, `--shadow-1/2/3`, `--ease`, `--t`, `--radius-sm`. Úsalos en lugar de valores sueltos. |

> La paleta que sugirió el generador de la guía (naranja `#EA580C`) **se descartó a propósito**: la marca de Grupo Camejo es la lima. Solo se adoptó el estilo (minimalismo/Swiss), el foco, el toque y la jerarquía.


## 13. Reglas de mantenimiento

1. **Cada cambio sube versión en dos sitios:** `CACHE_SHELL` en `sw.js` (`rutas-gc-shell-vNN`) y `APP_BUILD` en `index.html` (`'dd-mes · vNN · etiqueta'`). Sin esto, los celulares no cargan el cambio.
2. **Mensaje de commit:** `vNN: qué cambió y para quién`, en español.
3. **Si agregas un archivo que la app necesita sin señal, añádelo a `SHELL_ASSETS`.**
4. **Si cambias la forma de un dato cacheado, cambia el sufijo de su clave** (§7.5).
5. **Nunca** mandar el costo de un producto al cliente web.
6. **Nunca** generar folios en el servidor (regla de diseño offline-first).
7. **Nunca** commitear credenciales, tokens personales ni códigos de acceso. La `apiKey` de Firebase es pública por diseño; la seguridad la dan las reglas de Firestore y el Worker.
8. Los `aplicar_parche_*.py` y el `.patch` son **históricos** (precios especiales y precio del almacén móvil, alrededor de v54–v55): cambian texto exacto y abortan si la coincidencia no es la esperada; crean respaldos `.bak`. No los vuelvas a ejecutar sobre la versión actual.
9. No repetir sin necesidad: la lista de precios debe salir del REPORTEADOR para todos los proyectos.

## 14. Historial reciente

| Versión | Fecha | Cambio |
|---|---|---|
| v80 | 29-oct-2026 | Cotización única (sin selector de secciones; cada partida lleva su sección y se pueden mezclar), bloque PROMOCIONES en la hoja (mayoreo y promoción vigentes), y las coincidencias del modelo ya no quedan tapadas por la barra del total |
| v79 | 29-oct-2026 | Borradores: cotizador busca en todas las secciones, guarda al ir al historial y al ocultar la app; respaldo del borrador anterior al abrir con datos precargados (nota ↔ cotización, mapa) |
| v78 | 29-oct-2026 | Cotizador: la sección 2 (Motocicleta y vigencia) ya es opcional; el modelo se elige en una lista desplegable flotante (como el catálogo) |
| v77 | 29-oct-2026 | Refinamiento de interfaz minimalista: foco único, sombras en 3 niveles, objetivos táctiles ≥ 44 px, jerarquía tipográfica, menú con indicador de activo (ver §12.1) |
| v76 | 28-oct-2026 | Bloqueo del precio sugerido de VENTO en el cotizador (solo admin) |
| v75 | 28-oct-2026 | Nueva venta con las mismas secciones que la cotización; total con IVA y botón fijos; borrador automático; sin captura manual |
| v74 | 27-oct-2026 | Cotización con la interfaz del catálogo; vista previa de la hoja; nota↔cotización; Maps solo muestra sus cotizaciones |
| v73 | 27-oct-2026 | Preferencias persistentes (Ocultar, capas, filtros) |
| v72 | 27-oct-2026 | Login sin `QuotaExceededError` |
| v71 | 27-oct-2026 | Vendedores desde `Usuarios_Autorizados`; admin y vendedor hacen notas y cotizaciones |
| v70 | 26-oct-2026 | Cotizador en Maps (folio `C000xx`, WhatsApp/PDF, avisos de promoción y kit) |
| v69 | 26-oct-2026 | Lista de precios del REPORTEADOR |
| v68 | 26-oct-2026 | Kits de servicio con descuento |
| v67 | 26-oct-2026 | Login con las medidas de REPORTEADOR |
| v65 | 24-oct-2026 | Entrar sin señal con "Recuérdame" |
| v64 | 19-oct-2026 | Avisos y confirmaciones propios (sin nativos) |

Historial completo: `git log` (265 commits al momento de escribir este documento).

## 15. Pendientes y puntos por confirmar

- Confirmar los precios BAJAJ ya cargados en la lista del REPORTEADOR y su efecto en kits.
- Actualizar el comentario de `PRECIOS_VENTA` sobre BAJAJ/SUZUKI (§8).
- Documentar el contrato exacto de cada `action` del Worker (vive en el repo de Apps Script).
- Reglas de seguridad de Firestore **(por confirmar)**.
- Revisar con dispositivos reales (iPhone y Android, tema claro y oscuro) la capa v77: tamaños de toque en la barra superior y contraste de los chips del cotizador.
- Pasar los estilos propios de `cotizador.js` a los tokens de §12.1 (hoy conserva sus valores).
- Evaluar partir `index.html` en módulos (hoy ~11 700 líneas) sin romper el precacheo del service worker.
