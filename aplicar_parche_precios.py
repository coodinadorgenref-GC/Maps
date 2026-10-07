# Aplica: precio de AlmacenMovil sobre fórmula + caché de precios v3 + sw.js v55
import shutil, sys

def cambiar(ruta, viejo, nuevo, veces=1):
    s = open(ruta, encoding='utf-8').read()
    n = s.count(viejo)
    if n != veces:
        sys.exit(f"ERROR en {ruta}: se esperaba {veces} coincidencia(s) y hay {n}. No se cambió nada de este bloque:\n{viejo[:80]}...")
    open(ruta, 'w', encoding='utf-8').write(s.replace(viejo, nuevo))

shutil.copy('index.html', 'index.html.bak4')
shutil.copy('sw.js', 'sw.js.bak4')

cambiar('index.html',
"""  const pc = preciosCalculados[k];
  if(pc) return {""",
"""  const pc = preciosCalculados[k];
  // Venta normal: si el SKU está en el almacén móvil con precio propio (AlmacenMovil), ese precio manda
  // sobre el calculado por fórmula. La liquidación sí conserva su precio calculado.
  if(pc && !esPedido && !pc.liquidacion && prop && Number(prop.precioUnitario) > 0){
    return { producto: pc.producto || (pr && pr.producto) || prop.producto || '', precio: Number(prop.precioUnitario), liquidacion: false };
  }
  if(pc) return {""")

cambiar('index.html', "const PRECIOS_VENTA_KEY = 'gc_precios_venta_v1';", "const PRECIOS_VENTA_KEY = 'gc_precios_venta_v3';")
cambiar('index.html', "const PRECIOS_VENTA_KEY2 = 'gc_precios_venta_v2';", "const PRECIOS_VENTA_KEY2 = 'gc_precios_venta_v3';")
cambiar('sw.js', "rutas-gc-shell-v54", "rutas-gc-shell-v55")
print("Listo. Respaldos: index.html.bak4 y sw.js.bak4")
