package com.ytmusic.app;

import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.audiofx.BassBoost;
import android.media.audiofx.LoudnessEnhancer;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeAudio")
public class NativeAudioPlugin extends Plugin {
    private static final String TAG = "NativeAudio";
    private MediaPlayer mediaPlayer;
    private LoudnessEnhancer loudnessEnhancer;
    private BassBoost bassBoost;
    private float currentVolume = 1.0f;

    @Override
    public void load() {
        super.load();
        initMediaPlayer();
    }

    private void initMediaPlayer() {
        if (mediaPlayer != null) {
            releaseEffects();
            mediaPlayer.release();
            mediaPlayer = null;
        }

        mediaPlayer = new MediaPlayer();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            mediaPlayer.setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build()
            );
        }

        mediaPlayer.setOnPreparedListener(mp -> {
            attachAudioEffects();
            mp.start();
            notifyListeners("stateChange", new JSObject().put("state", "playing").put("duration", mp.getDuration() / 1000.0));
        });

        mediaPlayer.setOnCompletionListener(mp -> {
            notifyListeners("stateChange", new JSObject().put("state", "ended"));
        });

        mediaPlayer.setOnErrorListener((mp, what, extra) -> {
            Log.e(TAG, "Native MediaPlayer error: " + what + ", " + extra);
            notifyListeners("stateChange", new JSObject().put("state", "error").put("error", "Playback failed"));
            return true;
        });
    }

    private void attachAudioEffects() {
        if (mediaPlayer == null) return;
        int sessionId = mediaPlayer.getAudioSessionId();

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                if (loudnessEnhancer != null) loudnessEnhancer.release();
                loudnessEnhancer = new LoudnessEnhancer(sessionId);
                // Apply 250 mB (2.5 dB) clean hardware psychoacoustic volume enhancement
                loudnessEnhancer.setTargetGain(250);
                loudnessEnhancer.setEnabled(true);
            }

            if (bassBoost != null) bassBoost.release();
            bassBoost = new BassBoost(0, sessionId);
            if (bassBoost.getStrengthSupported()) {
                // Apply mild 200/1000 bass boost for punchy low-end
                bassBoost.setStrength((short) 250);
                bassBoost.setEnabled(true);
            }
            Log.i(TAG, "Attached Hardware LoudnessEnhancer & BassBoost to session: " + sessionId);
        } catch (Exception e) {
            Log.w(TAG, "Could not attach audio effects: " + e.getMessage());
        }
    }

    private void releaseEffects() {
        if (loudnessEnhancer != null) {
            loudnessEnhancer.release();
            loudnessEnhancer = null;
        }
        if (bassBoost != null) {
            bassBoost.release();
            bassBoost = null;
        }
    }

    @PluginMethod
    public void play(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("URL is required");
            return;
        }

        try {
            if (mediaPlayer == null) {
                initMediaPlayer();
            } else {
                mediaPlayer.reset();
            }

            mediaPlayer.setDataSource(url);
            mediaPlayer.setVolume(currentVolume, currentVolume);
            mediaPlayer.prepareAsync();
            notifyListeners("stateChange", new JSObject().put("state", "loading"));
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Play error: " + e.getMessage(), e);
            call.reject("Failed to play: " + e.getMessage());
        }
    }

    @PluginMethod
    public void pause(PluginCall call) {
        if (mediaPlayer != null && mediaPlayer.isPlaying()) {
            mediaPlayer.pause();
            notifyListeners("stateChange", new JSObject().put("state", "paused"));
        }
        call.resolve();
    }

    @PluginMethod
    public void resume(PluginCall call) {
        if (mediaPlayer != null && !mediaPlayer.isPlaying()) {
            mediaPlayer.start();
            notifyListeners("stateChange", new JSObject().put("state", "playing"));
        }
        call.resolve();
    }

    @PluginMethod
    public void seek(PluginCall call) {
        Double timeSec = call.getDouble("position");
        if (timeSec != null && mediaPlayer != null) {
            int msec = (int) (timeSec * 1000);
            mediaPlayer.seekTo(msec);
        }
        call.resolve();
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        Double vol = call.getDouble("volume");
        if (vol != null) {
            currentVolume = (float) Math.max(0.0, Math.min(1.0, vol));
            if (mediaPlayer != null) {
                mediaPlayer.setVolume(currentVolume, currentVolume);
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void getProgress(PluginCall call) {
        JSObject ret = new JSObject();
        if (mediaPlayer != null) {
            ret.put("currentTime", mediaPlayer.getCurrentPosition() / 1000.0);
            ret.put("duration", mediaPlayer.getDuration() / 1000.0);
            ret.put("isPlaying", mediaPlayer.isPlaying());
        } else {
            ret.put("currentTime", 0.0);
            ret.put("duration", 0.0);
            ret.put("isPlaying", false);
        }
        call.resolve(ret);
    }

    @Override
    protected void handleOnDestroy() {
        releaseEffects();
        if (mediaPlayer != null) {
            mediaPlayer.release();
            mediaPlayer = null;
        }
        super.handleOnDestroy();
    }
}
