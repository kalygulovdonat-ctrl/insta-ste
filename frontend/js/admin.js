'use strict';

/* =========================================================
   JUMSHAK — админ-панель
   ========================================================= */

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

const TOKEN_KEY = 'jmsk_admin_session';

const CATEGORY_LABELS = {
  cardigans: 'кардиганы',
  knits: 'кофточки',
  longsleeves: 'лонгсливы',
  shirts: 'рубашки',
  other: 'другое'
};

const STATUS_LABELS = {
  new: 'Новый',
  confirmed: 'Подтверждён',
  shipped: 'Отправлен',
  done: 'Выполнен',
  cancelled: 'Отменён'
};

const VIEW_TITLES = {
  dashboard: ['Дашборд', 'Сводка по магазину'],
  products: ['Товары', 'Каталог и наличие'],
  orders: ['Заказы', 'Все заявки с сайта'],
  settings: ['Настройки', 'Магазин, отзывы и доступ']
};

const A = {
  token: null,
  products: [],
  orders: [],
  settings: {},
  stats: null,
  orderFilter: 'all',
  editingProductId: null,
  imageValue: ''
};

/* ------------------------------ утилиты ------------------------------ */

function esc(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(value) {
  return Number(value || 0).toLocaleString('ru-RU') + ' сом';
}

function imgSrc(url) {
  if (!url) return '';
  if (/^(https?:|data:)/.test(url)) return url;
  if (url.charAt(0) === '/') return (typeof API_BASE === 'string' ? API_BASE : '') + url;
  return url;
}

function formatDate(iso, withTime) {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '—';
  const day = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
  if (!withTime) return day;
  return day + ' · ' + date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

let toastTimer = null;
function toast(message) {
  const el = $('#adminToast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3200);
}

function setConn(ok) {
  const el = $('#connDot');
  if (!el) return;
  el.classList.toggle('is-off', !ok);
  el.innerHTML = '<i></i> ' + (ok ? 'на связи' : 'нет связи');
}

/* ------------------------------ API ------------------------------ */

async function adminFetch(path, options) {
  try {
    return await apiFetch(path, Object.assign({}, options, { auth: true }));
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      logout(true);
      throw new Error('Сессия истекла — войдите заново');
    }
    throw err;
  }
}

/* ------------------------------ вход/выход ------------------------------ */

function showLogin() {
  $('#loginScreen').hidden = false;
  $('#adminApp').hidden = true;
}

function showApp() {
  $('#loginScreen').hidden = true;
  $('#adminApp').hidden = false;
}

function logout(silent) {
  localStorage.removeItem(TOKEN_KEY);
  A.token = null;
  showLogin();
  if (!silent) toast('Вы вышли из панели');
}

async function onLogin(event) {
  event.preventDefault();
  const passwordInput = $('#loginPassword');
  const errorEl = $('#loginError');
  const submit = $('#loginSubmit');
  const password = passwordInput.value;

  if (errorEl) errorEl.hidden = true;
  if (!password) {
    if (errorEl) { errorEl.textContent = 'Введите пароль'; errorEl.hidden = false; }
    return;
  }

  submit.disabled = true;
  submit.textContent = 'Проверяем…';
  try {
    const data = await apiFetch('/admin/login', { method: 'POST', body: { password: password } });
    A.token = data.token;
    localStorage.setItem(TOKEN_KEY, data.token);
    passwordInput.value = '';
    showApp();
    await loadAll();
    toast('Добро пожаловать в панель');
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message || 'Не удалось войти';
      errorEl.hidden = false;
    }
  } finally {
    submit.disabled = false;
    submit.textContent = 'Войти в панель';
  }
}

/* ------------------------------ загрузка данных ------------------------------ */

async function loadAll() {
  try {
    const [statsRes, ordersRes, productsRes, settingsRes] = await Promise.all([
      adminFetch('/admin/stats'),
      adminFetch('/admin/orders'),
      apiFetch('/products'),
      apiFetch('/settings')
    ]);

    A.stats = statsRes.stats || {};
    A.orders = Array.isArray(ordersRes.orders) ? ordersRes.orders : [];
    A.products = Array.isArray(productsRes.products) ? productsRes.products : [];
    A.settings = settingsRes.settings || {};

    setConn(true);
    renderStats();
    renderProducts();
    renderOrders();
    renderSettings();
  } catch (err) {
    setConn(false);
    toast(err.message || 'Не удалось загрузить данные');
  }
}

/* ------------------------------ дашборд ------------------------------ */

function statusBadge(status) {
  const key = STATUS_LABELS[status] ? status : 'new';
  return '<span class="status status--' + key + '">' + STATUS_LABELS[key] + '</span>';
}

function renderStats() {
  const stats = A.stats || {};
  $('#statOrders').textContent = String(stats.ordersTotal || 0);
  $('#statNew').textContent = String(stats.ordersNew || 0);
  $('#statRevenue').textContent = money(stats.revenue || 0);

  const productsInStock = stats.productsInStock || 0;
  const productsTotal = stats.productsTotal || 0;
  $('#statProducts').textContent = String(productsInStock);
  $('#statProductsHint').textContent = 'из ' + productsTotal + ' в каталоге';

  const badge = $('#navOrdersBadge');
  if (badge) {
    badge.textContent = String(stats.ordersNew || 0);
    badge.hidden = !stats.ordersNew;
  }
  const productsBadge = $('#navProductsBadge');
  if (productsBadge) {
    productsBadge.textContent = String(productsTotal);
    productsBadge.hidden = !productsTotal;
  }

  renderChart(stats.byDay || []);
  renderRecentOrders();
}

function renderChart(byDay) {
  const box = $('#chart');
  if (!box) return;
  if (!byDay.length) {
    box.innerHTML = '<p class="muted" style="font-size:12px">Пока нет данных</p>';
    return;
  }
  const max = Math.max(1, ...byDay.map((d) => Number(d.count) || 0));
  box.innerHTML = byDay.map((day) => {
    const count = Number(day.count) || 0;
    const height = Math.max(3, Math.round((count / max) * 100));
    const date = new Date(day.date + 'T00:00:00');
    const label = isNaN(date.getTime()) ? '' : date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    return (
      '<div class="chart__col" title="' + esc(day.date) + ': ' + count + '">' +
      '<div class="chart__bar" style="height:' + height + '%"><span>' + count + '</span></div>' +
      '<span class="chart__label">' + label + '</span>' +
      '</div>'
    );
  }).join('');
}

function renderRecentOrders() {
  const body = $('#recentOrdersBox');
  if (!body) return;
  if (!A.orders.length) {
    body.innerHTML = '<tr><td colspan="4" class="muted">Заказов пока нет</td></tr>';
    return;
  }
  body.innerHTML = A.orders.slice(0, 5).map((order) =>
    '<tr>' +
    '<td><b>' + esc(order.id) + '</b></td>' +
    '<td>' + esc(order.name) + '</td>' +
    '<td class="price-cell">' + money(order.total) + '</td>' +
    '<td>' + statusBadge(order.status) + '</td>' +
    '</tr>'
  ).join('');
}

/* ------------------------------ товары ------------------------------ */

function renderProducts() {
  const body = $('#productsBody');
  const empty = $('#productsEmpty');
  if (!body) return;

  const count = A.products.length;
  $('#productsCount').textContent = String(count);
  if (empty) empty.hidden = count > 0;

  body.innerHTML = A.products.map((p) => {
    const colors = Array.isArray(p.colors) ? p.colors.join(', ') : '';
    return (
      '<tr data-id="' + esc(p.id) + '">' +
      '<td><img class="thumb" src="' + imgSrc(p.image) + '" alt="" loading="lazy"></td>' +
      '<td class="name-cell"><b>' + esc(p.name) + '</b><span>' + esc(colors || 'без цвета') + '</span></td>' +
      '<td>' + esc(CATEGORY_LABELS[p.category] || p.category) + '</td>' +
      '<td class="price-cell">' + money(p.price) + '</td>' +
      '<td><label class="switch"><input type="checkbox" data-act="stock" ' + (p.inStock ? 'checked' : '') + '><span></span>' + (p.inStock ? 'да' : 'нет') + '</label></td>' +
      '<td class="ta-r"><div class="row-actions">' +
      '<button class="act" data-act="edit" type="button" aria-label="Изменить"><svg class="ic"><use href="#i-edit"/></svg></button>' +
      '<button class="act act--danger" data-act="del" type="button" aria-label="Удалить"><svg class="ic"><use href="#i-trash"/></svg></button>' +
      '</div></td></tr>'
    );
  }).join('');
}

function openProductModal(id) {
  const product = id ? A.products.find((p) => p.id === id) : null;
  A.editingProductId = product ? product.id : null;
  A.imageValue = product ? (product.image || '') : '';

  $('#productModalTitle').textContent = product ? 'Изменить товар' : 'Новый товар';
  $('#productName').value = product ? product.name : '';
  $('#productCategory').value = product ? product.category : 'cardigans';
  $('#productPrice').value = product ? product.price : '';
  $('#productColors').value = product && Array.isArray(product.colors) ? product.colors.join(', ') : '';
  $('#productSizes').value = product && Array.isArray(product.sizes) ? product.sizes.join(', ') : 'стандарт';
  $('#productComposition').value = product ? (product.composition || '') : '';
  $('#productDescription').value = product ? (product.description || '') : '';
  $('#productInStock').checked = product ? !!product.inStock : true;
  $('#productFeatured').checked = product ? !!product.featured : false;

  const urlInput = $('#productImageUrl');
  if (urlInput) urlInput.value = /^https?:/.test(A.imageValue) ? A.imageValue : '';
  setPreview(A.imageValue);

  $('#productError').hidden = true;
  $('#productSubmit').disabled = false;
  $('#productSubmit').textContent = 'Сохранить товар';

  openAmodal('product');
}

function setPreview(url) {
  const img = $('#productImagePreview');
  if (!img) return;
  if (url) img.src = imgSrc(url);
  else img.removeAttribute('src');
}

async function onProductFileChange(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    toast('Файл больше 8 МБ — выберите фото поменьше');
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    setPreview(reader.result);
    const hint = $('#uploadHint');
    if (hint) hint.textContent = 'загружаем фото…';
    try {
      const data = await adminFetch('/admin/upload', { method: 'POST', body: { dataUrl: reader.result } });
      A.imageValue = data.url;
      setPreview(data.url);
      toast('Фото загружено');
    } catch (err) {
      toast(err.message || 'Не удалось загрузить фото');
    } finally {
      if (hint) hint.textContent = 'нажмите, чтобы заменить фото';
    }
  };
  reader.readAsDataURL(file);
}

async function onProductSubmit(event) {
  event.preventDefault();
  const errorEl = $('#productError');
  const submit = $('#productSubmit');

  const name = $('#productName').value.trim();
  const price = Number($('#productPrice').value);
  const colors = $('#productColors').value.split(',').map((s) => s.trim()).filter(Boolean);
  const sizes = $('#productSizes').value.split(',').map((s) => s.trim()).filter(Boolean);
  const imageUrl = $('#productImageUrl').value.trim();
  const image = imageUrl || A.imageValue;

  if (name.length < 2) return showProductError('Название должно быть не короче 2 символов');
  if (!Number.isFinite(price) || price <= 0) return showProductError('Укажите цену');
  if (!image) return showProductError('Добавьте фото товара');
  if (!colors.length) return showProductError('Укажите хотя бы один цвет');

  const body = {
    name,
    category: $('#productCategory').value,
    price,
    colors,
    sizes: sizes.length ? sizes : ['стандарт'],
    composition: $('#productComposition').value.trim(),
    description: $('#productDescription').value.trim(),
    image,
    inStock: $('#productInStock').checked,
    featured: $('#productFeatured').checked
  };

  if (errorEl) errorEl.hidden = true;
  submit.disabled = true;
  submit.textContent = 'Сохраняем…';

  try {
    if (A.editingProductId) {
      await adminFetch('/admin/products/' + encodeURIComponent(A.editingProductId), { method: 'PATCH', body });
    } else {
      await adminFetch('/admin/products', { method: 'POST', body });
    }
    closeAmodal('product');
    toast(A.editingProductId ? 'Товар обновлён' : 'Товар добавлен в каталог');
    await loadAll();
  } catch (err) {
    showProductError(err.message || 'Не удалось сохранить товар');
  } finally {
    submit.disabled = false;
    submit.textContent = 'Сохранить товар';
  }
}

function showProductError(message) {
  const errorEl = $('#productError');
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = false;
}

async function toggleStock(id, inStock) {
  try {
    await adminFetch('/admin/products/' + encodeURIComponent(id), { method: 'PATCH', body: { inStock: inStock } });
    const product = A.products.find((p) => p.id === id);
    if (product) product.inStock = inStock;
    toast(inStock ? 'Товар в наличии' : 'Товар скрыт как «нет в наличии»');
    renderStats();
  } catch (err) {
    toast(err.message || 'Не удалось обновить товар');
    renderProducts();
  }
}

async function deleteProduct(id) {
  const product = A.products.find((p) => p.id === id);
  if (!product) return;
  if (!confirm('Удалить товар «' + product.name + '»? Это действие необратимо.')) return;
  try {
    await adminFetch('/admin/products/' + encodeURIComponent(id), { method: 'DELETE' });
    toast('Товар удалён');
    await loadAll();
  } catch (err) {
    toast(err.message || 'Не удалось удалить товар');
  }
}

/* ------------------------------ заказы ------------------------------ */

function renderOrders() {
  const body = $('#ordersBody');
  const empty = $('#ordersEmpty');
  if (!body) return;

  const list = A.orders.filter((o) => A.orderFilter === 'all' || o.status === A.orderFilter);
  if (empty) empty.hidden = list.length > 0;

  body.innerHTML = list.map((order) => {
    const items = Array.isArray(order.items) ? order.items : [];
    const qty = items.reduce((n, it) => n + (Number(it.qty) || 0), 0);
    const summary = items.length === 1 ? items[0].name : items.length + ' ' + plural(items.length, ['товар', 'товара', 'товаров']);
    return (
      '<tr data-id="' + esc(order.id) + '">' +
      '<td><b>' + esc(order.id) + '</b></td>' +
      '<td class="muted">' + formatDate(order.createdAt, true) + '</td>' +
      '<td><b>' + esc(order.name) + '</b><br><span class="muted">' + esc(order.phone) + '</span></td>' +
      '<td>' + esc(summary) + '<br><span class="muted">' + qty + ' шт.</span></td>' +
      '<td class="price-cell">' + money(order.total) + '</td>' +
      '<td>' +
      '<select class="status-select" data-act="status">' +
      Object.keys(STATUS_LABELS).map((key) =>
        '<option value="' + key + '"' + (order.status === key ? ' selected' : '') + '>' + STATUS_LABELS[key] + '</option>'
      ).join('') +
      '</select>' +
      '</td>' +
      '<td class="ta-r"><div class="row-actions">' +
      '<button class="act" data-act="view" type="button" aria-label="Детали"><svg class="ic"><use href="#i-edit"/></svg></button>' +
      '<button class="act act--danger" data-act="del" type="button" aria-label="Удалить"><svg class="ic"><use href="#i-trash"/></svg></button>' +
      '</div></td></tr>'
    );
  }).join('');
}

function plural(n, forms) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

async function changeOrderStatus(id, status) {
  try {
    await adminFetch('/admin/orders/' + encodeURIComponent(id), { method: 'PATCH', body: { status: status } });
    const order = A.orders.find((o) => o.id === id);
    if (order) order.status = status;
    toast('Статус обновлён: ' + STATUS_LABELS[status]);
    renderStats();
  } catch (err) {
    toast(err.message || 'Не удалось обновить статус');
    renderOrders();
  }
}

async function deleteOrder(id) {
  if (!confirm('Удалить заказ ' + id + '?')) return;
  try {
    await adminFetch('/admin/orders/' + encodeURIComponent(id), { method: 'DELETE' });
    toast('Заказ удалён');
    await loadAll();
  } catch (err) {
    toast(err.message || 'Не удалось удалить заказ');
  }
}

function openOrderDetails(id) {
  const order = A.orders.find((o) => o.id === id);
  if (!order) return;

  const items = Array.isArray(order.items) ? order.items : [];
  const phoneDigits = digitsOnly(order.phone);
  const waText = encodeURIComponent(
    'Здравствуйте, ' + order.name + '! Это jumshak.rooms по заказу ' + order.id + '. Подскажите, всё в силе? 🦋'
  );

  $('#orderModalTitle').textContent = 'Заказ ' + order.id;

  const detail = $('#orderDetail');
  detail.innerHTML =
    '<div class="od-head">' + statusBadge(order.status) + '<span class="muted">' + formatDate(order.createdAt, true) + '</span></div>' +
    '<div class="od-grid">' +
    '<div><b>Клиент</b>' + esc(order.name) + '</div>' +
    '<div><b>Телефон</b>' + esc(order.phone) + '</div>' +
    '<div><b>Город</b>' + (esc(order.city) || '—') + '</div>' +
    '<div><b>Адрес</b>' + (esc(order.address) || '—') + '</div>' +
    '</div>' +
    (order.comment ? '<div class="od-comment"><b>Комментарий:</b> ' + esc(order.comment) + '</div>' : '') +
    '<div class="od-items">' +
    items.map((item) =>
      '<div class="od-item">' +
      '<img src="' + imgSrc(item.image) + '" alt="">' +
      '<div class="od-item__main"><b>' + esc(item.name) + '</b><span>' +
      esc([item.color ? 'цвет: ' + item.color : '', item.size ? 'размер: ' + item.size : '', item.qty + ' шт.'].filter(Boolean).join(' · ')) +
      '</span></div>' +
      '<span class="od-item__sum">' + money(item.sum || item.price * item.qty) + '</span>' +
      '</div>'
    ).join('') +
    '</div>' +
    '<div class="od-total"><span>итого</span><b>' + money(order.total) + '</b></div>' +
    '<div class="od-actions">' +
    (phoneDigits ? '<a class="btn btn--light" href="https://wa.me/' + phoneDigits + '?text=' + waText + '" target="_blank" rel="noopener"><svg class="ic"><use href="#i-wa"/></svg> Написать клиенту</a>' : '') +
    '<button class="btn btn--dark" type="button" data-close="order">Закрыть</button>' +
    '</div>';

  openAmodal('order');
}

/* ------------------------------ настройки ------------------------------ */

function renderSettings() {
  const s = A.settings || {};
  $('#setWhatsapp').value = s.whatsapp || '';
  $('#setInstagram').value = s.instagram || '';
  $('#setCity').value = s.city || '';
  $('#setDelivery').value = s.deliveryNote || '';
  renderReviewsEditor(Array.isArray(s.reviews) ? s.reviews : []);
}

function renderReviewsEditor(reviews) {
  const box = $('#reviewsEditor');
  if (!box) return;
  if (!reviews.length) {
    box.innerHTML = '<p class="muted" style="font-size:12px">Отзывов пока нет — добавьте первый.</p>';
    return;
  }
  box.innerHTML = reviews.map((review, index) => {
    const rating = Math.max(1, Math.min(5, Math.round(Number(review.rating) || 5)));
    return (
      '<div class="review-edit" data-index="' + index + '">' +
      '<button class="review-edit__remove" data-act="del-review" type="button" aria-label="Удалить отзыв"><svg class="ic"><use href="#i-close"/></svg></button>' +
      '<div class="review-edit__row">' +
      '<div class="field"><label>Имя</label><input type="text" data-field="name" maxlength="60" value="' + esc(review.name || '') + '"></div>' +
      '<div class="field"><label>Оценка</label><select data-field="rating">' +
      [5, 4, 3, 2, 1].map((n) => '<option value="' + n + '"' + (n === rating ? ' selected' : '') + '>' + n + ' ★</option>').join('') +
      '</select></div>' +
      '</div>' +
      '<div class="field"><label>Текст отзыва</label><textarea rows="2" data-field="text" maxlength="400">' + esc(review.text || '') + '</textarea></div>' +
      '</div>'
    );
  }).join('');
}

function collectReviews() {
  return $$('.review-edit').map((row) => ({
    name: ($('[data-field="name"]', row) || {}).value || 'Гостья',
    text: ($('[data-field="text"]', row) || {}).value || '',
    rating: Number(($('[data-field="rating"]', row) || {}).value || 5)
  })).filter((r) => r.text.trim().length > 0);
}

async function onSettingsSubmit(event) {
  event.preventDefault();
  const submit = $('#settingsSubmit');
  const body = {
    whatsapp: $('#setWhatsapp').value.trim(),
    instagram: $('#setInstagram').value.trim(),
    city: $('#setCity').value.trim(),
    deliveryNote: $('#setDelivery').value.trim(),
    reviews: collectReviews()
  };

  submit.disabled = true;
  submit.textContent = 'Сохраняем…';
  try {
    const data = await adminFetch('/admin/settings', { method: 'PUT', body });
    A.settings = data.settings || A.settings;
    renderSettings();
    toast('Настройки сохранены');
  } catch (err) {
    toast(err.message || 'Не удалось сохранить настройки');
  } finally {
    submit.disabled = false;
    submit.textContent = 'Сохранить настройки';
  }
}

async function onPasswordSubmit(event) {
  event.preventDefault();
  const current = $('#pwdCurrent').value;
  const next = $('#pwdNew').value;
  const submit = $('#pwdSubmit');

  if (next.length < 8) {
    toast('Новый пароль — минимум 8 символов');
    return;
  }
  submit.disabled = true;
  submit.textContent = 'Обновляем…';
  try {
    const data = await adminFetch('/admin/password', {
      method: 'PUT',
      body: { current: current, newPassword: next }
    });
    if (data.token) {
      localStorage.setItem(TOKEN_KEY, data.token);
      A.token = data.token;
    }
    $('#pwdCurrent').value = '';
    $('#pwdNew').value = '';
    toast('Пароль обновлён — запомните его');
  } catch (err) {
    toast(err.message || 'Не удалось обновить пароль');
  } finally {
    submit.disabled = false;
    submit.textContent = 'Обновить пароль';
  }
}

/* ------------------------------ модалки/навигация ------------------------------ */

function openAmodal(name) {
  const modal = name === 'product' ? $('#productModalAdmin') : $('#orderModal');
  if (!modal) return;
  $$('.amodal.is-open').forEach((m) => { if (m !== modal) m.classList.remove('is-open'); });
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeAmodal(name) {
  const modal = name === 'product' ? $('#productModalAdmin') : $('#orderModal');
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function switchView(view) {
  $$('.side-nav__item').forEach((btn) => btn.classList.toggle('is-active', btn.getAttribute('data-view') === view));
  $$('.view').forEach((section) => { section.hidden = section.id !== 'view-' + view; });
  const titles = VIEW_TITLES[view] || VIEW_TITLES.dashboard;
  $('#viewTitle').textContent = titles[0];
  $('#viewSub').textContent = titles[1];
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ------------------------------ события ------------------------------ */

function bindEvents() {
  $('#loginForm').addEventListener('submit', onLogin);

  const toggle = $('#togglePwd');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const input = $('#loginPassword');
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      toggle.textContent = isPassword ? 'скрыть' : 'показать';
    });
  }

  $('#logoutBtn').addEventListener('click', () => logout(false));

  $$('.side-nav__item').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.getAttribute('data-view')));
  });
  $$('[data-goto]').forEach((el) => {
    el.addEventListener('click', () => switchView(el.getAttribute('data-goto')));
  });

  $('#addProduct').addEventListener('click', () => openProductModal(null));
  $('#productForm').addEventListener('submit', onProductSubmit);
  $('#productImageFile').addEventListener('change', onProductFileChange);
  $('#productImageUrl').addEventListener('input', (e) => {
    A.imageValue = e.target.value.trim();
    setPreview(A.imageValue);
  });

  const productsBody = $('#productsBody');
  productsBody.addEventListener('change', (e) => {
    const input = e.target.closest('input[data-act="stock"]');
    if (!input) return;
    const row = e.target.closest('tr');
    if (!row) return;
    toggleStock(row.getAttribute('data-id'), input.checked);
  });
  productsBody.addEventListener('click', (e) => {
    const action = e.target.closest('[data-act]');
    if (!action) return;
    const row = e.target.closest('tr');
    if (!row) return;
    const id = row.getAttribute('data-id');
    const act = action.getAttribute('data-act');
    if (act === 'edit') openProductModal(id);
    if (act === 'del') deleteProduct(id);
  });

  const ordersBody = $('#ordersBody');
  ordersBody.addEventListener('change', (e) => {
    const select = e.target.closest('select[data-act="status"]');
    if (!select) return;
    const row = e.target.closest('tr');
    if (!row) return;
    changeOrderStatus(row.getAttribute('data-id'), select.value);
  });
  ordersBody.addEventListener('click', (e) => {
    const action = e.target.closest('[data-act]');
    if (!action) return;
    const row = e.target.closest('tr');
    if (!row) return;
    const id = row.getAttribute('data-id');
    const act = action.getAttribute('data-act');
    if (act === 'view') openOrderDetails(id);
    if (act === 'del') deleteOrder(id);
  });

  $('#orderChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    $$('.chip', $('#orderChips')).forEach((c) => c.classList.remove('is-active'));
    chip.classList.add('is-active');
    A.orderFilter = chip.getAttribute('data-status');
    renderOrders();
  });

  $('#settingsForm').addEventListener('submit', onSettingsSubmit);
  $('#passwordForm').addEventListener('submit', onPasswordSubmit);

  $('#addReview').addEventListener('click', () => {
    const reviews = collectReviews();
    reviews.push({ name: 'Гостья', text: '', rating: 5 });
    A.settings.reviews = reviews;
    renderReviewsEditor(reviews);
  });

  $('#reviewsEditor').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act="del-review"]');
    if (!btn) return;
    const row = e.target.closest('.review-edit');
    if (!row) return;
    const reviews = collectReviews();
    reviews.splice(Number(row.getAttribute('data-index')), 1);
    A.settings.reviews = reviews;
    renderReviewsEditor(reviews);
  });

  $$('[data-close]').forEach((el) => {
    el.addEventListener('click', () => closeAmodal(el.getAttribute('data-close')));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    $$('.amodal.is-open').forEach((m) => closeAmodal(m.id === 'productModalAdmin' ? 'product' : 'order'));
  });
}

/* ------------------------------ запуск ------------------------------ */

function boot() {
  bindEvents();

  const today = $('#today');
  if (today) {
    today.textContent = new Date().toLocaleDateString('ru-RU', {
      weekday: 'long', day: 'numeric', month: 'long'
    });
  }

  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    A.token = token;
    showApp();
    loadAll();
  } else {
    showLogin();
  }
}

document.addEventListener('DOMContentLoaded', boot);
