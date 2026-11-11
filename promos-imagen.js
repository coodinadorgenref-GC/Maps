/* promos-imagen.js — Pestaña «Promociones» de Maps
   Junta las promociones y los kits (servicios mayor) VIGENTES que ya sincroniza Maps, los dibuja como imagen
   (canvas 2D, sin librerías, funciona sin señal) y los comparte por WhatsApp.
   · Celular: hoja de compartir del sistema (WhatsApp). PC: «Abrir WhatsApp Web» + «Copiar imagen» / «Guardar».
   · Cada kit lleva sus SKU y productos. Un kit nunca se oculta por falta de precio: sin precio completo muestra
     el descuento en lugar del total (el celular de un vendedor puede no tener todos los precios de la lista).
   · Si llegan datos nuevos al sincronizar, la imagen se rehace sola.
   · Carga después de cotizador.js. Usa variables globales de Maps (promocionesCache, promoVigente, _msFecha,
     kitsDisponibles, _kitCalcular, sincronizarPromociones…) solo al ejecutarse, nunca al cargar. */
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
const esTactil = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const IC = {   // íconos SVG (nada de emoji como ícono)
  enviar: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
  bajar: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>',
  girar: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 4V1L8 5l4 4V6a6 6 0 11-6 6H4a8 8 0 108-8z"/></svg>',
  copiar: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>',
  web: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7zM19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7z"/></svg>'
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
/** Todos los kits vigentes, con sus piezas. Si falta el precio de alguna pieza (pasa en cuentas de vendedor o antes de que
 *  lleguen las listas) el kit SE MUESTRA igual, con el % de descuento y sin total. */
function kitsVigentes() {
  let ks = []; try { ks = kitsDisponibles(); } catch (e) {}
  return ks.map(k => {
    let c; try { c = _kitCalcular(k, false); } catch (e) { return null; }
    const completo = !c.sinPrecio && c.total > 0;
    return { nombre: String(k.nombre || ''), moto: String(k.moto || ''), piezas: c.lineas.length, pct: c.pct, completo: completo,
      total: completo ? c.total : 0, ahorro: completo ? c.descuento : 0, hasta: _msFecha(k.vigenteHasta) || 0,
      lineas: c.lineas.map(l => ({ sku: l.sku, desc: l.descripcion || '', cant: l.cant || l.min || 1, precio: l.sinPrecio ? 0 : l.precio })) };
  }).filter(Boolean);
}
function recopilar() {
  const todas = promosVigentes();
  return { todas: todas, marcas: Array.from(new Set(todas.map(p => p.marca).filter(Boolean))), kits: kitsVigentes() };
}

/* ───────────── imagen (canvas 2D) ───────────── */
const W = 1080, MX = 48, ANCHO_TXT = W - MX * 2, ALTO_MAX = 2000;
const FUENTE = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';   // la imagen se hace en el teléfono de quien la manda: pila simple y predecible
// Papel claro con texto oscuro: la imagen se lee igual en WhatsApp claro u oscuro. Contraste ≥ 4.5:1 en todos los pares.
const COL = { papel: '#FFFFFF', tinta: '#14181C', suave: '#4F5B66', verde: '#00794F', verdeClaro: '#E3F1EA', linea: '#D7DCE1', banda: '#F2F4F6' };
const F = (peso, px) => peso + ' ' + px + 'px ' + FUENTE;
const ALTO_ENC = 190, ALTO_PIE = 96, ALTO_SECCION = 84, GAP = 16, ALTO_LIN = 46;

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
   título + (subtítulo) + (panel con las piezas del kit) + «píldoras» de precio que fluyen y saltan de renglón. */
function medirFila(ctx, it) {
  ctx.font = F(700, 38);
  const tit = envolver(ctx, it.titulo, ANCHO_TXT, 2);
  let sub = [];
  if (it.sub) { ctx.font = F(400, 32); sub = envolver(ctx, it.sub, ANCHO_TXT, 1); }
  // panel de piezas (kits): «SKU · producto» a la izquierda, «cant × precio» a la derecha
  let lin = [], panelH = 0;
  if (it.lineas && it.lineas.length) {
    ctx.font = F(700, 30);
    const anchoDer = Math.max.apply(null, it.lineas.map(l => ctx.measureText(l.der).width));
    ctx.font = F(400, 30);
    const maxIzq = ANCHO_TXT - 40 - anchoDer - 24;
    lin = it.lineas.map(l => ({ izq: envolver(ctx, l.izq, maxIzq, 1)[0] || '', der: l.der }));
    panelH = lin.length * ALTO_LIN + 24;
  }
  // píldoras: { texto, estilo: 'lleno' | 'borde' | 'texto', px }. Un renglón solo de texto (la vigencia) es más bajo.
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
  const alto = 26 + tit.length * 48 + (sub.length ? 42 : 0) + (panelH ? 6 + panelH + 14 : 10) + altoPild + 26;
  return { it: it, tit: tit, sub: sub, lin: lin, panelH: panelH, pos: pos, offs: offs, alto: alto };
}
function dibujarFila(ctx, f, y) {
  let cy = y + 26;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COL.tinta; ctx.font = F(700, 38);
  f.tit.forEach(l => { ctx.fillText(l, MX, cy + 36); cy += 48; });
  if (f.sub.length) { ctx.fillStyle = COL.suave; ctx.font = F(400, 32); ctx.fillText(f.sub[0], MX, cy + 30); cy += 42; }
  if (f.lin.length) {
    cy += 6;
    ctx.fillStyle = COL.banda; rr(ctx, MX, cy, ANCHO_TXT, f.panelH, 16); ctx.fill();
    f.lin.forEach((l, i) => {
      const by = cy + 12 + i * ALTO_LIN + 34;
      ctx.fillStyle = COL.tinta; ctx.font = F(400, 30); ctx.fillText(l.izq, MX + 20, by);
      ctx.font = F(700, 30); ctx.textAlign = 'right'; ctx.fillText(l.der, MX + ANCHO_TXT - 20, by); ctx.textAlign = 'left';
    });
    cy += f.panelH + 14;
  } else cy += 10;
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
/** sinFecha: la vigencia es la misma para todo el grupo y ya va en la franja de la sección (no se repite en cada fila). */
function filaPromo(p, sinFecha) {
  const pild = [];
  if (p.pu > 0) pild.push({ texto: 'Promoción ' + moneda(p.pu), estilo: 'lleno', px: 36 });
  if (p.pm > 0) pild.push({ texto: 'Mayoreo desde ' + p.mn + ' pzas: ' + moneda(p.pm), estilo: 'borde', px: 34 });
  if (p.hasta && !sinFecha) pild.push({ texto: 'hasta ' + fechaMs(p.hasta), estilo: 'texto', px: 32 });
  return { tipo: 'fila', titulo: p.sku + ' · ' + p.nombre, sub: '', lineas: null, pildoras: pild };
}
function filaKit(k, sinFecha) {
  const pild = k.completo
    ? [{ texto: moneda(k.total), estilo: 'lleno', px: 38 }, { texto: 'ahorras ' + moneda(k.ahorro), estilo: 'borde', px: 34 }]
    : [{ texto: '−' + Math.round(k.pct) + '% en cada pieza', estilo: 'lleno', px: 36 }];
  if (k.hasta && !sinFecha) pild.push({ texto: 'hasta ' + fechaMs(k.hasta), estilo: 'texto', px: 32 });
  const lineas = k.lineas.map(l => ({
    izq: l.sku + ' · ' + l.desc,
    der: l.precio > 0 ? l.cant + ' × ' + moneda(l.precio) : l.cant + (l.cant > 1 ? ' pzas' : ' pza')
  }));
  return { tipo: 'fila', titulo: k.nombre, sub: (k.moto ? k.moto + ' · ' : '') + k.piezas + (k.piezas === 1 ? ' pieza' : ' piezas') + (k.completo ? ' · −' + Math.round(k.pct) + '%' : ''),
    lineas: lineas, pildoras: pild };
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
      if (o.seccion.hasta) { ctx.font = F(700, 30); ctx.textAlign = 'right'; ctx.fillText('Vigentes hasta ' + fechaMs(o.seccion.hasta), W - MX, o.y + 54); ctx.textAlign = 'left'; }
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
/** Si todo el grupo vence el mismo día, devuelve ese día (ms) para ponerlo una sola vez en la franja de la sección. */
function fechaComun(arr) {
  if (!arr.length) return 0;
  const f0 = fechaMs(arr[0].hasta);
  return f0 && arr.every(x => fechaMs(x.hasta) === f0) ? arr[0].hasta : 0;
}

/** datos → [{ blob, ancho, alto }] */
async function generarImagenes(promos, kits) {
  const medida = document.createElement('canvas').getContext('2d');
  const items = [], hP = fechaComun(promos), hK = fechaComun(kits);
  if (promos.length) { items.push({ tipo: 'seccion', texto: 'PROMOCIONES Y MAYOREO', hasta: hP }); promos.forEach(p => items.push(filaPromo(p, !!hP))); }
  if (kits.length) { items.push({ tipo: 'seccion', texto: 'KITS DE SERVICIO MAYOR', hasta: hK }); kits.forEach(k => items.push(filaKit(k, !!hK))); }
  const paginas = paginar(medida, items), out = [];
  for (let i = 0; i < paginas.length; i++) {
    const cv = dibujarPagina(paginas[i], i + 1, paginas.length);
    out.push({ blob: await aBlob(cv), ancho: cv.width, alto: cv.height });
  }
  return out;
}

/* ───────────── pantalla (pestaña del panel) ───────────── */
const estado = { marca: '', kits: true, imgs: [], urls: [], gen: 0, firma: '' };
const CSS = `
.pm-wrap{display:flex;flex-direction:column;gap:12px}
.pm-fila{display:flex;align-items:center;gap:8px;justify-content:space-between}
.pm-resumen{margin:0;font-size:14px;color:var(--text-dim)}
.pm-ayuda{margin:0;font-size:13px;line-height:1.45;color:var(--text-dim)}
.pm-chips{display:flex;flex-wrap:wrap;gap:8px}
.pm-chip{min-height:44px;padding:0 16px;border-radius:22px;border:1px solid var(--line);background:var(--surface-2);color:var(--text);font:600 14px/1 inherit;cursor:pointer;touch-action:manipulation;transition:background .15s,color .15s}
.pm-chip[aria-pressed="true"]{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.pm-check{display:flex;align-items:center;gap:10px;min-height:44px;font-size:15px;cursor:pointer}
.pm-check input{width:22px;height:22px;accent-color:var(--accent)}
.pm-vista{display:flex;flex-direction:column;gap:16px}
.pm-fig{margin:0;display:flex;flex-direction:column;gap:8px;max-width:560px;width:100%;align-self:center}
.pm-img{display:block;width:100%;height:auto;border-radius:12px;border:1px solid var(--line);background:#fff}
.pm-sk{height:260px;border-radius:12px;background:var(--surface-2)}
@media (prefers-reduced-motion:no-preference){.pm-sk{animation:pm-pulso 1.2s ease-in-out infinite}}
@keyframes pm-pulso{50%{opacity:.55}}
.pm-barra{position:sticky;bottom:0;display:flex;gap:8px;padding:10px 0 calc(10px + env(safe-area-inset-bottom,0px));background:var(--bg);border-top:1px solid var(--line);margin-top:4px}
.pm-btn{flex:1;min-height:48px;display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:12px;border:1px solid var(--line);background:var(--surface-2);color:var(--text);font:700 15px/1 inherit;cursor:pointer;touch-action:manipulation}
.pm-btn.pm-primario{flex:2;background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.pm-btn:disabled{opacity:.45;cursor:not-allowed}
.pm-copiar{min-height:44px}
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
function activarBotones(si) { ['pmEnviar', 'pmBajar', 'pmWeb'].forEach(id => { const b = el(id); if (b) b.disabled = !si; }); }
const firmaDe = d => JSON.stringify([d.todas, d.kits, estado.marca, estado.kits]);

async function generar() {
  const mi = ++estado.gen, vista = el('pmVista'); if (!vista) return;
  vista.setAttribute('aria-busy', 'true'); activarBotones(false);
  vista.innerHTML = '<div class="pm-sk" role="status" aria-label="Preparando la imagen"></div>';
  let d = null;
  try {
    d = recopilar();
    if (estado.marca && d.marcas.indexOf(estado.marca) === -1) estado.marca = '';
    estado.firma = firmaDe(d);   // antes de esperar: así una sincronización rápida no la ve vacía y no rehace la imagen de más
  } catch (e) { console.error(e); }
  await new Promise(r => setTimeout(r, 30));   // deja pintar el aviso antes del trabajo pesado
  if (mi !== estado.gen) return;
  try {
    if (!d) d = recopilar();
    pintarMarcas(d.marcas);
    const promos = estado.marca ? d.todas.filter(p => p.marca === estado.marca) : d.todas;
    const kits = estado.kits ? d.kits : [];
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
    const copiable = !esTactil() && !!(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem);
    vista.innerHTML = imgs.map((im, i) => {
      const u = URL.createObjectURL(im.blob); estado.urls.push(u);
      return '<figure class="pm-fig"><img class="pm-img" src="' + u + '" width="' + im.ancho + '" height="' + im.alto + '" alt="Promociones vigentes, imagen ' + (i + 1) + ' de ' + imgs.length + '" decoding="async">'
        + (copiable ? '<button type="button" class="pm-btn pm-copiar" data-i="' + i + '">' + IC.copiar + ' Copiar imagen ' + (i + 1) + ' de ' + imgs.length + '</button>' : '') + '</figure>';
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
/** Pide a Maps los datos más recientes (promociones, kits y las listas de precios que usan los kits). */
function sincronizarTodo() {
  if (!navigator.onLine) return Promise.resolve(false);
  const ps = [sincronizarPromociones(), sincronizarKits()];
  try { if (typeof sincronizarPreciosCalculados === 'function') ps.push(sincronizarPreciosCalculados()); } catch (e) {}
  return Promise.all(ps.map(p => Promise.resolve(p).catch(() => {}))).then(() => true);
}
/** Al abrir la pestaña la imagen sale al instante con lo guardado; si al sincronizar llega algo distinto, se rehace sola. */
async function sincronizarYRefrescar() {
  await sincronizarTodo();
  if (currentTab !== 'promos' || !el('pmVista')) return;
  if (firmaDe(recopilar()) !== estado.firma) generar();
}
async function actualizar() {
  const b = el('pmActualizar'); if (b) b.disabled = true;
  if (!navigator.onLine) toast('Sin señal: se usan las promociones guardadas en este equipo.');
  else await sincronizarTodo();
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
/* PC: WhatsApp Web + portapapeles (el portapapeles solo acepta PNG; la imagen se convierte al copiar). */
function abrirWhatsAppWeb() {
  window.open('https://web.whatsapp.com/', '_blank', 'noopener');
  toast('Abre el chat del cliente y pega cada imagen con Ctrl+V (usa «Copiar imagen»), o arrastra las guardadas.');
}
async function aPng(blob) {
  const bmp = await createImageBitmap(blob), cv = document.createElement('canvas');
  cv.width = bmp.width; cv.height = bmp.height; cv.getContext('2d').drawImage(bmp, 0, 0);
  return new Promise((ok, mal) => cv.toBlob(b => b ? ok(b) : mal(new Error('png')), 'image/png'));
}
function copiar(i) {
  const im = estado.imgs[i]; if (!im) return;
  try {
    navigator.clipboard.write([new ClipboardItem({ 'image/png': aPng(im.blob) })])
      .then(() => toast('Imagen ' + (i + 1) + ' copiada: pégala en el chat con Ctrl+V'))
      .catch(() => toast('No se pudo copiar. Usa «Guardar» y arrastra el archivo al chat.'));
  } catch (e) { toast('Este navegador no permite copiar imágenes. Usa «Guardar».'); }
}

window.renderPromosImagen = function () {
  asegurarCss();
  const pc = !esTactil();
  estado.firma = '';
  sheetBody.innerHTML =
    '<div class="pm-wrap">'
    + '<div class="pm-fila"><p class="pm-resumen" id="pmResumen" role="status"></p>'
    + '<button type="button" class="pm-icono" id="pmActualizar" aria-label="Actualizar promociones">' + IC.girar + '</button></div>'
    + (pc ? '<p class="pm-ayuda">En PC: toca «Copiar imagen» y pégala (Ctrl+V) en WhatsApp Web, o usa «Guardar» y arrastra los archivos al chat.</p>' : '')
    + '<div class="pm-chips" id="pmMarcas" role="group" aria-label="Filtrar por marca" hidden></div>'
    + '<label class="pm-check"><input type="checkbox" id="pmKits"' + (estado.kits ? ' checked' : '') + '> Incluir kits de servicio mayor</label>'
    + '<div class="pm-vista" id="pmVista" aria-live="polite" aria-busy="true"></div>'
    + '<div class="pm-barra">'
    + (pc
      ? '<button type="button" class="pm-btn pm-primario" id="pmWeb" disabled>' + IC.web + ' Abrir WhatsApp Web</button>'
        + '<button type="button" class="pm-btn" id="pmEnviar" disabled>' + IC.enviar + ' Compartir</button>'
      : '<button type="button" class="pm-btn pm-primario" id="pmEnviar" disabled>' + IC.enviar + ' Enviar por WhatsApp</button>')
    + '<button type="button" class="pm-btn" id="pmBajar" disabled>' + IC.bajar + ' Guardar</button>'
    + '</div></div>';
  el('pmEnviar').addEventListener('click', compartir);
  el('pmBajar').addEventListener('click', descargar);
  if (el('pmWeb')) el('pmWeb').addEventListener('click', abrirWhatsAppWeb);
  el('pmActualizar').addEventListener('click', actualizar);
  el('pmKits').addEventListener('change', e => { estado.kits = e.target.checked; generar(); });
  el('pmMarcas').addEventListener('click', e => {
    const b = e.target.closest('.pm-chip'); if (!b) return;
    estado.marca = b.getAttribute('data-m') || ''; generar();
  });
  el('pmVista').addEventListener('click', e => {
    const b = e.target.closest('.pm-copiar'); if (b) copiar(Number(b.getAttribute('data-i')));
  });
  generar();
  sincronizarYRefrescar();
};
})();
