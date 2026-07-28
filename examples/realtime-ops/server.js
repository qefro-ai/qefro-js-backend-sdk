import 'dotenv/config';
import { Qefro } from '@qefro-ai/backend';

/**
 * Realtime operations example — live state that changes between calls:
 * appointment slots computed from the current clock, a delivery tracker that
 * advances in real time, and a queue-position tool. Mixes auth: none /
 * optional / required (sms_otp) in one backend.
 */

const port = Number(process.env.PORT || 8088);
const app = new Qefro({ signingSecret: process.env.QEFRO_SIGNING_SECRET || 'dev-secret' });
const DEV_OTP = process.env.DEV_OTP || '123456';

const CUSTOMERS = [
  { id: 'cust-alice', name: 'Alice', phone: '+15550001111' },
  { id: 'cust-bob', name: 'Bob', phone: '+15550002222' },
];

/** Deliveries advance one stage every 2 minutes of real time (demo). */
const DELIVERIES = {
  'DLV-501': { customerId: 'cust-alice', startedAt: Date.now(), stages: ['packed', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'] },
  'DLV-502': { customerId: 'cust-bob', startedAt: Date.now() - 6 * 60 * 1000, stages: ['packed', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'] },
};

/** In-memory support queue: joining is live state shared across conversations. */
const supportQueue = [];

function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizePhone(raw) {
  return asString(raw).replace(/[^\d+]/g, '');
}

function deliveryStage(delivery) {
  const elapsedStages = Math.floor((Date.now() - delivery.startedAt) / (2 * 60 * 1000));
  const idx = Math.min(elapsedStages, delivery.stages.length - 1);
  return { stage: delivery.stages[idx], progress: idx + 1, of: delivery.stages.length };
}

app.customer({
  async lookup(ctx) {
    const phone = normalizePhone(ctx.identity?.phone);
    return CUSTOMERS.find((c) => normalizePhone(c.phone) === phone) || null;
  },
  async authorize(ctx) {
    if (!ctx.customer) return { kind: 'not_found' };
    if (!ctx.response) {
      return {
        kind: 'challenge',
        challenge: {
          type: 'sms_otp',
          message: `Enter the 6-digit code sent by SMS (dev code: ${DEV_OTP}).`,
          destination_hint: `•••${ctx.customer.phone.slice(-4)}`,
        },
      };
    }
    if (asString(ctx.response) !== DEV_OTP) {
      return { kind: 'denied' };
    }
    return {
      kind: 'success',
      customer: ctx.customer,
      auth: {
        type: 'bearer_token',
        access_token: `ops-${ctx.customer.id}`,
        expires_in: 900,
        customer_id: ctx.customer.id,
      },
    };
  },
});

// auth: none — slots derive from the current clock, so output changes minute to minute.
app.tool(
  {
    name: 'next_available_slots',
    description: 'Next available service appointment slots (live, changes with current time).',
    auth: 'none',
    input_schema: {
      type: 'object',
      properties: {
        count: { type: 'integer', description: 'How many slots (default 3)', minimum: 1, maximum: 10 },
      },
    },
  },
  async (ctx) => {
    const count = Math.min(10, Math.max(1, Number(ctx.parameters?.count) || 3));
    const now = new Date();
    const slots = [];
    const cursor = new Date(now);
    cursor.setMinutes(cursor.getMinutes() + (30 - (cursor.getMinutes() % 30)), 0, 0);
    while (slots.length < count) {
      const hour = cursor.getHours();
      if (hour >= 9 && hour < 18) {
        slots.push(cursor.toISOString());
      }
      cursor.setMinutes(cursor.getMinutes() + 30);
      if (hour >= 18) {
        cursor.setDate(cursor.getDate() + 1);
        cursor.setHours(9, 0, 0, 0);
      }
    }
    return { as_of: now.toISOString(), timezone: 'server-local', slots };
  },
);

// auth: none — tracker advances in real time between calls.
app.tool(
  {
    name: 'track_delivery',
    description: 'Live delivery tracking by delivery ID (e.g. DLV-501). Status advances in real time.',
    auth: 'none',
    input_schema: {
      type: 'object',
      properties: {
        delivery_id: { type: 'string', description: 'Delivery ID such as DLV-501' },
      },
      required: ['delivery_id'],
    },
  },
  async (ctx) => {
    const id = asString(ctx.parameters?.delivery_id).toUpperCase();
    const delivery = DELIVERIES[id];
    if (!delivery) {
      return { found: false, delivery_id: id, sample_ids: Object.keys(DELIVERIES) };
    }
    const { stage, progress, of } = deliveryStage(delivery);
    return {
      found: true,
      delivery_id: id,
      status: stage,
      progress: `${progress}/${of}`,
      checked_at: new Date().toISOString(),
      message: `Delivery ${id} is ${stage.replace(/_/g, ' ')} (step ${progress} of ${of}).`,
    };
  },
);

// auth: optional — anonymous callers can check the queue; verified customers get priority.
app.tool(
  {
    name: 'join_support_queue',
    description: 'Join the live support callback queue and get your position. Verified customers get priority.',
    auth: 'optional',
  },
  async (ctx) => {
    const customer = ctx.customer.get();
    const entry = {
      id: customer?.id || `guest-${ctx.conversation.id.slice(0, 8)}`,
      priority: Boolean(customer),
      joinedAt: Date.now(),
    };
    if (!supportQueue.some((e) => e.id === entry.id)) {
      supportQueue.push(entry);
      supportQueue.sort((a, b) => Number(b.priority) - Number(a.priority) || a.joinedAt - b.joinedAt);
    }
    const position = supportQueue.findIndex((e) => e.id === entry.id) + 1;
    return {
      joined: true,
      position,
      queue_length: supportQueue.length,
      priority: entry.priority,
      estimated_wait_minutes: position * 5,
      message: entry.priority
        ? `You're #${position} with priority service.`
        : `You're #${position}. Verify your account for priority service.`,
    };
  },
);

// auth: required (sms_otp) — reschedule needs a verified customer.
app.tool(
  {
    name: 'reschedule_my_appointment',
    description: 'Move the customer’s appointment to a new slot (requires SMS verification).',
    auth: 'required',
    authentication_methods: ['sms_otp'],
    default_auth_method: 'sms_otp',
    lookup: { required: ['phone'] },
    input_schema: {
      type: 'object',
      properties: {
        slot: { type: 'string', description: 'ISO datetime chosen from next_available_slots' },
      },
      required: ['slot'],
    },
  },
  async (ctx) => {
    const customer = ctx.customer.require();
    const slot = asString(ctx.parameters?.slot);
    const valid = !Number.isNaN(Date.parse(slot)) && Date.parse(slot) > Date.now();
    return {
      rescheduled: valid,
      customer_id: customer.id,
      slot: valid ? slot : null,
      error: valid ? null : 'invalid_or_past_slot',
      message: valid
        ? `Appointment moved to ${slot} for ${customer.name}.`
        : 'Pick a future slot from next_available_slots.',
    };
  },
);

const handle = await app.listen({ port });
console.log('Realtime-ops example listening');
console.log(`  Webhook URL: ${handle.url}`);
console.log(`  Dev OTP    : ${DEV_OTP}`);
console.log('  Tools: next_available_slots, track_delivery (live), join_support_queue (optional auth), reschedule_my_appointment (sms_otp)');
