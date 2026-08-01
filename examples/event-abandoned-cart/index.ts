/**
 * Phase 3 example: event-triggered abandoned cart recovery.
 *
 * Architecture:
 *   Connector emits `shopify.cart.abandoned`
 *     → Qefro event bus
 *     → dispatcher matches flow trigger
 *     → FlowRunner (same runtime as chat)
 *
 * Connectors never call FlowRunner. Events are triggers only.
 */
import { Qefro } from '../../src/index.js';

const port = Number(process.env.PORT || 8099);
const app = new Qefro({
    signingSecret: process.env.QEFRO_SIGNING_SECRET || 'dev-secret',
});

app.tool(
    {
        name: 'send_cart_reminder',
        description: 'Send an abandoned-cart reminder to the shopper',
        input_schema: {
            type: 'object',
            properties: {
                cartId: { type: 'string' },
                email: { type: 'string' },
            },
            required: ['cartId'],
        },
        auth: 'none',
    },
    async (ctx) => {
        const params = (ctx as { parameters?: Record<string, unknown> }).parameters ?? {};
        return {
            sent: true,
            cartId: params.cartId ?? null,
            email: params.email ?? null,
        };
    },
);

// Event-triggered flow — same FlowRunner as conversation flows.
app.flow({
    id: 'abandoned_cart_recovery',
    name: 'Abandoned cart recovery',
    description: 'Wait, then remind the shopper about their cart',
    version: 1,
    trigger: { type: 'event', event: 'shopify.cart.abandoned' },
    inputs: ['cartId'],
    outputs: ['reminderSent'],
})
    .delay({ id: 'wait_1h', duration_seconds: 3600 })
    .tool({ id: 'remind', tool_ref: 'send_cart_reminder' })
    .complete({ id: 'done', message: 'Cart reminder sent.' });

// Optional: advertise a standalone handler name (metadata only).
app.event(
    { name: 'shopify.cart.abandoned', description: 'Cart abandoned on storefront' },
    async (ctx) => {
        ctx.logger.info('cart abandoned observed', ctx.payload as never);
        return { ok: true };
    },
);

await app.listen({ port });
console.log('event-abandoned-cart example listening on port', port);
