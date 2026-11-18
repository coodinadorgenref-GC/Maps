/* spotify.js — «Música» en Maps: control remoto de Spotify.
   La música suena en la app de Spotify (o en el navegador de la PC); Maps solo la CONTROLA: play, pausa,
   siguiente, anterior y playlists. No reproduce audio dentro de la PWA: el Web Playback SDK de Spotify no es
   fiable en iPhone y se detiene al pasar a segundo plano, así que en iOS la app de Spotify tiene que existir
   como dispositivo (basta con abrirla una vez; mientras suena música sigue activa aunque Maps esté cerrado).

   · Inicio de sesión PKCE (sin secret): el repo es público, por eso aquí solo existe el Client ID.
   · Requiere Spotify Premium (en modo desarrollo, además, la cuenta dueña de la app debe ser Premium
     y solo pueden entrar las cuentas agregadas en «User Management» del panel de Spotify).
   · Carga después de index.html. Usa globales de Maps (usuarioActual, esAdmin, mostrarToast) solo al
     ejecutarse, nunca al cargar. */
(function () {
'use strict';

/* ───────────── Configuración ───────────── */
const CFG = {
  // Client ID de la app en developer.spotify.com/dashboard (32 caracteres). NUNCA el «Client secret».
  // También se puede pegar desde el panel de Música (se guarda solo en ese dispositivo).
  clientId: '8e38f253e0524ab8879e698e64bf11da',
  // 'admin' = solo cuentas de administración · 'todos' = cualquier usuario con sesión iniciada.
  visible: 'admin',
  // URL de la app web de Apps Script «spotify-despertar.gs» (ver ese archivo). Vacía = sin servidor: solo se reintenta desde Maps.
  despertarUrl: 'https://script.google.com/macros/s/AKfycby1wCdyQf50VZl1RxZ6ujPY5ISlUYJ3cEO6W7ckbA6wNUBjAKLStc96xHaFSpKkZhBX/exec',
  scopes: 'user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative user-read-recently-played user-top-read'
};
// Debe coincidir EXACTO (mayúsculas incluidas) con el Redirect URI registrado en el panel de Spotify.
const REDIRECT = (location.origin + location.pathname).replace(/index\.html$/, '');

const LS_TOKEN = 'gc_spotify_v1', LS_PKCE = 'gc_spotify_pkce_v1', LS_CID = 'gc_spotify_cid_v1', LS_PEND = 'gc_spotify_pend_v1', LS_ORD = 'gc_spotify_orden_v1', LS_ULT = 'gc_spotify_ult_v1', LS_REAB = 'gc_spotify_reabrir_v1', LS_SRV = 'gc_spotify_srv_v1';
const URL_TOKEN = 'https://accounts.spotify.com/api/token', URL_API = 'https://api.spotify.com/v1';

/* ───────────── Utilidades ───────────── */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = m => { try { mostrarToast(m); } catch (e) {} };
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
const lsDel = k => { try { localStorage.removeItem(k); } catch (e) {} };
const clientId = () => CFG.clientId || (lsGet(LS_CID) || '').trim();
const idValido = s => /^[0-9a-f]{32}$/i.test(String(s || '').trim());
function permitido() {
  try { if (CFG.visible === 'todos') return !!usuarioActual; return typeof esAdmin !== 'undefined' && !!esAdmin; }
  catch (e) { return false; }
}
const fmt = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

const IC = {
  nota: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  pausa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
  sig: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>',
  ant: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h2v12H6zM9.5 12l8.5 6V6z"/></svg>',
  cerrar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
  der: '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>',
  atras: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>'
};

/* ───────────── Inicio de sesión (PKCE) ───────────── */
const b64u = buf => btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function aleatorio(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return b64u(a).slice(0, n); }
async function desafio(v) { return b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))); }

async function conectar() {
  const cid = clientId();
  if (!cid) { toast('Falta el Client ID de Spotify.'); return; }
  if (!(window.crypto && crypto.subtle)) { toast('Este navegador no permite iniciar sesión con Spotify (requiere HTTPS).'); return; }
  const verificador = aleatorio(96), estado = aleatorio(24);
  if (!lsSet(LS_PKCE, JSON.stringify({ v: verificador, s: estado, t: Date.now() }))) { toast('No se pudo guardar el inicio de sesión en este dispositivo.'); return; }
  const q = new URLSearchParams({ response_type: 'code', client_id: cid, scope: CFG.scopes, redirect_uri: REDIRECT, state: estado,
                                  code_challenge_method: 'S256', code_challenge: await desafio(verificador) });
  location.href = 'https://accounts.spotify.com/authorize?' + q.toString();
}

async function pedirToken(params) {
  const r = await fetch(URL_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(Object.assign({ client_id: clientId() }, params)) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) { const e = new Error(j.error_description || j.error || ('HTTP ' + r.status)); e.codigo = j.error || ''; throw e; }
  return j;
}
const leerToken = () => { try { return JSON.parse(lsGet(LS_TOKEN) || 'null'); } catch (e) { return null; } };
function guardarToken(j, previo) {
  lsSet(LS_TOKEN, JSON.stringify({ s: j.scope || (previo && previo.s) || '', a: j.access_token, r: j.refresh_token || (previo && previo.r) || '', e: Date.now() + (Number(j.expires_in) || 3600) * 1000 - 30000 }));
}
const tieneEscucha = () => { const t = leerToken(), c = (t && t.s) || ''; return /user-top-read/.test(c) && /user-read-recently-played/.test(c); };
async function tokenValido() {
  const t = leerToken(); if (!t) return null;
  if (Date.now() < t.e) return t.a;
  if (!t.r) { desconectar(true); return null; }
  try { guardarToken(await pedirToken({ grant_type: 'refresh_token', refresh_token: t.r }), t); return leerToken().a; }
  catch (e) { if (e.codigo === 'invalid_grant') { desconectar(true); } return null; }   // sin señal: se conserva la sesión y se reintenta
}
function desconectar(silencioso) {
  lsDel(LS_TOKEN); S.esc = null; S.ctx = null; S.est = null; S.listas = null; S.listasErr = ''; S.lista = ''; S.pistas = {};
  if (!silencioso) toast('Spotify desconectado de Maps.');
  pintar();
}

/** Al volver de Spotify la URL trae ?code=…&state=…: se canjea por el token y se limpia la dirección. */
async function procesarRetorno() {
  const q = new URLSearchParams(location.search);
  if ((!q.has('code') && !q.has('error')) || !q.has('state')) return;   // otros enlaces con ?code= no son de Spotify
  const codigo = q.get('code'), estado = q.get('state'), error = q.get('error');
  try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
  let pk = null; try { pk = JSON.parse(lsGet(LS_PKCE) || 'null'); } catch (e) {} lsDel(LS_PKCE);
  if (error) { toast('Spotify no autorizó la conexión.'); return; }
  if (!pk || pk.s !== estado || Date.now() - pk.t > 10 * 60 * 1000) {
    toast('No se pudo completar la conexión. Abre Maps desde su ícono de inicio e inténtalo de nuevo.'); return;
  }
  try {
    guardarToken(await pedirToken({ grant_type: 'authorization_code', code: codigo, redirect_uri: REDIRECT, code_verifier: pk.v }));
    toast('Spotify conectado.');
    esperarSesionYAbrir();
  } catch (e) { toast('No se pudo conectar con Spotify: ' + (e.message || 'error desconocido')); }
}
function esperarSesionYAbrir(l) {   // la sesión de Maps tarda un momento en restaurarse tras recargar
  let n = 0; const iv = setInterval(() => { if (permitido()) { clearInterval(iv); abrir(l); } else if (++n > 40) clearInterval(iv); }, 500);
}

/* ───────────── API de Spotify ───────────── */
const S = { est: null, t0: 0, listas: null, listasErr: '', cargandoListas: false, abierto: false, pausa: 0, vista: '', foco: null,
            lista: '', filtro: '', marca: null, pistas: {}, reintentando: false,
            orden: lsGet(LS_ORD) === 'original' ? 'original' : 'top', esc: null, ctx: null, escTs: 0, escCargando: false, dormido: false, tDisp: 0 };

const esperar = ms => new Promise(r => setTimeout(r, ms));
async function api(metodo, ruta, cuerpo) {
  const tk = await tokenValido();
  if (!tk) { const e = new Error('Sin sesión de Spotify'); e.status = 401; throw e; }
  let r, intento = 0;
  for (;;) {   // «Bad gateway» y cortes de red son pasajeros: se reintenta (las órdenes POST no, para no saltar dos canciones)
    try {
      r = await fetch(URL_API + ruta, { method: metodo,
        headers: Object.assign({ Authorization: 'Bearer ' + tk }, cuerpo ? { 'Content-Type': 'application/json' } : {}),
        body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    } catch (err) {
      if (metodo !== 'POST' && intento++ < 2) { await esperar(600 * intento); continue; }
      const e = new Error('Sin conexión'); e.red = true; throw e;
    }
    if (r.status >= 502 && r.status <= 504 && metodo !== 'POST' && intento++ < 2) { await esperar(700 * intento); continue; }
    break;
  }
  if (r.status === 429) { S.pausa = Date.now() + (Number(r.headers.get('Retry-After')) || 5) * 1000; }
  if (r.status === 204) return null;
  const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) {}
  if (!r.ok) {
    const e = new Error((j && j.error && (j.error.message || j.error)) || ('HTTP ' + r.status));
    e.status = r.status; e.razon = (j && j.error && j.error.reason) || ''; throw e;
  }
  return j;
}
function textoError(e) {
  if (e && e.sinDispositivo) return 'Spotify está dormido en tu celular (iOS lo duerme en segundo plano cuando no hay música). Toca «Abrir Spotify», regresa a Maps y se reproducirá sola.';
  if (e && (e.razon === 'PREMIUM_REQUIRED' || (e.status === 403 && /premium/i.test(e.message || '')))) return 'Controlar la reproducción requiere Spotify Premium (los planes Lite y Mini no sirven).';
  if (e && e.status === 401) return 'La sesión de Spotify caducó. Conéctala de nuevo.';
  if (e && e.status === 403 && /restriction/i.test(e.message || '')) return 'Spotify no permite esa acción en este momento.';
  if (e && e.status === 403) return 'Spotify no autorizó esta acción. Si es una cuenta nueva, agrégala en «User Management» del panel de la app.';
  if (e && e.status === 429) return 'Spotify pide esperar unos segundos. Inténtalo otra vez.';
  if (e && (e.status === 404)) return 'Spotify no encontró un dispositivo activo.';
  if (e && e.red) return 'Sin conexión. Revisa tu señal e inténtalo de nuevo.';
  if (e && e.status >= 500) return 'Spotify tuvo un fallo temporal. Inténtalo de nuevo en unos segundos.';
  return 'No se pudo hablar con Spotify (' + ((e && e.message) || 'error') + ').';
}

async function refrescar() {
  try {
    const j = await api('GET', '/me/player');
    const it = j && j.item;
    S.est = it ? {
      playing: !!j.is_playing, titulo: it.name || '',
      artista: (it.artists || []).map(a => a.name).join(', ') || (it.show && it.show.name) || '',
      uri: it.uri || '', dur: Number(it.duration_ms) || 0, pos: Number(j.progress_ms) || 0,
      disp: (j.device && j.device.name) || '',
      img: (function () { const im = (it.album && it.album.images) || it.images || []; return (im[1] || im[0] || {}).url || ''; })(),
      url: (it.external_urls && it.external_urls.spotify) || ''
    } : null;
    S.t0 = Date.now(); S.error = '';
  } catch (e) { S.error = e && e.status && e.status < 500 ? textoError(e) : ''; if (e && e.status === 401) S.est = null; }
  if (S.est) S.dormido = false;
  else if (leerToken() && (S.abierto || S.dormido || leerPend()) && Date.now() - S.tDisp > 15000) await verDispositivos();
  pintar();
}
const posActual = () => !S.est ? 0 : Math.min(S.est.dur, S.est.pos + (S.est.playing ? Date.now() - S.t0 : 0));

async function reproducir(cuerpo) {
  try { await api('PUT', '/me/player/play', cuerpo); }
  catch (e) {
    if (e.status !== 404 && e.razon !== 'NO_ACTIVE_DEVICE') throw e;
    const d = await api('GET', '/me/player/devices'), lista = (d && d.devices) || [];
    const disp = lista.find(x => x.is_active) || lista[0];
    if (!disp) { const err = new Error('Sin dispositivo'); err.sinDispositivo = true; throw err; }
    await api('PUT', '/me/player/play?device_id=' + encodeURIComponent(disp.id), cuerpo);
  }
}
/* Acción pendiente: iOS duerme la app de Spotify en segundo plano y entonces deja de aparecer como dispositivo.
   Si pasa, se guarda lo que se pidió; al volver de Spotify (botón «Abrir Spotify») se reintenta sola. */
const leerPend = () => { try { const p = JSON.parse(lsGet(LS_PEND) || 'null'); return p && Date.now() - p.t < 5 * 60 * 1000 ? p : null; } catch (e) { return null; } };
const guardarPend = p => { if (p) lsSet(LS_PEND, JSON.stringify(p)); else lsDel(LS_PEND); };
const esSinDispositivo = e => !!e && (e.sinDispositivo || e.status === 404);
/* «Salto» a Spotify, como hace Nike Run Club con el SDK nativo: iOS solo deja despertar a Spotify abriéndolo un instante.
   Debe lanzarse dentro del toque del usuario. Al volver a Maps (botón « Maps de arriba a la izquierda) se reintenta sola. */
/* Spotify solo aparece como dispositivo mientras está al frente, y entonces Maps está dormido. Por eso, justo antes de saltar,
   se le encarga a un pequeño servidor (Apps Script) que espere a que Spotify despierte y le mande el «play». */
function cuerpoPlay(tipo, extra, extra2) {
  if (tipo === 'uris') return { uris: extra };
  if (tipo === 'lista') return { context_uri: extra };
  if (tipo === 'pista') return { context_uri: extra, offset: { uri: extra2 } };
  return {};
}
function avisarServidor(tipo, extra, extra2) {
  const url = (CFG.despertarUrl || lsGet(LS_SRV) || '').trim(), t = leerToken();
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url) || !t || t.e - Date.now() < 120000) return false;   // el token debe durar lo que el servidor espera
  try {
    fetch(url, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                 body: JSON.stringify({ t: t.a, b: cuerpoPlay(tipo, extra, extra2) }) }).catch(() => {});
    return true;
  } catch (e) { return false; }
}
function irASpotify(uri) {
  lsSet(LS_REAB, JSON.stringify({ t: Date.now(), l: S.lista }));
  const a = document.createElement('a'); a.href = uri; a.rel = 'noopener'; a.style.display = 'none';
  document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 600);
}
async function verDispositivos() {   // ¿Spotify está despierto como dispositivo? (iOS lo duerme al pasar a segundo plano sin música)
  S.tDisp = Date.now();
  try { const d = await api('GET', '/me/player/devices'); S.dormido = !((d && d.devices) || []).length; } catch (e) {}
}
// A dónde llevar a Spotify: a la playlist o canción que se pidió (o a la app, si fue play/pausa).
const uriApp = (tipo, extra, extra2) => tipo === 'pista' || tipo === 'uris' ? (extra2 || 'spotify:') : tipo === 'lista' ? (extra || 'spotify:') : 'spotify:';
function ejecutar(tipo, extra, extra2) {
  if (tipo === 'uris') return reproducir({ uris: extra });
  if (tipo === 'lista') return reproducir({ context_uri: extra });
  if (tipo === 'pista') return reproducir({ context_uri: extra, offset: { uri: extra2 } });
  return reproducir();
}
async function accion(tipo, extra, extra2) {
  setMsg(''); guardarPend(null);
  if (S.dormido && (tipo === 'pp' || tipo === 'lista' || tipo === 'pista' || tipo === 'uris') && !(S.est && S.est.playing)) {
    const srv = avisarServidor(tipo, extra, extra2);   // Spotify duerme: se avisa al servidor y se salta directo, sin pasos intermedios
    guardarPend({ tipo, extra, extra2, t: Date.now(), srv });
    setMsg(srv ? 'Abriendo Spotify… sonará sola. Para volver toca « Maps (arriba a la izquierda).' : 'Abriendo Spotify… regresa con « Maps (arriba a la izquierda) y empezará sola.');
    irASpotify(uriApp(tipo, extra, extra2));
    return;
  }
  try {
    if (tipo === 'pp') {
      if (S.est && S.est.playing) { await api('PUT', '/me/player/pause'); S.est.pos = posActual(); S.est.playing = false; S.t0 = Date.now(); }
      else { await reproducir(); if (S.est) { S.est.playing = true; S.t0 = Date.now(); } }
    } else if (tipo === 'sig') await api('POST', '/me/player/next');
    else if (tipo === 'ant') await api('POST', '/me/player/previous');
    else if (tipo === 'lista' || tipo === 'pista' || tipo === 'uris') await ejecutar(tipo, extra, extra2);
    S.dormido = false; pintar();
    setTimeout(refrescar, 800);   // Spotify tarda un instante en reflejar el cambio
  } catch (e) {
    const sin = esSinDispositivo(e) && (tipo === 'pp' || tipo === 'lista' || tipo === 'pista' || tipo === 'uris');
    if (sin) { guardarPend({ tipo, extra, extra2, t: Date.now() }); S.dormido = true; }
    S.marca = null; marcarActual();
    const msg = textoError(sin ? { sinDispositivo: true } : e);
    setMsg(msg, sin ? uriApp(tipo, extra, extra2) : '');
    if (!S.abierto) toast(msg);
  }
}
/** Al volver a Maps (o recargar) con una acción pendiente: reintenta unos segundos, porque Spotify tarda en despertar. */
async function reintentarPendiente() {
  const p = leerPend(); if (!p || S.reintentando || !leerToken()) return;
  S.reintentando = true; guardarPend(null);
  try {
    setMsg('Esperando a que Spotify despierte…');
    for (const espera of [250, 600, 900, 1200, 1500, 2000, 2000, 2000, 3000, 3000, 3000]) {   // ~20 s: Spotify sigue vivo unos segundos al pasar a segundo plano
      await new Promise(r => setTimeout(r, espera));
      if (p.srv) { try { const j = await api('GET', '/me/player'); if (j && j.is_playing) { S.dormido = false; setMsg(''); setTimeout(refrescar, 300); return; } } catch (e) {} }
      try { await ejecutar(p.tipo, p.extra, p.extra2); S.dormido = false; setMsg(''); setTimeout(refrescar, 800); return; }
      catch (e) { if (!esSinDispositivo(e)) { setMsg(textoError(e)); return; } }
    }
    S.dormido = true;
    setMsg('Spotify no despertó. Toca el botón verde: se abrirá en esa playlist y, si no arranca sola, pulsa ▶ allí.', uriApp(p.tipo, p.extra, p.extra2));
    guardarPend(p);
  } finally { S.reintentando = false; }
}
async function cargarListas() {
  if (S.listas || S.cargandoListas || !leerToken()) return;
  S.cargandoListas = true; pintarListas();
  try { const j = await api('GET', '/me/playlists?limit=50'); S.listas = ((j && j.items) || []).filter(Boolean); S.listasErr = ''; }
  catch (e) { S.listas = null; S.listasErr = 'No se pudieron cargar tus playlists. Puedes seguir usando los controles.'; }
  S.cargandoListas = false; pintarListas();
}

/* ───────────── Lo que más escuchas (recientes) ───────────── */
/* Puntos por canción: top de ~4 semanas (más peso) + top de ~6 meses + últimas 50 reproducciones (más reciente = más puntos).
   Las playlists se ordenan por la última vez que se oyeron (Spotify indica de qué playlist venía cada reproducción;
   lo que se toca desde Maps también se anota en este celular). */
const ultLs = () => { try { return JSON.parse(lsGet(LS_ULT) || '{}') || {}; } catch (e) { return {}; } };
function anotarUltima(idLista) {
  const pl = (S.listas || []).find(x => x.id === idLista); if (!pl) return;
  const u = ultLs(); u[pl.uri] = Date.now(); lsSet(LS_ULT, JSON.stringify(u));
}
async function cargarEscuchas(forzar) {
  if (S.escCargando || !leerToken() || !tieneEscucha()) return;
  if (S.esc && !forzar && Date.now() - S.escTs < 10 * 60 * 1000) return;
  S.escCargando = true;
  const q = r => api('GET', r).catch(() => null), pts = {}, ctx = {};
  const [c1, c2, m, rec] = await Promise.all([
    q('/me/top/tracks?time_range=short_term&limit=50'), q('/me/top/tracks?time_range=short_term&limit=49&offset=50'),
    q('/me/top/tracks?time_range=medium_term&limit=50'), q('/me/player/recently-played?limit=50')]);
  const suma = (u, n) => { if (u) pts[u] = (pts[u] || 0) + n; };
  [c1, c2].forEach((j, k) => ((j && j.items) || []).forEach((t, i) => suma(t && t.uri, 100 - i - k * 50)));
  ((m && m.items) || []).forEach((t, i) => suma(t && t.uri, (50 - i) * 0.6));
  ((rec && rec.items) || []).forEach((x, i) => {
    if (!x || !x.track) return;
    suma(x.track.uri, 40 + (50 - i) * 0.4);
    const c = x.context; if (c && c.type === 'playlist' && c.uri && !ctx[c.uri]) ctx[c.uri] = Date.parse(x.played_at) || 0;
  });
  if (c1 || m || rec) { S.esc = pts; S.ctx = ctx; S.escTs = Date.now(); }
  S.escCargando = false;
  pintarListas(); if (S.lista) pintarPistas(S.lista);
}
function listasOrdenadas() {
  const L = S.listas || [];
  if (S.orden !== 'top') return L;
  const u = ultLs(), ctx = S.ctx || {};
  return L.map((p, i) => ({ p: p, i: i, t: Math.max(ctx[p.uri] || 0, u[p.uri] || 0) })).sort((a, b) => (b.t - a.t) || (a.i - b.i)).map(x => x.p);
}
function pistasOrdenadas(st) {
  const arr = st.items.map((t, i) => { t.p = (S.esc && S.esc[t.uri]) || 0; return { t: t, i: i }; });
  arr.sort((a, b) => (b.t.p - a.t.p) || (a.i - b.i));
  return arr.map(x => x.t);
}
const ordenActivo = () => S.orden === 'top' && !!S.esc;
function urisOrden(id, desde) {   // al ordenar por escuchas, Spotify recibe las canciones en ese orden (hasta 100)
  const st = S.pistas[id]; if (!st || !ordenActivo() || st.ordenando) return null;
  const l = pistasOrdenadas(st).filter(t => !t.local); let i = desde ? l.findIndex(t => t.uri === desde) : 0; if (i < 0) i = 0;
  const us = l.slice(i, i + 100).map(t => t.uri); return us.length ? us : null;
}
function ctlOrden(txt) {
  if (!tieneEscucha()) return '<div class="sp-nota">Para ordenar por lo que más escuchas, Spotify necesita un permiso más.<button type="button" class="sp-btn sec" id="spConectar">Actualizar permisos</button></div>';
  const b = (v, t) => '<button type="button" role="radio" data-a="orden" data-v="' + v + '" aria-checked="' + (S.orden === v) + '">' + t + '</button>';
  return '<div class="sp-seg" role="radiogroup" aria-label="Orden">' + b('top', txt) + b('original', 'Orden original') + '</div>';
}
function pintarOrden() { document.querySelectorAll('.sp-seg button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === S.orden))); }

/* ───────────── Interfaz ───────────── */
/* Dos pantallas dentro del panel: «Inicio» (ahora suena + tus playlists) y «Playlist» (portada, ▶ y todas sus canciones).
   Al entrar a una playlist aparece abajo un mini-reproductor fijo para pausar/saltar sin salir de ella. */
const CSS = `
.sp-fondo{position:fixed;inset:0;z-index:2100;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center}
.sp-fondo[hidden]{display:none}
.sp-panel{width:100%;max-width:520px;max-height:92vh;max-height:92dvh;display:flex;flex-direction:column;overflow:hidden;background:var(--surface);color:var(--text);
  border-radius:22px 22px 0 0;border:1px solid var(--line);padding-bottom:env(safe-area-inset-bottom);box-shadow:0 -12px 40px rgba(0,0,0,.5)}
.sp-panel.alta{height:92vh;height:92dvh}
.sp-cab{display:flex;align-items:center;gap:10px;padding:12px 16px 8px 20px;flex:none}
.sp-cab h2{font-size:21px;font-weight:800;flex:1;margin:0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sp-cab.con-atras{padding-left:12px}
.sp-conn{font-size:11.5px;font-weight:700;background:#1DB954;color:#07140b;padding:5px 10px;border-radius:99px}
.sp-conn[hidden],.sp-x[hidden],.sp-np2[hidden],.sp-campo[hidden]{display:none}
.sp-x{width:44px;height:44px;border:none;border-radius:50%;background:var(--surface-2);color:var(--text);display:grid;place-items:center;cursor:pointer;flex:none}
.sp-x svg{width:22px;height:22px;fill:currentColor}
#spCuerpo{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:4px 20px 16px}
.sp-centro{text-align:center;padding:14px 6px 4px}
.sp-grande{width:88px;height:88px;border-radius:50%;background:var(--accent);color:var(--accent-ink);display:grid;place-items:center;margin:8px auto 18px}
.sp-grande svg{width:44px;height:44px;fill:currentColor}
.sp-centro h3{font-size:20px;font-weight:800;margin:0 0 8px}
.sp-centro p,.sp-ayuda{font-size:14px;line-height:1.5;color:var(--text-dim);margin:0 0 12px}
.sp-ayuda code{display:block;word-break:break-all;background:var(--surface-2);color:var(--text);border-radius:8px;padding:8px 10px;margin:6px 0;font-size:12.5px;user-select:all;text-align:left}
.sp-ayuda ol{margin:0 0 12px;padding-left:20px;text-align:left}
.sp-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:52px;border:none;border-radius:99px;font:inherit;font-weight:800;font-size:16px;cursor:pointer;
  background:#1DB954;color:#07140b;margin:6px 0}
.sp-btn svg{width:22px;height:22px;fill:currentColor}
.sp-btn.sec{background:var(--surface-2);color:var(--text);font-weight:700;font-size:14px;min-height:44px}
.sp-btn:disabled{opacity:.55;cursor:default}
a.sp-btn{text-decoration:none}
.sp-campo{width:100%;min-height:46px;border-radius:12px;border:1px solid var(--line);background:var(--surface-2);color:var(--text);padding:0 12px;font:inherit;font-size:16px;margin:4px 0 8px}
.sp-np{display:flex;gap:16px;align-items:center}
.sp-art{width:104px;height:104px;border-radius:14px;flex:none;object-fit:cover;background:linear-gradient(135deg,var(--accent),#2c7a5a 60%,#16323a);display:block}
.sp-art[hidden]{display:none}
.sp-tt{font-size:20px;font-weight:800;line-height:1.15;overflow-wrap:anywhere}
.sp-aa{font-size:14px;color:var(--text-dim);margin-top:5px;line-height:1.35}
.sp-src{font-size:12px;color:#1DB954;font-weight:700;margin-top:8px}
.sp-barra{margin-top:16px;height:6px;border-radius:9px;background:var(--surface-2);position:relative;overflow:hidden}
.sp-barra i{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--accent);border-radius:9px}
.sp-tiempos{display:flex;justify-content:space-between;font-size:11.5px;color:var(--text-dim);margin-top:6px;font-variant-numeric:tabular-nums}
.sp-ctl{display:flex;align-items:center;justify-content:center;gap:30px;margin:8px 0 2px}
.sp-b{width:52px;height:52px;border:none;border-radius:50%;background:var(--surface-2);color:var(--text);display:grid;place-items:center;cursor:pointer}
.sp-b svg{width:26px;height:26px;fill:currentColor}
.sp-b.pp{width:68px;height:68px;background:var(--accent);color:var(--accent-ink)}
.sp-b.pp svg{width:34px;height:34px}
.sp-msg{font-size:13px;line-height:1.4;color:var(--ochre);margin:0;padding:6px 20px 4px;text-align:center;flex:none}
.sp-msg:empty{display:none}
.sp-h4{font-size:12px;letter-spacing:.12em;color:var(--text-dim);font-weight:700;margin:18px 0 6px}
.sp-lista{display:flex;align-items:center;gap:12px;width:100%;min-height:64px;padding:6px 8px;margin:0 -8px;box-sizing:content-box;border:none;border-radius:14px;background:transparent;color:var(--text);font:inherit;text-align:left;cursor:pointer}
.sp-lista:active{background:var(--surface-2)}
.sp-lista img,.sp-lista .ph{width:52px;height:52px;border-radius:10px;object-fit:cover;flex:none;background:linear-gradient(135deg,var(--accent),#16323a)}
.sp-lista .nm{flex:1;min-width:0}
.sp-lista b{display:block;font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sp-lista small{display:block;font-size:12.5px;color:var(--text-dim);margin-top:2px}
.sp-lista .chev{width:24px;height:24px;fill:var(--text-dim);flex:none}
.sp-sk{height:52px;border-radius:12px;background:var(--surface-2);margin:10px 0;opacity:.6}
@media (prefers-reduced-motion:no-preference){.sp-sk{animation:spSk 1.1s ease-in-out infinite alternate}}
@keyframes spSk{from{opacity:.35}to{opacity:.7}}
.sp-dh{display:flex;gap:16px;align-items:flex-end;margin:6px 0 12px}
.sp-dh img,.sp-dh .ph{width:128px;height:128px;border-radius:14px;object-fit:cover;flex:none;background:linear-gradient(135deg,var(--accent),#16323a);box-shadow:0 6px 18px rgba(0,0,0,.35)}
.sp-dh h3{font-size:21px;font-weight:800;line-height:1.15;margin:0 0 6px;overflow-wrap:anywhere}
.sp-dh p{margin:0;font-size:13px;color:var(--text-dim)}
.sp-pistas{margin:10px -8px 0}
.sp-pista{display:flex;align-items:center;gap:10px;width:100%;min-height:56px;padding:6px 8px;border:none;border-radius:12px;background:transparent;color:var(--text);font:inherit;text-align:left;cursor:pointer}
.sp-pista:active{background:var(--surface-2)}
.sp-pista:disabled{opacity:.5;cursor:default}
.sp-pista .n{width:26px;display:flex;justify-content:flex-end;font-size:12.5px;color:var(--text-dim);font-variant-numeric:tabular-nums;flex:none}
.sp-pista .t{flex:1;min-width:0}
.sp-pista .t b{display:block;font-size:14.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-pista .t small{display:block;font-size:12.5px;color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
.sp-pista .d{font-size:12px;color:var(--text-dim);font-variant-numeric:tabular-nums;flex:none}
.sp-pista .eq{display:none;align-items:flex-end;gap:2px;height:14px}
.sp-pista .eq i{width:3px;height:35%;background:var(--accent);border-radius:1px}
.sp-pista.actual{background:var(--surface-2)}
.sp-pista.actual .num{display:none}
.sp-pista.actual .eq{display:inline-flex}
.sp-pista.actual .t b{color:var(--accent)}
html[data-theme="claro"] .sp-pista.actual .t b{color:#6b7400}
html[data-theme="claro"] .sp-pista .eq i{background:#6b7400}
@media (prefers-reduced-motion:no-preference){
  .sp-pistas.suena .eq i{animation:spEq .9s ease-in-out infinite alternate}
  .sp-pistas.suena .eq i:nth-child(2){animation-delay:.3s}
  .sp-pistas.suena .eq i:nth-child(3){animation-delay:.6s}
}
@keyframes spEq{from{height:25%}to{height:100%}}
.sp-nota{font-size:13px;line-height:1.45;color:var(--text-dim);background:var(--surface-2);border-radius:12px;padding:10px 12px;margin:8px 0}
.sp-pie{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:14px;font-size:12.5px}
.sp-pie a,.sp-pie button{color:var(--text-dim);background:none;border:none;font:inherit;text-decoration:underline;cursor:pointer;min-height:44px;padding:0 4px;display:inline-flex;align-items:center}
.sp-mini,.sp-np2{background:var(--surface);color:var(--text)}
.sp-mini{position:fixed;left:12px;right:84px;bottom:calc(14px + env(safe-area-inset-bottom));z-index:1155;min-height:60px;border-radius:18px;
  border:1px solid var(--line);box-shadow:0 8px 24px rgba(0,0,0,.5);display:flex;align-items:center;gap:6px;padding:0 8px 0 6px;overflow:hidden}
.sp-mini[hidden]{display:none}
body.lluvia-activa .sp-mini{bottom:calc(86px + env(safe-area-inset-bottom))}
.sp-np2{flex:none;position:relative;display:flex;align-items:center;gap:6px;padding:8px 10px 6px 12px;border-top:1px solid var(--line);background:var(--surface-2)}
.sp-mini .info,.sp-np2 .info{display:flex;align-items:center;gap:10px;flex:1;min-width:0;border:none;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;min-height:56px;padding:0}
.sp-mini .info img,.sp-mini .info .ph,.sp-np2 .info .ph{width:42px;height:42px;border-radius:10px;object-fit:cover;flex:none;background:linear-gradient(135deg,var(--accent),#16323a)}
.sp-mini .tx,.sp-np2 .tx{min-width:0}
.sp-mini .tx b,.sp-np2 .tx b{display:block;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-mini .tx span,.sp-np2 .tx span{display:block;font-size:12px;color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-mini .mb,.sp-np2 .mb{width:44px;height:44px;border:none;border-radius:50%;background:transparent;color:var(--text);display:grid;place-items:center;cursor:pointer;flex:none}
.sp-mini .mb svg,.sp-np2 .mb svg{width:22px;height:22px;fill:currentColor}
.sp-mini .mb.pp,.sp-np2 .mb.pp{background:var(--accent);color:var(--accent-ink)}
.sp-mini .mp{position:absolute;left:10px;right:10px;bottom:0;height:3px;border-radius:9px;background:var(--surface-2)}
.sp-np2 .mp{position:absolute;left:0;right:0;top:0;height:3px;background:var(--line)}
.sp-mini .mp i,.sp-np2 .mp i{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--accent);border-radius:9px}
html[data-theme="claro"] .sp-src{color:#14803a}
@media (prefers-reduced-motion:no-preference){.sp-mini{animation:spSube .25s ease-out}}
@keyframes spSube{from{transform:translateY(20px);opacity:0}to{transform:none;opacity:1}}
.sp-panel button:focus-visible,.sp-panel a:focus-visible,.sp-panel input:focus-visible,.sp-mini button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.sp-seg{display:flex;gap:4px;padding:4px;border-radius:99px;background:var(--surface-2);margin:12px 0 6px}
.sp-seg button{flex:1;min-height:44px;border:none;border-radius:99px;background:transparent;color:var(--text-dim);font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}
.sp-seg button[aria-checked="true"]{background:var(--surface);color:var(--text);box-shadow:0 1px 5px rgba(0,0,0,.3)}
@media (prefers-reduced-motion:no-preference){.sp-seg button{transition:background .18s,color .18s}}
.sp-msg:not(:empty){margin:6px 14px 10px;padding:12px 14px;border-radius:14px;background:rgba(214,150,40,.14);border:1px solid rgba(214,150,40,.45);color:var(--text);text-align:left;font-size:13.5px}
.sp-msg .sp-btn{margin:10px 0 0;min-height:48px}
.sp-nota .sp-btn{margin:10px 0 0}
.sp-pista .rk{width:14px;height:14px;fill:var(--accent);flex:none}
html[data-theme="claro"] .sp-pista .rk{fill:#6b7400}
.sp-pista{min-height:60px}
.sp-dh{align-items:center}
`;
function asegurarUi() {
  if ($('spFondo')) return;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const f = document.createElement('div'); f.id = 'spFondo'; f.className = 'sp-fondo'; f.hidden = true;
  f.innerHTML = '<div class="sp-panel" id="spPanel" role="dialog" aria-modal="true" aria-labelledby="spTitulo">'
    + '<div class="sp-cab" id="spCab"><button type="button" class="sp-x" id="spAtras" data-a="atras" aria-label="Volver a tus playlists" hidden>' + IC.atras + '</button>'
    + '<h2 id="spTitulo">Música</h2><span class="sp-conn" id="spConn" hidden>Spotify</span>'
    + '<button type="button" class="sp-x" id="spCerrar" aria-label="Cerrar música">' + IC.cerrar + '</button></div>'
    + '<div id="spCuerpo"></div>'
    + '<p class="sp-msg" id="spMsg" role="status" aria-live="polite"></p>'
    + '<div class="sp-np2" id="spNP" role="group" aria-label="Reproductor" hidden><div class="mp"><i id="spnBar"></i></div>'
    + '<button type="button" class="info" data-a="atras" aria-label="Ir al reproductor"><span class="ph" id="spnArt"></span><span class="tx"><b id="spnT"></b><span id="spnA"></span></span></button>'
    + '<button type="button" class="mb pp" data-a="pp" id="spnPP" aria-label="Reproducir o pausar"></button>'
    + '<button type="button" class="mb" data-a="sig" aria-label="Siguiente">' + IC.sig + '</button></div></div>';
  document.body.appendChild(f);
  const m = document.createElement('div'); m.id = 'spMini'; m.className = 'sp-mini'; m.hidden = true;
  m.setAttribute('role', 'group'); m.setAttribute('aria-label', 'Reproductor de música');
  m.innerHTML = '<button type="button" class="info" id="spmAbrir" aria-label="Abrir música"><span class="ph" id="spmArt"></span><span class="tx"><b id="spmT"></b><span id="spmA"></span></span></button>'
    + '<button type="button" class="mb pp" data-a="pp" id="spmPP" aria-label="Reproducir o pausar"></button>'
    + '<button type="button" class="mb" data-a="sig" aria-label="Siguiente">' + IC.sig + '</button>'
    + '<div class="mp"><i id="spmBar"></i></div>';
  document.body.appendChild(m);

  f.addEventListener('click', e => { if (e.target === f) cerrar(); });
  $('spCerrar').addEventListener('click', cerrar);
  document.addEventListener('keydown', e => { if (S.abierto && e.key === 'Escape') { e.stopPropagation(); if (S.lista) volver(); else cerrar(); } }, true);   // en el documento: al redibujar las filas el foco se pierde
  f.addEventListener('input', e => { if (e.target.id === 'spFiltro') { S.filtro = e.target.value; pintarListas(); } });
  f.addEventListener('click', e => {
    const b = e.target.closest('[data-a]');
    if (b) {
      const a = b.dataset.a;
      if (a === 'abrirlista') { abrirLista(b.dataset.id); return; }
      if (a === 'orden') {
        S.orden = b.dataset.v === 'original' ? 'original' : 'top'; lsSet(LS_ORD, S.orden); pintarOrden(); pintarListas();
        if (S.orden === 'top') cargarEscuchas();
        if (S.lista) { pintarPistas(S.lista); completarPistas(S.lista); }
        return;
      }
      if (a === 'atras') { volver(); return; }
      if (a === 'mas') { cargarPistas(b.dataset.id, true); return; }
      if (a === 'pista') { S.marca = { u: b.dataset.t, t: Date.now() }; marcarActual(); }
      if ((a === 'pista' || a === 'lista') && S.lista) {
        anotarUltima(S.lista);
        const us = urisOrden(S.lista, a === 'pista' ? b.dataset.t : '');
        if (us) { accion('uris', us, a === 'pista' ? b.dataset.t : b.dataset.u); return; }
      }
      accion(a, b.dataset.u, b.dataset.t); return;
    }
    if (e.target.closest('#spAbrirApp,#spAbrirSp')) lsSet(LS_REAB, JSON.stringify({ t: Date.now(), l: S.lista }));   // si iOS recarga Maps mientras estás en Spotify, el panel se reabre solo
    if (e.target.closest('#spConectar')) { conectar(); return; }
    if (e.target.closest('#spActualizar')) { refrescar(); return; }
    if (e.target.closest('#spDesconectar')) { desconectar(); return; }
    if (e.target.closest('#spGuardarId')) {
      const v = ($('spIdCampo').value || '').trim();
      if (!idValido(v)) { toast('El Client ID son 32 letras y números. Cópialo tal cual del panel de Spotify.'); return; }
      lsSet(LS_CID, v); S.vista = ''; pintar();
    }
  });
  m.addEventListener('click', e => {
    const b = e.target.closest('[data-a]'); if (b) { accion(b.dataset.a); return; }
    if (e.target.closest('#spmAbrir')) abrir();
  });
}

function vistaSinId() {
  return '<div class="sp-centro"><div class="sp-grande">' + IC.nota + '</div><h3>Falta el Client ID</h3>'
    + '<div class="sp-ayuda"><ol><li>Entra a <b>developer.spotify.com/dashboard</b> y crea una app.</li>'
    + '<li>En «Redirect URIs» agrega exactamente:<code>' + esc(REDIRECT) + '</code></li>'
    + '<li>Copia su <b>Client ID</b> (nunca el Client secret) y pégalo aquí.</li></ol></div>'
    + '<label class="sp-ayuda" for="spIdCampo" style="display:block;text-align:left;margin:0">Client ID</label>'
    + '<input class="sp-campo" id="spIdCampo" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="32 letras y números">'
    + '<button type="button" class="sp-btn" id="spGuardarId">Guardar</button></div>';
}
function vistaConectar() {
  return '<div class="sp-centro"><div class="sp-grande">' + IC.nota + '</div><h3>Conecta tu Spotify</h3>'
    + '<p>La música suena en tu app de Spotify. Maps solo controla play, pausa, siguiente y tus playlists.</p>'
    + '<button type="button" class="sp-btn" id="spConectar">Conectar con Spotify</button>'
    + '<p class="sp-ayuda" style="margin-top:8px">Requiere cuenta Spotify Premium.</p></div>';
}
function vistaReproductor() {
  return '<div class="sp-np"><img class="sp-art" id="spArt" alt="" referrerpolicy="no-referrer" hidden><div class="sp-art" id="spArtPh"></div>'
    + '<div style="min-width:0"><div class="sp-tt" id="spTit">Nada sonando</div><div class="sp-aa" id="spArtista"></div><div class="sp-src" id="spDisp"></div></div></div>'
    + '<div class="sp-barra"><i id="spBar"></i></div><div class="sp-tiempos"><span id="spT1">0:00</span><span id="spT2">0:00</span></div>'
    + '<div class="sp-ctl"><button type="button" class="sp-b" data-a="ant" aria-label="Anterior">' + IC.ant + '</button>'
    + '<button type="button" class="sp-b pp" data-a="pp" id="spPP" aria-label="Reproducir o pausar"></button>'
    + '<button type="button" class="sp-b" data-a="sig" aria-label="Siguiente">' + IC.sig + '</button></div>'
    + '<div class="sp-h4">TUS PLAYLISTS</div>' + ctlOrden('Recientes primero')
    + '<input class="sp-campo" id="spFiltro" type="search" placeholder="Buscar playlist" aria-label="Buscar playlist" autocomplete="off" hidden>'
    + '<div id="spListas"></div>'
    + '<div class="sp-pie"><button type="button" id="spActualizar">Actualizar</button><a id="spAbrirSp" href="https://open.spotify.com" target="_blank" rel="noopener">Abrir Spotify</a>'
    + '<button type="button" id="spDesconectar">Desconectar</button></div>';
}
const imgGrande = p => { const im = (p && p.images) || []; return (im[0] || {}).url || ''; };
const imgChica = p => { const im = (p && p.images) || []; return (im[im.length - 1] || {}).url || ''; };
const cuenta = p => p && p.tracks && p.tracks.total != null ? p.tracks.total : (p && p.items && p.items.total != null ? p.items.total : null);
const txtCanciones = n => n + (n === 1 ? ' canción' : ' canciones');
function vistaLista(id) {
  const p = (S.listas || []).find(x => x.id === id) || { id: id, name: 'Playlist', uri: 'spotify:playlist:' + id, images: [] };
  const n = cuenta(p), img = imgGrande(p), dueno = p.owner && p.owner.display_name;
  const meta = [n != null ? txtCanciones(n) : '', dueno ? 'de ' + dueno : ''].filter(Boolean).join(' · ');
  return '<div class="sp-dh">' + (img ? '<img src="' + esc(img) + '" alt="" referrerpolicy="no-referrer">' : '<span class="ph"></span>')
    + '<div style="min-width:0"><h3>' + esc(p.name) + '</h3><p>' + esc(meta) + '</p></div></div>'
    + '<button type="button" class="sp-btn" data-a="lista" data-u="' + esc(p.uri) + '">' + IC.play + 'Reproducir playlist</button>'
    + ctlOrden('Más escuchadas')
    + '<div class="sp-pistas" id="spPistas"></div>';
}
function setMsg(t, appUri) {
  const m = $('spMsg'); if (!m) return;
  m.innerHTML = (!t && !appUri) ? '' : '<span class="sp-msgt">' + esc(t || '') + '</span>' + (appUri ? '<a class="sp-btn" id="spAbrirApp" href="' + esc(appUri) + '">Abrir Spotify y volver aquí</a>' : '');
}

const sinAcentos = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function pintarListas() {
  const c = $('spListas'); if (!c) return;
  const fl = $('spFiltro');
  if (S.cargandoListas) { c.innerHTML = '<div class="sp-sk"></div><div class="sp-sk"></div><div class="sp-sk"></div>'; return; }
  if (S.listasErr) { c.innerHTML = '<p class="sp-ayuda">' + esc(S.listasErr) + '</p>'; return; }
  if (!S.listas) { c.innerHTML = ''; return; }
  if (!S.listas.length) { c.innerHTML = '<p class="sp-ayuda">Aún no tienes playlists. Créalas en Spotify y aparecerán aquí.</p>'; return; }
  if (fl) { fl.hidden = S.listas.length <= 6; if (fl.value !== S.filtro) fl.value = S.filtro; }
  const q = sinAcentos(S.filtro).trim();
  const todas = listasOrdenadas(), ver = q && S.listas.length > 6 ? todas.filter(p => sinAcentos(p.name).indexOf(q) >= 0) : todas;
  if (!ver.length) { c.innerHTML = '<p class="sp-ayuda">Ninguna playlist coincide con «' + esc(S.filtro.trim()) + '».</p>'; return; }
  // Tocar una playlist ENTRA a ella (portada, ▶ y todas sus canciones).
  c.innerHTML = ver.map(p => {
    const n = cuenta(p), img = imgChica(p);
    return '<button type="button" class="sp-lista" data-a="abrirlista" data-id="' + esc(p.id) + '">'
      + (img ? '<img src="' + esc(img) + '" alt="" referrerpolicy="no-referrer" loading="lazy">' : '<span class="ph"></span>')
      + '<span class="nm"><b>' + esc(p.name) + '</b>' + (n != null ? '<small>' + txtCanciones(n) + '</small>' : '') + '</span>' + IC.der + '</button>';
  }).join('');
}

const NOTA_AJENA = 'Spotify solo permite ver las canciones de las playlists que tú creaste o en las que colaboras (límite de las apps en modo desarrollo). Esta sí la puedes reproducir con el botón verde.';
function abrirLista(id) { S.lista = id; pintar(); }
function volver() {
  const id = S.lista; S.lista = ''; S.vista = ''; pintar();
  const b = id && document.querySelector('#spListas .sp-lista[data-id="' + String(id).replace(/"/g, '') + '"]');
  if (b) { try { b.scrollIntoView({ block: 'center' }); b.focus({ preventScroll: true }); } catch (e) {} }
}
async function cargarPistas(id, mas) {
  const st = S.pistas[id] || (S.pistas[id] = { items: [], total: 0, next: false, cargando: false, nota: '' });
  if (st.cargando) return;
  st.cargando = true; st.nota = ''; pintarPistas(id);
  const off = mas ? st.items.length : 0, base = '/playlists/' + encodeURIComponent(id);
  try {
    let j;
    try { j = await api('GET', base + '/items?limit=50&offset=' + off); }
    catch (e) { if (e.status === 404 || e.status === 400) j = await api('GET', base + '/tracks?limit=50&offset=' + off); else throw e; }   // ruta anterior a febrero 2026
    if (!j || !Array.isArray(j.items)) st.nota = NOTA_AJENA;   // en modo desarrollo, las playlists ajenas solo traen metadatos
    else {
      const nuevos = j.items.map(x => {
        const t = x && (x.item || x.track);   // «track» pasó a «item» en 2026
        if (!t || !t.uri) return null;
        return { uri: t.uri, nombre: t.name || '(sin título)', artista: (t.artists || []).map(a => a.name).join(', ') || (t.show && t.show.name) || '',
                 dur: Number(t.duration_ms) || 0, local: !!t.is_local || /^spotify:local:/.test(t.uri) };
      }).filter(Boolean);
      st.items = mas ? st.items.concat(nuevos) : nuevos;
      st.total = Number(j.total) || st.items.length; st.next = !!j.next;
      if (!st.items.length) st.nota = 'Esta playlist no tiene canciones que se puedan mostrar.';
    }
  } catch (e) {
    st.nota = (e.status === 403 || e.status === 404) ? NOTA_AJENA : 'No se pudieron cargar las canciones (' + ((e && e.message) || 'error') + ').';
  }
  st.cargando = false; pintarPistas(id);
}
function uriActual() {   // la canción que se acaba de tocar se marca al instante, sin esperar a que Spotify confirme
  const m = S.marca, u = S.est && S.est.uri;
  if (m && u === m.u) S.marca = null;
  else if (m && Date.now() - m.t < 6000) return m.u;
  return u || '';
}
function pintarPistas(id) {
  const c = $('spPistas'); if (!c || S.lista !== id) return;
  const st = S.pistas[id], pl = (S.listas || []).find(p => p.id === id);
  if (!st || (st.cargando && !st.items.length)) { c.innerHTML = '<div class="sp-sk"></div><div class="sp-sk"></div><div class="sp-sk"></div><div class="sp-sk"></div><div class="sp-sk"></div>'; return; }
  if (st.ordenando) { c.innerHTML = '<p class="sp-nota" role="status">Ordenando por lo que más escuchas… ' + st.items.length + (st.total ? ' de ' + st.total : '') + '</p><div class="sp-sk"></div><div class="sp-sk"></div><div class="sp-sk"></div>'; return; }
  const ua = uriActual(), lis = ordenActivo() ? pistasOrdenadas(st) : st.items;
  let h = st.nota ? '<p class="sp-nota">' + esc(st.nota) + '</p>' : '';
  h += lis.map((t, i) => '<button type="button" class="sp-pista' + (ua && ua === t.uri ? ' actual' : '') + '" data-a="pista" data-u="' + esc(pl ? pl.uri : 'spotify:playlist:' + id)
    + '" data-t="' + esc(t.uri) + '"' + (t.local ? ' disabled' : '') + '><span class="n"><span class="num">' + (i + 1) + '</span><span class="eq" aria-hidden="true"><i></i><i></i><i></i></span></span>'
    + '<span class="t"><b>' + esc(t.nombre) + '</b><small>' + esc(t.artista) + '</small></span>'
    + (ordenActivo() && t.p > 0 ? '<svg class="rk" viewBox="0 0 24 24" role="img" aria-label="Escuchada recientemente"><path d="M19.48 12.35c-1.57-4.08-7.16-4.3-5.81-10.23.1-.44-.37-.78-.75-.55C9.29 3.71 6.68 8 8.87 13.62c.18.46-.36.89-.75.59-1.81-1.37-2-3.34-1.84-4.75.06-.52-.62-.77-.91-.34C4.69 10.16 4 11.84 4 14.37c.38 5.6 5.11 7.32 6.81 7.54 2.43.31 5.06-.14 6.95-1.87 2.08-1.93 2.84-5.01 1.72-7.69z"/></svg>' : '')
    + '<span class="d">' + (t.dur ? fmt(t.dur) : '') + '</span></button>').join('');
  if (st.next) h += '<button type="button" class="sp-btn sec" data-a="mas" data-id="' + esc(id) + '"' + (st.cargando ? ' disabled' : '') + '>' + (st.cargando ? 'Cargando…' : 'Ver más canciones') + '</button>';
  c.innerHTML = h; c.classList.toggle('suena', !!(S.est && S.est.playing));
}
async function completarPistas(id) {   // para ordenar hace falta tener TODA la playlist (50 canciones por petición, tope 1000)
  const st = S.pistas[id];
  if (!st || st.nota || !st.next || S.orden !== 'top' || st.ordenando) return;
  st.ordenando = true; pintarPistas(id);
  while (st.next && st.items.length < 1000 && !st.nota) {
    const antes = st.items.length; await cargarPistas(id, true);
    if (st.items.length === antes) break;
  }
  st.ordenando = false; pintarPistas(id);
}
async function prepararLista(id) {
  const st = S.pistas[id];
  if (st && !st.nota) pintarPistas(id); else await cargarPistas(id);
  cargarEscuchas(); await completarPistas(id);
}
function marcarActual() {   // resalta la canción que suena, sin volver a dibujar la lista
  const c = $('spPistas'); if (!c) return;
  const u = uriActual();
  c.classList.toggle('suena', !!(S.est && S.est.playing));
  c.querySelectorAll('.sp-pista').forEach(b => b.classList.toggle('actual', !!u && b.dataset.t === u));
}

function pintar() {
  const mini = $('spMini'); if (!mini) return;
  const con = !!leerToken(), ok = permitido() && con && !!S.est && !S.abierto;
  mini.hidden = !ok;
  if (ok) {
    $('spmT').textContent = S.est.titulo; $('spmA').textContent = S.est.artista;
    $('spmPP').innerHTML = S.est.playing ? IC.pausa : IC.play;
    const a = $('spmArt'); if (S.est.img) { a.style.background = 'url("' + S.est.img.replace(/"/g, '%22') + '") center/cover'; } else a.style.background = '';
  }
  if (!S.abierto) { progreso(); return; }
  $('spConn').hidden = !con;
  const base = !clientId() ? 'id' : !con ? 'con' : 'rep';
  if (base === 'rep' && S.lista) { /* pantalla de playlist */ } else S.lista = '';
  const vista = base === 'rep' && S.lista ? 'lista' : base, clave = vista + '|' + S.lista;
  const cuerpo = $('spCuerpo');
  if (S.vista !== clave) {
    cuerpo.innerHTML = vista === 'id' ? vistaSinId() : vista === 'con' ? vistaConectar() : vista === 'lista' ? vistaLista(S.lista) : vistaReproductor();
    S.vista = clave; cuerpo.scrollTop = 0;
    $('spPanel').classList.toggle('alta', vista === 'lista');
    $('spCab').classList.toggle('con-atras', vista === 'lista');
    $('spAtras').hidden = vista !== 'lista';
    $('spTitulo').textContent = vista === 'lista' ? 'Playlist' : 'Música';
    if (vista === 'rep') { cargarListas(); cargarEscuchas(); pintarListas(); }
    if (vista === 'lista') {
      prepararLista(S.lista);
      const b = $('spAtras'); if (b) b.focus({ preventScroll: true });
    }
  }
  const np = $('spNP'); if (np) np.hidden = !(vista === 'lista' && !!S.est);
  const e = S.est;
  if (vista === 'rep') {
    $('spTit').textContent = e ? e.titulo : 'Nada sonando';
    $('spArtista').textContent = e ? e.artista : (S.error || 'Elige una playlist de abajo o reproduce algo en Spotify.');
    $('spDisp').textContent = e && e.disp ? 'Sonando en ' + e.disp : '';
    $('spPP').innerHTML = e && e.playing ? IC.pausa : IC.play;
    const im = $('spArt'), ph = $('spArtPh');
    if (e && e.img) { if (im.getAttribute('src') !== e.img) im.src = e.img; im.hidden = false; ph.hidden = true; } else { im.hidden = true; ph.hidden = false; }
    const lnk = $('spAbrirSp'); if (lnk) lnk.href = (e && e.url) || 'https://open.spotify.com';
  }
  if (vista === 'lista' && e) {
    $('spnT').textContent = e.titulo; $('spnA').textContent = e.artista; $('spnPP').innerHTML = e.playing ? IC.pausa : IC.play;
    $('spnArt').style.background = e.img ? 'url("' + e.img.replace(/"/g, '%22') + '") center/cover' : '';
    marcarActual();
  }
  if (S.error && e && vista !== 'id' && vista !== 'con') setMsg(S.error);
  progreso();
}
function progreso() {
  const e = S.est; if (!e) return;
  const p = posActual(), pct = e.dur ? (100 * p / e.dur) : 0;
  if (S.abierto && $('spBar')) { $('spBar').style.width = pct + '%'; $('spT1').textContent = fmt(p); $('spT2').textContent = fmt(e.dur); }
  if (S.abierto && $('spnBar')) $('spnBar').style.width = pct + '%';
  if ($('spmBar')) $('spmBar').style.width = pct + '%';
}

/* ───────────── Abrir / cerrar ───────────── */
function abrir(l) {
  if (!permitido()) return;
  asegurarUi();
  S.foco = document.activeElement; S.abierto = true; S.vista = ''; S.lista = typeof l === 'string' ? l : ''; S.filtro = '';
  $('spFondo').hidden = false;
  pintar();
  if (leerToken()) refrescar();
  setTimeout(() => { const b = $('spConectar') || $('spPP') || $('spGuardarId') || $('spCerrar'); if (b) b.focus({ preventScroll: true }); }, 60);
}
function cerrar() {
  S.abierto = false; const f = $('spFondo'); if (f) f.hidden = true;
  pintar();
  try { if (S.foco && S.foco.focus) S.foco.focus({ preventScroll: true }); } catch (e) {}
}

/* ───────────── Menú y arranque ───────────── */
window.musicaActualizarMenu = function () {
  const ok = permitido(), b = $('btnMusica'), s = $('secMusica');
  if (b) b.hidden = !ok; if (s) s.hidden = !ok;
};

let timer = null;
// Sondeo adaptativo para cuidar la batería y los datos: más seguido solo si suena música y el panel está abierto.
// (El avance de la barra se calcula en el celular entre consultas, no necesita preguntar cada segundo.)
function intervalo() { const suena = !!(S.est && S.est.playing); return S.abierto ? (suena ? 4000 : 8000) : (suena ? 8000 : 25000); }
function programar() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (!document.hidden && permitido() && leerToken() && Date.now() >= S.pausa) await refrescar(); else pintar();
    programar();
  }, intervalo());
}

function iniciar() {
  asegurarUi();
  const b = $('btnMusica'); if (b) b.addEventListener('click', abrir);
  setInterval(() => { if (!document.hidden && S.est && (S.abierto || ($('spMini') && !$('spMini').hidden))) progreso(); }, 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !permitido() || !leerToken()) return;
    if (leerPend()) reintentarPendiente(); else refrescar();
  });
  setTimeout(() => { if (!document.hidden && permitido() && leerPend()) reintentarPendiente(); }, 2500);   // por si la app se recargó mientras estaba Spotify
  let reab = null; try { reab = JSON.parse(lsGet(LS_REAB) || 'null'); } catch (e) {} lsDel(LS_REAB);
  if (reab && Date.now() - reab.t < 10 * 60 * 1000 && leerToken() && !location.search) esperarSesionYAbrir(reab.l || '');
  procesarRetorno().then(() => { pintar(); programar(); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
