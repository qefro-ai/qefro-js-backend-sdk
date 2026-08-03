/**
 * Customer Hub demo: three person.* event flows.
 *
 * Architecture:
 *   PersonService emits person.created | person.status.changed | person.updated
 *     → orchestration bus (enqueued)
 *     → dispatcher matches flow trigger
 *     → FlowRunner seeds rich `person` context
 *     → message / tag / assign / activity first-party steps
 */
import {
    Qefro,
    PersonEvents,
    onPersonCreated,
    onPersonStatusChanged,
    onPersonUpdated,
} from '../../src/index.js';

const port = Number(process.env.PORT || 8101);
const app = new Qefro({
    signingSecret: process.env.QEFRO_SIGNING_SECRET || 'dev-secret',
});

app.flow({
    id: 'person-welcome',
    name: 'Person welcome',
    description: 'Greet a newly created Person and tag them as welcomed.',
    version: 1,
    category: 'customer-hub',
    tags: ['person', 'welcome'],
    trigger: onPersonCreated(),
    inputs: ['person_id', 'person'],
    outputs: ['welcomed'],
})
    .message({
        id: 'send_welcome',
        message:
            "Hi {{person.name}} — thanks for reaching out. We're here whenever you need us.",
    })
    .tag({ id: 'tag_welcomed', name: 'welcomed', color: '#2F6FED' })
    .activity({
        id: 'log_welcome',
        activity_type: 'welcome.sent',
        source: 'flow',
        payload: { channel: 'whatsapp', person_id: '{{person.id}}' },
    })
    .complete({ id: 'done', message: 'Welcome sent to {{person.name}}.' });

app.flow({
    id: 'person-qualification',
    name: 'Person qualification',
    description: 'When a lead becomes qualified, assign sales and notify.',
    version: 1,
    category: 'customer-hub',
    tags: ['person', 'qualification'],
    trigger: onPersonStatusChanged('payload.to == "qualified"'),
    inputs: ['person_id', 'person', 'from', 'to'],
    outputs: ['qualified'],
})
    .tag({ id: 'tag_qualified', name: 'qualified', color: '#0B8A4B' })
    .assign({ id: 'assign_sales', to: 'sales' })
    .message({
        id: 'tell_customer',
        message: 'A specialist will contact you shortly.',
    })
    .activity({
        id: 'create_task',
        activity_type: 'lead_assigned',
        source: 'flow',
        payload: {
            title: 'Follow up with qualified lead',
            person_id: '{{person.id}}',
            event: PersonEvents.StatusChanged,
        },
    })
    .complete({
        id: 'done',
        message: '{{person.name}} is qualified and assigned to sales.',
    });

app.flow({
    id: 'person-follow-up',
    name: 'Person email follow-up',
    description: 'When a Person gains an email, send a follow-up and log CRM activity.',
    version: 1,
    category: 'customer-hub',
    tags: ['person', 'email'],
    trigger: onPersonUpdated('payload.email'),
    inputs: ['person_id', 'person', 'email'],
    outputs: ['followed_up'],
})
    .message({
        id: 'send_follow_up',
        message:
            "Thanks {{person.name}} — we've got your email {{person.email}}. We'll follow up shortly.",
    })
    .activity({
        id: 'log_follow_up',
        activity_type: 'follow_up.sent',
        source: 'flow',
        payload: { email: '{{person.email}}', person_id: '{{person.id}}' },
    })
    .activity({
        id: 'log_crm_sync',
        activity_type: 'crm.updated',
        source: 'flow',
        payload: { email: '{{person.email}}', status: '{{person.status}}' },
    })
    .complete({
        id: 'done',
        message: 'Follow-up recorded for {{person.email}}.',
    });

await app.listen({ port });
console.log(`person-hub-flows example listening on port ${port}`);
