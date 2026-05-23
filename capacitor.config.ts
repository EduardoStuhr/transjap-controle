import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "br.com.transjap.manager",
  appName: "TransJap Manager",
  webDir: "dist",
  bundledWebRuntime: false,
  backgroundColor: "#05070c",
  appendUserAgent: " TransJapManager/1.0",
  loggingBehavior: "production",
  server: {
    url: "https://sistema-transjap.com.br",
    cleartext: false,
    androidScheme: "https",
    allowNavigation: ["sistema-transjap.com.br"],
    errorPath: "offline.html",
  },
  android: {
    backgroundColor: "#05070c",
    minWebViewVersion: 80,
    zoomEnabled: false,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    backgroundColor: "#05070c",
    zoomEnabled: false,
    contentInset: "automatic",
    scrollEnabled: true,
    allowsLinkPreview: false,
    limitsNavigationsToAppBoundDomains: true,
    preferredContentMode: "mobile",
    webContentsDebuggingEnabled: false,
    buildOptions: {
      signingStyle: "automatic",
      exportMethod: "app-store-connect",
    },
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1800,
      launchFadeOutDuration: 450,
      backgroundColor: "#05070c",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_INSIDE",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#05070c",
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "body",
      style: "dark",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
