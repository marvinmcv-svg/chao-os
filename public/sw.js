// Minimal service worker for PWA "Add to Home Screen" support
// This enables the manifest to work without complex caching logic

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})