/**
 * Gold Miner relay: pairs two phones by a short room code and forwards their messages.
 * One Durable Object per room. No game logic lives here; the host phone is authoritative.
 *
 *   POST /rooms                      → { code }                (host creates a room)
 *   GET  /rooms/:code                → { exists, host, guest } (guest checks before joining)
 *   GET  /rooms/:code/ws?role=host|guest  WebSocket upgrade
 *   GET  /healthz
 */
import { DurableObject } from 'cloudflare:workers';

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  ALLOWED_ORIGINS?: string;
}

// No 0/O/1/I so codes can be read out loud or typed from a screen.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;
/** A room with no sockets is deleted after this long. */
const IDLE_TTL_MS = 2 * 60 * 60 * 1000;
/** A freshly created room the host never connected to expires sooner. */
const UNUSED_TTL_MS = 10 * 60 * 1000;

function randomCode(): string {
  const bytes = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...extra } });
}

function originAllowed(req: Request, env: Env): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // non-browser clients (health checks, tests)
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return allowed.includes(origin);
}

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '*';
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    if (url.pathname === '/healthz') return json({ ok: true }, 200, cors(req));
    if (!originAllowed(req, env)) return json({ error: 'origin' }, 403);

    if (req.method === 'POST' && url.pathname === '/rooms') {
      // Retry on the (astronomically unlikely) collision with a live room.
      for (let i = 0; i < 5; i++) {
        const code = randomCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const created = await stub.create();
        if (created) return json({ code }, 200, cors(req));
      }
      return json({ error: 'busy' }, 503, cors(req));
    }

    const m = url.pathname.match(/^\/rooms\/([A-Z2-9]{6})(\/ws)?$/);
    if (!m) return json({ error: 'not-found' }, 404, cors(req));
    const code = m[1] as string;
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));

    if (!m[2]) {
      const info = await stub.info();
      return json(info, info.exists ? 200 : 404, cors(req));
    }
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'upgrade' }, 426, cors(req));
    const role = url.searchParams.get('role');
    if (role !== 'host' && role !== 'guest') return json({ error: 'role' }, 400, cors(req));
    return stub.fetch(req);
  },
} satisfies ExportedHandler<Env>;

type Role = 'host' | 'guest';

interface Attachment {
  role: Role;
}

export class Room extends DurableObject<Env> {
  /** Host creates the room. Returns false if the code is already in use. */
  async create(): Promise<boolean> {
    const existing = await this.ctx.storage.get<number>('created');
    if (existing && this.ctx.getWebSockets().length > 0) return false;
    await this.ctx.storage.put('created', Date.now());
    await this.ctx.storage.setAlarm(Date.now() + UNUSED_TTL_MS);
    return true;
  }

  async info(): Promise<{ exists: boolean; host: boolean; guest: boolean }> {
    const created = await this.ctx.storage.get<number>('created');
    return {
      exists: !!created,
      host: this.socketFor('host') !== null,
      guest: this.socketFor('guest') !== null,
    };
  }

  private socketFor(role: Role): WebSocket | null {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a?.role === role) return ws;
    }
    return null;
  }

  override async fetch(req: Request): Promise<Response> {
    const created = await this.ctx.storage.get<number>('created');
    if (!created) return json({ error: 'no-room' }, 404);
    const role = new URL(req.url).searchParams.get('role') as Role;

    // A reconnecting player replaces their previous socket; a stranger is refused
    // when the seat is taken.
    const existing = this.socketFor(role);
    if (existing) {
      try {
        existing.close(4000, 'replaced');
      } catch {
        /* ignore */
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment({ role } satisfies Attachment);
    // Keepalive without waking the object: the runtime answers pings itself.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    await this.ctx.storage.deleteAlarm();

    const peer = this.socketFor(role === 'host' ? 'guest' : 'host');
    server.send(JSON.stringify({ t: 'relay', k: 'welcome', role, peer: peer !== null }));
    if (peer) peer.send(JSON.stringify({ t: 'relay', k: 'peer-joined', role }));
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string' || message.length > 16384) return;
    const a = ws.deserializeAttachment() as Attachment | null;
    if (!a) return;
    const peer = this.socketFor(a.role === 'host' ? 'guest' : 'host');
    if (peer) {
      try {
        peer.send(message);
      } catch {
        /* peer is gone; close event will follow */
      }
    }
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    await this.dropped(ws, code);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.dropped(ws, 1011);
  }

  private async dropped(ws: WebSocket, code: number): Promise<void> {
    const a = ws.deserializeAttachment() as Attachment | null;
    try {
      ws.close(1000, 'bye');
    } catch {
      /* already closed */
    }
    // 4000 = replaced by a reconnect of the same role: the peer never notices.
    if (a && code !== 4000) {
      const peer = this.socketFor(a.role === 'host' ? 'guest' : 'host');
      if (peer) peer.send(JSON.stringify({ t: 'relay', k: 'peer-left', role: a.role }));
    }
    if (this.ctx.getWebSockets().length === 0) await this.ctx.storage.setAlarm(Date.now() + IDLE_TTL_MS);
  }

  override async alarm(): Promise<void> {
    if (this.ctx.getWebSockets().length > 0) return;
    await this.ctx.storage.deleteAll();
  }
}
