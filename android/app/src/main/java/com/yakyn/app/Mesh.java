package com.yakyn.app;

import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.provider.Settings;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Kullanıcı IP ile uğraşmasın diye ağı kendisi yönetir:
 *  1) Aynı Wi-Fi'da Yakyn sunucusu ara (mDNS + alt ağ taraması).
 *  2) Varsa en eski başlatılmış olana bağlan; yoksa bu telefonda sunucuyu başlat.
 *  3) İki sunucu çakışırsa sonradan başlayan geri çekilir; bağlantı koparsa yeniden seçim yapılır.
 */
final class Mesh {
    static final String TAG = "YAKYN";

    static final class Cand {
        String ip, id;
        long started;
        boolean self;
    }

    final MainActivity a;
    final SharedPreferences prefs;
    final Nsd nsd;
    volatile boolean running = false, busy = false, hosting = false;
    volatile String base = null, baseId = null, hostId = null, status = "";
    volatile long hostStarted = 0;
    private Thread monitor;

    Mesh(MainActivity a) {
        this.a = a;
        this.prefs = a.prefs;
        this.nsd = new Nsd(a);
    }

    void start() {
        if (running) return;
        running = true;
        nsd.startDiscovery();
        new Thread(this::findAndConnect, "mesh-find").start();
        monitor = new Thread(this::monitorLoop, "mesh-monitor");
        monitor.start();
    }

    void stop() {
        running = false;
        nsd.stop();
        if (monitor != null) monitor.interrupt();
    }

    /** Bağlantı koptu: yeniden ara. */
    void lost() {
        if (busy) return;
        new Thread(this::findAndConnect, "mesh-lost").start();
    }

    private void status(String s) {
        status = s;
        a.meshStatus(s, false);
    }

    /* ---------------- keşif ---------------- */
    List<Cand> discover(long ms) {
        Map<String, Cand> byId = new LinkedHashMap<>();
        List<String> own = Net.ownIps();
        // alt ağ taraması (127.0.0.1 dahil) ve mDNS paralel
        final JSONArray[] scan = {new JSONArray()};
        Thread t = new Thread(() -> scan[0] = Net.scan(a));
        t.start();
        long end = System.currentTimeMillis() + ms;
        try { t.join(Math.max(500, end - System.currentTimeMillis())); } catch (InterruptedException ignored) {}
        for (int i = 0; i < scan[0].length(); i++) {
            JSONObject o = scan[0].optJSONObject(i);
            if (o != null) add(byId, o.optString("ip"), o.optString("id"), o.optLong("started", Long.MAX_VALUE), own);
        }
        // mDNS ile bulunan, taramada çıkmayan adresler
        ExecutorService ex = Executors.newFixedThreadPool(4);
        for (String ip : nsd.found()) {
            ex.execute(() -> {
                JSONObject j = Net.info(ip);
                if (j != null) synchronized (byId) { add(byId, ip, j.optString("id", ip), j.optLong("started", Long.MAX_VALUE), own); }
            });
        }
        ex.shutdown();
        try { ex.awaitTermination(3, TimeUnit.SECONDS); } catch (InterruptedException ignored) {}
        return new ArrayList<>(byId.values());
    }

    private void add(Map<String, Cand> byId, String ip, String id, long started, List<String> own) {
        if (ip == null || ip.isEmpty()) return;
        boolean self = ip.equals("127.0.0.1") || own.contains(ip);
        Cand c = byId.get(id);
        if (c == null) {
            c = new Cand();
            c.id = id;
            c.ip = ip;
            c.started = started;
            c.self = self;
            byId.put(id, c);
        } else if (self) {
            c.self = true;
            c.ip = "127.0.0.1";
        }
    }

    static Cand best(List<Cand> l) {
        Cand b = null;
        for (Cand c : l) {
            if (b == null || c.started < b.started || (c.started == b.started && c.id.compareTo(b.id) < 0)) b = c;
        }
        return b;
    }

    /* ---------------- ana akış ---------------- */
    synchronized void findAndConnect() {
        if (!running) return;
        busy = true;
        try {
            a.showSetup();
            status("Ağda Yakyn aranıyor…");
            List<Cand> c = discover(5000);
            if (c.isEmpty()) {
                // aynı anda açılan iki telefonun ikisi de sunucu olmasın: kısa rastgele bekleme + tekrar bak
                try { Thread.sleep(500 + new SecureRandom().nextInt(1500)); } catch (InterruptedException ignored) {}
                c = discover(2500);
            }
            if (!c.isEmpty()) {
                Cand b = best(c);
                if (hosting && !b.id.equals(hostId) && !b.self) stopHost();
                connect(b);
                return;
            }
            status("Ağda kimse yok, bu telefon başlatıyor…");
            if (!startHost()) {
                a.meshStatus("Sunucu başlatılamadı. Wi-Fi açık mı?", true);
                return;
            }
            Cand self = new Cand();
            self.ip = "127.0.0.1";
            self.id = hostId;
            self.started = hostStarted;
            self.self = true;
            connect(self);
        } catch (Exception e) {
            Log.e(TAG, "findAndConnect", e);
            a.meshStatus("Hata: " + e.getMessage(), true);
        } finally {
            busy = false;
        }
    }

    private void connect(Cand c) {
        String host = c.self ? "127.0.0.1" : c.ip;
        String b = "https://" + host + ":8443/";
        status(c.self ? "Bağlanılıyor…" : "Ağa katılınıyor…");
        String token = null;
        for (int i = 0; i < 3 && token == null && running; i++) {
            token = auth(b);
            if (token == null) try { Thread.sleep(1500); } catch (InterruptedException ignored) {}
        }
        if (token == null) {
            a.meshStatus("Ağa katılınamadı, tekrar deneniyor…", true);
            try { Thread.sleep(4000); } catch (InterruptedException ignored) {}
            if (running) new Thread(this::findAndConnect).start();
            return;
        }
        base = b;
        baseId = c.id;
        a.openServer(b + "#yk=" + Uri.encode(token));
    }

    /* ---------------- sunucu (host) ---------------- */
    private boolean startHost() {
        Intent i = new Intent(a, NodeService.class);
        i.putExtra("lan_ip", String.join(",", Net.ownIps()));
        try {
            a.startForegroundService(i);
        } catch (Exception e) {
            Log.e(TAG, "startHost", e);
            return false;
        }
        hosting = true;
        long end = System.currentTimeMillis() + 40000; // ilk açılışta sertifika üretimi sürebilir
        while (System.currentTimeMillis() < end && running) {
            JSONObject j = Net.info("127.0.0.1");
            if (j != null) {
                hostId = j.optString("id");
                hostStarted = j.optLong("started");
                nsd.register(8443);
                return true;
            }
            try { Thread.sleep(700); } catch (InterruptedException ignored) {}
        }
        stopHost();
        return false;
    }

    void stopHost() {
        nsd.unregister();
        try { a.stopService(new Intent(a, NodeService.class)); } catch (Exception ignored) {}
        hosting = false;
        hostId = null;
    }

    /* ---------------- izleme ---------------- */
    private void monitorLoop() {
        int fails = 0;
        while (running) {
            try { Thread.sleep(15000); } catch (InterruptedException e) { return; }
            if (busy || base == null || !running) continue;
            try {
                if (hosting) {
                    if (Net.info("127.0.0.1") == null) { fails++; } else fails = 0;
                    if (fails >= 2) { fails = 0; stopHost(); lost(); continue; }
                    // başka bir sunucu var mı? sonradan başlayan geri çekilir
                    List<Cand> c = discover(4000);
                    Cand other = null;
                    for (Cand x : c) if (!x.self && !x.id.equals(hostId)) other = (other == null || x.started < other.started) ? x : other;
                    if (other != null && (other.started < hostStarted || (other.started == hostStarted && other.id.compareTo(hostId) < 0))) {
                        Log.i(TAG, "Daha eski sunucu bulundu, geri çekiliyor: " + other.ip);
                        busy = true;
                        try { stopHost(); connect(other); } finally { busy = false; }
                    }
                } else {
                    Uri u = Uri.parse(base);
                    JSONObject j = Net.info(u.getHost());
                    if (j == null) fails++;
                    else { fails = 0; if (baseId != null && !baseId.equals(j.optString("id"))) { baseId = j.optString("id"); lost(); } }
                    if (fails >= 2) { fails = 0; lost(); }
                }
            } catch (Exception e) {
                Log.e(TAG, "monitor", e);
            }
        }
    }

    /* ---------------- otomatik hesap ---------------- */
    String username() {
        String u = prefs.getString("username", null);
        if (u == null) {
            String aid = Settings.Secure.getString(a.getContentResolver(), Settings.Secure.ANDROID_ID);
            u = "yk" + sha(aid == null ? String.valueOf(System.nanoTime()) : aid).substring(0, 10);
            prefs.edit().putString("username", u).apply();
        }
        return u;
    }

    String password() {
        String p = prefs.getString("password", null);
        if (p == null) {
            byte[] b = new byte[12];
            new SecureRandom().nextBytes(b);
            StringBuilder sb = new StringBuilder();
            for (byte x : b) sb.append(String.format("%02x", x & 0xff));
            p = sb.toString();
            prefs.edit().putString("password", p).apply();
        }
        return p;
    }

    static String sha(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for (byte x : d) sb.append(String.format("%02x", x & 0xff));
            return sb.toString();
        } catch (Exception e) {
            return Integer.toHexString(s.hashCode());
        }
    }

    /** Giriş yapar; hesap yoksa oluşturur. Token döner. */
    String auth(String b) {
        try {
            JSONObject body = new JSONObject();
            body.put("username", username());
            body.put("password", password());
            JSONObject r = post(b + "api/login", body);
            if (r != null && r.has("token")) return r.getString("token");
            body.put("name", prefs.getString("name", "Yakyn"));
            r = post(b + "api/register", body);
            if (r != null && r.has("token")) return r.getString("token");
            if (r != null && r.optInt("_status") == 409) {
                // kullanıcı adı başka şifreyle alınmış (ör. yeniden kurulum): yeni ad
                String nu = username() + "_" + Integer.toHexString(new SecureRandom().nextInt(0xffff));
                prefs.edit().putString("username", nu).apply();
                body.put("username", nu);
                r = post(b + "api/register", body);
                if (r != null && r.has("token")) return r.getString("token");
            }
        } catch (Exception e) {
            Log.e(TAG, "auth", e);
        }
        return null;
    }

    private JSONObject post(String url, JSONObject body) throws Exception {
        HttpURLConnection c = Net.open(url, 3000, 8000);
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/json");
        byte[] data = body.toString().getBytes("UTF-8");
        try (OutputStream o = c.getOutputStream()) { o.write(data); }
        int code = c.getResponseCode();
        String txt = Net.readAll(code < 400 ? c.getInputStream() : c.getErrorStream(), 65536);
        c.disconnect();
        JSONObject j;
        try { j = new JSONObject(txt); } catch (Exception e) { j = new JSONObject(); }
        j.put("_status", code);
        return j;
    }

    /** Ayarlarda gösterilecek kısa bilgi. */
    String info() {
        List<String> ips = Net.ownIps();
        if (hosting) return "Sunucu bu telefonda" + (ips.isEmpty() ? "" : " · PC: https://" + ips.get(0) + ":8443");
        if (base != null) return "Bağlı: " + Uri.parse(base).getHost();
        return "Bağlanıyor…";
    }
}
