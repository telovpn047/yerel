package com.yakyn.app;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.content.res.AssetManager;
import android.os.Build;
import android.os.IBinder;
import android.system.Os;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Yakyn sunucusu: gömülü Node.js ile server.js'i ayrı bir süreçte (":node") çalıştırır.
 * Node bir süreçte yalnızca bir kez başlatılabildiği için durdurmak = süreci sonlandırmak.
 */
public class NodeService extends Service {
    static final String ACTION_STOP = "com.yakyn.app.NODE_STOP";
    static final int NOTIF_ID = 2;
    private static boolean started = false;

    static {
        System.loadLibrary("node");
        System.loadLibrary("native-lib");
    }

    public native int startNodeWithArguments(String[] args);

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        Notif.channels(this);
        Intent stop = new Intent(this, YerelService.class).setAction(YerelService.ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(this, 4, stop, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(this, Notif.CH_BG)
                .setSmallIcon(R.drawable.ic_stat)
                .setColor(0xFF2B59C3)
                .setContentTitle("Yakyn ağı bu telefonda")
                .setContentText("Aynı Wi-Fi'daki herkes bu telefon üzerinden mesajlaşıyor")
                .setOngoing(true)
                .setContentIntent(Notif.openApp(this, 5, null, false))
                .addAction(new Notification.Action.Builder(null, "Kapat", stopPi).build())
                .build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(NOTIF_ID, n);

        if (!started) {
            started = true;
            String lanIp = intent != null ? intent.getStringExtra("lan_ip") : null;
            new Thread(null, () -> runNode(lanIp), "node", 16 * 1024 * 1024).start();
        }
        return START_NOT_STICKY;
    }

    private void runNode(String lanIp) {
        try {
            File dir = new File(getFilesDir(), "server");
            copyAssetsIfNeeded(dir);
            Os.setenv("PORT", "8080", true);
            Os.setenv("HTTPS_PORT", "8443", true);
            Os.setenv("YAKYN", "1", true);
            Os.setenv("APP_LABEL", "Yakyn", true);
            Os.setenv("HOME", getFilesDir().getAbsolutePath(), true);
            Os.setenv("TMPDIR", getCacheDir().getAbsolutePath(), true);
            if (lanIp != null && !lanIp.isEmpty()) Os.setenv("LAN_IP", lanIp, true);
            int code = startNodeWithArguments(new String[]{"node", new File(dir, "server.js").getAbsolutePath()});
            Log.e("YAKYN-NODE", "Node çıktı: " + code);
        } catch (Throwable t) {
            Log.e("YAKYN-NODE", "Node başlatılamadı", t);
        }
        stopSelf();
    }

    /** Sunucu dosyalarını (server.js, certgen.js, public/) uygulama güncellenince yeniden kopyalar; data/ ve certs/ korunur. */
    private void copyAssetsIfNeeded(File dir) throws Exception {
        SharedPreferences p = getSharedPreferences("node", MODE_PRIVATE);
        long stamp = getPackageManager().getPackageInfo(getPackageName(), 0).lastUpdateTime;
        if (p.getLong("assets", 0) == stamp && new File(dir, "server.js").exists()) return;
        copyDir(getAssets(), "server", dir);
        p.edit().putLong("assets", stamp).apply();
    }

    private void copyDir(AssetManager am, String from, File to) throws Exception {
        String[] list = am.list(from);
        if (list == null || list.length == 0) {
            to.getParentFile().mkdirs();
            try (InputStream in = am.open(from); OutputStream out = new FileOutputStream(to)) {
                byte[] buf = new byte[32 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            return;
        }
        to.mkdirs();
        for (String f : list) copyDir(am, from + "/" + f, new File(to, f));
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        // Node yeniden başlatılamaz: süreci tamamen kapat
        android.os.Process.killProcess(android.os.Process.myPid());
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
