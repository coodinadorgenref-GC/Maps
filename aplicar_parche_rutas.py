#!/usr/bin/env python3
"""
Aplica el parche (almacén móvil con caché instantáneo, fix de SKU con trim,
botón Copiar + detalle expandible en "Mis ventas") al index.html de la app
de rutas (Prospectos & Rutas GC).

Uso:
    python3 aplicar_parche_rutas.py index.html

- Hace respaldo en index.html.bak
- Cada cambio se valida: debe encontrarse EXACTAMENTE 1 vez. Si algo no
  coincide, no se escribe nada y se avisa cuál falló.
"""
import re
import shutil
import sys

ruta = sys.argv[1] if len(sys.argv) > 1 else "index.html"
with open(ruta, "r", encoding="utf-8", newline="") as f:
    original = f.read()

usa_crlf = "\r\n" in original
src = original.replace("\r\n", "\n")

errores = []


def reemplazar_exacto(texto, viejo, nuevo, nombre):
    n = texto.count(viejo)
    if n != 1:
        errores.append(f"[{nombre}] se esperaba 1 coincidencia y hay {n}")
        return texto
    return texto.replace(viejo, nuevo)


def reemplazar_regex(texto, patron, nuevo, nombre):
    coincidencias = re.findall(patron, texto, flags=re.DOTALL)
    if len(coincidencias) != 1:
        errores.append(f"[{nombre}] se esperaba 1 coincidencia y hay {len(coincidencias)}")
        return texto
    return re.sub(patron, lambda m: nuevo, texto, count=1, flags=re.DOTALL)


# ---------------------------------------------------------------
# 1) renderAlmacenPropio: mostrar caché al instante + pintar aparte
# ---------------------------------------------------------------
src = reemplazar_exacto(src, r'''async function renderAlmacenPropio(){
  sheetBody.innerHTML = '<div class="empty">Cargando tu almacén móvil…</div>';
  await cargarInventarioPropio();
  if(currentTab !== 'almacen') return;
  const entradas = Object.entries(inventarioPropio);
''', r'''async function renderAlmacenPropio(){
  // Muestra de inmediato lo último que se tenga en caché local (si existe)
  // mientras se actualiza en segundo plano — antes se quedaba en
  // "Cargando…" hasta que respondiera el Sheet completo, que puede tardar.
  try{
    const cache = JSON.parse(localStorage.getItem(ALMACEN_PROPIO_CACHE_KEY)) || {};
    if(Object.keys(cache).length){ inventarioPropio = cache; pintarAlmacenPropio(true); }
    else sheetBody.innerHTML = '<div class="empty">Cargando tu almacén móvil…</div>';
  } catch(e){ sheetBody.innerHTML = '<div class="empty">Cargando tu almacén móvil…</div>'; }
  await cargarInventarioPropio();
  if(currentTab !== 'almacen') return;
  await pintarAlmacenPropio(false);
}

async function pintarAlmacenPropio(esCache){
  const entradas = Object.entries(inventarioPropio);
''', "renderAlmacenPropio (cabecera)")

src = reemplazar_regex(
    src,
    r"  const pedidos = await cargarPedidosPropiosPendientes\(\);.*?\+ \(filasPedidos \|\| '<div class=\"empty\">No tienes pedidos pendientes\.</div>'\);",
    r'''  const avisoCache = esCache ? '<div style="font-size:11px; color:var(--text-dim); margin-bottom:8px;">Mostrando lo último guardado — actualizando…</div>' : '';
  sheetBody.innerHTML = avisoCache
    + '<div style="font-weight:700; font-size:14px; margin-bottom:10px;">Existencias que traes contigo</div>'
    + (filas || '<div class="empty">Aún no tienes inventario asignado. Pídele a un admin que te lo cargue.</div>')
    + '<div style="font-weight:700; font-size:14px; margin:18px 0 10px;">Pedidos pendientes</div>'
    + '<div id="mvPedidosPropiosWrap"><div class="empty">Cargando…</div></div>';
  const pedidos = await cargarPedidosPropiosPendientes();
  if(currentTab !== 'almacen') return;
  const wrap = document.getElementById('mvPedidosPropiosWrap');
  if(!wrap) return;
  const filasPedidos = pedidos.map(function(p){
    return '<div class="item"><div class="info"><div class="name">' + escapeHtml(p.producto || p.sku) + '</div>'
      + '<div class="meta">Pediste ' + p.cantidadSolicitada + ' · Pendiente</div></div></div>';
  }).join('');
  wrap.innerHTML = filasPedidos || '<div class="empty">No tienes pedidos pendientes.</div>';''',
    "renderAlmacenPropio (pedidos)")

# ---------------------------------------------------------------
# 2) Fix SKU: misma llave recortada (.trim()) en ambos lados
# ---------------------------------------------------------------
src = reemplazar_exacto(
    src,
    "(JSON.parse(localStorage.getItem(PRECIOS_RUTA_KEY)) || []).forEach(function(p){ preciosCache[p.sku] = p; });",
    "(JSON.parse(localStorage.getItem(PRECIOS_RUTA_KEY)) || []).forEach(function(p){ preciosCache[String(p.sku || '').trim()] = p; });",
    "SKU trim (cache local)")

src = reemplazar_exacto(
    src,
    "lista.forEach(function(p){ preciosCache[p.sku] = p; });",
    "lista.forEach(function(p){ preciosCache[String(p.sku || '').trim()] = p; });",
    "SKU trim (sincronizarPreciosRuta)")

# ---------------------------------------------------------------
# 3) Mis ventas: fila expandible + botón Copiar
# ---------------------------------------------------------------
src = reemplazar_exacto(src, r'''  sheetBody.innerHTML = ventas.map(v => `
    <div class="item">
''', r'''  sheetBody.innerHTML = ventas.map((v, i) => `
    <div class="item" data-ver="${i}" style="cursor:pointer; flex-wrap:wrap;">
''', "renderMisVentas (fila)")

src = reemplazar_exacto(src, r'''      <button class="btn teal" style="flex:0 0 auto; padding:8px 12px;" data-reenviar="${escapeHtml(v.folio)}">↻ Reenviar</button>
    </div>
  `).join('');
''', r'''      <button class="btn teal" style="flex:0 0 auto; padding:8px 12px;" data-copiar="${i}">📋 Copiar</button>
      <button class="btn teal" style="flex:0 0 auto; padding:8px 12px;" data-reenviar="${escapeHtml(v.folio)}">↻ Reenviar</button>
      <div class="mv-detalle" id="mvDetalle${i}" hidden style="flex-basis:100%; margin-top:8px; padding-top:8px; border-top:1px solid var(--line); font-size:12.5px; color:var(--text-dim);"></div>
    </div>
  `).join('');
''', "renderMisVentas (botones)")

src = reemplazar_exacto(src, r'''  sheetBody.querySelectorAll('[data-reenviar]').forEach(btn => {''', r'''  sheetBody.querySelectorAll('[data-ver]').forEach(fila => {
    fila.addEventListener('click', (e) => {
      if(e.target.closest('button')) return; // no expandir si se tocó un botón
      const idx = fila.dataset.ver;
      const det = document.getElementById('mvDetalle' + idx);
      if(!det) return;
      if(det.hidden){
        const v = ventas[idx];
        det.innerHTML = (v.items || []).map(it => {
          const importe = (Number(it.cantidad) || 0) * (Number(it.precio) || 0);
          return `<div style="display:flex; justify-content:space-between; gap:8px; margin-bottom:3px;">`
            + `<span>${it.cantidad} × ${escapeHtml(it.producto || it.sku || '')}${it.sku ? ' <span style="opacity:.7;">(' + escapeHtml(it.sku) + ')</span>' : ''}</span>`
            + `<span style="flex-shrink:0;">$${importe.toFixed(2)}</span></div>`;
        }).join('') || 'Sin productos capturados.';
      }
      det.hidden = !det.hidden;
    });
  });

  sheetBody.querySelectorAll('[data-reenviar]').forEach(btn => {''', "renderMisVentas (handlers ver)")

src = reemplazar_exacto(src, r'''async function reenviarTicketVenta(venta){''', r'''// Texto plano de la venta (para copiar y pegar donde haga falta: WhatsApp,
// otro sistema, una nota, etc.) — mismos datos que el PDF, sin formato.
function textoVentaPlano(venta){
  const l = [];
  l.push('NOTA DE VENTA — ' + venta.folio);
  l.push('Fecha: ' + new Date(venta.fechaLocal || Date.now()).toLocaleDateString('es-MX', { day:'numeric', month:'long', year:'numeric' }));
  l.push('Cliente: ' + (venta.cliente || ''));
  if(venta.telefono) l.push('Teléfono: ' + venta.telefono);
  l.push('Vendedor: ' + (venta.vendedorNombre || venta.vendedor || ''));
  l.push('');
  (venta.items || []).forEach(it => {
    const importe = (Number(it.cantidad) || 0) * (Number(it.precio) || 0);
    l.push(`${it.cantidad} x ${it.producto || ''} (${it.sku || 'sin SKU'}) — $${(Number(it.precio) || 0).toFixed(2)} c/u = $${importe.toFixed(2)}`);
  });
  l.push('');
  l.push('TOTAL: $' + totalRedondeado(venta.items).toFixed(2));
  if(venta.metodoPago) l.push('Forma de pago: ' + venta.metodoPago);
  return l.join('\n');
}
async function copiarTextoVenta(venta){
  try{
    await navigator.clipboard.writeText(textoVentaPlano(venta));
    mostrarToast('Texto de la venta copiado');
  } catch(err){
    mostrarToast('No se pudo copiar (revisa permisos del navegador)');
  }
}

async function reenviarTicketVenta(venta){''', "funciones nuevas (copiar)")

# Handler del botón Copiar: se agrega junto al de reenviar, al final del bloque
src = reemplazar_regex(
    src,
    r"(      if\(venta\) reenviarTicketVenta\(venta\);\n    \}\);\n  \}\);\n)",
    r'''      if(venta) reenviarTicketVenta(venta);
    });
  });
  sheetBody.querySelectorAll('[data-copiar]').forEach(btn => {
    btn.addEventListener('click', () => {
      const venta = ventas[btn.dataset.copiar];
      if(venta) copiarTextoVenta(venta);
    });
  });
''',
    "renderMisVentas (handler copiar)")

# ---------------------------------------------------------------
if errores:
    print("NO se modificó nada. Falló:")
    for e in errores:
        print("  -", e)
    print("\nTu index.html probablemente difiere de la versión que revisé.")
    sys.exit(1)

shutil.copyfile(ruta, ruta + ".bak")
if usa_crlf:
    src = src.replace("\n", "\r\n")
with open(ruta, "w", encoding="utf-8", newline="") as f:
    f.write(src)
print("Listo: parche aplicado a", ruta, "(respaldo en", ruta + ".bak)")
print("Recuerda subir también sw.js con CACHE_SHELL = 'rutas-gc-shell-v22'.")
