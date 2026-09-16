/* Sauti Salama shared UI helpers: icons, escaping, formatting, storage and toasts. */
(function () {
  const PATHS = {
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    phoneOff: '<path d="M10.7 13.3a16 16 0 0 0 3.4 2.6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-3.3-2.7"/><path d="M5.2 13.4A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8"/><path d="M22 2 2 22"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    mobile: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
    grid: '<circle cx="6" cy="5" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="18" cy="5" r="1"/><circle cx="6" cy="11" r="1"/><circle cx="12" cy="11" r="1"/><circle cx="18" cy="11" r="1"/><circle cx="6" cy="17" r="1"/><circle cx="12" cy="17" r="1"/><circle cx="18" cy="17" r="1"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v5"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    shieldCheck: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    child: '<circle cx="12" cy="6" r="3"/><path d="M9 21v-5l-2-1 1.5-5h7L17 15l-2 1v5"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    external: '<path d="M14 3h7v7"/><path d="M21 3l-9 9"/><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>',
    sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 17v4"/><path d="M17 19h4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    send: '<path d="m22 2-11 11"/><path d="m22 2-7 20-4-9-9-4z"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
    list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    quote: '<path d="M3 21c3 0 7-1 7-8V5c0-1.2-.8-2-2-2H4c-1.2 0-2 .8-2 2v6c0 1.2.8 2 2 2h3"/><path d="M14 21c3 0 7-1 7-8V5c0-1.2-.8-2-2-2h-4c-1.2 0-2 .8-2 2v6c0 1.2.8 2 2 2h3"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    flag: '<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 8 2a6 6 0 0 0 3.6-1.2 1 1 0 0 1 1.4.8V15a1 1 0 0 1-.4.8A6 6 0 0 1 16 17c-3 0-5-2-8-2a6 6 0 0 0-4 1.3"/>',
    languages: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
    delete: '<path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><path d="m18 9-6 6"/><path d="m12 9 6 6"/>',
  };

  const LOGO = '<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#5B2A86"/><path d="M9.5 9h13A2.5 2.5 0 0 1 25 11.5v7a2.5 2.5 0 0 1-2.5 2.5H16l-4.5 3.5V21h-2A2.5 2.5 0 0 1 7 18.5v-7A2.5 2.5 0 0 1 9.5 9z" fill="#fff"/><path d="M12 15h.01M14.5 13v4M17 12v6M19.5 14v2" stroke="#5B2A86" stroke-width="1.8" stroke-linecap="round"/></svg>';

  const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || ''}</svg>`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const titleCase = (s) => String(s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

  function ago(d) {
    const m = Math.round((Date.now() - new Date(d)) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    if (m < 1440) return `${Math.round(m / 60)} h ago`;
    return `${Math.round(m / 1440)} d ago`;
  }
  const time = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateTime = (d) => new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  // Storage can throw (private mode, blocked site data); never let that break the page.
  const store = {
    get(key, fallback = null, session = false) { try { const v = (session ? sessionStorage : localStorage).getItem(key); return v === null ? fallback : v; } catch { return fallback; } },
    set(key, value, session = false) { try { (session ? sessionStorage : localStorage).setItem(key, value); } catch { /* ignore */ } },
    remove(key, session = false) { try { (session ? sessionStorage : localStorage).removeItem(key); } catch { /* ignore */ } },
  };

  function toast(message, tone = 'info', ms = 4500) {
    let host = document.getElementById('toasts');
    if (!host) { host = document.createElement('div'); host.id = 'toasts'; host.className = 'toasts'; host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
    const el = document.createElement('div');
    el.className = `toast ${tone}`;
    el.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    el.innerHTML = `${icon(tone === 'ok' ? 'checkCircle' : tone === 'error' ? 'alert' : 'info')}<div>${esc(message)}</div><button type="button" aria-label="Dismiss">${icon('x', 'sm')}</button>`;
    const close = () => el.remove();
    el.querySelector('button').onclick = close;
    host.appendChild(el);
    if (ms) setTimeout(close, ms);
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  }

  window.UI = { icon, LOGO, esc, titleCase, ago, time, dateTime, store, toast, copyText };
})();
