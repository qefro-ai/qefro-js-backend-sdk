/** Business Events an SDK connection may emit into the Qefro event bus. */

import { randomUUID } from 'crypto';

export interface BusinessEventField {
    path: string;
    label: string;
    type?: string;
}

export interface BusinessEventDefinition {
    event_type: string;
    /** Producer payload schema version. Bump when field shapes change. */
    version?: number;
    label?: string;
    description?: string;
    schema?: { fields?: BusinessEventField[] };
}

export interface EmittedBusinessEvent {
    event_type: string;
    /** Producer payload schema version carried with the event. */
    version?: number;
    event_id?: string;
    customer?: {
        external_id?: string;
        phone?: string;
        email?: string;
        name?: string;
    };
    data?: Record<string, unknown>;
    timestamp?: string;
}

const EVENT_TYPE = /^[a-z][a-z0-9_-]*(\.[a-z0-9_-]+)+$/;

export function isBusinessEventType(name: string): boolean {
    const t = name.trim().toLowerCase();
    return EVENT_TYPE.test(t) && !t.includes('(');
}

export function normalizeBusinessEvent(def: BusinessEventDefinition): BusinessEventDefinition {
    const event_type = typeof def.event_type === 'string' ? def.event_type.trim().toLowerCase() : '';
    if (!isBusinessEventType(event_type)) {
        throw new Error(
            `businessEvent() requires a Business Event name such as quotation.created (not a capability like createQuotation); got "${def.event_type}"`,
        );
    }
    const version = Number.isInteger(def.version) && (def.version as number) > 0 ? (def.version as number) : 1;
    return {
        event_type,
        version,
        label: def.label?.trim() || undefined,
        description: def.description?.trim() || undefined,
        schema: def.schema,
    };
}

/**
 * Stable id within a source: `{event_type}:{entity_id}`.
 * Prevents `quotation.created / Q-1001` colliding with `order.created / Q-1001`.
 */
export function stableEventId(eventType: string, entityId: string | number): string {
    const type = String(eventType ?? '').trim().toLowerCase();
    const id = String(entityId ?? '').trim();
    if (!id) {
        throw new Error('stableEventId requires an entity id');
    }
    if (!type) return id;
    const prefix = `${type}:`;
    return id.startsWith(prefix) ? id : `${prefix}${id}`;
}

/**
 * Normalize an emit into a durable Business Event envelope.
 * `ctx.emit()` publishes this; it does not run CRM automation.
 */
export function normalizeEmittedEvent(
    event: EmittedBusinessEvent,
    declared?: BusinessEventDefinition,
): EmittedBusinessEvent {
    const event_type = typeof event?.event_type === 'string' ? event.event_type.trim().toLowerCase() : '';
    if (!isBusinessEventType(event_type)) {
        throw new Error(
            `ctx.emit() requires a Business Event such as quotation.created, not a capability; got "${event?.event_type}"`,
        );
    }
    const version =
        Number.isInteger(event.version) && (event.version as number) > 0
            ? (event.version as number)
            : declared?.version && declared.version > 0
              ? declared.version
              : 1;
    const rawId = typeof event.event_id === 'string' ? event.event_id.trim() : '';
    const event_id = rawId ? stableEventId(event_type, rawId) : `evt_${randomUUID()}`;
    return {
        ...event,
        event_type,
        version,
        event_id,
    };
}
