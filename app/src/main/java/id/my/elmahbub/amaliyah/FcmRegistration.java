package id.my.elmahbub.amaliyah;

import android.content.Context;
import android.content.SharedPreferences;

import com.google.firebase.messaging.FirebaseMessaging;

public final class FcmRegistration {
    private static final String PREFS_NAME = "amaliyah_fcm";
    private static final String KEY_STATUS = "status";
    private static final String STATUS_CONNECTING = "connecting";
    private static final String STATUS_READY = "ready";
    private static final String STATUS_ERROR = "error";

    private FcmRegistration() {}

    public static void refresh(Context context) {
        Context appContext = context.getApplicationContext();
        setStatus(appContext, STATUS_CONNECTING);
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(tokenTask -> {
            if (!tokenTask.isSuccessful() || tokenTask.getResult() == null
                    || tokenTask.getResult().trim().isEmpty()) {
                setStatus(appContext, STATUS_ERROR);
                return;
            }
            subscribe(appContext);
        });
    }

    public static void onNewToken(Context context, String token) {
        if (token == null || token.trim().isEmpty()) {
            setStatus(context, STATUS_ERROR);
            return;
        }
        subscribe(context.getApplicationContext());
    }

    private static void subscribe(Context context) {
        setStatus(context, STATUS_CONNECTING);
        FirebaseMessaging.getInstance().subscribeToTopic(AmaliyahApp.BROADCAST_TOPIC)
                .addOnCompleteListener(task -> setStatus(context,
                        task.isSuccessful() ? STATUS_READY : STATUS_ERROR));
    }

    public static String getStatus(Context context) {
        return preferences(context).getString(KEY_STATUS, STATUS_CONNECTING);
    }

    private static void setStatus(Context context, String status) {
        preferences(context).edit().putString(KEY_STATUS, status).apply();
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }
}
