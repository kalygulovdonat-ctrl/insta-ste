/*
 * Настройки подключения фронтенда к backend.
 *
 * API_BASE = '' — сайт открывается ЧЕРЕЗ backend (http://localhost:3000).
 *                Это основной режим: запустили `node backend/server.js`
 *                и открыли адрес из консоли.
 *
 * API_BASE = 'http://адрес-сервера' — если раздаёте папку frontend/
 *                отдельно (например, на GitHub Pages или Vercel),
 *                укажите здесь публичный адрес backend-сервера.
 *
 * Ключ связи (X-API-Key) в файлах не хранится: фронтенд получает его
 * у backend через GET /api/handshake при загрузке страницы
 * (см. js/api.js) и отправляет с каждым запросом.
 */
const API_BASE = '[https://insta-ste.onrender.com](https://insta-ste.onrender.com)';
