package id.my.elmahbub.amaliyah;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class DailyPrayerRefreshReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        final PendingResult pending = goAsync();
        final Context app = context.getApplicationContext();
        if (!PrayerAlarmScheduler.isEnabled(app)) {
            PrayerAlarmScheduler.cancelDailyRefresh(app);
            pending.finish();
            return;
        }
        new Thread(() -> {
            try {
                boolean ok = PrayerAlarmScheduler.refreshTodayFromNetwork(app);
                if (ok) PrayerAlarmScheduler.scheduleDailyRefresh(app);
                else PrayerAlarmScheduler.scheduleRefreshSoon(app, 30L * 60L * 1000L);
            } finally {
                pending.finish();
            }
        }, "AmaliyahPrayerRefresh").start();
    }
}
