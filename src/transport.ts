import { createHmac, timingSafeEqual } from 'crypto';

/** Verify HMAC `v1={hex}` signature over `v1:{timestamp}:{body}`. */
export function verifySignature(
    signingSecret: string,
    signature: string | undefined,
    timestamp: string | undefined,
    body: string,
    maxTimestampSkewSeconds: number,
): boolean {
    if (!signature || !timestamp) return false;
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return false;

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > maxTimestampSkewSeconds) return false;

    const payload = `v1:${ts}:${body}`;
    const expected = `v1=${createHmac('sha256', signingSecret).update(payload).digest('hex')}`;
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
}

/** Sign a body the same way Qefro signed ingest verifies (`v1:{timestamp}:{body}`). */
export function signBody(
    signingSecret: string,
    body: string,
    timestampSeconds = Math.floor(Date.now() / 1000),
): { signature: string; timestamp: string } {
    const payload = `v1:${timestampSeconds}:${body}`;
    return {
        signature: `v1=${createHmac('sha256', signingSecret).update(payload).digest('hex')}`,
        timestamp: String(timestampSeconds),
    };
}
