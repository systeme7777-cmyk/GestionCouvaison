import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ansar.elevage',
  appName: 'ANSAR ELEVAGE',
  webDir: 'dist',
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#1F6B35',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: { backgroundColor: '#1F6B35', style: 'DARK' },
  },
};
export default config;
