import { createHmac } from 'crypto';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    Qefro,
    validateMarketingDefinition,
    toMarketingCapability,
} from '../dist/index.mjs';

function sign(secret, body, ts = Math.floor(Date.now() / 1000)) {
    const payload = `v1:${ts}:${body}`;
    const signature = `v1=${createHmac('sha256', secret).update(payload).digest('hex')}`;
    return { signature, timestamp: String(ts) };
}

const validDef = {
    version: 1,
    audiences: [
        {
            id: 'vip_guests',
            label: 'VIP guests',
            source: 'customer_hub',
            customerHub: { tags: ['vip'], consentPurpose: 'marketing' },
        },
        {
            id: 'recent_diners',
            label: 'Recent diners',
            source: 'app_query',
            appQuery: { tool: 'restaurant.listReservations', input: { limit: 50 } },
        },
        {
            id: 'walkins',
            label: 'Walk-ins',
            source: 'static_filter',
            staticFilter: { channel: 'walk_in' },
        },
    ],
    variables: [
        {
            id: 'guest_name',
            label: 'Guest name',
            type: 'string',
            source: 'customer_hub',
            path: 'display_name',
            required: true,
        },
        {
            id: 'offer_code',
            label: 'Offer code',
            type: 'string',
            source: 'campaign',
        },
    ],
    actions: [
        {
            id: 'book_table',
            label: 'Book a table',
            kind: 'url',
            landingPageId: 'booking',
            urlTemplate: 'https://example.com/book?code={{offer_code}}',
        },
        {
            id: 'whatsapp_reply',
            label: 'Reply on WhatsApp',
            kind: 'whatsapp_cta',
            payload: { text: 'Book now' },
        },
    ],
    landingPages: [
        { id: 'booking', label: 'Booking', path: '/booking', host: 'app' },
        { id: 'menu', label: 'Menu', path: '/menu', host: 'platform' },
    ],
    channels: [
        { id: 'whatsapp', provider: 'meta', enabled: true },
        { id: 'email', provider: 'sendgrid', enabled: true },
        { id: 'website_widget', enabled: true },
    ],
};

describe('marketing schema validation', () => {
    it('accepts a full valid definition', () => {
        const reg = validateMarketingDefinition(validDef);
        assert.equal(reg.version, 1);
        assert.equal(reg.audiences.length, 3);
        assert.equal(reg.channels[0].provider, 'meta');
        assert.equal(reg.channels[1].provider, 'sendgrid');
        assert.deepEqual(toMarketingCapability(reg), {
            version: 1,
            metadata: {
                audiences: reg.audiences,
                variables: reg.variables,
                actions: reg.actions,
                landingPages: reg.landingPages,
                channels: reg.channels,
            },
        });
    });

    it('defaults version and empty arrays', () => {
        const reg = validateMarketingDefinition({});
        assert.equal(reg.version, 1);
        assert.deepEqual(reg.audiences, []);
        assert.deepEqual(reg.variables, []);
        assert.deepEqual(reg.actions, []);
        assert.deepEqual(reg.landingPages, []);
        assert.deepEqual(reg.channels, []);
    });

    it('rejects invalid audience source', () => {
        assert.throws(
            () =>
                validateMarketingDefinition({
                    audiences: [{ id: 'a', label: 'A', source: 'crm' }],
                }),
            /audiences\[0\]\.source/,
        );
    });

    it('rejects duplicate ids', () => {
        assert.throws(
            () =>
                validateMarketingDefinition({
                    channels: [
                        { id: 'whatsapp' },
                        { id: 'whatsapp', provider: 'meta' },
                    ],
                }),
            /duplicate channel id/,
        );
    });

    it('rejects action landingPageId that does not exist', () => {
        assert.throws(
            () =>
                validateMarketingDefinition({
                    actions: [{ id: 'a', label: 'A', kind: 'url', landingPageId: 'missing' }],
                    landingPages: [{ id: 'home', label: 'Home', path: '/', host: 'app' }],
                }),
            /landingPageId "missing"/,
        );
    });

    it('rejects invalid variable type and action kind', () => {
        assert.throws(
            () =>
                validateMarketingDefinition({
                    variables: [{ id: 'x', label: 'X', type: 'json', source: 'literal' }],
                }),
            /variables\[0\]\.type/,
        );
        assert.throws(
            () =>
                validateMarketingDefinition({
                    actions: [{ id: 'x', label: 'X', kind: 'sms' }],
                }),
            /actions\[0\]\.kind/,
        );
    });

    it('rejects calling marketing twice', () => {
        const app = new Qefro({ signingSecret: 's' });
        app.marketing({ channels: [{ id: 'email' }] });
        assert.throws(() => app.marketing({ channels: [{ id: 'whatsapp' }] }), /only be called once/);
    });
});

describe('capabilities.list marketing wire shape', () => {
    it('omits marketing when not registered', async () => {
        const secret = 'test-secret';
        const app = new Qefro({ signingSecret: secret });
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
        assert.equal(caps.marketing, undefined);
    });

    it('emits nested { version, metadata } when registered', async () => {
        const secret = 'test-secret';
        const app = new Qefro({ signingSecret: secret });
        app.marketing(validDef);

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
        assert.ok(caps.marketing);
        assert.equal(caps.marketing.version, 1);
        assert.ok(caps.marketing.metadata);
        assert.equal(caps.marketing.metadata.audiences.length, 3);
        assert.equal(caps.marketing.metadata.variables.length, 2);
        assert.equal(caps.marketing.metadata.actions.length, 2);
        assert.equal(caps.marketing.metadata.landingPages.length, 2);
        assert.equal(caps.marketing.metadata.channels.length, 3);
        assert.equal(caps.marketing.metadata.channels[0].provider, 'meta');
        assert.equal(caps.marketing.metadata.channels[1].provider, 'sendgrid');
        assert.equal(caps.marketing.metadata.channels[2].id, 'website_widget');
        // No flat audiences/variables at marketing root — nested under metadata only.
        assert.equal(caps.marketing.audiences, undefined);
    });
});
