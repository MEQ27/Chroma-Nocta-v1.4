import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.chromanocta.app',
  appName: 'Chroma Nocta',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
