package id.my.elmahbub.amaliyah;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.graphics.Bitmap;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

public final class NotificationHelper {
    public static final String PRAYER_CHANNEL = "amaliyah_prayer_v2_default";
    public static final String PRAYER_SHORT_CHANNEL = "amaliyah_prayer_v2_short";
    public static final String ADHAN_CHANNEL = "amaliyah_prayer_v2_adhan";
    public static final String ADHAN_FAJR_CHANNEL = "amaliyah_prayer_v2_adhan_fajr";
    public static final String PRAYER_RETAINED_CHANNEL = "amaliyah_prayer_v3_retained";
    public static final String REMOTE_CHANNEL = "amaliyah_remote";

    private NotificationHelper() {}

    private static Uri rawUri(Context context, int resId) {
        String type = context.getResources().getResourceTypeName(resId);
        String name = context.getResources().getResourceEntryName(resId);
        return Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" +
                context.getPackageName() + "/" + type + "/" + name);
    }

    public static void createChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();

        NotificationChannel prayer = new NotificationChannel(
                PRAYER_CHANNEL,
                "Pengingat Waktu Sholat",
                NotificationManager.IMPORTANCE_HIGH
        );
        prayer.setDescription("Pengingat waktu sholat dari Amaliyah");
        prayer.setSound(Settings.System.DEFAULT_NOTIFICATION_URI, attrs);

        NotificationChannel shortChannel = new NotificationChannel(
                PRAYER_SHORT_CHANNEL,
                "Pengingat Singkat Sholat",
                NotificationManager.IMPORTANCE_HIGH
        );
        shortChannel.setDescription("Pengingat singkat waktu sholat dari Amaliyah");
        shortChannel.setSound(rawUri(context, R.raw.adzan_pendek), attrs);

        NotificationChannel adhan = new NotificationChannel(
                ADHAN_CHANNEL,
                "Adzan Amaliyah",
                NotificationManager.IMPORTANCE_HIGH
        );
        adhan.setDescription("Adzan lengkap ketika masuk waktu sholat");
        adhan.setSound(rawUri(context, R.raw.adzan_normal), attrs);

        NotificationChannel fajr = new NotificationChannel(
                ADHAN_FAJR_CHANNEL,
                "Adzan Subuh Amaliyah",
                NotificationManager.IMPORTANCE_HIGH
        );
        fajr.setDescription("Adzan khusus ketika masuk waktu Subuh");
        fajr.setSound(rawUri(context, R.raw.adzan_subuh), attrs);

        NotificationChannel retained = new NotificationChannel(
                PRAYER_RETAINED_CHANNEL,
                "Riwayat Waktu Sholat",
                NotificationManager.IMPORTANCE_DEFAULT
        );
        retained.setDescription(
                "Notifikasi waktu sholat yang tetap tersedia setelah suara selesai"
        );
        retained.setSound(null, null);
        retained.enableVibration(false);

        NotificationChannel remote = new NotificationChannel(
                REMOTE_CHANNEL,
                "Pengumuman Amaliyah",
                NotificationManager.IMPORTANCE_DEFAULT
        );
        remote.setDescription("Pengumuman dan informasi dari pengelola Amaliyah");

        manager.createNotificationChannel(prayer);
        manager.createNotificationChannel(shortChannel);
        manager.createNotificationChannel(adhan);
        manager.createNotificationChannel(fajr);
        manager.createNotificationChannel(retained);
        manager.createNotificationChannel(remote);
    }

    public static void showPrayer(
            Context context,
            String prayer,
            String prayerTime,
            int leadMinutes,
            String soundMode,
            int id,
            boolean isTest
    ) {
        createChannels(context);

        String channel = PRAYER_CHANNEL;

        if ("short".equals(soundMode)) {
            channel = PRAYER_SHORT_CHANNEL;
        }

        if ("adhan".equals(soundMode)) {
            channel = "Subuh".equalsIgnoreCase(prayer)
                    ? ADHAN_FAJR_CHANNEL
                    : ADHAN_CHANNEL;
            leadMinutes = 0;
        }

        String title = isTest
                ? "Tes Suara Sholat"
                : "Waktu " + prayer;

        String body;

        if (isTest) {
            body = "Contoh suara " +
                    ("adhan".equals(soundMode)
                            ? "adzan lengkap"
                            : "short".equals(soundMode)
                            ? "pengingat singkat"
                            : "notifikasi") +
                    ".";

        } else if (leadMinutes > 0) {
            body = leadMinutes +
                    " menit lagi masuk waktu " +
                    prayer +
                    " (" + prayerTime + ").";

        } else {
            body = "Telah masuk waktu " +
                    prayer +
                    " (" + prayerTime + ").";
        }

        int soundRes =
                "notification".equals(soundMode)
                        ? 0
                        : "short".equals(soundMode)
                        ? R.raw.adzan_pendek
                        : ("Subuh".equalsIgnoreCase(prayer)
                        ? R.raw.adzan_subuh
                        : R.raw.adzan_normal);

        showInternal(
                context,
                channel,
                title,
                body,
                id,
                null,
                soundRes,
                false
        );
    }

    public static void showPrayerRetained(
            Context context,
            String prayer,
            String prayerTime,
            int id
    ) {
        createChannels(context);

        String safePrayer =
                prayer == null || prayer.trim().isEmpty()
                        ? "Sholat"
                        : prayer.trim();

        String title = "Waktu " + safePrayer;

        String body =
                prayerTime == null || prayerTime.trim().isEmpty()
                        ? "Telah masuk waktu " + safePrayer + "."
                        : "Telah masuk waktu " +
                        safePrayer +
                        " (" + prayerTime.trim() + ").";

        NotificationManager manager =
                (NotificationManager)
                        context.getSystemService(
                                Context.NOTIFICATION_SERVICE
                        );

        // Hentikan notifikasi bersuara dengan ID yang sama,
        // lalu ganti dengan notifikasi diam yang tetap tinggal.
        if (manager != null) {
            manager.cancel(id);
        }

        showInternal(
                context,
                PRAYER_RETAINED_CHANNEL,
                title,
                body,
                id,
                null,
                0,
                true
        );
    }

    public static long getPrayerSoundDurationMs(
            Context context,
            String soundMode,
            String prayer
    ) {
        int resId;
        long fallback;

        if ("short".equals(soundMode)) {
            resId = R.raw.adzan_pendek;
            fallback = 15_000L;

        } else if ("adhan".equals(soundMode)) {
            resId = "Subuh".equalsIgnoreCase(prayer)
                    ? R.raw.adzan_subuh
                    : R.raw.adzan_normal;
            fallback = 240_000L;

        } else {
            return 0L;
        }

        MediaPlayer player = null;

        try {
            // MediaPlayer hanya dipakai membaca durasi file.
            // Tidak diputar kedua kali.
            player = MediaPlayer.create(context, resId);

            if (
                    player != null
                    && player.getDuration() > 0
            ) {
                return player.getDuration();
            }

        } catch (Exception ignored) {

        } finally {
            if (player != null) {
                try {
                    player.release();
                } catch (Exception ignored) {}
            }
        }

        return fallback;
    }

    public static void show(
            Context context,
            String channelId,
            String title,
            String body,
            int id
    ) {
        show(
                context,
                channelId,
                title,
                body,
                id,
                null
        );
    }

    public static void show(
            Context context,
            String channelId,
            String title,
            String body,
            int id,
            Bitmap bigPicture
    ) {
        showInternal(
                context,
                channelId,
                title,
                body,
                id,
                bigPicture,
                0,
                false
        );
    }

    private static void showInternal(
            Context context,
            String channelId,
            String title,
            String body,
            int id,
            Bitmap bigPicture,
            int soundRes,
            boolean silent
    ) {
        Intent openApp = new Intent(
                context,
                MainActivity.class
        ).addFlags(
                Intent.FLAG_ACTIVITY_CLEAR_TOP
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP
        );

        PendingIntent contentIntent =
                PendingIntent.getActivity(
                        context,
                        id,
                        openApp,
                        PendingIntent.FLAG_UPDATE_CURRENT
                                | PendingIntent.FLAG_IMMUTABLE
                );

        android.app.Notification.Builder builder =
                Build.VERSION.SDK_INT
                        >= Build.VERSION_CODES.O
                        ? new android.app.Notification.Builder(
                                context,
                                channelId
                        )
                        : new android.app.Notification.Builder(
                                context
                        );

        builder
                .setSmallIcon(
                        R.drawable.ic_stat_amaliyah
                )
                .setLargeIcon(
                        BitmapFactory.decodeResource(
                                context.getResources(),
                                R.drawable.icon_192
                        )
                )
                .setContentTitle(
                        title == null || title.isEmpty()
                                ? "Amaliyah"
                                : title
                )
                .setContentText(
                        body == null ? "" : body
                )
                .setContentIntent(
                        contentIntent
                )
                .setAutoCancel(true)
                .setOnlyAlertOnce(silent)
                .setCategory(
                        android.app.Notification.CATEGORY_REMINDER
                );

        if (bigPicture != null) {
            builder.setStyle(
                    new android.app.Notification.BigPictureStyle()
                            .bigPicture(bigPicture)
                            .setSummaryText(
                                    body == null ? "" : body
                            )
            );

        } else {
            builder.setStyle(
                    new android.app.Notification.BigTextStyle()
                            .bigText(
                                    body == null ? "" : body
                            )
            );
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setPriority(
                    android.app.Notification.PRIORITY_HIGH
            );

            if (silent) {
                builder.setSound(null);
                builder.setVibrate(null);

            } else if (soundRes != 0) {
                builder.setSound(
                        rawUri(
                                context,
                                soundRes
                        )
                );

            } else {
                builder.setSound(
                        Settings.System.DEFAULT_NOTIFICATION_URI
                );
            }
        }

        NotificationManager manager =
                (NotificationManager)
                        context.getSystemService(
                                Context.NOTIFICATION_SERVICE
                        );

        if (manager != null) {
            manager.notify(
                    id,
                    builder.build()
            );
        }
    }
}
