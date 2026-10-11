import crypto from 'node:crypto';
import * as Ably from 'ably';

/* ---------- Sesión (cookie firmada) ---------- */
const secret = () => process.env.SESSION_SECRET || '';
const mac = p => crypto.createHmac('sha256', secret()).update(p).digest('base64url');
const sign = o => { const p = Buffer.from(JSON.stringify(o)).toString('base64url'); return p + '.' + mac(p); };
const verify = t => {
  if (!t || !secret()) return null;
  const [p, s] = t.split('.');
  if (!p || !s) return null;
  const a = Buffer.from(s), b = Buffer.from(mac(p));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.exp && o.exp < Date.now() ? null : o; }
  catch { return null; }
};
const cookies = req => Object.fromEntries((req.headers.get('cookie') || '').split(/;\s*/).filter(Boolean).map(c => {
  const i = c.indexOf('='); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))];
}));
const setCookie = (n, v, age) => `${n}=${encodeURIComponent(v)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const getSession = req => verify(cookies(req).session) || {};
const origin = req => process.env.SITE_URL || new URL(req.url).origin;

/* ---------- Inicio de sesión con Discord y Roblox ---------- */
const P = {
  discord: { auth: 'https://discord.com/oauth2/authorize', token: 'https://discord.com/api/oauth2/token',
    me: 'https://discord.com/api/users/@me', scope: 'identify', id: 'DISCORD_CLIENT_ID', secret: 'DISCORD_CLIENT_SECRET' },
  roblox: { auth: 'https://apis.roblox.com/oauth/v1/authorize', token: 'https://apis.roblox.com/oauth/v1/token',
    me: 'https://apis.roblox.com/oauth/v1/userinfo', scope: 'openid profile', id: 'ROBLOX_CLIENT_ID', secret: 'ROBLOX_CLIENT_SECRET', pkce: true },
};
const start = p => async req => {
  const c = P[p], state = crypto.randomBytes(16).toString('hex'), verifier = crypto.randomBytes(32).toString('base64url');
  const q = { client_id: process.env[c.id], redirect_uri: origin(req) + '/auth/' + p + '/callback', response_type: 'code', scope: c.scope, state };
  if (c.pkce) { q.code_challenge = crypto.createHash('sha256').update(verifier).digest('base64url'); q.code_challenge_method = 'S256'; }
  const h = new Headers({ Location: c.auth + '?' + new URLSearchParams(q) });
  h.append('Set-Cookie', setCookie('oa_' + p, sign({ state, verifier, exp: Date.now() + 600000 }), 600));
  return new Response(null, { status: 302, headers: h });
};
const callback = p => async req => {
  const c = P[p], url = new URL(req.url), st = verify(cookies(req)['oa_' + p]);
  if (!st || st.state !== url.searchParams.get('state') || !url.searchParams.get('code'))
    return new Response('Autorización rechazada o caducada. Vuelve a la radio e inténtalo otra vez.', { status: 400 });
  try {
    const body = new URLSearchParams({ grant_type: 'authorization_code', code: url.searchParams.get('code'),
      redirect_uri: origin(req) + '/auth/' + p + '/callback', client_id: process.env[c.id], client_secret: process.env[c.secret] });
    if (c.pkce) body.set('code_verifier', st.verifier);
    const t = await (await fetch(c.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })).json();
    if (!t.access_token) throw new Error('sin token');
    const u = await (await fetch(c.me, { headers: { Authorization: 'Bearer ' + t.access_token } })).json();
    const s = getSession(req);
    s[p] = p === 'discord' ? { id: u.id, name: u.global_name || u.username } : { id: u.sub, name: u.preferred_username || u.nickname || u.name };
    s.exp = Date.now() + 30 * 864e5;
    const h = new Headers({ Location: '/' });
    h.append('Set-Cookie', setCookie('session', sign(s), 30 * 86400));
    h.append('Set-Cookie', setCookie('oa_' + p, '', 0));
    return new Response(null, { status: 302, headers: h });
  } catch (e) { return new Response('No se pudo vincular la cuenta.', { status: 500 }); }
};

/* ---------- Roles (salen de tu Discord) ---------- */
async function roles(s) {
  const E = process.env, out = { roles: [], owner: false };
  if (!s.discord) return out;
  out.owner = !!E.OWNER_DISCORD_ID && s.discord.id === E.OWNER_DISCORD_ID;
  if (E.DISCORD_GUILD_ID && E.DISCORD_BOT_TOKEN) {
    try {
      const m = await fetch(`https://discord.com/api/guilds/${E.DISCORD_GUILD_ID}/members/${s.discord.id}`, { headers: { Authorization: 'Bot ' + E.DISCORD_BOT_TOKEN } });
      if (m.ok) {
        const mine = (await m.json()).roles || [], map = { ver: E.ROLE_VERIFICADO, mando: E.ROLE_MANDO, staff: E.ROLE_STAFF };
        out.roles = Object.keys(map).filter(k => map[k] && mine.includes(map[k]));
      }
    } catch {}
  }
  return out;
}

/* ---------- Rutas ---------- */
const routes = {
  '/auth/discord': start('discord'),
  '/auth/roblox': start('roblox'),
  '/auth/discord/callback': callback('discord'),
  '/auth/roblox/callback': callback('roblox'),
  '/api/me': async req => { const s = getSession(req), r = await roles(s);
    return Response.json({ discord: s.discord || null, roblox: s.roblox || null, roles: r.roles, owner: r.owner }); },
  '/api/unlink': async req => {
    const p = new URL(req.url).searchParams.get('p'), s = getSession(req);
    if (['discord', 'roblox'].includes(p)) delete s[p];
    s.exp = Date.now() + 30 * 864e5;
    const h = new Headers({ 'Content-Type': 'application/json' });
    h.append('Set-Cookie', setCookie('session', sign(s), 30 * 86400));
    return new Response('{}', { headers: h });
  },
  // Pase de tiempo real con permisos según el rol: sin Verificado solo canales OOC;
  // solo Mando/Staff/propietario entran en oficinas superiores y mueven gente.
  '/api/ably-token': async req => {
    const s = getSession(req);
    if (!s.discord || !s.roblox) return new Response('No autorizado', { status: 401 });
    const r = await roles(s), has = k => r.owner || r.roles.includes(k), mando = has('mando') || has('staff'), cid = s.discord.id;
    const cap = { global: ['subscribe', 'publish'], lobby: ['subscribe', 'presence'], ['ctl:' + cid]: ['subscribe'], 'room:ooc:*': ['subscribe', 'publish', 'presence'] };
    if (has('ver')) cap['room:all:*'] = ['subscribe', 'publish', 'presence'];
    if (mando) { cap['room:sup:*'] = ['subscribe', 'publish', 'presence']; cap['ctl:*'] = ['publish']; }
    const tr = await new Ably.Rest(process.env.ABLY_API_KEY).auth.createTokenRequest({ clientId: cid, capability: cap, ttl: 3600000 });
    return Response.json(tr);
  },
};

export default async req => {
  const h = routes[new URL(req.url).pathname.replace(/\/$/, '')];
  return h ? h(req) : new Response('No encontrado', { status: 404 });
};

export const config = {
  path: ['/auth/discord', '/auth/roblox', '/auth/discord/callback', '/auth/roblox/callback', '/api/me', '/api/unlink', '/api/ably-token'],
};
