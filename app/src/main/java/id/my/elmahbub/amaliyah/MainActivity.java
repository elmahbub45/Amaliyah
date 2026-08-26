package id.my.elmahbub.amaliyah;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;


public class MainActivity extends Activity {
    private static final int NOTIFICATION_PERMISSION_REQUEST = 7001;
    private static final int LOCATION_PERMISSION_REQUEST = 7002;
    private static final String APP_URL = "https://elmahbub45.github.io/Amaliyah/";
    private static final String PREFS_NAME = "amaliyah_native";
    private static final String PREF_NOTIFICATION_ENABLED = "notification_enabled";
    private WebView webView;
    private GeolocationPermissions.Callback pendingGeolocationCallback;
    private String pendingGeolocationOrigin;
    private MediaPlayer prayerPreviewPlayer;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        NotificationHelper.createChannels(this);
        PrayerAlarmScheduler.rescheduleFromStored(this);
        PrayerAlarmScheduler.scheduleDailyRefresh(this);

        webView = new WebView(this);
        setContentView(webView);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " AmaliyahAndroid/1.4");
        webView.addJavascriptInterface(new NativeBridge(), "AmaliyahAndroid");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(
                    String origin, GeolocationPermissions.Callback callback) {
                if (hasLocationPermission()) {
                    callback.invoke(origin, true, false);
                    return;
                }
                pendingGeolocationOrigin = origin;
                pendingGeolocationCallback = callback;
                requestPermissions(new String[]{
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                }, LOCATION_PERMISSION_REQUEST);
            }
        });
        webView.setWebViewClient(new WebViewClient() {

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost() == null ? "" : uri.getHost();
                if ("elmahbub45.github.io".equalsIgnoreCase(host)) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException ignored) {}
                return true;
            }
        });
        webView.loadUrl(APP_URL);
    }


    @Override
    protected void onResume() {
        super.onResume();
        PrayerAlarmScheduler.rescheduleFromStored(this);
        if (webView != null) {
            webView.post(() -> webView.evaluateJavascript(
                    "window.dispatchEvent(new Event('amaliyah-prayer-timing-access-changed'))", null));
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }


    private void playPrayerPreview(String soundMode, String prayer) {
        stopPrayerPreview();
        int resId;
        if ("short".equals(soundMode)) {
            resId = R.raw.adzan_pendek;
        } else if ("adhan".equals(soundMode)) {
            resId = "Subuh".equalsIgnoreCase(prayer) ? R.raw.adzan_subuh : R.raw.adzan_normal;
        } else {
            NotificationHelper.showPrayer(this, prayer, "--:--", 0, "notification",
                    (int) (System.currentTimeMillis() & 0x7fffffff), true);
            return;
        }
        prayerPreviewPlayer = MediaPlayer.create(this, resId);
        if (prayerPreviewPlayer == null) return;
        prayerPreviewPlayer.setOnCompletionListener(mp -> stopPrayerPreview());
        prayerPreviewPlayer.start();
    }

    private void stopPrayerPreview() {
        if (prayerPreviewPlayer == null) return;
        try { prayerPreviewPlayer.stop(); } catch (Exception ignored) {}
        try { prayerPreviewPlayer.release(); } catch (Exception ignored) {}
        prayerPreviewPlayer = null;
    }

    @Override
    protected void onDestroy() {
        stopPrayerPreview();
        super.onDestroy();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == NOTIFICATION_PERMISSION_REQUEST && webView != null) {
            webView.post(() -> webView.evaluateJavascript(
                    "window.dispatchEvent(new Event('amaliyah-notification-permission-changed'))", null));
        }
        if (requestCode == LOCATION_PERMISSION_REQUEST && pendingGeolocationCallback != null) {
            pendingGeolocationCallback.invoke(
                    pendingGeolocationOrigin, hasLocationPermission(), false);
            pendingGeolocationCallback = null;
            pendingGeolocationOrigin = null;
        }
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    public final class NativeBridge {
        private SharedPreferences notificationPreferences() {
            return getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        }

        @JavascriptInterface
        public String getNotificationPermission() {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return "granted";
            return checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
                    ? "granted" : "default";
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                        && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
                } else if (webView != null) {
                    webView.evaluateJavascript(
                            "window.dispatchEvent(new Event('amaliyah-notification-permission-changed'))", null);
                }
            });
        }

        @JavascriptInterface
        public String getNotificationEnabledState() {
            SharedPreferences preferences = notificationPreferences();
            if (!preferences.contains(PREF_NOTIFICATION_ENABLED)) return "unset";
            return preferences.getBoolean(PREF_NOTIFICATION_ENABLED, false) ? "true" : "false";
        }

        @JavascriptInterface
        public void setNotificationEnabled(boolean enabled) {
            notificationPreferences().edit().putBoolean(PREF_NOTIFICATION_ENABLED, enabled).apply();
        }

        @JavascriptInterface
        public String getFcmStatus() {
            return FcmRegistration.getStatus(MainActivity.this);
        }

        @JavascriptInterface
        public void retryFcmRegistration() {
            FcmRegistration.refresh(MainActivity.this);
        }

        @JavascriptInterface
        public void openNotificationSettings() {
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
            startActivity(intent);
        }

        @JavascriptInterface
        public String getPrayerTimingAccess() {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return "granted";
            AlarmManager alarmManager = (AlarmManager) getSystemService(ALARM_SERVICE);
            return alarmManager != null && alarmManager.canScheduleExactAlarms() ? "granted" : "needed";
        }

        @JavascriptInterface
        public void requestPrayerTimingAccess() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return;
                AlarmManager alarmManager = (AlarmManager) getSystemService(ALARM_SERVICE);
                if (alarmManager != null && alarmManager.canScheduleExactAlarms()) return;
                try {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                            Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                } catch (ActivityNotFoundException ignored) {
                    try {
                        startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                Uri.parse("package:" + getPackageName())));
                    } catch (ActivityNotFoundException ignoredAgain) {}
                }
            });
        }

        @JavascriptInterface
        public void showNotification(String title, String body) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                    && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
            NotificationHelper.show(MainActivity.this, NotificationHelper.PRAYER_CHANNEL,
                    title, body, (int) (System.currentTimeMillis() & 0x7fffffff));
        }

        @JavascriptInterface
        public void syncPrayerSchedule(String payloadJson) {
            PrayerAlarmScheduler.syncFromWeb(MainActivity.this, payloadJson);
        }

        @JavascriptInterface
        public void cancelPrayerAlarms() {
            PrayerAlarmScheduler.cancelPrayerAlarms(MainActivity.this);
        }

        @JavascriptInterface
        public void testPrayerNotification(String soundMode, String prayer) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                    && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
            NotificationHelper.showPrayer(MainActivity.this, prayer, "--:--", 0, soundMode,
                    (int) (System.currentTimeMillis() & 0x7fffffff), true);
        }

        @JavascriptInterface
        public void previewPrayerSound(String soundMode, String prayer) {
            runOnUiThread(() -> playPrayerPreview(soundMode, prayer));
        }

        @JavascriptInterface
        public void stopPrayerSoundPreview() {
            runOnUiThread(MainActivity.this::stopPrayerPreview);
        }
    }
}
