/**
 * Plain REST order API for Qefro Business Tools testing.
 *
 * Auth modes:
 * - X-API-Key / service Bearer — classic REST tools
 * - End-user JWT / X-Session-Id — widget identity forwarding (END_USER_IDENTITY)
 */
import 'dotenv/config';
import { createServer } from 'http';
import { URL } from 'url';

const port = Number(process.env.PORT || 8091);
const API_KEY = process.env.REST_API_KEY || 'dev-rest-api-key';
const BEARER_TOKEN = process.env.REST_BEARER_TOKEN || 'dev-rest-bearer';

/** Demo tokens issued by YOUR app and passed via widget.identify(). */
const END_USER_TOKENS = {
  'dev-jwt-alice': {
    customer_id: 'cust-alice',
    email: 'info@cyberfly.io',
    name: 'Alice',
    mode: 'jwt',
  },
  'dev-jwt-bob': {
    customer_id: 'cust-bob',
    email: 'bob@example.com',
    name: 'Bob',
    mode: 'jwt',
  },
  'dev-session-alice': {
    customer_id: 'cust-alice',
    email: 'info@cyberfly.io',
    name: 'Alice',
    mode: 'session',
  },
  'dev-session-bob': {
    customer_id: 'cust-bob',
    email: 'bob@example.com',
    name: 'Bob',
    mode: 'session',
  },
};

const ORDERS = {
  'ORD-1001': {
    id: 'ORD-1001',
    customer_id: 'cust-alice',
    status: 'processing',
    items: ['Wireless Mouse', 'USB-C Hub'],
    total: 79.98,
    currency: 'USD',
    eta: '2026-07-25',
    tracking_number: null,
    carrier: null,
  },
  'ORD-1002': {
    id: 'ORD-1002',
    customer_id: 'cust-alice',
    status: 'shipped',
    items: ['Standing Desk Mat'],
    total: 49.0,
    currency: 'USD',
    eta: '2026-07-22',
    tracking_number: '1Z999AA10123456784',
    carrier: 'UPS',
  },
  'ORD-2001': {
    id: 'ORD-2001',
    customer_id: 'cust-bob',
    status: 'delivered',
    items: ['Laptop Sleeve', 'HDMI Cable'],
    total: 44.5,
    currency: 'USD',
    eta: '2026-07-14',
    tracking_number: '9400111899223344556677',
    carrier: 'USPS',
  },
  'ORD-3001': {
    id: 'ORD-3001',
    customer_id: 'cust-carol',
    status: 'cancelled',
    items: ['Ergonomic Chair'],
    total: 299.0,
    currency: 'USD',
    eta: null,
    tracking_number: null,
    carrier: null,
  },
};

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'Authorization, Content-Type, X-API-Key, X-Session-Id, X-Qefro-User-ID, X-Qefro-User-Email, X-Qefro-Channel, X-Qefro-Authentication-Level',
  });
  res.end(payload);
}

function readAuth(req) {
  const apiKey = req.headers['x-api-key'];
  const auth = req.headers.authorization || '';
  const bearer = auth.toLowerCase().startsWith('bearer ')
    ? auth.slice(7).trim()
    : '';
  const sessionId = String(req.headers['x-session-id'] || '').trim();
  return { apiKey, bearer, sessionId };
}

function requireApiKey(req, res) {
  const { apiKey } = readAuth(req);
  if (apiKey !== API_KEY) {
    json(res, 401, { error: 'unauthorized', message: 'Valid X-API-Key required' });
    return false;
  }
  return true;
}

function requireBearer(req, res) {
  const { bearer } = readAuth(req);
  if (bearer !== BEARER_TOKEN) {
    json(res, 401, { error: 'unauthorized', message: 'Valid Bearer token required' });
    return false;
  }
  return true;
}

/**
 * Resolve end-user from widget identity forwarding:
 * - Authorization: Bearer <jwt>  (auth_mode END_USER_IDENTITY + jwt)
 * - X-Session-Id: <session>      (auth_mode END_USER_IDENTITY + session)
 */
function resolveEndUser(req) {
  const { bearer, sessionId } = readAuth(req);
  if (bearer && END_USER_TOKENS[bearer]) {
    return { ...END_USER_TOKENS[bearer], token: bearer, via: 'Authorization: Bearer' };
  }
  if (sessionId && END_USER_TOKENS[sessionId]) {
    return { ...END_USER_TOKENS[sessionId], token: sessionId, via: 'X-Session-Id' };
  }
  return null;
}

function requireEndUser(req, res) {
  const user = resolveEndUser(req);
  if (!user) {
    json(res, 401, {
      error: 'unauthorized',
      message:
        'END_USER_IDENTITY required. Call widget.identify() then retry. Demo tokens: dev-jwt-alice | dev-session-alice',
      received: {
        authorization: Boolean(readAuth(req).bearer),
        session_id: Boolean(readAuth(req).sessionId),
        qefro_user_id: req.headers['x-qefro-user-id'] || null,
        qefro_email: req.headers['x-qefro-user-email'] || null,
        qefro_channel: req.headers['x-qefro-channel'] || null,
      },
    });
    return null;
  }
  return user;
}

function qefroHeaders(req) {
  return {
    'X-Qefro-User-ID': req.headers['x-qefro-user-id'] || null,
    'X-Qefro-User-Email': req.headers['x-qefro-user-email'] || null,
    'X-Qefro-Channel': req.headers['x-qefro-channel'] || null,
    'X-Qefro-Authentication-Level':
      req.headers['x-qefro-authentication-level'] || null,
    'X-Qefro-Phone': req.headers['x-qefro-phone'] || null,
  };
}

const server = createServer((req, res) => {
  if ((req.method || '').toUpperCase() === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers':
        'Authorization, Content-Type, X-API-Key, X-Session-Id, X-Qefro-User-ID, X-Qefro-User-Email, X-Qefro-Channel, X-Qefro-Authentication-Level',
    });
    return res.end();
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = (req.method || 'GET').toUpperCase();

  if (method === 'GET' && (path === '/rest/health' || path === '/health')) {
    return json(res, 200, {
      ok: true,
      service: 'qefro-rest-order-api',
      identity_forwarding: true,
    });
  }

  // --- Identity forwarding (widget.identify → END_USER_IDENTITY) ---

  // GET /rest/identity/me
  if (method === 'GET' && path === '/rest/identity/me') {
    const user = requireEndUser(req, res);
    if (!user) return;
    return json(res, 200, {
      ok: true,
      identity_forwarding: true,
      auth_via: user.via,
      auth_mode: user.mode,
      customer_id: user.customer_id,
      email: user.email,
      name: user.name,
      forwarded_headers: qefroHeaders(req),
      message: `Identity OK for ${user.name} (${user.email}) via ${user.via}.`,
    });
  }

  // GET /rest/identity/my-orders
  if (method === 'GET' && path === '/rest/identity/my-orders') {
    const user = requireEndUser(req, res);
    if (!user) return;
    const limit = Math.min(20, Math.max(1, Number(url.searchParams.get('limit')) || 5));
    const orders = Object.values(ORDERS)
      .filter((o) => o.customer_id === user.customer_id)
      .slice(0, limit);
    return json(res, 200, {
      identity_forwarding: true,
      auth_via: user.via,
      customer_id: user.customer_id,
      email: user.email,
      count: orders.length,
      orders,
      forwarded_headers: qefroHeaders(req),
      message: `Found ${orders.length} order(s) for ${user.name} using forwarded identity (${user.via}).`,
    });
  }

  // Public-style lookup (API key)
  const orderMatch = path.match(/^\/rest\/orders\/([^/]+)$/);
  if (method === 'GET' && orderMatch) {
    if (!requireApiKey(req, res)) return;
    const orderId = decodeURIComponent(orderMatch[1]).toUpperCase();
    const order = ORDERS[orderId];
    if (!order) {
      return json(res, 404, {
        found: false,
        error: 'not_found',
        message: `No order found for ${orderId}`,
        sample_ids: Object.keys(ORDERS),
      });
    }
    return json(res, 200, {
      found: true,
      ...order,
      message: order.tracking_number
        ? `Order ${order.id} is ${order.status} via ${order.carrier} (${order.tracking_number}).`
        : `Order ${order.id} is ${order.status}.`,
    });
  }

  // Service-account Bearer (NOT identity forwarding)
  if (method === 'GET' && path === '/rest/my-orders') {
    if (!requireBearer(req, res)) return;
    const customerId = (url.searchParams.get('customer_id') || 'cust-alice').trim();
    const limit = Math.min(20, Math.max(1, Number(url.searchParams.get('limit')) || 5));
    const orders = Object.values(ORDERS)
      .filter((o) => o.customer_id === customerId)
      .slice(0, limit);
    return json(res, 200, {
      customer_id: customerId,
      count: orders.length,
      orders,
      message:
        orders.length > 0
          ? `Found ${orders.length} order(s) for ${customerId}.`
          : `No orders for ${customerId}.`,
    });
  }

  if (method === 'GET' && path === '/rest/orders') {
    if (!requireApiKey(req, res)) return;
    return json(res, 200, {
      count: Object.keys(ORDERS).length,
      orders: Object.values(ORDERS),
    });
  }

  json(res, 404, {
    error: 'not_found',
    endpoints: [
      'GET /rest/health',
      'GET /rest/identity/me              (END_USER_IDENTITY: Bearer jwt OR X-Session-Id)',
      'GET /rest/identity/my-orders       (END_USER_IDENTITY)',
      'GET /rest/orders/{orderId}         (X-API-Key)',
      'GET /rest/orders                   (X-API-Key)',
      'GET /rest/my-orders?customer_id=   (service Bearer — not identity forward)',
    ],
    demo_tokens: Object.keys(END_USER_TOKENS),
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`REST order API on http://127.0.0.1:${port}`);
  console.log(`  X-API-Key: ${API_KEY}`);
  console.log(`  Service Bearer: ${BEARER_TOKEN}`);
  console.log('  Identity forward demos:');
  console.log('    GET /rest/identity/me');
  console.log('    GET /rest/identity/my-orders');
  console.log('    JWT:     Authorization: Bearer dev-jwt-alice');
  console.log('    Session: X-Session-Id: dev-session-alice');
});
