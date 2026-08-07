import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
    buildConsentContext,
    buildHubCustomerContext,
    buildMembershipContext,
    buildTimelineContext,
    envFlagTrue,
    hubCustomerFromPerson,
    isCustomerHubEnabled,
    isCustomerHubOptional,
} from '../dist/index.mjs';

const ENV_KEYS = [
    'QEFRO_CUSTOMER_HUB_ENABLED',
    'QEFRO_CUSTOMER_HUB_OPTIONAL',
    'QEFRO_CUSTOMER_HUB_URL',
];

afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
});

describe('Customer Hub flags', () => {
    it('defaults: enabled=false, optional=true', () => {
        assert.equal(isCustomerHubEnabled(), false);
        assert.equal(isCustomerHubOptional(), true);
        assert.equal(envFlagTrue('QEFRO_CUSTOMER_HUB_ENABLED', false), false);
        assert.equal(envFlagTrue('QEFRO_CUSTOMER_HUB_OPTIONAL', true), true);
    });

    it('parses on/off variants', () => {
        process.env.QEFRO_CUSTOMER_HUB_ENABLED = 'on';
        assert.equal(isCustomerHubEnabled(), true);
        process.env.QEFRO_CUSTOMER_HUB_ENABLED = 'off';
        assert.equal(isCustomerHubEnabled(), false);
        process.env.QEFRO_CUSTOMER_HUB_OPTIONAL = '0';
        assert.equal(isCustomerHubOptional(), false);
    });
});

describe('hubCustomerFromPerson', () => {
    it('maps Person fields to HubCustomer properties', () => {
        const hub = hubCustomerFromPerson({
            id: 'p1',
            name: 'Ada',
            phone: '+1555',
            email: 'a@b.c',
        });
        assert.equal(hub.id, 'p1');
        assert.equal(hub.display_name, 'Ada');
        assert.equal(hub.phone_number, '+1555');
        assert.equal(hub.whatsapp_number, '+1555');
        assert.equal(hub.email, 'a@b.c');
    });

    it('returns null without id', () => {
        assert.equal(hubCustomerFromPerson({ name: 'x' }), null);
        assert.equal(hubCustomerFromPerson(null), null);
    });
});

describe('optional hub behavior (no network)', () => {
    it('resolve returns null when disabled + optional', async () => {
        process.env.QEFRO_CUSTOMER_HUB_ENABLED = 'false';
        process.env.QEFRO_CUSTOMER_HUB_OPTIONAL = 'true';
        const state = { current: undefined, lookupCompleted: false };
        const customer = buildHubCustomerContext({
            identity: {},
            parameters: {},
            conversationId: 'c1',
            logger: console,
            state,
            consumeAuthOutcome: (o) => o,
        });
        assert.equal(await customer.resolve({ phone_number: '+1' }), null);
    });

    it('resolve throws when enabled, required, and hub missing', async () => {
        process.env.QEFRO_CUSTOMER_HUB_ENABLED = 'true';
        process.env.QEFRO_CUSTOMER_HUB_OPTIONAL = 'false';
        delete process.env.QEFRO_CUSTOMER_HUB_URL;
        const state = { current: undefined, lookupCompleted: false };
        const customer = buildHubCustomerContext({
            identity: {},
            parameters: {},
            conversationId: 'c1',
            logger: console,
            state,
            consumeAuthOutcome: (o) => o,
        });
        await assert.rejects(
            () => customer.resolve({ phone_number: '+1' }),
            /customer_hub_unavailable/,
        );
    });

    it('timeline/membership/consent no-op when optional and no customer', async () => {
        process.env.QEFRO_CUSTOMER_HUB_ENABLED = 'true';
        process.env.QEFRO_CUSTOMER_HUB_OPTIONAL = 'true';
        const state = { current: undefined, lookupCompleted: false };
        const timeline = buildTimelineContext({ state });
        const membership = buildMembershipContext({ state, solutionId: 'app' });
        const consent = buildConsentContext({ state });
        await timeline.append({ event_type: 'x.y' });
        await membership.attach();
        await consent.grant({ purpose: 'marketing' });
    });

    it('exposes proxied hub properties after seed', async () => {
        const state = {
            current: {
                id: 'cust-1',
                phone_number: '+1999',
                whatsapp_number: '+1999',
                display_name: 'Sam',
            },
            lookupCompleted: true,
        };
        const customer = buildHubCustomerContext({
            identity: {},
            parameters: {},
            conversationId: 'c1',
            logger: console,
            state,
            consumeAuthOutcome: (o) => o,
        });
        assert.equal(customer.id, 'cust-1');
        assert.equal(customer.phone_number, '+1999');
        assert.equal(customer.whatsapp_number, '+1999');
        assert.equal(customer.display_name, 'Sam');
    });
});

describe('hub client HTTP (mock fetch)', () => {
    it('resolve posts to internal hub and sets state', async () => {
        process.env.QEFRO_CUSTOMER_HUB_ENABLED = 'true';
        process.env.QEFRO_CUSTOMER_HUB_OPTIONAL = 'false';

        const calls = [];
        const original = globalThis.fetch;
        globalThis.fetch = async (url, init) => {
            calls.push({ url: String(url), body: JSON.parse(init.body) });
            return {
                ok: true,
                status: 200,
                text: async () =>
                    JSON.stringify({
                        id: 'hub-99',
                        display_name: 'Priya',
                        phone_number: '+15551002001',
                        whatsapp_number: '+15551002001',
                    }),
            };
        };

        try {
            const state = { current: undefined, lookupCompleted: false };
            const customer = buildHubCustomerContext({
                identity: {},
                parameters: {},
                conversationId: 'c1',
                logger: console,
                state,
                platform: {
                    customer: {
                        base_url: 'http://hub.local',
                        token: 't',
                        context: {
                            tenant_id: '00000000-0000-0000-0000-000000000001',
                            workspace_id: '00000000-0000-0000-0000-000000000002',
                            solution_id: 'restaurant-pro',
                        },
                    },
                },
                consumeAuthOutcome: (o) => o,
            });

            const out = await customer.resolve({
                whatsapp_number: '+15551002001',
                display_name: 'Priya',
            });
            assert.equal(out.id, 'hub-99');
            assert.equal(customer.id, 'hub-99');
            assert.equal(calls.length, 1);
            assert.match(calls[0].url, /\/v1\/internal\/customer-hub\/resolve$/);
            assert.equal(calls[0].body.whatsapp_number, '+15551002001');
            assert.equal(
                calls[0].body.context.solution_id,
                'restaurant-pro',
            );

            const timeline = buildTimelineContext({
                platform: {
                    customer: {
                        base_url: 'http://hub.local',
                        context: {
                            tenant_id: '00000000-0000-0000-0000-000000000001',
                            workspace_id: '00000000-0000-0000-0000-000000000002',
                        },
                    },
                },
                state,
            });
            await timeline.append({
                event_type: 'reservation.created',
                payload: { code: 'R-1001' },
            });
            assert.match(calls[1].url, /timeline_append$/);
            assert.equal(calls[1].body.customer_id, 'hub-99');
        } finally {
            globalThis.fetch = original;
        }
    });
});
