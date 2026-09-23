/* nota-venta.js — Nota de venta en PDF para Prospectos & Rutas GC
   Versión navegador: requiere jsPDF cargado antes (window.jspdf).
   Logo opcional: define window.LOGO_CARABELA_PNG = 'data:image/png;base64,...' */

/* ---------- Número a letras (pesos mexicanos) ---------- */
(function () {
  const UNI = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  const VEI = ['VEINTE', 'VEINTIUNO', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
  const DEC = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const CEN = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  function menor1000(n) {
    if (n === 0) return '';
    if (n === 100) return 'CIEN';
    const c = Math.floor(n / 100), r = n % 100, p = [];
    if (c) p.push(CEN[c]);
    if (r > 0) {
      if (r < 20) p.push(UNI[r]);
      else if (r < 30) p.push(VEI[r - 20]);
      else {
        const d = Math.floor(r / 10), u = r % 10;
        p.push(u ? DEC[d] + ' Y ' + UNI[u] : DEC[d]);
      }
    }
    return p.join(' ');
  }
  const apocope = function (s) { return s.replace(/UNO$/, 'UN'); };

  window.numeroALetrasMX = function (valor) {
    const entero = Math.floor(valor);
    const cents = Math.round((valor - entero) * 100);
    const millones = Math.floor(entero / 1000000);
    const miles = Math.floor((entero % 1000000) / 1000);
    const resto = entero % 1000;
    const partes = [];
    if (millones) partes.push(millones === 1 ? 'UN MILLON' : apocope(menor1000(millones)) + ' MILLONES');
    if (miles) partes.push(miles === 1 ? 'MIL' : apocope(menor1000(miles)) + ' MIL');
    if (resto) partes.push(menor1000(resto));
    const letras = apocope(partes.join(' ') || 'CERO');
    const moneda = entero === 1 ? 'PESO' : (millones && !miles && !resto ? 'DE PESOS' : 'PESOS');
    return letras + ' ' + moneda + ' ' + String(cents).padStart(2, '0') + '/100 M.N.';
  };
})();

/* ---------- Total: siempre redondeado hacia arriba al peso ----------
   Se suma en centavos enteros para evitar errores de punto flotante. */
function totalRedondeado(items) {
  const centavos = (items || []).reduce(function (s, it) {
    return s + Math.round((Number(it.cantidad) || 0) * (Number(it.precio) || 0) * 100);
  }, 0);
  return Math.ceil(centavos / 100);
}

const EXISTENCIA_NOTA = { movil: 'ALM. MÓVIL', pedido: 'PEDIDO' };

/* ---------- PDF: devuelve el objeto jsPDF (usa .output('blob') para compartir) ---------- */
function generarPdfNotaVenta(venta) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const PW = 215.9, MX = 14, TW = PW - 2 * MX;
  const ROJO = [176, 22, 34];
  let y = 14;

  // ---- Encabezado ----
  if (window.LOGO_CARABELA_PNG) {
    try { doc.addImage(window.LOGO_CARABELA_PNG, 'PNG', MX, y - 2, 42, 8.02); } catch (e) {}
  } else {
    doc.setFont(undefined, 'bold'); doc.setFontSize(12);
    doc.text('CARABELA', MX, y + 3);
  }
  doc.setFont(undefined, 'bold'); doc.setFontSize(10);
  doc.text('Carabela Valladolid', PW / 2, y + 1, { align: 'center' });
  doc.setFont(undefined, 'normal'); doc.setFontSize(8);
  doc.text('C. 41 x 34, Sta Ana, 97780 Valladolid, Yuc.', PW / 2, y + 5, { align: 'center' });
  doc.setFont(undefined, 'bold'); doc.setFontSize(9);
  doc.text('VENTA EN RUTA', PW - MX, y, { align: 'right' });
  doc.setFontSize(8); doc.setFont(undefined, 'normal');
  doc.text('DEPTO. DE REFACCIONES', PW - MX, y + 4, { align: 'right' });
  y += 12;

  // ---- Barra de título ----
  doc.setFillColor(ROJO[0], ROJO[1], ROJO[2]);
  doc.rect(MX, y, TW, 6.5, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont(undefined, 'bold'); doc.setFontSize(11);
  doc.text('NOTA DE VENTA', PW / 2, y + 4.6, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 11;

  // ---- Folio (la caja se ajusta al largo del folio) ----
  doc.setFont(undefined, 'bold'); doc.setFontSize(9);
  const folioTxt = String(venta.folio || '');
  const folioW = Math.max(24, doc.getTextWidth(folioTxt) + 6);
  doc.text('Folio:', PW - MX - folioW - 2, y, { align: 'right' });
  doc.setDrawColor(ROJO[0], ROJO[1], ROJO[2]); doc.setLineWidth(0.4);
  doc.rect(PW - MX - folioW, y - 4, folioW, 5.5);
  doc.setTextColor(ROJO[0], ROJO[1], ROJO[2]);
  doc.text(folioTxt, PW - MX - folioW / 2, y - 0.5, { align: 'center' });
  doc.setTextColor(0, 0, 0); doc.setDrawColor(0, 0, 0);
  y += 3;

  // ---- Fecha / Cliente / Teléfono / Vendedor ----
  const fecha = new Date(venta.fechaLocal || Date.now()).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.setFontSize(9);
  function campo(label, valor, yy) {
    doc.setFont(undefined, 'bold'); doc.text(label, MX, yy);
    const lx = MX + doc.getTextWidth(label) + 1.5;
    doc.setFont(undefined, 'normal'); doc.text(String(valor || ''), lx, yy);
    doc.setLineWidth(0.15);
    doc.line(lx - 1, yy + 1, PW - MX, yy + 1);
  }
  let fy = y + 4;
  campo('Fecha:', fecha, fy); fy += 6;
  campo('Cliente:', venta.cliente, fy); fy += 6;
  if (venta.negocio) { campo('Negocio:', venta.negocio, fy); fy += 6; }
  campo('Teléfono:', venta.telefono, fy); fy += 6;
  campo('Vendedor:', venta.vendedorNombre || venta.vendedor, fy);
  y = fy + 6;

  // ---- Columnas ----
  const c = {};
  let cx = MX;
  const fijo = { cant: 14, sku: 24, exist: 26, precio: 24, importe: 24 };
  const anchoProd = TW - (fijo.cant + fijo.sku + fijo.exist + fijo.precio + fijo.importe);
  [['cant', fijo.cant], ['sku', fijo.sku], ['prod', anchoProd], ['exist', fijo.exist], ['precio', fijo.precio], ['importe', fijo.importe]]
    .forEach(function (p) { c[p[0]] = { x: cx, w: p[1] }; cx += p[1]; });
  const centro = function (col) { return col.x + col.w / 2; };
  const derecha = function (col) { return col.x + col.w - 2; };

  // ---- Encabezado de tabla ----
  const filaH = 6.2;
  const tablaTop = y;
  doc.setFillColor(20, 20, 20);
  doc.rect(MX, y, TW, filaH, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont(undefined, 'bold'); doc.setFontSize(8);
  doc.text('CANT.', centro(c.cant), y + 4.2, { align: 'center' });
  doc.text('SKU', centro(c.sku), y + 4.2, { align: 'center' });
  doc.text('PRODUCTO', c.prod.x + 2, y + 4.2);
  doc.text('EXISTENCIA', centro(c.exist), y + 4.2, { align: 'center' });
  doc.text('PRECIO UNI.', derecha(c.precio), y + 4.2, { align: 'right' });
  doc.text('IMPORTE', derecha(c.importe), y + 4.2, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  y += filaH;
  const cuerpoTop = y;

  // ---- Filas ----
  const items = venta.items || [];
  const totalFilas = Math.max(12, items.length);
  doc.setFont(undefined, 'normal');
  for (let i = 0; i < totalFilas; i++) {
    doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.1);
    doc.rect(MX, y, TW, filaH);
    const it = items[i];
    if (it) {
      const precio = Number(it.precio) || 0, cant = Number(it.cantidad) || 0;
      doc.setFontSize(8.5);
      doc.text(String(cant), centro(c.cant), y + 4.2, { align: 'center' });
      doc.text(String(it.sku || ''), centro(c.sku), y + 4.2, { align: 'center' });
      // El nombre largo se achica hasta 6.5 pt para que quepa en una línea
      let fs = 8.5, prodTxt = String(it.producto || '');
      doc.setFontSize(fs);
      while (doc.getTextWidth(prodTxt) > c.prod.w - 4 && fs > 6.5) { fs -= 0.5; doc.setFontSize(fs); }
      if (doc.getTextWidth(prodTxt) > c.prod.w - 4) prodTxt = doc.splitTextToSize(prodTxt, c.prod.w - 4)[0];
      doc.text(prodTxt, c.prod.x + 2, y + 4.2);
      doc.setFontSize(8);
      doc.text(EXISTENCIA_NOTA[it.existencia] || '', centro(c.exist), y + 4.2, { align: 'center' });
      doc.setFontSize(8.5);
      doc.text('$' + precio.toFixed(2), derecha(c.precio), y + 4.2, { align: 'right' });
      doc.text('$' + (cant * precio).toFixed(2), derecha(c.importe), y + 4.2, { align: 'right' });
    }
    y += filaH;
  }
  const tablaBottom = y;

  // ---- Líneas verticales ----
  const seps = [c.sku, c.prod, c.exist, c.precio, c.importe];
  doc.setLineWidth(0.1);
  doc.setDrawColor(90, 90, 90);
  seps.forEach(function (col) { doc.line(col.x, tablaTop, col.x, cuerpoTop); });
  doc.setDrawColor(150, 150, 150);
  seps.forEach(function (col) { doc.line(col.x, cuerpoTop, col.x, tablaBottom); });
  doc.setDrawColor(0, 0, 0);
  y += 2;

  // ---- Total en letras + TOTAL ----
  const total = totalRedondeado(items);
  const anchoTotal = 50;
  const letrasW = TW - anchoTotal - 4;
  doc.setFont(undefined, 'italic'); doc.setFontSize(8);
  const letrasLineas = doc.splitTextToSize(window.numeroALetrasMX(total), letrasW - 4);
  const inter = 3.3;
  const cajaH = Math.max(6.5, letrasLineas.length * inter + 3);
  doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.1);
  doc.rect(MX, y, letrasW, cajaH);
  doc.text(letrasLineas, MX + letrasW / 2, y + (cajaH - (letrasLineas.length - 1) * inter) / 2 + 1, { align: 'center' });

  doc.setFillColor(20, 20, 20);
  doc.rect(PW - MX - anchoTotal, y, 22, cajaH, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont(undefined, 'bold'); doc.setFontSize(8.5);
  doc.text('TOTAL', PW - MX - anchoTotal + 11, y + cajaH / 2 + 1.2, { align: 'center' });
  doc.setTextColor(0, 0, 0); doc.setFontSize(9.5);
  doc.rect(PW - MX - 28, y, 28, cajaH);
  doc.text('$' + total.toFixed(2), PW - MX - 2, y + cajaH / 2 + 1.2, { align: 'right' });
  doc.setDrawColor(0, 0, 0);
  y += cajaH + 6;

  // ---- Notas ----
  doc.setFillColor(ROJO[0], ROJO[1], ROJO[2]);
  doc.rect(MX, y, TW, 4.5, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont(undefined, 'bold'); doc.setFontSize(8);
  doc.text('NOTAS:', PW / 2, y + 3.2, { align: 'center' });
  doc.setTextColor(0, 0, 0); doc.setFont(undefined, 'normal'); doc.setFontSize(7.5);
  y += 4.5;
  [
    'Esta nota de venta ampara la entrega de los productos aquí descritos, ya cobrados en su totalidad o bajo el crédito autorizado.',
    'Una vez entregada la pieza, no hay cancelaciones ni devoluciones.',
    'No hay cancelaciones ni devoluciones en refacciones eléctricas.'
  ].forEach(function (n) { doc.text(n, PW / 2, y + 3, { align: 'center' }); y += 3.6; });
  y += 1;

  // ---- Forma de pago ----
  doc.setFillColor(ROJO[0], ROJO[1], ROJO[2]);
  doc.rect(MX, y, TW, 4.5, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont(undefined, 'bold'); doc.setFontSize(8);
  doc.text('FORMA DE PAGO', PW / 2, y + 3.2, { align: 'center' });
  doc.setTextColor(0, 0, 0); doc.setFontSize(8.5);
  y += 8;
  const metodos = { efectivo: 'EFECTIVO', transferencia: 'TRANSFERENCIA', msi: 'TARJETA DE CRÉDITO / MESES SIN INTERESES' };
  let linea = metodos[venta.metodoPago] || String(venta.metodoPago || '').toUpperCase();
  if (venta.metodoPago === 'transferencia' && venta.referencia) linea += '  —  Ref: ' + venta.referencia;
  if (venta.metodoPago === 'msi' && venta.mesesMsi) linea += '  —  ' + venta.mesesMsi + ' meses sin intereses';
  doc.text(linea, PW / 2, y, { align: 'center' });
  y += 10;

  // ---- Pie ----
  doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.15);
  doc.line(MX, y, PW - MX, y);
  y += 5;
  doc.setFont(undefined, 'normal'); doc.setFontSize(7.5);
  doc.text('Email: refaccionesv@casacamejo.com.mx', MX, y);
  doc.text('Tel: 985 856 19 76   ·   WhatsApp: 985 101 8239', MX, y + 4);
  doc.setFont(undefined, 'bold');
  doc.text('Vendedor: ' + (venta.vendedorNombre || venta.vendedor || ''), PW - MX, y, { align: 'right' });
  doc.setFont(undefined, 'normal');
  doc.text('Folio: ' + folioTxt, PW - MX, y + 4, { align: 'right' });

  return doc;
}
