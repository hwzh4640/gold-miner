/**
 * Compact, URL-safe encoding of a WebRTC offer/answer for datachannel-only sessions.
 *
 * A browser SDP is ~1.5–3 KB, but everything a peer actually needs to connect fits in a
 * few hundred bytes: ICE credentials, the DTLS fingerprint and the candidate list. We
 * strip an SDP down to that, and rebuild a standards-conforming SDP from it on the other
 * side, so the whole handshake can travel inside a URL fragment sent over iMessage.
 */

export type CandidateType = 'host' | 'srflx' | 'prflx' | 'relay';

export interface CompactCandidate {
  type: CandidateType;
  /** IPv4 dotted, IPv6 hex, or an mDNS hostname (`xxxx.local`). */
  address: string;
  port: number;
}

export interface CompactSdp {
  role: 'offer' | 'answer';
  ufrag: string;
  pwd: string;
  /** 32 raw bytes of the SHA-256 DTLS fingerprint. */
  fingerprint: Uint8Array;
  candidates: CompactCandidate[];
}

const VERSION = 1;
const TYPES: CandidateType[] = ['host', 'srflx', 'prflx', 'relay'];
const TYPE_PREF: Record<CandidateType, number> = { host: 126, prflx: 110, srflx: 100, relay: 0 };

/* ---------------- Parsing browser SDP ---------------- */

/** Parse an `a=candidate:` line (or `candidate:` string from RTCIceCandidate). Returns null for unusable ones. */
export function parseCandidate(line: string): CompactCandidate | null {
  const s = line.replace(/^a=/, '').replace(/^candidate:/, '');
  const parts = s.trim().split(/\s+/);
  // <foundation> <component> <transport> <priority> <address> <port> typ <type> ...
  if (parts.length < 8) return null;
  const [, component, transport, , address, portStr, typLabel, type] = parts;
  if (component !== '1' || transport?.toLowerCase() !== 'udp' || typLabel !== 'typ') return null;
  if (!type || !(TYPES as string[]).includes(type) || !address) return null;
  const port = Number(portStr);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return { type: type as CandidateType, address, port };
}

function parseFingerprint(hex: string): Uint8Array | null {
  const parts = hex.trim().split(':');
  if (parts.length !== 32) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    const v = parseInt(parts[i] as string, 16);
    if (Number.isNaN(v)) return null;
    out[i] = v;
  }
  return out;
}

/** Extract the essentials from a browser-generated SDP. Extra candidates can be merged in. */
export function compactFromSdp(sdp: string, role: 'offer' | 'answer', extraCandidates: string[] = []): CompactSdp {
  const lines = sdp.split(/\r?\n/);
  let ufrag = '';
  let pwd = '';
  let fingerprint: Uint8Array | null = null;
  const candidates: CompactCandidate[] = [];
  for (const line of lines) {
    if (line.startsWith('a=ice-ufrag:')) ufrag = ufrag || line.slice(12).trim();
    else if (line.startsWith('a=ice-pwd:')) pwd = pwd || line.slice(10).trim();
    else if (line.startsWith('a=fingerprint:sha-256 ')) fingerprint = fingerprint ?? parseFingerprint(line.slice(22));
    else if (line.startsWith('a=candidate:')) {
      const c = parseCandidate(line);
      if (c) candidates.push(c);
    }
  }
  for (const raw of extraCandidates) {
    const c = parseCandidate(raw);
    if (c) candidates.push(c);
  }
  if (!ufrag || !pwd) throw new Error('SDP has no ICE credentials');
  if (!fingerprint) throw new Error('SDP has no sha-256 fingerprint');
  return { role, ufrag, pwd, fingerprint, candidates: dedupe(candidates) };
}

function dedupe(cs: CompactCandidate[]): CompactCandidate[] {
  const seen = new Set<string>();
  const out: CompactCandidate[] = [];
  for (const c of cs) {
    const k = `${c.type}|${c.address}|${c.port}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

/* ---------------- Rebuilding SDP ---------------- */

function candidateLine(c: CompactCandidate, index: number): string {
  const priority = (1 << 24) * TYPE_PREF[c.type] + (1 << 8) * (65535 - index) + 255;
  const base = `a=candidate:${index + 1} 1 udp ${priority} ${c.address} ${c.port} typ ${c.type}`;
  return c.type === 'host' ? base : `${base} raddr 0.0.0.0 rport 0`;
}

/** Produce an SDP the browser will accept as a remote description. */
export function sdpFromCompact(c: CompactSdp): string {
  const fp = Array.from(c.fingerprint, (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
  const lines = [
    'v=0',
    'o=- 1 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    ...c.candidates.map(candidateLine),
    'a=end-of-candidates',
    `a=ice-ufrag:${c.ufrag}`,
    `a=ice-pwd:${c.pwd}`,
    `a=fingerprint:sha-256 ${fp}`,
    `a=setup:${c.role === 'offer' ? 'actpass' : 'active'}`,
    'a=mid:0',
    'a=sctp-port:5000',
    'a=max-message-size:262144',
  ];
  return lines.join('\r\n') + '\r\n';
}

/* ---------------- Binary codec ---------------- */

const enc = new TextEncoder();
const dec = new TextDecoder();

function ipv4(address: string): Uint8Array | null {
  const m = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const b = m.slice(1).map(Number);
  if (b.some((v) => v > 255)) return null;
  return Uint8Array.from(b);
}

function ipv6(address: string): Uint8Array | null {
  if (!address.includes(':')) return null;
  const zone = address.indexOf('%');
  const addr = zone >= 0 ? address.slice(0, zone) : address;
  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...head, ...Array<string>(missing).fill('0'), ...tail];
  const out = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    const v = parseInt(groups[i] as string, 16);
    if (Number.isNaN(v) || v > 0xffff) return null;
    out[i * 2] = v >> 8;
    out[i * 2 + 1] = v & 0xff;
  }
  return out;
}

function ipv6ToString(b: Uint8Array): string {
  const groups: string[] = [];
  for (let i = 0; i < 8; i++) groups.push(((b[i * 2]! << 8) | b[i * 2 + 1]!).toString(16));
  // Compress the longest run of zero groups.
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < 8; i++) {
    if (groups[i] !== '0') continue;
    let j = i;
    while (j < 8 && groups[j] === '0') j++;
    if (j - i > bestLen) {
      bestStart = i;
      bestLen = j - i;
    }
    i = j;
  }
  if (bestLen < 2) return groups.join(':');
  const left = groups.slice(0, bestStart).join(':');
  const right = groups.slice(bestStart + bestLen).join(':');
  return `${left}::${right}`;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function checksum(bytes: Uint8Array, len: number): number {
  let c = 0x37;
  for (let i = 0; i < len; i++) c = (c * 31 + (bytes[i] as number)) & 0xff;
  return c;
}

/**
 * Layout: [version|role<<7] [ufrag len][ufrag] [pwd len][pwd] [32 fingerprint]
 *         [n candidates] n × ([type | addrKind<<4] [addr…] [port u16]) [checksum]
 * addrKind: 0 = IPv4 (4 bytes), 1 = IPv6 (16 bytes), 2 = hostname (len + utf8)
 */
export function encodeCompact(c: CompactSdp): string {
  const parts: number[] = [];
  parts.push(VERSION | (c.role === 'answer' ? 0x80 : 0));
  const u = enc.encode(c.ufrag);
  const p = enc.encode(c.pwd);
  if (u.length > 255 || p.length > 255) throw new Error('credentials too long');
  parts.push(u.length, ...u, p.length, ...p, ...c.fingerprint);
  const cands = c.candidates.slice(0, 32);
  parts.push(cands.length);
  for (const cand of cands) {
    const v4 = ipv4(cand.address);
    const v6 = v4 ? null : ipv6(cand.address);
    const type = TYPES.indexOf(cand.type);
    if (v4) parts.push(type, ...v4);
    else if (v6) parts.push(type | 0x10, ...v6);
    else {
      const h = enc.encode(cand.address);
      parts.push(type | 0x20, h.length, ...h);
    }
    parts.push(cand.port >> 8, cand.port & 0xff);
  }
  const bytes = new Uint8Array(parts.length + 1);
  bytes.set(parts);
  bytes[parts.length] = checksum(bytes, parts.length);
  return toBase64Url(bytes);
}

export function decodeCompact(code: string): CompactSdp | null {
  const bytes = fromBase64Url(code.trim());
  if (!bytes || bytes.length < 40) return null;
  if (checksum(bytes, bytes.length - 1) !== bytes[bytes.length - 1]) return null;
  let i = 0;
  const head = bytes[i++]!;
  if ((head & 0x7f) !== VERSION) return null;
  const role = head & 0x80 ? 'answer' : 'offer';
  const take = (n: number): Uint8Array | null => {
    if (i + n > bytes.length - 1) return null;
    const out = bytes.subarray(i, i + n);
    i += n;
    return out;
  };
  const ul = bytes[i++]!;
  const u = take(ul);
  if (!u) return null;
  const pl = bytes[i++]!;
  const p = take(pl);
  if (!p) return null;
  const fp = take(32);
  if (!fp) return null;
  const n = bytes[i++]!;
  if (n === undefined) return null;
  const candidates: CompactCandidate[] = [];
  for (let k = 0; k < n; k++) {
    const tag = bytes[i++]!;
    const type = TYPES[tag & 0x0f];
    if (!type) return null;
    const kind = tag >> 4;
    let address: string;
    if (kind === 0) {
      const a = take(4);
      if (!a) return null;
      address = Array.from(a).join('.');
    } else if (kind === 1) {
      const a = take(16);
      if (!a) return null;
      address = ipv6ToString(a);
    } else if (kind === 2) {
      const hl = bytes[i++]!;
      const h = take(hl);
      if (!h) return null;
      address = dec.decode(h);
      if (!/^[A-Za-z0-9.-]+$/.test(address)) return null;
    } else return null;
    const port = take(2);
    if (!port) return null;
    candidates.push({ type, address, port: (port[0]! << 8) | port[1]! });
  }
  if (i !== bytes.length - 1) return null;
  const ufrag = dec.decode(u);
  const pwd = dec.decode(p);
  if (!/^[\x21-\x7e]+$/.test(ufrag) || !/^[\x21-\x7e]+$/.test(pwd)) return null;
  return { role, ufrag, pwd, fingerprint: new Uint8Array(fp), candidates };
}
