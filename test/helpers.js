// Starts the real app on a random port with an in-memory database.

import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createPayments } from '../server/payments.js';

export async function startApp(extraEnv = {}, fetchImpl) {
  const env = { RATE_LIMITS: 'off', ...extraEnv };
  const db = openDb(':memory:');
  const payments = createPayments(env, fetchImpl);
  const app = createApp({ db, payments, env });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { db, base, close: () => new Promise((r) => server.close(r)) };
}

// A tiny browser stand-in that remembers cookies.
export class Client {
  constructor(base) {
    this.base = base;
    this.cookies = new Map();
  }

  async request(method, path, body, headers = {}) {
    const opts = { method, headers: { ...headers } };
    if (this.cookies.size) opts.headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (body !== undefined) {
      opts.headers['content-type'] ??= 'application/json';
      opts.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const res = await fetch(this.base + path, opts);
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const value = pair.slice(i + 1);
      if (value) this.cookies.set(pair.slice(0, i), value);
      else this.cookies.delete(pair.slice(0, i));
    }
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // not JSON
    }
    return { status: res.status, json, text, headers: res.headers };
  }

  get(path) {
    return this.request('GET', path);
  }

  post(path, body = {}) {
    return this.request('POST', path, body);
  }

  async register(name, email = `${name.toLowerCase().replace(/\W+/g, '')}@example.com`) {
    const r = await this.post('/api/register', { name, email, password: 'a-good-password' });
    if (r.status !== 201) throw new Error(`register failed: ${r.text}`);
    return r.json.user;
  }
}

export const SHOP = { type: 'shop', style: 'corner', tier: 'standard', colour: 'coral', floors: 1, w: 1, h: 1 };
