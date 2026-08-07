import type { FlowTrigger } from './flow.js';

/**
 * Customer Hub Person — Qefro first-party memory.
 *
 * Distinct from CustomerContext (external systems / connector auth).
 *
 * ```text
 * ctx.customer  →  external systems
 * ctx.person    →  Qefro memory
 * ```
 */
export interface PersonRecord {
    id: string;
    status?: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    source?: string | null;
    workspace_id?: string;
    assigned_to?: string | null;
    conversation_count?: number;
    identities?: unknown[];
    attributes?: Record<string, unknown>;
    tags?: unknown[];
    activities?: unknown[];
    [key: string]: unknown;
}

/** Mutations queued by `ctx.person.*` for the Qefro runtime to apply. */
export type PersonMutation =
    | { op: 'note'; content: string; author_id?: string }
    | { op: 'tag'; name: string; color?: string }
    | { op: 'activity'; activity_type: string; source?: string; payload?: Record<string, unknown> }
    | { op: 'assign'; to: string; handoff?: boolean }
    | { op: 'merge'; into: string };

export interface PersonContext {
    /** Current Person snapshot from Qefro (may be undefined for anonymous). */
    get<T = PersonRecord>(): T | undefined;
    /** Like get(), but throws if no Person is linked. */
    require<T = PersonRecord>(): T;
    /** Append an agent/system note on the Person timeline. */
    note(content: string, options?: { author_id?: string }): Promise<void>;
    /** Tag the Person in Customer Hub. */
    tag(name: string, options?: { color?: string }): Promise<void>;
    /** Record a Person activity. */
    activity(
        activityType: string,
        options?: { source?: string; payload?: Record<string, unknown> },
    ): Promise<void>;
    /** Assign to a human agent / team and optionally hand off to inbox. */
    assign(to: string, options?: { handoff?: boolean }): Promise<void>;
    /** Merge this Person into another (survivor id). */
    merge(intoPersonId: string): Promise<void>;
}

/** Canonical Customer Hub event names for flow triggers. */
export const PersonEvents = {
    Created: 'person.created',
    Updated: 'person.updated',
    StatusChanged: 'person.status.changed',
    Merged: 'person.merged',
    Assigned: 'person.assigned',
    TagCreated: 'person.tag.created',
    ActivityCreated: 'person.activity.created',
} as const;

export type PersonEventName = (typeof PersonEvents)[keyof typeof PersonEvents];

/** Build an event trigger for a Customer Hub Person event. */
export function personEventTrigger(event: PersonEventName | string, when?: string): FlowTrigger {
    return when === undefined
        ? { type: 'event', event }
        : { type: 'event', event, when };
}

export function onPersonCreated(when?: string): FlowTrigger {
    return personEventTrigger(PersonEvents.Created, when);
}

export function onPersonUpdated(when?: string): FlowTrigger {
    return personEventTrigger(PersonEvents.Updated, when);
}

export function onPersonStatusChanged(when?: string): FlowTrigger {
    return personEventTrigger(PersonEvents.StatusChanged, when);
}

export function onPersonMerged(when?: string): FlowTrigger {
    return personEventTrigger(PersonEvents.Merged, when);
}

/**
 * Customer Hub Person context. Mutations are queued for the runtime —
 * the SDK never writes Qefro memory directly.
 */
export function buildPersonContext(args: {
    snapshot?: PersonRecord | null;
    mutations: PersonMutation[];
}): PersonContext {
    let current: PersonRecord | undefined =
        args.snapshot && typeof args.snapshot === 'object' && args.snapshot.id
            ? { ...args.snapshot }
            : undefined;

    const requireId = (): string => {
        if (!current?.id) {
            throw new Error('person_not_found');
        }
        return current.id;
    };

    return {
        get: <T = PersonRecord>(): T | undefined => current as T | undefined,
        require: <T = PersonRecord>(): T => {
            if (!current) {
                throw new Error('person_not_found');
            }
            return current as T;
        },
        note: async (content: string, options?: { author_id?: string }): Promise<void> => {
            requireId();
            const trimmed = content.trim();
            if (!trimmed) {
                throw new Error('person_note_empty');
            }
            args.mutations.push({
                op: 'note',
                content: trimmed,
                author_id: options?.author_id,
            });
        },
        tag: async (name: string, options?: { color?: string }): Promise<void> => {
            requireId();
            const trimmed = name.trim();
            if (!trimmed) {
                throw new Error('person_tag_empty');
            }
            args.mutations.push({
                op: 'tag',
                name: trimmed,
                color: options?.color,
            });
            const tags = Array.isArray(current?.tags) ? [...current!.tags!] : [];
            tags.push({ name: trimmed, color: options?.color ?? null });
            current = { ...current!, tags };
        },
        activity: async (
            activityType: string,
            options?: { source?: string; payload?: Record<string, unknown> },
        ): Promise<void> => {
            requireId();
            const trimmed = activityType.trim();
            if (!trimmed) {
                throw new Error('person_activity_empty');
            }
            args.mutations.push({
                op: 'activity',
                activity_type: trimmed,
                source: options?.source ?? 'sdk',
                payload: options?.payload,
            });
        },
        assign: async (to: string, options?: { handoff?: boolean }): Promise<void> => {
            requireId();
            const trimmed = to.trim();
            if (!trimmed) {
                throw new Error('person_assign_empty');
            }
            args.mutations.push({
                op: 'assign',
                to: trimmed,
                handoff: options?.handoff,
            });
        },
        merge: async (intoPersonId: string): Promise<void> => {
            requireId();
            const into = intoPersonId.trim();
            if (!into) {
                throw new Error('person_merge_target_empty');
            }
            args.mutations.push({ op: 'merge', into });
        },
    };
}
