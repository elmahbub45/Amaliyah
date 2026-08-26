package id.my.elmahbub.amaliyah;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        PrayerAlarmScheduler.rescheduleFromStored(context);
        if (PrayerAlarmScheduler.isEnabled(context)) {
            PrayerAlarmScheduler.scheduleRefreshSoon(context, 60_000L);
        }
    }
}
