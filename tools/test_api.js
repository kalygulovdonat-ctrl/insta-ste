'use strict';

/*
 * Сквозной тест backend API. Ключ читается из backend/.env и не печатается.
 * Запуск: node tools/test_api.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENV = {};
for (const line of fs.readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) ENV[m[1]] = m[2];
}

const BASE = 'http://127.0.0.1:' + (ENV.PORT || 3000);
let passed = 0;
let failed = 0;

function check(name, condition, extra) {
  if (condition) {
    passed++;
    console.log('PASS  ' + name);
  } else {
    failed++;
    console.log('FAIL  ' + name + (extra ? '  -> ' + extra : ''));
  }
}

async function req(method, urlPath, options) {
  options = options || {};
  const headers = Object.assign({}, options.headers || {});
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + urlPath, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
  let data = null;
  const text = await res.text();
  try { data = JSON.parse(text); } catch (e) { data = text; }
  return { status: res.status, data, headers: res.headers };
}

(async () => {
  // 1. handshake
  const hs = await req('GET', '/api/handshake');
  check('handshake отдаёт ключ связи', hs.status === 200 && hs.data && typeof hs.data.gate === 'string' && hs.data.gate.length > 8);
  const KEY = hs.data.gate;
  const api = (method, p, body) => req(method, p, { headers: { 'X-API-Key': KEY }, body });

  // 2. ключ обязателен
  const noKey = await req('GET', '/api/products');
  check('без ключа API отвечает 401', noKey.status === 401);

  const ping = await api('GET', '/api/ping');
  check('ping работает с ключом', ping.status === 200 && ping.data.ok === true);

  // 3. товары
  const products = await api('GET', '/api/products');
  check('каталог загружается', products.status === 200 && Array.isArray(products.data.products));
  check('в каталоге 7 товаров', products.data.products.length === 7, 'сейчас: ' + products.data.products.length);
  const p1 = products.data.products.find((p) => p.id === 'p1');
  const p2 = products.data.products.find((p) => p.id === 'p2');
  check('товар p1 с ценой 1800', p1 && p1.price === 1800);
  check('состав p2 из поста', p2 && p2.composition.indexOf('54,9%') >= 0);

  // 4. настройки
  const settings = await api('GET', '/api/settings');
  check('настройки отдаются', settings.status === 200 && settings.data.settings.whatsapp);
  check('отзывы есть', Array.isArray(settings.data.settings.reviews) && settings.data.settings.reviews.length === 3);

  // 5. заказ
  const orderRes = await api('POST', '/api/orders', {
    name: 'Тест Тестов',
    phone: '+996 700 111 222',
    city: 'Бишкек',
    address: 'ул. Тестовая 1',
    comment: 'проверка сайта',
    items: [
      { productId: 'p1', qty: 1, color: 'молочный' },
      { productId: 'p2', qty: 2, color: 'красный' }
    ]
  });
  const order = orderRes.data && orderRes.data.order;
  check('заказ создаётся', orderRes.status === 201 && order && order.id, JSON.stringify(orderRes.data).slice(0, 160));
  check('сервер сам считает сумму (1800 + 2×1300 = 4400)', order && order.total === 4400, order && String(order.total));
  check('в заказе 2 позиции', order && order.items.length === 2);
  const waUrl = orderRes.data.whatsappUrl || '';
  check('есть ссылка WhatsApp с текстом заказа', waUrl.indexOf('https://wa.me/') === 0 && decodeURIComponent(waUrl).indexOf('Итого: 4400 сом') > 0);

  // 6. админ-вход
  const badLogin = await api('POST', '/api/admin/login', { password: 'неверный-пароль' });
  check('неверный пароль отклоняется', badLogin.status === 401);

  const login = await api('POST', '/api/admin/login', { password: ENV.ADMIN_PASSWORD });
  check('вход администратора', login.status === 200 && login.data.token);
  const TOKEN = login.data.token;
  const adm = (method, p, body) => req(method, p, { headers: { 'X-API-Key': KEY, Authorization: 'Bearer ' + TOKEN }, body });

  const noToken = await api('GET', '/api/admin/stats');
  check('админ-методы без токена закрыты', noToken.status === 403);

  const stats = await adm('GET', '/api/admin/stats');
  check('статистика: 1 новый заказ', stats.status === 200 && stats.data.stats.ordersTotal === 1 && stats.data.stats.ordersNew === 1);
  check('выручка пока 0 (заказ новый)', stats.data.stats.revenue === 0);

  // 7. статус заказа
  const patch = await adm('PATCH', '/api/admin/orders/' + order.id, { status: 'confirmed' });
  check('статус заказа меняется', patch.status === 200 && patch.data.order.status === 'confirmed');
  const stats2 = await adm('GET', '/api/admin/stats');
  check('выручка учитывает подтверждённый заказ', stats2.data.stats.revenue === 4400);

  // 8. CRUD товара
  const created = await adm('POST', '/api/admin/products', {
    name: 'Тестовый кардиган',
    category: 'cardigans',
    price: 999,
    colors: ['белый'],
    sizes: ['стандарт'],
    composition: 'тест',
    description: 'тест',
    image: '/assets/img/p1.jpg',
    inStock: true
  });
  check('товар создаётся', created.status === 201 && created.data.product && created.data.product.id);
  const testId = created.data.product.id;
  const patched = await adm('PATCH', '/api/admin/products/' + testId, { inStock: false });
  check('наличие товара переключается', patched.status === 200 && patched.data.product.inStock === false);
  const removed = await adm('DELETE', '/api/admin/products/' + testId);
  check('товар удаляется', removed.status === 200);
  const productsAfter = await api('GET', '/api/products');
  check('каталог снова из 7 товаров', productsAfter.data.products.length === 7);

  // 9. загрузка фото
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const upload = await adm('POST', '/api/admin/upload', { dataUrl: tinyPng });
  check('загрузка фото работает', upload.status === 201 && /^\/uploads\/img_/.test(upload.data.url || ''));
  if (upload.status === 201) {
    const filePath = path.join(ROOT, 'backend', upload.data.url.replace('/uploads/', 'uploads/'));
    try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
  }

  // 10. настройки сохраняются
  const savedSettings = await adm('PUT', '/api/admin/settings', {
    whatsapp: settings.data.settings.whatsapp,
    instagram: settings.data.settings.instagram,
    city: settings.data.settings.city,
    deliveryNote: settings.data.settings.deliveryNote,
    reviews: settings.data.settings.reviews
  });
  check('настройки сохраняются', savedSettings.status === 200 && savedSettings.data.settings.whatsapp === settings.data.settings.whatsapp);

  // 11. удаляем тестовый заказ
  const delOrder = await adm('DELETE', '/api/admin/orders/' + order.id);
  check('тестовый заказ удаляется', delOrder.status === 200);
  const stats3 = await adm('GET', '/api/admin/stats');
  check('дашборд чистый', stats3.data.stats.ordersTotal === 0 && stats3.data.stats.revenue === 0);

  // 12. страницы
  const home = await req('GET', '/');
  check('главная страница отдаётся', home.status === 200 && String(home.data).indexOf('jumshak.rooms') > 0);
  const adminPage = await req('GET', '/admin');
  check('админка отдаётся', adminPage.status === 200 && String(adminPage.data).indexOf('Админ-панель') > 0);
  const css = await req('GET', '/css/style.css');
  check('стили доступны', css.status === 200);
  const img = await req('GET', '/assets/img/hero.jpg');
  check('фото hero доступно', img.status === 200);
  const notFound = await api('GET', '/api/unknown');
  check('неизвестный метод API → 404', notFound.status === 404);

  console.log('');
  console.log('Итого: ' + passed + ' прошло, ' + failed + ' провалилось');
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error('Тест упал:', err.message);
  process.exit(1);
});
