/** Standalone event / webhook / schedule handler advertised via capabilities.list. */
export interface EventHandlerDefinition {
    name: string;
    description?: string;
    /** Cron expression — required for schedule handlers. */
    cron?: string;
}

export type EventHandler = (ctx: EventContext) => Promise<unknown> | unknown;

export interface EventContext {
    /** Fully-qualified event name. */
    name: string;
    source: string;
    tenantId?: string;
    correlationId?: string;
    payload: unknown;
    timestamp: Date;
    logger: Pick<Console, 'info' | 'warn' | 'error'>;
}

export interface NamedHandlerRegistration {
    definition: EventHandlerDefinition;
    handler: EventHandler;
    kind: 'event' | 'webhook' | 'schedule';
}
