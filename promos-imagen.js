/* promos-imagen.js — Pestaña «Promociones» de Maps
   Junta las promociones y los kits (servicios mayor) VIGENTES que ya sincroniza Maps, los dibuja como imagen
   (canvas 2D, sin librerías, funciona sin señal) y la comparte por WhatsApp con la hoja de compartir del teléfono.
   · Si hay muchas promociones, genera varias imágenes y las manda todas juntas.
   · Carga después de cotizador.js. Usa variables globales de Maps (promocionesCache, promoVigente, _msFecha,
     kitsDisponibles, _kitCalcular, resolverProductoPorSku, sheetBody, currentTab, nombreActual…) solo al ejecutarse. */
(function () {
'use strict';

/* ───────────── utilidades ───────────── */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const moneda = n => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaMs = ms => { if (!ms) return ''; const d = new Date(ms); return isNaN(d) ? '' : d.getDate() + ' ' + MES3[d.getMonth()]; };
const fechaHoy = () => { const d = new Date(); return d.getDate() + ' ' + MES3[d.getMonth()] + ' ' + d.getFullYear(); };
const isoHoy = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const toast = m => { try { mostrarToast(m); } catch (e) { alert(m); } };
const IC = {   // íconos SVG (nada de emoji como ícono)
  enviar: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
  bajar: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>',
  girar: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 4V1L8 5l4 4V6a6 6 0 11-6 6H4a8 8 0 108-8z"/></svg>'
};

/* ───────────── datos: promociones y kits vigentes ───────────── */
function promosVigentes() {
  const mapa = (typeof promocionesCache !== 'undefined' && promocionesCache) || {}, out = [];
  Object.keys(mapa).forEach(k => {
    const p = mapa[k]; if (!p || !promoVigente(p)) return;
    const pu = Number(p.precioUnitario) || 0, pm = Number(p.precioMayoreo) || 0, mn = Number(p.minMayoreo) || 0;
    const mayoreo = pm > 0 && mn >= 2;
    if (!(pu > 0) && !mayoreo) return;   // misma regla que promoDe() del cotizador
    const sku = String(p.sku || k).trim();
    let nombre = String(p.producto || '').trim();
    if (!nombre) { try { const r = resolverProductoPorSku(sku, false); nombre = (r && r.producto) || ''; } catch (e) {} }
    out.push({ sku: sku, nombre: nombre || 'Producto', marca: String(p.marca || '').trim().toUpperCase(),
      pu: pu, pm: mayoreo ? pm : 0, mn: mayoreo ? mn : 0, hasta: _msFecha(p.vigenteHasta) || 0 });
  });
  out.sort((a, b) => a.marca.localeCompare(b.marca, 'es') || a.nombre.localeCompare(b.nombre, 'es'));
  return out;
}
function kitsVigentes() {
  let ks = []; try { ks = kitsDisponibles(); } catch (e) {}
  return ks.map(k => {
    const c = _kitCalcular(k, false);
    if (c.sinPrecio || !(c.total > 0)) return null;   // un kit sin precio completo no se ofrece al cliente
    return { nombre: String(k.nombre || ''), moto: String(k.moto || ''), piezas: c.lineas.length, pct: c.pct,
      total: c.total, ahorro: c.descuento, hasta: _msFecha(k.vigenteHasta) || 0 };
  }).filter(Boolean);
}

/* ───────────── imagen (canvas 2D) ───────────── */
const W = 1080, MX = 48, ANCHO_TXT = W - MX * 2, ALTO_MAX = 2000;
const FUENTE = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';   // la imagen se hace en el teléfono de quien la manda: pila simple y predecible
// Papel claro con texto oscuro: la imagen se lee igual en WhatsApp claro u oscuro. Contraste ≥ 4.5:1 en todos los pares.
const COL = { papel: '#FFFFFF', tinta: '#14181C', suave: '#4F5B66', verde: '#00794F', verdeClaro: '#E3F1EA', linea: '#D7DCE1', banda: '#F2F4F6' };
const F = (peso, px) => peso + ' ' + px + 'px ' + FUENTE;
const ALTO_ENC = 190, ALTO_PIE = 96, ALTO_SECCION = 84, GAP = 16;

function rr(ctx, x, y, w, h, r) {   // rectángulo redondeado (roundRect no existe en navegadores viejos)
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function envolver(ctx, texto, ancho, maxLineas) {   // salto de línea por palabras; recorta con «…» si no cabe
  const lineas = []; let cur = '';
  const partir = pal => { let t = ''; for (const ch of pal) { if (ctx.measureText(t + ch).width > ancho && t) { lineas.push(t); t = ch; } else t += ch; } return t; };
  String(texto).split(/\s+/).filter(Boolean).forEach(pal => {
    const prueba = cur ? cur + ' ' + pal : pal;
    if (ctx.measureText(prueba).width <= ancho) { cur = prueba; return; }
    if (cur) lineas.push(cur);
    cur = ctx.measureText(pal).width > ancho ? partir(pal) : pal;
  });
  if (cur) lineas.push(cur);
  if (lineas.length > maxLineas) {
    lineas.length = maxLineas; let u = lineas[maxLineas - 1];
    while (u.length > 1 && ctx.measureText(u + '…').width > ancho) u = u.slice(0, -1);
    lineas[maxLineas - 1] = u.replace(/\s+$/, '') + '…';
  }
  return lineas;
}
/* Cada fila se mide primero (para saber cuántas caben por imagen) y se dibuja después. Una fila es:
   líneas de título + una o más «píldoras» de precio que fluyen y saltan de renglón si no caben. */
function medirFila(ctx, it) {
  ctx.font = F(700, 38);
  const tit = envolver(ctx, it.titulo, ANCHO_TXT, 2);
  let sub = [];
  if (it.sub) { ctx.font = F(400, 32); sub = envolver(ctx, it.sub, ANCHO_TXT, 1); }
  // píldoras: { texto, estilo: 'lleno' | 'borde' | 'texto', px }. Fluyen y saltan de renglón si no caben; un renglón
  // solo de texto (la vigencia) es más bajo que uno con píldoras.
  const pos = [], altos = []; let x = MX, renglon = 0;
  it.pildoras.forEach(p => {
    ctx.font = F(p.estilo === 'texto' ? 400 : 700, p.px);
    const ancho = ctx.measureText(p.texto).width + (p.estilo === 'texto' ? 0 : 44);
    if (x > MX && x + ancho > W - MX) { renglon++; x = MX; }
    const h = p.estilo === 'texto' ? 40 : 66;
    altos[renglon] = Math.max(altos[renglon] || 0, h);
    pos.push({ p: p, x: x, r: renglon, w: ancho, h: h }); x += ancho + GAP;
  });
  pos.forEach(o => { o.rh = altos[o.r]; });   // alto del renglón: centra la vigencia junto a las píldoras
  const offs = []; let acc = 0;
  altos.forEach((h, i) => { offs[i] = acc; acc += h + 12; });
  const altoPild = acc ? acc - 12 : 0;
  const alto = 26 + tit.length * 48 + (sub.length ? 42 : 0) + 10 + altoPild + 26;
  return { it: it, tit: tit, sub: sub, pos: pos, offs: offs, alto: alto };
}
function dibujarFila(ctx, f, y) {
  let cy = y + 26;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COL.tinta; ctx.font = F(700, 38);
  f.tit.forEach(l => { ctx.fillText(l, MX, cy + 36); cy += 48; });
  if (f.sub.length) { ctx.fillStyle = COL.suave; ctx.font = F(400, 32); ctx.fillText(f.sub[0], MX, cy + 30); cy += 42; }
  cy += 10;
  f.pos.forEach(o => {
    const py = cy + f.offs[o.r], p = o.p;
    if (p.estilo === 'lleno') { ctx.fillStyle = COL.verde; rr(ctx, o.x, py, o.w, o.h, o.h / 2); ctx.fill(); ctx.fillStyle = '#FFFFFF'; }
    else if (p.estilo === 'borde') { ctx.strokeStyle = COL.verde; ctx.lineWidth = 3; rr(ctx, o.x + 1.5, py + 1.5, o.w - 3, o.h - 3, (o.h - 3) / 2); ctx.stroke(); ctx.fillStyle = COL.verde; }
    else ctx.fillStyle = COL.suave;
    ctx.font = F(p.estilo === 'texto' ? 400 : 700, p.px);
    ctx.fillText(p.texto, o.x + (p.estilo === 'texto' ? 0 : 22), py + (p.estilo === 'texto' ? o.rh : o.h) / 2 + p.px * 0.35);
  });
  ctx.strokeStyle = COL.linea; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(MX, y + f.alto - 1); ctx.lineTo(W - MX, y + f.alto - 1); ctx.stroke();
}
function filaPromo(p) {
  const pild = [];
  if (p.pu > 0) pild.push({ texto: 'Promoción ' + moneda(p.pu), estilo: 'lleno', px: 36 });
  if (p.pm > 0) pild.push({ texto: 'Mayoreo desde ' + p.mn + ' pzas: ' + moneda(p.pm), estilo: 'borde', px: 34 });
  if (p.hasta) pild.push({ texto: 'hasta ' + fechaMs(p.hasta), estilo: 'texto', px: 32 });
  return { tipo: 'fila', titulo: p.sku + ' · ' + p.nombre, sub: '', pildoras: pild };
}
function filaKit(k) {
  const pild = [{ texto: moneda(k.total), estilo: 'lleno', px: 38 }, { texto: 'ahorras ' + moneda(k.ahorro), estilo: 'borde', px: 34 }];
  if (k.hasta) pild.push({ texto: 'hasta ' + fechaMs(k.hasta), estilo: 'texto', px: 32 });
  return { tipo: 'fila', titulo: k.nombre, sub: (k.moto ? k.moto + ' · ' : '') + k.piezas + ' piezas · −' + Math.round(k.pct) + '%', pildoras: pild };
}
/** Reparte los renglones en imágenes de a lo más ALTO_MAX px. Un encabezado de sección nunca queda solo al final. */
function paginar(ctx, items) {
  const paginas = []; let pag = null, y = 0, seccionActual = null;
  const nueva = () => { pag = { filas: [], alto: ALTO_ENC }; y = ALTO_ENC; paginas.push(pag); };
  const util = ALTO_MAX - ALTO_PIE;
  nueva();
  items.forEach(it => {
    if (it.tipo === 'seccion') { seccionActual = it; pag.pendiente = it; return; }
    const f = medirFila(ctx, it), extra = pag.pendiente ? ALTO_SECCION : 0;
    if (y + extra + f.alto > util && pag.filas.length) { nueva(); if (seccionActual) pag.pendiente = seccionActual; }
    if (pag.pendiente) { pag.filas.push({ seccion: pag.pendiente, alto: ALTO_SECCION, y: y }); y += ALTO_SECCION; pag.pendiente = null; }
    pag.filas.push({ f: f, y: y, alto: f.alto }); y += f.alto;
  });
  paginas.forEach(p => { const u = p.filas[p.filas.length - 1]; p.alto = (u ? u.y + u.alto : ALTO_ENC) + ALTO_PIE; });
  return paginas;
}
function dibujarPagina(pag, n, total) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = pag.alto;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = COL.papel; ctx.fillRect(0, 0, W, pag.alto);
  // Encabezado
  ctx.fillStyle = COL.verde; ctx.fillRect(0, 0, W, ALTO_ENC);
  ctx.fillStyle = '#FFFFFF'; ctx.textBaseline = 'alphabetic';
  ctx.font = F(800, 62); ctx.fillText('PROMOCIONES VIGENTES', MX, 92);
  ctx.font = F(400, 36); ctx.fillText('CARABELA · al ' + fechaHoy(), MX, 150);
  if (total > 1) { ctx.font = F(700, 36); ctx.textAlign = 'right'; ctx.fillText(n + '/' + total, W - MX, 150); ctx.textAlign = 'left'; }
  // Filas
  pag.filas.forEach(o => {
    if (o.seccion) {
      ctx.fillStyle = COL.verdeClaro; ctx.fillRect(0, o.y, W, ALTO_SECCION);
      ctx.fillStyle = COL.verde; ctx.font = F(800, 34); ctx.fillText(o.seccion.texto, MX, o.y + 55);
    } else dibujarFila(ctx, o.f, o.y);
  });
  // Pie
  const py = pag.alto - ALTO_PIE;
  ctx.fillStyle = COL.banda; ctx.fillRect(0, py, W, ALTO_PIE);
  ctx.fillStyle = COL.tinta; ctx.font = F(700, 32);
  const quien = (typeof nombreActual !== 'undefined' && nombreActual) ? String(nombreActual) : 'CARABELA';
  ctx.fillText(quien, MX, py + 42);
  ctx.fillStyle = COL.suave; ctx.font = F(400, 28); ctx.fillText('Precios en pesos mexicanos', MX, py + 78);
  return cv;
}
const aBlob = cv => new Promise((ok, mal) => cv.toBlob(b => b ? ok(b) : mal(new Error('No se pudo crear la imagen')), 'image/jpeg', 0.92));

/** datos → [{ blob, ancho, alto }] */
async function generarImagenes(promos, kits) {
  const medida = document.createElement('canvas').getContext('2d');
  const items = [];
  if (promos.length) { items.push({ tipo: 'seccion', texto: 'PROMOCIONES Y MAYOREO' }); promos.forEach(p => items.push(filaPromo(p))); }
  if (kits.length) { items.push({ tipo: 'seccion', texto: 'SERVICIOS MAYOR · KITS CON DESCUENTO' }); kits.forEach(k => items.push(filaKit(k))); }
  const paginas = paginar(medida, items), out = [];
  for (let i = 0; i < paginas.length; i++) {
    const cv = dibujarPagina(paginas[i], i + 1, paginas.length);
    out.push({ blob: await aBlob(cv), ancho: cv.width, alto: cv.height });
  }
  return out;
}

/* ───────────── pantalla (pestaña del panel) ───────────── */
const estado = { marca: '', kits: true, imgs: [], urls: [], gen: 0 };
const CSS = `
.pm-wrap{display:flex;flex-direction:column;gap:12px}
.pm-fila{display:flex;align-items:center;gap:8px;justify-content:space-between}
.pm-resumen{margin:0;font-size:14px;color:var(--text-dim)}
.pm-chips{display:flex;flex-wrap:wrap;gap:8px}
.pm-chip{min-height:44px;padding:0 16px;border-radius:22px;border:1px solid var(--line);background:var(--surface-2);color:var(--text);font:600 14px/1 inherit;cursor:pointer;touch-action:manipulation;transition:background .15s,color .15s}
.pm-chip[aria-pressed="true"]{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.pm-check{display:flex;align-items:center;gap:10px;min-height:44px;font-size:15px;cursor:pointer}
.pm-check input{width:22px;height:22px;accent-color:var(--accent)}
.pm-vista{display:flex;flex-direction:column;gap:12px}
.pm-img{display:block;width:100%;height:auto;border-radius:12px;border:1px solid var(--line);background:#fff}
.pm-sk{height:260px;border-radius:12px;background:var(--surface-2)}
@media (prefers-reduced-motion:no-preference){.pm-sk{animation:pm-pulso 1.2s ease-in-out infinite}}
@keyframes pm-pulso{50%{opacity:.55}}
.pm-barra{position:sticky;bottom:0;display:flex;gap:8px;padding:10px 0 calc(10px + env(safe-area-inset-bottom,0px));background:var(--bg);border-top:1px solid var(--line);margin-top:4px}
.pm-btn{flex:1;min-height:48px;display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:12px;border:1px solid var(--line);background:var(--surface-2);color:var(--text);font:700 15px/1 inherit;cursor:pointer;touch-action:manipulation}
.pm-btn.pm-primario{flex:2;background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.pm-btn:disabled{opacity:.45;cursor:not-allowed}
.pm-icono{min-width:44px;min-height:44px;border-radius:12px;border:1px solid var(--line);background:var(--surface-2);color:var(--text);display:grid;place-items:center;cursor:pointer}
.pm-wrap button:focus-visible,.pm-check input:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.pm-vacio{padding:24px 8px;text-align:center;color:var(--text-dim);font-size:14px;line-height:1.5}
`;
function asegurarCss() {
  if (document.getElementById('pm-css')) return;
  const s = document.createElement('style'); s.id = 'pm-css'; s.textContent = CSS; document.head.appendChild(s);
}
const el = id => document.getElementById(id);
function liberarUrls() { estado.urls.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} }); estado.urls = []; }
function activarBotones(si) { ['pmEnviar', 'pmBajar'].forEach(id => { const b = el(id); if (b) b.disabled = !si; }); }

async function generar() {
  const mi = ++estado.gen, vista = el('pmVista'); if (!vista) return;
  vista.setAttribute('aria-busy', 'true'); activarBotones(false);
  vista.innerHTML = '<div class="pm-sk" role="status" aria-label="Preparando la imagen"></div>';
  await new Promise(r => setTimeout(r, 30));   // deja pintar el aviso antes del trabajo pesado
  try {
    let promos = promosVigentes();
    const marcas = Array.from(new Set(promos.map(p => p.marca).filter(Boolean)));
    if (estado.marca && marcas.indexOf(estado.marca) === -1) estado.marca = '';
    pintarMarcas(marcas);
    if (estado.marca) promos = promos.filter(p => p.marca === estado.marca);
    const kits = estado.kits ? kitsVigentes() : [];
    el('pmResumen').textContent = 'Vigentes: ' + promos.length + (promos.length === 1 ? ' promoción' : ' promociones') + ' · ' + kits.length + (kits.length === 1 ? ' kit' : ' kits');
    if (!promos.length && !kits.length) {
      if (mi !== estado.gen) return;
      liberarUrls(); estado.imgs = [];
      vista.innerHTML = '<div class="pm-vacio">No hay promociones vigentes en este momento.<br>Si acabas de abrir la app, toca «Actualizar» con señal.</div>';
      vista.setAttribute('aria-busy', 'false'); return;
    }
    const imgs = await generarImagenes(promos, kits);
    if (mi !== estado.gen || currentTab !== 'promos') return;
    liberarUrls(); estado.imgs = imgs;
    vista.innerHTML = imgs.map((im, i) => {
      const u = URL.createObjectURL(im.blob); estado.urls.push(u);
      return '<img class="pm-img" src="' + u + '" width="' + im.ancho + '" height="' + im.alto + '" alt="Promociones vigentes, imagen ' + (i + 1) + ' de ' + imgs.length + '" decoding="async">';
    }).join('');
    vista.setAttribute('aria-busy', 'false'); activarBotones(true);
  } catch (e) {
    console.error(e);
    if (mi === estado.gen) { vista.setAttribute('aria-busy', 'false'); vista.innerHTML = '<div class="pm-vacio">No se pudo preparar la imagen (' + esc(e && e.message) + '). Toca «Actualizar» para reintentar.</div>'; }
  }
}
function pintarMarcas(marcas) {
  const cont = el('pmMarcas'); if (!cont) return;
  if (marcas.length < 2) { cont.innerHTML = ''; cont.hidden = true; return; }
  cont.hidden = false;
  cont.innerHTML = ['Todas'].concat(marcas).map(m => {
    const v = m === 'Todas' ? '' : m;
    return '<button type="button" class="pm-chip" data-m="' + esc(v) + '" aria-pressed="' + (estado.marca === v) + '">' + esc(m) + '</button>';
  }).join('');
}
async function actualizar() {
  const b = el('pmActualizar'); if (b) b.disabled = true;
  if (!navigator.onLine) { toast('Sin señal: se usan las promociones guardadas en este celular.'); }
  else { try { await Promise.all([sincronizarPromociones(), sincronizarKits()]); } catch (e) {} }
  if (b) b.disabled = false;
  if (currentTab === 'promos') generar();
}

/* Compartir: las imágenes YA están hechas antes del toque, así el navegador acepta navigator.share (exige un toque reciente). */
const nombreArchivo = (i, n) => 'promociones-' + isoHoy() + (n > 1 ? '-' + (i + 1) : '') + '.jpg';
function descargar() {
  estado.imgs.forEach((im, i) => setTimeout(() => {
    const u = URL.createObjectURL(im.blob), a = document.createElement('a');
    a.href = u; a.download = nombreArchivo(i, estado.imgs.length); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  }, i * 350));
}
async function compartir() {
  if (!estado.imgs.length) return;
  const n = estado.imgs.length;
  const archivos = estado.imgs.map((im, i) => new File([im.blob], nombreArchivo(i, n), { type: 'image/jpeg' }));
  const texto = 'Promociones vigentes CARABELA · ' + fechaHoy();
  if (navigator.canShare && navigator.canShare({ files: archivos })) {
    try { await navigator.share({ files: archivos, title: 'Promociones vigentes', text: texto }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }   // cerró la hoja a propósito
  }
  // Respaldo: baja la(s) imagen(es) y abre WhatsApp para adjuntarlas.
  descargar();
  toast(n > 1 ? 'Imágenes descargadas: adjúntalas en el chat de WhatsApp' : 'Imagen descargada: adjúntala en el chat de WhatsApp');
  setTimeout(() => { location.href = 'https://wa.me/?text=' + encodeURIComponent(texto); }, 1200 + n * 350);
}

window.renderPromosImagen = function () {
  asegurarCss();
  sheetBody.innerHTML =
    '<div class="pm-wrap">'
    + '<div class="pm-fila"><p class="pm-resumen" id="pmResumen" role="status"></p>'
    + '<button type="button" class="pm-icono" id="pmActualizar" aria-label="Actualizar promociones">' + IC.girar + '</button></div>'
    + '<div class="pm-chips" id="pmMarcas" role="group" aria-label="Filtrar por marca" hidden></div>'
    + '<label class="pm-check"><input type="checkbox" id="pmKits"' + (estado.kits ? ' checked' : '') + '> Incluir servicios mayor (kits)</label>'
    + '<div class="pm-vista" id="pmVista" aria-live="polite" aria-busy="true"></div>'
    + '<div class="pm-barra">'
    + '<button type="button" class="pm-btn pm-primario" id="pmEnviar" disabled>' + IC.enviar + ' Enviar por WhatsApp</button>'
    + '<button type="button" class="pm-btn" id="pmBajar" disabled>' + IC.bajar + ' Guardar</button>'
    + '</div></div>';
  el('pmEnviar').addEventListener('click', compartir);
  el('pmBajar').addEventListener('click', descargar);
  el('pmActualizar').addEventListener('click', actualizar);
  el('pmKits').addEventListener('change', e => { estado.kits = e.target.checked; generar(); });
  el('pmMarcas').addEventListener('click', e => {
    const b = e.target.closest('.pm-chip'); if (!b) return;
    estado.marca = b.getAttribute('data-m') || ''; generar();
  });
  generar();
};
})();
