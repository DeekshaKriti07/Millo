import {products} from '../public/catalog.js';
import {maxQuantity, pinPattern, quote} from '../public/commerce.js';

const productById = new Map(products.map(item => [item.id, item]));
const keyPattern = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const contentTypes = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.webp':'image/webp', '.mp4':'video/mp4', '.woff2':'font/woff2'
};
const security = {
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'same-origin',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; media-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"
};

function json(payload, status = 200, extra = {}) {
  return Response.json(payload, {status, headers: {...security, 'Cache-Control':'no-store', ...extra}});
}

function reject(error, status) {
  return json({error}, status);
}

function validText(value, min, max) {
  return typeof value === 'string' && value.trim().length >= min && value.length <= max;
}

function validate(data) {
  if (!data || !validText(data.name,2,80) || !validText(data.address,8,240) ||
      typeof data.phone !== 'string' || !/^[6-9][0-9]{9}$/.test(data.phone) ||
      typeof data.pin !== 'string' || !pinPattern.test(data.pin) || data.payment !== 'demo-cod') {
    return null;
  }
  if (!Array.isArray(data.items) || !data.items.length || data.items.length > productById.size) return null;
  const unique = new Set();
  const lines = [];
  for (const item of data.items) {
    if (!item || !productById.has(item.id) || productById.get(item.id).score.qualified !== true || !Number.isFinite(productById.get(item.id).price) || unique.has(item.id) || !Number.isInteger(item.quantity) ||
        item.quantity < 1 || item.quantity > maxQuantity) return null;
    const {id,name,price,size} = productById.get(item.id);
    lines.push({id,name,size,price,quantity:item.quantity});
    unique.add(id);
  }
  return lines;
}

async function fingerprint(value) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2,'0')).join('');
}

async function readBody(request) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', {fatal:true});
  let length = 0;
  let text = '';
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 8192) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, {stream:true});
    }
    return JSON.parse(text + decoder.decode());
  } catch {
    return null;
  }
}

async function createOrder(request, env) {
  if (request.method !== 'POST') return json({error:'Method not allowed.'}, 405, {Allow:'POST'});
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return reject('Invalid request origin.', 403);
  const type = request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return reject('Expected a JSON order.', 415);
  const key = request.headers.get('Idempotency-Key') || '';
  if (!keyPattern.test(key)) return reject('Invalid checkout reference.', 400);
  const data = await readBody(request);
  const items = validate(data);
  if (!items) return reject('Check your delivery details and item quantities.', 400);
  if (!env.DB) return reject('Order storage is temporarily unavailable.', 503);

  const canonicalItems = items.map(({id,quantity}) => ({id,quantity})).sort((a,b) => a.id.localeCompare(b.id));
  const {name,phone,address,pin,payment} = data;
  const hash = await fingerprint(JSON.stringify({name,phone,address,pin,payment,items:canonicalItems}));
  const order = {
    id:'ML-' + crypto.randomUUID().replaceAll('-','').toUpperCase(),
    createdAt:new Date().toISOString(), status:'received', payment, items, ...quote(items)
  };
  try {
    await env.DB.prepare(
      'INSERT INTO orders (id, checkout_key, request_hash, receipt, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(checkout_key) DO NOTHING'
    ).bind(order.id, key, hash, JSON.stringify(order), order.createdAt).run();
    const row = await env.DB.prepare('SELECT request_hash, receipt FROM orders WHERE checkout_key = ?').bind(key).first();
    if (!row) return reject('Order storage is temporarily unavailable.', 503);
    if (row.request_hash !== hash) return reject('This checkout reference has already been used.', 409);
    const receipt = JSON.parse(row.receipt);
    return json({order: receipt}, receipt.id === order.id ? 201 : 200);
  } catch (error) {
    console.error('Order storage error:', error.message);
    return reject('Order storage is temporarily unavailable. Please try again.', 503);
  }
}

export function createHandler(readAsset) {
  return {
    async fetch(request, env = {}) {
      const {pathname} = new URL(request.url);
      if (pathname === '/api/orders') return createOrder(request, env);
      if (pathname === '/api/catalog') {
        if (request.method !== 'GET') return json({error:'Method not allowed.'}, 405, {Allow:'GET'});
        return json({products});
      }
      if (pathname === '/api/health' && request.method === 'GET') {
        try {
          if (!env.DB) throw new Error('Database binding is unavailable');
          await env.DB.prepare('SELECT id FROM orders LIMIT 1').first();
          return json({status:'ok'});
        } catch {
          return json({status:'unavailable'}, 503);
        }
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, {status:405, headers:{Allow:'GET, HEAD'}});
      const path = pathname === '/' ? '/index.html' : pathname;
      const extension = path.slice(path.lastIndexOf('.'));
      const type = Object.hasOwn(contentTypes, extension) && contentTypes[extension];
      const contents = type && await readAsset(path);
      if (!contents) return new Response('Page not found', {status:404, headers:security});
      const range = extension === '.mp4' && request.headers.get('Range');
      if (range && request.method === 'GET') {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        const length = contents.byteLength;
        const start = match?.[1] ? Number(match[1]) : match?.[2] ? Math.max(0,length-Number(match[2])) : 0;
        const end = match?.[1] && match[2] ? Math.min(Number(match[2]),length-1) : length-1;
        if (!match || (!match[1] && !match[2]) || start > end || start >= length) {
          return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+length}});
        }
        return new Response(contents.slice(start,end+1),{status:206,headers:{...security,'Content-Type':type,
          'Content-Range':`bytes ${start}-${end}/${length}`,'Accept-Ranges':'bytes','Content-Length':String(end-start+1)}});
      }
      return new Response(request.method === 'HEAD' ? null : contents, {headers:{
        'Content-Length':String(contents.byteLength),
        ...(extension === '.mp4' ? {'Accept-Ranges':'bytes'} : {}),
        ...security, 'Content-Type':type,
        'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=3600' : 'no-cache'
      }});
    }
  };
}
