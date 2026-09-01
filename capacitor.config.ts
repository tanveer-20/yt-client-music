import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ytmusic.app',
  appName: 'YT Music',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true, // Allow http://192.168.x.x local network access
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#000000',
    },
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#000000',
  },
};

export default config;
