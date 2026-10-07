package com.ytmusic.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.audiofx.LoudnessEnhancer;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
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
 * - Immediate explicit startForeground call with registered NotificationChannel
 *   to satisfy Android OS 5000ms SERVICE_START_FOREGROUND_TIMEOUT and prevent autoclosing.
 * - Proper FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK on Android 14+ (targetSdk 34+).
 * - WAKE_MODE_NETWORK keeps CPU + Wi-Fi alive when screen is off.
 * - Device-safe DSP using LoudnessEnhancer without hazardous HAL-crashing DynamicsProcessing.
 */
public class PlaybackService extends MediaSessionService {
    private static final String TAG = "PlaybackService";

    public static final String ACTION_PLAY = "com.ytmusic.app.ACTION_PLAY";
    public static final String ACTION_PAUSE = "com.ytmusic.app.ACTION_PAUSE";
    public static final String ACTION_RESUME = "com.ytmusic.app.ACTION_RESUME";

    public static final String CHANNEL_ID = "rem_playback_channel";
    public static final int NOTIFICATION_ID = 1001;

    private static volatile PlaybackService instance;

    public interface PlaybackEventListener {
        void onPlaybackState(String state, double duration);
        void onMediaAction(String action);
    }

    private static volatile PlaybackEventListener eventListener;

    private ExoPlayer player;
    private MediaSession mediaSession;
    private LoudnessEnhancer loudnessEnhancer;
    private float currentLoudnessDb = 0.0f;
    private float currentVolume = 1.0f;

    private String currentTitle = "Rem";
    private String currentArtist = "Ready to play";

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
            createNotificationChannel();
            // Immediately start in foreground to satisfy the OS 5-second timer
            startForegroundNotification(currentTitle, currentArtist, false);
            initPlayer();
            initMediaSession();
            Log.i(TAG, "PlaybackService created successfully with foreground notification");
        } catch (Exception e) {
            Log.e(TAG, "PlaybackService onCreate failed: " + e.getMessage(), e);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                if (manager != null) {
                    NotificationChannel channel = new NotificationChannel(
                            CHANNEL_ID,
                            "Rem Music Playback",
                            NotificationManager.IMPORTANCE_LOW
                    );
                    channel.setDescription("Background audio playback controls for Rem");
                    channel.setShowBadge(false);
                    channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                    manager.createNotificationChannel(channel);
                }
            } catch (Exception e) {
                Log.w(TAG, "createNotificationChannel error: " + e.getMessage());
            }
        }
    }

    private void startForegroundNotification(String title, String artist, boolean isPlaying) {
        createNotificationChannel();

        if (title != null && !title.isEmpty()) currentTitle = title;
        if (artist != null && !artist.isEmpty()) currentArtist = artist;

        try {
            Intent launchIntent = new Intent(this, MainActivity.class);
            launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                    this, 0, launchIntent,
                    PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
            );

            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                    .setContentTitle(currentTitle)
                    .setContentText(currentArtist)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentIntent(pendingIntent)
                    .setOngoing(isPlaying)
                    .setOnlyAlertOnce(true)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setPriority(NotificationCompat.PRIORITY_LOW);

            Notification notification = builder.build();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            Log.w(TAG, "startForeground error: " + e.getMessage());
        }
    }

    private void initPlayer() {
        // Direct HTTP DataSource for streaming
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
                        startForegroundNotification(currentTitle, currentArtist, playing);
                    } else if (playbackState == Player.STATE_ENDED) {
                        notifyState("ended", 0.0);
                        startForegroundNotification(currentTitle, currentArtist, false);
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
                    startForegroundNotification(currentTitle, currentArtist, isPlaying);
                } catch (Exception e) {
                    Log.w(TAG, "onIsPlayingChanged error: " + e.getMessage());
                }
            }

            @Override
            public void onPlayerError(androidx.media3.common.PlaybackException error) {
                Log.e(TAG, "ExoPlayer error [" + error.errorCode + "]: " + error.getMessage(), error);
                notifyState("error", 0.0);
                startForegroundNotification(currentTitle, "Playback error", false);
            }
        });

        Log.i(TAG, "ExoPlayer initialized");
    }

    private void initMediaSession() {
        if (player == null) return;

        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, launchIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

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
     * Attach optional DSP effects. Uses LoudnessEnhancer safely.
     * Complex HAL-crashing multi-band dynamics processors are deliberately omitted
     * to ensure rock-solid stability across all Android OEM devices.
     */
    private void attachStudioDsp(int audioSessionId) {
        if (audioSessionId == C.AUDIO_SESSION_ID_UNSET) return;

        try {
            if (loudnessEnhancer != null) {
                try { loudnessEnhancer.release(); } catch (Throwable ignored) {}
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
        } catch (Throwable t) {
            Log.w(TAG, "LoudnessEnhancer unavailable: " + t.getMessage());
            loudnessEnhancer = null;
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

        // Resolve URLs: if relative path, resolve against default local dev server. Direct http(s) URLs are preserved!
        if (url != null) {
            if (url.startsWith("/")) {
                url = "http://192.168.164.164:3001" + url;
            } else if (url.contains("localhost:3001") || url.contains("127.0.0.1:3001")) {
                url = url.replace("localhost:3001", "192.168.164.164:3001")
                         .replace("127.0.0.1:3001", "192.168.164.164:3001");
            }
        }

        currentTitle = (title != null && !title.isEmpty()) ? title : "Unknown Title";
        currentArtist = (artist != null && !artist.isEmpty()) ? artist : "Unknown Artist";
        currentLoudnessDb = loudnessDb;

        Log.i(TAG, "playTrack: " + url + " | " + currentTitle + " - " + currentArtist);

        // Update foreground notification immediately
        startForegroundNotification(currentTitle, currentArtist, true);

        MediaMetadata.Builder metaBuilder = new MediaMetadata.Builder()
                .setTitle(currentTitle)
                .setArtist(currentArtist);

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
            try {
                player.pause();
                startForegroundNotification(currentTitle, currentArtist, false);
            } catch (Exception e) {
                Log.w(TAG, "pause error: " + e.getMessage());
            }
        }
    }

    public void resumePlayback() {
        if (player != null) {
            try {
                player.play();
                startForegroundNotification(currentTitle, currentArtist, true);
            } catch (Exception e) {
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
        int result = super.onStartCommand(intent, flags, startId);

        // Always satisfy foreground obligation
        startForegroundNotification(currentTitle, currentArtist, isPlaying());

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
        if (player != null && !player.getPlayWhenReady()) {
            stopSelf();
        }
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
        } catch (Throwable ignored) {}

        if (loudnessEnhancer != null) {
            try { loudnessEnhancer.release(); } catch (Throwable ignored) {}
            loudnessEnhancer = null;
        }
        if (mediaSession != null) {
            try { mediaSession.release(); } catch (Throwable ignored) {}
            mediaSession = null;
        }
        if (player != null) {
            try { player.release(); } catch (Throwable ignored) {}
            player = null;
        }
        instance = null;
        super.onDestroy();
        Log.i(TAG, "PlaybackService destroyed");
    }
}
