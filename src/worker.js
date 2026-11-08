/* Planificador · servidor (Cloudflare Worker + D1)
   - /api/*  → este archivo
   - todo lo demás → archivos de /public (pantalla de acceso, planificador, admin)
   Las tablas se crean solas la primera vez. El primer usuario que se registra es el administrador
   (no necesita invitación); los demás necesitan un código de invitación creado desde /admin. */

const SESSION_DAYS = 30;
const MAX_STATE = 1_800_000;          // tamaño máximo del planificador de un usuario (bytes)
const PBKDF2_ITER = 100_000;          // máximo que permite Workers
const LOGIN_WINDOW = 15 * 60_000;     // ventana para contar intentos fallidos
const LOGIN_MAX = 8;                  // intentos fallidos por correo en la ventana
const IP_MAX = 40;                    // intentos fallidos por conexión (más alto: una oficina comparte la misma IP)

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, pass TEXT NOT NULL, salt TEXT NOT NULL,
     role TEXT NOT NULL DEFAULT 'user', status TEXT NOT NULL DEFAULT 'active', must_change INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL, last_seen INTEGER)`,
  `CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS states(user_id TEXT PRIMARY KEY, data TEXT NOT NULL, rev INTEGER NOT NULL, app_v INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS invites(code TEXT PRIMARY KEY, note TEXT, created_by TEXT, created_at INTEGER NOT NULL, used_by TEXT, used_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS attempts(k TEXT NOT NULL, at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS attempts_k ON attempts(k, at)`,
];
let ready = false;
async function init(db) {
  if (ready) return;
  await db.batch(SCHEMA.map(s => db.prepare(s)));
  ready = true;
}

/* ---------- utilidades ---------- */
const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const rand = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha = async s => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
async function hashPass(pass, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: PBKDF2_ITER }, key, 256);
  return hex(bits);
}
function same(a, b) { // comparación en tiempo constante
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
const err = (msg, status = 400, extra = {}) => json({ error: msg, ...extra }, status);
const normEmail = e => String(e || "").trim().toLowerCase();
const okEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 200;
const okPass = p => typeof p === "string" && p.length >= 8 && p.length <= 200;
function readCookie(req, name) {
  const c = req.headers.get("cookie") || "";
  const m = c.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : null;
}
function sessionCookie(req, token, maxAge) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
async function body(req) { try { return await req.json(); } catch { return {}; } }

/* ---------- sesiones ---------- */
async function newSession(env, req, userId) {
  const token = rand(32), now = Date.now();
  await env.DB.prepare("INSERT INTO sessions(id,user_id,created_at,expires) VALUES(?,?,?,?)")
    .bind(await sha(token), userId, now, now + SESSION_DAYS * 864e5).run();
  return sessionCookie(req, token, SESSION_DAYS * 86400);
}
async function currentUser(env, req) {
  const token = readCookie(req, "sid");
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const sid = await sha(token);
  const u = await env.DB.prepare(
    "SELECT u.id,u.email,u.role,u.status,u.must_change,u.last_seen,s.expires FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=?"
  ).bind(sid).first();
  if (!u || u.expires < Date.now() || u.status !== "active") return null;
  const now = Date.now();
  if (!u.last_seen || now - u.last_seen > 10 * 60_000) // no escribir en cada petición
    await env.DB.prepare("UPDATE users SET last_seen=? WHERE id=?").bind(now, u.id).run();
  u.sid = sid;
  return u;
}

/* ---------- límite de intentos ---------- */
async function tooMany(env, k, max = LOGIN_MAX) {
  const r = await env.DB.prepare("SELECT COUNT(*) n FROM attempts WHERE k=? AND at>?").bind(k, Date.now() - LOGIN_WINDOW).first();
  return (r?.n || 0) >= max;
}
const fail = (env, k) => env.DB.prepare("INSERT INTO attempts(k,at) VALUES(?,?)").bind(k, Date.now()).run();
const cleanAttempts = env => env.DB.prepare("DELETE FROM attempts WHERE at<?").bind(Date.now() - LOGIN_WINDOW).run();

/* ---------- rutas ---------- */
async function api(req, env, url) {
  const path = url.pathname.replace(/\/+$/, "");
  const m = req.method;

  /* protección contra peticiones desde otros sitios: los cambios solo se aceptan en JSON y desde este mismo dominio */
  if (m !== "GET" && m !== "HEAD") {
    const origin = req.headers.get("origin");
    if (origin && origin !== url.origin) return err("Origen no permitido.", 403);
    if (!(req.headers.get("content-type") || "").includes("application/json")) return err("Formato no permitido.", 415);
  }

  const ip = req.headers.get("cf-connecting-ip") || "local";

  if (path === "/api/setup" && m === "GET") {
    const r = await env.DB.prepare("SELECT COUNT(*) n FROM users").first();
    return json({ firstUser: !r.n });
  }

  if (path === "/api/register" && m === "POST") {
    const b = await body(req), email = normEmail(b.email), invite = String(b.invite || "").trim().toUpperCase();
    if (!okEmail(email)) return err("Escribe un correo válido.");
    if (!okPass(b.password)) return err("La contraseña debe tener al menos 8 caracteres.");
    if (await tooMany(env, "reg:" + ip, 20)) return err("Demasiados intentos. Espera unos minutos.", 429);
    const count = (await env.DB.prepare("SELECT COUNT(*) n FROM users").first()).n;
    let role = "user";
    if (count === 0) role = "admin";
    else {
      const inv = invite && await env.DB.prepare("SELECT code,used_by FROM invites WHERE code=?").bind(invite).first();
      if (!inv || inv.used_by) { await fail(env, "reg:" + ip); return err(inv ? "Ese código de invitación ya fue usado." : "El código de invitación no es válido."); }
    }
    if (await env.DB.prepare("SELECT 1 FROM users WHERE email=?").bind(email).first()) return err("Ya existe una cuenta con ese correo. Inicia sesión.");
    const id = rand(12), salt = rand(16), now = Date.now();
    const stmts = [env.DB.prepare("INSERT INTO users(id,email,pass,salt,role,created_at,last_seen) VALUES(?,?,?,?,?,?,?)")
      .bind(id, email, await hashPass(b.password, salt), salt, role, now, now)];
    if (role === "user") stmts.push(env.DB.prepare("UPDATE invites SET used_by=?, used_at=? WHERE code=? AND used_by IS NULL").bind(id, now, invite));
    await env.DB.batch(stmts);
    return json({ ok: true, role }, 200, { "set-cookie": await newSession(env, req, id) });
  }

  if (path === "/api/login" && m === "POST") {
    const b = await body(req), email = normEmail(b.email);
    if (await tooMany(env, "login:" + email) || await tooMany(env, "ip:" + ip, IP_MAX))
      return err("Demasiados intentos fallidos. Espera 15 minutos e inténtalo otra vez.", 429);
    const u = await env.DB.prepare("SELECT id,pass,salt,status FROM users WHERE email=?").bind(email).first();
    const good = u && same(await hashPass(String(b.password || ""), u.salt), u.pass);
    if (!good) { await fail(env, "login:" + email); await fail(env, "ip:" + ip); return err("Correo o contraseña incorrectos.", 401); }
    if (u.status !== "active") return err("Esta cuenta está desactivada. Escribe al administrador.", 403);
    await cleanAttempts(env);
    await env.DB.prepare("DELETE FROM sessions WHERE expires<?").bind(Date.now()).run();
    return json({ ok: true }, 200, { "set-cookie": await newSession(env, req, u.id) });
  }

  if (path === "/api/logout" && m === "POST") {
    const token = readCookie(req, "sid");
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE id=?").bind(await sha(token)).run();
    return json({ ok: true }, 200, { "set-cookie": sessionCookie(req, "", 0) });
  }

  /* ---- desde aquí, solo con sesión ---- */
  const u = await currentUser(env, req);
  if (!u) return err("Tu sesión terminó. Vuelve a iniciar sesión.", 401);

  if (path === "/api/me" && m === "GET")
    return json({ email: u.email, role: u.role, mustChange: !!u.must_change, id: u.id });

  if (path === "/api/state" && m === "GET") {
    const r = await env.DB.prepare("SELECT data,rev,app_v,updated_at FROM states WHERE user_id=?").bind(u.id).first();
    if (!r) return json({ data: null, rev: 0, appV: 0 });
    /* ?rev=N: si no cambió desde esa versión, no reenvía todo (sirve para revisar cambios de otros dispositivos) */
    const since = +url.searchParams.get("rev");
    if (since && since === r.rev) return json({ unchanged: true, rev: r.rev, appV: r.app_v });
    return json({ data: JSON.parse(r.data), rev: r.rev, appV: r.app_v, updatedAt: r.updated_at });
  }

  if (path === "/api/state" && m === "PUT") {
    const raw = await req.text();
    if (raw.length > MAX_STATE + 2000) return err("El planificador es demasiado grande para guardarse.", 413);
    let b; try { b = JSON.parse(raw); } catch { return err("Datos dañados."); }
    if (!b || typeof b.data !== "object" || !Array.isArray(b.data.cats) || !Array.isArray(b.data.tasks)) return err("Datos incompletos.");
    const appV = b.appV | 0, base = b.baseRev | 0, data = JSON.stringify(b.data), now = Date.now();
    const cur = await env.DB.prepare("SELECT rev,app_v FROM states WHERE user_id=?").bind(u.id).first();
    /* una versión vieja de la app no puede escribir encima de datos ya convertidos por una versión más nueva */
    if (cur && appV < cur.app_v) return err("Hay una versión nueva del planificador. Recarga la página.", 426, { appV: cur.app_v });
    if (cur && cur.rev !== base && !b.force) return err("Se cambió en otro dispositivo.", 409, { rev: cur.rev });
    const rev = (cur ? cur.rev : 0) + 1;
    /* la condición rev=? evita que dos guardados al mismo tiempo se pisen */
    const res = cur
      ? await env.DB.prepare("UPDATE states SET data=?,rev=?,app_v=?,updated_at=? WHERE user_id=? AND rev=?").bind(data, rev, Math.max(appV, cur.app_v), now, u.id, cur.rev).run()
      : await env.DB.prepare("INSERT OR IGNORE INTO states(user_id,data,rev,app_v,updated_at) VALUES(?,?,?,?,?)").bind(u.id, data, rev, appV, now).run();
    if (!res.meta.changes) return err("Se cambió en otro dispositivo.", 409, { rev: cur ? cur.rev + 1 : 1 });
    return json({ ok: true, rev, updatedAt: now });
  }

  if (path === "/api/password" && m === "POST") {
    const b = await body(req);
    if (!okPass(b.newPassword)) return err("La contraseña nueva debe tener al menos 8 caracteres.");
    const row = await env.DB.prepare("SELECT pass,salt FROM users WHERE id=?").bind(u.id).first();
    if (!same(await hashPass(String(b.password || ""), row.salt), row.pass)) return err("La contraseña actual no es correcta.", 401);
    const salt = rand(16);
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET pass=?,salt=?,must_change=0 WHERE id=?").bind(await hashPass(b.newPassword, salt), salt, u.id),
      env.DB.prepare("DELETE FROM sessions WHERE user_id=? AND id<>?").bind(u.id, u.sid), // cierra las demás sesiones
    ]);
    return json({ ok: true });
  }

  if (path === "/api/account/delete" && m === "POST") {
    const b = await body(req);
    const row = await env.DB.prepare("SELECT pass,salt,role FROM users WHERE id=?").bind(u.id).first();
    if (!same(await hashPass(String(b.password || ""), row.salt), row.pass)) return err("La contraseña no es correcta.", 401);
    if (row.role === "admin") {
      const n = (await env.DB.prepare("SELECT COUNT(*) n FROM users WHERE role='admin' AND status='active'").first()).n;
      if (n <= 1) return err("Eres el único administrador: no puedes borrar tu cuenta.", 400);
    }
    await env.DB.batch([
      env.DB.prepare("DELETE FROM states WHERE user_id=?").bind(u.id),
      env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(u.id),
      env.DB.prepare("DELETE FROM users WHERE id=?").bind(u.id),
    ]);
    return json({ ok: true }, 200, { "set-cookie": sessionCookie(req, "", 0) });
  }

  /* ---- administrador ---- */
  if (path.startsWith("/api/admin/")) {
    if (u.role !== "admin") return err("Solo para administradores.", 403);

    if (path === "/api/admin/users" && m === "GET") {
      const r = await env.DB.prepare(
        `SELECT u.id,u.email,u.role,u.status,u.created_at,u.last_seen,u.must_change,s.updated_at,s.rev,LENGTH(s.data) size
         FROM users u LEFT JOIN states s ON s.user_id=u.id ORDER BY u.created_at`).all();
      return json({ users: r.results, me: u.id });
    }
    if (path === "/api/admin/invites" && m === "GET") {
      const r = await env.DB.prepare(
        `SELECT i.code,i.note,i.created_at,i.used_at,u.email used_email FROM invites i LEFT JOIN users u ON u.id=i.used_by ORDER BY i.created_at DESC LIMIT 200`).all();
      return json({ invites: r.results });
    }
    if (path === "/api/admin/invites" && m === "POST") {
      const b = await body(req), n = Math.min(20, Math.max(1, b.count | 0 || 1)), note = String(b.note || "").slice(0, 80);
      const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", codes = [];
      for (let i = 0; i < n; i++) {
        const r = crypto.getRandomValues(new Uint8Array(8));
        codes.push([...r].map(x => A[x % A.length]).join("").replace(/^(.{4})/, "$1-"));
      }
      await env.DB.batch(codes.map(c => env.DB.prepare("INSERT INTO invites(code,note,created_by,created_at) VALUES(?,?,?,?)").bind(c, note, u.id, Date.now())));
      return json({ codes });
    }
    const mi = path.match(/^\/api\/admin\/invites\/([A-Z0-9-]+)$/);
    if (mi && m === "DELETE") {
      await env.DB.prepare("DELETE FROM invites WHERE code=? AND used_by IS NULL").bind(mi[1]).run();
      return json({ ok: true });
    }
    const mu = path.match(/^\/api\/admin\/users\/([0-9a-f]+)\/(status|reset|role)$/);
    if (mu && m === "POST") {
      const [, id, act] = mu, b = await body(req);
      if (id === u.id && act !== "reset") return err("No puedes cambiar tu propia cuenta desde aquí.");
      const t = await env.DB.prepare("SELECT id FROM users WHERE id=?").bind(id).first();
      if (!t) return err("No existe esa cuenta.", 404);
      if (act === "status") {
        const st = b.status === "disabled" ? "disabled" : "active";
        const q = [env.DB.prepare("UPDATE users SET status=? WHERE id=?").bind(st, id)];
        if (st === "disabled") q.push(env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(id));
        await env.DB.batch(q);
        return json({ ok: true });
      }
      if (act === "role") {
        await env.DB.prepare("UPDATE users SET role=? WHERE id=?").bind(b.role === "admin" ? "admin" : "user", id).run();
        return json({ ok: true });
      }
      /* reset: contraseña temporal que se muestra una sola vez; el usuario debe cambiarla al entrar */
      const A = "abcdefghjkmnpqrstuvwxyz23456789", r = crypto.getRandomValues(new Uint8Array(12));
      const temp = [...r].map(x => A[x % A.length]).join("").replace(/(.{4})(.{4})(.{4})/, "$1-$2-$3"), salt = rand(16);
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET pass=?,salt=?,must_change=1 WHERE id=?").bind(await hashPass(temp, salt), salt, id),
        env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(id),
      ]);
      return json({ ok: true, temp });
    }
  }

  return err("No encontrado.", 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      try { await init(env.DB); return await api(req, env, url); }
      catch (e) { console.error(e); return err("Error del servidor. Inténtalo otra vez.", 500); }
    }
    return env.ASSETS.fetch(req);
  },
};
