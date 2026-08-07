/** How a Business Flow is entered. Defaults to conversation (chat selection). */
export type FlowTrigger =
    | { type: 'conversation' }
    | { type: 'event'; event: string; when?: string }
    | { type: 'schedule'; cron: string }
    | { type: 'webhook'; name?: string; when?: string };

/**
 * Immutable identity + descriptive metadata for a Business Flow.
 * `id` is the identity key — renaming `name` never creates a new flow.
 */
export interface BusinessFlowMetadata {
    id: string;
    name?: string;
    description?: string;
    /** Integer flow version, defaults to 1. Bump when the definition changes. */
    version?: number;
    category?: string;
    tags?: string[];
    /** Example utterances used by the runtime for AI flow selection. */
    intent?: string[];
    /** Identity/context attributes this flow requires before it can run. */
    inputs?: string[];
    /** Values this flow produces (for analytics and future flow chaining). */
    outputs?: string[];
    /**
     * Entry trigger. Conversation (default) keeps Phase 2 behaviour.
     * Event / schedule / webhook are Phase 3 triggers into the same runtime.
     */
    trigger?: FlowTrigger;
}

export type FlowStepType =
    | 'ask'
    | 'tool'
    | 'challenge'
    | 'upload'
    | 'condition'
    | 'delay'
    | 'approval'
    | 'complete'
    | 'message'
    | 'tag'
    | 'assign'
    | 'activity';

export interface AskStepConfig {
    field: string;
    prompt: string;
}

export interface ToolStepConfig {
    /** Name of an existing Business Tool registered via app.tool(). */
    tool_ref: string;
}

export interface ChallengeStepConfig {
    message?: string;
}

export interface UploadStepConfig {
    field?: string;
    prompt?: string;
    accept?: string[];
}

export interface ConditionStepConfig {
    when: string;
    then?: string;
    else?: string;
}

export interface DelayStepConfig {
    duration_seconds: number;
}

export interface ApprovalStepConfig {
    prompt?: string;
}

export interface CompleteStepConfig {
    message?: string;
}

/** First-party outbound message (Customer Hub / WhatsApp fan-out). */
export interface MessageStepConfig {
    message: string;
}

/** First-party Person tag (no Business Tool required). */
export interface TagStepConfig {
    name: string;
    color?: string;
}

/** First-party Person activity log. */
export interface ActivityStepConfig {
    activity_type: string;
    source?: string;
    payload?: Record<string, unknown>;
}

/** First-party Person → inbox assignment (handoff to human agent). */
export interface AssignStepConfig {
    /** User UUID, member email, org team name, role, or queue label (`sales`). */
    to: string;
    /** Hand conversations to inbox (default true). */
    handoff?: boolean;
}

/** Wire shape of a flow step: type-specific settings live inside `config`. */
export interface FlowStep {
    id: string;
    type: FlowStepType;
    config: Record<string, unknown>;
}

/** A Business Flow as advertised through `capabilities.list`. Never executed by the SDK. */
export interface BusinessFlow {
    metadata: BusinessFlowMetadata;
    steps: FlowStep[];
}

export interface FlowRegistration {
    metadata: BusinessFlowMetadata;
    steps: FlowStep[];
}

/**
 * Fluent builder returned by app.flow(). Steps are recorded into the SDK's
 * flow registry as they are declared; the SDK never executes them.
 */
export class FlowBuilder {
    private readonly registration: FlowRegistration;

    constructor(registration: FlowRegistration) {
        this.registration = registration;
    }

    ask(step: { id: string } & AskStepConfig): this {
        return this.push(step.id, 'ask', { field: step.field, prompt: step.prompt });
    }

    tool(step: { id: string } & ToolStepConfig): this {
        return this.push(step.id, 'tool', { tool_ref: step.tool_ref });
    }

    challenge(step: { id: string } & ChallengeStepConfig): this {
        return this.push(step.id, 'challenge', { message: step.message });
    }

    upload(step: { id: string } & UploadStepConfig): this {
        return this.push(step.id, 'upload', { field: step.field, prompt: step.prompt, accept: step.accept });
    }

    condition(step: { id: string } & ConditionStepConfig): this {
        return this.push(step.id, 'condition', { when: step.when, then: step.then, else: step.else });
    }

    delay(step: { id: string } & DelayStepConfig): this {
        return this.push(step.id, 'delay', { duration_seconds: step.duration_seconds });
    }

    approval(step: { id: string } & ApprovalStepConfig): this {
        return this.push(step.id, 'approval', { prompt: step.prompt });
    }

    complete(step: { id: string } & CompleteStepConfig): this {
        return this.push(step.id, 'complete', { message: step.message });
    }

    /** Outbound message to the conversation / Person WhatsApp channel. */
    message(step: { id: string } & MessageStepConfig): this {
        return this.push(step.id, 'message', { message: step.message });
    }

    /** Tag the linked Customer Hub Person. */
    tag(step: { id: string } & TagStepConfig): this {
        return this.push(step.id, 'tag', { name: step.name, color: step.color });
    }

    /** Record a Person activity (timeline). */
    activity(step: { id: string } & ActivityStepConfig): this {
        return this.push(step.id, 'activity', {
            activity_type: step.activity_type,
            source: step.source,
            payload: step.payload,
        });
    }

    /** Assign Person to a human agent and hand linked conversations to the inbox. */
    assign(step: { id: string } & AssignStepConfig): this {
        return this.push(step.id, 'assign', {
            to: step.to,
            handoff: step.handoff,
        });
    }

    private push(id: string, type: FlowStepType, config: Record<string, unknown>): this {
        const stepId = typeof id === 'string' ? id.trim() : '';
        if (!stepId) {
            throw new Error(`Flow "${this.registration.metadata.id}": every step requires a non-empty id`);
        }
        if (this.registration.steps.some((s) => s.id === stepId)) {
            throw new Error(`Flow "${this.registration.metadata.id}": duplicate step id "${stepId}"`);
        }
        const cleaned: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(config)) {
            if (value !== undefined) cleaned[key] = value;
        }
        this.registration.steps.push({ id: stepId, type, config: cleaned });
        return this;
    }
}

/** Validate and normalize a flow trigger; returns undefined for default conversation. */
export function normalizeFlowTrigger(trigger?: FlowTrigger): FlowTrigger | undefined {
    if (!trigger || typeof trigger !== 'object') return undefined;
    switch (trigger.type) {
        case 'conversation':
            return { type: 'conversation' };
        case 'event': {
            const event = typeof trigger.event === 'string' ? trigger.event.trim() : '';
            if (!event) throw new Error('trigger.type=event requires a non-empty event name');
            if (!event.includes('.')) {
                throw new Error(
                    'trigger.event must be namespaced (e.g. shopify.order.created)',
                );
            }
            const when =
                typeof (trigger as { when?: unknown }).when === 'string' &&
                (trigger as { when: string }).when.trim()
                    ? (trigger as { when: string }).when.trim()
                    : undefined;
            return when ? { type: 'event', event, when } : { type: 'event', event };
        }
        case 'schedule': {
            const cron = typeof trigger.cron === 'string' ? trigger.cron.trim() : '';
            if (!cron) throw new Error('trigger.type=schedule requires a non-empty cron expression');
            return { type: 'schedule', cron };
        }
        case 'webhook': {
            const name =
                typeof trigger.name === 'string' && trigger.name.trim()
                    ? trigger.name.trim()
                    : undefined;
            const when =
                typeof (trigger as { when?: unknown }).when === 'string' &&
                (trigger as { when: string }).when.trim()
                    ? (trigger as { when: string }).when.trim()
                    : undefined;
            if (name && when) return { type: 'webhook', name, when };
            if (name) return { type: 'webhook', name };
            if (when) return { type: 'webhook', when };
            return { type: 'webhook' };
        }
        default:
            throw new Error(`Unknown flow trigger type: ${(trigger as { type?: string }).type}`);
    }
}
