'use strict';

/* =========================================================
   JUMSHAK.ROOMS — логика сайта
   каталог, корзина, избранное, оформление заказа → WhatsApp
   ========================================================= */

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

const CATEGORY_LABELS = {
  cardigans: 'кардиганы',
  knits: 'кофточки',
  longsleeves: 'лонгсливы',
  shirts: 'рубашки',
  other: 'другое'
};

const COLOR_HEX = {
  'молочный': '#F1E9DA',
  'белый': '#FBF8F2',
  'кремовый': '#F3EAD8',
  'светло-бежевый': '#EADFCB',
  'бежевый': '#DCC7A9',
  'тауп': '#B49C8C',
  'коричневый': '#8A6A4F',
  'тёмно-коричневый': '#5B4536',
  'серый': '#A7A49E',
  'тёмно-серый': '#5A5852',
  'чёрный': '#2B2A28',
  'красный': '#B7332C',
  'тёмно-синий': '#2C3A5A',
  'синий': '#3E5C86',
  'розовый': '#D9A6A6',
  'зелёный': '#7C8B6F'
};

const PLACEHOLDER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><rect width="300" height="400" fill="#F0E8D9"/>' +
  '<g fill="none" stroke="#C9B79E" stroke-width="3"><path d="M150 190c-7-22-40-38-62-23-21 15-8 47 37 60-45 13-58 45-37 60 22 15 55-1 62-23 7 22 40 38 62 23 21-15 8-47-37-60 45-13 58-45 37-60-22-15-55 1-62 23Z"/>' +
  '<path d="M150 190v78"/></g></svg>'
);

const state = {
  products: [],
  settings: null,
  cart: [],
  favs: [],
  category: 'all',
  query: '',
  currentProduct: null,
  pmColor: '',
  pmQty: 1,
  waRedirectTimer: null
};

const CART_KEY = 'jmsk_cart_v1';
const FAV_KEY = 'jmsk_favs_v1';

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
  if (!url) return PLACEHOLDER;
  if (/^(https?:|data:)/.test(url)) return url;
  if (url.charAt(0) === '/') return (typeof API_BASE === 'string' ? API_BASE : '') + url;
  return url;
}

function storageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : fallback;
  } catch (e) {
    return fallback;
  }
}

function storageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
}

function colorDot(color) {
  const hex = COLOR_HEX[color] || '#D9CBB8';
  return '<i style="background:' + hex + '" title="' + esc(color) + '"></i>';
}

function waLink(text) {
  const digits = state.settings && state.settings.whatsapp ? String(state.settings.whatsapp).replace(/\D/g, '') : '';
  if (!digits) return '#';
  return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(text || 'Здравствуйте! Пишу с сайта jumshak.rooms 🦋');
}

function igLink() {
  const handle = state.settings && state.settings.instagram ? String(state.settings.instagram).replace(/^@+/, '') : 'jumshak.rooms';
  return 'https://www.instagram.com/' + handle + '/';
}

function setTrailingText(el, text) {
  if (!el) return;
  for (let i = el.childNodes.length - 1; i >= 0; i--) {
    const node = el.childNodes[i];
    if (node.nodeType === 3 && node.textContent.trim()) {
      node.textContent = ' ' + text;
      return;
    }
  }
  el.insertAdjacentText('beforeend', ' ' + text);
}

function findProduct(id) {
  return state.products.find((p) => p.id === id);
}

/* ------------------------------ тосты ------------------------------ */

let toastTimer = null;
function toast(message) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3200);
}

/* ------------------------------ корзина ------------------------------ */

function cartKey(item) {
  return item.productId + '|' + item.color + '|' + item.size;
}

function addToCart(product, color, size, qty) {
  if (!product) return;
  const item = {
    productId: product.id,
    color: color || '',
    size: size || 'стандарт',
    qty: Math.min(20, Math.max(1, qty || 1))
  };
  const idx = state.cart.findIndex((x) => cartKey(x) === cartKey(item));
  if (idx >= 0) {
    state.cart[idx].qty = Math.min(20, state.cart[idx].qty + item.qty);
  } else {
    state.cart.push(item);
  }
  persistCart();
  toast('Добавлено в корзину 🤍');
}

function persistCart() {
  storageSet(CART_KEY, state.cart);
  renderCart();
}

function cartTotal() {
  return state.cart.reduce((sum, item) => {
    const product = findProduct(item.productId);
    return sum + (product ? product.price * item.qty : 0);
  }, 0);
}

function cartCount() {
  return state.cart.reduce((n, item) => n + item.qty, 0);
}

function renderCart() {
  const list = $('#cartList');
  const totalEl = $('#cartTotal');
  const checkoutBtn = $('#cartCheckout');
  if (!list || !totalEl) return;

  const count = cartCount();
  const badge = $('#cartCount');
  if (badge) {
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }

  totalEl.textContent = money(cartTotal());
  if (checkoutBtn) checkoutBtn.disabled = count === 0;

  if (!state.cart.length) {
    list.innerHTML =
      '<div class="drawer-empty">' +
      '<svg class="ic"><use href="#i-butterfly"/></svg>' +
      '<h4>Пока пусто</h4>' +
      '<p>Добавьте что-нибудь нежное из каталога.</p>' +
      '<button class="btn btn--light" type="button" data-close="cart">В каталог</button>' +
      '</div>';
    return;
  }

  list.innerHTML = state.cart.map((item, index) => {
    const product = findProduct(item.productId);
    if (!product) return '';
    const meta = [item.color, item.size].filter(Boolean).map(esc).join(' · ');
    return (
      '<div class="cart-item" data-index="' + index + '">' +
      '<img class="cart-item__img" src="' + imgSrc(product.image) + '" alt="" loading="lazy">' +
      '<div class="cart-item__main">' +
      '<p class="cart-item__name">' + esc(product.name) + '</p>' +
      '<p class="cart-item__meta">' + meta + '</p>' +
      '<div class="cart-item__row">' +
      '<div class="qty qty--sm">' +
      '<button class="qty__btn" type="button" data-act="minus" aria-label="Меньше"><svg class="ic"><use href="#i-minus"/></svg></button>' +
      '<span>' + item.qty + '</span>' +
      '<button class="qty__btn" type="button" data-act="plus" aria-label="Больше"><svg class="ic"><use href="#i-plus"/></svg></button>' +
      '</div>' +
      '<b class="cart-item__price">' + money(product.price * item.qty) + '</b>' +
      '</div></div>' +
      '<button class="cart-item__remove" type="button" data-act="remove" aria-label="Удалить"><svg class="ic"><use href="#i-close"/></svg></button>' +
      '</div>'
    );
  }).join('');
}

function changeCartQty(index, delta) {
  const item = state.cart[index];
  if (!item) return;
  item.qty += delta;
  if (item.qty < 1) item.qty = 1;
  if (item.qty > 20) item.qty = 20;
  persistCart();
}

function removeCartItem(index) {
  state.cart.splice(index, 1);
  persistCart();
  toast('Удалено из корзины');
}

/* ------------------------------ избранное ------------------------------ */

function isFav(id) {
  return state.favs.indexOf(id) >= 0;
}

function toggleFav(id) {
  const idx = state.favs.indexOf(id);
  if (idx >= 0) {
    state.favs.splice(idx, 1);
    toast('Убрано из избранного');
  } else {
    state.favs.push(id);
    toast('Сохранено в избранное ❤');
  }
  storageSet(FAV_KEY, state.favs);
  renderCatalog();
  renderFavs();
}

function renderFavs() {
  const list = $('#favList');
  const foot = $('#favFoot');
  const badge = $('#favCount');
  if (!list) return;

  const count = state.favs.length;
  if (badge) {
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }
  if (foot) foot.hidden = count === 0;

  if (!count) {
    list.innerHTML =
      '<div class="drawer-empty">' +
      '<svg class="ic"><use href="#i-heart"/></svg>' +
      '<h4>Пока пусто</h4>' +
      '<p>Нажимайте на сердечко у вещей, которые понравились.</p>' +
      '<button class="btn btn--light" type="button" data-close="fav">Смотреть каталог</button>' +
      '</div>';
    return;
  }

  list.innerHTML = state.favs.map((id) => {
    const product = findProduct(id);
    if (!product) return '';
    return (
      '<div class="cart-item" data-id="' + esc(product.id) + '">' +
      '<img class="cart-item__img" src="' + imgSrc(product.image) + '" alt="" loading="lazy">' +
      '<div class="cart-item__main">' +
      '<p class="cart-item__name">' + esc(product.name) + '</p>' +
      '<p class="cart-item__meta">' + money(product.price) + '</p>' +
      '<div class="cart-item__row">' +
      '<button class="btn btn--light btn--sm" type="button" data-act="fav-cart">В корзину</button>' +
      '</div></div>' +
      '<button class="cart-item__remove" type="button" data-act="fav-remove" aria-label="Убрать"><svg class="ic"><use href="#i-close"/></svg></button>' +
      '</div>'
    );
  }).join('');
}

/* ------------------------------ каталог ------------------------------ */

function filteredProducts() {
  const query = state.query.trim().toLowerCase();
  return state.products
    .filter((p) => state.category === 'all' || p.category === state.category)
    .filter((p) => {
      if (!query) return true;
      const haystack = [p.name, p.description, p.composition, CATEGORY_LABELS[p.category] || ''].join(' ').toLowerCase();
      return haystack.indexOf(query) >= 0;
    })
    .sort((a, b) => {
      if (!!b.featured !== !!a.featured) return b.featured ? 1 : -1;
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
}

function renderCatalog() {
  const grid = $('#catalogGrid');
  const empty = $('#catalogEmpty');
  if (!grid) return;

  const items = filteredProducts();
  grid.innerHTML = items.map((p, index) => {
    const inStock = !!p.inStock;
    const colors = Array.isArray(p.colors) ? p.colors.slice(0, 4) : [];
    const sizes = Array.isArray(p.sizes) && p.sizes.length ? p.sizes.join(' · ') : 'стандарт';
    return (
      '<article class="card' + (inStock ? '' : ' card--out') + '" data-id="' + esc(p.id) + '" tabindex="0" role="button" aria-label="' + esc(p.name) + '" style="animation-delay:' + Math.min(index * 45, 420) + 'ms">' +
      '<div class="card__media">' +
      '<img src="' + imgSrc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy">' +
      '<span class="card__badge' + (inStock ? '' : ' card__badge--out') + '">' + (inStock ? 'в наличии' : 'нет в наличии') + '</span>' +
      '<button class="card__fav' + (isFav(p.id) ? ' is-active' : '') + '" type="button" data-act="fav" aria-label="В избранное"><svg class="ic"><use href="#i-heart"/></svg></button>' +
      '<div class="card__quick"><button class="btn btn--dark btn--sm" type="button" data-act="open" ' + (inStock ? '' : 'disabled') + '>' + (inStock ? 'Быстрый заказ' : 'Нет в наличии') + '</button></div>' +
      '</div>' +
      '<div class="card__body">' +
      '<p class="card__cat">' + esc(CATEGORY_LABELS[p.category] || p.category) + ' · ' + esc(sizes) + '</p>' +
      '<h3 class="card__name">' + esc(p.name) + '</h3>' +
      '<div class="card__bottom">' +
      '<span class="card__price">' + money(p.price) + '</span>' +
      '<span class="card__colors">' + colors.map(colorDot).join('') + '</span>' +
      '</div></div></article>'
    );
  }).join('');

  if (empty) empty.hidden = items.length > 0;
}

/* ------------------------------ карточка товара ------------------------------ */

function openProduct(id) {
  const product = findProduct(id);
  if (!product) return;

  state.currentProduct = product;
  state.pmColor = Array.isArray(product.colors) && product.colors.length ? product.colors[0] : '';
  state.pmQty = 1;

  $('#pmImage').src = imgSrc(product.image);
  $('#pmImage').alt = product.name;
  $('#pmCategory').textContent = CATEGORY_LABELS[product.category] || product.category;
  $('#pmName').textContent = product.name;
  $('#pmPrice').textContent = money(product.price);
  $('#pmDesc').textContent = product.description || '';
  $('#pmQty').textContent = '1';

  const compWrap = $('#pmCompositionWrap');
  if (compWrap) {
    compWrap.hidden = !product.composition;
    $('#pmComposition').textContent = product.composition || '';
  }

  const colorsWrap = $('#pmColorsWrap');
  const colorsBox = $('#pmColors');
  if (colorsWrap && colorsBox) {
    colorsWrap.hidden = !(product.colors && product.colors.length);
    colorsBox.innerHTML = (product.colors || []).map((c) =>
      '<button class="color-chip' + (c === state.pmColor ? ' is-active' : '') + '" type="button" data-color="' + esc(c) + '">' +
      '<i style="background:' + (COLOR_HEX[c] || '#D9CBB8') + '"></i>' + esc(c) + '</button>'
    ).join('');
  }

  const sizesEl = $('#pmSizes');
  if (sizesEl) {
    const sizes = Array.isArray(product.sizes) && product.sizes.length ? product.sizes : ['стандарт'];
    sizesEl.textContent = sizes.join(' · ') + (sizes.indexOf('стандарт') >= 0 ? ' · 42–48' : '');
  }

  const buyBtn = $('#pmBuy');
  const addBtn = $('#pmAdd');
  const out = !product.inStock;
  if (buyBtn) {
    buyBtn.disabled = out;
    buyBtn.innerHTML = out ? 'Нет в наличии' : 'Купить сейчас <svg class="ic"><use href="#i-arrow"/></svg>';
  }
  if (addBtn) addBtn.disabled = out;

  openModal('product');
}

/* ------------------------------ корзина → заказ ------------------------------ */

function openCheckout() {
  if (!state.cart.length) {
    toast('Корзина пуста — добавьте что-нибудь нежное');
    return;
  }
  closeDrawer('cart');
  closeModal('product');

  const summary = $('#coSummary');
  if (summary) {
    const count = cartCount();
    summary.innerHTML = '<span>' + count + ' ' + plural(count, ['вещь', 'вещи', 'вещей']) + ' в заказе</span><b>' + money(cartTotal()) + '</b>';
  }

  const success = $('#coSuccess');
  const form = $('#coForm');
  if (success) success.hidden = true;
  if (form) {
    form.hidden = false;
    const error = $('#coError');
    if (error) error.hidden = true;
  }

  openModal('checkout');
  setTimeout(() => {
    const first = $('#coName');
    if (first && !first.value) first.focus();
  }, 250);
}

function plural(n, forms) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

async function submitOrder(event) {
  event.preventDefault();
  const form = $('#coForm');
  const errorEl = $('#coError');
  const submitBtn = $('#coSubmit');

  const name = $('#coName').value.trim();
  const phone = $('#coPhone').value.trim();
  const city = $('#coCity').value.trim();
  const address = $('#coAddress').value.trim();
  const comment = $('#coComment').value.trim();

  if (name.length < 2) {
    showCheckoutError('Напишите, как к вам обращаться');
    return;
  }
  if (phone.replace(/\D/g, '').length < 9) {
    showCheckoutError('Проверьте номер телефона — нужно не меньше 9 цифр');
    return;
  }

  if (errorEl) errorEl.hidden = true;
  submitBtn.disabled = true;
  const initialLabel = submitBtn.innerHTML;
  submitBtn.textContent = 'Отправляем…';

  try {
    const data = await apiFetch('/orders', {
      method: 'POST',
      body: {
        name: name,
        phone: phone,
        city: city,
        address: address,
        comment: comment,
        items: state.cart.map((item) => ({ productId: item.productId, qty: item.qty, color: item.color, size: item.size }))
      }
    });

    const order = data.order || {};
    state.cart = [];
    persistCart();
    renderFavs();

    $('#coOrderId').textContent = 'Заказ № ' + (order.id || '') + ' · ' + money(order.total || 0);
    const waBtn = $('#coWa');
    if (waBtn) waBtn.href = data.whatsappUrl || waLink('Здравствуйте! Заказ с сайта jumshak.rooms');

    if (form) form.hidden = true;
    const success = $('#coSuccess');
    if (success) success.hidden = false;

    if (state.waRedirectTimer) clearTimeout(state.waRedirectTimer);
    if (data.whatsappUrl) {
      state.waRedirectTimer = setTimeout(() => {
        window.location.href = data.whatsappUrl;
      }, 2400);
    }
  } catch (err) {
    showCheckoutError(err.message || 'Не удалось оформить заказ. Попробуйте ещё раз или напишите в WhatsApp.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = initialLabel;
  }
}

function showCheckoutError(message) {
  const errorEl = $('#coError');
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = false;
}

/* ------------------------------ открытие/закрытие ------------------------------ */

function lockBody() {
  document.body.classList.add('is-locked');
}

function unlockBodyIfIdle() {
  const anyOpen = $$('.drawer.is-open, .modal.is-open').length > 0;
  if (!anyOpen) document.body.classList.remove('is-locked');
}

function openDrawer(name) {
  const drawer = name === 'cart' ? $('#cartDrawer') : $('#favDrawer');
  if (!drawer) return;
  const other = name === 'cart' ? $('#favDrawer') : $('#cartDrawer');
  if (other) other.classList.remove('is-open');
  drawer.classList.add('is-open');
  drawer.setAttribute('aria-hidden', 'false');
  lockBody();
}

function closeDrawer(name) {
  const drawer = name === 'cart' ? $('#cartDrawer') : $('#favDrawer');
  if (!drawer) return;
  drawer.classList.remove('is-open');
  drawer.setAttribute('aria-hidden', 'true');
  unlockBodyIfIdle();
}

function openModal(name) {
  const modal = name === 'product' ? $('#productModal') : $('#checkoutModal');
  if (!modal) return;
  $$('.modal.is-open').forEach((m) => { if (m !== modal) m.classList.remove('is-open'); });
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  lockBody();
}

function closeModal(name) {
  const modal = name === 'product' ? $('#productModal') : $('#checkoutModal');
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  if (name === 'checkout' && state.waRedirectTimer) {
    clearTimeout(state.waRedirectTimer);
    state.waRedirectTimer = null;
  }
  unlockBodyIfIdle();
}

/* ------------------------------ настройки и отзывы ------------------------------ */

function applySettings() {
  const settings = state.settings || {};

  const greeting = 'Здравствуйте! Пишу с сайта jumshak.rooms 🦋 Хочу узнать о наличии и доставке.';
  ['#headerWa', '#heroWa', '#fabWa', '#faqWa'].forEach((sel) => {
    const el = $(sel);
    if (el) el.href = waLink(greeting);
  });
  const contactsWa = $('#contactsWa');
  if (contactsWa) {
    contactsWa.href = waLink('Здравствуйте! Пишу с сайта jumshak.rooms 🦋 Хочу подобрать образ.');
  }

  ['#contactsIg', '#reviewsIg'].forEach((sel) => {
    const el = $(sel);
    if (el) el.href = igLink();
  });
  const igBtn = $('#contactsIg');
  if (igBtn && settings.instagram) setTrailingText(igBtn, '@' + String(settings.instagram).replace(/^@+/, ''));

  const city = $('#siteCity');
  if (city && settings.city) city.textContent = settings.city + ', Кыргызстан';

  const note = $('#deliveryNote');
  if (note && settings.deliveryNote) note.textContent = settings.deliveryNote;

  renderReviews();
}

function renderReviews() {
  const grid = $('#reviewsGrid');
  if (!grid) return;
  const reviews = (state.settings && Array.isArray(state.settings.reviews)) ? state.settings.reviews : [];
  if (!reviews.length) {
    grid.innerHTML = '<p class="section__sub">Скоро здесь появятся отзывы наших покупательниц 🤍</p>';
    return;
  }
  grid.innerHTML = reviews.slice(0, 6).map((review) => {
    const stars = Math.max(1, Math.min(5, Math.round(Number(review.rating) || 5)));
    return (
      '<article class="review">' +
      '<div class="review__stars">' + new Array(stars).fill('<svg class="ic"><use href="#i-star"/></svg>').join('') + '</div>' +
      '<p class="review__text">«' + esc(review.text) + '»</p>' +
      '<div class="review__author">' +
      '<span class="review__ava">' + esc((review.name || 'Гостья').charAt(0).toUpperCase()) + '</span>' +
      '<div><b>' + esc(review.name || 'Гостья') + '</b><span>покупательница Jumshak</span></div>' +
      '</div></article>'
    );
  }).join('');
}

/* ------------------------------ инициализация ------------------------------ */

function bindEvents() {
  // шапка
  window.addEventListener('scroll', () => {
    const header = $('#header');
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 12);
  }, { passive: true });

  const burger = $('#burger');
  const nav = $('#nav');
  if (burger && nav) {
    burger.addEventListener('click', () => {
      burger.classList.toggle('is-open');
      nav.classList.toggle('is-open');
    });
    $$('a', nav).forEach((a) => a.addEventListener('click', () => {
      burger.classList.remove('is-open');
      nav.classList.remove('is-open');
    }));
  }

  // корзина / избранное
  $('#cartBtn').addEventListener('click', () => { renderCart(); openDrawer('cart'); });
  $('#favBtn').addEventListener('click', () => { renderFavs(); openDrawer('fav'); });

  $$('[data-close]').forEach((el) => {
    el.addEventListener('click', () => {
      const target = el.getAttribute('data-close');
      if (target === 'cart' || target === 'fav') closeDrawer(target);
      else closeModal(target);
    });
  });

  // каталог
  const grid = $('#catalogGrid');
  if (grid) {
    grid.addEventListener('click', (e) => {
      const card = e.target.closest('.card');
      if (!card) return;
      const id = card.getAttribute('data-id');
      const action = e.target.closest('[data-act]');
      if (action && action.getAttribute('data-act') === 'fav') {
        e.stopPropagation();
        toggleFav(id);
        return;
      }
      if (action && action.getAttribute('data-act') === 'open') {
        e.stopPropagation();
        openProduct(id);
        return;
      }
      openProduct(id);
    });
    grid.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.card');
      if (!card) return;
      e.preventDefault();
      openProduct(card.getAttribute('data-id'));
    });
  }

  const chips = $('#chips');
  if (chips) {
    chips.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      $$('.chip', chips).forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      state.category = chip.getAttribute('data-cat');
      renderCatalog();
    });
  }

  const search = $('#searchInput');
  if (search) {
    search.addEventListener('input', () => {
      state.query = search.value;
      renderCatalog();
    });
  }

  const reset = $('#resetFilters');
  if (reset) {
    reset.addEventListener('click', () => {
      state.query = '';
      state.category = 'all';
      if (search) search.value = '';
      $$('.chip').forEach((c) => c.classList.toggle('is-active', c.getAttribute('data-cat') === 'all'));
      renderCatalog();
    });
  }

  // корзина: количество / удаление
  const cartList = $('#cartList');
  if (cartList) {
    cartList.addEventListener('click', (e) => {
      const itemEl = e.target.closest('.cart-item');
      if (!itemEl) return;
      const index = Number(itemEl.getAttribute('data-index'));
      const action = e.target.closest('[data-act]');
      if (!action) return;
      const act = action.getAttribute('data-act');
      if (act === 'plus') changeCartQty(index, 1);
      if (act === 'minus') changeCartQty(index, -1);
      if (act === 'remove') removeCartItem(index);
    });
  }

  $('#cartCheckout').addEventListener('click', () => {
    if (!state.cart.length) return;
    openCheckout();
  });

  // избранное: в корзину / убрать
  const favList = $('#favList');
  if (favList) {
    favList.addEventListener('click', (e) => {
      const itemEl = e.target.closest('.cart-item');
      if (!itemEl) return;
      const id = itemEl.getAttribute('data-id');
      const action = e.target.closest('[data-act]');
      if (!action) return;
      const act = action.getAttribute('data-act');
      const product = findProduct(id);
      if (!product) return;
      if (act === 'fav-remove') toggleFav(id);
      if (act === 'fav-cart') {
        if (!product.inStock) { toast('Этой вещи пока нет в наличии'); return; }
        addToCart(product, product.colors && product.colors[0], 'стандарт', 1);
        renderFavs();
      }
    });
  }

  // карточка товара
  const pmColors = $('#pmColors');
  if (pmColors) {
    pmColors.addEventListener('click', (e) => {
      const chip = e.target.closest('.color-chip');
      if (!chip) return;
      state.pmColor = chip.getAttribute('data-color');
      $$('.color-chip', pmColors).forEach((c) => c.classList.toggle('is-active', c === chip));
    });
  }

  $('#pmMinus').addEventListener('click', () => {
    state.pmQty = Math.max(1, state.pmQty - 1);
    $('#pmQty').textContent = String(state.pmQty);
  });
  $('#pmPlus').addEventListener('click', () => {
    state.pmQty = Math.min(20, state.pmQty + 1);
    $('#pmQty').textContent = String(state.pmQty);
  });

  $('#pmAdd').addEventListener('click', () => {
    if (!state.currentProduct) return;
    addToCart(state.currentProduct, state.pmColor, 'стандарт', state.pmQty);
  });

  $('#pmBuy').addEventListener('click', () => {
    if (!state.currentProduct) return;
    addToCart(state.currentProduct, state.pmColor, 'стандарт', state.pmQty);
    openCheckout();
  });

  // оформление
  $('#coForm').addEventListener('submit', submitOrder);

  // клавиши
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    $$('.drawer.is-open').forEach((d) => {
      closeDrawer(d.id === 'cartDrawer' ? 'cart' : 'fav');
    });
    $$('.modal.is-open').forEach((m) => {
      closeModal(m.id === 'productModal' ? 'product' : 'checkout');
    });
  });
}

function observeReveals() {
  const items = $$('.reveal:not(.in)');
  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('in'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  items.forEach((el) => observer.observe(el));
}

async function init() {
  state.cart = storageGet(CART_KEY, []);
  state.favs = storageGet(FAV_KEY, []);
  bindEvents();
  observeReveals();

  const year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear());

  // счётчики сразу, до загрузки каталога
  const initialQty = state.cart.reduce((n, item) => n + (item.qty || 1), 0);
  const cartBadge = $('#cartCount');
  if (cartBadge) { cartBadge.textContent = String(initialQty); cartBadge.hidden = initialQty === 0; }
  const favBadge = $('#favCount');
  if (favBadge) { favBadge.textContent = String(state.favs.length); favBadge.hidden = state.favs.length === 0; }

  const grid = $('#catalogGrid');
  if (grid) {
    grid.innerHTML =
      '<div class="empty" style="grid-column:1/-1">' +
      '<svg class="empty__ic"><use href="#i-butterfly"/></svg>' +
      '<p>Загружаем каталог…</p></div>';
  }

  try {
    const [settingsRes, productsRes] = await Promise.all([
      apiFetch('/settings'),
      apiFetch('/products')
    ]);
    state.settings = settingsRes.settings || {};
    state.products = Array.isArray(productsRes.products) ? productsRes.products : [];

    // чистим корзину и избранное от удалённых товаров
    state.cart = state.cart.filter((item) => !!findProduct(item.productId));
    state.favs = state.favs.filter((id) => !!findProduct(id));
    storageSet(CART_KEY, state.cart);
    storageSet(FAV_KEY, state.favs);

    applySettings();
    renderCatalog();
    renderCart();
    renderFavs();
    observeReveals();
  } catch (err) {
    if (grid) {
      grid.innerHTML =
        '<div class="empty" style="grid-column:1/-1">' +
        '<svg class="empty__ic"><use href="#i-butterfly"/></svg>' +
        '<h3>Каталог не загрузился</h3>' +
        '<p>' + esc(err.message || 'Проверьте, что backend запущен: node backend/server.js') + '</p>' +
        '<button class="btn btn--light" type="button" id="retryLoad">Попробовать снова</button>' +
        '</div>';
      const retry = $('#retryLoad');
      if (retry) retry.addEventListener('click', () => window.location.reload());
    }
  }
}

document.addEventListener('DOMContentLoaded', init);
