/**
 * Hand-carried signalling: invite and reply codes travel in URL fragments.
 *   #o=<code>  invite (host → guest)      #a=<code>  reply (guest → host)
 * When the host taps the reply link, iOS opens a fresh tab; that tab hands the code to
 * the original game tab over a BroadcastChannel, so the host never has to paste.
 */
const CHANNEL = 'goldminer-signal';

export type SignalMsg = { type: 'reply'; code: string } | { type: 'ack' };

export function parseHash(hash: string = location.hash): { kind: 'invite' | 'reply' | 'save' | null; code: string } {
  const m = hash.match(/^#(o|a|g)=([A-Za-z0-9_-]+)$/);
  if (!m) return { kind: null, code: '' };
  const kind = m[1] === 'o' ? 'invite' : m[1] === 'a' ? 'reply' : 'save';
  return { kind, code: m[2] as string };
}

/** Accepts a bare code or a full link and returns the code (or null). */
export function extractCode(text: string, expected: 'invite' | 'reply'): string | null {
  const s = text.trim();
  const fromHash = s.match(/#(o|a)=([A-Za-z0-9_-]+)/);
  if (fromHash) {
    const kind = fromHash[1] === 'o' ? 'invite' : 'reply';
    return kind === expected ? (fromHash[2] as string) : null;
  }
  return /^[A-Za-z0-9_-]{40,}$/.test(s) ? s : null;
}

export function inviteLink(code: string): string {
  return `${location.origin}${location.pathname}#o=${code}`;
}
export function replyLink(code: string): string {
  return `${location.origin}${location.pathname}#a=${code}`;
}

export function clearHash(): void {
  history.replaceState(null, '', location.pathname + location.search);
}

function channel(): BroadcastChannel | null {
  return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
}

/** Host lobby: listen for a reply posted by another tab. Returns an unsubscribe function. */
export function listenForReply(onReply: (code: string) => void): () => void {
  const ch = channel();
  if (!ch) return () => {};
  ch.onmessage = (ev: MessageEvent<SignalMsg>) => {
    if (ev.data?.type === 'reply' && typeof ev.data.code === 'string') {
      ch.postMessage({ type: 'ack' } satisfies SignalMsg);
      onReply(ev.data.code);
    }
  };
  return () => ch.close();
}

/**
 * Reply tab: broadcast the code and report whether a game tab acknowledged it.
 * Resolves true on ack, false after the timeout.
 */
export function deliverReply(code: string, timeoutMs = 1500): Promise<boolean> {
  const ch = channel();
  if (!ch) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      ch.close();
      resolve(false);
    }, timeoutMs);
    ch.onmessage = (ev: MessageEvent<SignalMsg>) => {
      if (ev.data?.type === 'ack') {
        clearTimeout(timer);
        ch.close();
        resolve(true);
      }
    };
    ch.postMessage({ type: 'reply', code } satisfies SignalMsg);
  });
}

export async function shareOrCopy(url: string, title: string): Promise<'shared' | 'copied' | 'failed'> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'failed';
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
