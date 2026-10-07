# Precios especiales (admin) sobre la fórmula, usando la hoja "Promociones".
# - Precio normal fijo (precioUnitario) que manda sobre fórmula y AlmacenMovil (no aplica en pedidos)
# - Mayoreo (precioMayoreo desde minMayoreo piezas), con vigencia opcional
# - Panel solo admin: editar, agregar, quitar, descargar plantilla y subirla
# - El vendedor lo usa sin internet (se guarda en localStorage al sincronizar)
# - Al guardar se manda correo + token de sesión; el backend (Codigo_sync.gs) los valida
import shutil, sys

shutil.copy('index.html', 'index.html.bak5')
shutil.copy('sw.js', 'sw.js.bak5')
s = open('index.html', encoding='utf-8').read()
def ap(viejo, nuevo):
    global s
    n = s.count(viejo)
    if n != 1:
        sys.exit("ERROR: se esperaba 1 coincidencia y hay %d. No se cambió nada.\nBloque: %s..." % (n, viejo[:90]))
    s = s.replace(viejo, nuevo)

# 1) CSS
ap("  .alm-fila .venta-fila-item{ margin-bottom:4px; }",
"""  .alm-fila .venta-fila-item{ margin-bottom:4px; }
  .pe-fila{ border:1px solid var(--border, #dde1e6); border-radius:12px; padding:10px; margin-bottom:10px; }
  .pe-sucia{ border-color:#2f8f83; box-shadow:0 0 0 1px #2f8f83 inset; }
  .pe-r1{ display:flex; gap:6px; margin-bottom:6px; }
  .pe-fila input{ width:100%; padding:8px 10px; border:1px solid var(--border, #dde1e6); border-radius:8px; font-size:14px; box-sizing:border-box; }
  .pe-fila label{ display:block; font-size:11px; color:var(--text-dim); }
  .pe-grid{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; margin-top:6px; }
  .pe-grid2{ display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:6px; }""")

# 2) Botón del menú (solo admin)
ap("""    <span class="txt">Inventario Grupo Camejo</span>
  </button>
</div>""",
"""    <span class="txt">Inventario Grupo Camejo</span>
  </button>
  <button class="drawer-item" id="btnPreciosEsp" hidden>
    <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20"><path d="M21.41 11.58l-9-9A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/></svg>
    <span class="txt">Precios especiales</span>
  </button>
</div>""")
ap("  if (btnVivo) btnVivo.hidden = !esAdmin;",
   "  if (btnVivo) btnVivo.hidden = !esAdmin;\n  const btnPE = document.getElementById('btnPreciosEsp');\n  if (btnPE) btnPE.hidden = !esAdmin;")
ap("document.getElementById('btnInventarioGC').addEventListener('click', () => {",
"""document.getElementById('btnPreciosEsp').addEventListener('click', () => {
  abrirSheet();
  cambiarTab('preciosesp', 'mapa');
});
document.getElementById('btnInventarioGC').addEventListener('click', () => {""")
ap("    if(tab === 'inventariogc') renderInventarioGC();",
   "    if(tab === 'inventariogc') renderInventarioGC();\n    if(tab === 'preciosesp') renderPreciosEsp();")
ap("    inventariogc: 'Inventario Grupo Camejo',",
   "    inventariogc: 'Inventario Grupo Camejo',\n    preciosesp: 'Precios especiales',")

# 3) El precio especial manda sobre fórmula y AlmacenMovil en venta normal (no en pedidos).
#    La liquidación conserva su precio calculado.
ap("""  const pc = preciosCalculados[k];
  // Venta normal: si el SKU""",
"""  const pc = preciosCalculados[k];
  const esp = esPedido ? null : precioEspecialVigente(k);
  if(esp && !(pc && pc.liquidacion)){
    return { producto: esp.producto || (pc && pc.producto) || (pr && pr.producto) || (prop && prop.producto) || '', precio: esp.precio, liquidacion: false };
  }
  // Venta normal: si el SKU""")

# 4) Sincronización: guarda también las filas que solo traen precio normal
ap("      if (k && Number(p.minMayoreo) >= 2) mapa[k] = p;",
   "      if (k && (Number(p.minMayoreo) >= 2 || Number(p.precioUnitario) > 0)) mapa[k] = p;")

# 5) Vigencia compartida
ap("""  const hoy = Date.now(), d = _msFecha(p.vigenteDesde), h = _msFecha(p.vigenteHasta);
  if (d && hoy < d) return null;
  if (h && hoy > h + 86400000) return null; // incluye el último día
  let precio""", """  if (!promoVigente(p)) return null;
  let precio""")

PANEL = r'''/* ---------- Precios especiales (admin): precios que NO siguen la fórmula ----------
   Viven en la hoja "Promociones". El vendedor los recibe al sincronizar y los usa sin internet. */
let preciosEspLista = [];
let preciosEspBorrar = new Set();
let preciosEspFiltro = '';

function promoVigente(p){
  const hoy = Date.now(), d = _msFecha(p.vigenteDesde), h = _msFecha(p.vigenteHasta);
  if (d && hoy < d) return false;
  if (h && hoy > h + 86400000) return false; // incluye el último día
  return true;
}
function precioEspecialVigente(sku){
  try {
    const p = promocionesCache[normSkuMaps(sku)];
    if (!p || !promoVigente(p)) return null;
    const pu = Number(p.precioUnitario) || 0;
    return pu > 0 ? { precio: pu, producto: p.producto || '' } : null;
  } catch(e){ return null; }
}
function _numEsp(v){ const n = Number(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function _fechaEsp(v){
  if (v === '' || v == null) return '';
  if (typeof v === 'number' && v > 20000 && v < 80000){ // número de serie de Excel
    const d = new Date(Math.round((v - 25569) * 86400000));
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }
  if (typeof v === 'number' && v > 1e11){ // milisegundos (la hoja devuelve así las fechas)
    const d = new Date(v);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  const t = String(v).trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  return '';
}
function _filaEsp(r){
  const sku = String(r.sku == null ? '' : r.sku).trim();
  return { sku: sku, producto: String(r.producto || ''), marca: String(r.marca || ''),
    precioUnitario: _numEsp(r.precioUnitario), precioMayoreo: _numEsp(r.precioMayoreo), minMayoreo: _numEsp(r.minMayoreo),
    vigenteDesde: _fechaEsp(r.vigenteDesde), vigenteHasta: _fechaEsp(r.vigenteHasta), _origSku: sku, _dirty: false };
}

function renderPreciosEsp(){
  if (!esAdmin){ sheetBody.innerHTML = '<div class="empty">Solo el administrador puede editar precios especiales.</div>'; return; }
  sheetBody.innerHTML =
    '<div style="font-size:12px; color:var(--text-dim); margin-bottom:10px;">Precios que no siguen la fórmula. <b>Precio normal</b> reemplaza a la fórmula; <b>Mayoreo</b> aplica desde las piezas indicadas. Si dejas vacío el precio normal, ese SKU sigue con la fórmula. El vendedor los recibe al sincronizar y los usa sin internet.</div>'
    + '<div class="save-row" style="margin-bottom:6px;">'
    + '<button class="btn" id="btnPePlantilla" style="flex:1;">⬇️ Plantilla</button>'
    + '<button class="btn" id="btnPeExcel" style="flex:1;">⬆️ Subir plantilla</button></div>'
    + '<input type="file" id="peExcelInput" accept=".xlsx,.xls,.csv" style="display:none">'
    + '<div class="field"><div class="search-wrap"><input type="text" id="peBuscar" placeholder="Buscar SKU o producto…" value="' + escapeHtml(preciosEspFiltro) + '"></div></div>'
    + '<div id="peAviso" style="font-size:11.5px; color:var(--text-dim); margin-bottom:8px;"></div>'
    + '<div id="peLista"></div>'
    + '<button class="venta-agregar-item" id="btnPeAgregar">+ Agregar precio especial</button>'
    + '<div class="save-row" style="margin-top:10px;"><button class="btn primary" id="btnPeGuardar" style="flex:1;">Guardar cambios</button></div>';
  document.getElementById('btnPePlantilla').addEventListener('click', peDescargarPlantilla);
  document.getElementById('btnPeExcel').addEventListener('click', function(){ document.getElementById('peExcelInput').click(); });
  document.getElementById('peExcelInput').addEventListener('change', peImportarExcel);
  document.getElementById('btnPeGuardar').addEventListener('click', guardarPreciosEsp);
  document.getElementById('btnPeAgregar').addEventListener('click', function(){
    preciosEspLista.unshift({ sku: '', producto: '', marca: '', precioUnitario: 0, precioMayoreo: 0, minMayoreo: 0, vigenteDesde: '', vigenteHasta: '', _origSku: '', _dirty: true });
    pintarPreciosEsp();
    const p = document.querySelector('#peLista input[data-c="sku"]'); if (p) p.focus();
  });
  document.getElementById('peBuscar').addEventListener('input', function(e){ preciosEspFiltro = e.target.value; pintarPreciosEsp(); });
  const cont = document.getElementById('peLista');
  cont.addEventListener('change', function(e){
    const t = e.target, i = t.getAttribute('data-i'), c = t.getAttribute('data-c');
    if (i == null || !c) return;
    const r = preciosEspLista[Number(i)]; if (!r) return;
    if (c === 'precioUnitario' || c === 'precioMayoreo' || c === 'minMayoreo') r[c] = _numEsp(t.value);
    else r[c] = String(t.value || '').trim();
    r._dirty = true;
    t.closest('.pe-fila').classList.add('pe-sucia');
    peActualizarAviso();
  });
  cont.addEventListener('click', function(e){
    const b = e.target.closest('[data-del]'); if (!b) return;
    const r = preciosEspLista[Number(b.getAttribute('data-del'))]; if (!r) return;
    if (r._origSku) preciosEspBorrar.add(r._origSku);
    preciosEspLista.splice(Number(b.getAttribute('data-del')), 1);
    pintarPreciosEsp();
  });
  cargarPreciosEsp();
}

async function cargarPreciosEsp(){
  const av = document.getElementById('peAviso');
  if (av) av.textContent = 'Cargando…';
  preciosEspBorrar = new Set();
  try {
    if (!navigator.onLine) throw new Error('sin señal');
    const resp = await fetchConTimeout(SHEET_ENDPOINT + '?recurso=promociones');
    const lista = await resp.json();
    if (!Array.isArray(lista)) throw new Error('respuesta inválida');
    preciosEspLista = lista.filter(function(r){ return String(r.sku == null ? '' : r.sku).trim(); }).map(_filaEsp);
    if (currentTab === 'preciosesp') peActualizarAviso();
  } catch(e){
    preciosEspLista = Object.keys(promocionesCache).map(function(k){ return _filaEsp(promocionesCache[k]); });
    if (currentTab === 'preciosesp'){
      const a = document.getElementById('peAviso');
      if (a) a.textContent = 'Sin señal: se muestra lo último guardado en este dispositivo. Para guardar cambios necesitas internet.';
    }
  }
  if (currentTab === 'preciosesp') pintarPreciosEsp();
}

function peActualizarAviso(){
  const a = document.getElementById('peAviso'); if (!a) return;
  const n = preciosEspLista.filter(function(r){ return r._dirty; }).length + preciosEspBorrar.size;
  a.textContent = preciosEspLista.length + ' precios especiales' + (n ? ' · ' + n + ' cambio(s) sin guardar' : '');
}

function pintarPreciosEsp(){
  const cont = document.getElementById('peLista'); if (!cont) return;
  const q = String(preciosEspFiltro || '').trim().toLowerCase();
  const val = function(n){ return n ? n : ''; };
  const html = preciosEspLista.map(function(r, idx){ return { r: r, idx: idx }; })
    .filter(function(o){ return !q || (o.r.sku + ' ' + o.r.producto).toLowerCase().indexOf(q) !== -1; })
    .map(function(o){
      const r = o.r, i = o.idx;
      return '<div class="pe-fila' + (r._dirty ? ' pe-sucia' : '') + '">'
        + '<div class="pe-r1"><input data-i="' + i + '" data-c="sku" placeholder="SKU" value="' + escapeHtml(r.sku) + '">'
        + '<button class="vi-quitar" data-del="' + i + '" title="Quitar">✕</button></div>'
        + '<input data-i="' + i + '" data-c="producto" placeholder="Producto (opcional)" value="' + escapeHtml(r.producto) + '">'
        + '<div class="pe-grid">'
        + '<label>Precio normal<input type="number" inputmode="decimal" min="0" step="0.01" data-i="' + i + '" data-c="precioUnitario" value="' + val(r.precioUnitario) + '"></label>'
        + '<label>Mayoreo<input type="number" inputmode="decimal" min="0" step="0.01" data-i="' + i + '" data-c="precioMayoreo" value="' + val(r.precioMayoreo) + '"></label>'
        + '<label>Desde (pzs)<input type="number" inputmode="numeric" min="2" step="1" data-i="' + i + '" data-c="minMayoreo" value="' + val(r.minMayoreo) + '"></label>'
        + '</div><div class="pe-grid2">'
        + '<label>Vigente desde<input type="date" data-i="' + i + '" data-c="vigenteDesde" value="' + escapeHtml(r.vigenteDesde) + '"></label>'
        + '<label>Vigente hasta<input type="date" data-i="' + i + '" data-c="vigenteHasta" value="' + escapeHtml(r.vigenteHasta) + '"></label>'
        + '</div></div>';
    }).join('');
  cont.innerHTML = html || '<div class="empty">Sin precios especiales' + (q ? ' para esa búsqueda' : ' todavía') + '.</div>';
  peActualizarAviso();
}

function peDescargarPlantilla(){
  const enc = ['sku', 'producto', 'marca', 'precioUnitario', 'precioMayoreo', 'minMayoreo', 'vigenteDesde', 'vigenteHasta', 'eliminar'];
  const filas = preciosEspLista.filter(function(r){ return r.sku; }).map(function(r){
    return [r.sku, r.producto, r.marca, r.precioUnitario || '', r.precioMayoreo || '', r.minMayoreo || '', r.vigenteDesde, r.vigenteHasta, ''];
  });
  if (!filas.length) filas.push(['22304', 'Ejemplo de refacción', '', 140, 130, 20, '', '', '']);
  const instr = [
    ['Cómo llenar la plantilla'],
    ['sku: obligatorio. Si ya existe, la fila reemplaza a la que está guardada.'],
    ['precioUnitario: precio normal (mecánico). Reemplaza a la fórmula. Vacío = sigue la fórmula.'],
    ['precioMayoreo y minMayoreo: precio de mayoreo y desde cuántas piezas (mínimo 2). Vacíos = sin mayoreo.'],
    ['vigenteDesde / vigenteHasta: opcionales, formato AAAA-MM-DD. Vacíos = siempre vigente.'],
    ['eliminar: escribe SI para quitar ese SKU de los precios especiales.'],
    ['Después de subir el archivo revisa la lista y toca "Guardar cambios".']
  ];
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([enc].concat(filas)), 'PreciosEspeciales');
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(instr), 'Instrucciones');
  XLSX.writeFile(libro, 'plantilla_precios_especiales.xlsx');
}

async function peImportarExcel(ev){
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    let filas;
    if (/\.csv$/i.test(file.name)) filas = parseCSV(await file.text());
    else {
      const libro = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      filas = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { header: 1, raw: true, defval: '' });
    }
    if (!filas || filas.length < 2){ mostrarToast('El archivo no tiene datos'); return; }
    const enc = filas[0].map(function(h){ return String(h || '').trim().toLowerCase(); });
    const ix = function(fn){ return enc.findIndex(fn); };
    const iSku = ix(function(h){ return h.indexOf('sku') !== -1; });
    const iProd = ix(function(h){ return h.indexOf('producto') !== -1 || h.indexOf('descrip') !== -1; });
    const iMarca = ix(function(h){ return h.indexOf('marca') !== -1; });
    const iMin = ix(function(h){ return h.indexOf('min') !== -1 && h.indexOf('elimin') === -1; });
    const iMay = ix(function(h){ return h.indexOf('mayoreo') !== -1 && h.indexOf('min') === -1; });
    const iPU = ix(function(h){ return h.indexOf('unit') !== -1 || h.indexOf('mecan') !== -1 || h === 'precio'; });
    const iDes = ix(function(h){ return h.indexOf('desde') !== -1; });
    const iHas = ix(function(h){ return h.indexOf('hasta') !== -1; });
    const iDel = ix(function(h){ return h.indexOf('elimin') !== -1 || h.indexOf('borrar') !== -1; });
    if (iSku === -1){ mostrarToast('El archivo necesita al menos la columna "sku"'); return; }
    const get = function(f, i){ return i > -1 ? f[i] : ''; };
    let nuevos = 0, actualizados = 0, quitados = 0;
    filas.slice(1).forEach(function(f){
      const sku = String(f[iSku] == null ? '' : f[iSku]).trim();
      if (!sku) return;
      const k = normSkuMaps(sku);
      const pos = preciosEspLista.findIndex(function(r){ return normSkuMaps(r.sku) === k; });
      if (/^(si|sí|s|x|1|true)$/i.test(String(get(f, iDel)).trim())){
        if (pos > -1){
          if (preciosEspLista[pos]._origSku) preciosEspBorrar.add(preciosEspLista[pos]._origSku);
          preciosEspLista.splice(pos, 1); quitados++;
        }
        return;
      }
      const prev = pos > -1 ? preciosEspLista[pos] : null;
      const cat = preciosCalculados[sku] || preciosCache[sku] || {};
      const fila = {
        sku: sku,
        producto: String(get(f, iProd) || '').trim() || (prev && prev.producto) || cat.producto || '',
        marca: String(get(f, iMarca) || '').trim() || (prev && prev.marca) || '',
        precioUnitario: _numEsp(get(f, iPU)), precioMayoreo: _numEsp(get(f, iMay)), minMayoreo: _numEsp(get(f, iMin)),
        vigenteDesde: _fechaEsp(get(f, iDes)), vigenteHasta: _fechaEsp(get(f, iHas)),
        _origSku: prev ? prev._origSku : '', _dirty: true
      };
      if (prev){ preciosEspLista[pos] = fila; actualizados++; }
      else { preciosEspLista.unshift(fila); nuevos++; }
    });
    pintarPreciosEsp();
    mostrarToast('Archivo leído: ' + nuevos + ' nuevos, ' + actualizados + ' actualizados, ' + quitados + ' a quitar. Revisa y toca "Guardar cambios".');
  } catch(err){
    mostrarToast('No se pudo leer el archivo: ' + (err && err.message || err));
  }
}

async function guardarPreciosEsp(){
  if (!navigator.onLine){ mostrarToast('Sin internet: para guardar necesitas conexión'); return; }
  if (!esAdmin || !usuarioActual || !tokenActual){ mostrarToast('Inicia sesión como administrador para guardar'); return; }
  const usados = new Set(), upserts = [], mayorNoDescuento = [];
  for (const r of preciosEspLista){
    const sku = String(r.sku || '').trim();
    if (!sku){ if (r._dirty){ mostrarToast('Hay una fila sin SKU'); return; } continue; }
    const k = normSkuMaps(sku);
    if (usados.has(k)){ mostrarToast('SKU repetido: ' + sku); return; }
    usados.add(k);
    if (!r._dirty) continue;
    const pu = r.precioUnitario || 0, pm = r.precioMayoreo || 0, mn = r.minMayoreo || 0;
    if (pm > 0 && mn < 2){ mostrarToast('SKU ' + sku + ': el mayoreo necesita un mínimo de 2 piezas o más'); return; }
    if (pu <= 0 && !(pm > 0 && mn >= 2)){ mostrarToast('SKU ' + sku + ': captura el precio normal o el mayoreo'); return; }
    if (pm > 0 && pu > 0 && pm >= pu) mayorNoDescuento.push(sku);
    upserts.push({ sku: sku, producto: r.producto || '', marca: r.marca || '',
      precioUnitario: pu || '', precioMayoreo: pm || '', minMayoreo: mn || '',
      vigenteDesde: r.vigenteDesde || '', vigenteHasta: r.vigenteHasta || '', actualizadoEn: Date.now() });
  }
  const dels = new Set(preciosEspBorrar);
  preciosEspLista.forEach(function(r){ if (r._origSku && r._origSku !== r.sku) dels.add(r._origSku); });
  upserts.forEach(function(u){ dels.delete(u.sku); }); // no borrar lo que se acaba de escribir
  if (!upserts.length && !dels.size){ mostrarToast('No hay cambios que guardar'); return; }
  if (mayorNoDescuento.length && !confirm('En estos SKU el mayoreo es igual o mayor al precio normal (no sería descuento): ' + mayorNoDescuento.slice(0, 8).join(', ') + '. ¿Guardar así?')) return;
  const btn = document.getElementById('btnPeGuardar'); if (btn) btn.disabled = true;
  mostrarToast('Guardando…');
  try {
    const lote = 100, problemas = [];
    for (let i = 0; i < Math.max(upserts.length, 1); i += lote){
      const ultimo = i + lote >= upserts.length;
      const resp = await fetchConTimeout(SHEET_ENDPOINT, { method: 'POST',
        body: JSON.stringify({ recurso: 'promociones', correo: usuarioActual, token: tokenActual,
          upserts: upserts.slice(i, i + lote), deletes: ultimo ? Array.from(dels) : [] }) }, 60000);
      let rs = null; try { rs = await resp.json(); } catch(e){}
      if (!rs){ problemas.push('respuesta inválida del servidor'); break; }
      if (rs.ok === false){
        if (rs.errores) rs.errores.forEach(function(x){ problemas.push(x.id + ': ' + x.motivo); });
        else if (rs.error) problemas.push(rs.error);
        else problemas.push('el servidor no aceptó el cambio');
        if (rs.noAutorizado) break; // sin permiso: no insistir con los demás lotes
      }
    }
    if (problemas.length){ mostrarToast('No se guardó todo: ' + problemas.slice(0, 2).join(' | ')); return; }
    preciosEspBorrar = new Set();
    preciosEspLista.forEach(function(r){ r._dirty = false; r._origSku = r.sku; });
    pintarPreciosEsp();
    sincronizarPromociones(); // refresca la copia local de este dispositivo
    mostrarToast('Precios especiales guardados');
  } catch(err){
    mostrarToast('No se pudo guardar (' + (err && err.message || 'sin señal') + '). Intenta de nuevo.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

'''
ap("function escalonVigente(sku){", PANEL + "function escalonVigente(sku){")
open('index.html', 'w', encoding='utf-8').write(s)

w = open('sw.js', encoding='utf-8').read()
if w.count("rutas-gc-shell-v55") != 1: sys.exit("ERROR: no encontré rutas-gc-shell-v55 en sw.js")
open('sw.js', 'w', encoding='utf-8').write(w.replace("rutas-gc-shell-v55", "rutas-gc-shell-v56"))
print("Listo. Respaldos: index.html.bak5 y sw.js.bak5")
