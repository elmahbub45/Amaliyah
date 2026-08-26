package id.my.elmahbub.amaliyah;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class PrayerAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!PrayerAlarmScheduler.isEnabled(context)) return;
        String prayer = intent.getStringExtra("prayer");
        String time = intent.getStringExtra("prayerTime");
        String sound = intent.getStringExtra("soundMode");
        int lead = intent.getIntExtra("lead", 0);
        NotificationHelper.showPrayer(context,
                prayer == null ? "Sholat" : prayer,
                time == null ? "" : time,
                lead,
                sound == null ? "notification" : sound,
                (int) (System.currentTimeMillis() & 0x7fffffff), false);
    }
}
