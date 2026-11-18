/**
 * spotify-despertar.gs — «Despertador» de Spotify para Maps (Google Apps Script, proyecto aparte).
 *
 * POR QUÉ EXISTE
 *   En iPhone, Spotify solo aparece como dispositivo mientras está al frente. Cuando Maps abre Spotify, Maps queda
 *   dormido y no puede mandar el «play». Esta pequeña app web hace de intermediario: Maps le avisa justo antes de
 *   saltar a Spotify; ella espera a que Spotify aparezca como dispositivo y le manda el play. Así la música empieza
 *   sola, sin depender de Maps.
 *
 * CÓMO INSTALARLO (una vez, ~3 minutos)
 *   1. Entra a script.google.com → «Nuevo proyecto» (NO lo agregues al proyecto de Prospectos & Rutas).
 *   2. Pega TODO este archivo en Código.gs y guarda.
 *   3. Implementar → Nueva implementación → tipo «Aplicación web».
 *        · Ejecutar como: Yo
 *        · Quién tiene acceso: Cualquier persona
 *      Autoriza los permisos que pida (solo usa UrlFetchApp para hablar con Spotify).
 *   4. Copia la URL que termina en /exec y pásala a Maps (CFG.despertarUrl en spotify.js).
 *
 * SEGURIDAD
 *   · No guarda nada: recibe el token de Spotify de Maps (dura 1 hora y solo sirve para controlar la reproducción),
 *     lo usa unos segundos y se descarta. No hay secrets aquí.
 *   · Solo puede hacer dos cosas: consultar dispositivos y mandar «play» con ese mismo token.
 */

var ESPERA_MAX_MS = 50000;   // cuánto espera a que Spotify despierte
var PAUSA_MS = 1200;         // cada cuánto revisa

function doPost(e) {
  var salida = { ok: false };
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!d || typeof d.t !== 'string' || !/^[A-Za-z0-9_\-\.]{20,1024}$/.test(d.t)) return json_({ ok: false, error: 'token' });
    salida = despertar_(d.t, sanear_(d.b));
  } catch (err) {
    salida = { ok: false, error: String(err && err.message || err) };
  }
  return json_(salida);
}

function doGet() { return json_({ ok: true, servicio: 'spotify-despertar' }); }   // para comprobar que está implementada

/** Deja solo los campos que Spotify acepta en «play»: nada más se reenvía. */
function sanear_(b) {
  var o = {};
  if (!b || typeof b !== 'object') return o;
  var uri = /^spotify:(playlist|album|artist|track|show|episode):[A-Za-z0-9]{10,40}$/;
  if (typeof b.context_uri === 'string' && uri.test(b.context_uri)) o.context_uri = b.context_uri;
  if (b.uris && b.uris.length && b.uris.length <= 100) {
    var l = [];
    for (var i = 0; i < b.uris.length; i++) if (typeof b.uris[i] === 'string' && uri.test(b.uris[i])) l.push(b.uris[i]);
    if (l.length) o.uris = l;
  }
  if (b.offset && typeof b.offset.uri === 'string' && uri.test(b.offset.uri)) o.offset = { uri: b.offset.uri };
  return o;
}

function despertar_(token, cuerpo) {
  var h = { Authorization: 'Bearer ' + token };
  var fin = Date.now() + ESPERA_MAX_MS, dispositivo = null, intentos = 0;
  while (Date.now() < fin) {
    intentos++;
    var r = UrlFetchApp.fetch('https://api.spotify.com/v1/me/player/devices', { headers: h, muteHttpExceptions: true });
    var c = r.getResponseCode();
    if (c === 401 || c === 403) return { ok: false, error: 'token ' + c };
    if (c === 200) {
      var ds = (JSON.parse(r.getContentText() || '{}').devices) || [];
      if (ds.length) {
        for (var i = 0; i < ds.length; i++) if (ds[i].is_active) { dispositivo = ds[i]; break; }
        if (!dispositivo) {   // preferir el teléfono sobre otros equipos
          for (var j = 0; j < ds.length; j++) if (/smartphone|tablet/i.test(ds[j].type || '')) { dispositivo = ds[j]; break; }
        }
        if (!dispositivo) dispositivo = ds[0];
        break;
      }
    }
    Utilities.sleep(PAUSA_MS);
  }
  if (!dispositivo) return { ok: false, error: 'Spotify no despertó', intentos: intentos };
  var p = UrlFetchApp.fetch('https://api.spotify.com/v1/me/player/play?device_id=' + encodeURIComponent(dispositivo.id), {
    method: 'put', contentType: 'application/json', headers: h, payload: JSON.stringify(cuerpo), muteHttpExceptions: true });
  var pc = p.getResponseCode();
  if (pc === 202 || pc === 204 || pc === 200) return { ok: true, dispositivo: dispositivo.name, intentos: intentos };
  // «Spotify acaba de despertar»: a veces el primer play se rechaza; un segundo intento corto suele bastar
  Utilities.sleep(1500);
  var p2 = UrlFetchApp.fetch('https://api.spotify.com/v1/me/player/play?device_id=' + encodeURIComponent(dispositivo.id), {
    method: 'put', contentType: 'application/json', headers: h, payload: JSON.stringify(cuerpo), muteHttpExceptions: true });
  var c2 = p2.getResponseCode();
  return { ok: c2 === 202 || c2 === 204 || c2 === 200, dispositivo: dispositivo.name, codigo: c2, intentos: intentos };
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
