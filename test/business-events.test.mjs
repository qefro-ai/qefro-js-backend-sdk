import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, it } from 'node:test';
import { createHmac } from 'crypto';
import { Qefro, stableEventId } from '../dist/index.mjs';

function sign(secret, body, ts = Math.floor(Date.now() / 1000)) {
    const payload = `v1:${ts}:${body}`;
    const signature = `v1=${createHmac('sha256', secret).update(payload).digest('hex')}`;
    return { signature, timestamp: String(ts) };
}

describe('Business Event hardening', () => {
    it('stableEventId is unique per event type', () => {
        assert.equal(stableEventId('quotation.created', 'Q-1001'), 'quotation.created:Q-1001');
        assert.equal(stableEventId('order.created', 'Q-1001'), 'order.created:Q-1001');
        assert.equal(
            stableEventId('quotation.created', 'quotation.created:Q-1001'),
            'quotation.created:Q-1001',
        );
    });

    it('ctx.emit persists a versioned durable event, not a capability', async () => {
        const secret = 'test-secret-events';
        const dir = mkdtempSync(join(tmpdir(), 'qefro-outbox-'));
        try {
            const app = new Qefro({ signingSecret: secret, eventOutboxDir: dir });
            app.businessEvent({
                event_type: 'quotation.created',
                version: 1,
                label: 'Quotation created',
            });
            app.tool('createQuotation', async (ctx) => {
                ctx.emit({
                    event_type: 'quotation.created',
                    event_id: 'Q-1001',
                    data: { amount: 125000 },
                });
                return { id: 'Q-1001' };
            });

            const invokeBody = JSON.stringify({
                protocol_version: '1',
                request_id: 'r-emit',
                type: 'tool.invoke',
                tool: 'createQuotation',
                conversation_id: 'c1',
                parameters: {},
            });
            const sig = sign(secret, invokeBody);
            const result = await app.handleRaw(invokeBody, {
                'x-qefro-signature': sig.signature,
                'x-qefro-timestamp': sig.timestamp,
            });
            assert.equal(result.type, 'result');
            assert.equal(result.events.length, 1);
            assert.equal(result.events[0].event_type, 'quotation.created');
            assert.equal(result.events[0].event_id, 'quotation.created:Q-1001');
            assert.equal(result.events[0].version, 1);

            const capsBody = JSON.stringify({
                protocol_version: '1',
                request_id: 'r-caps',
                type: 'capabilities.list',
            });
            const capsSig = sign(secret, capsBody);
            const caps = await app.handleRaw(capsBody, {
                'x-qefro-signature': capsSig.signature,
                'x-qefro-timestamp': capsSig.timestamp,
            });
            assert.equal(caps.business_events[0].version, 1);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
