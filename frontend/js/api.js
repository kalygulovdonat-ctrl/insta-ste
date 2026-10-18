'use strict';

/*
 * API-клиент JUMSHAK.
 * Ключ связи фронтенд получает с backend через GET /api/handshake,
 * после чего отправляет его с каждым запросом в заголовке X-API-Key.
 */

let gate = null;          // ключ связи с backend (получен по handshake)
let gatePromise = null;   // защита от параллельных запросов handshake

async function ensureGate() {
  if (gate) return gate;
  if (!gatePromise) {
    gatePromise = fetch(API_BASE + '/api/handshake')
      .then((r) => {
        if (!r.ok) throw new Error('handshake_' + r.status);
        return r.json();
      })
      .then((data) => {
        if (!data || !data.gate) throw new Error('handshake_no_gate');
        gate = data.gate;
        gatePromise = null;
        return gate;
      })
      .catch((e) => {
        gatePromise = null;
        throw new Error('Нет связи с сервером. Проверьте, что backend запущен.');
      });
  }
  return gatePromise;
}

/*
 * Универсальный запрос к API.
 * apiFetch('/products')                      -> GET
 * apiFetch('/orders', { method:'POST', body:{...} })
 * apiFetch('/admin/stats', { auth: true })   -> с токеном админа
 */
async function apiFetch(path, options) {
  options = options || {};
  const key = await ensureGate();
  const headers = { 'Content-Type': 'application/json', 'X-API-Key': key };
  if (options.auth) {
    const t = localStorage.getItem('jmsk_admin_session');
    if (t) headers['Authorization'] = 'Bearer ' + t;
  }

  let res;
  try {
    res = await fetch(API_BASE + '/api' + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });
  } catch (e) {
    throw new Error('Нет связи с сервером. Проверьте, что backend запущен.');
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }

  if (!res.ok || !data || data.ok === false) {
    const err = new Error((data && data.error) || 'Ошибка запроса (' + res.status + ')');
    err.status = res.status;
    throw err;
  }
  return data;
}

/* Быстрая проверка связи (для индикатора в админке) */
async function pingBackend() {
  await ensureGate();
  return apiFetch('/ping');
}
