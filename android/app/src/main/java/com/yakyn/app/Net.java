package com.yakyn.app;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/** Yerel ağ yardımcıları: özel IP kontrolü, kendinden imzalı sertifikaya güven, sunucu taraması. */
final class Net {
    private static SSLSocketFactory trustAll;

    static boolean isPrivate(String host) {
        if (host == null) return false;
        if (host.equals("localhost") || host.endsWith(".local")) return true;
        String[] p = host.split("\\.");
        if (p.length != 4) return false;
        try {
            int a = Integer.parseInt(p[0]), b = Integer.parseInt(p[1]);
            return a == 10 || a == 127 || (a == 192 && b == 168) || (a == 172 && b >= 16 && b <= 31)
                    || (a == 169 && b == 254) || (a == 100 && b >= 64 && b <= 127);
        } catch (NumberFormatException e) {
            return false;
        }
    }

    static synchronized SSLSocketFactory trustAllFactory() throws Exception {
        if (trustAll == null) {
            TrustManager[] tm = new TrustManager[]{new X509TrustManager() {
                public void checkClientTrusted(X509Certificate[] c, String a) {}
                public void checkServerTrusted(X509Certificate[] c, String a) {}
                public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            }};
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(null, tm, new SecureRandom());
            trustAll = ctx.getSocketFactory();
        }
        return trustAll;
    }

    /** Yerel adreslerde sertifika doğrulamasını atlayan bağlantı açar. */
    static HttpURLConnection open(String url, int connectMs, int readMs) throws Exception {
        URL u = new URL(url);
        HttpURLConnection c = (HttpURLConnection) u.openConnection();
        if (c instanceof HttpsURLConnection && isPrivate(u.getHost())) {
            HttpsURLConnection h = (HttpsURLConnection) c;
            h.setSSLSocketFactory(trustAllFactory());
            h.setHostnameVerifier((hn, s) -> true);
        }
        c.setConnectTimeout(connectMs);
        c.setReadTimeout(readMs);
        c.setInstanceFollowRedirects(true);
        return c;
    }

    static String readAll(InputStream in, int max) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = in.read(buf)) > 0 && out.size() < max) out.write(buf, 0, n);
        return out.toString("UTF-8");
    }

    /** Bağlı Wi-Fi alt ağlarında 8443 portunda Yerel sunucusu arar. */
    /** Bu cihazın yerel IPv4 adresleri (Wi-Fi / hotspot). */
    static List<String> ownIps() {
        List<String> r = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                String name = ni.getName().toLowerCase();
                if (name.startsWith("rmnet") || name.startsWith("ccmni") || name.startsWith("tun") || name.startsWith("ppp") || name.startsWith("dummy")) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses()))
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) r.add(a.getHostAddress());
            }
        } catch (Exception ignored) {
        }
        return r;
    }

    /** host:8443/api/info, yoksa null. */
    static JSONObject info(String host) {
        try {
            HttpURLConnection c = open("https://" + host + ":8443/api/info", 900, 2000);
            if (c.getResponseCode() != 200) return null;
            JSONObject j = new JSONObject(readAll(c.getInputStream(), 8192));
            c.disconnect();
            return "Yerel".equals(j.optString("name")) ? j : null;
        } catch (Exception e) {
            return null;
        }
    }

    static JSONArray scan(Context ctx) {
        Set<String> hosts = new LinkedHashSet<>();
        hosts.add("127.0.0.1");
        List<String> own = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                String name = ni.getName().toLowerCase();
                if (name.startsWith("rmnet") || name.startsWith("ccmni") || name.startsWith("tun") || name.startsWith("ppp") || name.startsWith("dummy")) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (!(a instanceof Inet4Address) || !a.isSiteLocalAddress()) continue;
                    String ip = a.getHostAddress();
                    own.add(ip);
                    String pre = ip.substring(0, ip.lastIndexOf('.') + 1);
                    for (int i = 1; i < 255; i++) hosts.add(pre + i);
                }
            }
        } catch (Exception ignored) {
        }

        JSONArray found = new JSONArray();
        ExecutorService ex = Executors.newFixedThreadPool(64);
        for (String h : hosts) {
            ex.execute(() -> {
                try {
                    HttpURLConnection c = open("https://" + h + ":8443/api/info", 700, 1500);
                    if (c.getResponseCode() == 200) {
                        String body = readAll(c.getInputStream(), 8192);
                        JSONObject j = new JSONObject(body);
                        if ("Yerel".equals(j.optString("name"))) {
                            JSONObject o = new JSONObject();
                            o.put("ip", h);
                            o.put("url", "https://" + h + ":8443/");
                            o.put("users", j.optInt("users"));
                            o.put("id", j.optString("id", h));
                            o.put("started", j.optLong("started", Long.MAX_VALUE));
                            o.put("self", h.equals("127.0.0.1") || own.contains(h));
                            synchronized (found) { found.put(o); }
                        }
                    }
                    c.disconnect();
                } catch (Exception ignored) {
                }
            });
        }
        ex.shutdown();
        try {
            ex.awaitTermination(6, TimeUnit.SECONDS);
        } catch (InterruptedException ignored) {
        }
        ex.shutdownNow();
        return found;
    }
}
