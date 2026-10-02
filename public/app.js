"use strict";
(() => {
/* =====================================================================
   Yardımcılar
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const isMobile = () => matchMedia("(max-width: 760px)").matches;
const coarse = matchMedia("(pointer: coarse)").matches;
const SECURE = window.isSecureContext;
const NATIVE = window.YerelApp || null; // Android uygulaması içindeyse köprü
const nativeFg = () => { try { return NATIVE.isForeground(); } catch (_) { return true; } };
const DEVICE = (() => {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad/i.test(ua)) return "iPhone";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS/i.test(ua)) return "Mac";
  if (/Linux/i.test(ua)) return "Linux";
  return "Cihaz";
})();
const hashHue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; };
const initials = (n) => String(n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const pad = (n) => String(n).padStart(2, "0");
const fmtTime = (ts) => { const d = new Date(ts); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
const dayKey = (ts) => new Date(ts).toDateString();
function fmtDay(ts) {
  const d = new Date(ts), t = new Date();
  if (d.toDateString() === t.toDateString()) return "Bugün";
  const y = new Date(t); y.setDate(t.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Dün";
  const o = { day: "numeric", month: "long" };
  if (d.getFullYear() !== t.getFullYear()) o.year = "numeric";
  return d.toLocaleDateString("tr-TR", o);
}
function fmtListTime(ts) {
  const d = new Date(ts), t = new Date();
  if (d.toDateString() === t.toDateString()) return fmtTime(ts);
  if (t - d < 6 * 864e5) return d.toLocaleDateString("tr-TR", { weekday: "short" });
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
}
function fmtSize(n) {
  if (n < 1024) return n + " B";
  const u = ["KB", "MB", "GB", "TB"]; let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return (n >= 100 ? n.toFixed(0) : n.toFixed(1)).replace(".", ",") + " " + u[i];
}
const fmtDur = (s) => { s = Math.max(0, Math.round(s || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return (h ? h + ":" + pad(m) : m) + ":" + pad(s % 60); };
function lastSeenText(u) {
  if (!u) return "";
  if (u.online) return "çevrimiçi";
  if (!u.lastSeen) return "uzun zamandır görülmedi";
  const d = new Date(u.lastSeen), t = new Date();
  if (t - d < 60e3) return "az önce görüldü";
  if (d.toDateString() === t.toDateString()) return "son görülme " + fmtTime(u.lastSeen);
  return "son görülme " + fmtDay(u.lastSeen).toLowerCase() + " " + fmtTime(u.lastSeen);
}
function linkify(text) {
  return esc(text).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)"'\]])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

/* ---------------- İkonlar ---------------- */
const I = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  send: '<path d="M4.5 12L20 4.5 16.5 20l-4-6.2z" fill="currentColor" stroke="none"/><path d="M12.5 13.8L20 4.5"/>',
  mic: '<rect x="9" y="3" width="6" height="11.5" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  micOff: '<rect x="9" y="3" width="6" height="11.5" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M3.5 3.5l17 17"/>',
  clip: '<path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4L14.8 7"/>',
  phone: '<path d="M6.5 3.5h3l1.8 4.6-2.3 1.4a11.5 11.5 0 0 0 5.5 5.5l1.4-2.3 4.6 1.8v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z"/>',
  hangup: '<path d="M3 14.5c5-4.6 13-4.6 18 0l-1.6 3-4-1.2v-2.7a10 10 0 0 0-6.8 0v2.7l-4 1.2z" fill="currentColor" stroke="none"/>',
  video: '<rect x="3" y="6" width="12.5" height="12" rx="2.5"/><path d="M15.5 10.2L21 7v10l-5.5-3.2"/>',
  videoOff: '<rect x="3" y="6" width="12.5" height="12" rx="2.5"/><path d="M15.5 10.2L21 7v10l-5.5-3.2M3 3l18 18"/>',
  flip: '<path d="M4 8.5h3l2-3h6l2 3h3V19H4z"/><path d="M9 13.5a3 3 0 0 1 5.4-1.6M15 13.5a3 3 0 0 1-5.4 1.6"/>',
  more: '<circle cx="12" cy="5.5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="18.5" r="1.4" fill="currentColor"/>',
  reply: '<path d="M10 7.5L4.5 12.5 10 17.5M4.5 12.5H14a5.5 5.5 0 0 1 5.5 5.5v1"/>',
  copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
  edit: '<path d="M4 20h4L19.5 8.5l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 13h9l1-13M9 7V4h6v3"/>',
  forward: '<path d="M14 7.5l5.5 5-5.5 5M19.5 12.5H10A5.5 5.5 0 0 0 4.5 18v1"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  checks: '<path d="M1.5 12.5L6 17l9.5-9.5M10.5 16l1 1L21 7.5"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.2l2.8 1.8"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.2v.3"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  pause: '<path d="M7.5 5h3v14h-3zM13.5 5h3v14h-3z" fill="currentColor" stroke="none"/>',
  bookmark: '<path d="M6.5 3.5h11V21L12 17l-5.5 4z"/>',
  group: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M15.5 4.6a3.5 3.5 0 0 1 0 6.8M21.5 20a6.5 6.5 0 0 0-3.8-5.9"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 21h4"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  chev: '<path d="M7 10l5 5 5-5"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  shieldOk: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  arrowIn: '<path d="M17 7L7 17M7 9v8h8"/>',
  arrowOut: '<path d="M7 17L17 7M9 7h8v8"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  install: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M12 7v7M9 11l3 3 3-3"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.6-1-2.6 0-.9.7-1.7 1.7-1.7H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="14.5" cy="7" r="1.2"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l2.5 2.5M18.5 4.5l2 2"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  retry: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/>',
};
const icon = (n, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[n] || ""}</svg>`;

/* =====================================================================
   Durum
   ===================================================================== */
const S = {
  token: localStorage.getItem("yerel.token"),
  info: null, me: null,
  users: new Map(), chats: new Map(), messages: new Map(), more: new Map(),
  cur: null, connId: null, chatLayer: null,
  typing: new Map(), drafts: new Map(),
  reply: null, editing: null,
  online: false, atBottom: true, newBelow: 0, loadingOlder: false,
  installPrompt: null,
};
const app = $("#app");

/* ---------------- Geçmiş (Android geri tuşu) ---------------- */
const layers = [];
let expectPop = 0, navWait = Promise.resolve(), popResolve = null;
function pushLayer(closeFn) {
  const e = { closeFn, closed: false };
  layers.push(e);
  navWait = navWait.then(() => history.pushState({ y: layers.length }, ""));
  return { close: () => closeLayer(e), entry: e };
}
function closeLayer(e) {
  if (e.closed) return;
  e.closed = true;
  const i = layers.indexOf(e);
  if (i >= 0) layers.splice(i, 1);
  e.closeFn();
  expectPop++;
  navWait = navWait.then(() => new Promise((r) => { popResolve = r; history.back(); setTimeout(r, 450); }));
}
addEventListener("popstate", () => {
  if (expectPop > 0) { expectPop--; if (popResolve) { popResolve(); popResolve = null; } return; }
  const e = layers.pop();
  if (e && !e.closed) { e.closed = true; e.closeFn(); }
});

/* ---------------- Bildirim balonu ---------------- */
let toastTimer;
function toast(text, ms = 2200) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.append(t); }
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

/* ---------------- API ---------------- */
async function api(method, url, body) {
  let r;
  try {
    r = await fetch(url, {
      method,
      headers: Object.assign({ "Content-Type": "application/json" }, S.token ? { Authorization: "Bearer " + S.token } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (_) { throw new Error("Sunucuya ulaşılamadı"); }
  let d = {};
  try { d = await r.json(); } catch (_) {}
  if (r.status === 401 && S.token && !/\/api\/(login|register)/.test(url)) { logout(true); }
  if (!r.ok) throw new Error(d.error || "Hata " + r.status);
  return d;
}
function upload(file, onProgress) {
  let xhr;
  const p = new Promise((resolve, reject) => {
    xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/upload?name=${encodeURIComponent(file.name || "dosya")}&mime=${encodeURIComponent(file.type || "application/octet-stream")}`);
    xhr.setRequestHeader("Authorization", "Bearer " + S.token);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let d = {};
      try { d = JSON.parse(xhr.responseText); } catch (_) {}
      xhr.status < 300 && d.id ? resolve(d) : reject(new Error(d.error || "Yükleme başarısız"));
    };
    xhr.onerror = () => reject(new Error("Bağlantı koptu"));
    xhr.onabort = () => reject(new Error("iptal"));
    xhr.send(file);
  });
  p.abort = () => xhr && xhr.abort();
  return p;
}

/* =====================================================================
   Ses efektleri
   ===================================================================== */
const Sound = {
  ctx: null, loop: null,
  ensure() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; } }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  },
  tone(freqs, dur, vol = 0.07, delay = 0) {
    const c = this.ensure(); if (!c) return;
    const t0 = c.currentTime + delay;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    g.gain.setValueAtTime(vol, t0 + dur - 0.05);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    g.connect(c.destination);
    for (const f of freqs) { const o = c.createOscillator(); o.type = "sine"; o.frequency.value = f; o.connect(g); o.start(t0); o.stop(t0 + dur); }
  },
  message() { this.tone([880], 0.09, 0.05); this.tone([1320], 0.12, 0.04, 0.09); },
  ring() {
    this.stop();
    const play = () => { this.tone([523, 659], 0.35, 0.09); this.tone([587, 740], 0.35, 0.09, 0.45); };
    play(); this.loop = setInterval(play, 2600);
    if (navigator.vibrate) navigator.vibrate([400, 300, 400, 1500, 400, 300, 400]);
  },
  ringback() { this.stop(); const play = () => this.tone([440, 480], 1.2, 0.04); play(); this.loop = setInterval(play, 4000); },
  stop() { clearInterval(this.loop); this.loop = null; if (navigator.vibrate) navigator.vibrate(0); if (NATIVE) try { NATIVE.stopRing(); } catch (_) {} },
};
addEventListener("pointerdown", () => Sound.ensure(), { once: true, capture: true });

/* =====================================================================
   Tema
   ===================================================================== */
function applyTheme(t) {
  if (t !== undefined) { t ? localStorage.setItem("yerel.theme", t) : localStorage.removeItem("yerel.theme"); }
  const v = localStorage.getItem("yerel.theme");
  if (v) document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme;
  const dark = v ? v === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  $('meta[name="theme-color"]').content = dark ? "#121822" : "#2B59C3";
  if (NATIVE) try { NATIVE.themeColor(dark ? "#121822" : "#2B59C3"); } catch (_) {}
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme());

/* =====================================================================
   Avatarlar ve başlıklar
   ===================================================================== */
function avatar(o, size = 46) {
  if (o.self) return `<div class="av av-self" style="--s:${size}px">${icon("bookmark")}</div>`;
  const inner = o.avatar ? `<img src="/f/${esc(o.avatar)}" alt="" loading="lazy">` : `<span>${esc(initials(o.name))}</span>`;
  return `<div class="av" style="--s:${size}px;--h:${o.hue == null ? 220 : o.hue}">${inner}${o.online ? '<i class="dot"></i>' : ""}</div>`;
}
const otherUser = (c) => S.users.get(c.members.find((x) => x !== S.me.id) || "");
function chatTitle(c) {
  if (!c) return "";
  if (c.type === "self") return "Kayıtlı Mesajlar";
  if (c.type === "group") return c.name || "Grup";
  const o = otherUser(c);
  return o ? o.name : "Silinmiş hesap";
}
function chatAvatar(c, size) {
  if (c.type === "self") return avatar({ self: true }, size);
  if (c.type === "group") return avatar({ name: c.name, avatar: c.avatar, hue: hashHue(c.id) }, size);
  const o = otherUser(c) || {};
  return avatar({ name: o.name, avatar: o.avatar, hue: o.hue, online: o.online }, size);
}
const userName = (id) => (id === S.me.id ? "Sen" : (S.users.get(id) || {}).name || "Biri");
function preview(m) {
  if (!m) return "";
  if (m.deleted) return "Mesaj silindi";
  if (m.kind === "system") return m.text;
  if (m.kind === "voice") return "Sesli mesaj";
  if (m.kind === "call") return (m.meta && m.meta.video ? "Görüntülü" : "Sesli") + " arama";
  if (m.file) {
    const t = m.file.mime || "";
    const label = t.startsWith("image/") ? "Fotoğraf" : t.startsWith("video/") ? "Video" : t.startsWith("audio/") ? "Ses" : m.file.name;
    return m.text ? label + ", " + m.text : label;
  }
  return m.text;
}

/* =====================================================================
   Giriş ekranı
   ===================================================================== */
function showAuth() {
  const inv = S.info && S.info.invite;
  app.innerHTML = `
  <div class="auth">
    <div class="auth-card">
      <img class="auth-logo" src="/icons/icon-192.png" alt="" width="64" height="64">
      <h1>Yerel</h1>
      <p class="auth-sub">Aynı Wi-Fi'daki cihazlar arasında mesaj, dosya, sesli mesaj ve arama. İnternet gerekmez.</p>
      <div class="seg" role="tablist">
        <button class="on" data-mode="login">Giriş yap</button>
        <button data-mode="register">Hesap oluştur</button>
      </div>
      <form id="authForm" autocomplete="on">
        <label class="fld"><span>Kullanıcı adı</span><input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
        <label class="fld reg-only"><span>Görünen ad</span><input name="name" autocomplete="nickname" placeholder="Örn. Yakup"></label>
        <label class="fld"><span>Şifre</span><input name="password" type="password" autocomplete="current-password" required></label>
        ${inv ? '<label class="fld reg-only"><span>Davet kodu</span><input name="invite" autocapitalize="none"></label>' : ""}
        <p class="auth-err" id="authErr"></p>
        <button class="btn primary wide" type="submit" id="authBtn">Giriş yap</button>
      </form>
      ${SECURE ? "" : secureHint(true)}
    </div>
  </div>`;
  let mode = "login";
  const form = $("#authForm");
  form.classList.add("mode-login");
  $$(".seg button").forEach((b) => b.onclick = () => {
    mode = b.dataset.mode;
    $$(".seg button").forEach((x) => x.classList.toggle("on", x === b));
    form.className = "mode-" + mode;
    $("#authBtn").textContent = mode === "login" ? "Giriş yap" : "Hesap oluştur";
    form.password.autocomplete = mode === "login" ? "current-password" : "new-password";
    $("#authErr").textContent = "";
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("#authBtn"); btn.disabled = true;
    try {
      const body = { username: form.username.value, password: form.password.value };
      if (mode === "register") { body.name = form.name.value; if (form.invite) body.invite = form.invite.value; }
      const d = await api("POST", "/api/" + mode, body);
      S.token = d.token;
      localStorage.setItem("yerel.token", d.token);
      boot();
    } catch (err) { $("#authErr").textContent = err.message; btn.disabled = false; }
  };
  bindSecureHint(app);
}

function secureUrl() {
  if (!S.info || !S.info.https) return null;
  return `https://${location.hostname}:${S.info.httpsPort}${location.pathname}`;
}
function secureHint(onAuth) {
  const url = secureUrl();
  return `<div class="secure-hint ${onAuth ? "on-auth" : ""}">
    <div class="sh-row">${icon("shield")}<p><b>Bağlantı güvenli değil.</b> Sesli mesaj, arama, bildirim ve ana ekrana ekleme için güvenli adres gerekir.</p></div>
    <div class="sh-act">
      ${url ? `<a class="btn small primary" href="${esc(url)}">Güvenli adrese geç</a>` : ""}
      <button class="btn small" data-act="secure-help">Nasıl yapılır?</button>
    </div>
  </div>`;
}
function bindSecureHint(root) {
  root.addEventListener("click", (e) => { if (e.target.closest('[data-act="secure-help"]')) secureHelp(); });
}

/* =====================================================================
   Açılış
   ===================================================================== */
async function boot() {
  applyTheme();
  try { S.info = await (await fetch("/api/info", { cache: "no-store" })).json(); } catch (_) {}
  if (!S.token) return showAuth();
  let d;
  try { d = await api("GET", "/api/bootstrap"); }
  catch (e) {
    if (!S.token) return;
    app.innerHTML = `<div class="auth"><div class="auth-card"><img class="auth-logo" src="/icons/icon-192.png" width="64" height="64" alt=""><h1>Bağlanılamadı</h1><p class="auth-sub">Sunucu kapalı olabilir ya da bu cihaz aynı Wi-Fi'da değil. Termux'ta sunucunun çalıştığını kontrol et.</p><button class="btn primary wide" onclick="location.reload()">Tekrar dene</button></div></div>`;
    return;
  }
  loadBootstrap(d);
  renderShell();
  renderList();
  connectWS();
  registerSW();
  const p = new URLSearchParams(location.search);
  const openId = p.get("chat"), share = p.get("share");
  if (location.search) history.replaceState(null, "", "/");
  if (openId && S.chats.has(openId)) openChat(openId);
  if (share) handleShareInbox();
  if (NATIVE) {
    let nc = ""; try { nc = NATIVE.takeChat(); } catch (_) {}
    if (nc && S.chats.has(nc)) openChat(nc);
    handleShareInbox();
  }
}
window.yerelOpenChat = (id) => { if (S.me && S.chats.has(id)) openChat(id); };
window.yerelShare = () => { if (S.me) handleShareInbox(); };
function loadBootstrap(d) {
  S.me = d.me;
  S.users = new Map(d.users.map((u) => [u.id, u]));
  S.chats = new Map(d.chats.map((c) => [c.id, c]));
}
function logout(expired) {
  if (S.token && !expired) api("POST", "/api/logout").catch(() => {});
  S.token = null;
  localStorage.removeItem("yerel.token");
  try { ws && ws.close(); } catch (_) {}
  if (expired) toast("Oturum sona erdi, tekrar giriş yap");
  setTimeout(() => location.replace("/"), expired ? 900 : 50);
}

/* =====================================================================
   WebSocket
   ===================================================================== */
let ws = null, wsRetry = 0, pingTimer = null, pongTimer = null, hadConnection = false;
function connectWS() {
  if (!S.token) return;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws?t=${encodeURIComponent(S.token)}`);
  ws.onopen = () => {
    wsRetry = 0;
    setOnline(true);
    if (hadConnection) resync();
    hadConnection = true;
    clearInterval(pingTimer);
    pingTimer = setInterval(checkAlive, 20000);
  };
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } onEvent(m); };
  ws.onclose = () => {
    setOnline(false);
    clearInterval(pingTimer); clearTimeout(pongTimer);
    if (S.token) setTimeout(connectWS, Math.min(8000, 600 * ++wsRetry));
  };
  ws.onerror = () => {};
}
function checkAlive() {
  if (!ws || ws.readyState !== 1) return;
  wsSend({ type: "ping" });
  clearTimeout(pongTimer);
  pongTimer = setTimeout(() => { try { ws.close(); } catch (_) {} }, 7000);
}
function wsSend(o) { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(o)); return true; } return false; }
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") { checkAlive(); markRead(); }
});
addEventListener("online", checkAlive);

function setOnline(v) {
  S.online = v;
  const t = $("#sideTitle");
  if (t) t.innerHTML = v ? "Yerel" : `<span class="spin"></span>Bağlanıyor…`;
}
async function resync() {
  try {
    loadBootstrap(await api("GET", "/api/bootstrap"));
    for (const id of [...S.messages.keys()]) if (id !== S.cur) S.messages.delete(id);
    if (S.cur && S.chats.has(S.cur)) { await loadMessages(S.cur); renderMessages(false); renderHeader(); }
    else if (S.cur) closeChat();
    renderList();
  } catch (_) {}
}

function onEvent(m) {
  switch (m.type) {
    case "hello": S.connId = m.connId; break;
    case "pong": clearTimeout(pongTimer); break;
    case "message": {
      S.chats.set(m.chat.id, m.chat);
      const msg = m.message;
      const tmap = S.typing.get(msg.chatId);
      if (tmap) tmap.delete(msg.from);
      insertMessage(msg);
      const mine = msg.from === S.me.id;
      const viewing = S.cur === msg.chatId && (NATIVE ? nativeFg() : document.visibilityState === "visible");
      if (viewing) markRead();
      if (!mine && msg.kind !== "system") {
        if (!viewing || (!NATIVE && !document.hasFocus())) notifyMessage(msg);
        else Sound.message();
      }
      renderList(); updateBadge();
      if (S.cur === msg.chatId) renderHeader();
      break;
    }
    case "message_update": {
      S.chats.set(m.chat.id, m.chat);
      const arr = S.messages.get(m.message.chatId);
      if (arr) {
        const i = arr.findIndex((x) => x.id === m.message.id);
        if (i >= 0) {
          arr[i] = m.message;
          if (S.cur === m.message.chatId) { m.message.deleted ? renderMessages(false) : replaceNode(m.message.id, m.message); }
        }
      }
      renderList();
      break;
    }
    case "read": {
      const c = S.chats.get(m.chatId);
      if (c) {
        c.reads[m.userId] = Math.max(c.reads[m.userId] || 0, m.seq);
        if (m.userId === S.me.id) { c.unread = 0; renderList(); updateBadge(); }
        else if (S.cur === c.id) refreshTicks();
      }
      break;
    }
    case "chat":
      S.chats.set(m.chat.id, m.chat);
      renderList();
      if (S.cur === m.chat.id) renderHeader();
      break;
    case "chat_remove":
      S.chats.delete(m.chatId); S.messages.delete(m.chatId);
      if (S.cur === m.chatId) closeChat();
      renderList();
      break;
    case "cleared":
      S.chats.set(m.chat.id, m.chat);
      S.messages.set(m.chatId, []);
      if (S.cur === m.chatId) renderMessages(true);
      renderList();
      break;
    case "user":
      S.users.set(m.user.id, Object.assign(S.users.get(m.user.id) || {}, m.user));
      if (m.user.id === S.me.id) S.me = Object.assign(S.me, m.user);
      renderList();
      if (S.cur) renderHeader();
      break;
    case "presence": {
      const u = S.users.get(m.userId);
      if (u) { u.online = m.online; u.lastSeen = m.lastSeen; }
      renderList();
      if (S.cur) renderHeader();
      break;
    }
    case "typing": {
      if (!S.typing.has(m.chatId)) S.typing.set(m.chatId, new Map());
      S.typing.get(m.chatId).set(m.userId, Date.now() + 4500);
      renderList();
      if (S.cur === m.chatId) renderHeader();
      break;
    }
    case "signal": Call.onSignal(m); break;
  }
}
setInterval(() => {
  let changed = false;
  const now = Date.now();
  for (const [cid, map] of S.typing) for (const [uid, exp] of map) if (exp < now) { map.delete(uid); changed = true; if (S.cur === cid) renderHeader(); }
  if (changed) renderList();
}, 1000);
function typingNames(chatId) {
  const map = S.typing.get(chatId);
  if (!map) return [];
  return [...map.keys()].filter((u) => u !== S.me.id).map((u) => (S.users.get(u) || {}).name || "Biri");
}

/* =====================================================================
   İskelet
   ===================================================================== */
function renderShell() {
  app.innerHTML = `
  <div class="layout" id="layout">
    <aside class="side">
      <header class="side-h">
        <button class="ibtn" id="btnMenu" aria-label="Ayarlar">${icon("menu")}</button>
        <div class="side-title" id="sideTitle">Yerel</div>
      </header>
      <div class="searchbox">${icon("search")}<input id="q" type="search" placeholder="Sohbet veya kişi ara" autocomplete="off"></div>
      ${SECURE ? "" : `<div class="side-hint">${secureHint(false)}</div>`}
      <div class="chatlist" id="chatList"></div>
      <button class="fab" id="fab" aria-label="Yeni sohbet">${icon("edit")}</button>
    </aside>
    <main class="main" id="main">
      <div class="empty" id="empty">
        <div class="empty-card">
          ${icon("bookmark", "big")}
          <h2>Bir sohbet seç</h2>
          <p>Telefonla bilgisayar arasında dosya ya da metin taşımak için <a href="#" data-open-self>Kayıtlı Mesajlar</a>'ı kullan: bir cihazdan at, diğerinde anında belirsin.</p>
        </div>
      </div>
      <section class="chat" id="chat" hidden>
        <header class="chat-h">
          <button class="ibtn back" id="btnBack" aria-label="Geri">${icon("back")}</button>
          <div class="chat-who" id="chatWho"></div>
          <div class="chat-actions" id="chatActions"></div>
        </header>
        <div class="msgs" id="msgs"><div class="msgs-inner" id="msgsInner"></div></div>
        <button class="tobottom" id="toBottom" hidden aria-label="En alta in">${icon("down")}<span class="cnt" id="toBottomCnt"></span></button>
        <div class="composer" id="composer">
          <div class="cbar" id="cbar" hidden>
            <div class="cbar-ic" id="cbarIc"></div>
            <div class="cbar-body"><b id="cbarTitle"></b><span id="cbarText"></span></div>
            <button class="ibtn sm" id="cbarClose" aria-label="Vazgeç">${icon("close")}</button>
          </div>
          <div class="crow" id="crow">
            <button class="ibtn" id="btnAttach" aria-label="Dosya ekle">${icon("clip")}</button>
            <textarea id="ta" rows="1" placeholder="Mesaj yaz"></textarea>
            <button class="ibtn sendbtn" id="btnSend" aria-label="Gönder">${icon("mic")}</button>
          </div>
          <div class="recbar" id="recbar" hidden>
            <button class="ibtn danger-ic" id="recCancel" aria-label="Kaydı sil">${icon("trash")}</button>
            <span class="recdot"></span><span class="rectime" id="recTime">0:00</span>
            <div class="reclive" id="recLive"></div>
            <button class="ibtn sendbtn" id="recSend" aria-label="Sesli mesajı gönder">${icon("send")}</button>
          </div>
        </div>
        <div class="dropzone" id="dropzone">${icon("download", "big")}<span>Bırak, gönderilsin</span></div>
      </section>
    </main>
  </div>
  <input type="file" id="filePick" multiple hidden>`;
  bindShell();
}

function bindShell() {
  $("#btnMenu").onclick = openSettings;
  $("#fab").onclick = openNewChat;
  $("#q").oninput = () => renderList();
  bindSecureHint($(".side"));
  $("#chatList").onclick = (e) => {
    const it = e.target.closest("[data-chat]");
    if (it) return openChat(it.dataset.chat);
    const u = e.target.closest("[data-user]");
    if (u) startPrivate(u.dataset.user);
  };
  $("#empty").onclick = (e) => { if (e.target.closest("[data-open-self]")) { e.preventDefault(); openChat("self_" + S.me.id); } };
  $("#btnBack").onclick = () => (S.chatLayer ? S.chatLayer.close() : closeChat());
  $("#chatWho").onclick = openChatInfo;

  const msgs = $("#msgs");
  msgs.addEventListener("scroll", onScroll, { passive: true });
  msgs.addEventListener("click", onMsgsClick);
  bindLongPress(msgs);
  msgs.addEventListener("contextmenu", (e) => {
    const n = e.target.closest(".msg");
    if (!n || e.target.closest("a, video, audio")) return;
    e.preventDefault();
    clearTimeout(LP.timer);
    if (Date.now() - LP.at < 800 || document.querySelector(".menu-ov")) return;
    LP.at = Date.now();
    const m = findMsg(n.dataset.id);
    if (m) msgMenu(m, e.clientX, e.clientY);
  });
  if (!coarse) msgs.addEventListener("dblclick", (e) => {
    const n = e.target.closest(".msg");
    if (!n || e.target.closest("a, video, audio, .voice")) return;
    const m = findMsg(n.dataset.id);
    if (m && !m.pending && m.kind !== "call") { window.getSelection().removeAllRanges(); setReply(m); }
  });
  $("#toBottom").onclick = () => scrollBottom(true);

  const ta = $("#ta");
  ta.addEventListener("input", () => { autosize(); updateSendBtn(); sendTyping(); S.drafts.set(S.cur, ta.value); });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !coarse) { e.preventDefault(); sendText(); }
    if (e.key === "Escape") { if (S.reply || S.editing) clearBar(); }
    if (e.key === "ArrowUp" && !ta.value && !S.editing) {
      const arr = S.messages.get(S.cur) || [];
      for (let i = arr.length - 1; i >= 0; i--) if (arr[i].from === S.me.id && arr[i].kind === "text" && !arr[i].deleted && !arr[i].pending) { e.preventDefault(); setEdit(arr[i]); break; }
    }
  });
  ta.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData && e.clipboardData.files || [])];
    if (files.length) { e.preventDefault(); sendFiles(files); }
  });
  $("#btnSend").onclick = () => {
    if (ta.value.trim() || S.editing) sendText();
    else Rec.start();
  };
  $("#btnAttach").onclick = () => $("#filePick").click();
  $("#filePick").onchange = (e) => { const f = [...e.target.files]; e.target.value = ""; if (f.length) sendFiles(f); };
  $("#cbarClose").onclick = clearBar;
  $("#recCancel").onclick = () => Rec.stop(false);
  $("#recSend").onclick = () => Rec.stop(true);

  // Sürükle bırak
  const chat = $("#chat");
  let dragDepth = 0;
  chat.addEventListener("dragenter", (e) => { if ([...e.dataTransfer.types].includes("Files")) { dragDepth++; chat.classList.add("dragging"); } });
  chat.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; chat.classList.remove("dragging"); } });
  chat.addEventListener("dragover", (e) => { if ([...e.dataTransfer.types].includes("Files")) e.preventDefault(); });
  chat.addEventListener("drop", (e) => {
    e.preventDefault(); dragDepth = 0; chat.classList.remove("dragging");
    const files = [...e.dataTransfer.files];
    if (files.length) sendFiles(files);
  });
  addEventListener("resize", () => { if (S.atBottom) scrollBottom(); });
}

/* =====================================================================
   Sohbet listesi
   ===================================================================== */
let listQueued = false;
function renderList() {
  if (listQueued) return;
  listQueued = true;
  requestAnimationFrame(() => { listQueued = false; drawList(); });
}
function drawList() {
  const box = $("#chatList");
  if (!box || !S.me) return;
  const q = ($("#q").value || "").trim().toLocaleLowerCase("tr");
  const chats = [...S.chats.values()].sort((a, b) => {
    if (a.type === "self" && !q) return -1;
    if (b.type === "self" && !q) return 1;
    return ((b.last && b.last.ts) || b.createdAt) - ((a.last && a.last.ts) || a.createdAt);
  });
  let html = "";
  const shown = new Set();
  for (const c of chats) {
    const title = chatTitle(c);
    if (q && !title.toLocaleLowerCase("tr").includes(q)) continue;
    if (c.type === "private") shown.add(otherUser(c) && otherUser(c).id);
    const tn = typingNames(c.id);
    let pv;
    if (tn.length) pv = `<span class="typing">${c.type === "group" ? esc(tn[0]) + " " : ""}yazıyor…</span>`;
    else if (c.last) {
      const own = c.last.from === S.me.id && c.type !== "self";
      const who = c.type === "group" && c.last.kind !== "system" && c.last.from ? esc(userName(c.last.from)) + ": " : own ? "Sen: " : "";
      pv = `<span class="who">${who}</span>${esc(preview(c.last))}`;
    } else pv = c.type === "self" ? "Notlarını ve dosyalarını burada sakla" : "Henüz mesaj yok";
    let tick = "";
    if (c.last && c.last.from === S.me.id && c.type !== "self" && c.last.kind !== "system") tick = isRead(c, c.last) ? icon("checks", "tick read") : icon("check", "tick");
    html += `<div class="ci ${S.cur === c.id ? "active" : ""}" data-chat="${esc(c.id)}">
      ${chatAvatar(c, 50)}
      <div class="ci-b">
        <div class="ci-r1"><span class="ci-t">${esc(title)}</span>${tick}<span class="ci-time">${c.last ? fmtListTime(c.last.ts) : ""}</span></div>
        <div class="ci-r2"><span class="ci-p">${pv}</span>${c.unread ? `<span class="badge">${c.unread > 99 ? "99+" : c.unread}</span>` : ""}</div>
      </div>
    </div>`;
  }
  if (q) {
    const people = [...S.users.values()].filter((u) => u.id !== S.me.id && !shown.has(u.id) && (u.name.toLocaleLowerCase("tr").includes(q) || u.username.includes(q)));
    if (people.length) {
      html += `<div class="list-label">Kişiler</div>` + people.map((u) => `<div class="ci" data-user="${esc(u.id)}">${avatar(u, 50)}<div class="ci-b"><div class="ci-r1"><span class="ci-t">${esc(u.name)}</span></div><div class="ci-r2"><span class="ci-p">@${esc(u.username)} · ${lastSeenText(u)}</span></div></div></div>`).join("");
    }
    if (!html) html = `<div class="list-empty">“${esc(q)}” ile eşleşen sohbet yok.</div>`;
  } else if (S.chats.size <= 1) {
    const others = [...S.users.values()].filter((u) => u.id !== S.me.id);
    html += `<div class="list-empty">${others.length ? "Birine yazmak için sağ alttaki kalem düğmesine dokun." : "Ağda henüz başka kimse yok. Aynı Wi-Fi'daki biri bu adresi açıp hesap oluşturunca burada görünecek."}</div>`;
  }
  box.innerHTML = html;
}
function updateBadge() {
  let n = 0;
  for (const c of S.chats.values()) n += c.unread || 0;
  document.title = n ? `(${n}) Yerel` : "Yerel";
  try { if (navigator.setAppBadge) n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } catch (_) {}
}
function isRead(c, m) {
  for (const [uid, seq] of Object.entries(c.reads || {})) if (uid !== S.me.id && seq >= m.seq) return true;
  return false;
}

/* =====================================================================
   Sohbet açma / kapama
   ===================================================================== */
const curChat = () => S.chats.get(S.cur);
async function openChat(id) {
  const c = S.chats.get(id);
  if (!c) return;
  if (NATIVE) try { NATIVE.clearNotif(id); } catch (_) {}
  if (S.cur && S.cur !== id) S.drafts.set(S.cur, $("#ta").value);
  if (Rec.active) Rec.stop(false);
  S.cur = id; S.reply = null; S.editing = null; S.newBelow = 0; S.atBottom = true;
  $("#empty").hidden = true;
  $("#chat").hidden = false;
  document.body.classList.add("chat-open");
  if (isMobile() && !S.chatLayer) S.chatLayer = pushLayer(() => { S.chatLayer = null; closeChat(); });
  $("#cbar").hidden = true;
  const ta = $("#ta");
  ta.value = S.drafts.get(id) || "";
  autosize(); updateSendBtn();
  renderHeader();
  renderList();
  if (!S.messages.has(id)) {
    $("#msgsInner").innerHTML = `<div class="loading"><span class="spin"></span></div>`;
    try { await loadMessages(id); } catch (e) { toast(e.message); }
    if (S.cur !== id) return;
  }
  renderMessages(true);
  markRead();
  if (!coarse) ta.focus();
}
function closeChat() {
  if (S.cur) S.drafts.set(S.cur, $("#ta").value);
  if (Rec.active) Rec.stop(false);
  S.cur = null;
  if (S.chatLayer) { const l = S.chatLayer; S.chatLayer = null; l.close(); }
  document.body.classList.remove("chat-open");
  $("#chat").hidden = true;
  $("#empty").hidden = false;
  renderList();
}
async function startPrivate(uid) {
  try {
    const d = await api("POST", "/api/chats", { type: "private", userId: uid });
    S.chats.set(d.chat.id, d.chat);
    $("#q").value = "";
    openChat(d.chat.id);
  } catch (e) { toast(e.message); }
}

function renderHeader() {
  const c = curChat();
  if (!c) return;
  let sub = "";
  const tn = typingNames(c.id);
  if (c.type === "self") sub = "tüm cihazların arasında";
  else if (c.type === "private") sub = tn.length ? '<span class="typing">yazıyor…</span>' : esc(lastSeenText(otherUser(c)));
  else {
    const on = c.members.filter((x) => x !== S.me.id && (S.users.get(x) || {}).online).length;
    sub = tn.length ? `<span class="typing">${esc(tn.join(", "))} yazıyor…</span>` : `${c.members.length} üye${on ? `, ${on} çevrimiçi` : ""}`;
  }
  const online = c.type === "private" && otherUser(c) && otherUser(c).online;
  $("#chatWho").innerHTML = `${chatAvatar(c, 40)}<div class="who-t"><b>${esc(chatTitle(c))}</b><small class="${online && !tn.length ? "on" : ""}">${sub}</small></div>`;
  let acts = "";
  if (c.type === "private" && otherUser(c)) {
    acts += `<button class="ibtn" data-call="0" aria-label="Sesli arama">${icon("phone")}</button><button class="ibtn" data-call="1" aria-label="Görüntülü arama">${icon("video")}</button>`;
  }
  acts += `<button class="ibtn" data-info aria-label="Sohbet bilgisi">${icon("more")}</button>`;
  const box = $("#chatActions");
  box.innerHTML = acts;
  box.onclick = (e) => {
    const b = e.target.closest("[data-call]");
    if (b) return Call.start(otherUser(c).id, b.dataset.call === "1");
    if (e.target.closest("[data-info]")) openChatInfo();
  };
}

/* =====================================================================
   Mesajlar: yükleme ve çizim
   ===================================================================== */
const seqOf = (m) => (m.pending ? Infinity : m.seq);
function mergeMessages(id, list) {
  const arr = S.messages.get(id) || [];
  const byId = new Map(arr.map((x) => [x.id, x]));
  for (const m of list) {
    byId.set(m.id, m);
    if (m.clientId) for (const x of arr) if (x.pending && x.clientId === m.clientId) byId.delete(x.id);
  }
  const out = [...byId.values()].sort((a, b) => seqOf(a) - seqOf(b));
  S.messages.set(id, out);
  return out;
}
async function loadMessages(id, before) {
  const d = await api("GET", `/api/chats/${id}/messages?limit=60${before ? "&before=" + before : ""}`);
  mergeMessages(id, d.messages);
  if (before || !S.more.has(id)) S.more.set(id, d.more);
}
const findMsg = (id) => (S.messages.get(S.cur) || []).find((x) => x.id === id);
const visible = (arr) => arr.filter((x) => !x.deleted);
const msgNode = (id) => document.querySelector(`.msg[data-id="${CSS.escape(id)}"]`);

function renderMessages(toBottom) {
  const box = $("#msgsInner");
  const c = curChat();
  if (!box || !c) return;
  const list = visible(S.messages.get(c.id) || []);
  const scroller = $("#msgs");
  const keep = scroller.scrollHeight - scroller.scrollTop;
  let html = S.more.get(c.id) ? `<div class="loading older"><span class="spin"></span></div>` : "";
  if (!list.length) {
    html = c.type === "self"
      ? `<div class="chat-empty">${icon("bookmark", "big")}<b>Kayıtlı Mesajlar</b><p>Buraya attığın metin, fotoğraf ve dosyalar giriş yaptığın tüm cihazlarda görünür. Bilgisayardan sürükle bırak ya da Ctrl+V ile yapıştır; telefonda başka bir uygulamadan “Paylaş → Yerel” ile gönder.</p></div>`
      : `<div class="chat-empty"><b>Henüz mesaj yok</b><p>İlk mesajı sen gönder.</p></div>`;
  }
  for (let i = 0; i < list.length; i++) html += msgHTML(list[i], list[i - 1], list[i + 1]);
  box.innerHTML = html;
  if (toBottom) scrollBottom();
  else if (!S.atBottom) scroller.scrollTop = scroller.scrollHeight - keep;
  else scrollBottom();
}
function appendLast(m) {
  const list = visible(S.messages.get(S.cur) || []);
  const i = list.indexOf(m);
  const prev = list[i - 1];
  const box = $("#msgsInner");
  if (!prev) return renderMessages(true);
  const empty = box.querySelector(".chat-empty");
  if (empty) empty.remove();
  // önceki mesajın kuyruk durumu değişebilir
  const pn = msgNode(prev.id);
  if (pn) pn.outerHTML = msgHTML(prev, list[i - 2], m).replace(/^<div class="daysep">.*?<\/div>/, "");
  box.insertAdjacentHTML("beforeend", msgHTML(m, prev, null));
}
function replaceNode(oldId, m) {
  const n = msgNode(oldId);
  if (!n) return;
  const list = visible(S.messages.get(S.cur) || []);
  const i = list.indexOf(m);
  if (i < 0) return renderMessages(false);
  n.outerHTML = msgHTML(m, list[i - 1], list[i + 1]).replace(/^<div class="daysep">.*?<\/div>/, "");
}
function insertMessage(m) {
  const arr = S.messages.get(m.chatId);
  if (!arr) return;
  let i = arr.findIndex((x) => x.id === m.id);
  if (i < 0 && m.clientId) i = arr.findIndex((x) => x.pending && x.clientId === m.clientId);
  const here = S.cur === m.chatId;
  if (i >= 0) {
    const old = arr[i];
    arr[i] = m;
    const ordered = (i === 0 || seqOf(arr[i - 1]) <= seqOf(m)) && (i === arr.length - 1 || seqOf(arr[i + 1]) >= seqOf(m));
    if (!ordered) { arr.sort((a, b) => seqOf(a) - seqOf(b)); if (here) renderMessages(false); }
    else if (here) replaceNode(old.id, m);
    return;
  }
  let j = arr.length;
  while (j > 0 && seqOf(arr[j - 1]) > seqOf(m)) j--;
  arr.splice(j, 0, m);
  if (!here) return;
  const stick = S.atBottom || m.from === S.me.id;
  if (j === arr.length - 1) appendLast(m); else renderMessages(false);
  if (stick) scrollBottom(m.from === S.me.id);
  else if (m.from !== S.me.id) { S.newBelow++; updateToBottom(); }
}
function refreshTicks() {
  const c = curChat();
  if (!c) return;
  for (const m of S.messages.get(c.id) || []) {
    if (m.from !== S.me.id || m.pending || m.kind === "system") continue;
    const n = msgNode(m.id);
    const t = n && n.querySelector(".meta .tick");
    if (t && isRead(c, m) && !t.classList.contains("read")) t.outerHTML = icon("checks", "tick read");
  }
}

function msgHTML(m, prev, next) {
  let out = "";
  if (!prev || dayKey(prev.ts) !== dayKey(m.ts)) out += `<div class="daysep"><span>${fmtDay(m.ts)}</span></div>`;
  if (m.kind === "system") return out + `<div class="sysmsg msg" data-id="${esc(m.id)}"><span>${esc(m.text)}</span></div>`;
  const c = S.chats.get(m.chatId);
  const own = m.from === S.me.id;
  const same = (a, b) => a && b && a.from === b.from && a.kind !== "system" && b.kind !== "system" && Math.abs(b.ts - a.ts) < 5 * 60e3 && dayKey(a.ts) === dayKey(b.ts);
  const first = !same(prev, m), last = !same(m, next);
  const u = S.users.get(m.from) || {};
  const showName = c && c.type === "group" && !own && first;
  const b = bodyHTML(m, own, c);
  let meta = "";
  if (c && c.type === "self" && m.device) meta += `<span class="dev">${esc(m.device)}</span>`;
  if (m.edited) meta += `<span>düzenlendi</span>`;
  meta += `<span>${fmtTime(m.ts)}</span>`;
  if (own && c && c.type !== "self") {
    if (m.failed) meta += icon("alert", "tick fail");
    else if (m.pending) meta += icon("clock", "tick");
    else meta += isRead(c, m) ? icon("checks", "tick read") : icon("check", "tick");
  }
  const quote = m.replyTo ? `<div class="quote" data-jump="${esc(m.replyTo.id)}"><b>${esc(userName(m.replyTo.from))}</b><span>${esc(preview(m.replyTo) || m.replyTo.fileName || "")}</span></div>` : "";
  const fwd = m.fwdFrom ? `<div class="fwd">${icon("forward")}<span>${esc(m.fwdFrom)} tarafından iletildi</span></div>` : "";
  const name = showName ? `<div class="sender" style="--h:${u.hue == null ? 220 : u.hue}">${esc(u.name || "?")}</div>` : "";
  const text = m.text ? `<div class="text">${linkify(m.text)}<span class="meta">${meta}</span></div>` : `<div class="meta solo">${meta}</div>`;
  const err = m.failed ? `<div class="failrow">${esc(m.error || "Gönderilemedi")} <button class="linkbtn" data-retry="${esc(m.clientId)}">Tekrar dene</button> <button class="linkbtn" data-drop="${esc(m.clientId)}">Sil</button></div>` : "";
  return out + `<div class="msg ${own ? "own" : "other"} ${first ? "first" : ""} ${last ? "last" : ""} ${b.cls}" data-id="${esc(m.id)}">
    <div class="bubble">${name}${fwd}${quote}${b.html}${b.noText ? "" : text}${err}</div>${m.pending || m.deleted ? "" : `<button class="mmore" data-mmore aria-label="Seçenekler">${icon("more")}</button>`}</div>`;
}

function bodyHTML(m, own, c) {
  const f = m.file;
  if (m.kind === "call") return { cls: "k-call", html: callHTML(m, own, c), noText: false };
  if (!f) return { cls: "", html: "" };
  const src = f.id ? `/f/${esc(f.id)}` : f.local;
  const mime = f.mime || "";
  const up = m.pending && !m.failed ? `<div class="up"><button class="upcancel" data-cancel="${esc(m.clientId)}" aria-label="İptal">${icon("close")}</button><span class="uppct">${Math.round((m.progress || 0) * 100)}%</span><div class="upbar"><i style="width:${(m.progress || 0) * 100}%"></i></div></div>` : "";
  if (m.kind === "voice") {
    const peaks = (m.meta && m.meta.peaks) || Array(40).fill(0.3);
    const bars = peaks.map((v) => `<i style="height:${Math.max(14, Math.round(v * 100))}%"></i>`).join("");
    return { cls: "k-voice", html: `<div class="voice" data-src="${src}" data-dur="${(m.meta && m.meta.duration) || 0}"><button class="vplay" aria-label="Oynat">${icon("play")}</button><div class="vwave">${bars}</div><span class="vdur">${fmtDur(m.meta && m.meta.duration)}</span></div>${up}` };
  }
  if (/^image\/(png|jpe?g|gif|webp|avif|bmp)/.test(mime)) {
    const ar = m.meta && m.meta.w ? `aspect-ratio:${m.meta.w}/${m.meta.h};` : "";
    return { cls: "k-img" + (m.text ? " has-text" : ""), html: `<div class="mimg" style="${ar}"><img src="${src}" ${f.id ? `data-view="${esc(f.id)}"` : ""} alt="" loading="lazy">${up}</div>` };
  }
  if (mime.startsWith("video/")) {
    return { cls: "k-vid" + (m.text ? " has-text" : ""), html: `<div class="mvid"><video src="${src}#t=0.1" preload="metadata" controls playsinline></video>${up}</div>` };
  }
  const ext = (f.name.split(".").pop() || "").slice(0, 4).toUpperCase();
  const card = `<div class="fcard">
    <span class="fext" style="--h:${hashHue(ext)}">${esc(ext && ext.length < 5 && f.name.includes(".") ? ext : "")}${!f.name.includes(".") ? icon("file") : ""}</span>
    <span class="fmeta"><b>${esc(f.name)}</b><small>${fmtSize(f.size)}${m.pending && !m.failed ? ` · <span class="uppct">${Math.round((m.progress || 0) * 100)}%</span>` : ""}</small>
    ${m.pending && !m.failed ? `<span class="upbar"><i style="width:${(m.progress || 0) * 100}%"></i></span>` : ""}</span>
    ${m.pending && !m.failed ? `<button class="ibtn sm" data-cancel="${esc(m.clientId)}" aria-label="İptal">${icon("close")}</button>` : f.id ? `<button class="fdl" data-dl aria-label="İndir">${icon("download")}</button>` : ""}
  </div>`;
  const player = mime.startsWith("audio/") && f.id ? `<audio src="${src}" controls preload="none"></audio>` : "";
  return { cls: "k-file", html: card + player };
}
function callHTML(m, own, c) {
  const st = m.meta && m.meta.status, v = m.meta && m.meta.video;
  const ok = st === "answered";
  const label = (own ? "Giden " : "Gelen ") + (v ? "görüntülü arama" : "sesli arama");
  const sub = ok ? fmtDur(m.meta.duration) : own
    ? ({ missed: "Cevap yok", declined: "Reddedildi", busy: "Meşgul", canceled: "İptal edildi", failed: "Bağlanamadı" }[st] || "")
    : ({ declined: "Reddettin", failed: "Bağlanamadı" }[st] || "Cevapsız");
  const redial = c && c.type === "private" ? `<button class="ibtn sm" data-redial="${v ? 1 : 0}" aria-label="Tekrar ara">${icon(v ? "video" : "phone")}</button>` : "";
  return `<div class="callrow ${!ok && !own ? "missed" : ""}"><span class="callic ${ok ? "ok" : "bad"}">${icon(own ? "arrowOut" : "arrowIn")}</span><span class="callt"><b>${label}</b><small>${sub}</small></span>${redial}</div>`;
}

/* ---------------- Kaydırma ---------------- */
function scrollBottom(smooth) {
  const s = $("#msgs");
  if (!s) return;
  s.scrollTo({ top: s.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  S.atBottom = true; S.newBelow = 0; updateToBottom();
}
function onScroll() {
  const s = $("#msgs");
  S.atBottom = s.scrollHeight - s.scrollTop - s.clientHeight < 140;
  if (S.atBottom) S.newBelow = 0;
  updateToBottom();
  if (s.scrollTop < 300 && S.more.get(S.cur) && !S.loadingOlder) loadOlder();
}
async function loadOlder() {
  const id = S.cur;
  const arr = S.messages.get(id) || [];
  const first = arr.find((x) => !x.pending);
  if (!first) return;
  S.loadingOlder = true;
  try {
    await loadMessages(id, first.seq);
    if (S.cur === id) { S.atBottom = false; renderMessages(false); }
  } catch (_) {}
  S.loadingOlder = false;
}
function updateToBottom() {
  const b = $("#toBottom");
  if (!b) return;
  b.hidden = S.atBottom;
  $("#toBottomCnt").textContent = S.newBelow ? S.newBelow : "";
}
function jumpTo(id) {
  const n = msgNode(id);
  if (!n) return toast("Mesaj daha yukarıda, kaydırarak bulabilirsin");
  n.scrollIntoView({ block: "center", behavior: "smooth" });
  n.classList.remove("flash"); void n.offsetWidth; n.classList.add("flash");
}

/* ---------------- Mesaj tıklamaları ---------------- */
function onMsgsClick(e) {
  const t = e.target;
  const img = t.closest("img[data-view]");
  if (img) return openViewer(img.dataset.view, img.closest(".msg").dataset.id);
  const vp = t.closest(".vplay");
  if (vp) return Voice.toggle(vp.closest(".voice"));
  const wave = t.closest(".vwave");
  if (wave) return Voice.seek(wave.closest(".voice"), (e.clientX - wave.getBoundingClientRect().left) / wave.clientWidth);
  const q = t.closest(".quote[data-jump]");
  if (q) return jumpTo(q.dataset.jump);
  const cancel = t.closest("[data-cancel]");
  if (cancel) { e.preventDefault(); return Uploads.cancel(cancel.dataset.cancel); }
  const retry = t.closest("[data-retry]");
  if (retry) return retryPending(retry.dataset.retry);
  const drop = t.closest("[data-drop]");
  if (drop) return dropPending(drop.dataset.drop);
  const rd = t.closest("[data-redial]");
  if (rd) { const c = curChat(); if (c && otherUser(c)) Call.start(otherUser(c).id, rd.dataset.redial === "1"); return; }
  const dl = t.closest("[data-dl]");
  if (dl) { const m = findMsg(dl.closest(".msg").dataset.id); if (m && m.file) downloadFile(m.file); return; }
  const card = null;
  const mb = t.closest("[data-mmore]");
  if (mb) { const r = mb.getBoundingClientRect(); const m = findMsg(mb.closest(".msg").dataset.id); if (m) msgMenu(m, r.left, r.bottom + 4); return; }
  // Telefonda: mesaja dokununca menü (Telegram gibi)
  if ((coarse || isMobile()) && !card && Date.now() - LP.at > 600 && !t.closest("a, button, video, audio, input, .voice")) {
    const n = t.closest(".msg:not(.sysmsg)");
    if (n && !window.getSelection().toString()) { const m = findMsg(n.dataset.id); if (m) msgMenu(m, e.clientX, e.clientY); }
  }
}
// Uzun basma (contextmenu her telefonda gelmiyor)
const LP = { timer: 0, at: 0, x: 0, y: 0 };
function bindLongPress(el) {
  el.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    const n = e.target.closest(".msg:not(.sysmsg)");
    if (!n || e.target.closest("a, video, audio, .vwave")) return;
    const tt = e.touches[0]; LP.x = tt.clientX; LP.y = tt.clientY;
    clearTimeout(LP.timer);
    LP.timer = setTimeout(() => {
      const m = findMsg(n.dataset.id);
      if (!m) return;
      LP.at = Date.now();
      try { navigator.vibrate && navigator.vibrate(15); } catch (_) {}
      msgMenu(m, LP.x, LP.y);
    }, 450);
  }, { passive: true });
  const cancel = () => clearTimeout(LP.timer);
  el.addEventListener("touchmove", (e) => { const tt = e.touches[0]; if (Math.abs(tt.clientX - LP.x) > 10 || Math.abs(tt.clientY - LP.y) > 10) cancel(); }, { passive: true });
  el.addEventListener("touchend", cancel, { passive: true });
  el.addEventListener("touchcancel", cancel, { passive: true });
}

/* =====================================================================
   Yazma alanı ve gönderme
   ===================================================================== */
S.ops = new Map(); // clientId -> { retry }
function autosize() {
  const ta = $("#ta");
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight, 168) + "px";
}
function updateSendBtn() {
  const has = $("#ta").value.trim() || S.editing;
  const b = $("#btnSend");
  b.innerHTML = icon(has ? (S.editing ? "check" : "send") : "mic");
  b.classList.toggle("is-send", !!has);
  b.setAttribute("aria-label", has ? "Gönder" : "Sesli mesaj kaydet");
}
let typingAt = 0;
function sendTyping() {
  if (!S.cur || !$("#ta").value || Date.now() - typingAt < 2500) return;
  typingAt = Date.now();
  wsSend({ type: "typing", chatId: S.cur });
}
function showBar(kind, title, text) {
  $("#cbar").hidden = false;
  $("#cbarIc").innerHTML = icon(kind === "edit" ? "edit" : "reply");
  $("#cbarTitle").textContent = title;
  $("#cbarText").textContent = text || "";
}
function setReply(m) {
  if (S.editing) { $("#ta").value = ""; }
  S.editing = null; S.reply = m;
  showBar("reply", userName(m.from) === "Sen" ? "Kendine yanıt" : userName(m.from) + " kişisine yanıt", preview(m) || (m.file && m.file.name));
  updateSendBtn();
  $("#ta").focus();
}
function setEdit(m) {
  S.reply = null; S.editing = m;
  showBar("edit", "Mesajı düzenle", m.text);
  const ta = $("#ta");
  ta.value = m.text;
  autosize(); updateSendBtn();
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}
function clearBar() {
  if (S.editing) { $("#ta").value = ""; S.drafts.set(S.cur, ""); autosize(); }
  S.reply = null; S.editing = null;
  $("#cbar").hidden = true;
  updateSendBtn();
}
function askNotifyOnce() {
  if (NATIVE) return;
  if (!SECURE || !("Notification" in window) || Notification.permission !== "default" || localStorage.getItem("yerel.asked")) return;
  localStorage.setItem("yerel.asked", "1");
  Notification.requestPermission().catch(() => {});
}
async function sendText() {
  const ta = $("#ta");
  const text = ta.value.replace(/\s+$/, "").replace(/^\n+/, "");
  const c = curChat();
  if (!c) return;
  if (S.editing) {
    const m = S.editing;
    clearBar(); ta.value = ""; S.drafts.set(c.id, ""); autosize(); updateSendBtn();
    if (!text.trim() || text === m.text) return;
    try { await api("PATCH", `/api/messages/${c.id}/${m.id}`, { text }); } catch (e) { toast(e.message); }
    return;
  }
  if (!text.trim()) return;
  const reply = S.reply;
  ta.value = ""; S.drafts.set(c.id, "");
  $("#cbar").hidden = true; S.reply = null;
  autosize(); updateSendBtn();
  if (coarse) ta.focus();
  askNotifyOnce();
  sendTextTo(c.id, text, reply);
}
function sendTextTo(chatId, text, reply) {
  const cid = rid();
  const tmp = {
    id: "tmp_" + cid, clientId: cid, chatId, from: S.me.id, ts: Date.now(), kind: "text", text, pending: true, device: DEVICE,
    replyTo: reply ? { id: reply.id, from: reply.from, kind: reply.kind, text: reply.text, fileName: reply.file && reply.file.name } : null,
  };
  insertMessage(tmp);
  return postMessage(chatId, tmp, { text, replyTo: reply ? reply.id : undefined });
}
async function postMessage(chatId, tmp, body) {
  try {
    const d = await api("POST", `/api/chats/${chatId}/messages`, Object.assign({ clientId: tmp.clientId }, body));
    S.ops.delete(tmp.clientId);
    insertMessage(d.message);
    return true;
  } catch (e) {
    tmp.failed = true; tmp.error = e.message;
    S.ops.set(tmp.clientId, { retry: () => postMessage(chatId, tmp, body) });
    if (S.cur === chatId) replaceNode(tmp.id, tmp);
    return false;
  }
}
function retryPending(cid) {
  const op = S.ops.get(cid);
  const tmp = (S.messages.get(S.cur) || []).find((x) => x.clientId === cid && x.pending);
  if (!op || !tmp) return;
  tmp.failed = false; tmp.error = "";
  replaceNode(tmp.id, tmp);
  S.ops.delete(cid);
  op.retry();
}
function dropPending(cid) {
  S.ops.delete(cid);
  for (const [id, arr] of S.messages) {
    const i = arr.findIndex((x) => x.pending && x.clientId === cid);
    if (i >= 0) {
      const m = arr[i];
      arr.splice(i, 1);
      if (m.file && m.file.local) URL.revokeObjectURL(m.file.local);
      if (S.cur === id) renderMessages(false);
    }
  }
}

/* ---------------- Dosya yükleme kuyruğu ---------------- */
async function imageMeta(file) {
  try { const b = await createImageBitmap(file); const r = { w: b.width, h: b.height }; if (b.close) b.close(); return r; } catch (_) { return null; }
}
const Uploads = {
  q: [], busy: false, jobs: new Map(),
  add(chatId, file, opts = {}) {
    const cid = rid();
    const tmp = {
      id: "tmp_" + cid, clientId: cid, chatId, from: S.me.id, ts: Date.now(), pending: true, device: DEVICE,
      kind: opts.kind || "file", text: opts.text || "", meta: opts.meta || null, progress: 0,
      file: { name: file.name || "dosya", size: file.size, mime: file.type || "application/octet-stream", local: URL.createObjectURL(file) },
    };
    insertMessage(tmp);
    const job = { cid, chatId, file, tmp };
    this.jobs.set(cid, job);
    this.q.push(job);
    this.next();
  },
  async next() {
    if (this.busy) return;
    const job = this.q.shift();
    if (!job) return;
    this.busy = true;
    await this.run(job);
    this.busy = false;
    this.next();
  },
  async run(job) {
    const tmp = job.tmp;
    try {
      if (!tmp.meta && /^image\//.test(tmp.file.mime)) tmp.meta = await imageMeta(job.file);
      if (!job.uploaded) {
        job.req = upload(job.file, (p) => this.progress(job, p));
        job.uploaded = await job.req;
        job.req = null;
      }
      if (job.canceled) return;
      this.jobs.delete(job.cid);
      const ok = await postMessage(job.chatId, tmp, { fileId: job.uploaded.id, kind: tmp.kind, text: tmp.text, meta: tmp.meta });
      if (ok) setTimeout(() => URL.revokeObjectURL(tmp.file.local), 60000);
    } catch (e) {
      job.req = null;
      if (job.canceled) return;
      tmp.failed = true; tmp.error = e.message;
      S.ops.set(tmp.clientId, { retry: () => { this.jobs.set(job.cid, job); this.q.push(job); this.next(); } });
      if (S.cur === job.chatId) replaceNode(tmp.id, tmp);
    }
  },
  progress(job, p) {
    job.tmp.progress = p;
    const n = msgNode(job.tmp.id);
    if (!n) return;
    n.querySelectorAll(".upbar i").forEach((i) => (i.style.width = p * 100 + "%"));
    n.querySelectorAll(".uppct").forEach((x) => (x.textContent = Math.round(p * 100) + "%"));
  },
  cancel(cid) {
    const job = this.jobs.get(cid);
    if (job) {
      job.canceled = true;
      if (job.req) job.req.abort();
      this.q = this.q.filter((j) => j !== job);
      this.jobs.delete(cid);
    }
    dropPending(cid);
  },
};
function sendFiles(files, chatId) {
  const id = chatId || S.cur;
  if (!id) return;
  for (const f of files) Uploads.add(id, f);
  askNotifyOnce();
  if (id === S.cur) scrollBottom(true);
}

/* =====================================================================
   Sesli mesaj: kayıt
   ===================================================================== */
function downsample(a, n) {
  if (!a.length) return Array(n).fill(0.2);
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = Math.floor((i * a.length) / n), e = Math.max(s + 1, Math.floor(((i + 1) * a.length) / n));
    let m = 0;
    for (let j = s; j < e && j < a.length; j++) m = Math.max(m, a[j]);
    out.push(m);
  }
  const mx = Math.max(...out, 0.05);
  return out.map((v) => Math.round((v / mx) * 100) / 100);
}
const Rec = {
  active: false,
  async start() {
    if (this.active || this.starting) return;
    if (!SECURE || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) return secureHelp();
    this.starting = true;
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch (_) { this.starting = false; return toast("Mikrofon izni verilmedi"); }
    this.starting = false;
    if (!S.cur) { stream.getTracks().forEach((t) => t.stop()); return; }
    // AAC/MP4 önce: hem Android hem iPhone oynatabilsin
    const types = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"];
    const mime = types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.start(250);
    Object.assign(this, { rec, stream, chunks, peaks: [], t0: Date.now(), active: true, chatId: S.cur });
    const ctx = Sound.ensure();
    if (ctx) {
      this.src = ctx.createMediaStreamSource(stream);
      this.an = ctx.createAnalyser();
      this.an.fftSize = 1024;
      this.src.connect(this.an);
      this.buf = new Float32Array(this.an.fftSize);
    }
    $("#crow").hidden = true;
    $("#recbar").hidden = false;
    const live = $("#recLive");
    live.innerHTML = "";
    $("#recTime").textContent = "0:00";
    this.timer = setInterval(() => {
      let lv = 0;
      if (this.an) {
        this.an.getFloatTimeDomainData(this.buf);
        let sum = 0;
        for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
        lv = Math.min(1, Math.sqrt(sum / this.buf.length) * 5);
      }
      this.peaks.push(lv);
      $("#recTime").textContent = fmtDur((Date.now() - this.t0) / 1000);
      const bar = document.createElement("i");
      bar.style.height = Math.max(8, lv * 100) + "%";
      live.append(bar);
      while (live.childElementCount > 90) live.firstChild.remove();
    }, 100);
  },
  stop(send) {
    if (!this.active) return;
    this.active = false;
    clearInterval(this.timer);
    const { rec, stream, chunks, chatId, peaks } = this;
    const dur = (Date.now() - this.t0) / 1000;
    try { this.src && this.src.disconnect(); } catch (_) {}
    this.an = null; this.src = null;
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (!send) return;
      if (dur < 0.7) return toast("Kayıt çok kısa");
      const type = (rec.mimeType || "audio/webm").split(";")[0];
      const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      const file = new File([new Blob(chunks, { type })], `sesli-mesaj-${Date.now()}.${ext}`, { type });
      Uploads.add(chatId, file, { kind: "voice", meta: { duration: Math.round(dur * 10) / 10, peaks: downsample(peaks, 40) } });
    };
    try { rec.stop(); } catch (_) { stream.getTracks().forEach((t) => t.stop()); }
    $("#recbar").hidden = true;
    $("#crow").hidden = false;
  },
};

/* ---------------- Sesli mesaj: oynatıcı ---------------- */
const Voice = {
  a: new Audio(), el: null, src: null,
  toggle(el) {
    if (this.el === el) { this.a.paused ? this.a.play().catch(() => {}) : this.a.pause(); return; }
    this.reset();
    this.el = el; this.src = el.dataset.src;
    this.a.src = this.src;
    this.a.play().catch(() => toast("Oynatılamadı"));
  },
  seek(el, frac) {
    if (this.el !== el) this.toggle(el);
    const go = () => { const d = this.dur(); if (d) this.a.currentTime = Math.max(0, Math.min(0.999, frac)) * d; };
    this.a.readyState >= 1 ? go() : this.a.addEventListener("loadedmetadata", go, { once: true });
  },
  dur() { const d = this.a.duration; return isFinite(d) && d > 0 ? d : parseFloat(this.el && this.el.dataset.dur) || 0; },
  paint(el, p, text) {
    const bars = el.querySelectorAll(".vwave i");
    const n = Math.round(p * bars.length);
    bars.forEach((b, i) => b.classList.toggle("on", i < n));
    el.querySelector(".vdur").textContent = text;
  },
  reset() {
    if (!this.el) return;
    const el = this.el;
    this.el = null; this.src = null;
    this.a.pause();
    el.classList.remove("playing");
    el.querySelector(".vplay").innerHTML = icon("play");
    this.paint(el, 0, fmtDur(+el.dataset.dur));
  },
  reattach() {
    if (!this.el || this.el.isConnected) return;
    const n = $$(".voice").find((x) => x.dataset.src === this.src);
    if (!n) return;
    this.el = n;
    n.classList.add("playing");
    n.querySelector(".vplay").innerHTML = icon(this.a.paused ? "play" : "pause");
  },
};
Voice.a.addEventListener("play", () => { if (Voice.el) { Voice.el.classList.add("playing"); Voice.el.querySelector(".vplay").innerHTML = icon("pause"); } });
Voice.a.addEventListener("pause", () => { if (Voice.el) Voice.el.querySelector(".vplay").innerHTML = icon("play"); });
Voice.a.addEventListener("timeupdate", () => {
  Voice.reattach();
  const el = Voice.el;
  if (!el || !el.isConnected) return;
  const d = Voice.dur();
  Voice.paint(el, d ? Voice.a.currentTime / d : 0, fmtDur(Voice.a.currentTime));
});
Voice.a.addEventListener("ended", () => {
  const el = Voice.el;
  const all = $$(".voice");
  const next = el ? all[all.indexOf(el) + 1] : null;
  Voice.reset();
  if (next) Voice.toggle(next);
});

/* =====================================================================
   Mesaj menüsü, onay, alt sayfalar
   ===================================================================== */
function canDelete(m) {
  const c = S.chats.get(m.chatId);
  return m.from === S.me.id || (c && (c.type === "self" || c.type === "private")) || (c && c.type === "group" && c.admin === S.me.id);
}
function msgMenu(m, x, y) {
  if (m.pending || m.kind === "system") return;
  const items = [];
  if (m.kind !== "call") items.push(["reply", "Yanıtla", () => setReply(m)]);
  if (m.text) items.push(["copy", "Metni kopyala", () => copyText(m.text)]);
  if (m.file) items.push(["download", "İndir", () => downloadFile(m.file)]);
  if (m.kind !== "call") items.push(["forward", "İlet", () => forwardMsg(m)]);
  if (m.from === S.me.id && m.kind === "text") items.push(["edit", "Düzenle", () => setEdit(m)]);
  if (canDelete(m)) items.push(["trash", "Sil", () => deleteMsg(m), "danger"]);
  showMenu(items, x, y, m);
}
function showMenu(items, x, y, m) {
  const ov = document.createElement("div");
  ov.className = "menu-ov" + (coarse || isMobile() ? " as-sheet" : "");
  const head = m && (coarse || isMobile()) ? `<div class="menu-head">${esc((preview(m) || "").slice(0, 120))}</div>` : "";
  ov.innerHTML = `<div class="menu">${head}${items.map((it, i) => `<button data-i="${i}" class="${it[3] || ""}">${icon(it[0])}<span>${it[1]}</span></button>`).join("")}</div>`;
  document.body.append(ov);
  const menu = ov.firstElementChild;
  if (!ov.classList.contains("as-sheet")) {
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.min(x, innerWidth - r.width - 8) + "px";
    menu.style.top = Math.min(y, innerHeight - r.height - 8) + "px";
  }
  requestAnimationFrame(() => ov.classList.add("open"));
  let chosen = null;
  const h = pushLayer(() => { ov.remove(); if (chosen) chosen(); });
  ov.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-i]");
    if (b) chosen = items[+b.dataset.i][2];
    h.close();
  });
  ov.addEventListener("contextmenu", (e) => { e.preventDefault(); h.close(); });
}
async function copyText(t) {
  let ok = false;
  try { await navigator.clipboard.writeText(t); ok = true; } catch (_) {}
  if (!ok) {
    const ta = document.createElement("textarea");
    ta.value = t; ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.append(ta); ta.select();
    try { ok = document.execCommand("copy"); } catch (_) {}
    ta.remove();
  }
  toast(ok ? "Kopyalandı" : "Kopyalanamadı");
}
function downloadFile(f) {
  const a = document.createElement("a");
  a.href = `/f/${f.id}?dl`; a.download = f.name;
  document.body.append(a); a.click(); a.remove();
}
async function deleteMsg(m) {
  const c = S.chats.get(m.chatId);
  const txt = c.type === "self" ? "Mesaj tüm cihazlarından silinsin mi?" : "Mesaj herkes için silinsin mi?";
  if (!(await confirmDlg(txt + (m.file ? " Dosya da sunucudan silinir." : ""), "Sil"))) return;
  try { await api("DELETE", `/api/messages/${m.chatId}/${m.id}`); } catch (e) { toast(e.message); }
}
async function forwardMsg(m) {
  const to = await pickChat("Şuraya ilet");
  if (!to) return;
  try {
    await api("POST", "/api/forward", { fromChat: m.chatId, ids: [m.id], toChat: to });
    toast("İletildi: " + chatTitle(S.chats.get(to)));
  } catch (e) { toast(e.message); }
}
function confirmDlg(text, okLabel = "Tamam", danger = true) {
  return new Promise((resolve) => {
    const ov = document.createElement("div");
    ov.className = "dlg-ov";
    ov.innerHTML = `<div class="dlg" role="alertdialog"><p>${esc(text)}</p><div class="dlg-act"><button class="btn" data-v="0">Vazgeç</button><button class="btn ${danger ? "danger" : "primary"}" data-v="1">${esc(okLabel)}</button></div></div>`;
    document.body.append(ov);
    requestAnimationFrame(() => ov.classList.add("open"));
    let val = false;
    const h = pushLayer(() => { ov.remove(); resolve(val); });
    ov.onclick = (e) => {
      const b = e.target.closest("[data-v]");
      if (b) val = b.dataset.v === "1";
      if (b || e.target === ov) h.close();
    };
  });
}
function sheet(title, body, onMount, opts = {}) {
  const ov = document.createElement("div");
  ov.className = "sheet-ov";
  ov.innerHTML = `<div class="sheet ${opts.cls || ""}" role="dialog" aria-label="${esc(title)}">
    <header class="sheet-h"><button class="ibtn" data-close aria-label="Kapat">${icon(isMobile() ? "back" : "close")}</button><h2>${esc(title)}</h2></header>
    <div class="sheet-b">${body}</div></div>`;
  document.body.append(ov);
  requestAnimationFrame(() => ov.classList.add("open"));
  const h = pushLayer(() => {
    ov.classList.remove("open");
    setTimeout(() => ov.remove(), 220);
    if (opts.onClose) opts.onClose();
  });
  ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("[data-close]")) h.close(); });
  const s = { el: ov, body: $(".sheet-b", ov), close: h.close };
  if (onMount) onMount(s);
  return s;
}
function pickChat(title) {
  return new Promise((resolve) => {
    let val = null;
    const chats = [...S.chats.values()].sort((a, b) => (a.type === "self" ? -1 : b.type === "self" ? 1 : ((b.last && b.last.ts) || b.createdAt) - ((a.last && a.last.ts) || a.createdAt)));
    const row = (c) => `<div class="ci" data-pick="${esc(c.id)}" data-name="${esc(chatTitle(c).toLocaleLowerCase("tr"))}">${chatAvatar(c, 44)}<div class="ci-b"><div class="ci-r1"><span class="ci-t">${esc(chatTitle(c))}</span></div></div></div>`;
    sheet(title, `<div class="searchbox in-sheet">${icon("search")}<input type="search" placeholder="Ara" autocomplete="off"></div><div class="pick-list">${chats.map(row).join("")}</div>`, (s) => {
      const inp = $("input", s.el);
      inp.oninput = () => { const q = inp.value.trim().toLocaleLowerCase("tr"); $$("[data-pick]", s.el).forEach((n) => (n.hidden = q && !n.dataset.name.includes(q))); };
      s.body.addEventListener("click", (e) => { const it = e.target.closest("[data-pick]"); if (it) { val = it.dataset.pick; s.close(); } });
    }, { onClose: () => resolve(val) });
  });
}
function pickImage(cb) {
  const i = document.createElement("input");
  i.type = "file"; i.accept = "image/*";
  i.onchange = () => i.files[0] && cb(i.files[0]);
  i.click();
}
function openViewer(fileId, msgId) {
  const m = findMsg(msgId);
  const ov = document.createElement("div");
  ov.className = "viewer";
  ov.innerHTML = `<div class="vw-top"><button class="ibtn" data-close aria-label="Kapat">${icon("back")}</button>
    <div class="vw-t"><b>${esc(m ? userName(m.from) : "")}</b><small>${m ? fmtDay(m.ts) + " " + fmtTime(m.ts) : ""}</small></div>
    <a class="ibtn" href="/f/${esc(fileId)}?dl" download="${esc((m && m.file && m.file.name) || "")}" aria-label="İndir">${icon("download")}</a></div>
    <div class="vw-img"><img src="/f/${esc(fileId)}" alt=""></div>
    ${m && m.text ? `<div class="vw-cap">${linkify(m.text)}</div>` : ""}`;
  document.body.append(ov);
  requestAnimationFrame(() => ov.classList.add("open"));
  const h = pushLayer(() => { ov.classList.remove("open"); setTimeout(() => ov.remove(), 200); });
  ov.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]") || e.target.classList.contains("vw-img")) return h.close();
    if (e.target.tagName === "IMG") ov.classList.toggle("zoom");
  });
}

/* ---------------- Yeni sohbet / grup ---------------- */
function addrList() {
  const out = [];
  if (!S.info) return out;
  for (const ip of S.info.ips || []) {
    if (S.info.https) out.push(`https://${ip}:${S.info.httpsPort}`);
    out.push(`http://${ip}:${S.info.port}`);
  }
  return out;
}
function userRow(u, extra = "") {
  return `<div class="ci" data-u="${esc(u.id)}">${avatar(u, 46)}<div class="ci-b"><div class="ci-r1"><span class="ci-t">${esc(u.name)}</span>${extra}</div><div class="ci-r2"><span class="ci-p ${u.online ? "on" : ""}">${esc(lastSeenText(u))}</span></div></div></div>`;
}
function openNewChat() {
  const others = [...S.users.values()].filter((u) => u.id !== S.me.id).sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name, "tr"));
  const addr = addrList()[0] || location.origin;
  sheet("Yeni sohbet", `
    <button class="row-btn" data-group>${icon("group")}<span>Yeni grup</span></button>
    <button class="row-btn" data-self>${icon("bookmark")}<span>Kayıtlı Mesajlar</span></button>
    <div class="list-label">Ağdaki kişiler</div>
    ${others.length ? others.map((u) => userRow(u)).join("") : `<div class="list-empty">Henüz başka kullanıcı yok. Aynı Wi-Fi'daki cihazda <code>${esc(addr)}</code> adresini açıp hesap oluşturun.</div>`}`,
    (s) => {
      s.body.onclick = (e) => {
        const u = e.target.closest("[data-u]");
        if (u) { s.close(); return startPrivate(u.dataset.u); }
        if (e.target.closest("[data-group]")) { s.close(); return openNewGroup(); }
        if (e.target.closest("[data-self]")) { s.close(); openChat("self_" + S.me.id); }
      };
    });
}
function checklist(users) {
  return `<div class="checklist">${users.map((u) => `<label class="ck">${avatar(u, 40)}<span>${esc(u.name)}<small>@${esc(u.username)}</small></span><input type="checkbox" value="${esc(u.id)}"><i class="box">${icon("check")}</i></label>`).join("")}</div>`;
}
function openNewGroup() {
  const others = [...S.users.values()].filter((u) => u.id !== S.me.id).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  sheet("Yeni grup", `
    <label class="fld"><span>Grup adı</span><input id="gName" maxlength="80" placeholder="Örn. Ev"></label>
    <div class="list-label">Üyeler</div>
    ${others.length ? checklist(others) : `<div class="list-empty">Eklenecek kimse yok. Grubu şimdi kurup sonra üye ekleyebilirsin.</div>`}
    <div class="sheet-foot"><button class="btn primary wide" id="gCreate">Grubu oluştur</button></div>`,
    (s) => {
      $("#gCreate", s.el).onclick = async () => {
        const inp = $("#gName", s.el);
        const name = inp.value.trim();
        if (!name) return inp.focus();
        const members = $$(".checklist input:checked", s.el).map((x) => x.value);
        try {
          const d = await api("POST", "/api/chats", { type: "group", name, members });
          S.chats.set(d.chat.id, d.chat);
          s.close();
          openChat(d.chat.id);
        } catch (e) { toast(e.message); }
      };
    });
}
function addMembers(c) {
  const others = [...S.users.values()].filter((u) => !c.members.includes(u.id));
  if (!others.length) return toast("Eklenecek başka kullanıcı yok");
  sheet("Üye ekle", checklist(others) + `<div class="sheet-foot"><button class="btn primary wide" id="mAdd">Ekle</button></div>`, (s) => {
    $("#mAdd", s.el).onclick = async () => {
      const ids = $$(".checklist input:checked", s.el).map((x) => x.value);
      if (!ids.length) return s.close();
      try { await api("PATCH", `/api/chats/${c.id}`, { addMembers: ids }); s.close(); } catch (e) { toast(e.message); }
    };
  });
}

/* ---------------- Sohbet bilgisi ---------------- */
function openChatInfo() {
  const c = curChat();
  if (!c) return;
  let body = "";
  if (c.type === "self") {
    body = `<div class="info-top">${chatAvatar(c, 84)}<h3>Kayıtlı Mesajlar</h3><p>Giriş yaptığın tüm cihazlarda görünen kişisel alanın.</p></div>
      <button class="row-btn danger" data-clear>${icon("trash")}<span>Tüm mesajları ve dosyaları sil</span></button>`;
  } else if (c.type === "private") {
    const u = otherUser(c) || {};
    body = `<div class="info-top">${avatar(u, 84)}<h3>${esc(u.name)}</h3><p>@${esc(u.username)} · ${esc(lastSeenText(u))}</p>
      <div class="info-acts"><button class="pill" data-call="0">${icon("phone")}<span>Sesli ara</span></button><button class="pill" data-call="1">${icon("video")}<span>Görüntülü</span></button></div></div>
      <button class="row-btn danger" data-clear>${icon("trash")}<span>Sohbeti iki taraf için temizle</span></button>`;
  } else {
    const admin = c.admin === S.me.id;
    const members = c.members.map((id) => S.users.get(id)).filter(Boolean);
    body = `<div class="info-top"><div class="av-edit" ${admin ? "data-gav" : ""}>${chatAvatar(c, 84)}${admin ? `<span class="av-cam">${icon("camera")}</span>` : ""}</div>
      ${admin ? `<input class="title-in" id="gTitle" value="${esc(c.name)}" maxlength="80" aria-label="Grup adı">` : `<h3>${esc(c.name)}</h3>`}
      <p>${c.members.length} üye</p></div>
      ${admin ? `<button class="row-btn" data-add>${icon("plus")}<span>Üye ekle</span></button>` : ""}
      <div class="list-label">Üyeler</div>
      ${members.map((u) => userRow(u.id === S.me.id ? Object.assign({}, u, { name: u.name + " (sen)" }) : u, u.id === c.admin ? '<span class="tag">yönetici</span>' : "")).join("")}
      ${admin ? `<button class="row-btn danger" data-clear>${icon("trash")}<span>Geçmişi herkes için temizle</span></button>` : ""}
      <button class="row-btn danger" data-leave>${icon("logout")}<span>Gruptan çık</span></button>`;
  }
  sheet(c.type === "group" ? "Grup bilgisi" : c.type === "self" ? "Kayıtlı Mesajlar" : "Kişi bilgisi", body, (s) => {
    s.body.onclick = async (e) => {
      const t = e.target;
      const call = t.closest("[data-call]");
      if (call) { s.close(); return Call.start(otherUser(c).id, call.dataset.call === "1"); }
      if (t.closest("[data-clear]")) {
        const q = c.type === "self" ? "Kayıtlı Mesajlar'daki tüm mesajlar ve dosyalar sunucudan silinsin mi?" : "Bu sohbetteki tüm mesajlar ve dosyalar herkes için silinsin mi?";
        if (await confirmDlg(q, "Temizle")) { try { await api("POST", `/api/chats/${c.id}/clear`); s.close(); } catch (err) { toast(err.message); } }
        return;
      }
      if (t.closest("[data-leave]")) {
        if (await confirmDlg("Gruptan çıkılsın mı?", "Çık")) { try { await api("POST", `/api/chats/${c.id}/leave`); s.close(); } catch (err) { toast(err.message); } }
        return;
      }
      if (t.closest("[data-add]")) { s.close(); return addMembers(c); }
      if (t.closest("[data-gav]")) {
        return pickImage(async (f) => { try { toast("Yükleniyor…"); const up = await upload(f); await api("PATCH", `/api/chats/${c.id}`, { avatar: up.id }); toast("Grup fotoğrafı güncellendi"); } catch (err) { toast(err.message); } });
      }
      const u = t.closest("[data-u]");
      if (u && u.dataset.u !== S.me.id) { s.close(); startPrivate(u.dataset.u); }
    };
    const ti = $("#gTitle", s.el);
    if (ti) ti.onchange = () => { const v = ti.value.trim(); if (v && v !== c.name) api("PATCH", `/api/chats/${c.id}`, { name: v }).catch((e) => toast(e.message)); };
  });
}

/* ---------------- Ayarlar ---------------- */
function notifState() {
  if (NATIVE) { try { return NATIVE.notifState(); } catch (_) { return ""; } }
  if (!("Notification" in window)) return "Desteklenmiyor";
  if (!SECURE) return "Güvenli bağlantı gerekli";
  return { granted: "Açık", denied: "Tarayıcıda engelli", default: "Kapalı" }[Notification.permission];
}
function openSettings() {
  const me = S.me;
  const theme = localStorage.getItem("yerel.theme") || "";
  const su = secureUrl();
  sheet("Ayarlar", `
    <div class="info-top">
      <div class="av-edit" data-av>${avatar(me, 84)}<span class="av-cam">${icon("camera")}</span></div>
      <input class="title-in" id="meName" value="${esc(me.name)}" maxlength="60" aria-label="Görünen ad">
      <p>@${esc(me.username)} · bu cihaz: ${DEVICE}</p>
    </div>
    <div class="box">
      <div class="box-h">${icon("link")}<b>Diğer cihazlardan bağlan</b></div>
      <p>Aynı Wi-Fi'daki telefon ya da bilgisayarda bu adreslerden birini aç.</p>
      ${addrList().map((a) => `<div class="addr"><code>${esc(a)}</code><button class="ibtn sm" data-copy="${esc(a)}" aria-label="Kopyala">${icon("copy")}</button></div>`).join("") || "<p>Adres bulunamadı.</p>"}
    </div>
    <div class="box ${SECURE ? "ok" : "warn"}">
      <div class="box-h">${icon(SECURE ? "shieldOk" : "shield")}<b>${SECURE ? "Bağlantı güvenli" : "Bağlantı güvenli değil"}</b></div>
      <p>${SECURE ? "Sesli mesaj, arama, bildirim ve uygulama kurulumu açık." : "Sesli mesaj, arama, bildirim ve ana ekrana ekleme bu adreste çalışmaz."}</p>
      <div class="box-act">${!SECURE && su ? `<a class="btn small primary" href="${esc(su)}">Güvenli adrese geç</a>` : ""}<button class="btn small" data-act="secure-help">Sertifika kurulumu</button></div>
    </div>
    ${NATIVE ? `<button class="row-btn" data-native-server>${icon("link")}<span>Sunucuyu değiştir</span><em>${esc(location.host)}</em></button>` : ""}
    <button class="row-btn" data-notif>${icon("bell")}<span>Bildirimler</span><em id="notifSt">${notifState()}</em></button>
    ${S.installPrompt ? `<button class="row-btn" data-install>${icon("install")}<span>Uygulamayı yükle</span><em>ana ekrana ekle</em></button>` : ""}
    <div class="row-btn static">${icon("palette")}<span>Tema</span>
      <div class="seg mini" id="themeSeg"><button data-t="" class="${!theme ? "on" : ""}">Sistem</button><button data-t="light" class="${theme === "light" ? "on" : ""}">Açık</button><button data-t="dark" class="${theme === "dark" ? "on" : ""}">Koyu</button></div></div>
    <details class="row-det"><summary class="row-btn">${icon("key")}<span>Şifre değiştir</span></summary>
      <div class="det-b"><label class="fld"><span>Mevcut şifre</span><input type="password" id="pOld" autocomplete="current-password"></label>
      <label class="fld"><span>Yeni şifre</span><input type="password" id="pNew" autocomplete="new-password"></label>
      <button class="btn primary" id="pSave">Şifreyi kaydet</button></div></details>
    <button class="row-btn danger" data-logout>${icon("logout")}<span>Bu cihazda çıkış yap</span></button>
    <p class="foot">Mesajlar ve dosyalar yalnızca sunucu cihazında (Termux) saklanır; internete hiçbir şey gönderilmez.</p>`,
  (s) => {
    s.body.addEventListener("click", async (e) => {
      const t = e.target;
      const cp = t.closest("[data-copy]");
      if (cp) return copyText(cp.dataset.copy);
      if (t.closest('[data-act="secure-help"]')) return secureHelp();
      if (t.closest("[data-native-server]")) { try { NATIVE.changeServer(); } catch (_) {} return; }
      if (t.closest("[data-notif]")) {
        if (NATIVE) { try { NATIVE.requestNotif(); } catch (_) {} return; }
        if (!SECURE) return secureHelp();
        if (!("Notification" in window)) return toast("Bu tarayıcı bildirim desteklemiyor");
        if (Notification.permission === "denied") return toast("Tarayıcı ayarlarından bu site için bildirim izni ver");
        if (Notification.permission === "granted") return showNotif("Bildirimler açık", { body: "Yeni mesajlar böyle görünecek.", tag: "test" });
        await Notification.requestPermission();
        $("#notifSt").textContent = notifState();
        return;
      }
      if (t.closest("[data-install]")) {
        const p = S.installPrompt; S.installPrompt = null;
        p.prompt();
        try { await p.userChoice; } catch (_) {}
        t.closest("[data-install]").remove();
        return;
      }
      const th = t.closest("[data-t]");
      if (th) { applyTheme(th.dataset.t); $$("#themeSeg button").forEach((b) => b.classList.toggle("on", b === th)); return; }
      if (t.closest("[data-av]")) {
        return pickImage(async (f) => {
          try { toast("Yükleniyor…"); const up = await upload(f); const d = await api("PATCH", "/api/me", { avatar: up.id }); S.me = d.me; $("[data-av]", s.el).innerHTML = avatar(S.me, 84) + `<span class="av-cam">${icon("camera")}</span>`; toast("Profil fotoğrafı güncellendi"); } catch (err) { toast(err.message); }
        });
      }
      if (t.closest("#pSave")) {
        try { await api("PATCH", "/api/me", { oldPassword: $("#pOld").value, password: $("#pNew").value }); toast("Şifre değişti"); $("#pOld").value = $("#pNew").value = ""; } catch (err) { toast(err.message); }
        return;
      }
      if (t.closest("[data-logout]")) { if (await confirmDlg("Bu cihazda oturum kapatılsın mı?", "Çıkış yap")) logout(); }
    });
    $("#meName", s.el).onchange = async (e) => {
      const v = e.target.value.trim();
      if (!v || v === S.me.name) return;
      try { const d = await api("PATCH", "/api/me", { name: v }); S.me = d.me; toast("Ad güncellendi"); } catch (err) { toast(err.message); }
    };
  });
}
function secureHelp() {
  const https = S.info && S.info.https;
  const host = location.hostname;
  const sUrl = `https://${host}:${(S.info && S.info.httpsPort) || 8443}`;
  const hUrl = `http://${host}:${(S.info && S.info.port) || 8080}`;
  sheet("Güvenli bağlantı", `
    <p class="help-p">Tarayıcılar mikrofon, kamera, bildirim ve “ana ekrana ekle” özelliklerini yalnızca güvenli (https) adreslerde açar. Yerel ağda bunun iki yolu var.</p>
    <h4 class="help-h">1. Yerel sertifikayı kur (önerilen)</h4>
    ${https ? "" : `<p class="help-warn">Sunucuda sertifika henüz yok. Termux'ta <code>bash sertifika.sh</code> çalıştırıp sunucuyu yeniden başlat.</p>`}
    <ol class="steps">
      <li><a class="btn small" href="/ca.crt" download="yerel-ca.crt">${icon("download")}<span>Sertifikayı indir</span></a></li>
      <li><b>Android:</b> Ayarlar → Güvenlik → Diğer güvenlik ayarları → Şifreleme ve kimlik bilgileri → Sertifika yükle → <b>CA sertifikası</b> → indirilen <code>yerel-ca.crt</code>. Menü adları markaya göre değişir; Ayarlar'da “sertifika” diye arat.</li>
      <li><b>iPhone/iPad:</b> Safari'de sertifikayı indir → Ayarlar → <b>Profil indirildi</b> → Yükle. Sonra Ayarlar → Genel → Hakkında → <b>Sertifika Güven Ayarları</b> → “Yerel Messenger CA”yı aç.</li>
      <li><b>Windows:</b> Dosyaya çift tıkla → Sertifika yükle → Yerel Makine → “Tüm sertifikaları aşağıdaki depolama alanına yerleştir” → <b>Güvenilen Kök Sertifika Yetkilileri</b> → Son.</li>
      <li><b>Linux:</b> Chrome'da <code>chrome://settings/certificates</code> → Yetkililer → İçe aktar → “Web sitelerini tanımlamak için güven”.</li>
      <li>Chrome'u kapatıp aç ve <code>${esc(sUrl)}</code> adresine gir.</li>
    </ol>
    <p class="help-p">Her cihaza yalnızca bir kez kurulur. Sunucunun IP'si değişirse yeni sertifika aynı kökle otomatik üretilir, tekrar kurman gerekmez.</p>
    <h4 class="help-h">2. Hızlı yol: Chrome bayrağı</h4>
    <ol class="steps">
      <li>Adres çubuğuna <code>chrome://flags/#unsafely-treat-insecure-origin-as-secure</code> yaz.</li>
      <li>Kutuya <code>${esc(hUrl)}</code> yaz, <b>Enabled</b> seç, alttaki <b>Relaunch</b>'a bas.</li>
    </ol>
    <p class="help-p">Sertifika gerektirmez ama her cihazda ayrı yapılır ve IP değişince güncellenmelidir.</p>`);
}

/* =====================================================================
   Bildirimler, service worker, paylaşım hedefi
   ===================================================================== */
async function showNotif(title, opts) {
  try {
    const o = Object.assign({ icon: "/icons/icon-192.png", badge: "/icons/badge-96.png" }, opts);
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) await reg.showNotification(title, o);
    else new Notification(title, o);
  } catch (_) {}
}
function notifyMessage(m) {
  if (NATIVE) {
    if (nativeFg()) return Sound.message();
    const c = S.chats.get(m.chatId);
    if (c) try { NATIVE.notify(chatTitle(c), (c.type === "group" ? userName(m.from) + ": " : "") + preview(m), m.chatId); } catch (_) {}
    return;
  }
  Sound.message();
  if (!SECURE || !("Notification" in window) || Notification.permission !== "granted") return;
  const c = S.chats.get(m.chatId);
  if (!c) return;
  const body = (c.type === "group" ? userName(m.from) + ": " : "") + preview(m);
  showNotif(chatTitle(c), { body, tag: m.chatId, renotify: true, data: { chatId: m.chatId } });
}
function registerSW() {
  if (!SECURE || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch(() => {});
  navigator.serviceWorker.addEventListener("message", (e) => { if (e.data && e.data.openChat && S.chats.has(e.data.openChat)) openChat(e.data.openChat); });
}
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); S.installPrompt = e; });
addEventListener("appinstalled", () => { S.installPrompt = null; toast("Yerel ana ekrana eklendi"); });

async function handleShareInbox() {
  if (NATIVE) {
    let meta = null;
    try { const j = NATIVE.shareMeta(); if (j) meta = JSON.parse(j); } catch (_) {}
    if (!meta || (!meta.files.length && !meta.text)) return;
    try { NATIVE.clearShare(); } catch (_) {}
    const n = meta.files.length;
    const to = await pickChat(n ? `${n} dosyayı gönder` : "Metni gönder");
    if (!to) return;
    await openChat(to);
    for (const f of meta.files) {
      try { const blob = await (await fetch(f.key)).blob(); Uploads.add(to, new File([blob], f.name, { type: f.type || blob.type })); }
      catch (_) { toast("Dosya okunamadı: " + f.name); }
    }
    if (meta.text) sendTextTo(to, meta.text, null);
    return;
  }
  if (!("caches" in window)) return;
  const cache = await caches.open("yerel-share");
  const r = await cache.match("/__share/meta");
  if (!r) return;
  const meta = await r.json();
  const clear = async () => { for (const k of await cache.keys()) await cache.delete(k); };
  const n = meta.files.length;
  const to = await pickChat(n ? `${n} dosyayı gönder` : "Metni gönder");
  if (!to) return clear();
  await openChat(to);
  for (const f of meta.files) {
    const rr = await cache.match(f.key);
    if (!rr) continue;
    const blob = await rr.blob();
    Uploads.add(to, new File([blob], f.name, { type: f.type || blob.type }));
  }
  if (meta.text) sendTextTo(to, meta.text, null);
  await clear();
}

/* =====================================================================
   Sesli ve görüntülü arama (WebRTC, yerel ağ)
   ===================================================================== */
const Call = {
  st: null, tick: null, wl: null,
  sig(data, toConn) {
    const s = this.st;
    if (!s) return;
    wsSend({ type: "signal", to: s.peer, toConn: toConn || s.peerConn || undefined, data: Object.assign({ callId: s.id }, data) });
  },
  media(video) {
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: video ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    });
  },
  async start(uid, video) {
    if (this.st) return toast("Zaten bir aramadasın");
    if (!SECURE || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return secureHelp();
    if (!S.online) return toast("Sunucuya bağlı değilsin");
    const u = S.users.get(uid);
    if (!u) return;
    if (!u.online) return toast(`${u.name} şu an çevrimdışı`);
    let chatId;
    try { const d = await api("POST", "/api/chats", { type: "private", userId: uid }); S.chats.set(d.chat.id, d.chat); chatId = d.chat.id; }
    catch (e) { return toast(e.message); }
    let local;
    try { local = await this.media(video); }
    catch (_) {
      if (video) { try { local = await this.media(false); toast("Kamera açılamadı, sesli aranıyor"); } catch (_) {} }
      if (!local) return toast("Mikrofon izni alınamadı");
    }
    this.st = { id: rid(), peer: uid, peerConn: null, video: local.getVideoTracks().length > 0, dir: "out", state: "ringing", local, ice: [], chatId, facing: "user" };
    this.sig({ kind: "invite", video: this.st.video, name: S.me.name });
    this.ui();
    Sound.ringback();
    const s = this.st;
    s.timeout = setTimeout(() => { if (this.st === s && s.state === "ringing") { this.sig({ kind: "cancel" }); toast("Cevap yok"); this.finish("missed"); } }, 45000);
  },
  async onSignal(m) {
    const d = m.data || {};
    if (d.kind === "invite") {
      if (this.st) { wsSend({ type: "signal", to: m.from, toConn: m.fromConn, data: { kind: "busy", callId: d.callId } }); return; }
      this.st = { id: d.callId, peer: m.from, peerConn: m.fromConn, video: !!d.video, dir: "in", state: "ringing", ice: [], facing: "user" };
      const s = this.st;
      this.ui();
      if (NATIVE && !nativeFg()) { try { NATIVE.incomingCall((S.users.get(m.from) || {}).name || d.name || "Biri", !!d.video); } catch (_) {} }
      else Sound.ring();
      if (!NATIVE && document.visibilityState !== "visible" || !document.hasFocus()) {
        const name = (S.users.get(m.from) || {}).name || d.name || "Biri";
        showNotif(`${name} arıyor`, { body: d.video ? "Görüntülü arama" : "Sesli arama", tag: "call", renotify: true, requireInteraction: true, data: {} });
      }
      s.timeout = setTimeout(() => { if (this.st === s && s.state === "ringing") this.cleanup(); }, 47000);
      return;
    }
    const s = this.st;
    if (!s || d.callId !== s.id) return;
    try {
      switch (d.kind) {
        case "cancel": if (s.dir === "in") { this.cleanup(); toast("Cevapsız arama"); } break;
        case "taken": if (s.dir === "in" && s.state === "ringing") this.cleanup(); break;
        case "busy": if (s.dir === "out") { toast("Meşgul"); this.finish("busy"); } break;
        case "decline": if (s.dir === "out") { toast("Arama reddedildi"); this.finish("declined"); } break;
        case "accept":
          if (s.dir === "out" && s.state === "ringing") {
            clearTimeout(s.timeout); Sound.stop();
            s.peerConn = m.fromConn; s.state = "connecting";
            this.makePC(); this.ui();
            const off = await s.pc.createOffer();
            await s.pc.setLocalDescription(off);
            this.sig({ kind: "offer", sdp: s.pc.localDescription.toJSON() });
          }
          break;
        case "offer":
          if (s.dir === "in" && s.pc) {
            await s.pc.setRemoteDescription(d.sdp);
            await this.flushIce();
            const ans = await s.pc.createAnswer();
            await s.pc.setLocalDescription(ans);
            this.sig({ kind: "answer", sdp: s.pc.localDescription.toJSON() });
          }
          break;
        case "answer":
          if (s.pc) { await s.pc.setRemoteDescription(d.sdp); await this.flushIce(); }
          break;
        case "ice":
          if (s.pc && s.pc.remoteDescription) { try { await s.pc.addIceCandidate(d.cand); } catch (_) {} }
          else s.ice.push(d.cand);
          break;
        case "end":
          toast("Arama sona erdi");
          this.finish(s.startedAt ? "answered" : "failed");
          break;
      }
    } catch (e) { console.error(e); toast("Arama hatası: " + e.message); this.hangup(); }
  },
  async flushIce() {
    const s = this.st;
    while (s && s.pc && s.ice.length) { try { await s.pc.addIceCandidate(s.ice.shift()); } catch (_) {} }
  },
  async accept() {
    const s = this.st;
    if (!s || s.dir !== "in" || s.state !== "ringing") return;
    Sound.stop(); clearTimeout(s.timeout);
    s.state = "connecting"; this.ui();
    let local = null;
    try { local = await this.media(s.video); }
    catch (_) { if (s.video) { try { local = await this.media(false); } catch (_) {} } }
    if (this.st !== s) { if (local) local.getTracks().forEach((t) => t.stop()); return; }
    if (!local) { toast("Mikrofon izni alınamadı"); return this.decline(); }
    s.local = local;
    this.makePC();
    this.sig({ kind: "accept" });
    wsSend({ type: "signal", to: S.me.id, data: { kind: "taken", callId: s.id } });
    this.ui();
  },
  decline() {
    const s = this.st;
    if (!s) return;
    this.sig({ kind: "decline" });
    wsSend({ type: "signal", to: S.me.id, data: { kind: "taken", callId: s.id } });
    this.cleanup();
  },
  hangup() {
    const s = this.st;
    if (!s) return;
    if (s.dir === "out" && s.state === "ringing") { this.sig({ kind: "cancel" }); this.finish("canceled"); }
    else { this.sig({ kind: "end" }); this.finish(s.startedAt ? "answered" : "failed"); }
  },
  finish(status) {
    const s = this.st;
    if (!s) return;
    if (s.dir === "out" && status) {
      const duration = s.startedAt ? Math.round((Date.now() - s.startedAt) / 1000) : 0;
      api("POST", `/api/chats/${s.chatId}/messages`, { kind: "call", meta: { video: s.video, status, duration } }).catch(() => {});
    }
    this.cleanup();
  },
  makePC() {
    const s = this.st;
    const pc = new RTCPeerConnection({ iceServers: [] });
    s.pc = pc;
    s.local.getTracks().forEach((t) => pc.addTrack(t, s.local));
    if (s.dir === "out" && s.video && !s.local.getVideoTracks().length) pc.addTransceiver("video", { direction: "recvonly" });
    pc.onicecandidate = (e) => { if (e.candidate) this.sig({ kind: "ice", cand: e.candidate.toJSON() }); };
    pc.ontrack = (e) => {
      const v = $("#callRemote");
      const stream = e.streams[0] || new MediaStream([e.track]);
      if (v && v.srcObject !== stream) { v.srcObject = stream; v.play().catch(() => {}); }
      e.track.onunmute = () => this.ui();
      e.track.onended = () => this.ui();
      this.ui();
    };
    pc.onconnectionstatechange = () => {
      if (this.st !== s) return;
      const cs = pc.connectionState;
      if (cs === "connected") {
        clearTimeout(s.dcTimer); clearTimeout(s.connTimer);
        if (!s.startedAt) { s.startedAt = Date.now(); clearInterval(this.tick); this.tick = setInterval(() => this.updTimer(), 1000); this.wake(); }
        s.state = "active"; this.ui();
      } else if (cs === "disconnected") {
        s.state = "reconnecting"; this.ui();
        clearTimeout(s.dcTimer);
        s.dcTimer = setTimeout(() => { if (this.st === s && pc.connectionState !== "connected") this.hangup(); }, 10000);
      } else if (cs === "failed") { toast("Bağlantı kurulamadı"); this.hangup(); }
    };
    s.connTimer = setTimeout(() => { if (this.st === s && !s.startedAt) { toast("Bağlantı kurulamadı"); this.hangup(); } }, 25000);
  },
  cleanup() {
    const s = this.st;
    if (!s) return;
    this.st = null;
    Sound.stop();
    clearTimeout(s.timeout); clearTimeout(s.dcTimer); clearTimeout(s.connTimer); clearInterval(this.tick);
    try { if (s.pc) s.pc.close(); } catch (_) {}
    if (s.local) s.local.getTracks().forEach((t) => t.stop());
    this.unwake();
    const ov = $("#callOv");
    if (ov) { ov.classList.add("closing"); setTimeout(() => ov.remove(), 260); ov.id = ""; }
  },
  statusText() {
    const s = this.st;
    if (!s) return "";
    if (s.state === "ringing") return s.dir === "out" ? "Çalıyor…" : s.video ? "Görüntülü arama" : "Sesli arama";
    if (s.state === "connecting") return "Bağlanıyor…";
    if (s.state === "reconnecting") return "Yeniden bağlanıyor…";
    return fmtDur((Date.now() - s.startedAt) / 1000);
  },
  updTimer() { const e = $("#callSt"); if (e) e.textContent = this.statusText(); },
  ui() {
    const s = this.st;
    if (!s) return;
    const u = S.users.get(s.peer) || { name: "?" };
    let ov = $("#callOv");
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "callOv";
      ov.className = "call-ov";
      ov.innerHTML = `<video id="callRemote" autoplay playsinline></video><video id="callLocal" autoplay playsinline muted></video>
        <div class="call-info"><div class="call-av"></div><h2 class="call-name"></h2><p id="callSt"></p></div><div class="call-ctl" id="callCtl"></div>`;
      document.body.append(ov);
      ov.addEventListener("click", (e) => this.onClick(e));
      requestAnimationFrame(() => ov.classList.add("open"));
    }
    $(".call-av", ov).innerHTML = avatar(u, 112);
    $(".call-name", ov).textContent = u.name;
    const lv = $("#callLocal");
    if (s.local && lv.srcObject !== s.local) lv.srcObject = s.local;
    const rs = $("#callRemote").srcObject;
    const remoteVideo = !!(rs && rs.getVideoTracks().some((t) => t.readyState === "live" && !t.muted));
    const localVideo = !!(s.local && s.local.getVideoTracks().some((t) => t.enabled));
    ov.classList.toggle("remote-video", remoteVideo);
    ov.classList.toggle("local-video", localVideo);
    ov.classList.toggle("incoming", s.dir === "in" && s.state === "ringing");
    $("#callSt").textContent = this.statusText();
    const ctl = $("#callCtl");
    if (s.dir === "in" && s.state === "ringing") {
      ctl.innerHTML = `<button class="cbtn red" data-c="decline">${icon("hangup")}<span>Reddet</span></button><button class="cbtn green" data-c="accept">${icon(s.video ? "video" : "phone")}<span>Cevapla</span></button>`;
    } else {
      const at = s.local && s.local.getAudioTracks()[0];
      const vt = s.local && s.local.getVideoTracks()[0];
      const muted = at && !at.enabled;
      ctl.innerHTML = `<button class="cbtn ${muted ? "off" : ""}" data-c="mute">${icon(muted ? "micOff" : "mic")}<span>${muted ? "Sessizde" : "Mikrofon"}</span></button>
        ${vt ? `<button class="cbtn ${!vt.enabled ? "off" : ""}" data-c="cam">${icon(vt.enabled ? "video" : "videoOff")}<span>Kamera</span></button>
        ${coarse ? `<button class="cbtn" data-c="flip">${icon("flip")}<span>Çevir</span></button>` : ""}` : ""}
        <button class="cbtn red" data-c="hangup">${icon("hangup")}<span>Kapat</span></button>`;
    }
  },
  async onClick(e) {
    const s = this.st;
    if (!s) return;
    if (e.target.id === "callLocal") return $("#callOv").classList.toggle("swap");
    const b = e.target.closest("[data-c]");
    if (!b) return;
    const c = b.dataset.c;
    if (c === "accept") return this.accept();
    if (c === "decline") return this.decline();
    if (c === "hangup") return this.hangup();
    if (c === "mute") { const t = s.local.getAudioTracks()[0]; if (t) t.enabled = !t.enabled; return this.ui(); }
    if (c === "cam") { const t = s.local.getVideoTracks()[0]; if (t) t.enabled = !t.enabled; return this.ui(); }
    if (c === "flip") {
      const old = s.local.getVideoTracks()[0];
      const want = s.facing === "user" ? "environment" : "user";
      if (old) { s.local.removeTrack(old); old.stop(); }
      let nt = null;
      for (const fm of [want, s.facing]) {
        try { nt = (await navigator.mediaDevices.getUserMedia({ video: { facingMode: fm } })).getVideoTracks()[0]; s.facing = fm; break; } catch (_) {}
      }
      if (!nt) { toast("Kamera açılamadı"); return this.ui(); }
      s.local.addTrack(nt);
      const sender = s.pc && s.pc.getSenders().find((x) => x.track === old || (x.track && x.track.kind === "video") || (!x.track && x.dtmf === null));
      if (sender) { try { await sender.replaceTrack(nt); } catch (_) {} }
      const lv = $("#callLocal"); lv.srcObject = null; lv.srcObject = s.local;
      $("#callOv").classList.toggle("mirror", s.facing === "user");
      this.ui();
    }
  },
  async wake() { try { if (navigator.wakeLock) this.wl = await navigator.wakeLock.request("screen"); } catch (_) {} },
  unwake() { try { if (this.wl) this.wl.release(); } catch (_) {} this.wl = null; },
};
addEventListener("beforeunload", () => { if (Call.st) Call.hangup(); });

boot();
})();
