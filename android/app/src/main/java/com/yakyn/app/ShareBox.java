package com.yakyn.app;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.webkit.WebResourceResponse;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** "Paylaş → Yerel" ile gelen dosyaları sayfaya /__nshare/N adresinden sunar. */
final class ShareBox {
    static final class Item {
        Uri uri; String name; String type;
    }

    private static final List<Item> items = new ArrayList<>();
    private static String text = null;
    private static boolean taken = true;

    static synchronized void take(Context c, Intent i) {
        items.clear();
        text = null;
        ContentResolver cr = c.getContentResolver();
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND_MULTIPLE.equals(i.getAction())) {
            ArrayList<Uri> l = i.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (l != null) uris.addAll(l);
        } else {
            Uri u = i.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) uris.add(u);
        }
        for (Uri u : uris) {
            Item it = new Item();
            it.uri = u;
            it.type = cr.getType(u);
            if (it.type == null) it.type = i.getType() != null && !i.getType().contains("*") ? i.getType() : "application/octet-stream";
            it.name = displayName(cr, u);
            items.add(it);
        }
        CharSequence t = i.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (t != null && t.length() > 0) text = t.toString();
        String subj = i.getStringExtra(Intent.EXTRA_SUBJECT);
        if (text == null && subj != null) text = subj;
        taken = items.isEmpty() && text == null;
    }

    private static String displayName(ContentResolver cr, Uri u) {
        String name = null;
        try (Cursor cur = cr.query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cur != null && cur.moveToFirst()) name = cur.getString(0);
        } catch (Exception ignored) {
        }
        if (name == null) name = u.getLastPathSegment();
        if (name == null || name.isEmpty()) name = "dosya";
        return name;
    }

    static synchronized String meta() {
        if (taken) return "";
        try {
            JSONObject o = new JSONObject();
            JSONArray files = new JSONArray();
            for (int i = 0; i < items.size(); i++) {
                JSONObject f = new JSONObject();
                f.put("key", "/__nshare/" + i);
                f.put("name", items.get(i).name);
                f.put("type", items.get(i).type);
                files.put(f);
            }
            o.put("files", files);
            o.put("text", text == null ? "" : text);
            return o.toString();
        } catch (Exception e) {
            return "";
        }
    }

    static synchronized void markTaken() {
        taken = true;
        text = null;
    }

    static WebResourceResponse response(Context c, String path) {
        Item it;
        synchronized (ShareBox.class) {
            int idx;
            try {
                idx = Integer.parseInt(path.substring("/__nshare/".length()));
            } catch (Exception e) {
                return null;
            }
            if (idx < 0 || idx >= items.size()) return null;
            it = items.get(idx);
        }
        try {
            InputStream in = c.getContentResolver().openInputStream(it.uri);
            Map<String, String> hdr = new HashMap<>();
            hdr.put("Cache-Control", "no-store");
            hdr.put("Access-Control-Allow-Origin", "*");
            return new WebResourceResponse(it.type, null, 200, "OK", hdr, in);
        } catch (Exception e) {
            return null;
        }
    }
}
