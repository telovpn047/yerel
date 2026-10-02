"use strict";
/*
 * Yerel Messenger — yerel ağ (LAN) mesajlaşma sunucusu
 * Bağımlılık yok: sadece Node.js (Termux: pkg install nodejs)
 */
const http = require("http");
const https = require("https");
const net = require("net");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const dgram = require("dgram");
const { execFileSync, spawnSync } = require("child_process");
const { URL } = require("url");

const ROOT = __dirname;
const PORT = parseInt(process.env.PORT || "8080", 10);
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || "8443", 10);
const INVITE = process.env.DAVET_KODU || "";
const DATA = path.join(ROOT, "data");
const FILES = path.join(DATA, "files");
const MSGS = path.join(DATA, "messages");
const CERTS = path.join(ROOT, "certs");
const STARTED = Date.now();
const SERVER_ID = require("crypto").randomBytes(6).toString("hex");
const LABEL = process.env.APP_LABEL || "Yerel Messenger";
const PUB = path.join(ROOT, "public");
for (const d of [DATA, FILES, MSGS]) fs.mkdirSync(d, { recursive: true });

/* ---------------- Yerel IP tespiti ---------------- */
function ifaceIPs() {
  const out = new Set();
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const n of nets[name] || []) {
        if (n.family === "IPv4" && !n.internal) out.add(n.address);
      }
    }
  } catch (_) { /* Android 11+ bazen izin vermiyor */ }
  return out;
}
function routeIP(target) {
  return new Promise((resolve) => {
    const s = dgram.createSocket("udp4");
    const done = (v) => { try { s.close(); } catch (_) {} resolve(v); };
    s.on("error", () => done(null));
    try {
      s.connect(53, target, () => {
        try { done(s.address().address); } catch (_) { done(null); }
      });
    } catch (_) { done(null); }
    setTimeout(() => done(null), 800);
  });
}
async function lanIPs() {
  const set = ifaceIPs();
  for (const t of ["192.168.1.1", "10.0.0.1", "172.16.0.1", "8.8.8.8"]) {
    const ip = await routeIP(t);
    if (ip && ip !== "0.0.0.0" && !ip.startsWith("127.")) set.add(ip);
  }
  if (process.env.LAN_IP) for (const ip of process.env.LAN_IP.split(",")) set.add(ip.trim());
  const isPrivate = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  return [...set].sort((a, b) => isPrivate(b) - isPrivate(a));
}

if (process.argv.includes("--ips")) {
  lanIPs().then((ips) => { console.log(ips.join(" ")); process.exit(0); });
  return;
}

/* ---------------- Depolama ---------------- */
const DB_FILE = path.join(DATA, "db.json");
function readJSON(f, def) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (_) { return def; } }
function writeJSON(f, obj) { const t = f + ".tmp"; fs.writeFileSync(t, JSON.stringify(obj)); fs.renameSync(t, f); }

const db = Object.assign({ users: {}, chats: {}, files: {}, sessions: {} }, readJSON(DB_FILE, {}));
const msgCache = new Map(); // chatId -> [message]
const dirty = new Set();
let flushTimer = null;

function msgFile(chatId) { return path.join(MSGS, chatId.replace(/[^a-zA-Z0-9_-]/g, "") + ".json"); }
function messagesOf(chatId) {
  if (!msgCache.has(chatId)) msgCache.set(chatId, readJSON(msgFile(chatId), []));
  return msgCache.get(chatId);
}
function markDirty(key) {
  dirty.add(key);
  if (!flushTimer) flushTimer = setTimeout(flush, 400);
}
function flush() {
  flushTimer = null;
  for (const key of dirty) {
    try {
      if (key === "db") writeJSON(DB_FILE, db);
      else writeJSON(msgFile(key), messagesOf(key));
    } catch (e) { console.error("Kayıt hatası:", key, e.message); }
  }
  dirty.clear();
}
function shutdown() { if (flushTimer) clearTimeout(flushTimer); flush(); process.exit(0); }
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const rid = (n = 12) => crypto.randomBytes(n).toString("base64url");
const now = () => Date.now();

/* Yarım kalmış / sahipsiz yüklemeleri temizle */
(function cleanup() {
  const day = 24 * 3600 * 1000;
  for (const [id, f] of Object.entries(db.files)) {
    if ((f.refs || 0) <= 0 && now() - (f.createdAt || 0) > day) {
      fs.unlink(path.join(FILES, id), () => {});
      delete db.files[id];
      markDirty("db");
    }
  }
  for (const name of fs.readdirSync(FILES)) {
    if (name.endsWith(".part")) fs.unlink(path.join(FILES, name), () => {});
  }
})();

/* ---------------- Kullanıcılar ---------------- */
function hashPass(pass, salt) { return crypto.scryptSync(String(pass), salt, 32).toString("hex"); }
function online(uid) { return (sockets.get(uid) || new Set()).size > 0; }
function publicUser(u) {
  return { id: u.id, username: u.username, name: u.name, avatar: u.avatar || null, hue: u.hue, online: online(u.id), lastSeen: u.lastSeen || 0 };
}
function auth(req, u) {
  let tok = "";
  const h = req.headers["authorization"] || "";
  if (h.startsWith("Bearer ")) tok = h.slice(7);
  else if (u && u.searchParams.get("t")) tok = u.searchParams.get("t");
  const s = tok && db.sessions[tok];
  if (!s || !db.users[s.userId]) return null;
  return db.users[s.userId];
}
function newSession(user, device) {
  const tok = rid(24);
  db.sessions[tok] = { userId: user.id, createdAt: now(), device: device || "" };
  markDirty("db");
  return tok;
}
function ensureSelfChat(uid) {
  const id = "self_" + uid;
  if (!db.chats[id]) {
    db.chats[id] = { id, type: "self", name: "Kayıtlı Mesajlar", members: [uid], admin: uid, createdAt: now(), seq: 0, reads: {} };
    markDirty("db");
  }
  return db.chats[id];
}

/* ---------------- Sohbetler ---------------- */
function lastMessage(chatId) {
  const arr = messagesOf(chatId);
  for (let i = arr.length - 1; i >= 0; i--) if (!arr[i].deleted) return arr[i];
  return null;
}
function chatView(chat, uid) {
  const read = chat.reads[uid] || 0;
  let unread = 0;
  const arr = messagesOf(chat.id);
  for (let i = arr.length - 1; i >= 0 && arr[i].seq > read; i--) {
    if (!arr[i].deleted && arr[i].from !== uid && arr[i].kind !== "system") unread++;
  }
  return {
    id: chat.id, type: chat.type, name: chat.name, avatar: chat.avatar || null, members: chat.members,
    admin: chat.admin, seq: chat.seq, reads: chat.reads, unread, last: lastMessage(chat.id), createdAt: chat.createdAt,
  };
}
function chatsFor(uid) {
  return Object.values(db.chats).filter((c) => c.members.includes(uid)).map((c) => chatView(c, uid));
}
function addMessage(chat, uid, fields) {
  chat.seq += 1;
  const m = Object.assign({ id: rid(9), seq: chat.seq, chatId: chat.id, from: uid, ts: now(), kind: "text", text: "" }, fields);
  messagesOf(chat.id).push(m);
  if (uid) chat.reads[uid] = Math.max(chat.reads[uid] || 0, chat.seq);
  if (m.file && db.files[m.file.id]) db.files[m.file.id].refs = (db.files[m.file.id].refs || 0) + 1;
  markDirty(chat.id);
  markDirty("db");
  for (const mid of chat.members) sendUser(mid, { type: "message", message: m, chat: chatView(chat, mid) });
  return m;
}
function releaseFile(file) {
  if (!file || !db.files[file.id]) return;
  const f = db.files[file.id];
  f.refs = (f.refs || 1) - 1;
  if (f.refs <= 0) { fs.unlink(path.join(FILES, file.id), () => {}); delete db.files[file.id]; }
  markDirty("db");
}
function sysMessage(chat, text) { return addMessage(chat, null, { kind: "system", text }); }

/* ---------------- HTTP yardımcıları ---------------- */
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store" });
  res.end(body);
}
function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on("data", (c) => { n += c.length; if (n > limit) { reject(new Error("too big")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(n ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".crt": "application/x-x509-ca-cert",
};
function serveStatic(req, res, pathname) {
  const rel = pathname === "/" ? "/index.html" : pathname;
  const fp = path.join(PUB, path.normalize(rel));
  if (!fp.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.stat(fp, (err, st) => {
    if (err || !st.isFile()) {
      // SPA: bilinmeyen yol -> index.html
      if (!path.extname(rel)) return serveStatic(req, res, "/");
      res.writeHead(404); return res.end("Bulunamadı");
    }
    const headers = { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream", "Content-Length": st.size, "Cache-Control": "no-cache" };
    if (rel === "/sw.js") headers["Service-Worker-Allowed"] = "/";
    res.writeHead(200, headers);
    fs.createReadStream(fp).pipe(res);
  });
}
function serveFile(req, res, id, u) {
  const meta = db.files[id];
  const fp = path.join(FILES, id);
  if (!meta || !fs.existsSync(fp)) { res.writeHead(404); return res.end("Dosya bulunamadı"); }
  const size = fs.statSync(fp).size;
  const dl = u.searchParams.has("dl");
  const headers = {
    "Content-Type": meta.mime || "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=31536000, immutable",
    "Content-Disposition": `${dl ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
  };
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
    if (m && !m[1] && m[2]) { start = size - parseInt(m[2], 10); end = size - 1; }
    if (start >= size || end >= size || start > end) { res.writeHead(416, { "Content-Range": `bytes */${size}` }); return res.end(); }
    res.writeHead(206, Object.assign(headers, { "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 }));
    return fs.createReadStream(fp, { start, end }).pipe(res);
  }
  res.writeHead(200, Object.assign(headers, { "Content-Length": size }));
  fs.createReadStream(fp).pipe(res);
}
function handleUpload(req, res, user, u) {
  const id = rid(16);
  const name = (path.basename(u.searchParams.get("name") || "dosya").replace(/[\u0000-\u001f]/g, "").trim() || "dosya").slice(0, 200);
  const mime = (u.searchParams.get("mime") || "application/octet-stream").slice(0, 120);
  const part = path.join(FILES, id + ".part");
  const ws = fs.createWriteStream(part);
  let size = 0, failed = false;
  const fail = () => { if (failed) return; failed = true; ws.destroy(); fs.unlink(part, () => {}); };
  req.on("data", (c) => { size += c.length; });
  req.on("aborted", fail);
  req.on("error", fail);
  ws.on("error", () => { fail(); if (!res.headersSent) json(res, 500, { error: "Disk yazma hatası (yer dolu olabilir)" }); });
  ws.on("finish", () => {
    if (failed) return;
    fs.rename(part, path.join(FILES, id), (err) => {
      if (err) return json(res, 500, { error: "Kaydedilemedi" });
      db.files[id] = { name, mime, size, owner: user.id, createdAt: now(), refs: 0 };
      markDirty("db");
      json(res, 200, { id, name, mime, size });
    });
  });
  req.pipe(ws);
}
function clientDevice(req) {
  const ua = req.headers["user-agent"] || "";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad/i.test(ua)) return "iPhone";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS/i.test(ua)) return "Mac";
  if (/Linux/i.test(ua)) return "Linux";
  return "Cihaz";
}
const cleanText = (t, n = 20000) => String(t == null ? "" : t).slice(0, n);

/* ---------------- API ---------------- */
let serverIPs = [];
let httpsOn = false;

async function api(req, res, u, p) {
  const M = req.method;

  if (M === "GET" && p === "/api/info") {
    return json(res, 200, { name: "Yerel", app: LABEL, id: SERVER_ID, started: STARTED, ips: serverIPs, port: PORT, httpsPort: HTTPS_PORT, https: httpsOn, invite: !!INVITE, users: Object.keys(db.users).length });
  }
  if (M === "POST" && p === "/api/register") {
    const b = await readBody(req);
    const username = String(b.username || "").trim().toLowerCase();
    const name = cleanText(b.name, 60).trim() || username;
    if (!/^[a-z0-9_.]{3,24}$/.test(username)) return json(res, 400, { error: "Kullanıcı adı 3-24 karakter olmalı: harf, rakam, _ veya ." });
    if (String(b.password || "").length < 4) return json(res, 400, { error: "Şifre en az 4 karakter olmalı" });
    if (INVITE && b.invite !== INVITE) return json(res, 403, { error: "Davet kodu yanlış" });
    if (Object.values(db.users).some((x) => x.username === username)) return json(res, 409, { error: "Bu kullanıcı adı alınmış" });
    const salt = rid(12);
    const user = { id: rid(8), username, name, salt, pass: hashPass(b.password, salt), hue: crypto.randomInt(0, 360), createdAt: now(), lastSeen: now() };
    db.users[user.id] = user;
    ensureSelfChat(user.id);
    markDirty("db");
    broadcast({ type: "user", user: publicUser(user) });
    return json(res, 200, { token: newSession(user, clientDevice(req)), user: publicUser(user) });
  }
  if (M === "POST" && p === "/api/login") {
    const b = await readBody(req);
    const username = String(b.username || "").trim().toLowerCase();
    const user = Object.values(db.users).find((x) => x.username === username);
    if (!user || hashPass(b.password || "", user.salt) !== user.pass) return json(res, 401, { error: "Kullanıcı adı veya şifre yanlış" });
    ensureSelfChat(user.id);
    return json(res, 200, { token: newSession(user, clientDevice(req)), user: publicUser(user) });
  }

  const user = auth(req, u);
  if (!user) return json(res, 401, { error: "Oturum geçersiz" });

  if (M === "POST" && p === "/api/logout") {
    const tok = (req.headers["authorization"] || "").slice(7);
    delete db.sessions[tok]; markDirty("db");
    return json(res, 200, { ok: true });
  }
  if (M === "GET" && p === "/api/bootstrap") {
    ensureSelfChat(user.id);
    return json(res, 200, { me: publicUser(user), users: Object.values(db.users).map(publicUser), chats: chatsFor(user.id) });
  }
  if (M === "PATCH" && p === "/api/me") {
    const b = await readBody(req);
    if (b.name != null) user.name = cleanText(b.name, 60).trim() || user.name;
    if (b.avatar !== undefined) {
      if (user.avatar) releaseFile({ id: user.avatar });
      user.avatar = b.avatar && db.files[b.avatar] ? b.avatar : null;
      if (user.avatar) db.files[user.avatar].refs = (db.files[user.avatar].refs || 0) + 1;
    }
    if (b.password) {
      if (hashPass(b.oldPassword || "", user.salt) !== user.pass) return json(res, 403, { error: "Mevcut şifre yanlış" });
      if (String(b.password).length < 4) return json(res, 400, { error: "Şifre en az 4 karakter olmalı" });
      user.salt = rid(12); user.pass = hashPass(b.password, user.salt);
    }
    markDirty("db");
    broadcast({ type: "user", user: publicUser(user) });
    return json(res, 200, { me: publicUser(user) });
  }
  if (M === "POST" && p === "/api/upload") return handleUpload(req, res, user, u);

  if (M === "POST" && p === "/api/chats") {
    const b = await readBody(req);
    if (b.type === "private") {
      const other = db.users[b.userId];
      if (!other) return json(res, 404, { error: "Kullanıcı yok" });
      if (other.id === user.id) return json(res, 200, { chat: chatView(ensureSelfChat(user.id), user.id) });
      const key = [user.id, other.id].sort().join("_");
      const id = "p_" + key;
      if (!db.chats[id]) {
        db.chats[id] = { id, type: "private", name: "", members: [user.id, other.id], admin: null, createdAt: now(), seq: 0, reads: {} };
        markDirty("db");
      }
      return json(res, 200, { chat: chatView(db.chats[id], user.id) });
    }
    if (b.type === "group") {
      const members = [...new Set([user.id, ...(b.members || []).filter((x) => db.users[x])])];
      const chat = { id: "g_" + rid(8), type: "group", name: cleanText(b.name, 80).trim() || "Yeni grup", members, admin: user.id, createdAt: now(), seq: 0, reads: {} };
      db.chats[chat.id] = chat;
      markDirty("db");
      sysMessage(chat, `${user.name} grubu oluşturdu`);
      return json(res, 200, { chat: chatView(chat, user.id) });
    }
    return json(res, 400, { error: "Geçersiz tür" });
  }

  let m;
  if ((m = /^\/api\/chats\/([\w-]+)(\/[\w]+)?$/.exec(p))) {
    const chat = db.chats[m[1]];
    const sub = m[2] || "";
    if (!chat || !chat.members.includes(user.id)) return json(res, 404, { error: "Sohbet bulunamadı" });

    if (M === "GET" && sub === "/messages") {
      const arr = messagesOf(chat.id);
      const before = parseInt(u.searchParams.get("before") || "0", 10) || Infinity;
      const limit = Math.min(200, parseInt(u.searchParams.get("limit") || "60", 10));
      let end = arr.length;
      while (end > 0 && arr[end - 1].seq >= before) end--;
      const slice = arr.slice(Math.max(0, end - limit), end);
      return json(res, 200, { messages: slice, more: end - limit > 0 });
    }
    if (M === "POST" && sub === "/messages") {
      const b = await readBody(req);
      const fields = { text: cleanText(b.text), kind: "text", device: clientDevice(req), clientId: cleanText(b.clientId, 40) };
      if (b.fileId) {
        const f = db.files[b.fileId];
        if (!f) return json(res, 400, { error: "Dosya bulunamadı" });
        fields.file = { id: b.fileId, name: f.name, mime: f.mime, size: f.size };
        fields.kind = b.kind === "voice" ? "voice" : "file";
      }
      if (b.kind === "call") fields.kind = "call";
      if (b.meta && typeof b.meta === "object") fields.meta = JSON.parse(cleanText(JSON.stringify(b.meta), 4000));
      if (b.replyTo) {
        const r = messagesOf(chat.id).find((x) => x.id === b.replyTo);
        if (r) fields.replyTo = { id: r.id, from: r.from, kind: r.kind, text: cleanText(r.text, 200), fileName: r.file ? r.file.name : null };
      }
      if (!fields.text && !fields.file && fields.kind !== "call") return json(res, 400, { error: "Boş mesaj" });
      return json(res, 200, { message: addMessage(chat, user.id, fields) });
    }
    if (M === "POST" && sub === "/read") {
      const b = await readBody(req);
      const seq = Math.min(chat.seq, parseInt(b.seq, 10) || 0);
      if (seq > (chat.reads[user.id] || 0)) {
        chat.reads[user.id] = seq;
        markDirty("db");
        for (const mid of chat.members) sendUser(mid, { type: "read", chatId: chat.id, userId: user.id, seq });
      }
      return json(res, 200, { ok: true });
    }
    if (M === "PATCH" && sub === "") {
      const b = await readBody(req);
      if (chat.type !== "group") return json(res, 400, { error: "Sadece gruplar düzenlenebilir" });
      if (b.name != null) {
        chat.name = cleanText(b.name, 80).trim() || chat.name;
        sysMessage(chat, `${user.name} grup adını "${chat.name}" yaptı`);
      }
      if (Array.isArray(b.addMembers)) {
        const added = b.addMembers.filter((x) => db.users[x] && !chat.members.includes(x));
        if (added.length) {
          chat.members.push(...added);
          sysMessage(chat, `${user.name} ekledi: ${added.map((x) => db.users[x].name).join(", ")}`);
        }
      }
      if (b.avatar !== undefined) {
        if (chat.avatar) releaseFile({ id: chat.avatar });
        chat.avatar = b.avatar && db.files[b.avatar] ? b.avatar : null;
        if (chat.avatar) db.files[chat.avatar].refs = (db.files[chat.avatar].refs || 0) + 1;
      }
      markDirty("db");
      for (const mid of chat.members) sendUser(mid, { type: "chat", chat: chatView(chat, mid) });
      return json(res, 200, { chat: chatView(chat, user.id) });
    }
    if (M === "POST" && sub === "/leave") {
      if (chat.type !== "group") return json(res, 400, { error: "Sadece gruptan çıkılabilir" });
      sysMessage(chat, `${user.name} gruptan ayrıldı`);
      chat.members = chat.members.filter((x) => x !== user.id);
      if (chat.admin === user.id) chat.admin = chat.members[0] || null;
      markDirty("db");
      sendUser(user.id, { type: "chat_remove", chatId: chat.id });
      for (const mid of chat.members) sendUser(mid, { type: "chat", chat: chatView(chat, mid) });
      return json(res, 200, { ok: true });
    }
    if (M === "POST" && sub === "/clear") {
      if (chat.type === "group" && chat.admin !== user.id) return json(res, 403, { error: "Sadece grup yöneticisi temizleyebilir" });
      for (const x of messagesOf(chat.id)) if (x.file) releaseFile(x.file);
      msgCache.set(chat.id, []);
      markDirty(chat.id);
      for (const mid of chat.members) sendUser(mid, { type: "cleared", chatId: chat.id, chat: chatView(chat, mid) });
      return json(res, 200, { ok: true });
    }
  }

  if ((m = /^\/api\/messages\/([\w-]+)\/([\w-]+)$/.exec(p))) {
    const chat = db.chats[m[1]];
    if (!chat || !chat.members.includes(user.id)) return json(res, 404, { error: "Sohbet bulunamadı" });
    const msg = messagesOf(chat.id).find((x) => x.id === m[2]);
    if (!msg || msg.deleted) return json(res, 404, { error: "Mesaj bulunamadı" });
    const canDelete = msg.from === user.id || chat.type === "self" || (chat.type === "group" && chat.admin === user.id) || chat.type === "private";
    if (M === "PATCH") {
      if (msg.from !== user.id) return json(res, 403, { error: "Sadece kendi mesajını düzenleyebilirsin" });
      const b = await readBody(req);
      msg.text = cleanText(b.text);
      msg.edited = now();
    } else if (M === "DELETE") {
      if (!canDelete) return json(res, 403, { error: "Bu mesajı silemezsin" });
      if (msg.file) releaseFile(msg.file);
      Object.assign(msg, { deleted: true, text: "", file: null, meta: null, replyTo: null });
    } else return json(res, 405, { error: "Yöntem yok" });
    markDirty(chat.id);
    for (const mid of chat.members) sendUser(mid, { type: "message_update", message: msg, chat: chatView(chat, mid) });
    return json(res, 200, { message: msg });
  }

  if (M === "POST" && p === "/api/forward") {
    const b = await readBody(req);
    const src = db.chats[b.fromChat], dst = db.chats[b.toChat];
    if (!src || !dst || !src.members.includes(user.id) || !dst.members.includes(user.id)) return json(res, 404, { error: "Sohbet bulunamadı" });
    const ids = new Set(b.ids || []);
    const out = [];
    for (const x of messagesOf(src.id)) {
      if (!ids.has(x.id) || x.deleted || x.kind === "system" || x.kind === "call") continue;
      const fwdName = x.fwdFrom || (db.users[x.from] ? db.users[x.from].name : "");
      out.push(addMessage(dst, user.id, { kind: x.kind, text: x.text, file: x.file, meta: x.meta, fwdFrom: fwdName, device: clientDevice(req) }));
    }
    return json(res, 200, { messages: out });
  }

  return json(res, 404, { error: "Bulunamadı" });
}

/* ---------------- WebSocket (bağımlılıksız) ---------------- */
const sockets = new Map(); // userId -> Set(conn)
let connSeq = 0;

function wsSend(conn, obj) {
  if (conn.closed) return;
  const data = Buffer.from(JSON.stringify(obj));
  let head;
  if (data.length < 126) head = Buffer.from([0x81, data.length]);
  else if (data.length < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 126; head.writeUInt16BE(data.length, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 127; head.writeBigUInt64BE(BigInt(data.length), 2); }
  try { conn.sock.write(Buffer.concat([head, data])); } catch (_) {}
}
function sendUser(uid, obj, exceptConn) {
  for (const c of sockets.get(uid) || []) if (c !== exceptConn) wsSend(c, obj);
}
function broadcast(obj) { for (const set of sockets.values()) for (const c of set) wsSend(c, obj); }
function presence(user) { broadcast({ type: "presence", userId: user.id, online: online(user.id), lastSeen: user.lastSeen }); }

function onUpgrade(req, sock) {
  const u = new URL(req.url, "http://x");
  const user = u.pathname === "/ws" ? auth(req, u) : null;
  const key = req.headers["sec-websocket-key"];
  if (!user || !key) { sock.write("HTTP/1.1 401 Unauthorized\r\n\r\n"); return sock.destroy(); }
  const accept = crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  sock.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
  sock.setNoDelay(true);
  sock.setKeepAlive(true, 20000);

  const conn = { id: "c" + (++connSeq), sock, user, closed: false, alive: true, buf: Buffer.alloc(0), frag: [] };
  if (!sockets.has(user.id)) sockets.set(user.id, new Set());
  const wasOnline = online(user.id);
  sockets.get(user.id).add(conn);
  wsSend(conn, { type: "hello", connId: conn.id });
  if (!wasOnline) presence(user);

  const close = () => {
    if (conn.closed) return;
    conn.closed = true;
    sockets.get(user.id) && sockets.get(user.id).delete(conn);
    try { sock.destroy(); } catch (_) {}
    user.lastSeen = now(); markDirty("db");
    if (!online(user.id)) presence(user);
  };
  conn.close = close;
  sock.on("close", close);
  sock.on("error", close);
  sock.on("data", (chunk) => {
    conn.buf = Buffer.concat([conn.buf, chunk]);
    while (conn.buf.length >= 2) {
      const b0 = conn.buf[0], b1 = conn.buf[1];
      const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (conn.buf.length < 4) return; len = conn.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (conn.buf.length < 10) return; len = Number(conn.buf.readBigUInt64BE(2)); off = 10; }
      if (len > 8 * 1024 * 1024) return close();
      const total = off + (masked ? 4 : 0) + len;
      if (conn.buf.length < total) return;
      let payload = conn.buf.subarray(off + (masked ? 4 : 0), total);
      if (masked) {
        const mask = conn.buf.subarray(off, off + 4);
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      }
      conn.buf = conn.buf.subarray(total);
      if (op === 0x8) return close();
      if (op === 0x9) { try { sock.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); } catch (_) {} continue; }
      if (op === 0xa) { conn.alive = true; continue; }
      if (op === 0x1 || op === 0x0) {
        conn.frag.push(payload);
        if (fin) {
          const text = Buffer.concat(conn.frag).toString("utf8");
          conn.frag = [];
          try { onWsMessage(conn, JSON.parse(text)); } catch (_) {}
        }
      }
    }
  });
}
function onWsMessage(conn, msg) {
  const user = conn.user;
  conn.alive = true;
  if (msg.type === "ping") return wsSend(conn, { type: "pong" });
  if (msg.type === "typing") {
    const chat = db.chats[msg.chatId];
    if (chat && chat.members.includes(user.id)) for (const mid of chat.members) if (mid !== user.id) sendUser(mid, { type: "typing", chatId: chat.id, userId: user.id });
    return;
  }
  if (msg.type === "signal") {
    // WebRTC sinyali: belirli bağlantıya ya da kullanıcının tüm cihazlarına aktar
    const out = { type: "signal", from: user.id, fromConn: conn.id, data: msg.data };
    for (const c of sockets.get(msg.to) || []) {
      if (c === conn) continue;
      if (msg.toConn && c.id !== msg.toConn) continue;
      wsSend(c, out);
    }
  }
}
setInterval(() => {
  for (const set of sockets.values()) for (const c of set) {
    if (!c.alive) { c.close(); continue; }
    c.alive = false;
    try { c.sock.write(Buffer.from([0x89, 0])); } catch (_) {}
  }
}, 25000);

/* ---------------- Sunucu ---------------- */
async function handler(req, res) {
  let u;
  try { u = new URL(req.url, "http://x"); } catch (_) { res.writeHead(400); return res.end(); }
  let p;
  try { p = decodeURIComponent(u.pathname); } catch (_) { p = u.pathname; }
  try {
    if (p.startsWith("/api/")) return await api(req, res, u, p);
    let m;
    if (req.method === "GET" && (m = /^\/f\/([\w-]+)/.exec(p))) return serveFile(req, res, m[1], u);
    if (req.method === "GET" && p === "/ca.crt") {
      const ca = path.join(CERTS, "ca.crt");
      if (!fs.existsSync(ca)) { res.writeHead(404); return res.end("Sertifika yok. Termux'ta: bash sertifika.sh"); }
      res.writeHead(200, { "Content-Type": "application/x-x509-ca-cert", "Content-Disposition": 'attachment; filename="yerel-ca.crt"' });
      return fs.createReadStream(ca).pipe(res);
    }
    if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res, p);
    res.writeHead(405); res.end();
  } catch (e) {
    console.error("İstek hatası:", p, e.message);
    if (!res.headersSent) json(res, 500, { error: "Sunucu hatası" });
  }
}

function certCovers(ips) {
  try {
    const crt = new crypto.X509Certificate(fs.readFileSync(path.join(CERTS, "server.crt")));
    const san = crt.subjectAltName || "";
    if (new Date(crt.validTo) < new Date(Date.now() + 7 * 864e5)) return false;
    return ips.every((ip) => san.includes("IP Address:" + ip));
  } catch (_) { return false; }
}

(async () => {
  serverIPs = await lanIPs();
  if (!certCovers(serverIPs)) {
    console.log("• Sertifika hazırlanıyor (CA varsa aynı kalır)...");
    try { require("./certgen").ensure(CERTS, serverIPs, { label: LABEL }); } catch (e) { console.log("  Sertifika üretilemedi:", e.message); }
  }

  const httpServer = http.createServer(handler);
  httpServer.on("upgrade", onUpgrade);
  httpServer.requestTimeout = 0;
  httpServer.listen(PORT, "0.0.0.0");

  const key = path.join(CERTS, "server.key"), crt = path.join(CERTS, "server.crt");
  if (fs.existsSync(key) && fs.existsSync(crt)) {
    try {
      const s = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(crt) }, handler);
      s.on("upgrade", onUpgrade);
      s.requestTimeout = 0;
      // Aynı portta http:// ile gelenleri https://'e yönlendir (adres çubuğuna "https://" yazılmazsa)
      const redir = http.createServer((req, res) => {
        const host = (req.headers.host || "").replace(/:\d+$/, "") || "127.0.0.1";
        res.writeHead(301, { Location: `https://${host}:${HTTPS_PORT}${req.url || "/"}`, "Content-Length": 0 });
        res.end();
      });
      net.createServer((sock) => {
        sock.on("error", () => {});
        sock.once("data", (buf) => {
          sock.pause();
          sock.unshift(buf);
          (buf[0] === 0x16 ? s : redir).emit("connection", sock);
          process.nextTick(() => sock.resume());
        });
      }).listen(HTTPS_PORT, "0.0.0.0");
      httpsOn = true;
    } catch (e) { console.log("HTTPS başlatılamadı:", e.message); }
  }

  const main = serverIPs[0] || "127.0.0.1";
  const best = httpsOn ? `https://${main}:${HTTPS_PORT}` : `http://${main}:${PORT}`;
  console.log("\n  Yerel Messenger çalışıyor\n");
  for (const ip of serverIPs) {
    if (httpsOn) console.log(`  https://${ip}:${HTTPS_PORT}   (önerilen)`);
    console.log(`  http://${ip}:${PORT}`);
  }
  console.log(`  http://127.0.0.1:${PORT}   (bu cihaz)\n`);
  if (!httpsOn) console.log("  ! HTTPS kapalı: ses kaydı, arama ve uygulama kurulumu için 'bash sertifika.sh' çalıştır.\n");
  if (INVITE) console.log("  Davet kodu açık: kayıt için DAVET_KODU gerekir.\n");
  if (!process.env.YAKYN) try {
    const r = spawnSync("qrencode", ["-t", "ansiutf8", "-m", "2", best], { stdio: "inherit" });
    if (r.status === 0) console.log(`  Diğer cihazla okut: ${best}\n`);
  } catch (_) {}
})();
