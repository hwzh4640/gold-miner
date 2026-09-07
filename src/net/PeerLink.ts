import { compactFromSdp, decodeCompact, encodeCompact, sdpFromCompact } from './sdp';

export type PeerRole = 'host' | 'guest';

export interface PeerLinkEvents {
  onOpen(): void;
  onMessage(msg: unknown): void;
  onSnapshot(msg: unknown): void;
  onClose(reason: 'closed' | 'failed'): void;
}

/** How long to wait for ICE gathering before we go with what we have. */
const GATHER_TIMEOUT_MS = 5000;
/** How long the host waits for the connection to come up after applying the reply. */
export const CONNECT_TIMEOUT_MS = 20000;

function iceServers(): RTCIceServer[] {
  const raw = import.meta.env.VITE_ICE_SERVERS as string | undefined;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as RTCIceServer[];
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      /* fall through to defaults */
    }
  }
  return [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
}

export function webrtcSupported(): boolean {
  return typeof RTCPeerConnection !== 'undefined';
}

/**
 * A direct phone-to-phone link over WebRTC data channels, signalled by hand:
 * host → invite code → guest → reply code → host. Two channels: `ctl` (reliable,
 * ordered) for everything that must arrive, `snap` (unreliable, unordered) for the
 * 20 Hz state snapshots where only the newest matters.
 */
export class PeerLink {
  readonly pc: RTCPeerConnection;
  readonly ctl: RTCDataChannel;
  readonly snap: RTCDataChannel;
  private candidates: string[] = [];
  private opened = false;
  private closed = false;
  private events: PeerLinkEvents;
  /** Late-bound handlers so a session can take over a link created by the lobby. */
  onMessageHandler: ((msg: unknown) => void) | null = null;
  onSnapshotHandler: ((msg: unknown) => void) | null = null;
  onCloseHandler: ((reason: 'closed' | 'failed') => void) | null = null;

  constructor(readonly role: PeerRole, events: Partial<PeerLinkEvents> = {}) {
    this.events = { onOpen() {}, onMessage() {}, onSnapshot() {}, onClose() {}, ...events };
    this.pc = new RTCPeerConnection({ iceServers: iceServers() });
    // Negotiated channels with fixed ids exist on both sides without in-band setup,
    // which is what lets the hand-carried SDP stay tiny.
    this.ctl = this.pc.createDataChannel('ctl', { negotiated: true, id: 0, ordered: true });
    this.snap = this.pc.createDataChannel('snap', { negotiated: true, id: 1, ordered: false, maxRetransmits: 0 });
    this.pc.onicecandidate = (ev) => {
      if (ev.candidate?.candidate) this.candidates.push(ev.candidate.candidate);
    };
    this.pc.onconnectionstatechange = () => {
      const st = this.pc.connectionState;
      if (st === 'failed') this.fail('failed');
      else if (st === 'closed' || st === 'disconnected') this.fail('closed');
    };
    this.ctl.onopen = () => this.maybeOpen();
    this.snap.onopen = () => this.maybeOpen();
    this.ctl.onclose = () => this.fail('closed');
    this.ctl.onmessage = (ev) => {
      const m = safeParse(ev.data);
      this.events.onMessage(m);
      this.onMessageHandler?.(m);
    };
    this.snap.onmessage = (ev) => {
      const m = safeParse(ev.data);
      this.events.onSnapshot(m);
      this.onSnapshotHandler?.(m);
    };
  }

  get isOpen(): boolean {
    return this.opened && !this.closed;
  }

  private maybeOpen(): void {
    if (this.opened || this.ctl.readyState !== 'open' || this.snap.readyState !== 'open') return;
    this.opened = true;
    this.events.onOpen();
  }

  private fail(reason: 'closed' | 'failed'): void {
    if (this.closed) return;
    this.closed = true;
    this.events.onClose(reason);
    this.onCloseHandler?.(reason);
  }

  private async gather(): Promise<void> {
    if (this.pc.iceGatheringState === 'complete') return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(done, GATHER_TIMEOUT_MS);
      const handler = () => {
        if (this.pc.iceGatheringState === 'complete') done();
      };
      function done() {
        clearTimeout(timer);
        resolve();
      }
      this.pc.addEventListener('icegatheringstatechange', handler);
    });
  }

  /** Host: build the invite code. */
  async createInvite(): Promise<string> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this.gather();
    const sdp = this.pc.localDescription?.sdp ?? offer.sdp ?? '';
    return encodeCompact(compactFromSdp(sdp, 'offer', this.candidates));
  }

  /** Guest: consume the invite, produce the reply code. */
  async acceptInvite(code: string): Promise<string> {
    const c = decodeCompact(code);
    if (!c || c.role !== 'offer') throw new Error('bad-invite');
    await this.pc.setRemoteDescription({ type: 'offer', sdp: sdpFromCompact(c) });
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this.gather();
    const sdp = this.pc.localDescription?.sdp ?? answer.sdp ?? '';
    return encodeCompact(compactFromSdp(sdp, 'answer', this.candidates));
  }

  /** Host: apply the guest's reply. Resolves when the channels are open. */
  async acceptReply(code: string, timeoutMs = CONNECT_TIMEOUT_MS): Promise<void> {
    const c = decodeCompact(code);
    if (!c || c.role !== 'answer') throw new Error('bad-reply');
    if (this.pc.signalingState !== 'have-local-offer') throw new Error('expired');
    await this.pc.setRemoteDescription({ type: 'answer', sdp: sdpFromCompact(c) });
    await this.waitOpen(timeoutMs);
  }

  waitOpen(timeoutMs = CONNECT_TIMEOUT_MS): Promise<void> {
    if (this.isOpen) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.close();
        reject(new Error('timeout'));
      }, timeoutMs);
      const prevOpen = this.events.onOpen;
      const prevClose = this.events.onClose;
      this.events.onOpen = () => {
        clearTimeout(timer);
        this.events.onOpen = prevOpen;
        this.events.onClose = prevClose;
        prevOpen();
        resolve();
      };
      this.events.onClose = (r) => {
        clearTimeout(timer);
        this.events.onClose = prevClose;
        prevClose(r);
        reject(new Error(r));
      };
    });
  }

  send(msg: unknown): void {
    if (this.ctl.readyState === 'open') this.ctl.send(JSON.stringify(msg));
  }

  sendSnapshot(msg: unknown): void {
    if (this.snap.readyState === 'open') this.snap.send(JSON.stringify(msg));
  }

  close(): void {
    this.fail('closed');
    try {
      this.ctl.close();
      this.snap.close();
      this.pc.close();
    } catch {
      /* ignore */
    }
  }
}

function safeParse(data: unknown): unknown {
  if (typeof data !== 'string') return null;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return null;
  }
}
