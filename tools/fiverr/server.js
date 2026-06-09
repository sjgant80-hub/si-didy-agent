// ◊·κ=1 · fiverr-autopilot · HTTP bridge for the dashboard
// Reads from queues/ and memory/ · exposes 5 read endpoints + 1 approve endpoint.
// Port 1618 (φ) by default · doesn't conflict with agent.mjs --server which uses
// the same port (the HTTP bridge runs in agent's process when --fv-server mode active).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { listQueue, approveAndShip, auditStats } from './index.js';

const PORT = parseInt(process.env.FV_PORT || '1618', 10);
const SHIP_DIR = path.resolve('queues/fv-shipped');
const QUEUE_DIR = path.resolve('queues/fv-awaiting-review');

function json(res, code, body) {
  res.writeHead(code, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
  });
  res.end(JSON.stringify(body));
}

function notFound(res) { json(res, 404, { error: 'not_found' }); }

const ROUTES = {
  'GET /api/fiverr/queue': (req, res) => {
    json(res, 200, listQueue());
  },
  'GET /api/fiverr/stats': (req, res) => {
    json(res, 200, auditStats());
  },
  'GET /api/fiverr/shipped': (req, res) => {
    if (!fs.existsSync(SHIP_DIR)) return json(res, 200, []);
    const items = fs.readdirSync(SHIP_DIR)
      .filter(f => f.endsWith('.json') && !f.includes('-envelope'))
      .map(f => {
        try {
          const p = JSON.parse(fs.readFileSync(path.join(SHIP_DIR, f), 'utf8'));
          return {
            orderId: p.orderId,
            gigId: p.order?.gigId,
            tier: p.classification?.tier,
            shippedAt: p.shippedAt || fs.statSync(path.join(SHIP_DIR, f)).mtime.toISOString(),
          };
        } catch { return null; }
      }).filter(Boolean).sort((a, b) => (b.shippedAt || '').localeCompare(a.shippedAt || ''));
    json(res, 200, items);
  },
  'GET /api/fiverr/order/': (req, res, orderId) => {
    const file = path.join(QUEUE_DIR, `${orderId}.json`);
    if (!fs.existsSync(file)) return notFound(res);
    json(res, 200, JSON.parse(fs.readFileSync(file, 'utf8')));
  },
  'POST /api/fiverr/approve/': async (req, res, orderId) => {
    try {
      const result = await approveAndShip(orderId);
      json(res, 200, result);
    } catch (e) {
      json(res, 500, { error: e.message });
    }
  },
  'GET /dashboard': (req, res) => {
    const dashPath = path.resolve('dashboards/fiverr-review.html');
    if (!fs.existsSync(dashPath)) return notFound(res);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(dashPath));
  },
};

export function start(port = PORT) {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = req.url || '/';
    // exact match first
    const exact = ROUTES[`${req.method} ${url}`];
    if (exact) return exact(req, res);

    // prefix match for /api/fiverr/order/:id and /api/fiverr/approve/:id
    for (const key of Object.keys(ROUTES)) {
      const [method, prefix] = key.split(' ');
      if (req.method !== method) continue;
      if (prefix.endsWith('/') && url.startsWith(prefix)) {
        const param = url.slice(prefix.length).split('?')[0];
        return ROUTES[key](req, res, decodeURIComponent(param));
      }
    }
    notFound(res);
  });

  server.listen(port, () => {
    console.log(`◊·κ=φ⁴ · fiverr autopilot HTTP bridge listening on port ${port}`);
    console.log(`◊ dashboard: http://localhost:${port}/dashboard`);
    console.log(`◊ queue:     http://localhost:${port}/api/fiverr/queue`);
  });

  return server;
}

// Allow direct execution: `node tools/fiverr/server.js`
// Windows-safe entrypoint detection (drive letters break the file:// comparison).
const entryUrl = import.meta.url.toLowerCase();
const argvPath = (process.argv[1] || '').toLowerCase().replace(/\\/g, '/');
if (entryUrl.includes(argvPath.replace(/^[a-z]:/, ''))) {
  start();
}
