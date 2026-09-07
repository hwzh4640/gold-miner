import { describe, it, expect } from 'vitest';
import { compactFromSdp, decodeCompact, encodeCompact, parseCandidate, sdpFromCompact } from '../src/net/sdp';

// Trimmed from a real Chrome datachannel-only offer.
const CHROME_OFFER = [
  'v=0',
  'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'a=extmap-allow-mixed',
  'a=msid-semantic: WMS',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=candidate:2999745851 1 udp 2122260223 192.168.1.23 51234 typ host generation 0 network-id 1 network-cost 10',
  'a=candidate:1234 1 udp 2122262783 2601:646:8000:abcd::1f3a 51235 typ host generation 0 network-id 2',
  'a=candidate:842163049 1 udp 1686052607 73.162.10.5 51234 typ srflx raddr 192.168.1.23 rport 51234 generation 0 network-id 1 network-cost 10',
  'a=candidate:3388 1 tcp 1518280447 192.168.1.23 9 typ host tcptype active generation 0 network-id 1',
  'a=candidate:77 1 udp 2122260223 a1b2c3d4-e5f6-7890-abcd-ef1234567890.local 60001 typ host generation 0',
  'a=ice-ufrag:Kq8T',
  'a=ice-pwd:V9XkYtRk3Hx0f1b2p4gLhO7Q',
  'a=ice-options:trickle',
  'a=fingerprint:sha-256 6B:8B:F0:65:5F:78:E2:51:3B:AC:6F:F3:3F:46:1B:35:DC:B8:5F:64:1A:24:C2:43:F0:A1:58:D0:A1:2C:19:08',
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=max-message-size:262144',
  '',
].join('\r\n');

describe('compact SDP', () => {
  it('extracts credentials, fingerprint and udp candidates (IPv4, IPv6, mDNS), skipping tcp', () => {
    const c = compactFromSdp(CHROME_OFFER, 'offer');
    expect(c.ufrag).toBe('Kq8T');
    expect(c.pwd).toBe('V9XkYtRk3Hx0f1b2p4gLhO7Q');
    expect(c.fingerprint.length).toBe(32);
    expect(c.fingerprint[0]).toBe(0x6b);
    expect(c.candidates.map((x) => x.type)).toEqual(['host', 'host', 'srflx', 'host']);
    expect(c.candidates[1]!.address).toBe('2601:646:8000:abcd::1f3a');
    expect(c.candidates[3]!.address).toMatch(/\.local$/);
  });

  it('round-trips through the binary code and stays short', () => {
    const c = compactFromSdp(CHROME_OFFER, 'offer');
    const code = encodeCompact(c);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(260);
    const d = decodeCompact(code);
    expect(d).not.toBeNull();
    expect(d!.role).toBe('offer');
    expect(d!.ufrag).toBe(c.ufrag);
    expect(d!.pwd).toBe(c.pwd);
    expect(Array.from(d!.fingerprint)).toEqual(Array.from(c.fingerprint));
    expect(d!.candidates).toEqual(c.candidates);
  });

  it('merges trickled candidates and de-duplicates', () => {
    const c = compactFromSdp(CHROME_OFFER, 'answer', [
      'candidate:842163049 1 udp 1686052607 73.162.10.5 51234 typ srflx raddr 192.168.1.23 rport 51234',
      'candidate:9 1 udp 1686052607 73.162.10.5 51299 typ srflx raddr 0.0.0.0 rport 0',
    ]);
    expect(c.candidates.filter((x) => x.type === 'srflx').length).toBe(2);
    expect(decodeCompact(encodeCompact(c))!.role).toBe('answer');
  });

  it('rebuilds a well-formed datachannel SDP', () => {
    const c = compactFromSdp(CHROME_OFFER, 'offer');
    const sdp = sdpFromCompact(decodeCompact(encodeCompact(c))!);
    expect(sdp).toContain('m=application 9 UDP/DTLS/SCTP webrtc-datachannel');
    expect(sdp).toContain('a=ice-ufrag:Kq8T');
    expect(sdp).toContain('a=fingerprint:sha-256 6B:8B:F0:65');
    expect(sdp).toContain('a=setup:actpass');
    expect(sdp).toContain('typ srflx raddr 0.0.0.0 rport 0');
    expect(sdp).toContain('a=end-of-candidates');
    expect(sdp.match(/a=candidate:/g)!.length).toBe(4);
    const answer = sdpFromCompact({ ...c, role: 'answer' });
    expect(answer).toContain('a=setup:active');
    for (const line of sdp.split('\r\n').filter(Boolean)) expect(line).toMatch(/^[a-z]=/);
  });

  it('rejects garbage and tampered codes', () => {
    expect(decodeCompact('')).toBeNull();
    expect(decodeCompact('not base64!')).toBeNull();
    expect(decodeCompact('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBeNull();
    const good = encodeCompact(compactFromSdp(CHROME_OFFER, 'offer'));
    const bad = good.slice(0, 10) + (good[10] === 'A' ? 'B' : 'A') + good.slice(11);
    expect(decodeCompact(bad)).toBeNull();
  });

  it('parses candidate strings from RTCIceCandidate', () => {
    expect(parseCandidate('candidate:1 1 udp 2122260223 10.0.0.2 5000 typ host')).toEqual({ type: 'host', address: '10.0.0.2', port: 5000 });
    expect(parseCandidate('candidate:1 2 udp 2122260223 10.0.0.2 5000 typ host')).toBeNull(); // rtcp component
    expect(parseCandidate('candidate:1 1 tcp 1 10.0.0.2 9 typ host tcptype active')).toBeNull();
  });
});
