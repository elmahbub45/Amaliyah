package id.my.elmahbub.amaliyah;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

public final class PrayerAlarmScheduler {
    public static final int SCHEDULER_VERSION = 2;

    private static final String PREFS = "amaliyah_prayer_native";
    private static final String PAYLOAD = "payload";
    private static final int REFRESH_REQUEST = 3900;
    private static final String API = "https://amaliyah-notify.elmahbub45.workers.dev/prayer/daily";
    private static final String[] PRAYERS = {"Subuh", "Dzuhur", "Ashar", "Maghrib", "Isya"};

    private PrayerAlarmScheduler() {}

    public static void syncFromWeb(Context context, String payloadJson) {
        try {
            JSONObject payload = new JSONObject(payloadJson);
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit().putString(PAYLOAD, payload.toString()).apply();
            scheduleFromPayload(context, payload);
            if (payload.optBoolean("enabled", false)) scheduleDailyRefresh(context);
            else cancelDailyRefresh(context);
        } catch (Exception ignored) {}
    }

    public static boolean isEnabled(Context context) {
        try {
            JSONObject payload = storedPayload(context);
            return payload != null && payload.optBoolean("enabled", false);
        } catch (Exception e) {
            return false;
        }
    }

    private static JSONObject storedPayload(Context context) {
        String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(PAYLOAD, null);
        if (raw == null || raw.trim().isEmpty()) return null;
        try {
            return new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    public static void rescheduleFromStored(Context context) {
        JSONObject payload = storedPayload(context);
        if (payload == null) return;
        scheduleFromPayload(context, payload);
    }

    public static void cancelPrayerAlarms(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        for (int i = 0; i < PRAYERS.length; i++) {
            PendingIntent pi = prayerPendingIntent(context, i, null);
            am.cancel(pi);
            pi.cancel();
        }
    }

    private static void scheduleFromPayload(Context context, JSONObject payload) {
        cancelPrayerAlarms(context);
        if (!payload.optBoolean("enabled", false)) return;

        JSONObject schedule = payload.optJSONObject("schedule");
        JSONObject enabledPrayers = payload.optJSONObject("prayers");
        if (schedule == null || enabledPrayers == null) return;

        String timezone = payload.optString("timezone", "Asia/Makassar");
        String date = payload.optString("date", today(timezone));
        String legacySound = normalizeSound(payload.optString("soundMode", "notification"));
        int globalLead = clampLead(payload.optInt("leadMinutes", 0));

        JSONObject prayerModes = payload.optJSONObject("prayerModes");
        JSONObject offsets = payload.optJSONObject("offsetMinutes");

        for (int i = 0; i < PRAYERS.length; i++) {
            String prayer = PRAYERS[i];
            if (!enabledPrayers.optBoolean(prayer, true)) continue;

            String rawTime = clean(schedule.optString(prayer, ""));
            if (!rawTime.matches("\\d{2}:\\d{2}")) continue;

            String sound = prayerModes == null
                    ? legacySound
                    : normalizeSound(prayerModes.optString(prayer, legacySound));

            int offset = offsets == null
                    ? 0
                    : clampOffset(offsets.optInt(prayer, 0));

            String adjustedTime = shiftTime(rawTime, offset);

            // Adzan lengkap harus berbunyi tepat pada waktu yang sudah dikoreksi.
            // Notifikasi/pendek tetap mengikuti pilihan "waktu pengingat" global.
            int lead = "adhan".equals(sound) ? 0 : globalLead;

            long trigger = parseLocal(date, adjustedTime, timezone) - lead * 60_000L;
            if (trigger <= System.currentTimeMillis() + 5_000L) continue;

            Intent data = new Intent(context, PrayerAlarmReceiver.class)
                    .putExtra("prayer", prayer)
                    .putExtra("prayerTime", adjustedTime)
                    .putExtra("lead", lead)
                    .putExtra("soundMode", sound)
                    .putExtra("offsetMinutes", offset)
                    .putExtra("basePrayerTime", rawTime);

            PendingIntent pi = prayerPendingIntent(context, i, data);
            scheduleAlarm(context, trigger, pi);
        }
    }

    private static PendingIntent prayerPendingIntent(Context context, int index, Intent data) {
        Intent intent = data != null ? data : new Intent(context, PrayerAlarmReceiver.class);
        intent.setAction("id.my.elmahbub.amaliyah.PRAYER_" + index);

        return PendingIntent.getBroadcast(
                context,
                3000 + index,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static void scheduleAlarm(Context context, long triggerAtMillis, PendingIntent pi) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
        } else {
            am.setExact(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
        }
    }

    public static void cancelDailyRefresh(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

        Intent intent = new Intent(context, DailyPrayerRefreshReceiver.class)
                .setAction("id.my.elmahbub.amaliyah.PRAYER_REFRESH");

        PendingIntent pi = PendingIntent.getBroadcast(
                context,
                REFRESH_REQUEST,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        if (am != null) am.cancel(pi);
        pi.cancel();
    }

    public static void scheduleDailyRefresh(Context context) {
        JSONObject payload = storedPayload(context);
        if (payload == null || !payload.optBoolean("enabled", false)) return;

        String timezone = payload.optString("timezone", "Asia/Makassar");

        Calendar cal = Calendar.getInstance(TimeZone.getTimeZone(timezone));
        cal.add(Calendar.DAY_OF_MONTH, 1);
        cal.set(Calendar.HOUR_OF_DAY, 0);
        cal.set(Calendar.MINUTE, 8);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);

        Intent intent = new Intent(context, DailyPrayerRefreshReceiver.class)
                .setAction("id.my.elmahbub.amaliyah.PRAYER_REFRESH");

        PendingIntent pi = PendingIntent.getBroadcast(
                context,
                REFRESH_REQUEST,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        scheduleAlarm(context, cal.getTimeInMillis(), pi);
    }

    public static void scheduleRefreshSoon(Context context, long delayMillis) {
        Intent intent = new Intent(context, DailyPrayerRefreshReceiver.class)
                .setAction("id.my.elmahbub.amaliyah.PRAYER_REFRESH");

        PendingIntent pi = PendingIntent.getBroadcast(
                context,
                REFRESH_REQUEST,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        scheduleAlarm(
                context,
                System.currentTimeMillis() + Math.max(30_000L, delayMillis),
                pi
        );
    }

    public static boolean refreshTodayFromNetwork(Context context) {
        JSONObject payload = storedPayload(context);
        if (payload == null || !payload.optBoolean("enabled", false)) return false;

        JSONObject loc = payload.optJSONObject("location");
        if (loc == null) return false;

        double latitude = loc.optDouble("latitude", Double.NaN);
        double longitude = loc.optDouble("longitude", Double.NaN);

        if (Double.isNaN(latitude) || Double.isNaN(longitude)
                || latitude < -90 || latitude > 90
                || longitude < -180 || longitude > 180) {
            return false;
        }

        try {
            String tz = payload.optString("timezone", "Asia/Makassar");
            String date = today(tz);

            StringBuilder query = new StringBuilder();
            add(query, "latitude", String.valueOf(latitude));
            add(query, "longitude", String.valueOf(longitude));
            add(query, "date", date);
            add(query, "tz", tz);
            add(query, "region", loc.optString("regionName", ""));
            add(query, "regionId", loc.optString("regionId", ""));
            add(query, "city", loc.optString("city", ""));
            add(query, "province", loc.optString("province", ""));

            JSONArray candidates = loc.optJSONArray("regionCandidates");
            if (candidates != null && candidates.length() > 0) {
                add(query, "regionCandidates", candidates.toString());
            }

            HttpURLConnection connection = (HttpURLConnection)
                    new URL(API + "?" + query).openConnection();

            connection.setConnectTimeout(7000);
            connection.setReadTimeout(7000);
            connection.setRequestMethod("GET");

            int responseCode = connection.getResponseCode();
            if (responseCode < 200 || responseCode >= 300) {
                connection.disconnect();
                return false;
            }

            StringBuilder body = new StringBuilder();
            try (BufferedReader br = new BufferedReader(
                    new InputStreamReader(connection.getInputStream()))) {
                String line;
                while ((line = br.readLine()) != null) {
                    body.append(line);
                }
            } finally {
                connection.disconnect();
            }

            JSONObject response = new JSONObject(body.toString());
            JSONObject timings = response.optJSONObject("timings");
            if (timings == null) return false;

            // Selalu simpan waktu mentah dari sumber.
            // Koreksi per-sholat diterapkan saat alarm dijadwalkan,
            // sehingga tidak bertambah berulang setiap pergantian hari.
            JSONObject schedule = new JSONObject();
            schedule.put("Subuh", clean(timings.optString("Fajr")));
            schedule.put("Dzuhur", clean(timings.optString("Dhuhr")));
            schedule.put("Ashar", clean(timings.optString("Asr")));
            schedule.put("Maghrib", clean(timings.optString("Maghrib")));
            schedule.put("Isya", clean(timings.optString("Isha")));

            payload.put("version", Math.max(2, payload.optInt("version", 1)));
            payload.put("date", date);
            payload.put("schedule", schedule);

            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit().putString(PAYLOAD, payload.toString()).apply();

            scheduleFromPayload(context, payload);
            scheduleDailyRefresh(context);
            return true;

        } catch (Exception e) {
            return false;
        }
    }

    private static String normalizeSound(String value) {
        String sound = value == null
                ? "notification"
                : value.trim().toLowerCase(Locale.US);

        if ("full".equals(sound)) sound = "adhan";

        if (!"notification".equals(sound)
                && !"short".equals(sound)
                && !"adhan".equals(sound)) {
            sound = "notification";
        }

        return sound;
    }

    private static int clampOffset(int value) {
        return Math.max(-5, Math.min(5, value));
    }

    private static int clampLead(int value) {
        return Math.max(0, Math.min(60, value));
    }

    private static String shiftTime(String value, int deltaMinutes) {
        String clean = clean(value);
        if (!clean.matches("\\d{2}:\\d{2}")) return clean;

        try {
            String[] parts = clean.split(":");
            int hour = Integer.parseInt(parts[0]);
            int minute = Integer.parseInt(parts[1]);

            int totalMinutes = hour * 60 + minute + deltaMinutes;
            totalMinutes = ((totalMinutes % 1440) + 1440) % 1440;

            return String.format(
                    Locale.US,
                    "%02d:%02d",
                    totalMinutes / 60,
                    totalMinutes % 60
            );

        } catch (Exception e) {
            return clean;
        }
    }

    private static String clean(String value) {
        if (value == null) return "";
        value = value.trim();
        return value.length() >= 5 ? value.substring(0, 5) : value;
    }

    private static void add(StringBuilder query, String key, String value) throws Exception {
        if (value == null || value.isEmpty() || "NaN".equals(value)) return;
        if (query.length() > 0) query.append('&');

        query.append(URLEncoder.encode(key, "UTF-8"))
                .append('=')
                .append(URLEncoder.encode(value, "UTF-8"));
    }

    private static String today(String timezone) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone(timezone));
        return f.format(new Date());
    }

    private static long parseLocal(String date, String time, String timezone) {
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US);
            f.setLenient(false);
            f.setTimeZone(TimeZone.getTimeZone(timezone));

            Date d = f.parse(date + " " + time);
            return d == null ? 0L : d.getTime();

        } catch (Exception e) {
            return 0L;
        }
    }
}
