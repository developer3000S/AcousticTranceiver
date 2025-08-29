import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.acoustic.transceiver',
  appName: 'Акустический трансивер',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
