package com.yakyn.app;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

/** Uygulama arka plandayken bağlantının (ve bildirimlerin) kesilmemesi için ön plan servisi. */
public class YerelService extends Service {
    static final String ACTION_STOP = "com.yakyn.app.STOP";

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            MainActivity a = MainActivity.current;
            if (a != null) a.finishAndRemoveTask();
            stopService(new Intent(this, NodeService.class));
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }
        Intent stop = new Intent(this, YerelService.class).setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(this, 2, stop, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(this, Notif.CH_BG)
                .setSmallIcon(R.drawable.ic_stat)
                .setColor(0xFF2B59C3)
                .setContentTitle("Yakyn açık")
                .setContentText("Mesaj ve aramalar için arka planda açık")
                .setOngoing(true)
                .setContentIntent(Notif.openApp(this, 3, null, false))
                .addAction(new Notification.Action.Builder(null, "Kapat", stopPi).build())
                .build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(Notif.ID_SERVICE, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(Notif.ID_SERVICE, n);
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
