// Durable Object « SyncRoom » : un seul exemplaire, qui détient les données de l'app
// (cohérence immédiate, contrairement à KV) et prévient en direct les appareils
// connectés en WebSocket quand quelque chose change.

const CHUNK = 400_000; // caractères par morceau (limite de 2 Mo par valeur)

export class SyncRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    // Répond aux « ping » sans réveiller l'objet (connexions en veille gratuites).
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request) {
    const url = new URL(request.url);
    const client = url.searchParams.get('client') || '';

    if (url.pathname === '/live') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket attendu', { status: 426 });
      const [a, b] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(b);
      return new Response(null, { status: 101, webSocket: a });
    }

    if (url.pathname === '/state') {
      const current = await this.readState();
      if (request.method === 'GET') return Response.json(current || { updatedAt: 0, data: null });
      if (request.method === 'PUT') {
        const body = await request.json();
        if (!body || typeof body.updatedAt !== 'number' || !body.data) return Response.json({ error: 'Données invalides' }, { status: 400 });
        if (current && current.updatedAt > body.updatedAt) return Response.json({ stored: false, ...current });
        await this.writeState(body.updatedAt, body.data);
        this.broadcast({ type: 'state', updatedAt: body.updatedAt, origin: client });
        return Response.json({ stored: true, updatedAt: body.updatedAt });
      }
    }

    if (url.pathname === '/inbox') {
      const items = (await this.ctx.storage.get('inbox')) ?? (await this.legacy('inbox')) ?? [];
      if (request.method === 'GET') return Response.json({ items });
      if (request.method === 'POST') {
        const item = await request.json();
        if (!item?.type) return Response.json({ error: 'Élément invalide' }, { status: 400 });
        item.id ||= crypto.randomUUID();
        items.push(item);
        await this.ctx.storage.put('inbox', items);
        this.broadcast({ type: 'inbox' });
        return Response.json({ queued: items.length, id: item.id });
      }
      if (request.method === 'DELETE') {
        const ids = new Set((await request.json().catch(() => ({}))).ids || []);
        const rest = items.filter((x) => !ids.has(x.id));
        await this.ctx.storage.put('inbox', rest);
        return Response.json({ remaining: rest.length });
      }
    }
    return Response.json({ error: 'Route inconnue' }, { status: 404 });
  }

  async readState() {
    const meta = await this.ctx.storage.get('meta');
    if (!meta) {
      // Première utilisation : reprise des données de l'ancien stockage KV.
      const old = await this.legacy('state');
      if (old?.data) { await this.writeState(old.updatedAt, old.data); return old; }
      return null;
    }
    const keys = Array.from({ length: meta.n }, (_, i) => `chunk:${i}`);
    const parts = await this.ctx.storage.get(keys);
    return { updatedAt: meta.updatedAt, data: JSON.parse(keys.map((k) => parts.get(k)).join('')) };
  }

  async writeState(updatedAt, data) {
    const str = JSON.stringify(data);
    const n = Math.max(1, Math.ceil(str.length / CHUNK));
    const prev = (await this.ctx.storage.get('meta'))?.n || 0;
    const entries = { meta: { updatedAt, n } };
    for (let i = 0; i < n; i++) entries[`chunk:${i}`] = str.slice(i * CHUNK, (i + 1) * CHUNK);
    await this.ctx.storage.put(entries);
    if (prev > n) await this.ctx.storage.delete(Array.from({ length: prev - n }, (_, i) => `chunk:${n + i}`));
  }

  async legacy(key) {
    if (!this.env.DATA) return null;
    try { return await this.env.DATA.get(key, 'json'); } catch { return null; }
  }

  broadcast(msg) {
    const s = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(s); } catch { /* connexion fermée */ }
    }
  }

  async webSocketClose(ws, code) {
    try { ws.close(code, 'fin'); } catch { /* déjà fermée */ }
  }
}
