import { createHmac } from 'crypto';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    Qefro,
    validateOrganizationDefinition,
    toOrganizationCapability,
} from '../dist/index.mjs';

function sign(secret, body, ts = Math.floor(Date.now() / 1000)) {
    const payload = `v1:${ts}:${body}`;
    const signature = `v1=${createHmac('sha256', secret).update(payload).digest('hex')}`;
    return { signature, timestamp: String(ts) };
}

const validDef = {
    version: 1,
    events: [
        { id: 'purchase_requested', label: 'Purchase requested' },
        { id: 'stock_low', label: 'Stock low', description: 'Inventory below threshold' },
    ],
    actions: [
        { id: 'create_purchase_request', label: 'Create purchase request' },
        { id: 'approve_refund', label: 'Approve refund' },
    ],
    tasks: [
        {
            id: 'purchase_approval',
            label: 'Purchase approval',
            suggested_workspace_type: 'finance',
            priority: 'high',
        },
        {
            id: 'refund_review',
            label: 'Refund review',
            suggested_team: 'front_of_house',
        },
    ],
};

describe('organization schema validation', () => {
    it('accepts a full valid definition', () => {
        const caps = validateOrganizationDefinition(validDef);
        assert.equal(caps.version, 1);
        assert.equal(caps.events.length, 2);
        assert.equal(caps.actions.length, 2);
        assert.equal(caps.tasks[0].suggested_workspace_type, 'finance');
        assert.deepEqual(toOrganizationCapability(caps), {
            version: 1,
            metadata: {
                events: caps.events,
                actions: caps.actions,
                tasks: caps.tasks,
            },
        });
    });

    it('defaults version and empty arrays', () => {
        const caps = validateOrganizationDefinition({});
        assert.equal(caps.version, 1);
        assert.deepEqual(caps.events, []);
        assert.deepEqual(caps.actions, []);
        assert.deepEqual(caps.tasks, []);
    });

    it('rejects app-prefixed capability ids', () => {
        assert.throws(
            () =>
                validateOrganizationDefinition({
                    events: [{ id: 'restaurant.purchase_requested' }],
                }),
            /opaque capability id/,
        );
    });

    it('rejects templates (Phase 4 org assets)', () => {
        assert.throws(
            () =>
                validateOrganizationDefinition({
                    templates: [{ id: 'purchase_approval' }],
                }),
            /templates are organization-owned/,
        );
    });

    it('rejects duplicate ids across kinds', () => {
        assert.throws(
            () =>
                validateOrganizationDefinition({
                    events: [{ id: 'same' }],
                    actions: [{ id: 'same' }],
                }),
            /duplicate capability id/,
        );
    });

    it('rejects calling organization() twice', () => {
        const app = new Qefro({ signingSecret: 'test-secret' });
        app.organization({ events: [{ id: 'a' }] });
        assert.throws(() => app.organization({ events: [{ id: 'b' }] }), /only be called once/);
    });
});

describe('capabilities.list.organization', () => {
    it('emits organization when registered', async () => {
        const secret = 'test-secret';
        const app = new Qefro({ signingSecret: secret });
        app.organization(validDef);

        const body = JSON.stringify({
            protocol_version: '1',
            request_id: 'r1',
            type: 'capabilities.list',
        });
        const { signature, timestamp } = sign(secret, body);
        const caps = await app.handleRaw(body, {
            'x-qefro-signature': signature,
            'x-qefro-timestamp': timestamp,
        });
        assert.equal(caps.type, 'capabilities.list');
        assert.ok(caps.organization);
        assert.equal(caps.organization.version, 1);
        assert.equal(caps.organization.metadata.events[0].id, 'purchase_requested');
        assert.equal(caps.organization.metadata.actions[0].id, 'create_purchase_request');
        assert.equal(caps.organization.metadata.templates, undefined);
    });

    it('omits organization when not registered', async () => {
        const secret = 'test-secret';
        const app = new Qefro({ signingSecret: secret });

        const body = JSON.stringify({
            protocol_version: '1',
            request_id: 'r2',
            type: 'capabilities.list',
        });
        const { signature, timestamp } = sign(secret, body);
        const caps = await app.handleRaw(body, {
            'x-qefro-signature': signature,
            'x-qefro-timestamp': timestamp,
        });
        assert.equal(caps.type, 'capabilities.list');
        assert.equal(caps.organization, undefined);
    });
});
