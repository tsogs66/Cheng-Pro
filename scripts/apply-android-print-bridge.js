'use strict';

/**
 * Patch Capacitor-generated MainActivity with PrintManager bridge.
 * android/ is gitignored and recreated in CI — same pattern as icons.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mainPath = path.join(
  root,
  'android/app/src/main/java/marine/chengpro/app/MainActivity.java'
);

const SOURCE = `package marine.chengpro.app;

import android.content.Context;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

/**
 * Android WebView does not implement window.print(). Expose PrintManager so
 * ChEng AIO (and embedded Voyage/Tank via the shell print bridge) can open the
 * system printer picker, including Save as PDF.
 */
public class MainActivity extends BridgeActivity {
  private WebView printWebView;
  private boolean printBridgeInstalled = false;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    installPrintBridgeSoon();
  }

  @Override
  public void onStart() {
    super.onStart();
    installPrintBridgeSoon();
  }

  private void installPrintBridgeSoon() {
    new Handler(Looper.getMainLooper()).post(this::installPrintBridge);
    new Handler(Looper.getMainLooper()).postDelayed(this::installPrintBridge, 400);
  }

  private void installPrintBridge() {
    try {
      Bridge bridge = getBridge();
      if (bridge == null) return;
      WebView webView = bridge.getWebView();
      if (webView == null) return;
      if (!printBridgeInstalled) {
        webView.addJavascriptInterface(new PrintBridge(), "ChengAndroidPrint");
        printBridgeInstalled = true;
      }
      webView.post(() -> webView.evaluateJavascript(
          "window.__CHENG_ANDROID_PRINT__=true;"
              + "try{window.dispatchEvent(new CustomEvent('cheng-android-print-ready'));}catch(e){}",
          null
      ));
    } catch (Exception ignored) {
      /* Bridge may not be ready yet; delayed retry covers that. */
    }
  }

  private class PrintBridge {
    @JavascriptInterface
    public void printHtml(final String html, final String jobName) {
      runOnUiThread(() -> {
        final String name = (jobName == null || jobName.trim().isEmpty()) ? "ChEng AIO" : jobName.trim();
        if (printWebView != null) {
          try {
            printWebView.destroy();
          } catch (Exception ignored) {
          }
          printWebView = null;
        }
        printWebView = new WebView(MainActivity.this);
        WebSettings settings = printWebView.getSettings();
        settings.setJavaScriptEnabled(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        printWebView.setWebViewClient(new WebViewClient() {
          @Override
          public void onPageFinished(WebView view, String url) {
            try {
              PrintManager printManager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
              if (printManager == null) return;
              PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(name);
              PrintAttributes attrs = new PrintAttributes.Builder()
                  .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                  .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                  .build();
              printManager.print(name, adapter, attrs);
            } catch (Exception ignored) {
            }
          }
        });
        printWebView.loadDataWithBaseURL(
            "https://localhost/",
            html != null ? html : "<html><body></body></html>",
            "text/html",
            "UTF-8",
            null
        );
      });
    }
  }
}
`;

if (!fs.existsSync(path.dirname(mainPath))) {
  console.warn('apply-android-print-bridge: MainActivity path missing — skip (run cap add/sync first)');
  process.exit(0);
}

fs.writeFileSync(mainPath, SOURCE);
console.log('apply-android-print-bridge: wrote PrintManager MainActivity');
