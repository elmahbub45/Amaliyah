package id.my.elmahbub.amaliyah;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.SystemClock;

public class PrayerAlarmReceiver extends BroadcastReceiver {
    private static final String ACTION_RETAIN_PREFIX =
            "id.my.elmahbub.amaliyah.PRAYER_RETAIN_";

    @Override
    public void onReceive(
            Context context,
            Intent intent
    ) {
        if (
                !PrayerAlarmScheduler.isEnabled(
                        context
                )
        ) {
            return;
        }

        if (
                intent.getBooleanExtra(
                        "retentionOnly",
                        false
                )
        ) {
            String prayer =
                    intent.getStringExtra(
                            "prayer"
                    );

            String time =
                    intent.getStringExtra(
                            "prayerTime"
                    );

            int notificationId =
                    intent.getIntExtra(
                            "notificationId",
                            0
                    );

            if (notificationId != 0) {
                NotificationHelper.showPrayerRetained(
                        context,
                        prayer,
                        time,
                        notificationId
                );
            }

            return;
        }

        String prayer =
                intent.getStringExtra(
                        "prayer"
                );

        String time =
                intent.getStringExtra(
                        "prayerTime"
                );

        String sound =
                intent.getStringExtra(
                        "soundMode"
                );

        int lead =
                intent.getIntExtra(
                        "lead",
                        0
                );

        String safePrayer =
                prayer == null
                        ? "Sholat"
                        : prayer;

        String safeTime =
                time == null
                        ? ""
                        : time;

        String safeSound =
                sound == null
                        ? "notification"
                        : sound;

        int notificationId =
                (int) (
                        System.currentTimeMillis()
                        & 0x7fffffff
                );

        NotificationHelper.showPrayer(
                context,
                safePrayer,
                safeTime,
                lead,
                safeSound,
                notificationId,
                false
        );

        if (
                "short".equals(safeSound)
                || "adhan".equals(safeSound)
        ) {
            long duration =
                    NotificationHelper
                            .getPrayerSoundDurationMs(
                                    context,
                                    safeSound,
                                    safePrayer
                            );

            scheduleRetainedNotification(
                    context,
                    safePrayer,
                    safeTime,
                    notificationId,
                    duration + 1_500L
            );
        }
    }

    private static void scheduleRetainedNotification(
            Context context,
            String prayer,
            String prayerTime,
            int notificationId,
            long delayMillis
    ) {
        AlarmManager alarmManager =
                (AlarmManager)
                        context.getSystemService(
                                Context.ALARM_SERVICE
                        );

        if (alarmManager == null) {
            return;
        }

        Intent retainedIntent =
                new Intent(
                        context,
                        PrayerAlarmReceiver.class
                )
                        .setAction(
                                ACTION_RETAIN_PREFIX
                                        + notificationId
                        )
                        .putExtra(
                                "retentionOnly",
                                true
                        )
                        .putExtra(
                                "prayer",
                                prayer
                        )
                        .putExtra(
                                "prayerTime",
                                prayerTime
                        )
                        .putExtra(
                                "notificationId",
                                notificationId
                        );

        PendingIntent pendingIntent =
                PendingIntent.getBroadcast(
                        context,
                        notificationId,
                        retainedIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT
                                | PendingIntent.FLAG_IMMUTABLE
                );

        long triggerAt =
                SystemClock.elapsedRealtime()
                        + Math.max(
                                2_000L,
                                delayMillis
                        );

        if (
                Build.VERSION.SDK_INT
                        >= Build.VERSION_CODES.S
                && !alarmManager
                        .canScheduleExactAlarms()
        ) {
            alarmManager.setAndAllowWhileIdle(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    triggerAt,
                    pendingIntent
            );

        } else if (
                Build.VERSION.SDK_INT
                        >= Build.VERSION_CODES.M
        ) {
            alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    triggerAt,
                    pendingIntent
            );

        } else {
            alarmManager.setExact(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    triggerAt,
                    pendingIntent
            );
        }
    }
}
