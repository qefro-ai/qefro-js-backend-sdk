import 'dotenv/config';
import { Qefro } from '@qefro-ai/backend';

const port = Number(process.env.PORT || 8088);
const app = new Qefro({ signingSecret: process.env.QEFRO_SIGNING_SECRET || 'dev-secret' });

const approvals = [];

function getArgs(ctx) {
  return ctx?.args || ctx?.input?.args || ctx?.request?.args || {};
}

function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

app.customer({
  async lookup(ctx) {
    return { id: asString(ctx?.identity?.customer_id, 'employee-ops-1'), role: 'operations_manager' };
  },
  async authorize(ctx) {
    return {
      kind: 'success',
      customer: ctx.customer,
      auth: { type: 'bearer_token', access_token: `portal-${ctx.customer.id}`, expires_in: 900 },
    };
  },
});

app.tool(
  {
    name: 'ops_kpi_snapshot',
    auth: 'required',
    description: 'Return operational KPI metrics used by the internal portal dashboard.',
  },
  async () => {
    return {
      metrics: {
        openIncidents: 3,
        slaAtRisk: 1,
        avgResolutionMinutes: 37,
      },
      generatedAt: new Date().toISOString(),
    };
  },
);

app.tool(
  {
    name: 'ops_approval_submit',
    auth: 'required',
    description: 'Submit approval requests for internal workflows.',
  },
  async (ctx) => {
    const args = getArgs(ctx);
    const category = asString(args.category, 'general');
    const reason = asString(args.reason);
    if (reason.length < 10) {
      return { accepted: false, error: 'reason_too_short', minLength: 10 };
    }
    const id = `apr-${Date.now()}`;
    approvals.push({ id, category, reason, by: ctx.customer.id, status: 'pending' });
    return { accepted: true, approvalId: id, status: 'pending' };
  },
);

app.tool(
  {
    name: 'ops_approval_list',
    auth: 'required',
    description: 'List recent submitted approvals for audit visibility.',
  },
  async () => {
    return { approvals: approvals.slice(-10).reverse(), total: approvals.length };
  },
);

await app.listen({ port });
console.log('Qefro internal-portal endpoint listening on port', port);
