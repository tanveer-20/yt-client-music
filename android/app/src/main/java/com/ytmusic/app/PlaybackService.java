package com.ytmusic.app;

import android.app.PendingIntent;
import android.content.Intent;
import android.media.audiofx.DynamicsProcessing;
import android.media.audiofx.LoudnessEnhancer;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.ForwardingPlayer;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

/**
 * PlaybackService — Media3 MediaSessionService for continuous background audio playback
 * with system lockscreen/notification media controls.
 *
 * Key design decisions:
 * - Extends MediaSessionService which automatically manages foreground notification
 * - WAKE_MODE_NETWORK keeps CPU + Wi-Fi alive when screen off
 * - DSP effects (LoudnessEnhancer, DynamicsProcessing) are optional and wrapped in try-catch
 *   because they depend on device-specific audio HAL implementations
 * - Video track disabled since we only stream audio
 */
public class PlaybackService extends MediaSessionService {
    private static final String TAG = "PlaybackService";

    public static final String ACTION_PLAY = "com.ytmusic.app.ACTION_PLAY";
    public static final String ACTION_PAUSE = "com.ytmusic.app.ACTION_PAUSE";
    public static final String ACTION_RESUME = "com.ytmusic.app.ACTION_RESUME";

    private static volatile PlaybackService instance;

    public interface PlaybackEventListener {
        void onPlaybackState(String state, double duration);
        void onMediaAction(String action);
    }

    private static volatile PlaybackEventListener eventListener;

    private ExoPlayer player;
    private MediaSession mediaSession;
    private DynamicsProcessing dynamicsProcessing;
    private LoudnessEnhancer loudnessEnhancer;
    private float currentLoudnessDb = 0.0f;
    private float currentVolume = 1.0f;

    public static PlaybackService getInstance() {
        return instance;
    }

    public static void setEventListener(PlaybackEventListener listener) {
        eventListener = listener;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        try {
            initPlayer();
            initMediaSession();
            Log.i(TAG, "PlaybackService created successfully");
        } catch (Exception e) {
            Log.e(TAG, "PlaybackService onCreate failed: " + e.getMessage(), e);
        }
    }

    private void initPlayer() {
        // Direct HTTP DataSource for streaming from our Express server
        DefaultHttpDataSource.Factory httpDataSourceFactory = new DefaultHttpDataSource.Factory()
                .setUserAgent("Mozilla/5.0 (Linux; Android 14) ExoPlayer")
                .setConnectTimeoutMs(15000)
                .setReadTimeoutMs(15000)
                .setAllowCrossProtocolRedirects(true);

        DefaultMediaSourceFactory mediaSourceFactory = new DefaultMediaSourceFactory(httpDataSourceFactory);

        // Responsive buffer: 500ms initial for fast start, 15s max for stability
        DefaultLoadControl loadControl = new DefaultLoadControl.Builder()
                .setBufferDurationsMs(2500, 15000, 500, 1000)
                .build();

        // Build ExoPlayer with WAKE_MODE_NETWORK and music audio attributes
        player = new ExoPlayer.Builder(this)
                .setMediaSourceFactory(mediaSourceFactory)
                .setLoadControl(loadControl)
                .setWakeMode(C.WAKE_MODE_NETWORK)
                .setAudioAttributes(
                        new AudioAttributes.Builder()
                                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                                .setUsage(C.USAGE_MEDIA)
                                .build(),
                        true // handle audio focus automatically
                )
                .build();

        // Disable video tracks — we're an audio-only player
        player.setTrackSelectionParameters(
                player.getTrackSelectionParameters()
                        .buildUpon()
                        .setTrackTypeDisabled(C.TRACK_TYPE_VIDEO, true)
                        .build()
        );

        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int playbackState) {
                if (player == null) return;
                try {
                    if (playbackState == Player.STATE_READY) {
                        attachStudioDsp(player.getAudioSessionId());
                        boolean playing = player.getPlayWhenReady();
                        double dur = player.getDuration() / 1000.0;
                        notifyState(playing ? "playing" : "paused", dur);
                    } else if (playbackState == Player.STATE_ENDED) {
                        notifyState("ended", 0.0);
                    } else if (playbackState == Player.STATE_BUFFERING) {
                        notifyState("loading", 0.0);
                    }
                } catch (Exception e) {
                    Log.w(TAG, "onPlaybackStateChanged error: " + e.getMessage());
                }
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                if (player == null) return;
                try {
                    notifyState(isPlaying ? "playing" : "paused", player.getDuration() / 1000.0);
                } catch (Exception e) {
                    Log.w(TAG, "onIsPlayingChanged error: " + e.getMessage());
                }
            }

            @Override
            public void onPlayerError(androidx.media3.common.PlaybackException error) {
                Log.e(TAG, "ExoPlayer error [" + error.errorCode + "]: " + error.getMessage(), error);
                notifyState("error", 0.0);
            }
        });

        Log.i(TAG, "ExoPlayer initialized");
    }

    private void initMediaSession() {
        if (player == null) return;

        // PendingIntent to relaunch MainActivity when user taps the notification
        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, launchIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        // ForwardingPlayer exposes Next/Previous commands so the notification shows skip buttons
        // These are routed back to the JS layer via eventListener
        ForwardingPlayer forwardingPlayer = new ForwardingPlayer(player) {
            @Override
            public Player.Commands getAvailableCommands() {
                return super.getAvailableCommands().buildUpon()
                        .add(COMMAND_SEEK_TO_NEXT)
                        .add(COMMAND_SEEK_TO_PREVIOUS)
                        .add(COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
                        .add(COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
                        .build();
            }

            @Override
            public boolean isCommandAvailable(int command) {
                if (command == COMMAND_SEEK_TO_NEXT || command == COMMAND_SEEK_TO_PREVIOUS ||
                    command == COMMAND_SEEK_TO_NEXT_MEDIA_ITEM || command == COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM) {
                    return true;
                }
                return super.isCommandAvailable(command);
            }

            @Override
            public void seekToNext() {
                PlaybackEventListener l = eventListener;
                if (l != null) l.onMediaAction("next");
            }

            @Override
            public void seekToNextMediaItem() { seekToNext(); }

            @Override
            public void seekToPrevious() {
                PlaybackEventListener l = eventListener;
                if (l != null) l.onMediaAction("previous");
            }

            @Override
            public void seekToPreviousMediaItem() { seekToPrevious(); }
        };

        mediaSession = new MediaSession.Builder(this, forwardingPlayer)
                .setSessionActivity(pendingIntent)
                .build();

        Log.i(TAG, "MediaSession initialized");
    }

    private void notifyState(String state, double duration) {
        PlaybackEventListener l = eventListener;
        if (l != null) {
            try {
                l.onPlaybackState(state, duration);
            } catch (Exception e) {
                Log.w(TAG, "notifyState error: " + e.getMessage());
            }
        }
    }

    /**
     * Attach optional DSP effects. Fully wrapped in try-catch because
     * DynamicsProcessing and LoudnessEnhancer depend on device audio HAL
     * and can throw on certain OEM implementations.
     */
    private void attachStudioDsp(int audioSessionId) {
        if (audioSessionId == C.AUDIO_SESSION_ID_UNSET) return;

        // 1. Loudness normalization
        try {
            if (loudnessEnhancer != null) {
                try { loudnessEnhancer.release(); } catch (Exception ignored) {}
                loudnessEnhancer = null;
            }
            loudnessEnhancer = new LoudnessEnhancer(audioSessionId);
            int targetGainmB = Math.max(-1200, Math.min(800, (int) (-currentLoudnessDb * 100)));
            if (targetGainmB > 0) {
                loudnessEnhancer.setTargetGain(targetGainmB);
                loudnessEnhancer.setEnabled(true);
            } else {
                loudnessEnhancer.setEnabled(false);
            }
        } catch (Exception e) {
            Log.w(TAG, "LoudnessEnhancer unavailable: " + e.getMessage());
            loudnessEnhancer = null;
        }

        // 2. Multi-band compressor on API 28+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                if (dynamicsProcessing != null) {
                    try { dynamicsProcessing.release(); } catch (Exception ignored) {}
                    dynamicsProcessing = null;
                }

                DynamicsProcessing.Config.Builder builder = new DynamicsProcessing.Config.Builder(
                        DynamicsProcessing.VARIANT_FAVOR_FREQUENCY_RESOLUTION,
                        2, true, 4, true, 4, false, 0, true
                );
                DynamicsProcessing.Config config = builder.build();

                for (int ch = 0; ch < 2; ch++) {
                    config.setMbcBandByChannelIndex(ch, 0, new DynamicsProcessing.MbcBand(
                            true, 160f, 15f, 120f, 2.5f, -14f, 4f, -60f, 1f, 1.5f, 1f));
                    config.setMbcBandByChannelIndex(ch, 1, new DynamicsProcessing.MbcBand(
                            true, 1000f, 25f, 100f, 1.8f, -16f, 4f, -60f, 1f, 0f, 0f));
                    config.setMbcBandByChannelIndex(ch, 2, new DynamicsProcessing.MbcBand(
                            true, 5000f, 20f, 80f, 2f, -18f, 4f, -60f, 1f, 1f, 0.5f));
                    config.setMbcBandByChannelIndex(ch, 3, new DynamicsProcessing.MbcBand(
                            true, 20000f, 10f, 60f, 2.2f, -20f, 4f, -60f, 1f, 1.8f, 1f));
                    config.setLimiterByChannelIndex(ch, new DynamicsProcessing.Limiter(
                            true, true, 0, 1f, 40f, 10f, -0.5f, 0f));
                }

                dynamicsProcessing = new DynamicsProcessing(0, audioSessionId, config);
                dynamicsProcessing.setEnabled(true);
                Log.i(TAG, "MBDRC attached to session " + audioSessionId);
            } catch (Exception e) {
                Log.w(TAG, "DynamicsProcessing unavailable: " + e.getMessage());
                dynamicsProcessing = null;
            }
        }
    }

    public void playTrack(String url, String title, String artist, String artworkUrl, float loudnessDb) {
        if (player == null) {
            try {
                initPlayer();
            } catch (Exception e) {
                Log.e(TAG, "Failed to re-init player: " + e.getMessage());
                notifyState("error", 0.0);
                return;
            }
        }
        if (player == null) {
            notifyState("error", 0.0);
            return;
        }

        // Resolve URLs so ExoPlayer can reach our Express server on the PC
        if (url != null) {
            if (url.startsWith("/")) {
                url = "http://192.168.164.164:3001" + url;
            } else if (url.contains("localhost:3001") || url.contains("127.0.0.1:3001")) {
                url = url.replace("localhost:3001", "192.168.164.164:3001")
                         .replace("127.0.0.1:3001", "192.168.164.164:3001");
            }
        }

        Log.i(TAG, "playTrack: " + url + " | " + title + " - " + artist);
        currentLoudnessDb = loudnessDb;

        MediaMetadata.Builder metaBuilder = new MediaMetadata.Builder()
                .setTitle(title != null && !title.isEmpty() ? title : "Unknown Title")
                .setArtist(artist != null && !artist.isEmpty() ? artist : "Unknown Artist");

        if (artworkUrl != null && !artworkUrl.isEmpty()) {
            try {
                metaBuilder.setArtworkUri(Uri.parse(artworkUrl));
            } catch (Exception e) {
                Log.w(TAG, "Invalid artwork URI: " + artworkUrl);
            }
        }

        try {
            MediaItem mediaItem = new MediaItem.Builder()
                    .setUri(Uri.parse(url))
                    .setMediaMetadata(metaBuilder.build())
                    .build();

            player.setMediaItem(mediaItem);
            player.setVolume(currentVolume);
            player.prepare();
            player.play();
        } catch (Exception e) {
            Log.e(TAG, "playTrack error: " + e.getMessage(), e);
            notifyState("error", 0.0);
        }
    }

    public void pausePlayback() {
        if (player != null) {
            try { player.pause(); } catch (Exception e) {
                Log.w(TAG, "pause error: " + e.getMessage());
            }
        }
    }

    public void resumePlayback() {
        if (player != null) {
            try { player.play(); } catch (Exception e) {
                Log.w(TAG, "resume error: " + e.getMessage());
            }
        }
    }

    public void seekPlayback(long timeMs) {
        if (player != null) {
            try { player.seekTo(timeMs); } catch (Exception e) {
                Log.w(TAG, "seek error: " + e.getMessage());
            }
        }
    }

    public void setPlaybackVolume(float volume) {
        currentVolume = volume;
        if (player != null) {
            try { player.setVolume(currentVolume); } catch (Exception e) {
                Log.w(TAG, "setVolume error: " + e.getMessage());
            }
        }
    }

    public double getCurrentPosition() {
        if (player == null) return 0.0;
        try { return player.getCurrentPosition() / 1000.0; }
        catch (Exception e) { return 0.0; }
    }

    public double getDuration() {
        if (player == null) return 0.0;
        try { return Math.max(0, player.getDuration() / 1000.0); }
        catch (Exception e) { return 0.0; }
    }

    public boolean isPlaying() {
        if (player == null) return false;
        try { return player.isPlaying(); }
        catch (Exception e) { return false; }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Let MediaSessionService handle the intent first (manages foreground notification)
        int result = super.onStartCommand(intent, flags, startId);

        if (intent != null && intent.getAction() != null) {
            try {
                String action = intent.getAction();
                if (ACTION_PLAY.equals(action)) {
                    String url = intent.getStringExtra("url");
                    String title = intent.getStringExtra("title");
                    String artist = intent.getStringExtra("artist");
                    String artworkUrl = intent.getStringExtra("artworkUrl");
                    float ld = intent.getFloatExtra("loudnessDb", 0.0f);
                    if (url != null && !url.isEmpty()) {
                        playTrack(url, title, artist, artworkUrl, ld);
                    }
                } else if (ACTION_PAUSE.equals(action)) {
                    pausePlayback();
                } else if (ACTION_RESUME.equals(action)) {
                    resumePlayback();
                }
            } catch (Exception e) {
                Log.e(TAG, "onStartCommand action error: " + e.getMessage());
            }
        }

        return result;
    }

    @Nullable
    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return mediaSession;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // If nothing is playing, stop the service when user swipes the app away
        if (player != null && !player.getPlayWhenReady()) {
            stopSelf();
        }
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        if (loudnessEnhancer != null) {
            try { loudnessEnhancer.release(); } catch (Exception ignored) {}
            loudnessEnhancer = null;
        }
        if (dynamicsProcessing != null) {
            try { dynamicsProcessing.release(); } catch (Exception ignored) {}
            dynamicsProcessing = null;
        }
        if (mediaSession != null) {
            try { mediaSession.release(); } catch (Exception ignored) {}
            mediaSession = null;
        }
        if (player != null) {
            try { player.release(); } catch (Exception ignored) {}
            player = null;
        }
        instance = null;
        super.onDestroy();
        Log.i(TAG, "PlaybackService destroyed");
    }
}
