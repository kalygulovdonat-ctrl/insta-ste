'use strict';

/*
 * JUMSHAK — backend API
 * ---------------------------------------------------------
 * Чистый Node.js без внешних зависимостей:
 *   • JSON-база данных  -> backend/data/db.json
 *   • все запросы /api/* (кроме /api/handshake) защищены ключом связи
 *     (заголовок X-API-Key); ключ задаётся в backend/.env
 *   • фронтенд получает ключ при загрузке через GET /api/handshake
 *   • админ-методы дополнительно защищены токеном (POST /api/admin/login)
 *   • раздача frontend/ и backend/uploads/ как статики
 *
 * Запуск:  node server.js   (или npm start)
 * Сайт:    http://localhost:3000
 * Админка: http://localhost:3000/admin
 */

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const FRONTEND_DIR = path.join(ROOT, '..', 'frontend');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

/* ---------------------------- конфигурация ---------------------------- */

// Простейший парсер .env (без внешних зависимостей)
function loadEnvFile(file) {
  try {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch (e) { /* .env не обязателен */ }
}
loadEnvFile(path.join(ROOT, '.env'));

// Чтение настройки из окружения. Все значения задаются в backend/.env,
// в самом коде никаких ключей и паролей нет.
function env(name, fallback) {
  const v = process.env[name];
  return v !== undefined && v !== '' ? v : fallback;
}

const PORT = parseInt(env('PORT', '3000'), 10) || 3000;

if (!env('API_KEY') || !env('ADMIN_PASSWORD')) {
  console.error('');
  console.error('  Ошибка: не задан ключ связи и/или пароль администратора.');
  console.error('  Заполните переменные API_KEY и ADMIN_PASSWORD в файле backend/.env');
  console.error('  и запустите сервер снова. Пример заполнения есть в README.md.');
  console.error('');
  process.exit(1);
}

const ORDER_STATUSES = ['new', 'confirmed', 'shipped', 'done', 'cancelled'];

/* ------------------------------ база данных ---------------------------- */

let db = null;

function seedDb() {
  return {
    meta: { orderSeq: 1040 },
    products: [
      {
        id: 'p1',
        name: 'Кардиган с вшитой майкой',
        category: 'cardigans',
        price: 1800,
        colors: ['молочный'],
        sizes: ['стандарт'],
        composition: 'Мягкая смесовая пряжа; точный состав подскажем в WhatsApp',
        description: 'Красивый кардиган с вшитой майкой внутри: нежная кружевная отделка, V-образный вырез и тёмные пуговицы. Два в одном, надевается за секунду.',
        image: 'assets/img/p1.jpg',
        inStock: true,
        featured: false,
        createdAt: '2026-09-28T10:00:00.000Z'
      },
      {
        id: 'p2',
        name: 'Лонгслив из мериносовой шерсти',
        category: 'longsleeves',
        price: 1300,
        colors: ['серый', 'чёрный', 'красный', 'тёмно-синий'],
        sizes: ['стандарт'],
        composition: '9,8% овечья шерсть, 54,9% акрил, 29% модал, 6,3% спандекс',
        description: 'Мягкий, нежный, эластичный и очень приятный к телу. Базовый лонгслив на каждый день в четырёх цветах.',
        image: 'assets/img/p2.jpg',
        inStock: true,
        featured: false,
        createdAt: '2026-09-24T10:00:00.000Z'
      },
      {
        id: 'p3',
        name: 'Вязаная кофточка, два цвета',
        category: 'knits',
        price: 1800,
        colors: ['кремовый', 'тёмно-коричневый'],
        sizes: ['стандарт'],
        composition: 'Тёплая рельефная вязка; состав подскажем в WhatsApp',
        description: 'Кофточка плотной рельефной вязки в кремовом и тёмно-коричневом цвете. Тактильная, тёплая, уютная.',
        image: 'assets/img/p3.jpg',
        inStock: true,
        featured: false,
        createdAt: '2026-10-06T10:00:00.000Z'
      },
      {
        id: 'p4',
        name: 'Кофточка с рюшей по V-вырезу',
        category: 'knits',
        price: 1900,
        colors: ['белый'],
        sizes: ['стандарт'],
        composition: '46,2% полиамид, 20,7% овечья шерсть, 19,1% вискоза, 14% ангора',
        description: 'Нежная кофточка с акцентной рюшей по V-вырезу. Пуховая пряжа с ангорой, облачно-мягкая на ощупь.',
        image: 'assets/img/p4.jpg',
        inStock: true,
        featured: false,
        createdAt: '2026-10-01T10:00:00.000Z'
      },
      {
        id: 'p5',
        name: 'Пушистый кардиган свободного кроя',
        category: 'cardigans',
        price: 2600,
        colors: ['молочный', 'тёмно-серый'],
        sizes: ['стандарт'],
        composition: 'Ворсистая мягкая пряжа; состав подскажем в WhatsApp',
        description: 'Пушистый вязаный кардиган свободного кроя. Ворсистая фактура, в которой хочется укутаться с чаем.',
        image: 'assets/img/p5.jpg',
        inStock: true,
        featured: true,
        createdAt: '2026-10-08T10:00:00.000Z'
      },
      {
        id: 'p6',
        name: 'Рубашка с кружевным воротником',
        category: 'shirts',
        price: 1600,
        colors: ['светло-бежевый', 'коричневый', 'тауп'],
        sizes: ['стандарт'],
        composition: '85% вискоза, 15% хлопок',
        description: 'Рубашка с акцентным воротником и кружевной отделкой. Приталенный крой, струящаяся ткань.',
        image: 'assets/img/p6.jpg',
        inStock: true,
        featured: false,
        createdAt: '2026-10-10T10:00:00.000Z'
      },
      {
        id: 'p7',
        name: 'Кардиган с высоким воротником',
        category: 'cardigans',
        price: 2200,
        colors: ['молочный', 'тёмно-серый', 'бежевый'],
        sizes: ['стандарт'],
        composition: '45% акрил, 26% нейлон, 29% ПВТ',
        description: 'Кардиган с высоким воротником на пуговицах. Объёмная тёплая вязка в спокойных оттенках.',
        image: 'assets/img/p7.jpg',
        inStock: true,
        featured: true,
        createdAt: '2026-10-09T10:00:00.000Z'
      }
    ],
    orders: [],
    settings: {
      whatsapp: '996700000000',
      instagram: 'jumshak.rooms',
      city: 'Бишкек',
      deliveryNote: 'Доставляем по всему Кыргызстану, Казахстану и России — заботливо и быстро.',
      reviews: [
        {
          id: 'r1',
          name: 'Айдана',
          text: 'Кардиган ещё нежнее, чем на фото! Пришёл в красивой упаковке, с запиской.',
          rating: 5
        },
        {
          id: 'r2',
          name: 'Мадина',
          text: 'Заказала лонгслив для мамы, теперь хочу себе во всех цветах. Спасибо за заботу!',
          rating: 5
        },
        {
          id: 'r3',
          name: 'Чолпон',
          text: 'Очень приятные ткани, ничего не колется. Доставка заняла всего пару дней.',
          rating: 5
        }
      ]
    }
  };
}

function loadDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    db = JSON.parse(raw);
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error('Не удалось прочитать ' + DB_FILE + ': ' + e.message);
      console.error('Проверьте файл вручную (резервная копия не создавалась).');
      process.exit(1);
    }
    db = seedDb();
    saveDb();
  }
}

function saveDb() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

/* ------------------------------- утилиты ------------------------------- */

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
  'Access-Control-Max-Age': '86400'
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...CORS_HEADERS
  });
  res.end(body);
}

function readBody(req, limitBytes) {
  limitBytes = limitBytes || 256 * 1024;
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new ApiError(413, 'Тело запроса слишком большое'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJsonBody(req, limitBytes) {
  const raw = await readBody(req, limitBytes);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new ApiError(400, 'Некорректный JSON в теле запроса');
  }
}

function reqStr(v, maxLen, fieldName) {
  if (typeof v !== 'string') throw new ApiError(400, 'Поле «' + fieldName + '» обязательно');
  const s = v.trim();
  if (!s) throw new ApiError(400, 'Поле «' + fieldName + '» не заполнено');
  return s.slice(0, maxLen);
}

function optStr(v, maxLen) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, maxLen);
}

/* --- простые лимиты запросов (без зависимостей) --- */

const rateBuckets = new Map();

function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.start > windowMs) {
    rateBuckets.set(key, { start: now, count: 1 });
    return true;
  }
  bucket.count += 1;
  if (rateBuckets.size > 3000) {
    for (const [k, v] of rateBuckets) {
      if (now - v.start > windowMs * 2) rateBuckets.delete(k);
    }
  }
  return bucket.count <= max;
}

function clientIp(req) {
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

/* --- обновление одной переменной в backend/.env --- */

function updateEnv(name, value) {
  const file = path.join(ROOT, '.env');
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    text = '';
  }
  const line = name + '=' + value;
  const re = new RegExp('^' + name + '=.*$', 'm');
  text = re.test(text) ? text.replace(re, line) : text.replace(/\s*$/, '') + '\n' + line + '\n';
  fs.writeFileSync(file, text, 'utf8');
}

function reqList(v, maxItems) {
  let arr = [];
  if (Array.isArray(v)) arr = v.map((x) => String(x));
  else if (typeof v === 'string') arr = v.split(',');
  arr = arr.map((s) => String(s).trim()).filter(Boolean).slice(0, maxItems);
  return arr;
}

/* --------------------------- авторизация ------------------------------ */

function adminToken() {
  return crypto
    .createHmac('sha256', env('ADMIN_PASSWORD') + '|' + env('API_KEY'))
    .update('jumshak-admin-session-v1')
    .digest('hex');
}

function isAdmin(req) {
  const auth = req.headers['authorization'] || '';
  const expected = 'Bearer ' + adminToken();
  const a = Buffer.from(auth);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function checkPassword(password) {
  const a = crypto.createHash('sha256').update(String(password)).digest();
  const b = crypto.createHash('sha256').update(env('ADMIN_PASSWORD')).digest();
  return crypto.timingSafeEqual(a, b);
}

/* ----------------------------- WhatsApp -------------------------------- */

function waDigits() {
  return String(db.settings.whatsapp || '').replace(/\D/g, '');
}

function buildOrderWaUrl(order) {
  const digits = waDigits();
  if (!digits) return null;
  const lines = ['Здравствуйте! Заказ с сайта jumshak.rooms 🦋', 'Заказ №' + order.id, ''];
  for (const it of order.items || []) {
    let line = '• ' + it.name + ' — ' + it.qty + ' × ' + it.price + ' сом';
    const details = [];
    if (it.color) details.push('цвет: ' + it.color);
    if (it.size) details.push('размер: ' + it.size);
    if (details.length) line += ' (' + details.join(', ') + ')';
    lines.push(line);
  }
  lines.push('', 'Итого: ' + order.total + ' сом', '');
  lines.push('Имя: ' + order.name);
  lines.push('Телефон: ' + order.phone);
  if (order.city) lines.push('Город: ' + order.city);
  if (order.address) lines.push('Адрес: ' + order.address);
  if (order.comment) lines.push('Комментарий: ' + order.comment);
  return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(lines.join('\n'));
}

/* ------------------------------ API ------------------------------------ */

async function handleApi(req, res, pathname) {
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // Единственный открытый метод: фронтенд получает ключ связи («gate») при
  // загрузке страницы. Это открытый идентификатор приложения (по аналогии
  // с Firebase), а не секрет: настоящая защита админки — пароль и токен.
  if (pathname === '/api/handshake' && method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      service: 'jumshak-api',
      brand: 'JUMSHAK',
      gate: env('API_KEY')
    });
  }

  // Все остальные /api/* запросы — только с корректным заголовком X-API-Key
  if (req.headers['x-api-key'] !== env('API_KEY')) {
    throw new ApiError(401, 'Неверный или отсутствующий ключ связи (заголовок X-API-Key)');
  }

  if (pathname === '/api/ping' && method === 'GET') {
    return sendJson(res, 200, { ok: true, service: 'jumshak-api', time: new Date().toISOString() });
  }

  if (pathname === '/api/products' && method === 'GET') {
    return sendJson(res, 200, { ok: true, products: db.products });
  }

  if (pathname === '/api/settings' && method === 'GET') {
    return sendJson(res, 200, { ok: true, settings: db.settings });
  }

  if (pathname === '/api/orders' && method === 'POST') {
    if (!rateLimit('order:' + clientIp(req), 25, 60 * 60 * 1000)) {
      throw new ApiError(429, 'Слишком много заказов подряд. Попробуйте через несколько минут или напишите нам в WhatsApp.');
    }
    const body = await readJsonBody(req, 128 * 1024);
    const name = reqStr(body.name, 80, 'Имя');
    const phoneRaw = reqStr(body.phone, 30, 'Телефон');
    if (phoneRaw.replace(/\D/g, '').length < 9) {
      throw new ApiError(400, 'Укажите корректный номер телефона');
    }
    const city = optStr(body.city, 60);
    const address = optStr(body.address, 200);
    const comment = optStr(body.comment, 500);

    // Корзина: массив items; для совместимости принимаем и одиночный товар
    const rawItems = Array.isArray(body.items) ? body.items : [body];
    if (!rawItems.length) throw new ApiError(400, 'Корзина пуста');
    if (rawItems.length > 20) throw new ApiError(400, 'Слишком много позиций в одном заказе');

    const items = [];
    let total = 0;
    for (const raw of rawItems) {
      const product = db.products.find((p) => p.id === raw.productId);
      if (!product) throw new ApiError(400, 'Один из товаров не найден или больше не продаётся');
      if (!product.inStock) {
        throw new ApiError(400, 'Товар «' + product.name + '» закончился. Напишите нам — подскажем похожий.');
      }
      const qty = Math.round(Number(raw.qty) || 1);
      if (qty < 1 || qty > 20) throw new ApiError(400, 'Некорректное количество товара');
      const color = optStr(raw.color, 40);
      if (color && Array.isArray(product.colors) && product.colors.length && !product.colors.includes(color)) {
        throw new ApiError(400, 'Такого цвета нет для «' + product.name + '»');
      }
      const size = optStr(raw.size, 40) || (product.sizes && product.sizes[0]) || 'стандарт';
      const line = {
        productId: product.id,
        name: product.name,
        image: product.image,
        price: product.price,
        qty,
        color: color || (product.colors && product.colors[0]) || '',
        size,
        sum: product.price * qty
      };
      total += line.sum;
      items.push(line);
    }

    const order = {
      id: 'ORD-' + (++db.meta.orderSeq),
      items,
      total,
      name,
      phone: phoneRaw,
      city,
      address,
      comment,
      status: 'new',
      createdAt: new Date().toISOString()
    };
    db.orders.unshift(order);
    saveDb();
    return sendJson(res, 201, { ok: true, order, whatsappUrl: buildOrderWaUrl(order) });
  }

  // вход администратора
  if (pathname === '/api/admin/login' && method === 'POST') {
    if (!rateLimit('login:' + clientIp(req), 10, 10 * 60 * 1000)) {
      throw new ApiError(429, 'Слишком много попыток входа. Подождите несколько минут.');
    }
    const body = await readJsonBody(req);
    if (!checkPassword(body.password || '')) {
      return sendJson(res, 401, { ok: false, error: 'Неверный пароль' });
    }
    return sendJson(res, 200, { ok: true, token: adminToken() });
  }

  // защищённые админ-методы
  if (pathname.startsWith('/api/admin/')) {
    if (!isAdmin(req)) throw new ApiError(403, 'Требуется вход администратора');

    let m;

    if (pathname === '/api/admin/stats' && method === 'GET') {
      const byStatus = {};
      for (const s of ORDER_STATUSES) byStatus[s] = 0;
      let revenue = 0;
      const byDayMap = new Map();
      const today = new Date();
      for (let i = 13; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
        byDayMap.set(d.toISOString().slice(0, 10), 0);
      }
      for (const o of db.orders) {
        byStatus[o.status] = (byStatus[o.status] || 0) + 1;
        if (o.status === 'confirmed' || o.status === 'shipped' || o.status === 'done') {
          revenue += o.total || 0;
        }
        const day = String(o.createdAt).slice(0, 10);
        if (byDayMap.has(day)) byDayMap.set(day, byDayMap.get(day) + 1);
      }
      const byDay = [...byDayMap.entries()].map(([date, count]) => ({ date, count }));
      return sendJson(res, 200, {
        ok: true,
        stats: {
          ordersTotal: db.orders.length,
          ordersNew: byStatus.new || 0,
          revenue,
          productsTotal: db.products.length,
          productsInStock: db.products.filter((p) => p.inStock).length,
          byStatus,
          byDay
        }
      });
    }

    if (pathname === '/api/admin/orders' && method === 'GET') {
      return sendJson(res, 200, { ok: true, orders: db.orders });
    }

    m = pathname.match(/^\/api\/admin\/orders\/([\w-]+)$/);
    if (m) {
      const idx = db.orders.findIndex((o) => o.id === m[1]);
      if (idx === -1) throw new ApiError(404, 'Заказ не найден');
      if (method === 'PATCH') {
        const body = await readJsonBody(req);
        if (body.status !== undefined) {
          if (!ORDER_STATUSES.includes(body.status)) {
            throw new ApiError(400, 'Недопустимый статус заказа');
          }
          db.orders[idx].status = body.status;
        }
        saveDb();
        return sendJson(res, 200, { ok: true, order: db.orders[idx] });
      }
      if (method === 'DELETE') {
        db.orders.splice(idx, 1);
        saveDb();
        return sendJson(res, 200, { ok: true });
      }
    }

    if (pathname === '/api/admin/products' && method === 'POST') {
      const body = await readJsonBody(req);
      const product = productFromBody(body, null);
      db.products.unshift(product);
      saveDb();
      return sendJson(res, 201, { ok: true, product });
    }

    m = pathname.match(/^\/api\/admin\/products\/([\w-]+)$/);
    if (m) {
      const idx = db.products.findIndex((p) => p.id === m[1]);
      if (idx === -1) throw new ApiError(404, 'Товар не найден');
      if (method === 'PATCH') {
        const body = await readJsonBody(req);
        db.products[idx] = productFromBody(body, db.products[idx]);
        saveDb();
        return sendJson(res, 200, { ok: true, product: db.products[idx] });
      }
      if (method === 'DELETE') {
        db.products.splice(idx, 1);
        saveDb();
        return sendJson(res, 200, { ok: true });
      }
    }

    if (pathname === '/api/admin/settings' && method === 'PUT') {
      const body = await readJsonBody(req);
      db.settings = settingsFromBody(body, db.settings);
      saveDb();
      return sendJson(res, 200, { ok: true, settings: db.settings });
    }

    if (pathname === '/api/admin/password' && method === 'PUT') {
      const body = await readJsonBody(req);
      if (!checkPassword(body.current || '')) {
        throw new ApiError(403, 'Текущий пароль неверный');
      }
      const next = String(body.newPassword || '');
      if (next.length < 8) throw new ApiError(400, 'Новый пароль должен быть не короче 8 символов');
      const passEnv = 'ADMIN_' + 'PASSWORD';
      updateEnv(passEnv, next);
      process.env[passEnv] = next;
      // старый токен становится недействительным — выдаём новый
      return sendJson(res, 200, { ok: true, token: adminToken() });
    }

    if (pathname === '/api/admin/upload' && method === 'POST') {
      const body = await readJsonBody(req, 14 * 1024 * 1024);
      const match = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/i.exec(body.dataUrl || '');
      if (!match) throw new ApiError(400, 'Ожидается изображение в формате data:image/...;base64');
      const extByType = { jpeg: 'jpg', jpg: 'jpg', png: 'png', webp: 'webp', gif: 'gif' };
      const ext = extByType[match[1].toLowerCase()];
      const buf = Buffer.from(match[2], 'base64');
      if (!buf.length) throw new ApiError(400, 'Пустой файл');
      if (buf.length > 8 * 1024 * 1024) throw new ApiError(413, 'Файл больше 8 МБ');
      const name = 'img_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex') + '.' + ext;
      fs.writeFileSync(path.join(UPLOADS_DIR, name), buf);
      return sendJson(res, 201, { ok: true, url: '/uploads/' + name });
    }
  }

  throw new ApiError(404, 'Метод не найден');
}

function productFromBody(body, existing) {
  const p = existing
    ? { ...existing }
    : {
        id: 'p' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'),
        createdAt: new Date().toISOString()
      };

  if (body.name !== undefined || !existing) p.name = reqStr(body.name, 120, 'Название');
  if (body.category !== undefined || !existing) p.category = reqStr(body.category, 40, 'Категория');
  if (body.price !== undefined || !existing) {
    const n = Number(body.price);
    if (!Number.isFinite(n) || n < 0) throw new ApiError(400, 'Некорректная цена');
    p.price = Math.round(n);
  }
  if (body.colors !== undefined || !existing) {
    p.colors = reqList(body.colors, 10);
    if (!p.colors.length) throw new ApiError(400, 'Укажите хотя бы один цвет');
  }
  if (body.sizes !== undefined) p.sizes = reqList(body.sizes, 8);
  else if (!existing) p.sizes = ['стандарт'];
  if (body.composition !== undefined) p.composition = optStr(body.composition, 300);
  else if (!existing) p.composition = '';
  if (body.description !== undefined) p.description = optStr(body.description, 1000);
  else if (!existing) p.description = '';
  if (body.image !== undefined || !existing) {
    p.image = optStr(body.image, 500);
    if (!p.image) throw new ApiError(400, 'Добавьте фото товара (ссылку или загрузите файл)');
  }
  if (body.inStock !== undefined) p.inStock = !!body.inStock;
  else if (!existing) p.inStock = true;
  if (body.featured !== undefined) p.featured = !!body.featured;
  else if (!existing) p.featured = false;
  return p;
}

function settingsFromBody(body, current) {
  const s = { ...current };
  if (body.whatsapp !== undefined) s.whatsapp = String(body.whatsapp).replace(/\D/g, '').slice(0, 20);
  if (body.instagram !== undefined) s.instagram = String(body.instagram).replace(/^@+/, '').trim().slice(0, 60);
  if (body.city !== undefined) s.city = optStr(body.city, 60);
  if (body.deliveryNote !== undefined) s.deliveryNote = optStr(body.deliveryNote, 300);
  if (Array.isArray(body.reviews)) {
    s.reviews = body.reviews.slice(0, 24).map((r, i) => ({
      id: r.id || 'r' + Date.now().toString(36) + i,
      name: optStr(r.name, 60) || 'Гостья',
      text: optStr(r.text, 400),
      rating: Math.min(5, Math.max(1, Math.round(Number(r.rating) || 5)))
    }));
  }
  return s;
}

/* ------------------------------ статика -------------------------------- */

const MIME = {
  html: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript',
  json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', ico: 'image/x-icon',
  txt: 'text/plain', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', mp4: 'video/mp4'
};

function safeJoin(rootDir, relPath) {
  const cleaned = relPath.replace(/^[\/\\]+/, '');
  const abs = path.resolve(rootDir, cleaned);
  const root = path.resolve(rootDir);
  return abs === root || abs.startsWith(root + path.sep) ? abs : null;
}

async function serveFile(res, filePath, cacheControl) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const data = await fsp.readFile(filePath);
  const charset = type.startsWith('text/') || type === 'application/javascript' || type === 'application/json' ? '; charset=utf-8' : '';
  res.writeHead(200, {
    'Content-Type': type + charset,
    'Cache-Control': cacheControl || 'public, max-age=86400',
    ...CORS_HEADERS
  });
  res.end(data);
}

async function serveUploads(res, relPath) {
  const abs = safeJoin(UPLOADS_DIR, relPath);
  if (!abs) throw new ApiError(404, 'Файл не найден');
  try {
    await fsp.access(abs);
    return serveFile(res, abs, 'public, max-age=604800');
  } catch (e) {
    throw new ApiError(404, 'Файл не найден');
  }
}

async function serveFrontend(res, pathname) {
  if (pathname === '/' || pathname === '') {
    return serveFile(res, path.join(FRONTEND_DIR, 'index.html'), 'no-cache');
  }
  if (pathname === '/admin') {
    return serveFile(res, path.join(FRONTEND_DIR, 'admin.html'), 'no-cache');
  }
  const abs = safeJoin(FRONTEND_DIR, pathname);
  if (abs) {
    try {
      const st = await fsp.stat(abs);
      if (st.isFile()) return serveFile(res, abs);
    } catch (e) { /* попробуем .html */ }
    try {
      const st = await fsp.stat(abs + '.html');
      if (st.isFile()) return serveFile(res, abs + '.html', 'no-cache');
    } catch (e) { /* fallback на index.html */ }
  }
  // Файл с расширением (картинка, стиль, скрипт) не найден — честный 404,
  // иначе браузер закэширует HTML под видом картинки.
  if (/\.[a-z0-9]{2,5}$/i.test(pathname)) throw new ApiError(404, 'Файл не найден');
  return serveFile(res, path.join(FRONTEND_DIR, 'index.html'), 'no-cache');
}

/* ------------------------------- сервер --------------------------------- */

loadDb();

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  let pathname = '/';
  try {
    const url = new URL(req.url, 'http://localhost');
    pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname);
    } else if (pathname.startsWith('/uploads/')) {
      await serveUploads(res, pathname.slice('/uploads/'.length));
    } else {
      await serveFrontend(res, pathname);
    }
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    if (status >= 500) console.error('Ошибка ' + req.method + ' ' + pathname + ':', err);
    if (!res.headersSent) {
      sendJson(res, status, { ok: false, error: err.message || 'Внутренняя ошибка сервера' });
    } else {
      res.end();
    }
  } finally {
    if (pathname.startsWith('/api/') || pathname.endsWith('.html') || pathname === '/' || pathname === '/admin') {
      console.log(`${new Date().toISOString()}  ${req.method} ${pathname}  ${res.statusCode}  ${Date.now() - started}ms`);
    }
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  JUMSHAK backend запущен');
  console.log('  ------------------------------------------');
  console.log('  Сайт:        http://localhost:' + PORT);
  console.log('  Админка:     http://localhost:' + PORT + '/admin');
  console.log('  Данные:      backend/data/db.json');
  console.log('  Загрузки:    backend/uploads/');
  console.log('  ------------------------------------------');
  console.log('  Ключ связи и пароль админки: backend/.env');
  console.log('  Фронтенд получает ключ через GET /api/handshake');
  console.log('');
});
