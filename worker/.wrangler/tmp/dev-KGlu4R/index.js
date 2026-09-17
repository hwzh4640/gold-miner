var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
import { DurableObject } from "cloudflare:workers";
var ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var CODE_LEN = 6;
var IDLE_TTL_MS = 2 * 60 * 60 * 1e3;
var UNUSED_TTL_MS = 10 * 60 * 1e3;
function randomCode() {
  const bytes = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
__name(randomCode, "randomCode");
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...extra } });
}
__name(json, "json");
function originAllowed(req, env) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return allowed.includes(origin);
}
__name(originAllowed, "originAllowed");
function cors(req) {
  const origin = req.headers.get("origin") ?? "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400"
  };
}
__name(cors, "cors");
var src_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
    if (url.pathname === "/healthz") return json({ ok: true }, 200, cors(req));
    if (!originAllowed(req, env)) return json({ error: "origin" }, 403);
    if (req.method === "POST" && url.pathname === "/rooms") {
      for (let i = 0; i < 5; i++) {
        const code2 = randomCode();
        const stub2 = env.ROOMS.get(env.ROOMS.idFromName(code2));
        const created = await stub2.create();
        if (created) return json({ code: code2 }, 200, cors(req));
      }
      return json({ error: "busy" }, 503, cors(req));
    }
    const m = url.pathname.match(/^\/rooms\/([A-Z2-9]{6})(\/ws)?$/);
    if (!m) return json({ error: "not-found" }, 404, cors(req));
    const code = m[1];
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    if (!m[2]) {
      const info = await stub.info();
      return json(info, info.exists ? 200 : 404, cors(req));
    }
    if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return json({ error: "upgrade" }, 426, cors(req));
    const role = url.searchParams.get("role");
    if (role !== "host" && role !== "guest") return json({ error: "role" }, 400, cors(req));
    return stub.fetch(req);
  }
};
var Room = class extends DurableObject {
  static {
    __name(this, "Room");
  }
  /** Host creates the room. Returns false if the code is already in use. */
  async create() {
    const existing = await this.ctx.storage.get("created");
    if (existing && this.ctx.getWebSockets().length > 0) return false;
    await this.ctx.storage.put("created", Date.now());
    await this.ctx.storage.setAlarm(Date.now() + UNUSED_TTL_MS);
    return true;
  }
  async info() {
    const created = await this.ctx.storage.get("created");
    return {
      exists: !!created,
      host: this.socketFor("host") !== null,
      guest: this.socketFor("guest") !== null
    };
  }
  socketFor(role) {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a?.role === role) return ws;
    }
    return null;
  }
  async fetch(req) {
    const created = await this.ctx.storage.get("created");
    if (!created) return json({ error: "no-room" }, 404);
    const role = new URL(req.url).searchParams.get("role");
    const existing = this.socketFor(role);
    if (existing) {
      try {
        existing.close(4e3, "replaced");
      } catch {
      }
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment({ role });
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    await this.ctx.storage.deleteAlarm();
    const peer = this.socketFor(role === "host" ? "guest" : "host");
    server.send(JSON.stringify({ t: "relay", k: "welcome", role, peer: peer !== null }));
    if (peer) peer.send(JSON.stringify({ t: "relay", k: "peer-joined", role }));
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws, message) {
    if (typeof message !== "string" || message.length > 16384) return;
    const a = ws.deserializeAttachment();
    if (!a) return;
    const peer = this.socketFor(a.role === "host" ? "guest" : "host");
    if (peer) {
      try {
        peer.send(message);
      } catch {
      }
    }
  }
  async webSocketClose(ws, code) {
    await this.dropped(ws, code);
  }
  async webSocketError(ws) {
    await this.dropped(ws, 1011);
  }
  async dropped(ws, code) {
    const a = ws.deserializeAttachment();
    try {
      ws.close(1e3, "bye");
    } catch {
    }
    if (a && code !== 4e3) {
      const peer = this.socketFor(a.role === "host" ? "guest" : "host");
      if (peer) peer.send(JSON.stringify({ t: "relay", k: "peer-left", role: a.role }));
    }
    if (this.ctx.getWebSockets().length === 0) await this.ctx.storage.setAlarm(Date.now() + IDLE_TTL_MS);
  }
  async alarm() {
    if (this.ctx.getWebSockets().length > 0) return;
    await this.ctx.storage.deleteAll();
  }
};

// ../node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-6NKLIB/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-6NKLIB/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  Room,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
