// Thin wrapper around fetch for the JSON API.

async function call(method, url, body) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (method !== 'GET') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body ?? {});
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new Error('Could not reach the island. Check your connection and try again.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || 'Something went wrong.');
    err.status = res.status;
    throw err;
  }
  return json;
}

export const api = {
  get: (url) => call('GET', url),
  post: (url, body) => call('POST', url, body),
  patch: (url, body) => call('PATCH', url, body),
  del: (url) => call('DELETE', url),
  // fire-and-forget counter that survives the page navigating away
  ping: (url) => {
    fetch(url, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
  },
};
