package com.scheke.studyloop;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;

public class MainActivity extends Activity {
    private WebView web;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.setWebViewClient(new WebViewClient() {
            private boolean isTrusted(Uri uri) {
                return "https".equalsIgnoreCase(uri.getScheme()) && "study-loop-one.vercel.app".equalsIgnoreCase(uri.getHost());
            }
            private boolean handle(Uri uri) {
                if (isTrusted(uri)) return false;
                if ("https".equalsIgnoreCase(uri.getScheme())) startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return handle(request.getUrl()); }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) { return handle(Uri.parse(url)); }
        });
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) settings.setSafeBrowsingEnabled(true);
        web.loadUrl("https://study-loop-one.vercel.app/");
        setContentView(web);
    }
    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
}
