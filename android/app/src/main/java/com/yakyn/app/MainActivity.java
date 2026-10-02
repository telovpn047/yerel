package com.yakyn.app;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
    static volatile boolean foreground = false;
    static MainActivity current;

    static final int REQ_FILE = 1, REQ_PERM = 2, REQ_NOTIF = 3, REQ_STORAGE = 4;
    static final String SETUP = "file:///android_asset/setup.html";

    final Handler ui = new Handler(Looper.getMainLooper());
    WebView web;
    SharedPreferences prefs;
    ValueCallback<Uri[]> fileCb;
    PermissionRequest pendingPerm;
    volatile String launchChat = null;
    boolean clearHistoryOnLoad = false;
    Mesh mesh;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        current = this;
        prefs = getSharedPreferences("yerel", MODE_PRIVATE);
        Notif.channels(this);

        WebView.setWebContentsDebuggingEnabled(true);
        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setSupportMultipleWindows(false);
        s.setUserAgentString(s.getUserAgentString() + " YerelApp/1.0");

        web.addJavascriptInterface(new Bridge(), "YerelApp");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.setDownloadListener((url, ua, disposition, mime, length) -> Downloader.start(this, url, disposition, mime));

        handleIntent(getIntent(), true);
        askPermissions();
        startBgService();

        mesh = new Mesh(this);
        loadSetup(null);
        if (prefs.getString("name", null) != null) mesh.start();
    }

    /* ---------------- Mesh geri çağrıları ---------------- */
    void showSetup() {
        ui.post(() -> {
            if (web != null && (web.getUrl() == null || !web.getUrl().startsWith("file:"))) loadSetup(null);
        });
    }

    void meshStatus(String s, boolean err) {
        js("window.onStatus&&onStatus(" + JSONObject.quote(s) + "," + err + ")");
    }

    void openServer(String url) {
        ui.post(() -> {
            if (web == null) return;
            clearHistoryOnLoad = true;
            web.loadUrl(url);
        });
    }

    /* ---------------- izinler / servis ---------------- */
    void askPermissions() {
        List<String> need = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED)
            need.add("android.permission.POST_NOTIFICATIONS");
        if (Build.VERSION.SDK_INT < 29 && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED)
            need.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
        if (!need.isEmpty()) requestPermissions(need.toArray(new String[0]), REQ_NOTIF);
    }

    void startBgService() {
        try {
            startForegroundService(new Intent(this, YerelService.class));
        } catch (Exception ignored) {
        }
    }

    /* ---------------- yaşam döngüsü ---------------- */
    @Override
    protected void onResume() {
        super.onResume();
        foreground = true;
        current = this;
        Notif.cancelAllMessages(this);
    }

    @Override
    protected void onPause() {
        super.onPause();
        foreground = false;
    }

    @Override
    protected void onDestroy() {
        if (current == this) current = null;
        if (mesh != null) mesh.stop();
        if (isFinishing()) stopService(new Intent(this, NodeService.class));
        foreground = false;
        if (isFinishing()) stopService(new Intent(this, YerelService.class));
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent, false);
    }

    void handleIntent(Intent i, boolean fresh) {
        if (i == null) return;
        String action = i.getAction();
        if (Intent.ACTION_SEND.equals(action) || Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ShareBox.take(this, i);
            if (!fresh) js("window.yerelShare&&yerelShare()");
        }
        String chat = i.getStringExtra("chat");
        if (chat != null) {
            i.removeExtra("chat");
            if (fresh) launchChat = chat;
            else js("window.yerelOpenChat&&yerelOpenChat(" + JSONObject.quote(chat) + ")");
        }
        if (i.getBooleanExtra("call", false)) {
            i.removeExtra("call");
            if (Build.VERSION.SDK_INT >= 27) {
                setShowWhenLocked(true);
                setTurnScreenOn(true);
            } else {
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
            }
        }
    }

    void clearLockFlags() {
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(false);
            setTurnScreenOn(false);
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
    }

    void js(String code) {
        ui.post(() -> {
            if (web != null) web.evaluateJavascript(code, null);
        });
    }

    void loadSetup(String err) {
        if (web == null) return;
        String u = SETUP;
        String server = prefs.getString("server", null);
        StringBuilder q = new StringBuilder();
        if (err != null) q.append("e=").append(Uri.encode(err));
        if (server != null) q.append(q.length() > 0 ? "&" : "").append("s=").append(Uri.encode(server));
        if (q.length() > 0) u += "?" + q;
        web.loadUrl(u);
    }

    static String normalize(String in) {
        String s = in.trim();
        if (s.isEmpty()) return null;
        if (!s.startsWith("http://") && !s.startsWith("https://")) s = "https://" + s;
        Uri u = Uri.parse(s);
        if (u.getHost() == null || u.getHost().isEmpty()) return null;
        int port = u.getPort();
        if (port == -1) port = "https".equals(u.getScheme()) ? 8443 : 8080;
        return u.getScheme() + "://" + u.getHost() + ":" + port + "/";
    }

    boolean isServerUrl(Uri u) {
        String server = mesh != null ? mesh.base : null;
        if (u != null && "127.0.0.1".equals(u.getHost()) && u.getPort() == 8443) return true;
        if (server == null || u == null) return false;
        Uri s = Uri.parse(server);
        return s.getHost() != null && s.getHost().equals(u.getHost()) && s.getPort() == u.getPort();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else moveTaskToBack(true);
    }

    /* ---------------- dosya seçici / izin sonuçları ---------------- */
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILE || fileCb == null) return;
        Uri[] res = null;
        if (resultCode == RESULT_OK && data != null) {
            ClipData clip = data.getClipData();
            if (clip != null && clip.getItemCount() > 0) {
                res = new Uri[clip.getItemCount()];
                for (int i = 0; i < res.length; i++) res[i] = clip.getItemAt(i).getUri();
            } else if (data.getData() != null) {
                res = new Uri[]{data.getData()};
            }
        }
        fileCb.onReceiveValue(res);
        fileCb = null;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == REQ_PERM && pendingPerm != null) {
            List<String> ok = new ArrayList<>();
            for (int i = 0; i < permissions.length; i++) {
                if (results.length > i && results[i] == PackageManager.PERMISSION_GRANTED) {
                    if (Manifest.permission.RECORD_AUDIO.equals(permissions[i])) ok.add(PermissionRequest.RESOURCE_AUDIO_CAPTURE);
                    if (Manifest.permission.CAMERA.equals(permissions[i])) ok.add(PermissionRequest.RESOURCE_VIDEO_CAPTURE);
                }
            }
            List<String> grant = new ArrayList<>();
            for (String r : pendingPerm.getResources()) if (ok.contains(r)) grant.add(r);
            if (grant.isEmpty()) {
                pendingPerm.deny();
                Toast.makeText(this, "İzin verilmedi. Ayarlar → Uygulamalar → Yerel → İzinler", Toast.LENGTH_LONG).show();
            } else pendingPerm.grant(grant.toArray(new String[0]));
            pendingPerm = null;
        }
        if (requestCode == REQ_NOTIF) js("window.dispatchEvent(new Event('yerelnotif'))");
    }

    /* ---------------- WebView istemcileri ---------------- */
    class Client extends WebViewClient {
        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            String host = Uri.parse(error.getUrl()).getHost();
            if (Net.isPrivate(host)) handler.proceed();
            else handler.cancel();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
            if (req.isForMainFrame() && !req.getUrl().toString().startsWith("file:")) {
                loadSetup(null);
                if (mesh != null) mesh.lost();
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            String scheme = u.getScheme();
            if ("file".equals(scheme)) return false;
            if (isServerUrl(u)) return false;
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, u));
            } catch (ActivityNotFoundException ignored) {
            }
            return true;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            String p = u.getPath();
            if (p != null && p.startsWith("/__nshare/")) return ShareBox.response(MainActivity.this, p);
            return null;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (clearHistoryOnLoad && url != null && !url.startsWith("file:")) {
                view.clearHistory();
                clearHistoryOnLoad = false;
            }
        }
    }

    class Chrome extends WebChromeClient {
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            ui.post(() -> {
                List<String> need = new ArrayList<>();
                for (String r : request.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
                        need.add(Manifest.permission.RECORD_AUDIO);
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)
                        need.add(Manifest.permission.CAMERA);
                }
                if (need.isEmpty()) {
                    request.grant(request.getResources());
                } else {
                    if (pendingPerm != null) pendingPerm.deny();
                    pendingPerm = request;
                    requestPermissions(need.toArray(new String[0]), REQ_PERM);
                }
            });
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
            if (fileCb != null) fileCb.onReceiveValue(null);
            fileCb = cb;
            Intent i = params.createIntent();
            i.addCategory(Intent.CATEGORY_OPENABLE);
            if (i.getType() == null || i.getType().isEmpty()) i.setType("*/*");
            if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            try {
                startActivityForResult(i, REQ_FILE);
            } catch (ActivityNotFoundException e) {
                fileCb = null;
                return false;
            }
            return true;
        }
    }

    /* ---------------- JS köprüsü ---------------- */
    class Bridge {
        @JavascriptInterface
        public boolean isForeground() {
            return foreground;
        }

        @JavascriptInterface
        public void notify(String title, String body, String chatId) {
            if (!foreground) Notif.message(MainActivity.this, title, body, chatId);
        }

        @JavascriptInterface
        public void clearNotif(String chatId) {
            Notif.cancelChat(MainActivity.this, chatId);
        }

        @JavascriptInterface
        public void incomingCall(String name, boolean video) {
            Notif.call(MainActivity.this, name, video);
        }

        @JavascriptInterface
        public void stopRing() {
            Notif.stopRing(MainActivity.this);
            ui.post(MainActivity.this::clearLockFlags);
        }

        @JavascriptInterface
        public String notifState() {
            NotificationManager nm = getSystemService(NotificationManager.class);
            return nm != null && nm.areNotificationsEnabled() ? "Açık" : "Kapalı";
        }

        @JavascriptInterface
        public void requestNotif() {
            ui.post(() -> {
                Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                i.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                try {
                    startActivity(i);
                } catch (Exception ignored) {
                }
            });
        }

        @JavascriptInterface
        public void changeServer() {
            if (mesh != null) mesh.lost();
        }

        @JavascriptInterface
        public void reauth() {
            if (mesh != null) mesh.lost();
        }

        @JavascriptInterface
        public String hostInfo() {
            return mesh != null ? mesh.info() : "";
        }

        @JavascriptInterface
        public String takeChat() {
            String c = launchChat;
            launchChat = null;
            return c == null ? "" : c;
        }

        @JavascriptInterface
        public String shareMeta() {
            return ShareBox.meta();
        }

        @JavascriptInterface
        public void clearShare() {
            ShareBox.markTaken();
        }

        @JavascriptInterface
        public void themeColor(String hex) {
            ui.post(() -> {
                try {
                    int c = Color.parseColor(hex);
                    getWindow().setStatusBarColor(c);
                    boolean dark = "#121822".equalsIgnoreCase(hex);
                    getWindow().setNavigationBarColor(dark ? c : Color.WHITE);
                    View d = getWindow().getDecorView();
                    int f = d.getSystemUiVisibility();
                    if (!dark) f |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    else f &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    d.setSystemUiVisibility(f);
                } catch (Exception ignored) {
                }
            });
        }

        /* kurulum sayfası */
        @JavascriptInterface
        public boolean needName() {
            return prefs.getString("name", null) == null;
        }

        @JavascriptInterface
        public void setName(String name) {
            String n = name == null ? "" : name.trim();
            if (n.isEmpty()) return;
            prefs.edit().putString("name", n.length() > 40 ? n.substring(0, 40) : n).apply();
            if (mesh != null) mesh.start();
        }

        @JavascriptInterface
        public String status() {
            return mesh != null ? mesh.status : "";
        }

        @JavascriptInterface
        public void retry() {
            if (mesh != null) { if (mesh.running) mesh.lost(); else mesh.start(); }
        }
    }
}
