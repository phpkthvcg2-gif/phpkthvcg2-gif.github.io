/**
 * 口腔溃疡预防健康管理 PWA - Service Worker
 * 功能：离线缓存静态资源，实现断网可用
 * 策略：缓存优先（Cache First），网络请求成功后更新缓存
 */

const CACHE_NAME = 'oral-health-v1.4-pwa';
const CACHE_VERSION = 'v1.4.0';

// 需要缓存的静态资源列表
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.svg',
  './icon-512.svg'
];

// ========== Install 事件：安装时缓存静态资源 ==========
self.addEventListener('install', function (event) {
  console.log('[ServiceWorker] 安装中，缓存静态资源...');
  event.waitUntil(
    caches.open(CACHE_NAME + '-' + CACHE_VERSION).then(function (cache) {
      console.log('[ServiceWorker] 缓存资源:', STATIC_ASSETS);
      return cache.addAll(STATIC_ASSETS).catch(function (err) {
        console.warn('[ServiceWorker] 部分资源缓存失败（本地file协议下属正常）:', err);
        // 即使部分失败也继续，不阻断安装
        return Promise.resolve();
      });
    }).then(function () {
      console.log('[ServiceWorker] 静态资源缓存完成');
      return self.skipWaiting(); // 立即激活，不等待旧SW退出
    })
  );
});

// ========== Activate 事件：激活时清理旧缓存 ==========
self.addEventListener('activate', function (event) {
  console.log('[ServiceWorker] 激活中，清理旧缓存...');
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames.map(function (cacheName) {
          // 删除不属于当前版本的缓存
          if (cacheName !== CACHE_NAME + '-' + CACHE_VERSION) {
            console.log('[ServiceWorker] 删除旧缓存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function () {
      console.log('[ServiceWorker] 旧缓存清理完成');
      return self.clients.claim(); // 立即接管所有页面
    })
  );
});

// ========== Fetch 事件：缓存优先策略 ==========
self.addEventListener('fetch', function (event) {
  // 只处理GET请求
  if (event.request.method !== 'GET') {
    return;
  }

  // 跳过非http/https请求（如chrome-extension、file协议等）
  const url = new URL(event.request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function (cachedResponse) {
      // 缓存命中：返回缓存，同时后台更新缓存
      if (cachedResponse) {
        // 后台更新缓存（stale-while-revalidate）
        fetch(event.request).then(function (networkResponse) {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME + '-' + CACHE_VERSION).then(function (cache) {
              cache.put(event.request, responseClone);
            });
          }
        }).catch(function () {
          // 网络失败时静默处理，继续使用缓存
        });
        return cachedResponse;
      }

      // 缓存未命中：走网络，成功后存入缓存
      return fetch(event.request).then(function (networkResponse) {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
          return networkResponse;
        }

        // 只缓存同源静态资源
        if (url.origin === self.location.origin) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME + '-' + CACHE_VERSION).then(function (cache) {
            cache.put(event.request, responseClone);
          });
        }

        return networkResponse;
      }).catch(function () {
        // 网络失败且缓存未命中：对于导航请求，返回离线页面
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        // 其他请求返回离线响应
        return new Response('离线状态，资源不可用', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' }
        });
      });
    })
  );
});

// ========== 消息通信：支持页面主动触发更新 ==========
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION, cacheName: CACHE_NAME });
  }
});

console.log('[ServiceWorker] 脚本已加载，版本:', CACHE_VERSION);
