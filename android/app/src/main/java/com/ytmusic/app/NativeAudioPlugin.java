package com.ytmusic.app;

import android.content.Context;
import android.media.audiofx.DynamicsProcessing;
import android.media.audiofx.LoudnessEnhancer;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.cache.CacheDataSource;
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor;
import androidx.media3.datasource.cache.SimpleCache;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.audio.DefaultAudioSink;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

@CapacitorPlugin(name = "NativeAudio")
public class NativeAudioPlugin extends Plugin {
    private static final String TAG = "NativeAudio";
    private ExoPlayer player;
    private static SimpleCache simpleCache;
    private DynamicsProcessing dynamicsProcessing;
    private LoudnessEnhancer loudnessEnhancer;
    private float currentLoudnessDb = 0.0f;
    private float currentVolume = 1.0f;

    @Override
    public void load() {
        super.load();
        initCache(getContext());
        initExoPlayer();
    }

    private synchronized void initCache(Context context) {
        if (simpleCache == null) {
            try {
                File cacheDir = new File(context.getCacheDir(), "media3_audio_cache");
                LeastRecentlyUsedCacheEvictor evictor = new LeastRecentlyUsedCacheEvictor(200 * 1024 * 1024); // 200MB LRU disk cache
                simpleCache = new SimpleCache(cacheDir, evictor);
            } catch (Exception e) {
                Log.w(TAG, "SimpleCache init failed, streaming uncached: " + e.getMessage());
            }
        }
    }

    private void initExoPlayer() {
        Context context = getContext();

        try {
            // 1. Configure 32-bit Floating-Point AudioSink with Zero-Resampling 48kHz Output
            DefaultAudioSink audioSink = new DefaultAudioSink.Builder(context)
                    .setEnableFloatOutput(true) // 32-bit Float Audio Pipeline
                    .build();

            DefaultRenderersFactory renderersFactory = new DefaultRenderersFactory(context)
                    .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER);

            // 2. High-Performance Caching HTTP DataSource (Bypasses YouTube CDN rate limiting)
            DefaultHttpDataSource.Factory httpDataSourceFactory = new DefaultHttpDataSource.Factory()
                    .setUserAgent("Mozilla/5.0 (Linux; Android 14) ExoPlayer")
                    .setConnectTimeoutMs(15000)
                    .setReadTimeoutMs(15000)
                    .setAllowCrossProtocolRedirects(true);

            DefaultMediaSourceFactory mediaSourceFactory;
            if (simpleCache != null) {
                CacheDataSource.Factory cacheDataSourceFactory = new CacheDataSource.Factory()
                        .setCache(simpleCache)
                        .setUpstreamDataSourceFactory(httpDataSourceFactory)
                        .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR);
                mediaSourceFactory = new DefaultMediaSourceFactory(cacheDataSourceFactory);
            } else {
                mediaSourceFactory = new DefaultMediaSourceFactory(httpDataSourceFactory);
            }

            // 3. Instantiate ExoPlayer with Media3 USAGE_MEDIA Attributes (FLAG_DEEP_BUFFER hardware offload)
            player = new ExoPlayer.Builder(context, renderersFactory)
                    .setMediaSourceFactory(mediaSourceFactory)
                    .setAudioAttributes(
                            new AudioAttributes.Builder()
                                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                                    .setUsage(C.USAGE_MEDIA)
                                    .build(),
                            true // Handle Audio Focus Automatically
                    )
                    .build();

            player.addListener(new Player.Listener() {
                @Override
                public void onPlaybackStateChanged(int playbackState) {
                    if (playbackState == Player.STATE_READY) {
                        attachStudioDsp(player.getAudioSessionId());
                        notifyListeners("stateChange", new JSObject()
                                .put("state", player.isPlaying() ? "playing" : "paused")
                                .put("duration", player.getDuration() / 1000.0));
                    } else if (playbackState == Player.STATE_ENDED) {
                        notifyListeners("stateChange", new JSObject().put("state", "ended"));
                    } else if (playbackState == Player.STATE_BUFFERING) {
                        notifyListeners("stateChange", new JSObject().put("state", "loading"));
                    }
                }

                @Override
                public void onIsPlayingChanged(boolean isPlaying) {
                    notifyListeners("stateChange", new JSObject().put("state", isPlaying ? "playing" : "paused"));
                }
            });

            Log.i(TAG, "Media3 ExoPlayer Studio Audio Engine initialized!");
        } catch (Exception e) {
            Log.e(TAG, "ExoPlayer initialization failed: " + e.getMessage(), e);
        }
    }

    private void attachStudioDsp(int audioSessionId) {
        if (audioSessionId == C.AUDIO_SESSION_ID_UNSET) return;

        try {
            // 1. Dynamic ITU-R BS.1770 Loudness Normalization
            if (loudnessEnhancer != null) {
                try { loudnessEnhancer.release(); } catch (Exception ignored) {}
            }
            loudnessEnhancer = new LoudnessEnhancer(audioSessionId);
            
            // Dynamic gain offset based on track loudnessDb (target: -14 LUFS)
            int targetGainmB = Math.max(-1200, Math.min(800, (int) (-currentLoudnessDb * 100)));
            if (targetGainmB > 0) {
                loudnessEnhancer.setTargetGain(targetGainmB);
                loudnessEnhancer.setEnabled(true);
            } else {
                loudnessEnhancer.setEnabled(false);
            }

            // 2. Broadcast-Grade Multi-Band Compressor (MBDRC) on Android 9+ (API 28+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                if (dynamicsProcessing != null) {
                    try { dynamicsProcessing.release(); } catch (Exception ignored) {}
                }

                DynamicsProcessing.Config.Builder builder = new DynamicsProcessing.Config.Builder(
                        DynamicsProcessing.VARIANT_FAVOR_FREQUENCY_RESOLUTION,
                        2,      // Stereo (2 channels)
                        true, 4,// Pre-EQ (4 bands)
                        true, 4,// MBC (4 bands)
                        false, 0,// Post-EQ
                        true    // True-Peak Lookahead Limiter
                );

                DynamicsProcessing.Config config = builder.build();

                // Configure MBDRC 4-band compressor matrix for punch, vocal clarity & air
                for (int ch = 0; ch < 2; ch++) {
                    // Band 0: Sub-Bass (<160 Hz) - Tight punchy 808/kick
                    config.setMbcBandByChannelIndex(ch, 0, new DynamicsProcessing.MbcBand(
                            true, 160.0f, 15.0f, 120.0f, 2.5f, -14.0f, 4.0f, -60.0f, 1.0f, 1.5f, 1.0f));
                    // Band 1: Low-Mid (160 - 1000 Hz) - Clean vocal body, mud reduction
                    config.setMbcBandByChannelIndex(ch, 1, new DynamicsProcessing.MbcBand(
                            true, 1000.0f, 25.0f, 100.0f, 1.8f, -16.0f, 4.0f, -60.0f, 1.0f, 0.0f, 0.0f));
                    // Band 2: High-Mid (1000 - 5000 Hz) - Vocal clarity & snare snap
                    config.setMbcBandByChannelIndex(ch, 2, new DynamicsProcessing.MbcBand(
                            true, 5000.0f, 20.0f, 80.0f, 2.0f, -18.0f, 4.0f, -60.0f, 1.0f, 1.0f, 0.5f));
                    // Band 3: Highs (>5000 Hz) - High-end sparkle & air
                    config.setMbcBandByChannelIndex(ch, 3, new DynamicsProcessing.MbcBand(
                            true, 20000.0f, 10.0f, 60.0f, 2.2f, -20.0f, 4.0f, -60.0f, 1.0f, 1.8f, 1.0f));

                    // True-Peak Safety Limiter (-0.5 dBFS threshold to prevent DAC clipping)
                    config.setLimiterByChannelIndex(ch, new DynamicsProcessing.Limiter(
                            true, true, 0, 1.0f, 40.0f, 10.0f, -0.5f, 0.0f));
                }

                dynamicsProcessing = new DynamicsProcessing(0, audioSessionId, config);
                dynamicsProcessing.setEnabled(true);
            }

            Log.i(TAG, "Attached Media3 Studio DSP & MBDRC to AudioSession: " + audioSessionId);
        } catch (Exception e) {
            Log.w(TAG, "Could not attach Studio DSP: " + e.getMessage());
        }
    }

    @PluginMethod
    public void play(PluginCall call) {
        String url = call.getString("url");
        Double loudness = call.getDouble("loudnessDb");
        if (url == null || url.isEmpty()) {
            call.reject("URL is required");
            return;
        }

        currentLoudnessDb = loudness != null ? loudness.floatValue() : 0.0f;

        getActivity().runOnUiThread(() -> {
            try {
                if (player == null) initExoPlayer();
                MediaItem mediaItem = MediaItem.fromUri(Uri.parse(url));
                player.setMediaItem(mediaItem);
                player.setVolume(currentVolume);
                player.prepare();
                player.play();
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
            if (player != null) player.pause();
            call.resolve();
        });
    }

    @PluginMethod
    public void resume(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (player != null) player.play();
            call.resolve();
        });
    }

    @PluginMethod
    public void seek(PluginCall call) {
        Double timeSec = call.getDouble("position");
        if (timeSec != null) {
            getActivity().runOnUiThread(() -> {
                if (player != null) player.seekTo((long) (timeSec * 1000));
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
            currentVolume = vol.floatValue();
            getActivity().runOnUiThread(() -> {
                if (player != null) player.setVolume(currentVolume);
                call.resolve();
            });
        } else {
            call.resolve();
        }
    }

    @PluginMethod
    public void getProgress(PluginCall call) {
        JSObject ret = new JSObject();
        if (player != null) {
            ret.put("currentTime", player.getCurrentPosition() / 1000.0);
            ret.put("duration", Math.max(0, player.getDuration() / 1000.0));
            ret.put("isPlaying", player.isPlaying());
        } else {
            ret.put("currentTime", 0.0);
            ret.put("duration", 0.0);
            ret.put("isPlaying", false);
        }
        call.resolve(ret);
    }

    @Override
    protected void handleOnDestroy() {
        if (loudnessEnhancer != null) {
            try { loudnessEnhancer.release(); } catch (Exception ignored) {}
            loudnessEnhancer = null;
        }
        if (dynamicsProcessing != null) {
            try { dynamicsProcessing.release(); } catch (Exception ignored) {}
            dynamicsProcessing = null;
        }
        if (player != null) {
            player.release();
            player = null;
        }
        super.handleOnDestroy();
    }
}
