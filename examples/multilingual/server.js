import 'dotenv/config';
import { Qefro } from '@qefro-ai/backend';

const port = Number(process.env.PORT || 8088);
const app = new Qefro({ signingSecret: process.env.QEFRO_SIGNING_SECRET || 'dev-secret' });

const templates = {
  en: { greeting: 'Hello', handoff: 'I can connect you to a specialist.' },
  ar: { greeting: 'Marhaban', handoff: 'Yumkinuni tawsiluk bikhabir.' },
  fr: { greeting: 'Bonjour', handoff: 'Je peux vous connecter a un specialiste.' },
};

function getArgs(ctx) {
  return ctx?.args || ctx?.input?.args || ctx?.request?.args || {};
}

function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeLocale(raw) {
  const locale = asString(raw, 'en').toLowerCase().slice(0, 2);
  return templates[locale] ? locale : 'en';
}

app.customer({
  async lookup(ctx) {
    const locale = normalizeLocale(ctx?.identity?.locale);
    return { id: asString(ctx?.identity?.customer_id, 'global-user-1'), locale };
  },
  async authorize(ctx) {
    return {
      kind: 'success',
      customer: ctx.customer,
      auth: { type: 'bearer_token', access_token: `multi-${ctx.customer.id}`, expires_in: 900 },
    };
  },
});

app.tool(
  {
    name: 'language_detect_and_set',
    auth: 'required',
    description: 'Detect preferred locale and return localization template.',
  },
  async (ctx) => {
    const args = getArgs(ctx);
    const locale = normalizeLocale(args.locale || ctx.customer.locale);
    return {
      locale,
      template: templates[locale],
      supported: Object.keys(templates),
    };
  },
);

app.tool(
  {
    name: 'message_localize',
    auth: 'required',
    description: 'Generate localized greeting and handoff text for agent responses.',
  },
  async (ctx) => {
    const args = getArgs(ctx);
    const locale = normalizeLocale(args.locale || ctx.customer.locale);
    const name = asString(args.name, 'Customer');
    return {
      locale,
      greeting: `${templates[locale].greeting}, ${name}.`,
      handoff: templates[locale].handoff,
    };
  },
);

await app.listen({ port });
console.log('Qefro multilingual endpoint listening on port', port);
