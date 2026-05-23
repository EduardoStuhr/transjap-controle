package br.com.transjap.manager;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    getWindow().setStatusBarColor(Color.parseColor("#05070c"));
    getWindow().setNavigationBarColor(Color.parseColor("#05070c"));
    getWindow().getDecorView().setSystemUiVisibility(0);

    WebView webView = getBridge().getWebView();
    if (webView == null) return;

    WebSettings settings = webView.getSettings();
    settings.setDomStorageEnabled(true);
    settings.setDatabaseEnabled(true);
    settings.setCacheMode(WebSettings.LOAD_DEFAULT);
    settings.setLoadsImagesAutomatically(true);
    settings.setMediaPlaybackRequiresUserGesture(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    settings.setTextZoom(100);

    CookieManager cookieManager = CookieManager.getInstance();
    cookieManager.setAcceptCookie(true);
    cookieManager.setAcceptThirdPartyCookies(webView, true);
    WebView.setWebContentsDebuggingEnabled(false);
  }
}
