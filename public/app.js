import {profiles, threshold, scoreVersion} from './scoring.js';
import {aisles, products} from './catalog.js';
import {quote, freeAt, maxQuantity, pinPattern} from './commerce.js';

const $ = (selector, root = document) => root.querySelector(selector);
const images = id => byId.get(id)?.image;
const pageSize = 24;
let productLimit = pageSize;

const money = value => '₹' + value.toLocaleString('en-IN');
const byId = new Map(products.map(item => [item.id, item]));
const panel = $('#panel');
const body = $('#panel-body');
const search = $('#search');
const stored = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem('millo-' + key)) ?? fallback; }
  catch { return fallback; }
};
const save = (key, value) => {
  try { localStorage.setItem('millo-' + key, JSON.stringify(value)); } catch {}
};
const cart = Object.fromEntries(Object.entries(stored('cart', {})).filter(([id, quantity]) =>
  byId.has(id) && byId.get(id).score.qualified === true && Number.isFinite(byId.get(id).price) && Number.isInteger(quantity) && quantity > 0 && quantity <= maxQuantity));
const favorites = new Set(stored('favorites', []));
let place = stored('place', '');
let orders = stored('orders', []);
let retry = stored('retry', null);
let aisle = 'all';
let filter = 'all';
let currentPanel = '';
let selectedProduct = '';
let pending = false;
let lastFocus;
let toastTimer;

const paths = {
  pin:'<path d="M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/>',
  search:'<circle cx="10.8" cy="10.8" r="6.4"/><path d="m16 16 4 4"/>',
  bag:'<path d="M5 8h14l1 12H4L5 8Z"/><path d="M9 10V7a3 3 0 1 1 6 0v3"/>',
  heart:'<path d="M12 20s-8-4.9-8-10a4.5 4.5 0 0 1 8-2.1A4.5 4.5 0 0 1 20 10c0 5.1-8 10-8 10Z"/>',
  close:'<path d="m7 7 10 10M17 7 7 17"/>',
  receipt:'<path d="M6 4h12v16l-3-1.5-3 1.5-3-1.5L6 20V4Z"/><path d="M9 9h6m-6 4h6"/>'
};
const icon = name => '<span data-icon="' + name + '" aria-hidden="true"><svg viewBox="0 0 24 24">' + paths[name] + '</svg></span>';
document.querySelectorAll('[data-icon]').forEach(node => { node.outerHTML = icon(node.dataset.icon); });

const pastedText = document.createElement('textarea');
function escape(value) {
  pastedText.textContent = String(value);
  return pastedText.innerHTML.replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function notify(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  toastTimer = setTimeout(() => { $('#toast').textContent = ''; }, 2600);
}

const motifs = [
  '<path d="M20 3v34M3 20h34M8 8l24 24M8 32 32 8"/>',
  '<path d="M22 2 8 22h12l-2 16 14-22H21z"/>',
  '<circle cx="20" cy="20" r="8"/><path d="M20 2v5m0 26v5M2 20h5m26 0h5M7 7l4 4m18 18 4 4M7 33l4-4m18-18 4-4"/>',
  '<path d="M7 34C5 17 15 5 34 6c1 19-11 30-27 28Zm0 0L28 12M16 26v-9m0 9h9"/>',
  '<path d="M20 3C15 11 8 18 8 25a12 12 0 0 0 24 0c0-7-7-14-12-22Z"/><path d="M14 25c0 3 2 6 5 7"/>'
];
function renderAisles() {
  $('#category-list').innerHTML = aisles.map(entry => `
    <button class="category" style="--aisle:${entry.color}" type="button" data-aisle="${entry.id}" aria-label="${entry.name}" aria-pressed="${entry.id === aisle}">
      <figure aria-hidden="true"><svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${motifs[entry.motif]}</svg></figure>
      <span>${entry.short}</span><small>${products.filter(item=>item.aisle===entry.id).length} products</small></button>`).join('');
}

function amountControl(item) {
  if (item.score.qualified !== true) return '<span class="browse-only">Browse only</span>';
  const quantity = cart[item.id] || 0;
  if (!quantity) return `<button type="button" class="add" data-change="${item.id}" data-delta="1" aria-label="Add ${escape(item.name)}">Add +</button>`;
  return `<div class="stepper"><button type="button" data-change="${item.id}" data-delta="-1" aria-label="Remove one ${escape(item.name)}">−</button><span aria-label="Quantity">${quantity}</span><button type="button" data-change="${item.id}" data-delta="1" aria-label="Add one ${escape(item.name)}" ${quantity >= maxQuantity ? 'disabled' : ''}>+</button></div>`;
}

function price(item) {
  return `<span class="price"><b>${money(item.price)}</b><small>demo</small></span>`;
}
function productPhoto(item, options = {}) {
  if (item.image) {
    const classes = options.panel ? ' class="panel-photo ' + (item.whole ? 'is-fresh' : '') + '"' : '';
    const loading = options.panel ? '' : ' loading="lazy" decoding="async"';
    return `<img${classes} src="${escape(images(item.id))}" alt="${options.panel ? escape(item.name) : ''}"${loading}>`;
  }
  if (options.cart) return '<span class="cart-photo-empty" aria-hidden="true"></span>';
  return `<span class="product-no-photo ${options.panel ? 'panel-no-photo' : ''}"><span>Photo pending</span></span>`;
}
function productMarkup(item) {
  const badge = item.score.value === null ? '<span class="product-badge pending">Score pending</span>' :
    `<span class="product-badge" aria-label="Healthy Product Score ${item.score.value} out of 100">${item.score.value}/100</span>`;
  return `<article class="product">
    <button class="product-asset ${item.whole ? 'is-fresh' : ''} ${item.image ? 'has-photo' : ''}" type="button" aria-label="View ${escape(item.name)}" data-product="${item.id}">${productPhoto(item)}${badge}</button>
    <button type="button" class="favorite" aria-label="Save ${escape(item.name)}" aria-pressed="${favorites.has(item.id)}" data-favorite="${item.id}">${icon('heart')}</button>
    <p class="brand">${escape(item.brand || 'Fresh produce')}</p>
    <h3><button type="button" data-product="${item.id}">${escape(item.name)}</button></h3><p class="size">${escape(item.size || 'Pack size unavailable')}</p>
    <div class="buy-row">${price(item)}${amountControl(item)}</div></article>`;
}
function renderProducts() {
  const query = search.value.trim().toLowerCase();
  const title = query ? 'Search results' : aisle === 'saved' ? 'Saved items' :
    aisles.find(entry => entry.id === aisle)?.name || 'Shop all groceries';
  $('#market-title').textContent = title;
  const visible = products.filter(item => {
    const matchesAisle = aisle === 'all' || item.aisle === aisle || (aisle === 'saved' && favorites.has(item.id));
    const searchable = [item.name,item.brand,item.barcode,item.ingredients,aisles.find(entry=>entry.id===item.aisle).name].join(' ').toLowerCase();
    const matchesQuery = query.split(/\s+/).every(word => searchable.includes(word));
    const matchesFilter = filter === 'all' || (filter === 'plant' && item.plant === true) ||
      (filter === 'budget' && Number.isFinite(item.price) && item.price < 150) ||
      (filter === 'qualified' && item.score.qualified === true);
    return matchesAisle && matchesQuery && matchesFilter;
  });
  const sorting = $('#sort').value;
  if (sorting === 'featured') visible.sort((a,b) => Number(Boolean(b.image)) - Number(Boolean(a.image)));
  if (sorting === 'low') visible.sort((a,b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  if (sorting === 'high') visible.sort((a,b) => (b.price ?? -1) - (a.price ?? -1));
  if (sorting === 'score') visible.sort((a,b) => (b.score.value ?? -1) - (a.score.value ?? -1));
  if (sorting === 'name') visible.sort((a,b) => a.name.localeCompare(b.name));
  $('#products').innerHTML = visible.length ? visible.slice(0,productLimit).map(productMarkup).join('') :
    '<p class="empty">' + (aisle === 'saved' && !favorites.size ? 'Tap the heart on a product to save it here.' : 'No groceries match these filters.') + '</p>';
  const count = visible.length + (visible.length === 1 ? ' product' : ' products');
  $('#results').textContent = count;
  $('#visible-count').textContent = visible.length > productLimit ? 'Showing ' + productLimit + ' of ' + count : count;
  $('#load-more').hidden = visible.length <= productLimit;
}
function updateHeader() {
  $('#cart-count').textContent = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
  $('#location-label').textContent = place ? 'PIN ' + place : 'Set your location';
  $('#favorite-view').setAttribute('aria-pressed', String(aisle === 'saved'));
}

let restoringRoute = false;
const browseState = () => ({aisle,filter,query:search.value,sort:$('#sort').value,limit:productLimit});
function currentRoute() {
  return history.state?.millo === true ? history.state : {millo:true,index:0,depth:0,kind:'',product:'',browse:browseState()};
}
function saveRoute(route, push = false) {
  const url = productURL(route.kind === 'product' ? route.product : '');
  history[push ? 'pushState' : 'replaceState'](route, '', url);
  $('#browse-back').hidden = route.index === 0 || route.depth > 0;
}
function rememberBrowse() {
  if (!restoringRoute) saveRoute({...currentRoute(),browse:browseState()});
}
function previousPage() {
  if (pending) return;
  if (currentRoute().index > 0) history.back();
  else if (panel.open) close();
}

function selectAisle(next, scroll = true) {
  const oldRoute = currentRoute();
  const changed = aisle !== next || search.value !== '' || filter !== 'all';
  aisle = next;
  productLimit = pageSize;
  filter = 'all';
  search.value = '';
  renderAisles();
  updateFilters();
  updateHeader();
  renderProducts();
  if (!restoringRoute && changed) {
    saveRoute({...oldRoute,index:oldRoute.index + 1,depth:0,kind:'',product:'',browse:browseState()},true);
  }
  if (scroll) $('#market').scrollIntoView({block:'start'});
}

function updateFilters() {
  document.querySelectorAll('[data-filter]').forEach(button => {
    const active = button.dataset.filter === filter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function previousPageLabel(kind) {
  if (kind === 'checkout' && currentRoute().depth > 1) return '← Back to cart';
  if (kind === 'method' && selectedProduct) return '← Back to product';
  return currentRoute().depth > 1 ? '← Previous page' : '← Back to groceries';
}

function showPanel(kind, title, html, keepPosition = false) {
  const opening = !panel.open;
  const previous = currentRoute();
  const targetProduct = kind === 'product' ? selectedProduct : '';
  if (!restoringRoute && !keepPosition && (previous.kind !== kind || (kind === 'product' && previous.product !== targetProduct))) {
    const completedCheckout = kind === 'confirmation' && previous.kind === 'checkout';
    saveRoute({...previous,index:previous.index + (completedCheckout ? 0 : 1),
      depth:previous.depth + (completedCheckout ? 0 : 1),
      kind,product:selectedProduct,browse:browseState()},!completedCheckout);
  }
  $('#panel-back').textContent = previousPageLabel(kind);
  if (opening) lastFocus = document.activeElement;
  currentPanel = kind;
  $('#panel-title').textContent = title;
  body.innerHTML = html;
  if (!keepPosition) panel.scrollTop = 0;
  if (opening) panel.showModal();
  if (!keepPosition) $('.close-panel', panel).focus();
}

const missing = value => value === null || value === undefined || value === '' ? 'Unavailable' : escape(Array.isArray(value) ? value.join(', ') : value);
const link = (url,label) => /^https:\/\//.test(url || '') ?
  `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>` : '';
const rows = data => data.map(([key,value]) => `<tr><th scope="row">${key}</th><td>${value}</td></tr>`).join('');
const table = data => `<table class="label-data"><tbody>${rows(data)}</tbody></table>`;
const nutritionFields = [
  ['Energy','energy','kcal'],['Protein','protein','g'],['Carbohydrates','carbohydrates','g'],
  ['Total sugar','totalSugar','g'],['Added sugar','addedSugar','g'],['Total fat','fat','g'],
  ['Saturated fat','saturatedFat','g'],['Fibre','fibre','g'],['Sodium','sodium','mg']
];
function productURL(id) {
  const url = new URL(location.href);
  if (id) url.searchParams.set('product',id);
  else url.searchParams.delete('product');
  return url;
}
function scoreBox(item) {
  const score = item.score;
  const value = score.value === null ?
    `<strong>Pending</strong><p class="note">Available evidence covers ${score.evidence}/100 weighted points. Missing values stay unknown.</p>` :
    `<strong>${score.value}/100</strong><p class="note">${score.qualified ? 'Meets' : 'Below'} Millo’s ${threshold}-point threshold for this aisle.</p>`;
  return `<div class="score-box"><h3>Healthy Product Score</h3>${value}<details><summary>View all seven criteria</summary>
    ${table(score.lines.map(line => [line.name,line.points === null ? 'Unknown · ' + line.max + ' possible' : line.points + ' / ' + line.max]))}</details>
    <button type="button" class="text-link" data-view="method">Read the scoring method</button></div>`;
}
function showProduct(id,keepPosition = false) {
  const item = byId.get(id);
  if (!item) return;
  selectedProduct = id;
  const aisleName = aisles.find(entry=>entry.id===item.aisle).name;
  const nutrition = nutritionFields.map(([label,key,unit]) => [label, Number.isFinite(item.nutrition?.[key]) ?
    item.nutrition[key].toLocaleString('en-IN') + ' ' + unit : 'Unavailable']);
  const fields = [
    ['Product ID',item.id],['Brand',item.brand],['Category',aisleName],['Net quantity',item.size],
    ['MRP',Number.isFinite(item.mrp) ? money(item.mrp) : null],['Selling price',Number.isFinite(item.price) ? money(item.price) + ' · demo' : null],
    ['Barcode',item.barcode],['Dietary type',item.diet],['FSSAI number',item.fssai],['Manufacturer',item.manufacturer],
    ['Shelf life',item.shelfLife],['Storage',item.storage],['Availability',item.availability === 'demo' ? 'Demo checkout' : item.availability],
    ['Stock quantity',item.stock],['Variants',item.variants.length ? item.variants : null],['Rating',item.rating],['Reviews',item.reviews.length || null],
    ['Delivery eligibility',item.deliveryEligible],['NOVA group',item.nova]
  ];
  showPanel('product',item.name,`<article class="detail">
    ${productPhoto(item,{panel:true})}
    <p class="note">${escape(aisleName)}${item.brand ? ' · ' + escape(item.brand) : ''}</p>
    ${item.description ? '<p>' + escape(item.description) + '</p>' : ''}
    <div class="buy-row">${price(item)}${amountControl(item)}</div>
    <div class="detail-actions"><button type="button" class="secondary" data-favorite="${id}" aria-pressed="${favorites.has(id)}">${favorites.has(id) ? 'Remove from saved items' : 'Save for later'}</button>
    <button type="button" class="secondary" id="copy-product">Copy product link</button><button type="button" class="secondary" data-view="cart">View cart</button></div>
    ${scoreBox(item)}
    <section><h3>Nutrition${item.basis ? ' per ' + escape(item.basis) : ''}</h3>${table(nutrition)}</section>
    <section><h3>Ingredients and allergens</h3><p>${missing(item.ingredients)}</p>${table([['Declared allergens',missing(item.allergens)],['May contain',missing(item.mayContain)]])}</section>
    <section><h3>Product information</h3>${table(fields.map(([label,value])=>[label,missing(value)]))}</section>
    <section><h3>Sources and pack photos</h3><div class="source-links">
    ${link(item.source,item.sourceLabel)}${link(item.frontSource,'Product photo source')}</div>
    <p class="note">Source checked ${missing(item.verified)}${item.sourceUpdated ? ' · source updated ' + escape(item.sourceUpdated) : ''}${item.image ? '. Photo via ' + missing(item.photoCredit) + '.' : '.'}</p>
    <p class="note">Compare with the current pack before purchase. Checkout and prices are for demonstration.</p></section>
    </article>`,keepPosition);
}
function showMethod() {
  const benchmarks=[...aisles,{id:'dry',name:'Dry teas and beverage ingredients'}];
  const limits=benchmarks.map(entry=>'<tr><th scope="row">'+escape(entry.name)+'</th>'+profiles[entry.id].map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('');
  showPanel('method','How Millo scores',`<article class="method">
    <p>Millo’s Healthy Product Score v${scoreVersion} compares products within an aisle. A complete score of at least ${threshold}/100 meets Millo’s editorial threshold. The score is a shopping aid and has no independent health validation.</p>
    <section><h3>Seven weighted criteria</h3>${table([['Protein','18'],['Fibre','15'],['Added sugar','20'],['Saturated fat','12'],['Sodium','12'],['Ingredient quality','13'],['Degree of processing','10']])}</section>
    <section><h3>Category thresholds</h3><p>Values use the source’s per-100 g or per-100 ml basis. Nutrients are in grams except sodium, which is in milligrams.</p>
    <div class="thresholds"><table class="label-data"><thead><tr><th>Aisle</th><th>Protein</th><th>Fibre</th><th>Added sugar</th><th>Sat. fat</th><th>Sodium</th></tr></thead><tbody>${limits}</tbody></table></div></section>
    <section><h3>How points are assigned</h3><p>Protein and fibre rise linearly from zero to full points at their target. Added sugar, saturated fat and sodium start at full points and decrease linearly to zero at their thresholds. Each criterion is rounded separately.</p></section>
    <section><h3>Ingredients and processing</h3><p>A recognised whole-food first ingredient earns 13 points, or 10 if a listed refined ingredient appears later. Another first ingredient earns 8 and a listed refined ingredient in first place earns 3. Fresh produce earns 13. NOVA groups 1, 2, 3 and 4 earn 10, 8, 5 and 1.</p></section>
    <section><h3>What pending means</h3><p>Missing evidence leaves its criterion unscored. Total sugar never substitutes for added sugar. An overall score needs all seven inputs. Demo checkout is available for products that meet the threshold.</p></section></article>`);
}
const cartLines = () => Object.entries(cart).map(([id,quantity]) => ({...byId.get(id), quantity}));

function totals(lines) {
  const {subtotal, delivery, total} = quote(lines);
  return `<div class="total"><div><span>Subtotal</span><b>${money(subtotal)}</b></div>
    <div><span>Delivery</span><b>${delivery ? money(delivery) : 'Free'}</b></div><div class="grand"><span>Total</span><b>${money(total)}</b></div></div>`;
}

function showCart(keepPosition = false) {
  const lines = cartLines();
  if (!lines.length) {
    showPanel('cart', 'Your cart', '<p>Your cart is empty.</p><button class="primary" type="button" data-view="shop">Shop the market</button>', keepPosition);
    return;
  }
  const remaining = freeAt - quote(lines).subtotal;
  showPanel('cart', 'Your cart', `<p class="note">${remaining > 0 ? 'Add ' + money(remaining) + ' for free delivery.' : 'Your cart qualifies for free delivery.'}</p>
    ${lines.map(item => `<div class="panel-item">${productPhoto(item,{cart:true})}<div><p><b>${escape(item.name)}</b></p><small>${escape(item.size || 'Size unavailable')} · ${money(item.price)}</small></div>${amountControl(item)}</div>`).join('')}
    ${totals(lines)}<button type="button" class="primary" data-view="checkout">Continue to checkout</button>`, keepPosition);
}

function showLocation() {
  showPanel('location', 'Delivery location', `<form id="location-form" class="fields"><label>6-digit Indian PIN code
    <input name="pin" inputmode="numeric" autocomplete="postal-code" pattern="[1-9][0-9]{5}" maxlength="6" value="${escape(place)}" placeholder="560001" required></label>
    <p class="note">Your PIN is saved for demo checkout.</p><button class="primary">Save location</button></form>`);
}

function showCheckout() {
  const lines = cartLines();
  if (!lines.length) return showCart();
  showPanel('checkout', 'Checkout', `<form id="checkout-form" class="fields">
      <p class="note">Demo checkout. Use sample delivery details to try the full order flow.</p>
      <button class="secondary" type="button" id="sample-address">Use sample details</button>
      <label>Full name<input name="name" autocomplete="name" required minlength="2" maxlength="80"></label>
      <label>Mobile number<input name="phone" autocomplete="tel-national" inputmode="tel" pattern="[6-9][0-9]{9}" maxlength="10" required></label>
      <label>Delivery address<textarea name="address" autocomplete="street-address" required minlength="8" maxlength="240" rows="2"></textarea></label>
      <label>PIN code<input name="pin" autocomplete="postal-code" inputmode="numeric" pattern="[1-9][0-9]{5}" maxlength="6" value="${escape(place)}" required></label>
      <fieldset><legend>Payment method</legend><label><input name="payment" type="radio" value="demo-cod" checked> Cash on delivery (demo)</label></fieldset>
      ${totals(lines)}
      <p class="error" id="order-error" role="alert"></p><button class="primary" type="submit">Place demo order</button>
    </form>`);
}

function orderMarkup(order) {
  return `<details class="order-summary"><summary>${escape(order.id)} · ${money(order.total)}</summary>
    <p>${new Date(order.createdAt).toLocaleString('en-IN', {dateStyle:'medium', timeStyle:'short'})} · Demo order</p>
    <ul>${order.items.map(item => `<li>${escape(item.name)} × ${item.quantity}</li>`).join('')}</ul></details>`;
}

function showOrders() {
  showPanel('orders', 'My orders', orders.length ?
    orders.map(orderMarkup).join('') :
    '<p>You haven’t placed any orders on this device.</p><button class="primary" type="button" data-view="shop">Shop the market</button>');
}

function confirm(order) {
  showPanel('confirmation', 'Order received', `<p>Your demo order has been recorded. No payment or delivery will take place.</p>
    ${orderMarkup(order)}<button class="primary" type="button" data-view="shop">Continue shopping</button>`);
}

function close() {
  if (pending || !panel.open) return;
  const route = currentRoute();
  if (route.depth > 0) history.go(-route.depth);
  else {
    saveRoute({...route,kind:'',product:''});
    panel.close();
  }
}
function restoreRoute(route) {
  clearTimeout(searchTimer);
  restoringRoute = true;
  try {
    if (JSON.stringify(route.browse) !== JSON.stringify(browseState())) {
      ({aisle,filter} = route.browse);
      search.value = route.browse.query;
      $('#sort').value = route.browse.sort;
      productLimit = route.browse.limit;
      renderAisles();
      updateFilters();
      updateHeader();
      renderProducts();
    }
    $('#browse-back').hidden = route.index === 0 || route.depth > 0;
    selectedProduct = route.product || '';
    if (route.kind === 'product' && byId.has(route.product)) showProduct(route.product);
    else if (route.kind === 'method') showMethod();
    else if (route.kind === 'cart') showCart();
    else if (route.kind === 'checkout' && cartLines().length) showCheckout();
    else if (route.kind === 'orders' || route.kind === 'confirmation') showOrders();
    else if (route.kind === 'location') showLocation();
    else if (panel.open) panel.close();
  } finally {
    restoringRoute = false;
  }
}
window.addEventListener('popstate',()=>restoreRoute(currentRoute()));


function focusReplacement(source, root, selector) {
  if (source === document.activeElement || !document.contains(source)) {
    const matches = [...root.querySelectorAll(selector)];
    const visible = matches.find(button => !button.disabled && button.dataset.delta === source.dataset.delta) ||
      matches.find(button => !button.disabled);
    visible?.focus({preventScroll:true});
  }
}

async function submitCheckout(form) {
  if (pending) return;
  const data = Object.fromEntries(new FormData(form));
  const payload = { ...data, items: cartLines().map(({id,quantity}) => ({id,quantity})) };
  pending = true;
  const submit = $('[type="submit"]', form);
  const errorMessage = $('#order-error',form);
  submit.disabled = true;
  submit.textContent = 'Placing order…';
  errorMessage.textContent = '';
  try {
    const body = JSON.stringify(payload);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
    const signature = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,'0')).join('');
    if (!retry || retry.signature !== signature) {
      retry = {signature, key: crypto.randomUUID()};
      save('retry', retry);
    }
    const response = await fetch('/api/orders', {
      method: 'POST', headers: {'Content-Type':'application/json','Idempotency-Key':retry.key},
      body
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not place the order.');
    const order = result.order;
    orders = [order, ...orders.filter(previous => previous.id !== order.id)];
    save('orders', orders);
    place = data.pin;
    save('place', place);
    Object.keys(cart).forEach(id => { delete cart[id]; });
    save('cart', cart);
    retry = null;
    save('retry', retry);
    renderProducts();
    updateHeader();
    pending = false;
    if (form.isConnected) confirm(order);
    else notify('Demo order recorded.');
  } catch (error) {
    errorMessage.textContent = error.message || 'Could not reach Millo. Please try again.';
    submit.disabled = false;
    submit.textContent = 'Place demo order';
  } finally {
    pending = false;
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || (pending && panel.contains(button))) return;
  const {change, delta, favorite, product, view, aisle: next, filter: newFilter} = button.dataset;
  if (button.id === 'panel-back' || button.id === 'browse-back') return previousPage();
  if (button.id === 'load-more') {
    const newIndex = productLimit;
    productLimit += pageSize;
    rememberBrowse();
    renderProducts();
    document.querySelectorAll('#products .product-asset')[newIndex]?.focus();
    return;
  }
  if (button.id === 'copy-product') {
    void navigator.clipboard.writeText(productURL(selectedProduct).href).then(() => notify('Product link copied'), () => notify('Copy the link from the address bar'));
    return;
  }
  if (view === 'method') return showMethod();
  if (view === 'product') return showProduct(selectedProduct);
  if (change) {
    if (byId.get(change)?.score.qualified !== true) return;
    const quantity = Math.max(0, Math.min(maxQuantity, (cart[change] || 0) + Number(delta)));
    if (quantity) cart[change] = quantity;
    else delete cart[change];
    save('cart', cart);
    updateHeader();
    renderProducts();
    if (currentPanel === 'cart') showCart(true);
    if (currentPanel === 'product') showProduct(selectedProduct, true);
    focusReplacement(button, panel.open ? body : $('#products'), '[data-change="' + change + '"]');
    if (panel.open && !body.contains(document.activeElement)) $('.close-panel', panel).focus();
    if (quantity === 1 && delta === '1') notify(byId.get(change).name + ' added');
    return;
  }
  if (favorite) {
    if (favorites.has(favorite)) favorites.delete(favorite);
    else favorites.add(favorite);
    save('favorites', [...favorites]);
    renderProducts();
    if (currentPanel === 'product') showProduct(selectedProduct, true);
    focusReplacement(button, panel.open ? body : $('#products'), '[data-favorite="' + favorite + '"]');
    notify(favorites.has(favorite) ? 'Saved for later' : 'Removed from saved items');
    return;
  }
  if (product) return showProduct(product);
  if (next) return selectAisle(next);
  if (newFilter) { productLimit = pageSize; filter = newFilter; rememberBrowse(); updateFilters(); return renderProducts(); }
  if (button.hasAttribute('data-close')) return close();
  if (view === 'shop') return close();
  if (view === 'cart' || button.id === 'cart-button') return showCart();
  if (view === 'checkout') return showCheckout();
  if (button.id === 'location') return showLocation();
  if (button.id === 'favorite-view') return selectAisle(aisle === 'saved' ? 'all' : 'saved');
  if (button.id === 'order-view' || button.id === 'footer-orders') return showOrders();
  if (button.id === 'all-aisles') return selectAisle('all');
  if (button.id === 'sample-address') {
    const fields = $('#checkout-form').elements;
    fields.name.value = 'Millo Demo';
    fields.phone.value = '9000000000';
    fields.address.value = '12 Market Lane, Demo Address';
    fields.pin.value = place || '560001';
  }
});

document.addEventListener('submit', event => {
  event.preventDefault();
  if (event.target.matches('.search')) {
    $('#market').scrollIntoView({block:'start'});
  } else if (event.target.id === 'location-form') {
    const value = new FormData(event.target).get('pin').trim();
    if (!pinPattern.test(value)) return;
    place = value;
    save('place', place);
    updateHeader();
    close();
    notify('Delivery location saved');
  } else if (event.target.id === 'checkout-form') {
    void submitCheckout(event.target);
  }
});

let searchTimer;
search.addEventListener('input', () => {
  const previous = currentRoute();
  const startsSearch = !previous.browse.query.trim() && search.value.trim();
  clearTimeout(searchTimer);
  productLimit = pageSize;
  if (aisle !== 'all') {
    aisle = 'all';
    filter = 'all';
    updateFilters();
    renderAisles();
    updateHeader();
  }
  if (startsSearch) saveRoute({...previous,index:previous.index+1,browse:browseState()},true);
  else rememberBrowse();
  renderProducts();
  if (search.value.trim()) searchTimer = setTimeout(() => $('#market').scrollIntoView({block:'start'}), 400);
});
$('#sort').addEventListener('change', () => { productLimit = pageSize; rememberBrowse(); renderProducts(); });
document.addEventListener('keydown', event => {
  if (event.key === '/' && !$('#intro').open && !panel.open && !event.target.matches('input, textarea, select')) {
    event.preventDefault();
    search.focus();
  }
});
panel.addEventListener('cancel', event => { event.preventDefault(); close(); });
panel.addEventListener('click', event => { if (event.target === panel) close(); });
panel.addEventListener('close', () => {
  currentPanel = '';
  selectedProduct = '';
  if (document.contains(lastFocus)) lastFocus.focus({preventScroll:true});
  else $('#cart-button').focus({preventScroll:true});
});

renderAisles();
updateFilters();
renderProducts();
updateHeader();


const intro = $('#intro');
const video = $('#intro-video');
const skipIntro = $('#intro-skip');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const stage = $('#intro-stage');
let reelRun = 0;
let introTimeout;
let introFinish;
let introFocus;

function closeIntro() {
  if (intro.open) intro.close();
}
async function playIntro() {
  if (intro.open) return;
  const run = ++reelRun;
  introFocus = document.activeElement;
  intro.classList.remove('playing','finishing');
  intro.showModal();
  skipIntro.focus({preventScroll:true});
  introTimeout = setTimeout(closeIntro, 4600);
  video.src = '/assets/millo-cartoon.mp4';
  video.load();
  await new Promise(resolve=>setTimeout(resolve,650));
  if (!intro.open || run !== reelRun) return;
  try {
    await video.play();
    if (!intro.open || run !== reelRun) return;
    clearTimeout(introTimeout);
    intro.classList.add('playing');
    const length = Number.isFinite(video.duration) ? video.duration : 6;
    stage.style.setProperty('--reel-duration', length + 's');
    introTimeout = setTimeout(closeIntro, Math.ceil(length * 1000) + 1600);
  } catch {
    if (run === reelRun) closeIntro();
  }
}
$('#replay-intro').addEventListener('click',playIntro);
skipIntro.addEventListener('click',closeIntro);
video.addEventListener('ended',()=>{
  if (!intro.open) return;
  if (reducedMotion.matches) return closeIntro();
  intro.classList.add('finishing');
  introFinish = setTimeout(closeIntro,260);
});
intro.addEventListener('close',()=>{
  reelRun += 1;
  clearTimeout(introTimeout);
  clearTimeout(introFinish);
  video.pause();
  intro.classList.remove('playing','finishing');
  if (document.documentElement.classList.contains('opening')) revealStore();
  else if (introFocus instanceof HTMLElement && introFocus !== document.body) introFocus.focus({preventScroll:true});
});
const linkedProduct = new URL(location.href).searchParams.get('product');
const initialRoute = currentRoute();
if (!history.state?.millo) {
  if (byId.has(linkedProduct)) {
    initialRoute.kind = 'product';
    initialRoute.product = linkedProduct;
  }
  saveRoute(initialRoute);
}
function revealStore() {
  document.documentElement.classList.remove('opening');
  restoreRoute(currentRoute());
}
if (reducedMotion.matches) revealStore();
else void playIntro();
