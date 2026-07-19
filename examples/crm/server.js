import 'dotenv/config';
import { Qefro } from '@qefro-ai/backend';

const port = Number(process.env.PORT || 8088);
const app = new Qefro({ signingSecret: process.env.QEFRO_SIGNING_SECRET || 'dev-secret' });

const leads = [
  { id: 'lead-11', owner: 'sales-ae-1', stage: 'qualified', score: 82 },
  { id: 'lead-12', owner: 'sales-ae-2', stage: 'proposal', score: 74 },
  { id: 'lead-13', owner: 'sales-ae-1', stage: 'new', score: 61 },
];

function getArgs(ctx) {
  return ctx?.args || ctx?.input?.args || ctx?.request?.args || {};
}

function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

app.customer({
  async lookup(ctx) {
    return { id: asString(ctx?.identity?.customer_id, 'sales-ae-1'), role: 'account_executive' };
  },
  async authorize(ctx) {
    return {
      kind: 'success',
      customer: ctx.customer,
      auth: { type: 'bearer_token', access_token: `crm-${ctx.customer.id}`, expires_in: 900 },
    };
  },
});

app.tool(
  {
    name: 'crm_leads_list',
    auth: 'required',
    description: 'List leads assigned to the signed-in account executive.',
  },
  async (ctx) => {
    const owned = leads.filter((lead) => lead.owner === ctx.customer.id);
    return { owner: ctx.customer.id, data: owned, total: owned.length };
  },
);

app.tool(
  {
    name: 'crm_note_add',
    auth: 'required',
    description: 'Append a note to a lead with basic content validation.',
  },
  async (ctx) => {
    const args = getArgs(ctx);
    const leadId = asString(args.lead_id);
    const note = asString(args.note);
    if (!leadId || note.length < 8) {
      return { accepted: false, error: 'validation_failed', minLength: 8 };
    }
    return { accepted: true, noteId: `note-${Date.now()}`, leadId, preview: note.slice(0, 60) };
  },
);

app.tool(
  {
    name: 'crm_ticket_open',
    auth: 'required',
    description: 'Open an escalation ticket for blocked deals.',
  },
  async (ctx) => {
    const args = getArgs(ctx);
    const leadId = asString(args.lead_id);
    const priority = ['low', 'medium', 'high'].includes(asString(args.priority, 'medium'))
      ? args.priority
      : 'medium';
    return { opened: Boolean(leadId), ticketId: leadId ? `tic-${Date.now()}` : null, leadId, priority };
  },
);

await app.listen({ port });
console.log('Qefro crm endpoint listening on port', port);
