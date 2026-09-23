#!/usr/bin/env python3
"""Muestra la foto de fachada (p.foto) en los popups del mapa.
Uso: python3 aplicar_parche_foto.py index.html
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


src = reemplazar(src, "function contenidoPopupSimple(p, esPrioridad){", r'''// Foto de la fachada (la que se toma en "Editar prospecto") para los popups del mapa.
function fotoPopup(p){
  if(!p.foto) return '';
  return '<img src="' + escapeHtml(p.foto) + '" alt="Fachada" style="width:100%; max-height:140px; object-fit:cover; border-radius:8px; margin-bottom:8px; display:block;">';
}

function contenidoPopupSimple(p, esPrioridad){''', "fotoPopup + funcion")

src = reemplazar(src, 'let html = `<div class="pop-simple"><b>',
                 'let html = `<div class="pop-simple">${fotoPopup(p)}<b>', "popup simple")

src = reemplazar(src, 'return `<div class="pop-res">',
                 'return `<div class="pop-res">${fotoPopup(p)}', "popup buscador")

if errores:
    print("NO se modificó nada. Falló:")
    for e in errores:
        print("  -", e)
    sys.exit(1)

shutil.copyfile(ruta, ruta + ".bak2")
if usa_crlf:
    src = src.replace("\n", "\r\n")
with open(ruta, "w", encoding="utf-8", newline="") as f:
    f.write(src)
print("Listo: foto agregada a los popups de", ruta)
