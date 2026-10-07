package com.ytmusic.app;

import android.content.Intent;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeAudio")
public class NativeAudioPlugin extends Plugin {
    private static final String TAG = "NativeAudio";

    @Override
    public void load() {
        super.load();

        PlaybackService.setEventListener(new PlaybackService.PlaybackEventListener() {
            @Override
            public void onPlaybackState(String state, double duration) {
                JSObject ret = new JSObject();
                ret.put("state", state);
                if (duration > 0) {
                    ret.put("duration", duration);
                }
                notifyListeners("stateChange", ret);
            }

            @Override
            public void onMediaAction(String action) {
                JSObject ret = new JSObject();
                ret.put("action", action);
                notifyListeners("mediaAction", ret);
            }
        });

        // Pre-warm the background playback service
        ensureServiceStarted(null);
    }

    private void ensureServiceStarted(Intent startIntent) {
        try {
            if (PlaybackService.getInstance() == null) {
                Intent intent = startIntent != null ? startIntent : new Intent(getContext(), PlaybackService.class);
                // Use ContextCompat.startForegroundService for Android 8+ compatibility
                ContextCompat.startForegroundService(getContext(), intent);
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to start PlaybackService: " + e.getMessage());
        }
    }

    @PluginMethod
    public void play(PluginCall call) {
        String url = call.getString("url");
        String title = call.getString("title", "Unknown Title");
        String artist = call.getString("artist", "Unknown Artist");
        String artworkUrl = call.getString("artworkUrl", "");
        Double loudness = call.getDouble("loudnessDb");
        float loudnessDb = loudness != null ? loudness.floatValue() : 0.0f;

        if (url == null || url.isEmpty()) {
            call.reject("URL is required");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                PlaybackService service = PlaybackService.getInstance();
                if (service != null) {
                    service.playTrack(url, title, artist, artworkUrl, loudnessDb);
                } else {
                    // Service not yet alive — start it with the play intent
                    Intent intent = new Intent(getContext(), PlaybackService.class);
                    intent.setAction(PlaybackService.ACTION_PLAY);
                    intent.putExtra("url", url);
                    intent.putExtra("title", title);
                    intent.putExtra("artist", artist);
                    intent.putExtra("artworkUrl", artworkUrl);
                    intent.putExtra("loudnessDb", loudnessDb);
                    ensureServiceStarted(intent);
                }
                call.resolve();
            } catch (Exception e) {
                Log.e(TAG, "Play failed: " + e.getMessage(), e);
                call.reject("Failed to play: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                PlaybackService service = PlaybackService.getInstance();
                if (service != null) {
                    service.pausePlayback();
                }
            } catch (Exception e) {
                Log.w(TAG, "Pause error: " + e.getMessage());
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void resume(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                PlaybackService service = PlaybackService.getInstance();
                if (service != null) {
                    service.resumePlayback();
                }
            } catch (Exception e) {
                Log.w(TAG, "Resume error: " + e.getMessage());
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void seek(PluginCall call) {
        Double timeSec = call.getDouble("position");
        if (timeSec != null) {
            getActivity().runOnUiThread(() -> {
                try {
                    PlaybackService service = PlaybackService.getInstance();
                    if (service != null) {
                        service.seekPlayback((long) (timeSec * 1000));
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Seek error: " + e.getMessage());
                }
                call.resolve();
            });
        } else {
            call.resolve();
        }
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        Double vol = call.getDouble("volume");
        if (vol != null) {
            float volume = vol.floatValue();
            getActivity().runOnUiThread(() -> {
                try {
                    PlaybackService service = PlaybackService.getInstance();
                    if (service != null) {
                        service.setPlaybackVolume(volume);
                    }
                } catch (Exception e) {
                    Log.w(TAG, "SetVolume error: " + e.getMessage());
                }
                call.resolve();
            });
        } else {
            call.resolve();
        }
    }

    @PluginMethod
    public void getProgress(PluginCall call) {
        if (getActivity() == null) {
            JSObject ret = new JSObject();
            ret.put("currentTime", 0.0);
            ret.put("duration", 0.0);
            ret.put("isPlaying", false);
            call.resolve(ret);
            return;
        }

        getActivity().runOnUiThread(() -> {
            JSObject ret = new JSObject();
            try {
                PlaybackService service = PlaybackService.getInstance();
                if (service != null) {
                    ret.put("currentTime", service.getCurrentPosition());
                    ret.put("duration", service.getDuration());
                    ret.put("isPlaying", service.isPlaying());
                } else {
                    ret.put("currentTime", 0.0);
                    ret.put("duration", 0.0);
                    ret.put("isPlaying", false);
                }
            } catch (Exception e) {
                ret.put("currentTime", 0.0);
                ret.put("duration", 0.0);
                ret.put("isPlaying", false);
            }
            call.resolve(ret);
        });
    }
}
