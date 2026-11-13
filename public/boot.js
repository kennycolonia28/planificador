/* Planificador · conexión con la nube
   1. Revisa la sesión (si no hay, vuelve a la pantalla de acceso).
   2. Trae tu planificador del servidor y lo deja listo para la app.
   3. Cada cambio se guarda solo en la nube (agrupando lo que escribes seguido).
   4. Sin internet: guarda en este dispositivo y sube al volver la conexión.
   5. Si cambiaste en otro dispositivo, trae esos cambios; si hubo cambios en los dos a la vez, te pregunta.
   6. Avisa cuando hay una versión nueva del planificador. */
(function () {
  "use strict";
  /* versión de la app: súbela (aquí y en /version.json) cada vez que publiques un cambio */
  const APP_V = 13;
  const PUSH_DELAY = 900, PULL_EVERY = 30_000, VERSION_EVERY = 5 * 60_000;

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  let me = null, KEY = null, META = null;
  let timer = null, inflight = false, lastJSON = null, blocked = false, stale = false;

  /* --- pantalla de carga --- */
  const cover = document.createElement("div");
  cover.className = "ccover";
  cover.innerHTML = `<div class="cbox"><div class="cspin" aria-hidden="true"></div><p id="cmsg">Cargando tu planificador…</p></div>`;
  document.body.appendChild(cover);
  const coverMsg = t => { const p = $("cmsg"); if (p) p.innerHTML = t; };

  /* --- estado de guardado (esquina de la cabecera) --- */
  function status(kind, text) {
    const el = $("csync"); if (!el) return;
    el.className = "csync " + kind; el.textContent = text;
    el.title = { ok: "Todo está guardado en tu cuenta", busy: "Guardando en tu cuenta…", off: "Sin conexión: se guarda en este dispositivo y se sube al volver internet", bad: "No se pudo guardar. Se reintentará solo." }[kind] || "";
  }

  /* --- utilidades --- */
  const meta = () => { try { return JSON.parse(localStorage.getItem(META)) || { rev: 0, pending: false }; } catch { return { rev: 0, pending: false }; } };
  const setMeta = m => { try { localStorage.setItem(META, JSON.stringify(m)); } catch {} };
  /* lo que es solo de esta pantalla (hora "desde", secciones abiertas) no se sube */
  const strip = s => { const o = { ...s }; delete o.from; delete o.day; delete o.ui; return o; };
  async function api(path, opt = {}) {
    const r = await fetch(path, { ...opt, headers: { "content-type": "application/json", ...(opt.headers || {}) }, credentials: "same-origin" });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { goLogin(); throw Object.assign(new Error("401"), { status: 401 }); }
    return { ok: r.ok, status: r.status, d };
  }
  function goLogin() { location.replace("/"); }
  const editing = () => { const a = document.activeElement; return a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); };

  /* --- subir cambios --- */
  function push() {
    if (blocked || !window.getState) return;
    const s = window.getState(); if (!s) return;
    const j = JSON.stringify(strip(s));
    if (j === lastJSON && !meta().pending) return;
    const m = meta(); if (!m.pending) { m.pending = true; setMeta(m); }
    status("busy", "Guardando…");
    clearTimeout(timer); timer = setTimeout(send, PUSH_DELAY);
  }
  async function send(force) {
    if (blocked) return;
    if (inflight) { clearTimeout(timer); timer = setTimeout(send, 400); return; }
    const s = window.getState(); if (!s) return;
    const data = strip(s), j = JSON.stringify(data), m = meta();
    inflight = true;
    try {
      const r = await api("/api/state", { method: "PUT", body: JSON.stringify({ data, baseRev: m.rev, appV: APP_V, force: !!force }) });
      if (r.ok) {
        lastJSON = j;
        const now = JSON.stringify(strip(window.getState()));
        setMeta({ rev: r.d.rev, pending: now !== j });
        if (now !== j) { clearTimeout(timer); timer = setTimeout(send, PUSH_DELAY); }
        else status("ok", "Guardado ✓");
      } else if (r.status === 409) {
        status("bad", "Cambios en otro dispositivo");
        await conflict();
      } else if (r.status === 426) {
        blocked = true; status("bad", "Recarga para seguir guardando"); newVersion(true);
      } else if (r.status === 413) {
        status("bad", "Demasiado grande para guardar");
      } else {
        status("bad", "No se guardó · reintentando"); retry();
      }
    } catch (e) {
      if (e.status !== 401) { status("off", "Sin conexión · guardado aquí"); retry(); }
    } finally { inflight = false; }
  }
  function retry() { clearTimeout(timer); timer = setTimeout(send, 15_000); }

  /* --- traer cambios hechos en otro dispositivo --- */
  async function pull() {
    if (blocked || inflight || document.hidden || editing()) return;
    const m = meta(); if (m.pending) return;   // primero se sube lo tuyo; si chocan, se pregunta
    try {
      const r = await api("/api/state?rev=" + m.rev);
      if (!r.ok || r.d.unchanged || !r.d.data) return;
      if (meta().pending || editing()) return;
      if (r.d.appV > APP_V) { newVersion(true); return; }
      setMeta({ rev: r.d.rev, pending: false });
      window.applyState(r.d.data, "Actualizado con los cambios de otro dispositivo.");
      status("ok", "Guardado ✓");
    } catch {}
  }

  /* --- conflicto: cambiaste aquí y en otro dispositivo a la vez --- */
  async function conflict() {
    let server;
    try { server = (await api("/api/state")).d; } catch { retry(); return; }
    if (server.data && JSON.stringify(server.data) === JSON.stringify(strip(window.getState()))) {
      setMeta({ rev: server.rev, pending: false }); lastJSON = JSON.stringify(server.data); status("ok", "Guardado ✓"); return;
    }
    const when = server.updatedAt ? new Date(server.updatedAt).toLocaleString("es-PE", { weekday: "long", hour: "2-digit", minute: "2-digit" }) : "";
    const pick = await ask(
      "Tu planificador cambió en otro dispositivo",
      `Mientras editabas aquí, se guardaron cambios desde otro dispositivo${when ? " (" + esc(when) + ")" : ""}. ¿Cuál versión quieres conservar? La otra se descarta.`,
      [["cloud", "Usar la del otro dispositivo"], ["mine", "Quedarme con la de aquí", true]]);
    if (pick === "cloud") {
      setMeta({ rev: server.rev, pending: false });
      if (server.appV > APP_V) { newVersion(true); return; }
      window.applyState(server.data, "Listo: se cargó la versión del otro dispositivo.");
      status("ok", "Guardado ✓");
    } else {
      const m = meta(); m.rev = server.rev; setMeta(m);
      await send(true);
    }
  }
  function ask(title, text, opts) {
    return new Promise(res => {
      const d = document.createElement("div"); d.className = "cmodal";
      d.innerHTML = `<div class="cdlg" role="alertdialog" aria-modal="true"><h3>${esc(title)}</h3><p>${text}</p><div class="cbtns">${opts.map(([k, l, p]) => `<button type="button" data-k="${k}" class="${p ? "cprim" : ""}">${esc(l)}</button>`).join("")}</div></div>`;
      document.body.appendChild(d);
      d.querySelector(".cprim")?.focus();
      d.onclick = e => { const b = e.target.closest("button[data-k]"); if (!b) return; d.remove(); res(b.dataset.k); };
    });
  }

  /* --- versión nueva --- */
  function newVersion(must) {
    if ($("cnew")) return;
    const b = document.createElement("div"); b.id = "cnew"; b.className = "cnew";
    b.innerHTML = `<span>${must ? "Hay una versión nueva del planificador. Recarga para seguir guardando." : "Hay una versión nueva del planificador."}</span><button type="button">Recargar</button>`;
    b.querySelector("button").onclick = async () => { if (meta().pending && !blocked) { await send(); } location.reload(); };
    document.body.appendChild(b);
  }
  async function checkVersion() {
    try {
      const r = await fetch("/version.json?t=" + Date.now(), { cache: "no-store" });
      const v = (await r.json()).v | 0;
      if (v > APP_V) newVersion(false);
    } catch {}
  }

  /* --- menú de cuenta --- */
  function accountMenu() {
    const box = $("acct"); if (!box) return;
    box.innerHTML = `<span class="csync ok" id="csync">Guardado ✓</span>
      <details class="cacc"><summary title="${esc(me.email)}"><span class="cav">${esc(me.email[0].toUpperCase())}</span></summary>
      <div class="cmenu"><div class="cme">${esc(me.email)}</div>
        ${me.role === "admin" ? `<a href="/admin">Administración</a>` : ""}
        <button type="button" data-a="pass">Cambiar contraseña</button>
        <button type="button" data-a="out">Cerrar sesión</button>
        <button type="button" data-a="del" class="cdanger">Borrar mi cuenta</button></div></details>`;
    const det = box.querySelector("details");
    document.addEventListener("mousedown", e => { if (det.open && !det.contains(e.target)) det.open = false; });
    box.querySelector(".cmenu").onclick = async e => {
      const b = e.target.closest("button[data-a]"); if (!b) return; det.open = false;
      if (b.dataset.a === "out") return logout();
      if (b.dataset.a === "pass") return changePass(false);
      if (b.dataset.a === "del") return deleteAccount();
    };
  }
  async function logout() {
    if (meta().pending && !blocked) { status("busy", "Guardando…"); clearTimeout(timer); await send(); }
    if (meta().pending) {
      const k = await ask("Hay cambios sin subir", "No hay conexión y algunos cambios aún no se subieron a tu cuenta. Si cierras sesión ahora se pierden.", [["stay", "Esperar", true], ["go", "Cerrar igual"]]);
      if (k === "stay") return;
    }
    try { await fetch("/api/logout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); } catch {}
    try { localStorage.removeItem(KEY); localStorage.removeItem(META); } catch {}  // en computadoras compartidas no quedan tus datos
    goLogin();
  }
  /* diálogo con campos de contraseña; onSubmit devuelve un texto de error o nada si salió bien */
  function form({ title, text, fields, ok, danger, noCancel, onSubmit }) {
    return new Promise(res => {
      const d = document.createElement("div"); d.className = "cmodal";
      d.innerHTML = `<form class="cdlg" novalidate><h3>${esc(title)}</h3>${text ? `<p>${text}</p>` : ""}${fields.map(([n, l, ac]) => `<label class="cfld">${esc(l)}<input type="password" name="${n}" autocomplete="${ac}"></label>`).join("")}
        <p class="cerr" role="status"></p><div class="cbtns">${noCancel ? "" : `<button type="button" data-x>Cancelar</button>`}<button type="submit" class="${danger ? "cred" : "cprim"}">${esc(ok)}</button></div></form>`;
      document.body.appendChild(d);
      const f = d.querySelector("form"), btn = f.querySelector("[type=submit]");
      f.querySelector("input").focus();
      const x = f.querySelector("[data-x]"); if (x) x.onclick = () => { d.remove(); res(false); };
      f.onsubmit = async e => {
        e.preventDefault(); btn.disabled = true;
        let msg; try { msg = await onSubmit(Object.fromEntries(new FormData(f))); } catch (er) { msg = er && er.status === 401 ? null : "Sin conexión. Inténtalo otra vez."; }
        btn.disabled = false;
        if (msg) { f.querySelector(".cerr").textContent = msg; return; }
        d.remove(); res(true);
      };
    });
  }
  async function changePass(forced) {
    const done = await form({
      title: forced ? "Crea tu contraseña" : "Cambiar contraseña",
      text: forced ? "Entraste con una contraseña temporal. Crea una nueva para continuar." : "",
      fields: [["password", forced ? "Contraseña temporal" : "Contraseña actual", "current-password"], ["newPassword", "Contraseña nueva (mínimo 8 caracteres)", "new-password"], ["again", "Repite la contraseña nueva", "new-password"]],
      ok: "Guardar", noCancel: forced,
      onSubmit: async v => {
        if ((v.newPassword || "").length < 8) return "La contraseña nueva debe tener al menos 8 caracteres.";
        if (v.newPassword !== v.again) return "Las contraseñas nuevas no coinciden.";
        const x = await api("/api/password", { method: "POST", body: JSON.stringify({ password: v.password, newPassword: v.newPassword }) });
        return x.ok ? null : x.d.error || "No se pudo cambiar.";
      }
    });
    if (done && window.flash) flash("Contraseña cambiada. Se cerró la sesión en tus otros dispositivos.");
  }
  async function deleteAccount() {
    const done = await form({
      title: "Borrar mi cuenta", danger: true, ok: "Borrar para siempre",
      text: "Se borran tu cuenta y todo tu planificador, sin forma de recuperarlo. Si quieres conservar algo, primero descarga tu <b>respaldo .txt</b>.",
      fields: [["password", "Escribe tu contraseña para confirmar", "current-password"]],
      onSubmit: async v => { const x = await api("/api/account/delete", { method: "POST", body: JSON.stringify({ password: v.password }) }); return x.ok ? null : x.d.error || "No se pudo borrar."; }
    });
    if (!done) return;
    blocked = true;
    try { localStorage.removeItem(KEY); localStorage.removeItem(META); } catch {}
    goLogin();
  }

  /* --- arranque --- */
  async function start() {
    try {
      const r = await api("/api/me"); if (!r.ok) throw 0; me = r.d;
    } catch (e) { if (e && e.status === 401) return; coverMsg("Sin conexión. <button type=button onclick='location.reload()'>Reintentar</button>"); return offlineStart(); }
    KEY = "planificador:" + me.id; META = KEY + ":meta";
    try { localStorage.setItem("planificador:last", me.id); localStorage.setItem("planificador:lastEmail", me.email); } catch {}
    if (me.mustChange) { cover.hidden = true; await changePass(true); cover.hidden = false; }

    let server = null;
    try { const r = await api("/api/state"); if (r.ok) server = r.d; } catch (e) { if (e.status === 401) return; }
    const m = meta(), local = localStorage.getItem(KEY);
    if (server) {
      if (server.appV > APP_V) { newVersion(true); blocked = true; }
      if (m.pending && local) {
        /* hay cambios hechos sin internet en este dispositivo */
        let same = false; try { same = !!server.data && JSON.stringify(server.data) === JSON.stringify(strip(JSON.parse(local))); } catch {}
        if (same) { setMeta({ rev: server.rev, pending: false }); }
        else if (server.rev === m.rev || !server.data) { /* nadie más cambió: se suben */ }
        else {
          cover.hidden = true;
          const k = await ask("Tienes cambios sin subir en este dispositivo",
            "Mientras no tenías internet cambiaste el planificador aquí, y también se guardaron cambios desde otro dispositivo. ¿Cuál versión conservas? La otra se descarta.",
            [["cloud", "La de la nube"], ["mine", "La de este dispositivo", true]]);
          cover.hidden = false;
          if (k === "cloud") { localStorage.setItem(KEY, JSON.stringify(server.data)); setMeta({ rev: server.rev, pending: false }); }
          else setMeta({ rev: server.rev, pending: true });
        }
      } else if (server.data) {
        localStorage.setItem(KEY, JSON.stringify(server.data)); setMeta({ rev: server.rev, pending: false });
      } else {
        /* cuenta nueva: la app crea la plantilla y se sube al iniciar */
        if (!m.pending) localStorage.removeItem(KEY);
        setMeta({ rev: 0, pending: !!m.pending });
      }
      if (server.data && !meta().pending) lastJSON = JSON.stringify(server.data);
    }
    launch(!server);
  }
  function offlineStart() {
    /* sin internet al abrir: usa la copia de este dispositivo (si hay) */
    const id = localStorage.getItem("planificador:last");
    if (!id || !localStorage.getItem("planificador:" + id)) return;
    me = { id, email: localStorage.getItem("planificador:lastEmail") || "", role: "user" };
    KEY = "planificador:" + id; META = KEY + ":meta";
    launch(true);
  }
  function launch(offline) {
    window.PLAN_KEY = KEY;
    window.Cloud = { push, adopt: s => { lastJSON = JSON.stringify(strip(s)); } };
    const s = document.createElement("script");
    s.src = "/app.js?v=" + APP_V;
    s.onload = () => {
      cover.remove();
      accountMenu();
      if (offline) status("off", "Sin conexión · guardado aquí");
      if (meta().pending || lastJSON === null) push(); else status("ok", "Guardado ✓");
      setInterval(pull, PULL_EVERY);
      setInterval(checkVersion, VERSION_EVERY);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) { pull(); checkVersion(); } else if (meta().pending) send(); });
      addEventListener("online", () => { if (meta().pending) send(); else pull(); });
      addEventListener("pagehide", () => {
        /* al cerrar la pestaña, último intento de subir lo pendiente */
        if (!meta().pending || blocked || !window.getState) return;
        try { fetch("/api/state", { method: "PUT", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ data: strip(window.getState()), baseRev: meta().rev, appV: APP_V }) }); } catch {}
      });
      checkVersion();
    };
    s.onerror = () => coverMsg("No se pudo cargar el planificador. <button type=button onclick='location.reload()'>Reintentar</button>");
    document.body.appendChild(s);
  }
  start();
})();
