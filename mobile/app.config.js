// IZSIZ_OFFLINE=1 ile yapılan sürüm derlemelerinde internet izni tamamen kaldırılır.
const offline = process.env.IZSIZ_OFFLINE === '1';

module.exports = {
  expo: {
    name: 'İzsiz',
    slug: 'izsiz',
    scheme: 'izsiz',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    splash: { image: './assets/splash-icon.png', resizeMode: 'contain', backgroundColor: '#0f1716' },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'app.izsiz.mobile',
      infoPlist: { ITSAppUsesNonExemptEncryption: false, CFBundleAllowMixedLocalizations: true },
    },
    android: {
      package: 'app.izsiz.mobile',
      adaptiveIcon: {
        backgroundColor: '#166c62',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      blockedPermissions: offline ? ['android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE'] : [],
    },
    web: { favicon: './assets/favicon.png' },
    plugins: [
      [
        'expo-sharing',
        {
          ios: {
            enabled: true,
            activationRule: {
              supportsText: true,
              supportsWebUrlWithMaxCount: 5,
              supportsImageWithMaxCount: 30,
              supportsMovieWithMaxCount: 10,
              supportsFileWithMaxCount: 30,
            },
          },
          android: {
            enabled: true,
            singleShareMimeTypes: ['text/plain', 'image/*', 'video/*', 'audio/*', 'application/*'],
            multipleShareMimeTypes: ['image/*', 'video/*', 'audio/*', 'application/*'],
          },
        },
      ],
      ['expo-image-picker', { photosPermission: 'Pick the photos you want to clean', cameraPermission: false, microphonePermission: false }],
      ['expo-media-library', { savePhotosPermission: 'Save cleaned photos to your library', isAccessMediaLocationEnabled: false }],
    ],
    locales: { tr: './locales/tr.json' },
  },
};
