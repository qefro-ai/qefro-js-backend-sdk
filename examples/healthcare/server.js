import 'dotenv/config';
import { Qefro } from '@qefro-ai/backend';

const port = Number(process.env.PORT || 8088);
const app = new Qefro({ signingSecret: process.env.QEFRO_SIGNING_SECRET || 'dev-secret' });

const slots = [
  { doctor: 'dr-sara', date: '2026-07-20', time: '10:00', mode: 'virtual' },
  { doctor: 'dr-sara', date: '2026-07-20', time: '14:30', mode: 'in_person' },
  { doctor: 'dr-yousef', date: '2026-07-21', time: '09:30', mode: 'in_person' },
];

function getArgs(ctx) {
  return ctx?.args || ctx?.input?.args || ctx?.request?.args || {};
}

function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

app.customer({
  async lookup(ctx) {
    return { id: asString(ctx?.identity?.customer_id, 'patient-100'), plan: 'insured' };
  },
  async authorize(ctx) {
    return {
      kind: 'success',
      customer: ctx.customer,
      auth: { type: 'bearer_token', access_token: `health-${ctx.customer.id}`, expires_in: 600 },
    };
  },
});

app.tool(
  {
    name: 'appointment_slots_list',
    auth: 'required',
    description: 'List available appointment slots by doctor and date.',
  },
  async (ctx) => {
    const args = getArgs(ctx);
    const doctor = asString(args.doctor);
    const date = asString(args.date);
    const result = slots.filter((slot) => (!doctor || slot.doctor === doctor) && (!date || slot.date === date));
    return { count: result.length, slots: result };
  },
);

app.tool(
  {
    name: 'appointment_book',
    auth: 'required',
    description: 'Book a selected appointment slot and return confirmation details.',
  },
  async (ctx) => {
    const args = getArgs(ctx);
    const doctor = asString(args.doctor);
    const date = asString(args.date);
    const time = asString(args.time);
    const found = slots.some((slot) => slot.doctor === doctor && slot.date === date && slot.time === time);
    return {
      booked: found,
      appointmentId: found ? `apt-${Date.now()}` : null,
      doctor,
      date,
      time,
      error: found ? null : 'slot_unavailable',
    };
  },
);

await app.listen({ port });
console.log('Qefro healthcare endpoint listening on port', port);
