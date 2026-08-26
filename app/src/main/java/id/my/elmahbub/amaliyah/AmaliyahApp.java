package id.my.elmahbub.amaliyah;

import android.app.Application;

public class AmaliyahApp extends Application {
    public static final String BROADCAST_TOPIC = "amaliyah_semua";

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationHelper.createChannels(this);
        FcmRegistration.refresh(this);
        PrayerAlarmScheduler.rescheduleFromStored(this);
        PrayerAlarmScheduler.scheduleDailyRefresh(this);
    }
}
