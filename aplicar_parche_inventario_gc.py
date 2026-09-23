#!/usr/bin/env python3
"""Agrega "Inventario Grupo Camejo" (consulta de existencia + apartados)
al menú Ventas en ruta.
Uso: python3 aplicar_parche_inventario_gc.py index.html
"""
import shutil
import sys

ruta = sys.argv[1] if len(sys.argv) > 1 else "index.html"
with open(ruta, "r", encoding="utf-8", newline="") as f:
    original = f.read()
usa_crlf = "\r\n" in original
src = original.replace("\r\n", "\n")
errores = []


def reemplazar(texto, viejo, nuevo, nombre):
    n = texto.count(viejo)
    if n != 1:
        errores.append(f"[{nombre}] se esperaba 1 coincidencia y hay {n}")
        return texto
    return texto.replace(viejo, nuevo)


# 1) Botón en el menú "Ventas en ruta"
src = reemplazar(src, r'''  </button>
</div>

<div class="drawer-flyout" id="flyoutClima">''', r'''  </button>
  <button class="drawer-item" id="btnInventarioGC">
    <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20"><path d="M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-1-2-2-2zm-5 12H9v-2h6v2zm5-7H4V4h16v3z"/></svg>
    <span class="txt">Inventario Grupo Camejo</span>
  </button>
</div>

<div class="drawer-flyout" id="flyoutClima">''', "boton menu")

# 2) Listener del botón
src = reemplazar(src,
    "document.getElementById('btnRegistrarVentaMenu').addEventListener('click', () => abrirVentaRuta());",
    r'''document.getElementById('btnRegistrarVentaMenu').addEventListener('click', () => abrirVentaRuta());
document.getElementById('btnInventarioGC').addEventListener('click', () => {
  abrirSheet();
  cambiarTab('inventariogc', 'mapa');
});''', "listener")

# 3) Enrutado de pestaña
src = reemplazar(src,
    "if(tab === 'misventas') renderMisVentas();",
    "if(tab === 'misventas') renderMisVentas();\n    if(tab === 'inventariogc') renderInventarioGC();",
    "cambiarTab")

# 4) Título de pestaña
src = reemplazar(src, "    misventas: 'Mis ventas'\n  };",
    "    misventas: 'Mis ventas',\n    inventariogc: 'Inventario Grupo Camejo'\n  };", "titulo")

# 5) Lógica
src = reemplazar(src, "/* ---------- Arranque de datos (solo tras iniciar sesión) ----------", r'''/* ---------- Inventario Grupo Camejo ----------
   Refacciones que NO están en el almacén móvil pero sí en las unidades de
   negocio. Se consulta existencia y se APARTAN piezas para un cliente
   (para dejarlas y cobrarlas después en el local). Vive en Firestore:
   inventario_gc/{sku}  y  apartados_gc/{id}.  El admin lo carga con plantilla. */
const INV_GC_CACHE_KEY = 'gc_inventario_gc_cache_v1';
let inventarioGC = [];      // [{sku, producto, cantidad, ubicacion, precioUnitario}]
let apartadosGCPend = [];   // apartados pendientes (de todos, para calcular disponible)
let invGCFiltro = '';

function idDocGC(sku){ return String(sku || '').trim().replace(/\//g, '_'); }

function disponibleGC(sku){
  const it = inventarioGC.find(x => x.sku === sku);
  if(!it) return 0;
  const apartado = apartadosGCPend
    .filter(a => a.sku === sku)
    .reduce((t, a) => t + (Number(a.cantidad) || 0), 0);
  return Math.max(0, (Number(it.cantidad) || 0) - apartado);
}

function renderInventarioGC(){
  const esAd = !!esAdmin;
  sheetBody.innerHTML =
    '<div class="field"><div class="search-wrap"><input type="text" id="invGCBuscar" placeholder="Buscar SKU o producto…" value="' + escapeHtml(invGCFiltro) + '"></div></div>'
    + (esAd
      ? '<div class="save-row" style="margin-bottom:6px;">'
        + '<button class="btn" id="btnInvGCPlantilla" style="flex:1;">⬇️ Plantilla</button>'
        + '<button class="btn" id="btnInvGCExcel" style="flex:1;">📄 Cargar Excel/CSV</button></div>'
        + '<input type="file" id="invGCExcelInput" accept=".xlsx,.xls,.csv" style="display:none">'
        + '<div style="font-size:11.5px; color:var(--text-dim); margin-bottom:12px;">Reemplaza TODO el inventario Grupo Camejo con lo que traiga el archivo (sku y cantidad obligatorias; ubicacion = unidad de negocio).</div>'
      : '')
    + '<div id="invGCAviso" style="font-size:11px; color:var(--text-dim); margin-bottom:8px;"></div>'
    + '<div id="invGCLista"></div>'
    + '<div style="font-weight:700; font-size:14px; margin:18px 0 10px;">' + (esAd ? 'Apartados pendientes (todos)' : 'Mis apartados pendientes') + '</div>'
    + '<div id="invGCApartados"></div>';

  document.getElementById('invGCBuscar').addEventListener('input', (e) => {
    invGCFiltro = e.target.value;
    pintarInventarioGC();
  });
  if(esAd){
    document.getElementById('btnInvGCPlantilla').addEventListener('click', invGCDescargarPlantilla);
    document.getElementById('btnInvGCExcel').addEventListener('click', () => document.getElementById('invGCExcelInput').click());
    document.getElementById('invGCExcelInput').addEventListener('change', invGCImportarExcel);
  }

  // Muestra al instante lo último guardado y actualiza en segundo plano.
  try{
    const c = JSON.parse(localStorage.getItem(INV_GC_CACHE_KEY));
    if(c){ inventarioGC = c.inv || []; apartadosGCPend = c.ap || []; }
  } catch(e){}
  document.getElementById('invGCAviso').textContent = inventarioGC.length ? 'Mostrando lo último guardado — actualizando…' : 'Cargando…';
  pintarInventarioGC();
  refrescarInventarioGC();
}

async function refrescarInventarioGC(){
  let aviso = '';
  try{
    const res = await Promise.all([
      dbVentaRuta.collection('inventario_gc').get(),
      dbVentaRuta.collection('apartados_gc').where('estatus', '==', 'pendiente').get()
    ]);
    inventarioGC = res[0].docs.map(d => d.data());
    apartadosGCPend = res[1].docs.map(d => d.data());
    try{ localStorage.setItem(INV_GC_CACHE_KEY, JSON.stringify({ inv: inventarioGC, ap: apartadosGCPend })); } catch(e){}
  } catch(err){
    aviso = 'No se pudo actualizar (' + (err && (err.code || err.message) || 'sin señal') + '). Se muestra lo último guardado.';
  }
  if(currentTab !== 'inventariogc') return;
  const av = document.getElementById('invGCAviso');
  if(av) av.textContent = aviso;
  pintarInventarioGC();
}

function pintarInventarioGC(){
  const cont = document.getElementById('invGCLista');
  const contAp = document.getElementById('invGCApartados');
  if(!cont || !contAp) return;

  const q = normalizarBusqueda(invGCFiltro).trim();
  let lista = inventarioGC.filter(it => !q || normalizarBusqueda(it.sku + ' ' + it.producto + ' ' + (it.ubicacion || '')).includes(q));
  const total = lista.length;
  lista = lista.slice(0, 60);

  cont.innerHTML = lista.map(it => {
    const disp = disponibleGC(it.sku);
    const meta = ['SKU ' + escapeHtml(it.sku), it.ubicacion ? escapeHtml(it.ubicacion) : '', it.precioUnitario ? '$' + Number(it.precioUnitario).toFixed(2) : '']
      .filter(Boolean).join(' · ');
    return '<div class="item"><div class="info"><div class="name">' + escapeHtml(it.producto || it.sku) + '</div>'
      + '<div class="meta">' + meta + '</div></div>'
      + '<div style="text-align:right; flex-shrink:0;"><div style="font-weight:700;">' + disp + '</div>'
      + (disp > 0 ? '<button class="btn teal" style="padding:4px 10px; font-size:12px; margin-top:4px;" data-apartar="' + escapeHtml(it.sku) + '">Apartar</button>'
                  : '<div style="font-size:11px; color:var(--danger);">Sin existencia</div>')
      + '</div></div>';
  }).join('') + (total > lista.length ? '<div class="empty">Mostrando ' + lista.length + ' de ' + total + '. Escribe más para afinar.</div>' : '')
    || '<div class="empty">' + (inventarioGC.length ? 'Sin resultados.' : 'Aún no hay inventario Grupo Camejo cargado.') + '</div>';

  cont.querySelectorAll('[data-apartar]').forEach(b => {
    b.addEventListener('click', () => apartarGC(b.dataset.apartar));
  });

  const visibles = apartadosGCPend
    .filter(a => esAdmin || a.vendedor === usuarioActual)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  contAp.innerHTML = visibles.map(a => {
    const puedeCancelar = esAdmin || a.vendedor === usuarioActual;
    return '<div class="item"><div class="info"><div class="name">' + escapeHtml(a.producto || a.sku) + ' × ' + a.cantidad + '</div>'
      + '<div class="meta">Cliente: ' + escapeHtml(a.cliente) + (esAdmin ? ' · ' + escapeHtml(a.vendedorNombre || a.vendedor) : '')
      + (a.ubicacion ? ' · ' + escapeHtml(a.ubicacion) : '') + '</div></div>'
      + '<div class="fila-acciones">'
      + (esAdmin ? '<button class="quitar-parada" style="color:var(--teal);" data-entregar="' + a.id + '" title="Marcar como entregado/cobrado">✓</button>' : '')
      + (puedeCancelar ? '<button class="quitar-parada" data-cancelar="' + a.id + '" title="Cancelar apartado">✕</button>' : '')
      + '</div></div>';
  }).join('') || '<div class="empty">No hay apartados pendientes.</div>';

  contAp.querySelectorAll('[data-entregar]').forEach(b => b.addEventListener('click', () => cambiarEstatusApartadoGC(b.dataset.entregar, 'entregado')));
  contAp.querySelectorAll('[data-cancelar]').forEach(b => b.addEventListener('click', () => {
    if(confirm('¿Cancelar este apartado? Las piezas quedan disponibles de nuevo.')) cambiarEstatusApartadoGC(b.dataset.cancelar, 'cancelado');
  }));
}

function apartarGC(sku){
  const it = inventarioGC.find(x => x.sku === sku);
  if(!it) return;
  const disp = disponibleGC(sku);
  const cant = Math.floor(Number(prompt('¿Cuántas piezas apartar de "' + (it.producto || sku) + '"? (disponibles: ' + disp + ')', '1')));
  if(!cant || cant < 1) return;
  if(cant > disp){ mostrarToast('Solo hay ' + disp + ' disponibles'); return; }
  const cliente = (prompt('¿Para qué cliente se aparta?', '') || '').trim();
  if(!cliente){ mostrarToast('Falta el nombre del cliente'); return; }

  const ref = dbVentaRuta.collection('apartados_gc').doc();
  const ap = {
    id: ref.id, vendedor: usuarioActual, vendedorNombre: nombreActual,
    sku: sku, producto: it.producto || '', ubicacion: it.ubicacion || '',
    cantidad: cant, cliente: cliente, fecha: new Date().toISOString(), estatus: 'pendiente'
  };
  // Se refleja al instante y se guarda sin bloquear (Firestore lo reintenta solo sin señal).
  apartadosGCPend.push(ap);
  try{ localStorage.setItem(INV_GC_CACHE_KEY, JSON.stringify({ inv: inventarioGC, ap: apartadosGCPend })); } catch(e){}
  pintarInventarioGC();
  mostrarToast('Apartado: ' + cant + ' × ' + (it.producto || sku));
  ref.set(ap).catch(err => mostrarToast('No se pudo guardar el apartado: ' + (err.code || err.message)));
}

function cambiarEstatusApartadoGC(id, estatus){
  apartadosGCPend = apartadosGCPend.filter(a => a.id !== id);
  try{ localStorage.setItem(INV_GC_CACHE_KEY, JSON.stringify({ inv: inventarioGC, ap: apartadosGCPend })); } catch(e){}
  pintarInventarioGC();
  dbVentaRuta.collection('apartados_gc').doc(id).update({ estatus: estatus, actualizadoEn: Date.now() })
    .then(() => mostrarToast(estatus === 'entregado' ? 'Marcado como entregado' : 'Apartado cancelado'))
    .catch(err => mostrarToast('No se pudo actualizar: ' + (err.code || err.message)));
}

function invGCDescargarPlantilla(){
  const datos = [
    ['sku', 'producto', 'cantidad', 'ubicacion', 'precioUnitario'],
    ['VM10010035', 'Ejemplo de refacción', 5, 'Unidad de negocio / sucursal', 150]
  ];
  const hoja = XLSX.utils.aoa_to_sheet(datos);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'InventarioGC');
  XLSX.writeFile(libro, 'plantilla_inventario_grupo_camejo.xlsx');
}

async function invGCImportarExcel(ev){
  const file = ev.target.files[0];
  ev.target.value = '';
  if(!file) return;
  try{
    let filas;
    if(/\.csv$/i.test(file.name)){
      filas = parseCSV(await file.text());
    } else {
      const libro = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      filas = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { header: 1, raw: true, defval: '' });
    }
    if(!filas || filas.length < 2){ mostrarToast('El archivo no tiene datos'); return; }

    const enc = filas[0].map(h => String(h || '').trim().toLowerCase());
    const iSku = enc.findIndex(h => h.indexOf('sku') !== -1);
    const iCant = enc.findIndex(h => h.indexOf('cant') !== -1);
    const iProd = enc.findIndex(h => h.indexOf('producto') !== -1 || h.indexOf('descripcion') !== -1);
    const iUbi = enc.findIndex(h => h.indexOf('ubic') !== -1 || h.indexOf('unidad') !== -1 || h.indexOf('sucursal') !== -1);
    const iPre = enc.findIndex(h => h.indexOf('precio') !== -1);
    if(iSku === -1 || iCant === -1){ mostrarToast('El archivo necesita al menos columnas "sku" y "cantidad"'); return; }

    const porSku = new Map();
    filas.slice(1).forEach(f => {
      const sku = String(f[iSku] || '').trim();
      if(!sku) return;
      const cache = preciosCache[sku];
      porSku.set(sku, {
        sku: sku,
        producto: (iProd > -1 && String(f[iProd] || '').trim()) ? String(f[iProd]).trim() : (cache ? (cache.producto || '') : ''),
        cantidad: Number(f[iCant]) || 0,
        ubicacion: iUbi > -1 ? String(f[iUbi] || '').trim() : '',
        precioUnitario: (iPre > -1 && f[iPre] !== '') ? (Number(f[iPre]) || 0) : (cache ? (Number(cache.precioUnitario) || 0) : 0),
        actualizadoEn: Date.now()
      });
    });
    if(porSku.size === 0){ mostrarToast('No se encontraron filas válidas'); return; }
    if(!confirm('Se cargarán ' + porSku.size + ' productos y se REEMPLAZARÁ el inventario Grupo Camejo actual. ¿Continuar?')) return;

    mostrarToast('Subiendo inventario…');
    const operaciones = [];
    porSku.forEach(it => operaciones.push({ tipo: 'set', id: idDocGC(it.sku), data: it }));
    inventarioGC.forEach(old => { if(!porSku.has(old.sku)) operaciones.push({ tipo: 'del', id: idDocGC(old.sku) }); });

    const col = dbVentaRuta.collection('inventario_gc');
    for(let i = 0; i < operaciones.length; i += 400){
      const batch = dbVentaRuta.batch();
      operaciones.slice(i, i + 400).forEach(op => {
        if(op.tipo === 'set') batch.set(col.doc(op.id), op.data);
        else batch.delete(col.doc(op.id));
      });
      await batch.commit();
    }
    mostrarToast('Inventario Grupo Camejo actualizado: ' + porSku.size + ' productos');
    refrescarInventarioGC();
  } catch(err){
    mostrarToast('No se pudo cargar: ' + (err.code || err.message));
  }
}

/* ---------- Arranque de datos (solo tras iniciar sesión) ----------''', "logica inventario gc")

if errores:
    print("NO se modificó nada. Falló:")
    for e in errores:
        print("  -", e)
    sys.exit(1)

shutil.copyfile(ruta, ruta + ".bak3")
if usa_crlf:
    src = src.replace("\n", "\r\n")
with open(ruta, "w", encoding="utf-8", newline="") as f:
    f.write(src)
print("Listo: Inventario Grupo Camejo agregado a", ruta)
