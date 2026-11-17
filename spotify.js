/* spotify.js — «Música» en Maps: control remoto de Spotify.
   La música suena en la app de Spotify (o en el navegador de la PC); Maps solo la CONTROLA: play, pausa,
   siguiente, anterior y playlists. No reproduce audio dentro de la PWA.

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
  scopes: 'user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative'
};
// Debe coincidir EXACTO (mayúsculas incluidas) con el Redirect URI registrado en el panel de Spotify.
const REDIRECT = (location.origin + location.pathname).replace(/index\.html$/, '');

const LS_TOKEN = 'gc_spotify_v1', LS_PKCE = 'gc_spotify_pkce_v1', LS_CID = 'gc_spotify_cid_v1', LS_PEND = 'gc_spotify_pend_v1';
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
  chev: '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>'
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
  lsSet(LS_TOKEN, JSON.stringify({ a: j.access_token, r: j.refresh_token || (previo && previo.r) || '', e: Date.now() + (Number(j.expires_in) || 3600) * 1000 - 30000 }));
}
async function tokenValido() {
  const t = leerToken(); if (!t) return null;
  if (Date.now() < t.e) return t.a;
  if (!t.r) { desconectar(true); return null; }
  try { guardarToken(await pedirToken({ grant_type: 'refresh_token', refresh_token: t.r }), t); return leerToken().a; }
  catch (e) { if (e.codigo === 'invalid_grant') { desconectar(true); } return null; }   // sin señal: se conserva la sesión y se reintenta
}
function desconectar(silencioso) {
  lsDel(LS_TOKEN); S.est = null; S.listas = null; S.listasErr = '';
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
function esperarSesionYAbrir() {   // la sesión de Maps tarda un momento en restaurarse tras recargar
  let n = 0; const iv = setInterval(() => { if (permitido()) { clearInterval(iv); abrir(); } else if (++n > 40) clearInterval(iv); }, 500);
}

/* ───────────── API de Spotify ───────────── */
const S = { est: null, t0: 0, listas: null, listasErr: '', cargandoListas: false, abierto: false, pausa: 0, vista: '', foco: null,
            abierta: '', pistas: {}, reintentando: false };

async function api(metodo, ruta, cuerpo) {
  const tk = await tokenValido();
  if (!tk) { const e = new Error('Sin sesión de Spotify'); e.status = 401; throw e; }
  const r = await fetch(URL_API + ruta, { method: metodo,
    headers: Object.assign({ Authorization: 'Bearer ' + tk }, cuerpo ? { 'Content-Type': 'application/json' } : {}),
    body: cuerpo ? JSON.stringify(cuerpo) : undefined });
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
  if (e && e.status === 403) return 'Spotify no autorizó esta acción. Si es una cuenta nueva, agrégala en «User Management» del panel de la app.';
  if (e && e.status === 429) return 'Spotify pide esperar unos segundos. Inténtalo otra vez.';
  if (e && (e.status === 404)) return 'Spotify no encontró un dispositivo activo.';
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
  } catch (e) { S.error = e && e.status ? textoError(e) : ''; if (e && e.status === 401) S.est = null; }
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
// A dónde llevar a Spotify: a la playlist o canción que se pidió (o a la app, si fue play/pausa).
const uriApp = (tipo, extra, extra2) => tipo === 'pista' ? (extra2 || 'spotify:') : tipo === 'lista' ? (extra || 'spotify:') : 'spotify:';
function ejecutar(tipo, extra, extra2) {
  if (tipo === 'lista') return reproducir({ context_uri: extra });
  if (tipo === 'pista') return reproducir({ context_uri: extra, offset: { uri: extra2 } });
  return reproducir();
}
async function accion(tipo, extra, extra2) {
  setMsg(''); guardarPend(null);
  try {
    if (tipo === 'pp') {
      if (S.est && S.est.playing) { await api('PUT', '/me/player/pause'); S.est.pos = posActual(); S.est.playing = false; S.t0 = Date.now(); }
      else { await reproducir(); if (S.est) { S.est.playing = true; S.t0 = Date.now(); } }
    } else if (tipo === 'sig') await api('POST', '/me/player/next');
    else if (tipo === 'ant') await api('POST', '/me/player/previous');
    else if (tipo === 'lista' || tipo === 'pista') await ejecutar(tipo, extra, extra2);
    pintar();
    setTimeout(refrescar, 800);   // Spotify tarda un instante en reflejar el cambio
  } catch (e) {
    const sin = esSinDispositivo(e) && (tipo === 'pp' || tipo === 'lista' || tipo === 'pista');
    if (sin) guardarPend({ tipo, extra, extra2, t: Date.now() });
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
    for (const espera of [700, 1500, 3000]) {
      await new Promise(r => setTimeout(r, espera));
      try { await ejecutar(p.tipo, p.extra, p.extra2); setMsg(''); setTimeout(refrescar, 800); return; }
      catch (e) { if (!esSinDispositivo(e)) { setMsg(textoError(e)); return; } }
    }
    setMsg(textoError({ sinDispositivo: true }), uriApp(p.tipo, p.extra, p.extra2));
    guardarPend(p);
  } finally { S.reintentando = false; }
}
async function cargarListas() {
  if (S.listas || S.cargandoListas || !leerToken()) return;
  S.cargandoListas = true; pintarListas();
  try { const j = await api('GET', '/me/playlists?limit=20'); S.listas = ((j && j.items) || []).filter(Boolean); S.listasErr = ''; }
  catch (e) { S.listas = null; S.listasErr = 'No se pudieron cargar tus playlists. Puedes seguir usando los controles.'; }
  S.cargandoListas = false; pintarListas();
}

/* ───────────── Interfaz ───────────── */
const CSS = `
.sp-fondo{position:fixed;inset:0;z-index:2100;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center}
.sp-fondo[hidden]{display:none}
.sp-panel{width:100%;max-width:520px;max-height:90vh;overflow:auto;background:var(--surface);color:var(--text);border-radius:22px 22px 0 0;border:1px solid var(--line);
  padding:14px 20px calc(22px + env(safe-area-inset-bottom));box-shadow:0 -12px 40px rgba(0,0,0,.5)}
.sp-cab{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.sp-cab h2{font-size:21px;font-weight:800;flex:1;margin:0}
.sp-conn{font-size:11.5px;font-weight:700;background:#1DB954;color:#07140b;padding:5px 10px;border-radius:99px}
.sp-conn[hidden]{display:none}
.sp-x{width:44px;height:44px;border:none;border-radius:50%;background:var(--surface-2);color:var(--text);display:grid;place-items:center;cursor:pointer}
.sp-x svg{width:22px;height:22px;fill:currentColor}
.sp-centro{text-align:center;padding:14px 6px 4px}
.sp-grande{width:88px;height:88px;border-radius:50%;background:var(--accent);color:var(--accent-ink);display:grid;place-items:center;margin:8px auto 18px}
.sp-grande svg{width:44px;height:44px;fill:currentColor}
.sp-centro h3{font-size:20px;font-weight:800;margin:0 0 8px}
.sp-centro p,.sp-ayuda{font-size:14px;line-height:1.5;color:var(--text-dim);margin:0 0 12px}
.sp-ayuda code{display:block;word-break:break-all;background:var(--surface-2);color:var(--text);border-radius:8px;padding:8px 10px;margin:6px 0;font-size:12.5px;user-select:all;text-align:left}
.sp-ayuda ol{margin:0 0 12px;padding-left:20px;text-align:left}
.sp-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:52px;border:none;border-radius:99px;font:inherit;font-weight:800;font-size:16px;cursor:pointer;
  background:#1DB954;color:#07140b;margin:6px 0}
.sp-btn.sec{background:var(--surface-2);color:var(--text);font-weight:700;font-size:14px;min-height:44px}
.sp-btn:disabled{opacity:.55;cursor:default}
.sp-campo{width:100%;min-height:46px;border-radius:12px;border:1px solid var(--line);background:var(--surface-2);color:var(--text);padding:0 12px;font:inherit;font-size:14px;margin:4px 0 8px}
.sp-np{display:flex;gap:16px;align-items:center}
.sp-art{width:112px;height:112px;border-radius:14px;flex:none;object-fit:cover;background:linear-gradient(135deg,var(--accent),#2c7a5a 60%,#16323a);display:block}
.sp-tt{font-size:20px;font-weight:800;line-height:1.15;overflow-wrap:anywhere}
.sp-art[hidden]{display:none}
.sp-aa{font-size:14px;color:var(--text-dim);margin-top:5px}
.sp-src{font-size:12px;color:#1DB954;font-weight:700;margin-top:10px}
.sp-barra{margin-top:18px;height:6px;border-radius:9px;background:var(--surface-2);position:relative;overflow:hidden}
.sp-barra i{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--accent);border-radius:9px}
.sp-tiempos{display:flex;justify-content:space-between;font-size:11.5px;color:var(--text-dim);margin-top:6px;font-variant-numeric:tabular-nums}
.sp-ctl{display:flex;align-items:center;justify-content:center;gap:30px;margin:10px 0 4px}
.sp-b{width:52px;height:52px;border:none;border-radius:50%;background:var(--surface-2);color:var(--text);display:grid;place-items:center;cursor:pointer}
.sp-b svg{width:26px;height:26px;fill:currentColor}
.sp-b.pp{width:68px;height:68px;background:var(--accent);color:var(--accent-ink)}
.sp-b.pp svg{width:34px;height:34px}
.sp-msg{min-height:20px;font-size:13px;line-height:1.4;color:var(--ochre);margin:6px 0 0;text-align:center}
.sp-h4{font-size:12px;letter-spacing:.12em;color:var(--text-dim);font-weight:700;margin:16px 0 6px}
.sp-lista{display:flex;align-items:center;gap:12px;flex:1;min-width:0;min-height:56px;padding:6px;border:none;border-radius:12px;background:transparent;color:var(--text);font:inherit;text-align:left;cursor:pointer}
.sp-lista:active{background:var(--surface-2)}
.sp-lista img,.sp-lista .ph{width:44px;height:44px;border-radius:9px;object-fit:cover;flex:none;background:linear-gradient(135deg,var(--accent),#16323a)}
.sp-lista b{display:block;font-size:14.5px;font-weight:600}
.sp-lista small{font-size:12px;color:var(--text-dim)}
.sp-lista .nm{flex:1;min-width:0}
.sp-lista .nm b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sp-lista .chev{width:22px;height:22px;fill:var(--text-dim);flex:none;margin-right:2px}
@media (prefers-reduced-motion:no-preference){.sp-lista .chev{transition:transform .2s}}
.sp-grupo.abierta>.sp-pl{background:var(--surface-2);border-radius:12px}
.sp-grupo.abierta .chev{transform:rotate(180deg)}
.sp-pl{display:flex;align-items:center;gap:4px}
.sp-plplay{width:44px;height:44px;border:none;border-radius:50%;background:var(--accent);color:var(--accent-ink);display:grid;place-items:center;cursor:pointer;flex:none;margin-right:6px}
.sp-plplay svg{width:22px;height:22px;fill:currentColor}
.sp-pistas{margin:4px 0 10px 18px;padding-left:8px;border-left:2px solid var(--line)}
.sp-pistas[hidden]{display:none}
.sp-pista{display:flex;align-items:center;gap:10px;width:100%;min-height:48px;padding:4px 8px;border:none;border-radius:10px;background:transparent;color:var(--text);font:inherit;text-align:left;cursor:pointer}
.sp-pista:active{background:var(--surface-2)}
.sp-pista:disabled{opacity:.5;cursor:default}
.sp-pista .n{width:22px;text-align:right;font-size:12px;color:var(--text-dim);font-variant-numeric:tabular-nums;flex:none}
.sp-pista .t{flex:1;min-width:0}
.sp-pista .t b{display:block;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-pista .t small{display:block;font-size:12px;color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-pista .d{font-size:12px;color:var(--text-dim);font-variant-numeric:tabular-nums;flex:none}
.sp-pista.actual .t b,.sp-pista.actual .n{color:var(--accent)}
html[data-theme="claro"] .sp-pista.actual .t b,html[data-theme="claro"] .sp-pista.actual .n{color:#6b7400}
.sp-nota{font-size:13px;line-height:1.45;color:var(--text-dim);padding:8px 8px;margin:0}
a.sp-btn{text-decoration:none}
.sp-pie{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:14px;font-size:12.5px}
.sp-pie a,.sp-pie button{color:var(--text-dim);background:none;border:none;font:inherit;text-decoration:underline;cursor:pointer;min-height:44px;padding:0 4px;display:inline-flex;align-items:center}
.sp-mini{position:fixed;left:12px;right:84px;bottom:calc(14px + env(safe-area-inset-bottom));z-index:1155;min-height:60px;border-radius:18px;background:var(--surface);color:var(--text);
  border:1px solid var(--line);box-shadow:0 8px 24px rgba(0,0,0,.5);display:flex;align-items:center;gap:6px;padding:0 8px 0 6px;overflow:hidden}
.sp-mini[hidden]{display:none}
body.lluvia-activa .sp-mini{bottom:calc(86px + env(safe-area-inset-bottom))}
.sp-mini .info{display:flex;align-items:center;gap:10px;flex:1;min-width:0;border:none;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;min-height:56px;padding:0}
.sp-mini .info img,.sp-mini .info .ph{width:42px;height:42px;border-radius:10px;object-fit:cover;flex:none;background:linear-gradient(135deg,var(--accent),#16323a)}
.sp-mini .tx{min-width:0}
.sp-mini .tx b{display:block;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-mini .tx span{display:block;font-size:12px;color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-mini .mb{width:44px;height:44px;border:none;border-radius:50%;background:transparent;color:var(--text);display:grid;place-items:center;cursor:pointer;flex:none}
.sp-mini .mb svg{width:22px;height:22px;fill:currentColor}
.sp-mini .mb.pp{background:var(--accent);color:var(--accent-ink)}
.sp-mini .mp{position:absolute;left:10px;right:10px;bottom:0;height:3px;border-radius:9px;background:var(--surface-2)}
.sp-mini .mp i{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--accent);border-radius:9px}
html[data-theme="claro"] .sp-src{color:#14803a}
@media (prefers-reduced-motion:no-preference){.sp-mini{animation:spSube .25s ease-out}}
@keyframes spSube{from{transform:translateY(20px);opacity:0}to{transform:none;opacity:1}}
`;
function asegurarUi() {
  if ($('spFondo')) return;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const f = document.createElement('div'); f.id = 'spFondo'; f.className = 'sp-fondo'; f.hidden = true;
  f.innerHTML = '<div class="sp-panel" role="dialog" aria-modal="true" aria-labelledby="spTitulo">'
    + '<div class="sp-cab"><h2 id="spTitulo">Música</h2><span class="sp-conn" id="spConn" hidden>Spotify</span>'
    + '<button type="button" class="sp-x" id="spCerrar" aria-label="Cerrar música">' + IC.cerrar + '</button></div>'
    + '<div id="spCuerpo"></div></div>';
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
  f.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); cerrar(); } });
  f.addEventListener('click', e => {
    const b = e.target.closest('[data-a]');
    if (b) {
      if (b.dataset.a === 'abrirlista') { alternarLista(b.dataset.id); return; }
      if (b.dataset.a === 'mas') { cargarPistas(b.dataset.id, true); return; }
      accion(b.dataset.a, b.dataset.u, b.dataset.t); return;
    }
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
    + '<p class="sp-msg" id="spMsg" role="status" aria-live="polite"></p>'
    + '<div class="sp-h4">TUS PLAYLISTS</div><div id="spListas"></div>'
    + '<div class="sp-pie"><button type="button" id="spActualizar">Actualizar</button><a id="spAbrirSp" href="https://open.spotify.com" target="_blank" rel="noopener">Abrir Spotify</a>'
    + '<button type="button" id="spDesconectar">Desconectar</button></div>';
}
function setMsg(t, appUri) {
  const m = $('spMsg'); if (!m) return;
  m.innerHTML = esc(t || '') + (appUri ? '<a class="sp-btn sec" id="spAbrirApp" href="' + esc(appUri) + '">Abrir Spotify</a>' : '');
}

function pintarListas() {
  const c = $('spListas'); if (!c) return;
  if (S.cargandoListas) { c.innerHTML = '<p class="sp-ayuda">Cargando tus playlists…</p>'; return; }
  if (S.listasErr) { c.innerHTML = '<p class="sp-ayuda">' + esc(S.listasErr) + '</p>'; return; }
  if (!S.listas) { c.innerHTML = ''; return; }
  if (!S.listas.length) { c.innerHTML = '<p class="sp-ayuda">No hay playlists en tu cuenta.</p>'; return; }
  c.innerHTML = S.listas.map(p => {
    const n = p.tracks && p.tracks.total != null ? p.tracks.total : (p.items && p.items.total != null ? p.items.total : null);
    const img = (p.images && p.images.length) ? p.images[p.images.length - 1].url : '';
    const ab = S.abierta === p.id, id = esc(p.id);
    // Tocar el nombre despliega sus canciones; el botón ▶ de la derecha reproduce la playlist completa.
    return '<div class="sp-grupo' + (ab ? ' abierta' : '') + '" data-id="' + id + '"><div class="sp-pl">'
      + '<button type="button" class="sp-lista" data-a="abrirlista" data-id="' + id + '" aria-expanded="' + ab + '" aria-controls="spPis_' + id + '">'
      + (img ? '<img src="' + esc(img) + '" alt="" referrerpolicy="no-referrer" loading="lazy">' : '<span class="ph"></span>')
      + '<span class="nm"><b>' + esc(p.name) + '</b>' + (n != null ? '<small>' + n + (n === 1 ? ' canción' : ' canciones') + '</small>' : '') + '</span>' + IC.chev + '</button>'
      + '<button type="button" class="sp-plplay" data-a="lista" data-u="' + esc(p.uri) + '" aria-label="Reproducir la playlist ' + esc(p.name) + '">' + IC.play + '</button></div>'
      + '<div class="sp-pistas" id="spPis_' + id + '"' + (ab ? '' : ' hidden') + '></div></div>';
  }).join('');
  if (S.abierta) pintarPistas(S.abierta);
}

const NOTA_AJENA = 'Spotify solo permite ver las canciones de las playlists que tú creaste o en las que colaboras (límite de las apps en modo desarrollo). Esta sí la puedes reproducir con el botón ▶.';
function alternarLista(id) {
  S.abierta = S.abierta === id ? '' : id;
  document.querySelectorAll('#spListas .sp-grupo').forEach(g => {
    const on = g.dataset.id === S.abierta;
    g.classList.toggle('abierta', on);
    g.querySelector('.sp-lista').setAttribute('aria-expanded', on ? 'true' : 'false');
    g.querySelector('.sp-pistas').hidden = !on;
  });
  if (!S.abierta) return;
  pintarPistas(id);
  const g = document.querySelector('#spListas .sp-grupo[data-id="' + id.replace(/"/g, '') + '"]'); if (g) g.scrollIntoView({ block: 'nearest' });
  if (!S.pistas[id]) cargarPistas(id);
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
function pintarPistas(id) {
  const c = $('spPis_' + id); if (!c) return;
  const st = S.pistas[id], pl = (S.listas || []).find(p => p.id === id);
  if (!st || (st.cargando && !st.items.length)) { c.innerHTML = '<p class="sp-nota">Cargando canciones…</p>'; return; }
  let h = st.nota ? '<p class="sp-nota">' + esc(st.nota) + '</p>' : '';
  h += st.items.map((t, i) => '<button type="button" class="sp-pista' + (S.est && S.est.uri === t.uri ? ' actual' : '') + '" data-a="pista" data-u="' + esc(pl ? pl.uri : '')
    + '" data-t="' + esc(t.uri) + '"' + (t.local ? ' disabled' : '') + '><span class="n">' + (i + 1) + '</span><span class="t"><b>' + esc(t.nombre) + '</b><small>'
    + esc(t.artista) + '</small></span><span class="d">' + (t.dur ? fmt(t.dur) : '') + '</span></button>').join('');
  if (st.next) h += '<button type="button" class="sp-btn sec" data-a="mas" data-id="' + esc(id) + '"' + (st.cargando ? ' disabled' : '') + '>' + (st.cargando ? 'Cargando…' : 'Ver más canciones') + '</button>';
  c.innerHTML = h;
}
function marcarActual() {   // resalta la canción que suena, sin volver a dibujar la lista
  document.querySelectorAll('#spListas .sp-pista').forEach(b => b.classList.toggle('actual', !!(S.est && S.est.uri === b.dataset.t)));
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
  const vista = !clientId() ? 'id' : !con ? 'con' : 'rep';
  const cuerpo = $('spCuerpo');
  if (S.vista !== vista) {
    cuerpo.innerHTML = vista === 'id' ? vistaSinId() : vista === 'con' ? vistaConectar() : vistaReproductor();
    S.vista = vista;
    if (vista === 'rep') cargarListas();
    pintarListas();
  }
  if (vista === 'rep') {
    const e = S.est;
    $('spTit').textContent = e ? e.titulo : 'Nada sonando';
    $('spArtista').textContent = e ? e.artista : (S.error || 'Abre Spotify en tu celular y reproduce algo; aquí aparecerá.');
    $('spDisp').textContent = e && e.disp ? 'Sonando en ' + e.disp : '';
    $('spPP').innerHTML = e && e.playing ? IC.pausa : IC.play;
    const im = $('spArt'), ph = $('spArtPh');
    if (e && e.img) { if (im.getAttribute('src') !== e.img) im.src = e.img; im.hidden = false; ph.hidden = true; } else { im.hidden = true; ph.hidden = false; }
    const lnk = $('spAbrirSp'); if (lnk) lnk.href = (e && e.url) || 'https://open.spotify.com';
    if (S.error && e) setMsg(S.error);
    marcarActual();
  }
  progreso();
}
function progreso() {
  const e = S.est; if (!e) return;
  const p = posActual(), pct = e.dur ? (100 * p / e.dur) : 0;
  if (S.abierto && $('spBar')) { $('spBar').style.width = pct + '%'; $('spT1').textContent = fmt(p); $('spT2').textContent = fmt(e.dur); }
  if ($('spmBar')) $('spmBar').style.width = pct + '%';
}

/* ───────────── Abrir / cerrar ───────────── */
function abrir() {
  if (!permitido()) return;
  asegurarUi();
  S.foco = document.activeElement; S.abierto = true; S.vista = '';
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
  procesarRetorno().then(() => { pintar(); programar(); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
