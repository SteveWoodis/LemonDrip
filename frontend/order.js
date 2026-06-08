// Buyer ordering flow for geo-delivery.
// Steps: Menu → Checkout (Stripe) → Location → Confirmation

(function () {
  'use strict';

  const API = '';  // same-origin

  // ── State ────────────────────────────────────────────────────────
  let eventToken   = null;
  let eventData    = null;
  let menuItems    = [];
  let cart         = {};   // { itemId: qty }
  let currentStep  = 1;
  let currentOrderId = null;
  let stripeInstance = null;
  let stripeElements = null;

  // ── Init ─────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    eventToken = params.get('event');

    // Check if we're returning from Stripe redirect (step=location)
    const step = params.get('step');
    currentOrderId = params.get('order') ? Number(params.get('order')) : null;

    if (!eventToken) {
      showError('Invalid link', 'No event token found in this URL.');
      return;
    }

    loadMenu().then(() => {
      if (step === 'location' && currentOrderId) {
        goToStep(3);
      }
    });

    // Buttons
    document.getElementById('checkoutBtn').addEventListener('click', goToCheckout);
    document.getElementById('payBtn').addEventListener('click', submitPayment);
    document.getElementById('shareLocationBtn').addEventListener('click', shareLocation);
    document.getElementById('skipLocationBtn').addEventListener('click', () => submitLocation(null, null));
  });

  // ── Helpers ──────────────────────────────────────────────────────
  function fmt(cents) {
    return '$' + (cents / 100).toFixed(2);
  }

  function showError(title, msg) {
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('appShell').style.display = 'none';
    document.getElementById('errorScreen').style.display = 'block';
    document.getElementById('errorTitle').textContent = title;
    document.getElementById('errorMsg').textContent   = msg;
  }

  function goToStep(n) {
    currentStep = n;
    // Update step indicators
    for (let i = 1; i <= 4; i++) {
      const el = document.getElementById('step' + i);
      el.classList.remove('active', 'done');
      if (i === n) el.classList.add('active');
      else if (i < n) el.classList.add('done');
    }
    // Show the right screen
    const screens = ['menuScreen','checkoutScreen','locationScreen','confirmScreen'];
    screens.forEach((id, idx) => {
      const el = document.getElementById(id);
      el.classList.toggle('active', idx + 1 === n);
    });
    window.scrollTo(0, 0);
  }

  // ── Step 1: Menu ─────────────────────────────────────────────────
  async function loadMenu() {
    try {
      const res  = await fetch(`${API}/api/pub/menu/${eventToken}`);
      const data = await res.json();

      if (!res.ok) {
        showError('Event not found', data.error || 'This event may have ended.');
        return;
      }

      eventData = data.event;
      menuItems = data.items;

      document.getElementById('headerEventName').textContent = eventData.eventName || 'Order';
      document.getElementById('headerEventSub').textContent  = eventData.eventLocation || '';

      document.getElementById('loadingScreen').style.display = 'none';
      document.getElementById('appShell').style.display      = 'block';

      renderMenu();
    } catch (err) {
      showError('Could not load menu', 'Please check your connection and try again.');
    }
  }

  function renderMenu() {
    const list = document.getElementById('menuList');
    if (!menuItems.length) {
      list.innerHTML = '<p style="color:#64748b;text-align:center;padding:40px 0">No items on the menu yet.</p>';
      return;
    }
    list.innerHTML = menuItems.map(item => `
      <div class="menu-item" data-id="${item.id}">
        <div class="menu-item-info">
          <div class="menu-item-name">${esc(item.name)}</div>
          ${item.description ? `<div class="menu-item-desc">${esc(item.description)}</div>` : ''}
          <div class="menu-item-price">${fmt(item.priceCents)}</div>
        </div>
        <div class="qty-control">
          <button class="qty-btn" onclick="window._qtyChange(${item.id}, -1)">−</button>
          <span class="qty-num" id="qty-${item.id}">0</span>
          <button class="qty-btn" onclick="window._qtyChange(${item.id}, 1)">+</button>
        </div>
      </div>
    `).join('');
  }

  window._qtyChange = function (itemId, delta) {
    const current = cart[itemId] || 0;
    const next    = Math.max(0, current + delta);
    if (next === 0) delete cart[itemId];
    else cart[itemId] = next;

    const el = document.getElementById('qty-' + itemId);
    if (el) el.textContent = next;

    updateCartBar();
  };

  function cartTotals() {
    let count = 0;
    let cents = 0;
    for (const [id, qty] of Object.entries(cart)) {
      const item = menuItems.find(m => m.id === Number(id));
      if (item) {
        count += qty;
        cents += item.priceCents * qty;
      }
    }
    return { count, cents };
  }

  function updateCartBar() {
    const { count, cents } = cartTotals();
    const bar = document.getElementById('cartBar');
    bar.classList.toggle('visible', count > 0);
    document.getElementById('cartSummaryText').textContent = `${count} item${count !== 1 ? 's' : ''}`;
    document.getElementById('cartTotalText').textContent   = fmt(cents);
  }

  // ── Step 2: Checkout ─────────────────────────────────────────────
  async function goToCheckout() {
    const { count, cents } = cartTotals();
    if (count === 0) return;

    // Render order summary
    const lines = Object.entries(cart).map(([id, qty]) => {
      const item = menuItems.find(m => m.id === Number(id));
      return `<div class="summary-line">
        <span>${esc(item.name)} × ${qty}</span>
        <span>${fmt(item.priceCents * qty)}</span>
      </div>`;
    }).join('');
    document.getElementById('orderSummary').innerHTML = `
      <h3>Your order</h3>
      ${lines}
      <div class="summary-line total"><span>Total</span><span>${fmt(cents)}</span></div>
    `;

    goToStep(2);
    document.getElementById('payBtn').disabled = true;
    document.getElementById('payment-message').textContent = '';

    try {
      const items = Object.entries(cart).map(([id, qty]) => ({ id: Number(id), qty }));
      const res   = await fetch(`${API}/api/pub/menu/${eventToken}/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payment setup failed');

      currentOrderId = data.orderId;

      // Load Stripe.js dynamically
      await loadStripeJs();
      stripeInstance = Stripe(data.publishableKey);  // eslint-disable-line no-undef

      stripeElements = stripeInstance.elements({
        clientSecret: data.clientSecret,
        appearance: { theme: 'stripe' },
      });
      const pe = stripeElements.create('payment');
      pe.mount('#payment-element');

      document.getElementById('payBtn').disabled = false;
    } catch (err) {
      document.getElementById('payment-message').textContent = err.message;
      document.getElementById('payBtn').disabled = false;
    }
  }

  function loadStripeJs() {
    return new Promise((resolve, reject) => {
      if (window.Stripe) return resolve();
      const s = document.createElement('script');
      s.src = 'https://js.stripe.com/v3/';
      s.onload  = resolve;
      s.onerror = () => reject(new Error('Could not load Stripe'));
      document.head.appendChild(s);
    });
  }

  async function submitPayment() {
    const btn = document.getElementById('payBtn');
    const msg = document.getElementById('payment-message');
    btn.disabled = true;
    btn.textContent = 'Processing…';
    msg.textContent = '';

    try {
      const returnUrl = `${window.location.origin}/order.html?event=${eventToken}&order=${currentOrderId}&step=location`;
      const { error } = await stripeInstance.confirmPayment({
        elements: stripeElements,
        confirmParams: { return_url: returnUrl },
      });
      // If we reach here, Stripe didn't redirect — it means an error
      if (error) throw new Error(error.message);
    } catch (err) {
      msg.textContent = err.message;
      btn.disabled = false;
      btn.textContent = 'Pay now';
    }
  }

  // ── Step 3: Location ─────────────────────────────────────────────
  async function shareLocation() {
    const btn = document.getElementById('shareLocationBtn');
    btn.disabled = true;
    btn.textContent = 'Getting location…';

    if (!navigator.geolocation) {
      await submitLocation(null, null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await submitLocation(pos.coords.latitude, pos.coords.longitude);
      },
      async () => {
        // Denied or failed — continue without location
        await submitLocation(null, null);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function submitLocation(lat, lng) {
    try {
      const body = { lat, lng };
      await fetch(`${API}/api/pub/orders/${currentOrderId}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (_) {
      // Non-fatal — move to confirmation regardless
    }
    showConfirmation();
  }

  // ── Step 4: Confirmation ─────────────────────────────────────────
  function showConfirmation() {
    goToStep(4);

    // Build order summary for confirmation card
    const lines = Object.entries(cart).map(([id, qty]) => {
      const item = menuItems.find(m => m.id === Number(id));
      return `<div class="confirm-line"><span>${esc(item.name)} × ${qty}</span><span>${fmt(item.priceCents * qty)}</span></div>`;
    }).join('');

    const { cents } = cartTotals();
    document.getElementById('confirmCard').innerHTML = `
      <h3>Order #${currentOrderId}</h3>
      ${lines}
      <div class="confirm-line" style="font-weight:700;border-top:1px solid #f1f5f9;margin-top:8px;padding-top:10px">
        <span>Total</span><span>${fmt(cents)}</span>
      </div>
    `;

    // Hide cart bar
    document.getElementById('cartBar').classList.remove('visible');
  }

  // ── XSS helper ───────────────────────────────────────────────────
  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
