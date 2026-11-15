import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gestioncouvaison.app',
  appName: 'Gestion Couvaison',
  webDir: 'dist',
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: '#1F5C40', showSpinner: false },
    LocalNotifications: { smallIcon: 'ic_stat_notify', iconColor: '#1F5C40' },
  },
};

export default config;
