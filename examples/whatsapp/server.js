import 'dotenv/config';
import { Qefro } from '@qefro-ai/backend';

const port = Number(process.env.PORT || 8088);
const app = new Qefro({ signingSecret: process.env.QEFRO_SIGNING_SECRET || 'dev-secret' });

function getArgs(ctx) {
  return ctx?.args || ctx?.input?.args || ctx?.request?.args || {};
}

function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

app.customer({
  async lookup(ctx) {
    return {
      id: asString(ctx?.identity?.phone, asString(ctx?.identity?.customer_id, 'wa-user-1')),
      channel: 'whatsapp',
    };
  },
  async authorize(ctx) {
    return {
      kind: 'success',
      customer: ctx.customer,
      auth: { type: 'bearer_token', access_token: `wa-${ctx.customer.id}`, expires_in: 900 },
    };
  },
});

app.tool(
  {
    name: 'wa_template_preview',
    auth: 'required',
    description: 'Render a WhatsApp message template preview before dispatch.',
  },
  async (ctx) => {
    const args = getArgs(ctx);
    const template = asString(args.template, 'order_update');
    return {
      template,
      preview: `Template ${template} for ${ctx.customer.id}`,
      approved: true,
    };
  },
);

app.tool(
  {
    name: 'wa_message_send',
    auth: 'required',
    description: 'Simulate WhatsApp send and return provider tracking metadata.',
  },
  async (ctx) => {
    const args = getArgs(ctx);
    const to = asString(args.to, ctx.customer.id);
    const text = asString(args.text);
    return {
      queued: text.length > 0,
      providerMessageId: text.length > 0 ? `wam-${Date.now()}` : null,
      to,
      error: text.length > 0 ? null : 'text_required',
    };
  },
);

await app.listen({ port });
console.log('Qefro whatsapp endpoint listening on port', port);
