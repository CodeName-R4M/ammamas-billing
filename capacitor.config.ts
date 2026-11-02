import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ammamas.billing',
  appName: 'Ammamas Billing',
  webDir: 'dist',
  backgroundColor: '#FAF9FF',
  android: {
    adjustMarginsForEdgeToEdge: 'auto',
  },
};

export default config;
