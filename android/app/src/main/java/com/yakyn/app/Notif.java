package com.yakyn.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;

import java.util.HashSet;
import java.util.Set;

final class Notif {
    static final String CH_BG = "bg", CH_MSG = "msg", CH_CALL = "call", CH_DL = "dl";
    static final int ID_SERVICE = 1, ID_CALL = 777;
    private static final Set<Integer> msgIds = new HashSet<>();
    private static Ringtone ringtone;
    private static final Handler h = new Handler(Looper.getMainLooper());
    private static Runnable pendingStop;

    static void channels(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel bg = new NotificationChannel(CH_BG, "Arka plan bağlantısı", NotificationManager.IMPORTANCE_MIN);
        bg.setShowBadge(false);
        NotificationChannel msg = new NotificationChannel(CH_MSG, "Mesajlar", NotificationManager.IMPORTANCE_HIGH);
        msg.enableVibration(true);
        NotificationChannel call = new NotificationChannel(CH_CALL, "Gelen aramalar", NotificationManager.IMPORTANCE_HIGH);
        call.setSound(null, null); // zil sesini uygulama çalıyor
        call.enableVibration(false);
        call.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        NotificationChannel dl = new NotificationChannel(CH_DL, "İndirmeler", NotificationManager.IMPORTANCE_LOW);
        nm.createNotificationChannel(bg);
        nm.createNotificationChannel(msg);
        nm.createNotificationChannel(call);
        nm.createNotificationChannel(dl);
    }

    static PendingIntent openApp(Context c, int req, String chatId, boolean call) {
        Intent i = new Intent(c, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (chatId != null) i.putExtra("chat", chatId);
        if (call) i.putExtra("call", true);
        return PendingIntent.getActivity(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void message(Context c, String title, String body, String chatId) {
        int id = 1000 + (chatId.hashCode() & 0xffffff);
        Notification n = new Notification.Builder(c, CH_MSG)
                .setSmallIcon(R.drawable.ic_stat)
                .setColor(0xFF2B59C3)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setCategory(Notification.CATEGORY_MESSAGE)
                .setAutoCancel(true)
                .setContentIntent(openApp(c, id, chatId, false))
                .build();
        c.getSystemService(NotificationManager.class).notify(id, n);
        synchronized (msgIds) { msgIds.add(id); }
    }

    static void cancelChat(Context c, String chatId) {
        int id = 1000 + (chatId.hashCode() & 0xffffff);
        c.getSystemService(NotificationManager.class).cancel(id);
        synchronized (msgIds) { msgIds.remove(id); }
    }

    static void cancelAllMessages(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        synchronized (msgIds) {
            for (int id : msgIds) nm.cancel(id);
            msgIds.clear();
        }
    }

    static void call(Context c, String name, boolean video) {
        PendingIntent pi = openApp(c, ID_CALL, null, true);
        Notification n = new Notification.Builder(c, CH_CALL)
                .setSmallIcon(R.drawable.ic_stat)
                .setColor(0xFF2B59C3)
                .setContentTitle(name + " arıyor")
                .setContentText(video ? "Görüntülü arama — açmak için dokun" : "Sesli arama — açmak için dokun")
                .setCategory(Notification.CATEGORY_CALL)
                .setOngoing(true)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .setFullScreenIntent(pi, true)
                .build();
        c.getSystemService(NotificationManager.class).notify(ID_CALL, n);
        h.post(() -> {
            try {
                if (ringtone != null) ringtone.stop();
                Uri u = RingtoneManager.getActualDefaultRingtoneUri(c, RingtoneManager.TYPE_RINGTONE);
                if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
                ringtone = RingtoneManager.getRingtone(c.getApplicationContext(), u);
                if (ringtone != null) {
                    ringtone.setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
                    if (Build.VERSION.SDK_INT >= 28) ringtone.setLooping(true);
                    ringtone.play();
                }
            } catch (Exception ignored) {
            }
            try {
                Vibrator v = c.getSystemService(Vibrator.class);
                if (v != null) v.vibrate(VibrationEffect.createWaveform(new long[]{0, 600, 400, 600, 1400}, 0));
            } catch (Exception ignored) {
            }
            if (pendingStop != null) h.removeCallbacks(pendingStop);
            pendingStop = () -> stopRingInternal(c);
            h.postDelayed(pendingStop, 50000);
        });
    }

    static void stopRing(Context c) {
        h.post(() -> stopRingInternal(c));
    }

    private static void stopRingInternal(Context c) {
        if (pendingStop != null) { h.removeCallbacks(pendingStop); pendingStop = null; }
        try {
            if (ringtone != null) ringtone.stop();
        } catch (Exception ignored) {
        }
        ringtone = null;
        if (c != null) {
            try {
                Vibrator v = c.getSystemService(Vibrator.class);
                if (v != null) v.cancel();
            } catch (Exception ignored) {
            }
            c.getSystemService(NotificationManager.class).cancel(ID_CALL);
        }
    }
}
