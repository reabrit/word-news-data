
// ============== 增强版Service Worker ==============
const CACHE_NAME = 'word-news-v1';
const CACHE_ASSETS = [
  '/',
  '/index.html',  // 将主页作为离线回退
  '/sw.js',
  '/Imges/favicon-192.png',
  '/Imges/logo.png',
  '/chart.js',
  'https://cdn.jsdelivr.net/npm/chart.js@3.7.0/dist/chart.min.js',
  'https://cdn.jsdelivr.net/particles.js/2.0.0/particles.min.js',
  'https://cdn.jsdelivr.net/npm/hammerjs@2.0.8/hammer.min.js'
];

// ============== 安装阶段 ==============
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        try {
          await cache.addAll(CACHE_ASSETS);
          console.log('核心资源缓存成功');
        } catch (err) {
          console.warn('部分资源缓存失败:', err);
        }
        return self.skipWaiting();
      })
  );
});

// ============== 激活阶段 ==============
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => 
      Promise.all(
        keys.map(key => 
          key !== CACHE_NAME ? caches.delete(key) : Promise.resolve()
        )
      ).then(() => self.clients.claim())
    )
  );
});

// ============== 优化版请求处理 ==============
self.addEventListener('fetch', (event) => {
  // 不缓存API请求
  if (event.request.url.includes('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 处理页面请求
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // 回退到已缓存的主页
          return caches.match('/index.html')
            .then(response => response || new Response(
              '<h1>离线模式</h1><p>当前无法连接网络，请检查网络连接</p>',
              { headers: {'Content-Type': 'text/html'} }
            ));
        })
    );
    return;
  }

  // 处理静态资源
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        const networked = fetch(event.request)
          .then(response => {
            // 动态缓存新资源
            const clone = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put(event.request, clone))
              .catch(console.warn);
            return response;
          })
          .catch(() => {
            // 返回备用内容
            if (event.request.destination === 'image') {
              return caches.match('/Imges/logo.png');
            }
            return new Response('离线内容不可用', { 
              status: 503,
              headers: { 'Content-Type': 'text/plain' }
            });
          });
        return cached || networked;
      })
  );
});