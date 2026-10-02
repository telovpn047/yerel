package com.yakyn.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.webkit.URLUtil;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URLDecoder;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Dosyaları İndirilenler/Yakyn klasörüne kaydeder (kendinden imzalı sertifikayla da çalışır). */
final class Downloader {
    private static final Handler ui = new Handler(Looper.getMainLooper());

    static String fileName(String url, String disposition, String mime) {
        if (disposition != null) {
            Matcher m = Pattern.compile("filename\\*=UTF-8''([^;]+)", Pattern.CASE_INSENSITIVE).matcher(disposition);
            if (m.find()) {
                try {
                    return URLDecoder.decode(m.group(1).trim(), "UTF-8");
                } catch (Exception ignored) {
                }
            }
            m = Pattern.compile("filename=\"?([^\";]+)\"?", Pattern.CASE_INSENSITIVE).matcher(disposition);
            if (m.find()) return m.group(1).trim();
        }
        return URLUtil.guessFileName(url, disposition, mime);
    }

    static void start(Context ctx, String url, String disposition, String mime) {
        Context c = ctx.getApplicationContext();
        new Thread(() -> {
            HttpURLConnection conn = null;
            String name = "dosya";
            try {
                conn = Net.open(url, 5000, 30000);
                int code = conn.getResponseCode();
                if (code != 200) throw new Exception("HTTP " + code);
                String cd = conn.getHeaderField("Content-Disposition");
                String type = conn.getContentType();
                if (type == null || type.isEmpty()) type = mime != null && !mime.isEmpty() ? mime : "application/octet-stream";
                if (type.contains(";")) type = type.substring(0, type.indexOf(';')).trim();
                name = fileName(url, cd != null ? cd : disposition, type).replace('/', '_');
                final String shown = name;
                ui.post(() -> Toast.makeText(c, "İndiriliyor: " + shown, Toast.LENGTH_SHORT).show());

                Uri target = null;
                OutputStream out;
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, type);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Yakyn");
                    v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    ContentResolver cr = c.getContentResolver();
                    target = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (target == null) throw new Exception("Kayıt yeri açılamadı");
                    out = cr.openOutputStream(target);
                } else {
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Yakyn");
                    //noinspection ResultOfMethodCallIgnored
                    dir.mkdirs();
                    out = new FileOutputStream(new File(dir, name));
                }
                try (InputStream in = conn.getInputStream(); OutputStream o = out) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
                }
                if (target != null) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    c.getContentResolver().update(target, v, null, null);
                }
                done(c, name, target, type, null);
            } catch (Exception e) {
                done(c, name, null, null, e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    private static void done(Context c, String name, Uri uri, String type, String err) {
        Notification.Builder b = new Notification.Builder(c, Notif.CH_DL)
                .setSmallIcon(R.drawable.ic_stat)
                .setColor(0xFF2B59C3)
                .setAutoCancel(true);
        if (err == null) {
            b.setContentTitle("İndirildi").setContentText(name + " → İndirilenler/Yakyn");
            if (uri != null) {
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(uri, type);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                b.setContentIntent(PendingIntent.getActivity(c, name.hashCode(), Intent.createChooser(i, name).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
            }
        } else {
            b.setContentTitle("İndirilemedi").setContentText(name + ": " + err);
        }
        try {
            c.getSystemService(NotificationManager.class).notify(5000 + (name.hashCode() & 0xffff), b.build());
        } catch (Exception ignored) {
        }
        final String msg = err == null ? "İndirildi: " + name : "İndirilemedi: " + err;
        ui.post(() -> Toast.makeText(c, msg, Toast.LENGTH_SHORT).show());
    }
}
