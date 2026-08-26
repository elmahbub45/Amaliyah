package id.my.elmahbub.amaliyah;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class AmaliyahMessagingService extends FirebaseMessagingService {
    private static final int MAX_IMAGE_BYTES = 1024 * 1024;
    private static final int MAX_IMAGE_SIDE = 4096;
    private static final long MAX_IMAGE_PIXELS = 12_000_000L;

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        FcmRegistration.onNewToken(this, token);
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        String title = "Amaliyah";
        String body = "Ada informasi baru untuk Anda.";
        if (message.getNotification() != null) {
            if (message.getNotification().getTitle() != null) title = message.getNotification().getTitle();
            if (message.getNotification().getBody() != null) body = message.getNotification().getBody();
        }
        if (message.getData().containsKey("title")) title = message.getData().get("title");
        if (message.getData().containsKey("body")) body = message.getData().get("body");
        String imageUrl = findImageUrl(message);
        Bitmap image = downloadImage(imageUrl);
        NotificationHelper.createChannels(this);
        NotificationHelper.show(this, NotificationHelper.REMOTE_CHANNEL, title, body,
                (int) (System.currentTimeMillis() & 0x7fffffff), image);
    }

    private String findImageUrl(RemoteMessage message) {
        if (message.getNotification() != null) {
            Uri uri = message.getNotification().getImageUrl();
            if (uri != null) return uri.toString();
        }
        String[] keys = {"image", "imageUrl", "image_url"};
        for (String key : keys) {
            String value = message.getData().get(key);
            if (value != null && !value.trim().isEmpty()) return value.trim();
        }
        return null;
    }

    private Bitmap downloadImage(String imageUrl) {
        if (imageUrl == null || imageUrl.length() > 2048) return null;
        HttpURLConnection connection = null;
        try {
            URL url = new URL(imageUrl);
            if (!"https".equalsIgnoreCase(url.getProtocol())) return null;
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(8000);
            connection.setInstanceFollowRedirects(true);
            connection.setRequestProperty("Accept", "image/*");
            connection.connect();
            if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) return null;
            if (!"https".equalsIgnoreCase(connection.getURL().getProtocol())) return null;
            int declaredLength = connection.getContentLength();
            if (declaredLength > MAX_IMAGE_BYTES) return null;

            byte[] bytes;
            try (InputStream input = connection.getInputStream();
                 ByteArrayOutputStream output = new ByteArrayOutputStream(
                         declaredLength > 0 ? declaredLength : 32 * 1024)) {
                byte[] buffer = new byte[8192];
                int total = 0;
                int read;
                while ((read = input.read(buffer)) != -1) {
                    total += read;
                    if (total > MAX_IMAGE_BYTES) return null;
                    output.write(buffer, 0, read);
                }
                bytes = output.toByteArray();
            }

            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0
                    || bounds.outWidth > MAX_IMAGE_SIDE || bounds.outHeight > MAX_IMAGE_SIDE
                    || (long) bounds.outWidth * bounds.outHeight > MAX_IMAGE_PIXELS) return null;
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (Exception ignored) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
