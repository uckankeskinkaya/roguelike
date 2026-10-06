// Service worker: precaches the app shell so the game opens offline.
// Bump VERSION on every deploy so clients pick up the new files.
const VERSION = 'neonkuyu-v1';
const SHELL = [
  './',
  'index.html',
  'manifest.json',
  'css/style.css',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'vendor/peerjs.min.js',
  'src/main.js',
  'src/config.js',
  'src/rng.js',
  'src/sim/world.js',
  'src/sim/player.js',
  'src/sim/weapons.js',
  'src/sim/skills.js',
  'src/sim/enemies.js',
  'src/sim/waves.js',
  'src/render/renderer.js',
  'src/render/fx.js',
  'src/render/hud.js',
  'src/render/particles.js',
  'src/render/sprites.js',
  'src/render/icons.js',
  'src/input/input.js',
  'src/audio/sfx.js',
  'src/ui/ui.js',
  'src/net/net.js',
  'src/net/protocol.js',
  'src/net/clientworld.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Stale-while-revalidate for same-origin GETs: instant (offline-capable) loads,
// fresh files on the next visit.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const key = req.mode === 'navigate' ? 'index.html' : req;
      const cached = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
      const network = fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') cache.put(key, res.clone());
        return res;
      }).catch(() => cached);
      return cached || network;
    }),
  );
});
