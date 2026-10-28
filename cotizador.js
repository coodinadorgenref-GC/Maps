/* cotizador.js — Cotizaciones en Maps (mismo cotizador que el catálogo)
   · Mismo servidor y mismo historial que el catálogo (folio C000xx): guardarCotizacion / editarCotizacion /
     consultarCotizaciones / cambiarEstadoCotizacion, vía el Worker de login que ya usa Maps.
   · El servidor es quien valida de verdad la sección (Secciones.js): un vendedor solo cotiza la suya;
     el admin cotiza en todas. Aquí solo se oculta lo que no se puede para no confundir.
   · Todo el inventario de Grupo Camejo se CONSULTA (precio, existencia por sucursal, promociones y kits).
     Cotizar solo se puede lo que tu cuenta puede cotizar.
   Carga después de nota-venta.js y logos-marcas.js. Usa las variables globales de Maps (usuarioActual, tokenActual,
   esAdmin, listaGC, existenciasCatalogo, promocionesCache, kitsCache…) solo al ejecutarse, nunca al cargar. */
(function () {
'use strict';

/* ───────────── utilidades ───────────── */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const skuN = v => { const t = String(v == null ? '' : v).trim(); return /^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, '') : t; };   // igual que _normSku del servidor
const moneda = n => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const arriba = n => Math.ceil(Math.round(n * 100) / 100);   // pesos enteros hacia arriba (194.60 → 195)
const toast = m => { try { mostrarToast(m); } catch (e) { alert(m); } };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const VIGENCIA_DIAS = 7;
const vigOmision = () => { const d = new Date(); d.setDate(d.getDate() + VIGENCIA_DIAS); return iso(d); };
const vigIso = v => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v == null ? '' : v).trim()); return m ? m[1] : ''; };
const fechaLarga = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? Number(m[3]) + ' de ' + MESES[Number(m[2]) - 1] + ' de ' + m[1] : ''; };
const fechaCorta = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? Number(m[3]) + ' ' + MESES[Number(m[2]) - 1].slice(0, 3) : ''; };
const vencida = c => { const v = vigIso(c && c.vigencia); return !!v && v < iso(new Date()) && (c.estado === 'Borrador' || c.estado === 'Enviada'); };
const SOLO_LETRAS = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ';
const RE_NOMBRE = new RegExp('^[' + SOLO_LETRAS + '][' + SOLO_LETRAS + " .'-]*$");
const soloLetras = t => String(t == null ? '' : t).replace(new RegExp('[^' + SOLO_LETRAS + " .'-]", 'g'), '').replace(new RegExp('^[^' + SOLO_LETRAS + ']+'), '').replace(/ {2,}/g, ' ');
const soloDigitos = t => String(t == null ? '' : t).replace(/\D/g, '');
const IC = {   // íconos SVG (nada de emoji como ícono)
  ok: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1.2 14.2L6.5 12l1.4-1.4 2.9 2.9 5.3-5.3 1.4 1.4-6.7 6.6z"/></svg>',
  aviso: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>',
  camion: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M20 8h-3V4H3a2 2 0 00-2 2v11h2a3 3 0 006 0h6a3 3 0 006 0h2v-5l-3-4zM6 19.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm12 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM17 9.5h2.5l1.9 2.5H17V9.5z"/></svg>',
  etiqueta: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M21.4 11.6l-9-9A2 2 0 0011 2H4a2 2 0 00-2 2v7c0 .5.2 1 .6 1.4l9 9a2 2 0 002.8 0l7-7a2 2 0 000-2.8zM6.5 8A1.5 1.5 0 116.5 5a1.5 1.5 0 010 3z"/></svg>',
  kit: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M20 7h-4V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zM10 5h4v2h-4V5z"/></svg>',
  candado: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M18 8h-1V6a5 5 0 00-10 0v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2zM9 6a3 3 0 016 0v2H9V6z"/></svg>',
  cerrar: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M19 6.4L17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"/></svg>',
  quitar: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
  girar: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" class="cz-giro"><path fill="currentColor" d="M12 4V1L8 5l4 4V6a6 6 0 11-6 6H4a8 8 0 108-8z"/></svg>',
  lupa: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>',
  ojo: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z"/></svg>',
  bajar: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>'
};

/* ───────────── API: el mismo Worker que usa Maps ───────────── */
async function api(action, extra) {
  const r = await fetch(LOGIN_API_URL, { method: 'POST', mode: 'cors', headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(Object.assign({ action: action, correo: usuarioActual, token: tokenActual }, extra || {})) });
  const rs = await r.json();
  if (rs && rs.sesionInvalida) { try { manejarSesionInvalidaMaps(rs.message); } catch (e) {} throw new Error(rs.message || 'Sesión expirada.'); }
  return rs;
}

/* ───────────── Secciones y permisos (espejo de Secciones.js; el servidor valida de verdad) ───────────── */
const SECCIONES = { VENTO: 'Vento / Carabela', SUZUKI: 'Suzuki', BAJAJ: 'Bajaj' };
const TODAS = ['VENTO', 'SUZUKI', 'BAJAJ'];
const sinAcento = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function seccionDeTexto(t) { const n = String(t == null ? '' : t).toUpperCase(); if (n.indexOf('PISTE MUEBLES') !== -1) return 'BAJAJ'; return n.indexOf('SUZUKI') !== -1 ? 'SUZUKI' : n.indexOf('BAJAJ') !== -1 ? 'BAJAJ' : 'VENTO'; }
function almacenCuenta() { return sinAcento(String(window.almacenCuentaMaps || '')).toUpperCase().trim(); }
/** Secciones en las que esta cuenta puede COTIZAR. Admin: todas. Zona Valladolid / TODAS / sin almacén: todas. Zona Mérida: Vento. Si no: la de su almacén. */
function seccionesQueCotizo() {
  if (typeof esAdmin !== 'undefined' && esAdmin) return TODAS.slice();
  const a = almacenCuenta();
  if (!a || a.indexOf('TODAS') !== -1 || a.indexOf('ZONA VALLADOLID') !== -1) return TODAS.slice();
  if (a.indexOf('ZONA MERIDA') !== -1) return ['VENTO'];
  return [seccionDeTexto(a)];
}
const puedeCotizarEn = sec => seccionesQueCotizo().indexOf(sec) !== -1;
function puedeUsarCotizador() { return !!usuarioActual && (esAdmin || window.esVendedorSesion === true); }

/* Zonas: el tiempo estimado de llegada depende de si la pieza viaja dentro de la zona o entre zonas */
const ZONA_SUCURSAL = {
  'BAJAJ CANCUN': 'Valladolid', 'BAJAJ TIZIMIN': 'Valladolid', 'BAJAJ VALLADOLID': 'Valladolid', 'BAJAJ PISTE': 'Valladolid', 'CARABELA V1': 'Valladolid',
  'SUZUKI TIZIMIN': 'Valladolid', 'SUZUKI VALLADOLID': 'Valladolid', 'PISTE VENTO': 'Valladolid', 'TIZIMIN VENTO': 'Valladolid', 'PISTE MUEBLES': 'Valladolid',
  'UMAN VENTO': 'Mérida', 'CAUCEL VENTO': 'Mérida', 'TICUL VENTO': 'Mérida'
};
const ETA_MISMA_ZONA = '3–7 días hábiles', ETA_OTRA_ZONA = '3–5 semanas';
const zonaDe = n => ZONA_SUCURSAL[sinAcento(String(n || '')).toUpperCase().trim()] || null;
const tieneAgenciaPropia = () => { const h = almacenCuenta(); return !!h && h.indexOf('TODAS') === -1 && h.indexOf('ZONA') === -1; };
function esMiSucursal(s) { if (!tieneAgenciaPropia()) return false; const n = sinAcento(String(s || '')).toUpperCase().trim(), h = almacenCuenta(); return n.indexOf(h) !== -1 || h.indexOf(n) !== -1; }
function zonaDestino() {
  const h = almacenCuenta();
  if (h.indexOf('ZONA MERIDA') !== -1) return 'Mérida'; if (h.indexOf('ZONA VALLADOLID') !== -1) return 'Valladolid';
  const k = Object.keys(ZONA_SUCURSAL).find(x => esMiSucursal(x)); return k ? ZONA_SUCURSAL[k] : null;
}

/* ───────────── Todo el inventario de Grupo Camejo (precio + existencia por sucursal) ───────────── */
function mapaNombres() {   // nombres de SKU que Maps ya conoce (lista de precios, almacén móvil, inventario GC)
  const m = {};
  try { (typeof inventarioGC !== 'undefined' ? inventarioGC : []).forEach(p => { if (p && p.sku) m[skuN(p.sku)] = p.producto || ''; }); } catch (e) {}
  try { Object.keys(inventarioPropio || {}).forEach(k => { m[skuN(k)] = (inventarioPropio[k] && inventarioPropio[k].producto) || m[skuN(k)] || ''; }); } catch (e) {}
  try { Object.keys(listaGC || {}).forEach(k => { if (listaGC[k].producto) m[k] = listaGC[k].producto; }); } catch (e) {}
  return m;
}
let _universo = null, _universoSello = '';
/** Todos los SKU que Maps conoce: los de la lista de precios y los que tienen existencia en alguna sucursal. */
function universo() {
  const sello = Object.keys(listaGC || {}).length + '|' + Object.keys(existenciasCatalogo || {}).length + '|' + ((typeof inventarioGC !== 'undefined' && inventarioGC) ? inventarioGC.length : 0);
  if (_universo && sello === _universoSello) return _universo;
  const nombres = mapaNombres(), llaves = {};
  Object.keys(listaGC || {}).forEach(k => { llaves[k] = true; });
  Object.keys(existenciasCatalogo || {}).forEach(k => { llaves[skuN(k)] = true; });
  _universo = Object.keys(llaves).map(k => {
    const g = (listaGC || {})[k];
    const sku = g ? g.sku : k;
    const ex = (existenciasCatalogo || {})[k] || (existenciasCatalogo || {})[sku] || [];
    const sucs = {};
    ex.forEach(e => { if (Number(e.cantidad) > 0) sucs[e.sucursal] = (sucs[e.sucursal] || 0) + Number(e.cantidad); });
    const secs = {};
    Object.keys(sucs).forEach(s => { secs[seccionDeTexto(s)] = true; });
    const nombre = nombres[k] || '';
    return { k: k, sku: String(sku), nombre: nombre, precioLista: g ? Number(g.precio) : null, sucursales: sucs, secciones: Object.keys(secs),
             stock: Object.keys(sucs).reduce((t, s) => t + sucs[s], 0), busca: norm(sku + ' ' + nombre) };
  });
  _universoSello = sello;
  return _universo;
}
const infoSku = sku => universo().find(x => x.k === skuN(sku)) || null;
function buscar(q) {
  const t = norm(q); if (t.length < 2) return [];
  const partes = t.split(/\s+/), out = [];
  for (const p of universo()) { if (partes.every(w => p.busca.indexOf(w) !== -1)) { out.push(p); if (out.length >= 60) break; } }
  out.sort((a, b) => ((norm(b.sku) === t) - (norm(a.sku) === t)) || ((b.stock > 0) - (a.stock > 0)) || (b.stock - a.stock));
  return out.slice(0, 10);
}

/* ───────────── Promociones y kits vigentes (para ofrecérselos al cliente) ───────────── */
function promoDe(sku) {
  try {
    const p = (promocionesCache || {})[skuN(sku)]; if (!p || !promoVigente(p)) return null;
    const pu = Number(p.precioUnitario) || 0, pm = Number(p.precioMayoreo) || 0, mn = Number(p.minMayoreo) || 0;
    if (!(pu > 0) && !(pm > 0 && mn >= 2)) return null;
    const hasta = p.vigenteHasta ? (typeof _msFecha === 'function' ? _msFecha(p.vigenteHasta) : Date.parse(p.vigenteHasta)) : null;
    return { precio: pu > 0 ? pu : 0, mayoreo: pm > 0 && mn >= 2 ? { precio: pm, min: mn } : null, hasta: hasta ? iso(new Date(hasta)) : '' };
  } catch (e) { return null; }
}
function kitsDe(sku) {
  try {
    const k0 = skuN(sku);
    return kitsDisponibles().filter(k => _kitItemsDe(k).some(i => skuN(i.sku) === k0));
  } catch (e) { return []; }
}
const kitHasta = k => { const h = (typeof _msFecha === 'function') ? _msFecha(k.vigenteHasta) : null; return h ? iso(new Date(h)) : ''; };
/** Chips de aviso de un SKU: promoción, mayoreo y kit. conBoton: agrega "Ver kit". */
function avisosHtml(sku, conBoton) {
  const out = [], p = promoDe(sku);
  if (p && p.precio > 0) out.push('<span class="cz-chip cz-promo">' + IC.etiqueta + ' Promoción ' + moneda(p.precio) + (p.hasta ? ' · hasta ' + esc(fechaCorta(p.hasta)) : '') + '</span>');
  if (p && p.mayoreo) out.push('<span class="cz-chip cz-promo">' + IC.etiqueta + ' Mayoreo desde ' + p.mayoreo.min + ' pzas: ' + moneda(p.mayoreo.precio) + (p.hasta ? ' · hasta ' + esc(fechaCorta(p.hasta)) : '') + '</span>');
  kitsDe(sku).slice(0, 2).forEach(k => {
    out.push('<span class="cz-chip cz-kit">' + IC.kit + ' Kit «' + esc(k.nombre) + '» −' + Math.round(_kitPct(k)) + '%' + (kitHasta(k) ? ' · hasta ' + esc(fechaCorta(kitHasta(k))) : '')
      + (conBoton ? ' <button type="button" class="cz-link" data-kit="' + esc(k.id) + '" data-sku="' + esc(sku) + '">Ver kit</button>' : '') + '</span>');
  });
  return out.length ? '<div class="cz-avisos">' + out.join('') + '</div>' : '';
}

/* ───────────── Estilos (paleta y variables de Maps) ───────────── */
const CSS = `
.cz-overlay{position:fixed;inset:0;z-index:2600;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;padding:0}
@media(min-width:768px){.cz-overlay{align-items:center}}
.cz-overlay[hidden]{display:none}
/* Mismo tamaño que «Nueva venta» y que el modal de cotización del catálogo de refacciones (cp-card): 720 px de ancho, alto fijo para que no cambie al alternar entre pestañas. */
.cz-card,#ventaOverlay .venta-card{background:var(--surface);color:var(--text);width:100%;max-width:720px;height:92dvh;max-height:92dvh;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;box-sizing:border-box;border:1px solid var(--line);border-radius:16px 16px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0));box-shadow:0 10px 24px rgba(0,0,0,.45)}
@media(min-width:768px){.cz-card,#ventaOverlay .venta-card{border-radius:16px;height:min(780px,88dvh);max-height:88dvh}}
#ventaOverlay{background:rgba(0,0,0,.6)}
@media(min-width:768px){#ventaOverlay{align-items:center}}
#ventaOverlay .venta-titulo{font-size:18px;margin:4px 0 12px}
#ventaOverlay .venta-titulo button{display:none}
#ventaOverlay .venta-folio{margin-top:-8px}
.cz-top{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.cz-modos{display:flex;flex:1;background:var(--surface-2);border-radius:12px;padding:3px;gap:3px}
.cz-modos button{flex:1;min-height:44px;border:0;border-radius:10px;background:transparent;color:var(--text-dim);font:600 14px/1 inherit;cursor:pointer;transition:background .15s,color .15s}
.cz-modos button[aria-selected="true"]{background:var(--accent);color:var(--accent-ink)}
.cz-x{min-width:44px;min-height:44px;border:0;border-radius:12px;background:transparent;color:var(--text);cursor:pointer;display:grid;place-items:center}
.cz-card h2{font-size:18px;margin:4px 0 12px}
.cz-bloque{border:1px solid var(--line);border-radius:12px;padding:12px;margin:0 0 12px;background:var(--bg)}
.cz-bloque>legend,.cz-bloque>.cz-leg{font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--text-dim);padding:0 6px;margin:0}
.cz-campo{margin:0 0 10px;position:relative}
.cz-campo:last-child{margin-bottom:0}
.cz-campo label{display:block;font-size:13px;font-weight:600;margin:0 0 4px}
.cz-campo input,.cz-campo select{width:100%;box-sizing:border-box;min-height:44px;padding:10px 12px;font-size:16px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--text)}
.cz-campo input:focus-visible,.cz-campo select:focus-visible,.cz-overlay button:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.cz-campo input[aria-invalid="true"]{border-color:var(--danger)}
.cz-err{color:var(--danger);font-size:12.5px;margin:4px 0 0}
.cz-err[hidden]{display:none}
.cz-ayuda{color:var(--text-dim);font-size:12.5px;margin:4px 0 0}
.cz-fila2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cz-fila2.cz-3{grid-template-columns:2fr 1fr}
.cz-secs{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}
.cz-sec{min-height:44px;padding:0 14px;border-radius:22px;border:1px solid var(--line);background:var(--surface-2);color:var(--text);font:600 13px/1 inherit;cursor:pointer}
.cz-sec[aria-checked="true"]{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.cz-sec[disabled]{opacity:.55;cursor:default}
.cz-lista{display:flex;flex-direction:column;gap:6px;margin-top:6px}
.cz-res{display:block;width:100%;text-align:left;min-height:44px;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--text);cursor:pointer;font:inherit}
.cz-res:hover,.cz-res:focus-visible{border-color:var(--accent)}
.cz-res[disabled]{cursor:default;opacity:.9}
.cz-res b{display:block;font-size:14px;line-height:1.3}
.cz-sub{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;margin-top:4px;font-size:12.5px;color:var(--text-dim)}
.cz-precio{font-weight:800;color:var(--text);font-size:14px}
.cz-sku{font-family:ui-monospace,monospace;font-size:12px;color:var(--text-dim)}
.cz-badge,.cz-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;font-size:12px;font-weight:600;line-height:1.3}
.cz-ok{background:rgba(79,168,160,.18);color:var(--teal)}
.cz-aten{background:rgba(255,138,30,.18);color:var(--ochre)}
.cz-cons{background:var(--surface-2);color:var(--text-dim)}
.cz-promo{background:rgba(196,214,0,.18);color:var(--accent)}
html[data-theme="claro"] .cz-promo{color:#6b7400}
.cz-kit{background:rgba(255,138,30,.18);color:var(--ochre)}
.cz-avisos{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.cz-link{background:none;border:0;color:inherit;text-decoration:underline;font:inherit;font-weight:700;cursor:pointer;padding:6px 2px;min-height:32px}
.cz-oferta{border:1px solid var(--accent);background:rgba(196,214,0,.1);border-radius:12px;padding:10px 12px;margin:0 0 12px;font-size:13.5px}
.cz-oferta[hidden]{display:none}
.cz-oferta b{display:block;margin-bottom:2px}
.cz-linea{border:1px solid var(--line);border-radius:12px;padding:10px;margin-top:10px;background:var(--surface)}
.cz-linea-top{display:flex;gap:8px;align-items:flex-start;justify-content:space-between}
.cz-desc{font-weight:600;font-size:14px;line-height:1.3}
.cz-quitar{min-width:44px;min-height:44px;border:0;border-radius:10px;background:transparent;color:var(--danger);cursor:pointer;display:grid;place-items:center;flex:none}
.cz-fila{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;flex-wrap:wrap}
.cz-qty{display:flex;align-items:center;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.cz-qty button{width:44px;min-height:44px;border:0;background:var(--surface-2);color:var(--text);font-size:20px;cursor:pointer}
.cz-qty input{width:54px;min-height:44px;border:0;text-align:center;font-size:16px;background:var(--surface);color:var(--text)}
.cz-imp{font-weight:800;font-size:15px}
.cz-total{display:flex;justify-content:space-between;align-items:baseline;font-size:15px;font-weight:700;margin:14px 0 4px}
.cz-total span:last-child{font-size:22px;font-weight:800}
.cz-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:48px;border-radius:12px;border:0;background:var(--accent);color:var(--accent-ink);font:700 15px/1 inherit;cursor:pointer;margin-top:10px}
.cz-btn.cz-sec2{background:var(--surface-2);color:var(--text);border:1px solid var(--line)}
.cz-btn[disabled]{opacity:.6;cursor:wait}
.cz-btn-linea{min-height:44px;width:100%;margin-top:10px;border-radius:10px;border:1px dashed var(--line);background:transparent;color:var(--text);font:600 14px/1 inherit;cursor:pointer}
.cz-error{display:none;background:rgba(214,95,95,.15);color:var(--danger);border:1px solid var(--danger);border-radius:10px;padding:10px;margin:10px 0 0;font-size:13.5px}
.cz-error.cz-ver{display:block}
.cz-aviso{color:var(--ochre);font-size:12.5px;margin:6px 0 0;min-height:1em}
.cz-borrador{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:var(--surface-2);border-radius:10px;padding:8px 12px;margin:0 0 12px;font-size:13px}
.cz-borrador[hidden],#cz-form[hidden],#cz-listo[hidden]{display:none}
.cz-listo{text-align:center;padding:8px 0}
.cz-folio{font-size:34px;font-weight:800;color:var(--accent);margin:6px 0}
.cz-panel{position:fixed;inset:0;z-index:2700;background:rgba(0,0,0,.7);display:flex;align-items:flex-end;justify-content:center}
.cz-panel[hidden]{display:none}
.cz-panel>div{background:var(--surface);color:var(--text);width:100%;max-width:640px;max-height:88vh;overflow-y:auto;border-radius:16px 16px 0 0;padding:16px 14px calc(18px + env(safe-area-inset-bottom,0));box-sizing:border-box}
.cz-tabla{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0}
.cz-tabla th,.cz-tabla td{padding:6px 4px;border-bottom:1px solid var(--line);text-align:left}
.cz-tabla td.cz-r,.cz-tabla th.cz-r{text-align:right;white-space:nowrap}
.cz-estado{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;background:var(--surface-2)}
.cz-e-Vendido{background:rgba(79,168,160,.2);color:var(--teal)}.cz-e-Enviada{background:rgba(196,214,0,.18);color:var(--accent)}
.cz-e-Rechazado{background:rgba(214,95,95,.2);color:var(--danger)}.cz-e-Traspaso,.cz-e-Pedido{background:rgba(255,138,30,.2);color:var(--ochre)}
.cz-hcard{border:1px solid var(--line);border-radius:12px;padding:12px;margin:0 0 10px;background:var(--bg)}
.cz-acciones{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.cz-acciones button{min-height:44px;padding:0 12px;border-radius:10px;border:1px solid var(--line);background:var(--surface-2);color:var(--text);font:600 13px/1 inherit;cursor:pointer}
.cz-acciones button.cz-prim{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.cz-giro{animation:czgiro 1s linear infinite}@keyframes czgiro{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.cz-giro{animation:none}.cz-modos button{transition:none}}
.cz-modos-venta{margin:0}
.cz-tipo{display:inline-block;padding:2px 7px;border-radius:6px;font-size:10.5px;font-weight:800;letter-spacing:.05em;vertical-align:1px}
.cz-tipo-cot{background:rgba(255,138,30,.2);color:var(--ochre)}
.cz-tipo-nota{background:rgba(79,168,160,.2);color:var(--teal)}
.cz-req{color:var(--danger);font-weight:700}
.cz-fila-id{display:flex;gap:8px;align-items:stretch}.cz-fila-id input{flex:1;min-width:0}
.cz-btn-buscar{flex:none;min-height:44px;padding:0 14px;border-radius:10px;border:1px solid var(--line);background:var(--surface-2);color:var(--text);font:600 14px/1 inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.cz-pie{margin:2px 0 12px}
.cz-hcard[data-folio]{cursor:pointer}
.cz-cv{z-index:2650}
.cz-cv-marco{display:block;width:100%;height:min(54dvh,520px);border:1px solid var(--line);border-radius:10px;background:#fff}
.cz-acciones a{min-height:44px;padding:0 12px;border-radius:10px;border:1px solid var(--line);background:var(--surface-2);color:var(--text);font:600 13px/1 inherit;display:inline-flex;align-items:center;gap:6px;text-decoration:none;cursor:pointer}
.cz-overlay a:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.cz-acciones button[hidden],.cz-acciones a[hidden]{display:none}
/* Pie fijo (como en el catálogo): total y botón siempre a la vista mientras se captura */
.cz-pie,.venta-pie{position:sticky;bottom:0;z-index:5;background:var(--surface);margin:2px -16px calc(-16px - env(safe-area-inset-bottom,0px));padding:10px 16px calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--line);box-shadow:0 -8px 14px -8px rgba(0,0,0,.35)}
.cz-pie .cz-total,.venta-pie .venta-total{margin:0 0 2px}
.cz-pie .cz-btn,.venta-pie .venta-btn{margin-top:8px}
.cz-pie .cz-ayuda,.venta-pie .cz-ayuda{margin:2px 0 0;font-size:12px}
.cz-pie .cz-error{margin:6px 0 0}
/* «Nueva venta» con el mismo aspecto que «Nueva cotización» */
#ventaOverlay .venta-total{display:flex;justify-content:space-between;align-items:baseline;font-size:15px;font-weight:700}
#ventaOverlay .venta-total span:last-child{font-size:22px;font-weight:800}
#ventaOverlay .venta-campo{margin:0 0 10px;position:relative}
#ventaOverlay .venta-campo:last-child{margin-bottom:0}
#ventaOverlay .venta-campo label{font-size:13px;font-weight:600;color:var(--text);margin:0 0 4px}
#ventaOverlay .venta-campo input,#ventaOverlay .venta-campo select{min-height:44px;padding:10px 12px;font-size:16px;border-radius:10px;background:var(--surface)}
#ventaOverlay .venta-campo input:focus-visible,#ventaOverlay .venta-campo select:focus-visible,#ventaOverlay button:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
#ventaOverlay .venta-btn{min-height:48px;border-radius:12px;background:var(--accent);color:var(--accent-ink);font:700 15px/1 inherit}
#ventaOverlay .venta-agregar-item{min-height:44px;border-radius:10px;margin:10px 0 0;font-weight:600}
#ventaOverlay .cz-bloque .venta-buscador{background:var(--bg);padding:0 0 8px}
#ventaOverlay .venta-pie .venta-error{margin:8px 0 0}
`;

/* ───────────── Estado ───────────── */
let lineas = [], seq = 0, seccion = 'VENTO', guardando = false, guardada = false, edicion = null, ultima = null, idResuelto = '', coincidencias = [];
let motos = [], motosCargadas = false, borradorT = null;
const CAMPOS = ['cz-cliente', 'cz-telefono', 'cz-moto', 'cz-anio', 'cz-vigencia', 'cz-buscador'];

const HTML = `
<div class="cz-overlay" id="cz-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="cz-titulo">
 <div class="cz-card">
  <div class="cz-top">
    <div class="cz-modos" role="tablist" aria-label="Tipo de documento">
      <button type="button" role="tab" aria-selected="false" id="cz-tab-nota">Nota de venta</button>
      <button type="button" role="tab" aria-selected="true" id="cz-tab-cot">Cotización</button>
    </div>
    <button type="button" class="cz-x" id="cz-cerrar" aria-label="Cerrar">${IC.cerrar}</button>
  </div>
  <h2 id="cz-titulo">Nueva cotización</h2>
  <div class="cz-borrador" id="cz-borrador" hidden role="status"><span>Borrador recuperado (<span id="cz-borrador-hace"></span>)</span><button type="button" class="cz-link" id="cz-empezar">Empezar de nuevo</button></div>
  <div id="cz-form">
    <div class="cz-secs" id="cz-secciones" role="radiogroup" aria-label="Sección de la cotización"></div>
    <fieldset class="cz-bloque"><legend>1 · Cliente</legend>
      <div class="cz-campo"><label for="cz-idcliente">ID o teléfono del cliente</label>
        <div class="cz-fila-id">
          <input id="cz-idcliente" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="15" autocomplete="off" enterkeyhint="search" placeholder="Solo números" aria-describedby="cz-id-estado">
          <button type="button" class="cz-btn-buscar" id="cz-id-buscar">${IC.lupa} Buscar</button>
        </div>
        <p class="cz-ayuda" id="cz-id-estado" role="status" aria-live="polite">Con el ID o el teléfono se traen el nombre y el teléfono.</p>
        <div class="cz-lista" id="cz-id-resultados" hidden></div></div>
      <div class="cz-campo"><label for="cz-cliente">Nombre del cliente <span class="cz-req" aria-hidden="true">*</span></label>
        <input id="cz-cliente" type="text" autocomplete="off" autocapitalize="words" maxlength="80" required aria-required="true" placeholder="Solo letras" enterkeyhint="next" aria-describedby="cz-cliente-err">
        <p class="cz-err" id="cz-cliente-err" hidden></p></div>
      <div class="cz-campo"><label for="cz-telefono">Teléfono <span class="cz-req" aria-hidden="true">*</span></label>
        <input id="cz-telefono" type="tel" inputmode="numeric" pattern="[0-9]*" maxlength="15" autocomplete="off" required aria-required="true" placeholder="10 dígitos" enterkeyhint="next" aria-describedby="cz-telefono-err">
        <p class="cz-err" id="cz-telefono-err" hidden></p></div>
    </fieldset>
    <fieldset class="cz-bloque"><legend>2 · Motocicleta y vigencia</legend>
      <div class="cz-campo"><label for="cz-moto">Motocicleta (modelo) <span class="cz-req" aria-hidden="true">*</span></label>
        <input id="cz-moto" type="text" maxlength="60" autocomplete="off" autocapitalize="characters" required aria-required="true" placeholder="Escribe el modelo; saldrán sugerencias" enterkeyhint="next" role="combobox" aria-expanded="false" aria-controls="cz-moto-sug" aria-describedby="cz-moto-err">
        <div class="cz-lista" id="cz-moto-sug" role="listbox" hidden></div>
        <p class="cz-err" id="cz-moto-err" hidden></p></div>
      <div class="cz-fila2">
        <div class="cz-campo"><label for="cz-anio">Año <span class="cz-req" aria-hidden="true">*</span></label>
          <input id="cz-anio" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" required aria-required="true" placeholder="Ej. 2022" aria-describedby="cz-anio-err">
          <p class="cz-err" id="cz-anio-err" hidden></p></div>
        <div class="cz-campo"><label for="cz-vigencia">Vigencia (válida hasta) <span class="cz-req" aria-hidden="true">*</span></label>
          <input id="cz-vigencia" type="date" required aria-required="true" aria-describedby="cz-vigencia-err">
          <p class="cz-err" id="cz-vigencia-err" hidden></p></div>
      </div>
    </fieldset>
    <fieldset class="cz-bloque"><legend>3 · Productos</legend>
      <div class="cz-campo"><label for="cz-buscador">Producto: SKU o nombre</label>
        <input id="cz-buscador" type="search" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="Escribe o pega el SKU…" aria-describedby="cz-buscador-err">
        <p class="cz-err" id="cz-buscador-err" hidden></p>
        <div class="cz-lista" id="cz-resultados" hidden></div></div>
      <div class="cz-oferta" id="cz-oferta" hidden role="status" aria-live="polite"></div>
      <div id="cz-lineas"></div>
      <button type="button" class="cz-btn-linea" id="cz-add-pedido">+ Producto bajo pedido (número de parte)</button>
    </fieldset>
    <div class="cz-pie">
      <div class="cz-total"><span>Total con IVA</span><span id="cz-total">$0.00</span></div>
      <p class="cz-aviso" id="cz-aviso" role="status"></p>
      <p class="cz-ayuda">Los campos con <span class="cz-req" aria-hidden="true">*</span> son obligatorios. El ID de cliente es opcional.</p>
      <div class="cz-error" id="cz-error" role="alert"></div>
      <button type="button" class="cz-btn" id="cz-guardar">Guardar cotización</button>
    </div>
  </div>
  <div id="cz-listo" class="cz-listo" hidden>
    <div class="cz-ayuda" id="cz-listo-titulo">Cotización guardada</div>
    <div class="cz-folio" id="cz-folio"></div>
    <p id="cz-listo-detalle"></p><p class="cz-aviso" id="cz-listo-aviso"></p>
    <button type="button" class="cz-btn" id="cz-vista">${IC.ojo} Vista previa de la hoja</button>
    <button type="button" class="cz-btn cz-sec2" id="cz-whats">Enviar WhatsApp</button>
    <button type="button" class="cz-btn cz-sec2" id="cz-a-nota">Pasar a nota de venta</button>
    <button type="button" class="cz-btn cz-sec2" id="cz-otra">Nueva cotización</button>
    <button type="button" class="cz-btn cz-sec2" id="cz-historial">Ver mis cotizaciones</button>
    <button type="button" class="cz-btn cz-sec2" id="cz-cerrar-listo">Cerrar</button>
  </div>
 </div>
</div>
<div class="cz-panel" id="cz-panel" hidden role="dialog" aria-modal="true" aria-labelledby="cz-panel-titulo"><div id="cz-panel-cont"></div></div>`;

/* ───────────── Vista previa de la hoja (el mismo PDF que se comparte, dentro de la app) ───────────── */
const CV_HTML = `
<div class="cz-overlay cz-cv" id="cv-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="cv-titulo">
 <div class="cz-card">
  <div class="cz-top"><h2 id="cv-titulo" style="flex:1;margin:0">Cotización</h2>
    <button type="button" class="cz-x" id="cv-cerrar" aria-label="Cerrar">${IC.cerrar}</button></div>
  <p class="cz-ayuda" id="cv-sub" style="margin:0 0 10px"></p>
  <iframe id="cv-marco" class="cz-cv-marco" title="Vista previa de la cotización"></iframe>
  <p class="cz-ayuda" style="text-align:center"><a id="cv-aparte" href="#" target="_blank" rel="noopener" style="color:inherit">¿No se ve bien? Ábrela aparte</a></p>
  <p class="cz-ayuda" id="cv-seg" role="status" aria-live="polite"></p>
  <div class="cz-acciones">
    <button type="button" class="cz-prim" id="cv-wa">Reenviar por WhatsApp</button>
    <a id="cv-descargar" href="#" download="Cotización.pdf" role="button">${IC.bajar} Descargar</a>
    <button type="button" id="cv-pdf">Compartir PDF</button>
    <button type="button" id="cv-editar">Editar</button>
    <button type="button" id="cv-estado">Cambiar estado</button>
    <button type="button" id="cv-nota">Pasar a nota de venta</button>
  </div>
 </div>
</div>`;

/* ───────────── Errores por campo ───────────── */
const errGeneral = m => { const e = $('cz-error'); e.textContent = m || ''; e.classList.toggle('cz-ver', !!m); };
const avisoTxt = m => { $('cz-aviso').textContent = m || ''; };
function errCampo(id, msg) { const p = $(id + '-err'), c = $(id); if (p) { p.textContent = msg || ''; p.hidden = !msg; } if (c) c.setAttribute('aria-invalid', msg ? 'true' : 'false'); }
const mostrarErrores = errs => { CAMPOS.forEach(id => errCampo(id, '')); errs.forEach(([id, m]) => errCampo(id, m)); };
function validarCampos() {
  const e = [], nombre = $('cz-cliente').value.trim(), tel = $('cz-telefono').value, anio = $('cz-anio').value.trim(), vig = $('cz-vigencia').value;
  if (!nombre) e.push(['cz-cliente', 'Captura el nombre del cliente.']); else if (!RE_NOMBRE.test(nombre)) e.push(['cz-cliente', 'El nombre solo puede llevar letras.']);
  if (!tel) e.push(['cz-telefono', 'Captura el teléfono del cliente.']); else if (!/^\d+$/.test(tel)) e.push(['cz-telefono', 'El teléfono solo puede llevar números.']);
  else if (tel.length < 10 || tel.length > 15) e.push(['cz-telefono', 'El teléfono debe tener entre 10 y 15 dígitos.']);
  if (!$('cz-moto').value.trim()) e.push(['cz-moto', 'Captura el modelo de la motocicleta.']);
  if (!/^\d{4}$/.test(anio) || Number(anio) < 1950 || Number(anio) > new Date().getFullYear() + 1) e.push(['cz-anio', 'El año debe ser de 4 números (por ejemplo 2022).']);
  if (!vig) e.push(['cz-vigencia', 'Elige hasta qué fecha es válida.']); else if (vig < iso(new Date())) e.push(['cz-vigencia', 'La vigencia no puede ser anterior a hoy.']);
  if (!lineas.length) e.push(['cz-buscador', 'Agrega al menos un producto.']);
  else if (lineas.find(l => l.tipo === 'pedido' && !String(l.numeroParte).trim())) e.push(['cz-buscador', 'Captura el número de parte de cada producto bajo pedido.']);
  return e;
}
const validarUno = id => { const hit = validarCampos().find(x => x[0] === id); errCampo(id, hit ? hit[1] : ''); };

/* ───────────── Secciones ───────────── */
function pintarSecciones() {
  const box = $('cz-secciones'), mias = seccionesQueCotizo();
  if (mias.length === 1) { box.innerHTML = '<span class="cz-chip cz-ok">' + IC.ok + ' Cotizas en ' + esc(SECCIONES[mias[0]]) + '</span><span class="cz-ayuda" style="margin:0 0 0 6px">El resto del inventario lo ves en modo consulta.</span>'; return; }
  box.innerHTML = mias.map(s => '<button type="button" class="cz-sec" role="radio" aria-checked="' + (s === seccion) + '" data-sec="' + s + '">' + esc(SECCIONES[s]) + '</button>').join('');
}
async function cambiarSeccion(s) {
  if (s === seccion || !puedeCotizarEn(s)) return;
  if (lineas.length && !(await confirmarMaps({ titulo: 'Cambiar de sección', mensaje: 'Una cotización no mezcla secciones. Se quitarán los productos agregados. ¿Continuar?', confirmar: 'Cambiar', cancelar: 'No' }))) return;
  seccion = s; lineas = []; pintarSecciones(); pintarLineas(); pintarResultados();
}
/** Tu sección de arranque: la de tu almacén; si cotizas en varias, Vento. */
const seccionInicial = () => { const m = seccionesQueCotizo(); const a = almacenCuenta(); const propia = a && seccionDeTexto(a); return (propia && m.indexOf(propia) !== -1) ? propia : m[0]; };
const agenciaAuto = () => (seccion === 'SUZUKI' || seccion === 'BAJAJ') ? seccion : (almacenCuenta().indexOf('CARABELA') !== -1 ? 'CARABELA' : 'VENTO');

/* ───────────── Existencias, origen y traspaso ───────────── */
const stockEnSeccion = info => info ? Object.keys(info.sucursales).filter(s => seccionDeTexto(s) === seccion).reduce((t, s) => t + info.sucursales[s], 0) : 0;
function opcionesOrigen(sku) {
  const info = infoSku(sku); if (!info) return [];
  const zd = zonaDestino(), propia = tieneAgenciaPropia();
  return Object.keys(info.sucursales).filter(s => seccionDeTexto(s) === seccion).map(s => {
    const mia = esMiSucursal(s), zo = zonaDe(s);
    return { sucursal: s, cantidad: info.sucursales[s], mia: mia, propia: propia, zonaIgual: !!(zo && zd && zo === zd), eta: (!propia || mia || !zo || !zd) ? '' : (zo === zd ? ETA_MISMA_ZONA : ETA_OTRA_ZONA) };
  }).sort((a, b) => (b.mia - a.mia) || (b.zonaIgual - a.zonaIgual) || (b.cantidad - a.cantidad));
}
function origenActual(l) { const o = opcionesOrigen(l.sku), cur = o.find(x => x.sucursal === l.origen) || o[0] || null; if (cur) l.origen = cur.sucursal; return { opc: o, cur: cur }; }

/* ───────────── Resultados de búsqueda (todo Grupo Camejo) ───────────── */
function filaResultado(p) {
  const enSec = p.secciones.indexOf(seccion) !== -1, sinStock = p.stock <= 0;
  const addable = (enSec || sinStock) && puedeCotizarEn(seccion);
  const otras = p.secciones.filter(s => s !== seccion);
  let accion;
  if (addable) accion = '<span class="cz-badge ' + (enSec ? 'cz-ok' : 'cz-aten') + '">' + (enSec ? IC.ok + ' En existencia' : IC.aviso + ' Bajo pedido') + '</span>';
  else if (otras.length && otras.some(puedeCotizarEn)) accion = '<span class="cz-badge cz-aten">' + IC.aviso + ' Está en ' + esc(otras.map(s => SECCIONES[s]).join(', ')) + ': cambia de sección</span>';
  else accion = '<span class="cz-badge cz-cons">' + IC.candado + ' Solo consulta · ' + esc((otras.length ? otras : p.secciones).map(s => SECCIONES[s]).join(', ')) + '</span>';
  const suc = Object.keys(p.sucursales).sort((a, b) => p.sucursales[b] - p.sucursales[a]).slice(0, 4).map(s => esc(s) + ' (' + p.sucursales[s] + ')').join(' · ');
  const precio = p.precioLista > 0 ? '<span class="cz-precio">' + moneda(arriba(p.precioLista)) + '</span>' : '<span class="cz-sku">Sin precio en lista</span>';
  return '<button type="button" class="cz-res" data-sku="' + esc(p.sku) + '"' + (addable ? '' : ' data-cons="1"') + '>'
    + '<b>' + esc(p.nombre || 'SKU ' + p.sku) + '</b>'
    + '<span class="cz-sub"><span class="cz-sku">' + esc(p.sku) + '</span>' + precio + accion + '</span>'
    + (suc ? '<span class="cz-sub">' + suc + '</span>' : '')
    + avisosHtml(p.sku, false) + '</button>';
}
function pintarResultados() {
  const cont = $('cz-resultados'), q = norm($('cz-buscador').value);
  if (q.length < 2) { cont.hidden = true; cont.innerHTML = ''; return []; }
  const res = buscar(q);
  cont.hidden = false;
  cont.innerHTML = res.length ? res.map(filaResultado).join('') : '<p class="cz-ayuda" style="padding:8px 4px">Sin resultados. Si no está en el inventario, agrégalo bajo pedido con su número de parte.</p>';
  return res;
}

/* ───────────── Líneas ───────────── */
function precioLinea(l) {
  if (l.tipo === 'catalogo' && listaGC && listaGC[skuN(l.sku)]) return { valor: arriba(listaGC[skuN(l.sku)].precio), lista: true };
  const a = Number(l.precioAprox); return a > 0 ? { valor: arriba(a), lista: false } : { valor: null, lista: false };
}
function actualizarImportes() {
  guardarBorrador();
  let total = 0, sin = 0;
  lineas.forEach(l => { const p = precioLinea(l), el = $('cz-imp-' + l.id); if (p.valor === null) { sin++; if (el) el.textContent = '—'; } else { total += p.valor * l.cantidad; if (el) el.textContent = moneda(p.valor * l.cantidad); } });
  $('cz-total').textContent = moneda(total);
  avisoTxt(sin ? sin + (sin === 1 ? ' producto sin precio: captura uno aproximado o se guarda sin importe.' : ' productos sin precio: captura uno aproximado o se guardan sin importe.') : '');
}
function pintarLineas() {
  const cont = $('cz-lineas');
  if (!lineas.length) { cont.innerHTML = '<p class="cz-ayuda" style="margin-top:10px">Aún no hay productos. Busca un SKU o agrega uno bajo pedido.</p>'; actualizarImportes(); return; }
  cont.innerHTML = lineas.map(l => {
    const ped = l.tipo === 'pedido', p = precioLinea(l), o = ped ? { opc: [], cur: null } : origenActual(l), cur = o.cur, opc = o.opc;
    const sobre = !ped && cur && l.cantidad > cur.cantidad;
    const disp = l.disponibilidad === 'En existencia' ? '<span class="cz-badge cz-ok">' + IC.ok + ' En existencia</span>' : '<span class="cz-badge cz-aten">' + IC.aviso + ' Bajo pedido</span>';
    const avisoStock = sobre ? '<div class="cz-badge cz-aten" style="margin-top:6px">' + IC.aviso + ' Solo hay ' + cur.cantidad + ' en ' + esc(cur.sucursal) + '</div>' : '';
    const origen = (!ped && opc.length) ? '<div class="cz-campo" style="margin-top:8px"><label for="cz-or-' + l.id + '">Sale de</label><select id="cz-or-' + l.id + '" data-id="' + l.id + '" data-act="origen">'
      + opc.map(x => '<option value="' + esc(x.sucursal) + '"' + (x.sucursal === cur.sucursal ? ' selected' : '') + '>' + esc(x.sucursal) + ' (' + x.cantidad + ')' + '</option>').join('') + '</select>'
      + (cur.propia ? '<p class="cz-ayuda">' + (cur.mia ? '<span class="cz-badge cz-ok">' + IC.ok + ' Sin traspaso</span>' : '<span class="cz-badge cz-aten">' + IC.camion + ' Traspaso' + (cur.eta ? ' · llega en ' + esc(cur.eta) : '') + '</span>') + '</p>' : '') + '</div>' : '';
    const cabeza = ped
      ? '<div style="flex:1;min-width:0"><div class="cz-campo"><label for="cz-np-' + l.id + '">Número de parte (solo lo ves tú; no sale en la hoja)</label>'
        + '<input id="cz-np-' + l.id + '" data-id="' + l.id + '" data-campo="numeroParte" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" value="' + esc(l.numeroParte) + '">'
        + '<p class="cz-ayuda" id="cz-vn-' + l.id + '" role="status" aria-live="polite">' + esc(l.vnTexto || '') + '</p></div>'
        + '<div class="cz-campo"><label for="cz-ds-' + l.id + '">Descripción</label><input id="cz-ds-' + l.id + '" data-id="' + l.id + '" data-campo="descripcion" type="text" autocomplete="off" value="' + esc(l.descripcion) + '"></div>' + disp + '</div>'
      : '<div style="min-width:0"><div class="cz-desc">' + esc(l.descripcion || 'SKU ' + l.sku) + '</div><div class="cz-sku">' + esc(l.sku) + '</div>' + disp + avisoStock + avisosHtml(l.sku, true) + origen + '</div>';
    const precioHtml = (!ped && p.lista)
      ? '<div class="cz-ayuda" style="margin:0">' + moneda(p.valor) + ' c/u</div><div class="cz-imp" id="cz-imp-' + l.id + '">' + moneda(p.valor * l.cantidad) + '</div>'
      : '<div class="cz-campo" style="margin:0"><label for="cz-pa-' + l.id + '">' + (ped ? 'Precio aproximado' : 'Sin precio en lista: captura uno') + '</label><input id="cz-pa-' + l.id + '" data-id="' + l.id + '" data-campo="precioAprox" type="number" inputmode="decimal" min="0" step="0.01" value="' + esc(l.precioAprox) + '"' + (precioBloqueado(l) ? ' readonly aria-readonly="true" title="Precio sugerido de VENTO: solo administración lo puede cambiar"' : '') + '></div>'
        + '<div class="cz-imp" id="cz-imp-' + l.id + '">' + (p.valor === null ? '—' : moneda(p.valor * l.cantidad)) + '</div>';
    return '<div class="cz-linea" id="cz-l-' + l.id + '"><div class="cz-linea-top">' + cabeza
      + '<button type="button" class="cz-quitar" data-id="' + l.id + '" data-act="quitar" aria-label="Quitar ' + esc(ped ? (l.numeroParte || 'producto bajo pedido') : l.sku) + '">' + IC.quitar + '</button></div>'
      + '<div class="cz-fila"><div class="cz-qty"><button type="button" aria-label="Menos" data-id="' + l.id + '" data-act="menos">−</button>'
      + '<input type="number" inputmode="numeric" min="1" max="9999" value="' + l.cantidad + '" aria-label="Cantidad" data-id="' + l.id + '" data-campo="cantidad">'
      + '<button type="button" aria-label="Más" data-id="' + l.id + '" data-act="mas">+</button></div><div style="text-align:right">' + precioHtml + '</div></div></div>';
  }).join('');
  actualizarImportes();
}
/** Agrega un SKU a la cotización. Devuelve true si se agregó. cant: cantidad (kits). */
function agregarSku(sku, cant, silencioso) {
  const info = infoSku(sku);
  if (!info) { if (!silencioso) toast('Ese SKU no está en el inventario que ve tu cuenta.'); return false; }
  if (!puedeCotizarEn(seccion)) { toast('Tu cuenta no puede cotizar en esta sección.'); return false; }
  if (info.stock > 0 && info.secciones.indexOf(seccion) === -1) { if (!silencioso) toast('Ese producto es de otra sección (' + info.secciones.map(s => SECCIONES[s]).join(', ') + '). Una cotización no mezcla secciones.'); return false; }
  const n = Math.max(1, Math.min(9999, Math.floor(Number(cant)) || 1)), ya = lineas.find(l => l.tipo === 'catalogo' && skuN(l.sku) === info.k);
  if (ya) ya.cantidad = Math.min(ya.cantidad + n, 9999);
  else lineas.push({ id: ++seq, tipo: 'catalogo', sku: info.sku, descripcion: info.nombre || '', disponibilidad: stockEnSeccion(info) > 0 ? 'En existencia' : 'Bajo pedido', cantidad: n, precioAprox: '' });
  errGeneral(''); errCampo('cz-buscador', '');
  if (!silencioso) { $('cz-buscador').value = ''; $('cz-resultados').hidden = true; mostrarOferta(info.sku); }
  pintarLineas();
  return true;
}
/** Aviso destacado para ofrecer promoción, mayoreo o kit del SKU recién agregado. */
function mostrarOferta(sku) {
  const box = $('cz-oferta'), p = promoDe(sku), kits = kitsDe(sku), partes = [];
  if (p && p.precio > 0) partes.push('Tiene <b style="display:inline">promoción a ' + moneda(p.precio) + '</b>' + (p.hasta ? ' hasta el ' + esc(fechaLarga(p.hasta)) : ''));
  if (p && p.mayoreo) partes.push('Mayoreo desde ' + p.mayoreo.min + ' piezas a ' + moneda(p.mayoreo.precio) + ' c/u' + (p.hasta ? ' (hasta el ' + esc(fechaLarga(p.hasta)) + ')' : ''));
  kits.forEach(k => partes.push('Está en el kit «' + esc(k.nombre) + '» con ' + Math.round(_kitPct(k)) + '% de descuento' + (kitHasta(k) ? ' hasta el ' + esc(fechaLarga(kitHasta(k))) : '') + ' <button type="button" class="cz-link" data-kit="' + esc(k.id) + '" data-sku="' + esc(sku) + '">Ver kit</button>'));
  if (!partes.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.innerHTML = '<b>Ofrécelo al cliente</b>' + partes.join('<br>'); box.hidden = false;
}
function agregarPedido() {
  lineas.push({ id: ++seq, tipo: 'pedido', sku: '', descripcion: '', disponibilidad: 'Bajo pedido', cantidad: 1, numeroParte: '', precioAprox: '' });
  errGeneral(''); pintarLineas(); setTimeout(() => { const i = document.querySelector('#cz-l-' + seq + ' input[data-campo="numeroParte"]'); if (i) i.focus(); }, 30);
}
/** Precio sugerido de la lista de VENTO (bajo pedido): solo administración lo puede cambiar.
 *  Vendedores lo ven bloqueado; si la parte no está en la lista o no trae precio, se captura a mano. */
const soyAdminReal = () => typeof esAdmin !== 'undefined' && esAdmin === true;   // en Maps esAdmin ya excluye a vendedores
const precioBloqueado = l => !soyAdminReal() && !!l && l.tipo === 'pedido' && Number(l.precioVento) > 0;
function aplicarBloqueoPrecio(l) {
  const pa = $('cz-pa-' + l.id); if (!pa) return;
  const b = precioBloqueado(l);
  pa.readOnly = b; pa.title = b ? 'Precio sugerido de VENTO: solo administración lo puede cambiar' : ''; pa.setAttribute('aria-readonly', b ? 'true' : 'false');
}
/** Cotización o borrador cargado: se confirma en la lista qué precios están bloqueados (sin cambiar lo ya capturado). */
function verificarBloqueosPrecio() {
  if (soyAdminReal()) return;
  lineas.forEach(l => { if (l.tipo === 'pedido' && String(l.numeroParte || '').trim().length >= 3) buscarParte(l.id, true); });
}
/** Línea bajo pedido: con el número de parte trae el precio sugerido de la lista de VENTO. Solo en Vento / Carabela.
 *  soloBloquear: solo confirma el bloqueo, sin tocar lo capturado. */
let _parteT = {};
function buscarParte(id, soloBloquear) {
  clearTimeout(_parteT[id]);
  _parteT[id] = setTimeout(async () => {
    const l0 = lineas.find(x => x.id === id); if (!l0) return;
    const np = String(l0.numeroParte || '').trim(), estado = t => { l0.vnTexto = t; const el = $('cz-vn-' + id); if (el) el.textContent = t; };
    if (np.length < 3 || seccion !== 'VENTO') { l0.precioVento = 0; aplicarBloqueoPrecio(l0); estado(''); return; }
    estado('Buscando en la lista de VENTO…');
    try {
      const rs = await api('consultarParteVento', { numeroParte: np });
      const l = lineas.find(x => x.id === id); if (!l || String(l.numeroParte || '').trim() !== np) return;
      if (!rs.success) { estado(rs.message || 'No se pudo consultar la lista de VENTO.'); return; }
      if (!rs.encontrado) { l.precioVento = 0; aplicarBloqueoPrecio(l); estado('No está en la lista de VENTO: captura el precio aproximado a mano.'); return; }
      if (!soloBloquear && !String(l.descripcion || '').trim() && rs.descripcion) { l.descripcion = rs.descripcion; const d = $('cz-ds-' + id); if (d) d.value = rs.descripcion; }
      const partes = [];
      if (rs.precio > 0) {
        l.precioVento = Number(rs.precio);
        if (!soloBloquear && (!l.precioManual || !soyAdminReal())) { l.precioAprox = Number(rs.precio).toFixed(2); const pa = $('cz-pa-' + id); if (pa) pa.value = l.precioAprox; }   // quien no es admin siempre queda con el precio de lista
        partes.push('Precio sugerido de lista: ' + moneda(rs.precio) + (soyAdminReal() ? ' (editable)' : ' (solo administración lo modifica)'));
      } else { l.precioVento = 0; partes.push('Precio pendiente en la lista: captura uno aproximado'); }
      aplicarBloqueoPrecio(l);
      if (rs.disponibilidad) partes.push('Disponibilidad: ' + rs.disponibilidad + (rs.fechaRecibo ? ' · recibo ' + rs.fechaRecibo : ''));
      if (rs.aplicacion) partes.push('Aplicación: ' + rs.aplicacion);
      estado(partes.join(' · ')); actualizarImportes();
    } catch (e) { estado('No se pudo consultar la lista de VENTO. Captura el precio a mano.'); }
  }, 450);
}

/* ───────────── Kit: ver y agregar ───────────── */
function abrirKit(kitId, sku) {
  const kit = kitsDisponibles().find(k => String(k.id) === String(kitId)); if (!kit) return;
  const pct = _kitPct(kit), items = _kitItemsDe(kit);
  const filas = items.map(i => {
    const info = infoSku(i.sku), base = info && info.precioLista > 0 ? info.precioLista : 0, cant = Math.max(1, Number(i.cantidad) || 1);
    return '<tr><td>' + esc((info && info.nombre) || i.descripcion || i.sku) + '<br><span class="cz-sku">' + esc(i.sku) + '</span></td><td class="cz-r">' + cant + '</td>'
      + '<td class="cz-r">' + (base ? moneda(arriba(base)) : '—') + '</td><td class="cz-r"><b>' + (base ? moneda(arriba(base * (100 - pct) / 100)) : '—') + '</b></td></tr>';
  }).join('');
  $('cz-panel-cont').innerHTML = '<h2 id="cz-panel-titulo">Kit «' + esc(kit.nombre) + '»</h2>'
    + '<p class="cz-ayuda">' + (kit.moto ? esc(kit.moto) + ' · ' : '') + Math.round(pct) + '% de descuento' + (kitHasta(kit) ? ' · vigente hasta el ' + esc(fechaLarga(kitHasta(kit))) : '') + '</p>'
    + '<table class="cz-tabla"><thead><tr><th>Producto</th><th class="cz-r">Cant.</th><th class="cz-r">Lista</th><th class="cz-r">Con kit</th></tr></thead><tbody>' + filas + '</tbody></table>'
    + '<p class="cz-ayuda">El descuento del kit se aplica al hacer la nota de venta («Agregar kit de servicio»). La cotización lleva precio de lista.</p>'
    + '<button type="button" class="cz-btn" id="cz-kit-add">Agregar los productos a la cotización</button>'
    + '<button type="button" class="cz-btn cz-sec2" id="cz-kit-cerrar">Cerrar</button>';
  $('cz-panel').hidden = false;
  $('cz-kit-cerrar').onclick = cerrarPanel;
  $('cz-kit-add').onclick = () => {
    let ok = 0, no = 0;
    items.forEach(i => { if (agregarSku(i.sku, Math.max(1, Number(i.cantidad) || 1), true)) ok++; else no++; });
    cerrarPanel(); mostrarOferta(sku || (items[0] && items[0].sku));
    toast(ok + ' producto(s) agregado(s)' + (no ? ' · ' + no + ' no se pueden cotizar en esta sección' : ''));
  };
  setTimeout(() => $('cz-kit-add').focus(), 30);
}
function cerrarPanel() { $('cz-panel').hidden = true; }

/* ───────────── Cliente (ID o teléfono) y moto ───────────── */
async function buscarCliente() {
  const q = soloDigitos($('cz-idcliente').value); $('cz-idcliente').value = q;
  const est = $('cz-id-estado'), lista = $('cz-id-resultados'); lista.hidden = true; lista.innerHTML = '';
  if (!q) { est.textContent = 'Con el ID o el teléfono se traen el nombre y el teléfono.'; return; }
  if (q.length < 2) { est.textContent = 'Escribe al menos 2 números.'; return; }
  if (!navigator.onLine) { est.textContent = 'Sin señal: captura el nombre y el teléfono a mano.'; return; }
  est.textContent = 'Buscando…';
  try {
    const rs = await api('buscarMecanico', { consulta: q });
    if (!rs.success) { est.textContent = rs.message || 'No se pudo buscar.'; return; }
    if (rs.encontrado) { elegirCliente({ id: rs.id, nombre: rs.nombre, telefono: rs.telefono }); return; }
    coincidencias = rs.coincidencias || [];
    if (!coincidencias.length) { est.textContent = 'No se encontró ese ID o teléfono. Captura el nombre y el teléfono a mano.'; $('cz-cliente').focus(); return; }
    est.textContent = coincidencias.length + ' coincidencias: elige una.';
    lista.innerHTML = coincidencias.map((m, k) => '<button type="button" class="cz-res" data-cli="' + k + '"><b>' + esc(m.nombre) + '</b><span class="cz-sub">ID ' + esc(m.id) + ' · ' + esc(m.telefono) + '</span></button>').join('');
    lista.hidden = false;
  } catch (e) { est.textContent = 'No se pudo buscar. Revisa tu conexión.'; }
}
function elegirCliente(m) {
  idResuelto = m.id || ''; $('cz-idcliente').value = m.id || ''; $('cz-cliente').value = soloLetras(m.nombre || '').trim(); $('cz-telefono').value = soloDigitos(m.telefono || '');
  $('cz-id-resultados').hidden = true; $('cz-id-estado').textContent = 'Cliente: ' + (m.nombre || '') + ' · ID ' + (m.id || ''); $('cz-moto').focus();
}
const motoClave = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
async function cargarMotos() { if (motosCargadas || !navigator.onLine) return; try { const rs = await api('listarMotos'); if (rs && rs.success && Array.isArray(rs.motos)) { motos = rs.motos; motosCargadas = true; try { localStorage.setItem('czMotos', JSON.stringify(motos)); } catch (e) {} } } catch (e) {} }
function sugerirMotos() {
  const caja = $('cz-moto-sug'), campo = $('cz-moto'), q = motoClave(campo.value), pal = q.split(' ').filter(Boolean);
  let sug = pal.length ? motos.filter(m => { const k = motoClave(m); return pal.every(p => k.indexOf(p) !== -1); }).sort((a, b) => (motoClave(a).indexOf(q) === 0 ? 0 : 1) - (motoClave(b).indexOf(q) === 0 ? 0 : 1)).filter(m => motoClave(m) !== q).slice(0, 6) : [];
  caja.innerHTML = sug.map((m, i) => '<button type="button" role="option" class="cz-res" data-moto="' + i + '"><b>' + esc(m) + '</b></button>').join(''); caja.hidden = !sug.length; campo.setAttribute('aria-expanded', String(!!sug.length)); caja._sug = sug;
}
const ocultarMotos = () => { const c = $('cz-moto-sug'); if (c) c.hidden = true; const m = $('cz-moto'); if (m) m.setAttribute('aria-expanded', 'false'); };

/* ───────────── Borrador local (por cuenta y sección) ───────────── */
const BORRADOR_DIAS = 7;
const claveBorrador = () => 'czBorrador:' + String(usuarioActual || '').toLowerCase() + ':' + seccion;
function borradorAhora() {
  if (edicion || guardada || $('cz-overlay').hidden) return;
  try {
    const d = { v: 1, t: Date.now(), idCliente: idResuelto, idTexto: $('cz-idcliente').value, cliente: $('cz-cliente').value, telefono: $('cz-telefono').value, moto: $('cz-moto').value, anio: $('cz-anio').value, vigencia: $('cz-vigencia').value, lineas: lineas };
    const vacio = !d.idTexto && !d.cliente.trim() && !d.telefono && !d.moto.trim() && !d.anio && !d.lineas.length;
    if (vacio) localStorage.removeItem(claveBorrador()); else localStorage.setItem(claveBorrador(), JSON.stringify(d));
  } catch (e) {}
}
function guardarBorrador() { clearTimeout(borradorT); borradorT = setTimeout(borradorAhora, 400); }
function borrarBorrador() { clearTimeout(borradorT); try { localStorage.removeItem(claveBorrador()); } catch (e) {} }
function leerBorrador() { try { const d = JSON.parse(localStorage.getItem(claveBorrador()) || 'null'); if (!d || d.v !== 1 || Date.now() - d.t > BORRADOR_DIAS * 86400000) { if (d) borrarBorrador(); return null; } return d; } catch (e) { return null; } }
const haceCuanto = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'hace un momento' : m < 60 ? 'hace ' + m + ' min' : m < 1440 ? 'hace ' + Math.round(m / 60) + ' h' : 'hace ' + Math.round(m / 1440) + ' d'; };
function restaurarBorrador(d) {
  $('cz-idcliente').value = d.idTexto || ''; idResuelto = d.idCliente || ''; $('cz-cliente').value = d.cliente || ''; $('cz-telefono').value = d.telefono || ''; $('cz-moto').value = d.moto || ''; $('cz-anio').value = d.anio || '';
  if (d.vigencia && d.vigencia >= iso(new Date())) $('cz-vigencia').value = d.vigencia;
  lineas = (d.lineas || []).map(l => Object.assign({}, l, { id: ++seq }));
  $('cz-borrador-hace').textContent = haceCuanto(d.t); $('cz-borrador').hidden = false; pintarLineas(); verificarBloqueosPrecio();
}

/* ───────────── Abrir / reiniciar / cerrar ───────────── */
function reiniciar() {
  lineas = []; guardada = false; edicion = null; idResuelto = '';
  ['cz-cliente', 'cz-telefono', 'cz-moto', 'cz-anio', 'cz-idcliente', 'cz-buscador'].forEach(id => { $(id).value = ''; });
  $('cz-vigencia').value = vigOmision(); $('cz-titulo').textContent = 'Nueva cotización'; $('cz-guardar').textContent = 'Guardar cotización'; $('cz-listo-titulo').textContent = 'Cotización guardada';
  $('cz-id-estado').textContent = 'Con el ID o el teléfono se traen el nombre y el teléfono.'; $('cz-id-resultados').hidden = true; $('cz-resultados').hidden = true; $('cz-oferta').hidden = true;
  $('cz-form').hidden = false; $('cz-listo').hidden = true; errGeneral(''); avisoTxt(''); mostrarErrores([]); $('cz-borrador').hidden = true; pintarLineas();
}
function sincronizarDatos() {
  try { sincronizarListaPreciosGC(); sincronizarExistenciasCatalogo(); sincronizarPromociones(); sincronizarKits(); } catch (e) {}
}
function mostrar() {
  $('cz-overlay').hidden = false; document.body.style.overflow = 'hidden'; pintarSecciones();
  try { motos = JSON.parse(localStorage.getItem('czMotos') || '[]') || []; motosCargadas = false; } catch (e) { motos = []; }
  cargarMotos(); sincronizarDatos();
}
/** Abre «Nueva cotización». datosCliente: { nombre, telefono, idCliente } para precargar (viene de una nota o de un punto del mapa). */
function abrir(datosCliente) {
  if (!puedeUsarCotizador()) { toast('Tu cuenta no tiene permiso para cotizar.'); return; }
  seccion = seccionInicial();
  const borrador = datosCliente ? null : leerBorrador();
  reiniciar(); mostrar();
  if (borrador) restaurarBorrador(borrador);
  if (datosCliente) { $('cz-cliente').value = soloLetras(datosCliente.nombre || '').trim(); $('cz-telefono').value = soloDigitos(datosCliente.telefono || '').slice(0, 15); $('cz-idcliente').value = datosCliente.idCliente || ''; idResuelto = datosCliente.idCliente || ''; }
  setTimeout(() => { const f = (!$('cz-cliente').value) ? $('cz-idcliente') : $('cz-buscador'); try { f.focus(); } catch (e) {} }, 80);
}
async function cerrar(forzar) {
  if (!forzar && !guardada && !edicion) { borradorAhora(); if (lineas.length || $('cz-cliente').value.trim() || $('cz-telefono').value) toast('Se guardó como borrador en este celular.'); }
  else if (!forzar && edicion && lineas.length && !guardada && !(await confirmarMaps({ titulo: '¿Descartar los cambios?', mensaje: 'La cotización se queda como estaba.', confirmar: 'Descartar', cancelar: 'Seguir editando', tipo: 'peligro' }))) return;
  $('cz-overlay').hidden = true; document.body.style.overflow = ''; cerrarPanel();
}
/** Editar una cotización guardada (Borrador o Enviada) que nació en piso/Maps. */
async function editar(c) {
  if (!c || !c.folio) return;
  const motivo = motivoNoEditable(c); if (motivo) { toast(motivo); return; }
  const sec = seccionDeAgencia(c.agencia); if (!puedeCotizarEn(sec)) { toast('Solo consulta: esa cotización es de otra sección.'); return; }
  seccion = sec; reiniciar(); mostrar(); cerrarHistorial(true);
  edicion = { folio: c.folio, base: c };
  $('cz-titulo').textContent = 'Editar ' + c.folio; $('cz-guardar').textContent = 'Guardar cambios'; $('cz-listo-titulo').textContent = 'Cotización actualizada';
  $('cz-cliente').value = soloLetras(c.cliente || '').trim(); $('cz-telefono').value = soloDigitos(c.telefono || ''); $('cz-idcliente').value = c.idCliente || ''; idResuelto = c.idCliente || '';
  $('cz-moto').value = c.moto || ''; $('cz-anio').value = c.anio || ''; $('cz-vigencia').value = vigIso(c.vigencia) || vigOmision();
  lineas = (c.items || []).map(it => {
    const cant = Math.max(1, Math.min(9999, Math.floor(Number(it.cantidad)) || 1));
    if (it.tipo === 'pedido') return { id: ++seq, tipo: 'pedido', sku: '', descripcion: it.descripcion || '', disponibilidad: 'Bajo pedido', cantidad: cant, numeroParte: it.numeroParte || '', precioAprox: Number(it.precio) > 0 ? String(it.precio) : '' };
    const info = infoSku(it.sku);
    return { id: ++seq, tipo: 'catalogo', sku: String(it.sku || ''), descripcion: it.descripcion || (info && info.nombre) || '', disponibilidad: it.disponibilidad || 'En existencia', cantidad: cant, origen: it.origen || '', precioAprox: it.precioAprox && Number(it.precio) > 0 ? String(it.precio) : '' };
  });
  pintarSecciones(); pintarLineas(); verificarBloqueosPrecio();
}
const seccionDeAgencia = a => { const t = String(a || '').toUpperCase(); return (t === 'SUZUKI' || t === 'BAJAJ') ? t : 'VENTO'; };
function motivoNoEditable(c) {
  if (c.estado !== 'Borrador' && c.estado !== 'Enviada') return 'Solo se editan cotizaciones en Borrador o Enviada.';
  if (String(c.agencia || '').toUpperCase() === 'GENERAL' || c.solicitudId || (c.origen && String(c.origen).toUpperCase() !== 'PISO')) return 'Esta cotización viene de una solicitud del cliente; se corrige desde el catálogo.';
  return '';
}

/* ───────────── Guardar ───────────── */
async function guardar() {
  if (guardando) return;
  const errs = validarCampos(); mostrarErrores(errs);
  if (errs.length) { errGeneral(errs.length === 1 ? errs[0][1] : 'Revisa los ' + errs.length + ' campos marcados.'); const f = $(errs[0][0]); if (f) f.focus(); return; }
  errGeneral('');
  if (!navigator.onLine) { borradorAhora(); errGeneral('Sin señal: el folio lo asigna el servidor. Tu cotización quedó como borrador en este celular; guárdala cuando vuelva la conexión.'); return; }
  const btn = $('cz-guardar'); guardando = true; btn.disabled = true; btn.innerHTML = IC.girar + ' Guardando…';
  try {
    const datos = {
      cliente: $('cz-cliente').value.trim(), telefono: $('cz-telefono').value, idCliente: idResuelto, moto: $('cz-moto').value.trim(), anio: $('cz-anio').value.trim(), vigencia: $('cz-vigencia').value,
      agencia: edicion ? (edicion.base.agencia || agenciaAuto()) : agenciaAuto(), seccion: seccion, origen: 'PISO', app: 'maps',
      lineas: lineas.map(l => l.tipo === 'pedido'
        ? { tipo: 'pedido', cantidad: l.cantidad, numeroParte: l.numeroParte, descripcion: l.descripcion, precioAprox: l.precioAprox }
        : (() => { const o = origenActual(l), cur = o.cur; return { tipo: 'catalogo', sku: l.sku, cantidad: l.cantidad, descripcion: l.descripcion, disponibilidad: l.disponibilidad, precioAprox: l.precioAprox,
            origen: cur ? cur.sucursal : '', traspaso: !!(cur && cur.propia && !cur.mia), eta: cur ? cur.eta : '' }; })())
    };
    const ed = edicion;
    const rs = ed ? await api('editarCotizacion', { folio: ed.folio, datos: datos }) : await api('guardarCotizacion', { datos: datos });
    if (!rs.success) { errGeneral(rs.message || (ed ? 'No se pudieron guardar los cambios.' : 'No se pudo guardar la cotización.')); return; }
    guardada = true; borrarBorrador(); if (datos.moto && !motos.some(m => motoClave(m) === motoClave(datos.moto))) motos.push(datos.moto.toUpperCase());
    ultima = { folio: rs.folio || (ed && ed.folio), fecha: rs.fecha || (ed && ed.base.fecha), estado: rs.estado || (ed && ed.base.estado) || 'Borrador', agencia: datos.agencia, cliente: datos.cliente, telefono: datos.telefono, idCliente: datos.idCliente,
      moto: datos.moto, anio: datos.anio, vigencia: vigIso(rs.vigencia) || datos.vigencia, vendedorAgencia: rs.vendedorAgencia, vendedorWhats: rs.vendedorWhats, vendedorRol: rs.vendedorRol || (ed && ed.base.vendedorRol) || '',
      vendedorNombre: (ed && ed.base.vendedorNombre) || nombreActual || '', total: rs.total, subtotal: rs.subtotal, iva: rs.iva, items: rs.items };
    $('cz-form').hidden = true; $('cz-listo').hidden = false; $('cz-folio').textContent = ultima.folio;
    $('cz-listo-detalle').textContent = rs.items.length + (rs.items.length === 1 ? ' producto' : ' productos') + ' · Total ' + moneda(rs.total) + ' · Estado: ' + ultima.estado + ' · Vigente hasta el ' + fechaLarga(ultima.vigencia);
    $('cz-listo-aviso').textContent = rs.sinPrecio ? rs.sinPrecio + ' sin precio: revisa antes de enviarla al cliente.' : '';
    try { $('cz-whats').focus(); } catch (e) {}
    if (!$('cz-hist-overlay').hidden) cargarHistorial(1);
  } catch (e) {
    if (!/sesi/i.test(e.message || '')) errGeneral('Error de conexión. La cotización no se guardó; intenta de nuevo.');
  } finally { guardando = false; btn.disabled = false; btn.textContent = edicion ? 'Guardar cambios' : 'Guardar cotización'; }
}

/* ───────────── WhatsApp ───────────── */
function mensajeWhats(c) { const quien = String(c.vendedorNombre || nombreActual || '').trim(), rol = String(c.vendedorRol || '').trim(); return 'Hola buen día ' + c.cliente + ' soy ' + quien + (rol ? ' ' + rol : '') + ' lo contacto para compartirle su cotización'; }
function abrirWhats(c) { let tel = soloDigitos(c.telefono); if (tel.length === 10) tel = '52' + tel; window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent(mensajeWhats(c)), '_blank', 'noopener'); }
async function marcarEnviada(c) {
  if (c.estado !== 'Borrador') return;
  try { const rs = await api('cambiarEstadoCotizacion', { folio: c.folio, estado: 'Enviada' }); if (!rs.success) throw new Error(rs.message || 'No se pudo cambiar el estado.'); c.estado = 'Enviada'; if (ultima && ultima.folio === c.folio) { ultima.estado = 'Enviada'; const d = $('cz-listo-detalle'); if (d) d.textContent = d.textContent.replace('Estado: Borrador', 'Estado: Enviada'); } }
  catch (e) { toast((e && e.message) || 'No se pudo marcar como enviada; cámbiala desde el historial.'); }
}
async function enviarWhats(c, boton) {
  if (!c || !c.folio) return; abrirWhats(c);   // se abre en el mismo toque, antes de cualquier espera
  if (c.estado !== 'Borrador') return;
  const o = boton ? boton.innerHTML : ''; if (boton) { boton.disabled = true; boton.innerHTML = IC.girar + ' Marcando como enviada…'; }
  await marcarEnviada(c); if (boton) { boton.disabled = false; boton.innerHTML = o; }
}


/* ───────────── Hoja PDF «Cotización C000xx» (mismo diseño que el catálogo) ───────────── */
const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
let _jsPdfPromesa = null;

function _cargarJsPdf() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (_jsPdfPromesa) return _jsPdfPromesa;
    _jsPdfPromesa = new Promise((ok, mal) => {
        const s = document.createElement('script');
        s.src = JSPDF_URL;
        s.onload = () => (window.jspdf && window.jspdf.jsPDF) ? ok(window.jspdf.jsPDF) : (_jsPdfPromesa = null, mal(new Error('No se pudo preparar el PDF.')));
        s.onerror = () => { _jsPdfPromesa = null; mal(new Error('No se pudo cargar el generador de PDF. Revisa tu conexión.')); };
        document.head.appendChild(s);
    });
    return _jsPdfPromesa;
}

/** Logo de una marca como data URL (se guarda en memoria). Si no hay logo para esa clave o no carga, devuelve null. */
async function _hojaLogoUno(clave) {
    const k = String(clave || '').toUpperCase();
    const l = (window.LOGO_MARCAS || []).find(x => String(x.nombre || '').toUpperCase() === k);
    return l && l.src ? { dataUrl: l.src, w: l.w, h: l.h } : null;   // los logos van embebidos: sirve sin señal
}
/** Logos de la hoja según la cotización: la agencia con su logo (en Carabela, el de Carabela); si la emitió un admin
 *  (vendedorAgencia = TODAS) o es una cotización GENERAL, van los logos de todas las marcas. Devuelve un logo, una lista o null. */
async function _hojaLogoDe(cot) {
    const ag = String((cot && cot.agencia) || '').toUpperCase(), va = String((cot && cot.vendedorAgencia) || '').toUpperCase();
    const claves = (va.includes('TODAS') || ag === 'GENERAL') ? ['VENTO', 'CARABELA', 'SUZUKI', 'BAJAJ'] : [ag];
    const logos = (await Promise.all(claves.map(_hojaLogoUno))).filter(Boolean);
    return !logos.length ? null : (logos.length === 1 ? logos[0] : logos);
}

/** Nombre del archivo al guardar o compartir: «Cotización C00006.pdf». */
function _cotNombrePdf(cot) { return 'Cotización ' + String((cot && cot.folio) || '').replace(/[\\/:*?"<>|\s]+/g, '').trim() + '.pdf'; }

/** cot: { folio, fecha, agencia, cliente, telefono, idCliente, moto, anio, vendedorNombre, total, items:[{cantidad, sku, descripcion, disponibilidad, precio, precioAprox, importe}] } */
function hojaCotizacionConstruir(jsPDF, cot, logo) {
    const doc = new jsPDF({ unit: 'mm', format: 'letter' });
    doc.setProperties({ title: _cotNombrePdf(cot).replace(/\.pdf$/, ''), subject: 'Cotización ' + String(cot.folio || '') });
    const PW = 215.9, PH = 279.4, MX = 14, TW = PW - 2 * MX, LIM = PH - 18;
    const VERDE = [34, 177, 76], VERDE_TXT = [4, 120, 87], OSC = [15, 23, 42], GRIS = [71, 85, 105], LINEA = [203, 213, 225], FONDO = [241, 245, 249];
    const moneda = n => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const txt = v => String(v === null || v === undefined ? '' : v).trim();
    const items = Array.isArray(cot.items) ? cot.items : [];
    const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const mf = /^(\d{4})-(\d{2})-(\d{2})/.exec(txt(cot.fecha));
    const hoy = new Date();
    const fechaTxt = mf ? Number(mf[3]) + ' de ' + MESES[Number(mf[2]) - 1] + ' de ' + mf[1] : hoy.getDate() + ' de ' + MESES[hoy.getMonth()] + ' de ' + hoy.getFullYear();
    const mv = /^(\d{4})-(\d{2})-(\d{2})/.exec(txt(cot.vigencia));
    const vigTxt = mv ? Number(mv[3]) + ' de ' + MESES[Number(mv[2]) - 1] + ' de ' + mv[1] : '';
    const tel = txt(cot.telefono).replace(/\D/g, '');
    const telTxt = tel.length === 10 ? tel.slice(0, 3) + ' ' + tel.slice(3, 6) + ' ' + tel.slice(6) : tel;
    const fuente = (peso, tam, color) => { doc.setFont('helvetica', peso); doc.setFontSize(tam); doc.setTextColor(color[0], color[1], color[2]); };
    let y = 14;

    // ── Encabezado: logo (o nombre) a la izquierda; título, folio y fecha a la derecha
    if (logo) {
        const lista = Array.isArray(logo) ? logo : [logo], alto = lista.length > 1 ? 5.5 : 9;   // varias marcas: más chicas para que quepan junto al título
        let x = MX;
        lista.forEach(l => { const ancho = alto * l.w / l.h; try { doc.addImage(l.dataUrl, 'PNG', x, y - 2 + (9 - alto) / 2, ancho, alto); } catch (e) {} x += ancho + 4; });
    } else {
        fuente('bold', 13, OSC); doc.text('LA BARATA DEL HOGAR', MX, y + 4);
    }
    fuente('bold', 17, VERDE_TXT); doc.text('COTIZACIÓN', PW - MX, y + 3, { align: 'right' });
    fuente('bold', 10, OSC); doc.text('Folio: ' + txt(cot.folio), PW - MX, y + 9, { align: 'right' });
    fuente('normal', 9, GRIS); doc.text(fechaTxt, PW - MX, y + 14, { align: 'right' });
    if (vigTxt) { fuente('bold', 9, VERDE_TXT); doc.text('Vigencia: hasta el ' + vigTxt, PW - MX, y + 18.6, { align: 'right' }); }
    y += vigTxt ? 23.5 : 19;
    doc.setDrawColor(VERDE[0], VERDE[1], VERDE[2]); doc.setLineWidth(0.7); doc.line(MX, y, PW - MX, y);
    y += 6;

    // ── Datos del cliente (izquierda) y del asesor y la moto (derecha)
    const izq = [['CLIENTE', txt(cot.cliente), true]];
    if (txt(cot.idCliente)) izq.push(['', 'ID de cliente: ' + txt(cot.idCliente), false]);
    if (telTxt) izq.push(['', 'Teléfono: ' + telTxt, false]);
    const NOM_SEC = { VENTO: 'Vento / Carabela', SUZUKI: 'Suzuki', BAJAJ: 'Bajaj' };
    const fmtWa = w => { const d = txt(w).replace(/\D/g, ''); return d.length === 10 ? d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6) : d; };
    const contactos = Array.isArray(cot.contactos) ? cot.contactos : [];
    const der = contactos.length ? [] : [['ASESOR DE VENTAS', txt(cot.vendedorNombre) || '—', true]];
    // Cotización única: un contacto POR SECCIÓN (cada asesor atiende lo suyo)
    contactos.forEach((x, k) => {
        der.push([k === 0 ? 'CONTACTO POR SECCIÓN' : '', (NOM_SEC[x.seccion] || x.seccion) + ': ' + (txt(x.nombre) || '—') + (fmtWa(x.telefono || x.whats) ? ' · ' + fmtWa(x.telefono || x.whats) : ''), k === 0]);
        if (txt(x.correo)) der.push(['', txt(x.correo), false]);
    });
    // Contacto del asesor: solo viene si su cuenta es "vendedor" (el servidor no lo manda para admin ni gerente).
    const wa = txt(cot.vendedorWhats).replace(/\D/g, '');
    if (!contactos.length && wa) der.push(['', 'WhatsApp: ' + (wa.length === 10 ? wa.slice(0, 3) + ' ' + wa.slice(3, 6) + ' ' + wa.slice(6) : wa), false]);
    if (!contactos.length && wa && txt(cot.vendedorCorreo)) der.push(['', txt(cot.vendedorCorreo), false]);
    const moto = [txt(cot.moto), txt(cot.anio) ? 'Año ' + txt(cot.anio) : ''].filter(Boolean).join(' · ');
    if (moto) der.push(['MOTOCICLETA', moto, true]);
    const alturaCol = col => col.reduce((h, f) => h + (f[0] ? 4 : 0) + 4.6, 0);
    const hCaja = Math.max(alturaCol(izq), alturaCol(der)) + 6;
    doc.setFillColor(FONDO[0], FONDO[1], FONDO[2]); doc.roundedRect(MX, y, TW, hCaja, 1.5, 1.5, 'F');
    const pintaCol = (col, x0, ancho) => {
        let yy = y + 5;
        col.forEach(f => {
            if (f[0]) { fuente('bold', 7, GRIS); doc.text(f[0], x0, yy); yy += 4; }
            fuente(f[2] ? 'bold' : 'normal', f[2] ? 10.5 : 9, OSC);
            doc.text(doc.splitTextToSize(f[1], ancho)[0], x0, yy); yy += 4.6;
        });
    };
    pintaCol(izq, MX + 4, TW / 2 - 8);
    pintaCol(der, MX + TW / 2 + 4, TW / 2 - 8);
    y += hCaja + 7;

    // ── Tabla de partidas
    const cols = [
        { t: 'Cant.', w: 13, a: 'c' }, { t: 'SKU', w: 30, a: 'l' }, { t: 'Descripción', w: TW - 13 - 30 - 27 - 25 - 27, a: 'l' },
        { t: 'Disponibilidad', w: 27, a: 'l' }, { t: 'P. unit.', w: 25, a: 'r' }, { t: 'Importe', w: 27, a: 'r' }
    ];
    const celdaX = (k, a) => { const x0 = MX + cols.slice(0, k).reduce((s, c) => s + c.w, 0); return a === 'c' ? x0 + cols[k].w / 2 : a === 'r' ? x0 + cols[k].w - 2 : x0 + 2; };
    const encabezadoTabla = () => {
        doc.setFillColor(VERDE_TXT[0], VERDE_TXT[1], VERDE_TXT[2]); doc.rect(MX, y, TW, 7, 'F');
        fuente('bold', 8, [255, 255, 255]);
        cols.forEach((c, k) => doc.text(c.t, celdaX(k, c.a), y + 4.7, { align: c.a === 'c' ? 'center' : c.a === 'r' ? 'right' : 'left' }));
        y += 7;
    };
    encabezadoTabla();
    let hayAprox = false, sinPrecio = 0, secPrev = null;
    items.forEach((it, n) => {
        if (it.seccion && it.seccion !== secPrev) {   // franja de sección (cotización única)
            if (y + 14 > LIM) { doc.addPage(); y = 14; encabezadoTabla(); }
            doc.setFillColor(226, 232, 240); doc.rect(MX, y, TW, 6, 'F');
            fuente('bold', 8, OSC); doc.text('Surte: ' + (NOM_SEC[it.seccion] || it.seccion), MX + 2, y + 4.2);
            y += 6; secPrev = it.seccion;
        }
        const aprox = it.precioAprox === true && it.precio !== null && it.precio !== undefined;
        if (aprox) hayAprox = true;
        const sinP = it.precio === null || it.precio === undefined || it.importe === null || it.importe === undefined;
        if (sinP) sinPrecio++;
        fuente('normal', 8.5, OSC);
        const lDesc = doc.splitTextToSize(txt(it.descripcion) || '—', cols[2].w - 4);
        const lSku = doc.splitTextToSize(txt(it.sku) || '—', cols[1].w - 4);
        const lDisp = doc.splitTextToSize(txt(it.disponibilidad) || '—', cols[3].w - 4);
        const hFila = Math.max(lDesc.length, lSku.length, lDisp.length, 1) * 4 + 3;
        if (y + hFila > LIM) { doc.addPage(); y = 14; encabezadoTabla(); fuente('normal', 8.5, OSC); }
        if (n % 2 === 1) { doc.setFillColor(FONDO[0], FONDO[1], FONDO[2]); doc.rect(MX, y, TW, hFila, 'F'); }
        const base = y + 5;
        doc.text(String(it.cantidad), celdaX(0, 'c'), base, { align: 'center' });
        doc.text(lSku, celdaX(1, 'l'), base);
        doc.text(lDesc, celdaX(2, 'l'), base);
        doc.text(lDisp, celdaX(3, 'l'), base);
        doc.text(sinP ? 'Por confirmar' : moneda(it.precio) + (aprox ? '*' : ''), celdaX(4, 'r'), base, { align: 'right' });
        doc.text(sinP ? 'Por confirmar' : moneda(it.importe) + (aprox ? '*' : ''), celdaX(5, 'r'), base, { align: 'right' });
        doc.setDrawColor(LINEA[0], LINEA[1], LINEA[2]); doc.setLineWidth(0.15); doc.line(MX, y + hFila, MX + TW, y + hFila);
        y += hFila;
    });

    // ── Total y notas
    if (y + 66 > LIM) { doc.addPage(); y = 14; }
    y += 6;
    const wT = 78, xT = PW - MX - wT;
    // Los precios de la lista ya traen IVA: se desglosa Subtotal e IVA (16 %) y el total queda igual.
    const tot = Number(cot.total) || 0;
    const sub = (cot.subtotal !== undefined && cot.subtotal !== null && cot.subtotal !== '') ? Number(cot.subtotal) : Math.round(tot / 1.16 * 100) / 100;
    const iva = (cot.iva !== undefined && cot.iva !== null && cot.iva !== '') ? Number(cot.iva) : Math.round((tot - sub) * 100) / 100;
    fuente('normal', 9, GRIS);
    doc.text('Subtotal', xT + 2, y + 3); doc.text(moneda(sub), PW - MX - 2, y + 3, { align: 'right' });
    doc.text('IVA (16 %)', xT + 2, y + 8); doc.text(moneda(iva), PW - MX - 2, y + 8, { align: 'right' });
    y += 11;
    doc.setDrawColor(VERDE_TXT[0], VERDE_TXT[1], VERDE_TXT[2]); doc.setLineWidth(0.5); doc.line(xT, y, PW - MX, y);
    fuente('bold', 11, OSC); doc.text('TOTAL', xT + 2, y + 7);
    fuente('bold', 14, VERDE_TXT); doc.text(moneda(cot.total || 0), PW - MX - 2, y + 7.4, { align: 'right' });
    y += 14;
    fuente('normal', 8, GRIS);
    if (hayAprox) { doc.text('* Precio aproximado, por confirmar.', MX, y); y += 4.2; }
    if (sinPrecio) { doc.text(sinPrecio + (sinPrecio === 1 ? ' partida por confirmar, no incluida' : ' partidas por confirmar, no incluidas') + ' en el total.', MX, y); y += 4.2; }
    doc.text('Precios y existencias sujetos a confirmación.', MX, y);
    y += 4.2; doc.text('No hay cancelaciones ni devoluciones en refacciones eléctricas.', MX, y);
    if (vigTxt) { y += 4.2; doc.text('Esta cotización es válida hasta el ' + vigTxt + '.', MX, y); }
    y += 6; fuente('bold', 8, GRIS); doc.text('ESTOS PRECIOS ESTÁN SUJETOS A CAMBIO SIN PREVIO AVISO', MX, y);

    // ── Pie de cada hoja
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
        doc.setPage(i);
        fuente('normal', 8, GRIS);
        doc.text('Cotización ' + txt(cot.folio), MX, PH - 8);
        doc.text('Hoja ' + i + ' de ' + n, PW - MX, PH - 8, { align: 'right' });
    }
    return doc;
}

/** Genera la hoja y la comparte (celular) o la descarga. boton: se bloquea mientras prepara. */
async function hojaCotizacionPdf(cot, boton) {
    if (!cot || !cot.folio) { toast('No hay una cotización para generar la hoja.'); return; }
    const original = boton ? boton.innerHTML : '';
    if (boton) { boton.disabled = true; boton.innerHTML = '<i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i> Preparando…'; }
    try {
        const [jsPDF, logo] = await Promise.all([_cargarJsPdf(), _hojaLogoDe(cot)]);
        const doc = hojaCotizacionConstruir(jsPDF, cot, logo);
        const nombre = _cotNombrePdf(cot);
        const blob = doc.output('blob');
        const archivo = new File([blob], nombre, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
            try { await navigator.share({ files: [archivo], title: 'Cotización ' + cot.folio }); return; }
            catch (e) { if (e && e.name === 'AbortError') return; }   // si el celular no deja compartir, se descarga
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = nombre;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
        toast(e && e.message ? e.message : 'No se pudo generar la hoja.');
    } finally {
        if (boton) { boton.disabled = false; boton.innerHTML = original; }
    }
}

/* ───────────── Historial y seguimiento (mismo historial que el catálogo) ───────────── */
const ESTADOS = ['Borrador', 'Enviada', 'Vendido', 'Traspaso', 'Rechazado', 'Pedido'];
/** Maps solo muestra lo que se capturó en Maps (el servidor ya filtra por `app`; si aún no lo hace, lo que traiga la marca de otra app se descarta aquí). */
const soloMaps = arr => (arr || []).filter(c => !c || !('app' in c) || String(c.app || '').toLowerCase() === 'maps');
let hist = [], histPag = 1, histTotal = 0, histPorPag = 30, histEstado = '', histTexto = '', histTimer = null;
const HIST_HTML = `
<div class="cz-overlay" id="cz-hist-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="cz-hist-titulo">
 <div class="cz-card">
  <div class="cz-top"><h2 id="cz-hist-titulo" style="flex:1;margin:0">Mis cotizaciones</h2>
    <button type="button" class="cz-x" id="cz-hist-cerrar" aria-label="Cerrar">${IC.cerrar}</button></div>
  <button type="button" class="cz-btn" id="cz-hist-nueva" style="margin:0 0 12px">Nueva cotización</button>
  <div class="cz-fila2">
    <div class="cz-campo"><label for="cz-hist-texto">Buscar (folio, cliente, teléfono)</label><input id="cz-hist-texto" type="search" autocomplete="off"></div>
    <div class="cz-campo"><label for="cz-hist-estado">Estado</label><select id="cz-hist-estado"><option value="">Todos</option>${ESTADOS.map(e => '<option>' + e + '</option>').join('')}</select></div>
  </div>
  <p class="cz-ayuda" id="cz-hist-info" role="status" aria-live="polite"></p>
  <div id="cz-hist-lista"></div>
  <div class="cz-fila2" id="cz-hist-pag" hidden><button type="button" class="cz-btn cz-sec2" id="cz-hist-ant">Anterior</button><button type="button" class="cz-btn cz-sec2" id="cz-hist-sig">Siguiente</button></div>
 </div>
</div>`;
function abrirHistorial() {
  if (!puedeUsarCotizador()) { toast('Tu cuenta no tiene permiso para cotizar.'); return; }
  $('cz-hist-overlay').hidden = false; document.body.style.overflow = 'hidden'; cargarHistorial(1); sincronizarDatos();
}
function cerrarHistorial(sinRestaurar) { $('cz-hist-overlay').hidden = true; if (!sinRestaurar && $('cz-overlay').hidden) document.body.style.overflow = ''; }
async function cargarHistorial(pag) {
  const info = $('cz-hist-info'), lista = $('cz-hist-lista');
  if (!navigator.onLine) { info.textContent = 'Sin señal: el historial se consulta con conexión.'; if (!hist.length) lista.innerHTML = ''; return; }
  info.textContent = 'Cargando…';
  try {
    const rs = await api('consultarCotizaciones', { filtros: { pagina: pag, estado: histEstado, texto: histTexto, app: 'maps' } });
    if (!rs.success) { info.textContent = rs.message || 'No se pudo cargar el historial.'; return; }
    hist = soloMaps(rs.cotizaciones); histPag = rs.pagina || pag; histTotal = rs.total || 0; histPorPag = rs.porPagina || 30;
    info.textContent = histTotal ? histTotal + (histTotal === 1 ? ' cotización' : ' cotizaciones') + (histEstado ? ' · ' + histEstado : '') : 'No hay cotizaciones con ese filtro.';
    pintarHistorial();
  } catch (e) { if (!/sesi/i.test(e.message || '')) info.textContent = 'No se pudo cargar. Revisa tu conexión.'; }
}
/** Tarjeta de una cotización (la usan el historial en modal y la pestaña «Historial» de Maps). Con `insignia` lleva la etiqueta COTIZACIÓN para distinguirla de las notas de venta. */
function tarjetaCot(c, insignia) {
    const venc = vencida(c), editable = !motivoNoEditable(c) && puedeCotizarEn(seccionDeAgencia(c.agencia));
    const tot = (c.total === '' || c.total == null) ? 'por confirmar' : moneda(c.total);
    return '<div class="cz-hcard" data-folio="' + esc(c.folio) + '">'
      + '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>' + (insignia ? '<span class="cz-tipo cz-tipo-cot">COTIZACIÓN</span> ' : '') + esc(c.folio) + ' · ' + esc(c.cliente) + '</b><span class="cz-estado cz-e-' + esc(c.estado) + '">' + esc(c.estado) + '</span></div>'
      + '<div class="cz-sub"><span>' + esc(String(c.fecha || '').slice(0, 10)) + '</span><span>' + esc(c.moto || '') + (c.anio ? ' ' + esc(c.anio) : '') + '</span><span class="cz-precio">' + esc(tot) + '</span>'
      + (venc ? '<span class="cz-badge cz-aten">' + IC.aviso + ' Vencida</span>' : (vigIso(c.vigencia) ? '<span>Vigente hasta ' + esc(fechaCorta(c.vigencia)) + '</span>' : '')) + '</div>'
      + '<div class="cz-sub">' + esc(c.vendedorNombre || '') + ' · ' + esc(c.agencia || '') + '</div>'
      + '<div class="cz-acciones">'
      + '<button type="button" class="cz-prim" data-h="ver">Vista previa</button><button type="button" data-h="whats">WhatsApp</button>'
      + (editable ? '<button type="button" data-h="editar">Editar</button>' : '')
      + '<button type="button" data-h="estado">Cambiar estado</button>'
      + (c.estado !== 'Rechazado' ? '<button type="button" data-h="nota">Pasar a nota</button>' : '') + '</div></div>';
}
function pintarHistorial() {
  const lista = $('cz-hist-lista');
  lista.innerHTML = hist.map(c => tarjetaCot(c, false)).join('');
  const hayMas = histPag * histPorPag < histTotal; $('cz-hist-pag').hidden = !(histPag > 1 || hayMas);
  $('cz-hist-ant').disabled = histPag <= 1; $('cz-hist-sig').disabled = !hayMas;
}
function cambiarEstadoPanel(c, alCambiar) {
  $('cz-panel-cont').innerHTML = '<h2 id="cz-panel-titulo">Estado de ' + esc(c.folio) + '</h2><p class="cz-ayuda">Ahora: ' + esc(c.estado) + '</p>'
    + '<div class="cz-campo"><label for="cz-est-sel">Nuevo estado</label><select id="cz-est-sel">' + ESTADOS.map(e => '<option' + (e === c.estado ? ' selected' : '') + '>' + e + '</option>').join('') + '</select></div>'
    + '<div class="cz-campo" id="cz-motivo-caja" hidden><label for="cz-motivo">Motivo del rechazo</label><input id="cz-motivo" type="text" maxlength="200" autocomplete="off"><p class="cz-err" id="cz-motivo-err" hidden></p></div>'
    + '<p class="cz-ayuda">Vendido revisa la compatibilidad de cada SKU con la moto cotizada.</p>'
    + '<button type="button" class="cz-btn" id="cz-est-ok">Guardar estado</button><button type="button" class="cz-btn cz-sec2" id="cz-est-no">Cancelar</button>';
  $('cz-panel').hidden = false;
  const sel = $('cz-est-sel'); sel.onchange = () => { $('cz-motivo-caja').hidden = sel.value !== 'Rechazado'; };
  $('cz-est-no').onclick = cerrarPanel;
  $('cz-est-ok').onclick = async () => {
    const est = sel.value, motivo = $('cz-motivo').value.trim();
    if (est === 'Rechazado' && motivo.length < 3) { const e = $('cz-motivo-err'); e.textContent = 'Escribe el motivo del rechazo.'; e.hidden = false; $('cz-motivo').setAttribute('aria-invalid', 'true'); $('cz-motivo').focus(); return; }
    const b = $('cz-est-ok'); b.disabled = true; b.innerHTML = IC.girar + ' Guardando…';
    try {
      const rs = await api('cambiarEstadoCotizacion', { folio: c.folio, estado: est, datos: { motivo: motivo } });
      if (!rs.success) { toast(rs.message || 'No se pudo cambiar el estado.'); b.disabled = false; b.textContent = 'Guardar estado'; return; }
      c.estado = rs.estado || est; if (rs.seguimiento) c.seguimiento = rs.seguimiento; cerrarPanel(); toast('Estado: ' + c.estado); (alCambiar || pintarHistorial)();
    } catch (e) { b.disabled = false; b.textContent = 'Guardar estado'; }
  };
  setTimeout(() => sel.focus(), 30);
}

/* ───────────── Historial unificado (pestaña «Historial» de Maps): notas de venta + cotizaciones ───────────── */
/** Una página de cotizaciones del servidor (mismas reglas que el catálogo: el servidor decide qué ve cada cuenta). */
async function listarParaHistorial(pagina, texto, estado) {
  if (!puedeUsarCotizador()) return { ok: false, mensaje: 'Tu cuenta no tiene permiso para cotizar.', cotizaciones: [], total: 0, pagina: 1, porPagina: 30 };
  if (!navigator.onLine) return { ok: false, mensaje: 'Sin señal: las cotizaciones se consultan con conexión.', cotizaciones: [], total: 0, pagina: 1, porPagina: 30 };
  try {
    const rs = await api('consultarCotizaciones', { filtros: { pagina: pagina || 1, estado: estado || '', texto: texto || '', app: 'maps' } });
    if (!rs.success) return { ok: false, mensaje: rs.message || 'No se pudieron cargar las cotizaciones.', cotizaciones: [], total: 0, pagina: 1, porPagina: 30 };
    sincronizarDatos();
    return { ok: true, cotizaciones: soloMaps(rs.cotizaciones), total: rs.total || 0, pagina: rs.pagina || pagina || 1, porPagina: rs.porPagina || 30 };
  } catch (e) { return { ok: false, mensaje: /sesi/i.test(e.message || '') ? '' : 'No se pudieron cargar las cotizaciones. Revisa tu conexión.', cotizaciones: [], total: 0, pagina: 1, porPagina: 30 }; }
}
/** Acción de un botón de tarjeta (data-h). `repintar` se llama cuando cambia algo de la cotización. */
function accionHistorial(c, a, b, repintar) {
  if (a === 'ver') cvAbrir(c, 'hist', repintar); else if (a === 'pdf') hojaCotizacionPdf(c, b); else if (a === 'whats') enviarWhats(c, b).then(repintar || (() => {}));
  else if (a === 'editar') editar(c); else if (a === 'estado') cambiarEstadoPanel(c, repintar); else if (a === 'nota') convertirEnNota(c);
}

/* ───────────── Cotización ↔ Nota de venta (Maps) ───────────── */
/** Abre «Nota de venta» con el cliente y los productos ya cargados. items: { tipo, sku, cantidad, descripcion, origen, precio }. */
function cargarEnNota(cli, items, titulo) {
  cerrar(true); cerrarHistorial(true); cvCerrar();
  abrirVentaRuta(cli.cliente || '', cli.telefono || '', { sinBorrador: true });
  if (document.getElementById('ventaOverlay').hidden) return;   // sin permiso de vendedor: abrirVentaRuta ya avisó
  document.getElementById('ventaIdCliente').value = cli.idCliente || '';
  ventaItemsActuales.length = 0;
  let omitidos = 0;
  (items || []).forEach(it => {
    const sku = String(it.sku || '').trim(), r = (it.tipo === 'pedido' || !sku) ? null : resolverProductoPorSku(sku, false);
    if (!r) { omitidos++; return; }   // la nota solo admite productos con inventario (bajo pedido o sin SKU no pasan)
    const cant = Number(it.cantidad) || 1, precio = Number(r.precio) || Number(it.precio) || 0;
    let origen = ''; try { const ops = opcionesOrigenVenta(sku); const m = ops.find(o => String(o.valor).split(' · ')[0] === it.origen); origen = m ? m.valor : origenPorDefectoVenta(sku); } catch (e) {}
    ventaItemsActuales.push({ sku: sku, producto: r.producto || it.descripcion || sku, cantidad: cant, precio: precio, precioLista: precio, manual: false, origen: origen, liquidacion: !!r.liquidacion });
  });
  renderizarItemsVenta();
  toast(titulo + (omitidos ? ' · ' + omitidos + ' no pasaron (bajo pedido o sin inventario)' : '') + '. Revisa precios y origen.');
}
/** Cotización guardada → nota de venta (cualquier estado menos Rechazado). */
function convertirEnNota(c) {
  if (!c) return;
  cargarEnNota(c, c.items, 'Cotización ' + c.folio + ' cargada en la nota');
}
/** Productos que se están capturando en el formulario (aún sin guardar) → forma de items. */
function itemsDeLineas() {
  return lineas.map(l => {
    const p = precioLinea(l);
    if (l.tipo === 'pedido') return { tipo: 'pedido', cantidad: l.cantidad, descripcion: l.descripcion || 'Refacción bajo pedido', precio: p.valor || 0 };
    const cur = origenActual(l).cur;
    return { tipo: 'catalogo', sku: l.sku, cantidad: l.cantidad, descripcion: l.descripcion, origen: cur ? cur.sucursal : '', precio: p.valor || 0 };
  });
}
/** Productos de una nota (en captura o ya guardada) → líneas de la cotización abierta. Devuelve cuántos pasaron y cuántos no. */
function cargarLineasDeNota(items) {
  let ok = 0, omitidos = 0, primero = true;
  (items || []).filter(it => !it.cancelado).forEach(it => {
    const cant = Math.max(1, Math.min(9999, Math.floor(Number(it.cantidad)) || 1)), sku = String(it.sku || '').trim();
    if (!sku) { lineas.push({ id: ++seq, tipo: 'pedido', sku: '', descripcion: it.producto || '', disponibilidad: 'Bajo pedido', cantidad: cant, numeroParte: '', precioAprox: Number(it.precio) > 0 ? String(it.precio) : '' }); ok++; return; }
    if (primero) { const info = infoSku(sku); const s = info && info.secciones.length && info.secciones.indexOf(seccion) === -1 ? info.secciones.find(puedeCotizarEn) : null; if (s) seccion = s; primero = false; }   // arranca en la sección del primer producto
    if (agregarSku(sku, cant, true)) {
      const l = lineas.find(q => q.tipo === 'catalogo' && skuN(q.sku) === skuN(sku));
      if (l && !(listaGC && listaGC[skuN(sku)]) && Number(it.precio) > 0) l.precioAprox = String(it.precio);   // sin precio en lista: conserva el de la nota
      ok++;
    } else omitidos++;
  });
  pintarSecciones(); pintarLineas();
  return { ok: ok, omitidos: omitidos };
}
function avisoDeNotaACotizacion(r) {
  toast(r.ok ? 'Productos de la nota pasados a la cotización (' + r.ok + ')' + (r.omitidos ? ' · ' + r.omitidos + ' no se pudieron copiar (otra sección o sin inventario)' : '') + '. Completa moto y año.' : 'Ningún producto de la nota se pudo copiar a la cotización.');
}
/** Nota ya guardada (Historial) → nueva cotización con sus datos y productos. */
function desdeNota(venta) {
  if (!venta) return;
  if (!puedeUsarCotizador()) { toast('Tu cuenta no tiene permiso para cotizar.'); return; }
  abrir({ nombre: venta.cliente || '', telefono: venta.telefono || '', idCliente: '' });
  avisoDeNotaACotizacion(cargarLineasDeNota(venta.items));
}

/* ───────────── Vista previa de la hoja ───────────── */
let cvUrl = null, cvCot = null, cvRepintar = null;
function cvLiberar() {
  const m = $('cv-marco');
  if (m) { try { m.contentWindow.location.replace('about:blank'); } catch (e) { m.src = 'about:blank'; } }
  if (cvUrl) { URL.revokeObjectURL(cvUrl); cvUrl = null; }
}
function cvCerrar() {
  const ov = $('cv-overlay'); if (!ov || ov.hidden) return;
  ov.hidden = true; cvLiberar(); cvCot = null; cvRepintar = null;
  if ($('cz-overlay').hidden && $('cz-hist-overlay').hidden) document.body.style.overflow = '';
}
function textoSeguimiento(c) {
  const sg = (c && c.seguimiento) || {}, ls = (sg.lineas || []).map(l => (l.origen || 'otra agencia') + (l.eta ? ' (' + l.eta + ')' : '')).join(' · ');
  if (!c) return '';
  if (c.estado === 'Enviada') return 'En seguimiento: cuando el cliente responda, marca si fue Vendido, Traspaso, Rechazado o Pedido.';
  if (c.estado === 'Vendido') return 'Venta completada.';
  if (c.estado === 'Traspaso') return 'Traspaso: ' + (sg.eta ? 'llega en aprox. ' + sg.eta + '.' : 'sin tiempo estimado.') + (ls ? ' ' + ls : '');
  if (c.estado === 'Pedido') return 'Pedido: ' + (sg.eta || '2 a 3 semanas, siempre que VENTO tenga disponible') + '.';
  if (c.estado === 'Rechazado') return 'Motivo del rechazo: ' + (sg.motivo || 'no registrado') + '.';
  return '';
}
function cvPintar() {
  const c = cvCot; if (!c) return;
  const vig = vigIso(c.vigencia), tot = (c.total === '' || c.total == null) ? '' : moneda(c.total);
  $('cv-sub').textContent = [c.cliente, tot, c.estado, vig ? (vencida(c) ? 'Venció el ' : 'Vigente hasta el ') + fechaLarga(vig) : ''].filter(Boolean).join(' · ');
  $('cv-seg').textContent = textoSeguimiento(c);
  $('cv-editar').hidden = !(!motivoNoEditable(c) && puedeCotizarEn(seccionDeAgencia(c.agencia)));
  $('cv-nota').hidden = c.estado === 'Rechazado';
}
/** origen: 'hist' (historial) o 'nueva' (recién guardada). repintar: se llama cuando cambia algo de la cotización (estado, envío). */
async function cvAbrir(cot, origen, repintar) {
  if (!cot || !cot.folio) return;
  try {
    const [jsPDF, logo] = await Promise.all([_cargarJsPdf(), _hojaLogoDe(cot)]);
    const blob = hojaCotizacionConstruir(jsPDF, cot, logo).output('blob');
    cvLiberar(); cvUrl = URL.createObjectURL(blob); cvCot = cot; cvRepintar = repintar || null;
    $('cv-titulo').textContent = 'Cotización ' + cot.folio;
    const m = $('cv-marco'); try { m.contentWindow.location.replace(cvUrl); } catch (e) { m.src = cvUrl; }
    $('cv-aparte').href = cvUrl;
    const dl = $('cv-descargar'); dl.href = cvUrl; dl.download = _cotNombrePdf(cot);   // sale como «Cotización C00006.pdf»
    cvPintar();
    $('cv-overlay').hidden = false; document.body.style.overflow = 'hidden';
    try { $('cv-cerrar').focus(); } catch (e) {}
  } catch (e) { toast(e && e.message ? e.message : 'No se pudo abrir la vista previa.'); }
}
const cvAlCambiar = () => { cvPintar(); if (cvRepintar) { try { cvRepintar(); } catch (e) {} } };

/* ───────────── Pestañas Nota de venta | Cotización (en los dos modales) ───────────── */
function pestañasVenta() {
  const tit = document.querySelector('#ventaOverlay .venta-titulo'); if (!tit || document.getElementById('cz-modos-venta')) return;
  const fila = document.createElement('div'); fila.className = 'cz-top';
  const d = document.createElement('div'); d.className = 'cz-modos cz-modos-venta'; d.id = 'cz-modos-venta'; d.setAttribute('role', 'tablist'); d.setAttribute('aria-label', 'Tipo de documento');
  d.innerHTML = '<button type="button" role="tab" aria-selected="true" id="cz-vtab-nota">Nota de venta</button><button type="button" role="tab" aria-selected="false" id="cz-vtab-cot">Cotización</button>';
  const x = document.createElement('button'); x.type = 'button'; x.className = 'cz-x'; x.id = 'cz-vtab-x'; x.setAttribute('aria-label', 'Cerrar'); x.innerHTML = IC.cerrar;
  x.addEventListener('click', () => cerrarVentaRuta('x'));
  fila.appendChild(d); fila.appendChild(x);
  tit.parentNode.insertBefore(fila, tit);
  $('cz-vtab-cot').addEventListener('click', () => {   // nota en captura → cotización con sus productos
    if (!puedeUsarCotizador()) { toast('Tu cuenta no tiene permiso para cotizar.'); return; }
    const datos = { nombre: $('ventaCliente').value, telefono: $('ventaTelefono').value, idCliente: $('ventaIdCliente').value };
    const items = (typeof ventaItemsActuales !== 'undefined') ? ventaItemsActuales.slice() : [];
    cerrarVentaRuta(); abrir(datos);
    if (items.length) avisoDeNotaACotizacion(cargarLineasDeNota(items));
  });
}
/** Cotización en captura → nota de venta con sus productos (el borrador de la cotización se conserva). */
function aNotaDesdeCotizador() {
  const cli = { cliente: $('cz-cliente').value.trim(), telefono: $('cz-telefono').value, idCliente: idResuelto || $('cz-idcliente').value };
  const items = itemsDeLineas();
  if (!guardada && !edicion && (lineas.length || cli.cliente || cli.telefono)) borradorAhora();
  cargarEnNota(cli, items, items.length ? 'Productos de la cotización cargados en la nota' : 'Datos del cliente cargados en la nota');
}

/* ───────────── Eventos ───────────── */
function enlazar() {
  const ov = $('cz-overlay');
  $('cz-cerrar').addEventListener('click', () => cerrar(false));
  ov.addEventListener('mousedown', e => { if (e.target === ov) cerrar(false); });
  $('cz-tab-nota').addEventListener('click', aNotaDesdeCotizador);
  $('cz-guardar').addEventListener('click', guardar);
  $('cz-add-pedido').addEventListener('click', agregarPedido);
  $('cz-empezar').addEventListener('click', () => { borrarBorrador(); reiniciar(); setTimeout(() => $('cz-idcliente').focus(), 60); });
  $('cz-otra').addEventListener('click', () => { borrarBorrador(); reiniciar(); setTimeout(() => $('cz-idcliente').focus(), 60); });
  $('cz-whats').addEventListener('click', e => enviarWhats(ultima, e.currentTarget));
  $('cz-vista').addEventListener('click', () => cvAbrir(ultima, 'nueva', () => { if (ultima && ultima.folio && !$('cz-hist-overlay').hidden) cargarHistorial(histPag); }));
  $('cz-cerrar-listo').addEventListener('click', () => cerrar(true));
  $('cv-cerrar').addEventListener('click', cvCerrar);
  $('cv-overlay').addEventListener('mousedown', e => { if (e.target === $('cv-overlay')) cvCerrar(); });
  $('cv-wa').addEventListener('click', e => { if (cvCot) enviarWhats(cvCot, e.currentTarget).then(cvAlCambiar); });
  $('cv-pdf').addEventListener('click', e => hojaCotizacionPdf(cvCot, e.currentTarget));
  $('cv-editar').addEventListener('click', () => { const c = cvCot; cvCerrar(); editar(c); });
  $('cv-estado').addEventListener('click', () => { if (cvCot) cambiarEstadoPanel(cvCot, cvAlCambiar); });
  $('cv-nota').addEventListener('click', () => { const c = cvCot; cvCerrar(); convertirEnNota(c); });
  $('cz-a-nota').addEventListener('click', () => convertirEnNota(ultima));
  $('cz-historial').addEventListener('click', () => { cerrar(true); if (typeof window.abrirHistorialMaps === 'function') window.abrirHistorialMaps('cotizaciones'); else abrirHistorial(); });
  $('cz-secciones').addEventListener('click', e => { const b = e.target.closest('[data-sec]'); if (b) cambiarSeccion(b.dataset.sec); });
  // cliente
  const idc = $('cz-idcliente'); idc.addEventListener('input', () => { const v = soloDigitos(idc.value); if (v !== idc.value) idc.value = v; idResuelto = ''; clearTimeout(idc._t); idc._t = setTimeout(buscarCliente, 600); });
  idc.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(idc._t); buscarCliente(); } });
  $('cz-id-buscar').addEventListener('click', () => { clearTimeout(idc._t); buscarCliente(); });
  $('cz-id-resultados').addEventListener('click', e => { const b = e.target.closest('[data-cli]'); if (b) elegirCliente(coincidencias[Number(b.dataset.cli)]); });
  const filtrar = (id, fn) => { const el = $(id); el.addEventListener('input', () => { const v = fn(el.value); if (v !== el.value) el.value = v; }); };
  filtrar('cz-cliente', soloLetras); filtrar('cz-telefono', v => soloDigitos(v).slice(0, 15)); filtrar('cz-anio', v => soloDigitos(v).slice(0, 4));
  // moto
  const m = $('cz-moto'), sug = $('cz-moto-sug');
  m.addEventListener('focus', () => { if (!motosCargadas) cargarMotos(); }); m.addEventListener('input', sugerirMotos);
  m.addEventListener('blur', () => setTimeout(ocultarMotos, 150)); m.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); ocultarMotos(); } });
  const elegirMoto = e => { const b = e.target.closest('[data-moto]'); if (b) { e.preventDefault(); $('cz-moto').value = sug._sug[Number(b.dataset.moto)]; ocultarMotos(); errCampo('cz-moto', ''); $('cz-anio').focus(); guardarBorrador(); } };
  sug.addEventListener('mousedown', elegirMoto); sug.addEventListener('touchstart', elegirMoto, { passive: false });
  $('cz-vigencia').addEventListener('focus', e => { e.target.min = iso(new Date()); });
  // validación al salir del campo / mientras se corrige
  CAMPOS.filter(id => id !== 'cz-buscador').forEach(id => { const el = $(id); el.addEventListener('blur', () => { if (el.value.trim() || el.getAttribute('aria-invalid') === 'true') validarUno(id); }); el.addEventListener('input', () => { if (el.getAttribute('aria-invalid') === 'true') validarUno(id); }); });
  $('cz-form').addEventListener('input', guardarBorrador); $('cz-form').addEventListener('change', guardarBorrador);
  // buscador
  const b = $('cz-buscador'); b.addEventListener('input', pintarResultados);
  b.addEventListener('keydown', e => { if (e.key !== 'Enter') return; e.preventDefault(); const r = buscar(b.value).find(p => ((p.secciones.indexOf(seccion) !== -1) || p.stock <= 0) && puedeCotizarEn(seccion)); if (r) agregarSku(r.sku); });
  $('cz-resultados').addEventListener('click', e => {
    const k = e.target.closest('[data-kit]'); if (k) { abrirKit(k.dataset.kit, k.dataset.sku); return; }
    const r = e.target.closest('[data-sku]'); if (!r) return;
    if (r.dataset.cons) {   // consulta: si la cuenta puede cotizar en la otra sección, la ofrece; si no, explica
      const info = infoSku(r.dataset.sku), otras = info ? info.secciones.filter(s => s !== seccion && puedeCotizarEn(s)) : [];
      if (otras.length) { cambiarSeccion(otras[0]).then(() => { if (seccion === otras[0]) agregarSku(r.dataset.sku); }); }
      else toast('Solo consulta: ese producto es de otra sección y tu cuenta no puede cotizarlo.');
      return;
    }
    agregarSku(r.dataset.sku);
  });
  // líneas y avisos de kit
  const lin = $('cz-lineas');
  lin.addEventListener('click', e => {
    const k = e.target.closest('[data-kit]'); if (k) { abrirKit(k.dataset.kit, k.dataset.sku); return; }
    const x = e.target.closest('[data-act]'); if (!x) return; const id = Number(x.dataset.id), l = lineas.find(q => q.id === id); if (!l) return;
    if (x.dataset.act === 'quitar') { lineas = lineas.filter(q => q.id !== id); pintarLineas(); }
    else if (x.dataset.act === 'menos') { l.cantidad = Math.max(1, l.cantidad - 1); pintarLineas(); }
    else if (x.dataset.act === 'mas') { l.cantidad = Math.min(9999, l.cantidad + 1); pintarLineas(); }
  });
  lin.addEventListener('change', e => { const s = e.target.closest('[data-act="origen"]'); if (!s) return; const l = lineas.find(q => q.id === Number(s.dataset.id)); if (l) { l.origen = s.value; pintarLineas(); } });
  lin.addEventListener('input', e => {
    const i = e.target.closest('[data-campo]'); if (!i) return; const l = lineas.find(q => q.id === Number(i.dataset.id)); if (!l) return;
    if (i.dataset.campo === 'precioAprox' && precioBloqueado(l)) { i.value = l.precioAprox; return; }   // precio sugerido de VENTO: solo administración
    if (i.dataset.campo === 'cantidad') { const n = Math.floor(Number(i.value)); l.cantidad = n >= 1 ? Math.min(n, 9999) : 1; }
    else l[i.dataset.campo] = i.value;
    if (i.dataset.campo === 'precioAprox') l.precioManual = true;
    if (i.dataset.campo === 'numeroParte') buscarParte(l.id);
    actualizarImportes();
  });
  $('cz-oferta').addEventListener('click', e => { const k = e.target.closest('[data-kit]'); if (k) abrirKit(k.dataset.kit, k.dataset.sku); });
  $('cz-panel').addEventListener('mousedown', e => { if (e.target === $('cz-panel')) cerrarPanel(); });
  // historial
  $('cz-hist-cerrar').addEventListener('click', () => cerrarHistorial()); $('cz-hist-nueva').addEventListener('click', () => { cerrarHistorial(true); abrir(); });
  $('cz-hist-texto').addEventListener('input', e => { histTexto = e.target.value.trim(); clearTimeout(histTimer); histTimer = setTimeout(() => cargarHistorial(1), 450); });
  $('cz-hist-estado').addEventListener('change', e => { histEstado = e.target.value; cargarHistorial(1); });
  $('cz-hist-ant').addEventListener('click', () => cargarHistorial(histPag - 1)); $('cz-hist-sig').addEventListener('click', () => cargarHistorial(histPag + 1));
  $('cz-hist-lista').addEventListener('click', e => {
    const card = e.target.closest('[data-folio]'); if (!card) return; const c = hist.find(x => x.folio === card.dataset.folio); if (!c) return;
    const b = e.target.closest('[data-h]'), a = b ? b.dataset.h : 'ver';   // tocar la tarjeta = vista previa
    if (a === 'ver') cvAbrir(c, 'hist', pintarHistorial); else if (a === 'pdf') hojaCotizacionPdf(c, b); else if (a === 'whats') enviarWhats(c, b).then(pintarHistorial);
    else if (a === 'editar') editar(c); else if (a === 'estado') cambiarEstadoPanel(c); else if (a === 'nota') convertirEnNota(c);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!$('cz-panel').hidden) cerrarPanel(); else if (!$('cv-overlay').hidden) cvCerrar(); else if (!$('cz-overlay').hidden) cerrar(false); else if (!$('cz-hist-overlay').hidden) cerrarHistorial();
  });
}

/* ───────────── Visibilidad (la entrada del menú es una sola: «Nueva venta o cotización», y el historial de cotizaciones vive en «Historial») ───────────── */
function visibilidadBotones() {
  const ver = puedeUsarCotizador();
  const t = document.getElementById('cz-vtab-cot'); if (t) t.hidden = !ver;
}

/* ───────────── Arranque ───────────── */
function iniciar() {
  if (document.getElementById('cz-overlay')) return;
  const st = document.createElement('style'); st.id = 'cz-estilos'; st.textContent = CSS; document.head.appendChild(st);
  const cont = document.createElement('div'); cont.id = 'cz-raiz'; cont.innerHTML = HTML + HIST_HTML + CV_HTML; document.body.appendChild(cont);
  enlazar(); pestañasVenta(); visibilidadBotones();
  const orig = window.actualizarVisibilidadBotonVenta;   // Maps la llama al iniciar sesión: ahí se muestran u ocultan los botones
  if (typeof orig === 'function') window.actualizarVisibilidadBotonVenta = function () { const r = orig.apply(this, arguments); try { visibilidadBotones(); } catch (e) {} return r; };
}
window.Cotizador = { desdeNota: desdeNota, verCotizacion: cvAbrir, abrir: abrir, abrirHistorial: abrirHistorial, listarParaHistorial: listarParaHistorial, tarjetaCot: tarjetaCot, accionHistorial: accionHistorial, puede: puedeUsarCotizador, editar: editar, convertirEnNota: convertirEnNota, seccionesQueCotizo: seccionesQueCotizo, _universo: universo, _construirPdf: hojaCotizacionConstruir };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
