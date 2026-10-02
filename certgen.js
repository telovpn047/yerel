"use strict";
// Bağımlılıksız X.509 üretici: yerel CA + sunucu sertifikası (SAN'da IP'ler).
// openssl gerektirmez; Android'e gömülü Node.js'te de çalışır.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

/* ---------- DER yardımcıları ---------- */
function len(n) {
  if (n < 0x80) return Buffer.from([n]);
  const b = [];
  while (n > 0) { b.unshift(n & 0xff); n >>= 8; }
  return Buffer.from([0x80 | b.length, ...b]);
}
const tlv = (tag, body) => Buffer.concat([Buffer.from([tag]), len(body.length), body]);
const seq = (...items) => tlv(0x30, Buffer.concat(items));
const set = (...items) => tlv(0x31, Buffer.concat(items));
const ctx = (n, body) => tlv(0xa0 + n, body); // [n] EXPLICIT
const nul = () => Buffer.from([0x05, 0x00]);
const bool = (v) => tlv(0x01, Buffer.from([v ? 0xff : 0x00]));
const octet = (b) => tlv(0x04, b);
const utf8 = (s) => tlv(0x0c, Buffer.from(s, "utf8"));
const ia5 = (s) => Buffer.from(s, "ascii");
function int(buf) {
  if (typeof buf === "number") { const b = []; let n = buf; do { b.unshift(n & 0xff); n >>= 8; } while (n > 0); buf = Buffer.from(b); }
  let i = 0;
  while (i < buf.length - 1 && buf[i] === 0) i++;
  buf = buf.slice(i);
  if (buf[0] & 0x80) buf = Buffer.concat([Buffer.from([0]), buf]);
  return tlv(0x02, buf);
}
function bits(buf, unused = 0) { return tlv(0x03, Buffer.concat([Buffer.from([unused]), buf])); }
function oid(s) {
  const p = s.split(".").map(Number);
  const out = [40 * p[0] + p[1]];
  for (let i = 2; i < p.length; i++) {
    let v = p[i];
    const tmp = [v & 0x7f];
    v >>= 7;
    while (v > 0) { tmp.unshift(0x80 | (v & 0x7f)); v >>= 7; }
    out.push(...tmp);
  }
  return tlv(0x06, Buffer.from(out));
}
function time(d) {
  const z = (n, l = 2) => String(n).padStart(l, "0");
  const y = d.getUTCFullYear();
  const body = `${y < 2050 ? z(y % 100) : z(y, 4)}${z(d.getUTCMonth() + 1)}${z(d.getUTCDate())}${z(d.getUTCHours())}${z(d.getUTCMinutes())}${z(d.getUTCSeconds())}Z`;
  return tlv(y < 2050 ? 0x17 : 0x18, Buffer.from(body, "ascii"));
}
const name = (cn, o) => seq(
  set(seq(oid("2.5.4.3"), utf8(cn))),
  set(seq(oid("2.5.4.10"), utf8(o)))
);
const ext = (id, critical, value) => critical ? seq(oid(id), bool(true), octet(value)) : seq(oid(id), octet(value));
const SHA256_RSA = seq(oid("1.2.840.113549.1.1.11"), nul());

function keyId(spkiDer) {
  // SubjectPublicKeyInfo içindeki BIT STRING'in SHA-1'i (RFC 5280 yöntem 1'e yakın)
  return crypto.createHash("sha1").update(spkiDer).digest();
}

function makeCert({ subject, issuer, spki, signKey, days, extensions }) {
  const now = new Date(Date.now() - 24 * 3600 * 1000);
  const end = new Date(now.getTime() + days * 24 * 3600 * 1000);
  const serial = crypto.randomBytes(16); serial[0] &= 0x7f; serial[0] |= 0x01;
  const tbs = seq(
    ctx(0, int(2)),
    int(serial),
    SHA256_RSA,
    issuer,
    seq(time(now), time(end)),
    subject,
    spki,
    ctx(3, seq(...extensions))
  );
  const sig = crypto.sign("sha256", tbs, signKey);
  return seq(tbs, SHA256_RSA, bits(sig));
}

const pem = (der, label) => `-----BEGIN ${label}-----\n${der.toString("base64").match(/.{1,64}/g).join("\n")}\n-----END ${label}-----\n`;

function genKey() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  return { spki: publicKey.export({ type: "spki", format: "der" }), key: privateKey };
}

function ipBytes(ip) { return Buffer.from(ip.split(".").map(Number)); }

/** CA yoksa oluşturur; sunucu sertifikasını verilen IP'lerle (yeniden) üretir. */
function ensure(dir, ips, opts = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const caKeyF = path.join(dir, "ca.key"), caCrtF = path.join(dir, "ca.crt");
  const keyF = path.join(dir, "server.key"), crtF = path.join(dir, "server.crt");
  const label = opts.label || "Yerel Messenger";

  let caKey, caName, caSpki;
  if (fs.existsSync(caKeyF) && fs.existsSync(caCrtF) && !opts.reset) {
    caKey = crypto.createPrivateKey(fs.readFileSync(caKeyF));
    const x = new crypto.X509Certificate(fs.readFileSync(caCrtF));
    caSpki = x.publicKey.export({ type: "spki", format: "der" });
    caName = null; // aşağıda sertifikadan alınır
    caName = subjectDer(x.raw);
  } else {
    const k = genKey();
    caKey = k.key; caSpki = k.spki;
    caName = name(label + " CA", label);
    const der = makeCert({
      subject: caName, issuer: caName, spki: caSpki, signKey: caKey, days: 3650,
      extensions: [
        ext("2.5.29.19", true, seq(bool(true))),                         // basicConstraints CA:TRUE
        ext("2.5.29.15", true, bits(Buffer.from([0x06]), 1)),            // keyUsage keyCertSign, cRLSign
        ext("2.5.29.14", false, octet(keyId(caSpki))),                   // SKI
      ],
    });
    fs.writeFileSync(caKeyF, caKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
    fs.writeFileSync(caCrtF, pem(der, "CERTIFICATE"));
  }

  const k = genKey();
  const san = [tlv(0x82, ia5("localhost")), tlv(0x87, ipBytes("127.0.0.1"))];
  for (const ip of ips) if (/^\d+\.\d+\.\d+\.\d+$/.test(ip) && ip !== "127.0.0.1") san.push(tlv(0x87, ipBytes(ip)));
  const der = makeCert({
    subject: name(label, label), issuer: caName, spki: k.spki, signKey: caKey, days: 397,
    extensions: [
      ext("2.5.29.19", false, seq()),                                     // CA:FALSE
      ext("2.5.29.15", true, bits(Buffer.from([0xa0]), 5)),               // digitalSignature, keyEncipherment
      ext("2.5.29.37", false, seq(oid("1.3.6.1.5.5.7.3.1"))),             // serverAuth
      ext("2.5.29.17", false, seq(...san)),                               // SAN
      ext("2.5.29.14", false, octet(keyId(k.spki))),
      ext("2.5.29.35", false, seq(tlv(0x80, keyId(caSpki)))),             // AKI
    ],
  });
  fs.writeFileSync(keyF, k.key.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  fs.writeFileSync(crtF, pem(der, "CERTIFICATE"));
  return { ca: caCrtF, key: keyF, cert: crtF };
}

/* Sertifika DER'inden subject Name alanını çıkar (CA'yı yeniden kullanırken issuer olarak). */
function readTLV(buf, off) {
  const tag = buf[off];
  let l = buf[off + 1], hdr = 2;
  if (l & 0x80) { const n = l & 0x7f; l = 0; for (let i = 0; i < n; i++) l = (l << 8) | buf[off + 2 + i]; hdr = 2 + n; }
  return { tag, start: off, body: off + hdr, end: off + hdr + l };
}
function subjectDer(certDer) {
  const cert = readTLV(certDer, 0);
  const tbs = readTLV(certDer, cert.body);
  let o = tbs.body;
  const items = [];
  while (o < tbs.end) { const t = readTLV(certDer, o); items.push(t); o = t.end; }
  // [0]version, serial, alg, issuer, validity, subject
  const i0 = items[0].tag === 0xa0 ? 1 : 0;
  const subj = items[i0 + 4];
  return certDer.slice(subj.start, subj.end);
}

module.exports = { ensure };

if (require.main === module) {
  const ips = process.argv.slice(2);
  const r = ensure(path.join(__dirname, "certs"), ips);
  console.log("• Sertifikalar hazır:", r.cert, ips.join(" "));
}
