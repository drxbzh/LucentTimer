// Single source of truth for the app version. Loaded as a classic script by index.html (About page)
// and via importScripts() by sw.js (cache name), so the two can never disagree. Bump it here only.
self.LUCENT_VERSION = '1.1';
