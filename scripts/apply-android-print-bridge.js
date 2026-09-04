'use strict';

/**
 * Patch the Capacitor-generated MainActivity with the two bridges the WebView
 * cannot provide for itself: PrintManager, and writing a file to Downloads.
 *
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

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.provider.MediaStore;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

/**
 * The Android WebView implements neither window.print() nor a download
 * manager, so both the printer picker and "save this backup where I can find
 * it" have to come from the activity.
 *
 * Without the file bridge a JSON export on the phone is silently lost: the
 * File System Access picker does not exist here, navigator.share refuses
 * files, and a blob anchor click does nothing at all while still looking to
 * the page like it worked. ChengAndroidFiles writes the file to
 * Downloads/ChEngAIO through MediaStore and returns where it went, so the
 * program can tell the user a path that is actually there.
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
        webView.addJavascriptInterface(new FileBridge(), "ChengAndroidFiles");
        printBridgeInstalled = true;
      }
      webView.post(() -> webView.evaluateJavascript(
          "window.__CHENG_ANDROID_PRINT__=true;window.__CHENG_ANDROID_FILES__=true;"
              + "try{window.dispatchEvent(new CustomEvent('cheng-android-print-ready'));}catch(e){}",
          null
      ));
    } catch (Exception ignored) {
      /* Bridge may not be ready yet; delayed retry covers that. */
    }
  }

  /** Writes a text file into the public Downloads folder. */
  private class FileBridge {
    @JavascriptInterface
    public String saveText(final String fileName, final String text, final String mimeType) {
      final String name = safeName(fileName);
      final String mime = (mimeType == null || mimeType.trim().isEmpty())
          ? "application/json" : mimeType.trim();
      final byte[] bytes = (text == null ? "" : text).getBytes(StandardCharsets.UTF_8);
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          ContentResolver resolver = getContentResolver();
          ContentValues values = new ContentValues();
          values.put(MediaStore.Downloads.DISPLAY_NAME, name);
          values.put(MediaStore.Downloads.MIME_TYPE, mime);
          values.put(MediaStore.Downloads.RELATIVE_PATH,
              Environment.DIRECTORY_DOWNLOADS + "/ChEngAIO");
          values.put(MediaStore.Downloads.IS_PENDING, 1);
          Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
          if (uri == null) return "";
          OutputStream out = resolver.openOutputStream(uri);
          if (out == null) return "";
          try {
            out.write(bytes);
            out.flush();
          } finally {
            out.close();
          }
          values.clear();
          values.put(MediaStore.Downloads.IS_PENDING, 0);
          resolver.update(uri, values, null, null);
          return "Downloads/ChEngAIO/" + name;
        }
        File dir = new File(
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
            "ChEngAIO");
        if (!dir.isDirectory() && !dir.mkdirs()) return "";
        File target = new File(dir, name);
        FileOutputStream out = new FileOutputStream(target);
        try {
          out.write(bytes);
          out.flush();
        } finally {
          out.close();
        }
        return target.getAbsolutePath();
      } catch (Exception e) {
        /* Empty string means "I could not write it" — the page then falls
           through to the share sheet rather than claiming a saved backup. */
        return "";
      }
    }

    private String safeName(String raw) {
      String name = raw == null ? "" : raw.trim().replaceAll("[\\\\/:*?<>|]+", "-");
      if (name.isEmpty()) name = "cheng-aio-backup.json";
      return name;
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
console.log('apply-android-print-bridge: wrote MainActivity with print + file bridges');
