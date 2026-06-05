package br.com.transjap.manager;

import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    getWindow().setStatusBarColor(Color.parseColor("#05070c"));
    getWindow().setNavigationBarColor(Color.parseColor("#05070c"));
    getWindow().getDecorView().setSystemUiVisibility(0);
    WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
      getWindow(),
      getWindow().getDecorView()
    );
    controller.setAppearanceLightStatusBars(false);
    controller.setAppearanceLightNavigationBars(false);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      getWindow().setStatusBarContrastEnforced(false);
      getWindow().setNavigationBarContrastEnforced(false);
    }
    WebView webView = getBridge().getWebView();
    if (webView == null) return;
    applySystemBarInsets(webView);

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
    boolean appDebuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    WebView.setWebContentsDebuggingEnabled(appDebuggable);
  }

  private void applySystemBarInsets(WebView webView) {
    View contentView = getWindow().findViewById(android.R.id.content);
    if (contentView == null) return;

    ViewCompat.setOnApplyWindowInsetsListener(contentView, (view, windowInsets) -> {
      Insets systemBars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
      updateWebInsets(webView, systemBars);
      return windowInsets;
    });
    ViewCompat.requestApplyInsets(contentView);
  }

  private void updateWebInsets(WebView webView, Insets systemBars) {
    String script = String.format(
      "document.documentElement.style.setProperty('--android-safe-area-top','%dpx');" +
      "document.documentElement.style.setProperty('--android-safe-area-bottom','%dpx');" +
      "document.documentElement.style.setProperty('--android-safe-area-left','%dpx');" +
      "document.documentElement.style.setProperty('--android-safe-area-right','%dpx');",
      systemBars.top,
      systemBars.bottom,
      systemBars.left,
      systemBars.right
    );
    webView.post(() -> webView.evaluateJavascript(script, null));
    webView.postDelayed(() -> webView.evaluateJavascript(script, null), 250);
    webView.postDelayed(() -> webView.evaluateJavascript(script, null), 1000);
    webView.postDelayed(() -> webView.evaluateJavascript(script, null), 2500);
  }
}
