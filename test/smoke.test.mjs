import { createHmac } from 'crypto';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    Qefro,
    SDK_NAME,
    SDK_VERSION,
    normalizeLookup,
    normalizeFlowTrigger,
    PersonEvents,
    onPersonCreated,
} from '../dist/index.mjs';

function sign(secret, body, ts = Math.floor(Date.now() / 1000)) {
    const payload = `v1:${ts}:${body}`;
    const signature = `v1=${createHmac('sha256', secret).update(payload).digest('hex')}`;
    return { signature, timestamp: String(ts) };
}

describe('@qefro-ai/backend module split smoke', () => {
    it('exports version and brand constants', () => {
        assert.equal(SDK_NAME, '@qefro-ai/backend');
        assert.equal(SDK_VERSION, '1.7.0');
    });

    it('preserves named + default Qefro export', async () => {
        const mod = await import('../dist/index.mjs');
        assert.equal(mod.Qefro, mod.default);
    });

    it('normalizeLookup / PersonEvents helpers still work', () => {
        assert.deepEqual(normalizeLookup({ by: 'Email', required: ['phone', 'email'] }), [
            'phone',
            'email',
        ]);
        assert.equal(PersonEvents.Created, 'person.created');
        assert.deepEqual(onPersonCreated(), { type: 'event', event: 'person.created' });
        assert.deepEqual(normalizeFlowTrigger({ type: 'schedule', cron: '0 9 * * *' }), {
            type: 'schedule',
            cron: '0 9 * * *',
        });
    });

    it('ping / capabilities.list / tool.invoke protocol path', async () => {
        const secret = 'test-secret';
        const app = new Qefro({ signingSecret: secret });
        app.tool('echo', async (ctx) => ({ ok: true, n: ctx.parameters.n }), {
            description: 'echo',
        });
        app.flow({ id: 'welcome', name: 'Welcome' }).complete({ id: 'done', message: 'hi' });

        const pingBody = JSON.stringify({
            protocol_version: '1',
            request_id: 'r1',
            type: 'ping',
        });
        const pingSig = sign(secret, pingBody);
        const pong = await app.handleRaw(pingBody, {
            'x-qefro-signature': pingSig.signature,
            'x-qefro-timestamp': pingSig.timestamp,
        });
        assert.equal(pong.type, 'pong');
        assert.equal(pong.sdk_version, '1.7.0');

        const capsBody = JSON.stringify({
            protocol_version: '1',
            request_id: 'r2',
            type: 'capabilities.list',
        });
        const capsSig = sign(secret, capsBody);
        const caps = await app.handleRaw(capsBody, {
            'x-qefro-signature': capsSig.signature,
            'x-qefro-timestamp': capsSig.timestamp,
        });
        assert.equal(caps.type, 'capabilities.list');
        assert.equal(caps.sdk_name, '@qefro-ai/backend');
        assert.equal(caps.tools.length, 1);
        assert.equal(caps.tools[0].name, 'echo');
        assert.equal(caps.flows.length, 1);
        assert.equal(caps.flows[0].metadata.id, 'welcome');

        const invokeBody = JSON.stringify({
            protocol_version: '1',
            request_id: 'r3',
            type: 'tool.invoke',
            tool: 'echo',
            conversation_id: 'c1',
            parameters: { n: 7 },
        });
        const invokeSig = sign(secret, invokeBody);
        const result = await app.handleRaw(invokeBody, {
            'x-qefro-signature': invokeSig.signature,
            'x-qefro-timestamp': invokeSig.timestamp,
        });
        assert.equal(result.type, 'result');
        assert.deepEqual(result.output, { ok: true, n: 7 });
    });

    it('HTTP listen binds the real port and forwards trace id', async () => {
        const secret = 'test-secret';
        const app = new Qefro({ signingSecret: secret });
        app.tool('echo', async (ctx) => ({ trace: ctx.trace_id, n: ctx.parameters.n }));

        const handle = await app.listen({ port: 0, host: '127.0.0.1' });
        try {
            const url = new URL(handle.url);
            assert.notEqual(url.port, '0');
            const invokeBody = JSON.stringify({
                protocol_version: '1',
                request_id: 'r-http',
                type: 'tool.invoke',
                tool: 'echo',
                conversation_id: 'c-http',
                parameters: { n: 3 },
            });
            const invokeSig = sign(secret, invokeBody);
            const res = await fetch(`${handle.url}?ignored=1`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-qefro-signature': invokeSig.signature,
                    'x-qefro-timestamp': invokeSig.timestamp,
                    'x-qefro-trace-id': 'trace-http-1',
                },
                body: invokeBody,
            });
            assert.equal(res.ok, true);
            const result = await res.json();
            assert.equal(result.type, 'result');
            assert.deepEqual(result.output, { trace: 'trace-http-1', n: 3 });
        } finally {
            await handle.close();
        }
    });

    it('rejects invalid signatures', async () => {
        const app = new Qefro({ signingSecret: 'secret' });
        const body = JSON.stringify({ protocol_version: '1', request_id: 'r', type: 'ping' });
        const out = await app.handleRaw(body, {
            'x-qefro-signature': 'v1=deadbeef',
            'x-qefro-timestamp': String(Math.floor(Date.now() / 1000)),
        });
        assert.deepEqual(out, { error: 'invalid_signature' });
    });
});
