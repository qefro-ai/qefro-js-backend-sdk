import 'dotenv/config';
import { Qefro } from '@qefro-ai/backend';

const port = Number(process.env.PORT || 8088);
const app = new Qefro({ signingSecret: process.env.QEFRO_SIGNING_SECRET || 'dev-secret' });

const kb = [
  { id: 'KB-100', topic: 'password reset', url: 'https://example.local/kb/password-reset' },
  { id: 'KB-120', topic: 'refund policy', url: 'https://example.local/kb/refund-policy' },
];

function getArgs(ctx) {
  return ctx?.args || ctx?.input?.args || ctx?.request?.args || {};
}

function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

app.customer({
  async lookup(ctx) {
    return { id: asString(ctx?.identity?.customer_id, 'support-agent-1'), team: 'tier-1' };
  },
  async authorize(ctx) {
    return {
      kind: 'success',
      customer: ctx.customer,
      auth: { type: 'bearer_token', access_token: `helpdesk-${ctx.customer.id}`, expires_in: 900 },
    };
  },
});

app.tool(
  {
    name: 'ticket_create',
    auth: 'required',
    description: 'Create a support ticket with priority normalization.',
  },
  async (ctx) => {
    const args = getArgs(ctx);
    const subject = asString(args.subject);
    const priority = ['low', 'medium', 'high'].includes(asString(args.priority, 'medium'))
      ? asString(args.priority, 'medium')
      : 'medium';
    return {
      accepted: subject.length >= 5,
      ticketId: subject.length >= 5 ? `HD-${Date.now()}` : null,
      subject,
      priority,
      error: subject.length >= 5 ? null : 'subject_too_short',
    };
  },
);

app.tool(
  {
    name: 'kb_search',
    auth: 'required',
    description: 'Lookup knowledge-base entries by topic keyword.',
  },
  async (ctx) => {
    const args = getArgs(ctx);
    const query = asString(args.query).toLowerCase();
    const results = kb.filter((row) => row.topic.includes(query));
    return { query, count: results.length, results };
  },
);

await app.listen({ port });
console.log('Qefro helpdesk endpoint listening on port', port);
