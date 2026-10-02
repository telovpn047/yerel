package com.yakyn.app;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** mDNS / DNS-SD (Android NSD) ile "_yakyn._tcp" sunucularını duyurur ve bulur. */
final class Nsd {
    static final String TYPE = "_yakyn._tcp";
    private final NsdManager nm;
    private final WifiManager.MulticastLock lock;
    private final Set<String> ips = new LinkedHashSet<>();
    private final ArrayDeque<NsdServiceInfo> queue = new ArrayDeque<>();
    private boolean resolving = false;
    private NsdManager.DiscoveryListener dl;
    private NsdManager.RegistrationListener rl;

    Nsd(Context c) {
        nm = (NsdManager) c.getApplicationContext().getSystemService(Context.NSD_SERVICE);
        WifiManager wm = (WifiManager) c.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        lock = wm != null ? wm.createMulticastLock("yakyn") : null;
        if (lock != null) lock.setReferenceCounted(false);
    }

    synchronized List<String> found() { return new ArrayList<>(ips); }

    synchronized void startDiscovery() {
        if (dl != null || nm == null) return;
        try { if (lock != null) lock.acquire(); } catch (Exception ignored) {}
        dl = new NsdManager.DiscoveryListener() {
            public void onStartDiscoveryFailed(String t, int e) { synchronized (Nsd.this) { dl = null; } }
            public void onStopDiscoveryFailed(String t, int e) {}
            public void onDiscoveryStarted(String t) {}
            public void onDiscoveryStopped(String t) {}
            public void onServiceFound(NsdServiceInfo si) { enqueue(si); }
            public void onServiceLost(NsdServiceInfo si) {}
        };
        try { nm.discoverServices(TYPE, NsdManager.PROTOCOL_DNS_SD, dl); } catch (Exception e) { dl = null; }
    }

    private synchronized void enqueue(NsdServiceInfo si) {
        queue.add(si);
        next();
    }

    @SuppressWarnings("deprecation")
    private synchronized void next() {
        if (resolving || queue.isEmpty()) return;
        resolving = true;
        NsdServiceInfo si = queue.poll();
        try {
            nm.resolveService(si, new NsdManager.ResolveListener() {
                public void onResolveFailed(NsdServiceInfo s, int e) { done(null); }
                public void onServiceResolved(NsdServiceInfo s) {
                    String ip = s.getHost() != null ? s.getHost().getHostAddress() : null;
                    done(ip);
                }
            });
        } catch (Exception e) {
            resolving = false;
        }
    }

    private synchronized void done(String ip) {
        if (ip != null && ip.indexOf(':') < 0) ips.add(ip);
        resolving = false;
        next();
    }

    synchronized void register(int port) {
        if (rl != null || nm == null) return;
        NsdServiceInfo si = new NsdServiceInfo();
        si.setServiceName("Yakyn");
        si.setServiceType(TYPE);
        si.setPort(port);
        rl = new NsdManager.RegistrationListener() {
            public void onRegistrationFailed(NsdServiceInfo s, int e) { synchronized (Nsd.this) { rl = null; } }
            public void onUnregistrationFailed(NsdServiceInfo s, int e) {}
            public void onServiceRegistered(NsdServiceInfo s) {}
            public void onServiceUnregistered(NsdServiceInfo s) {}
        };
        try { nm.registerService(si, NsdManager.PROTOCOL_DNS_SD, rl); } catch (Exception e) { rl = null; }
    }

    synchronized void unregister() {
        if (rl == null) return;
        try { nm.unregisterService(rl); } catch (Exception ignored) {}
        rl = null;
    }

    synchronized void stop() {
        unregister();
        if (dl != null) { try { nm.stopServiceDiscovery(dl); } catch (Exception ignored) {} dl = null; }
        try { if (lock != null) lock.release(); } catch (Exception ignored) {}
    }
}
