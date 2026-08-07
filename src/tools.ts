import type { AuthBuilder, AuthOutcome } from './auth.js';
import type {
    ConsentContext,
    CustomerContext,
    MembershipContext,
    TimelineContext,
} from './customer.js';
import type { PersonContext } from './person.js';
import type { StorageContext } from './storage.js';

export type ToolAuthMode = 'none' | 'optional' | 'required';

/** Identity attributes the Qefro runtime must resolve before tool.invoke. */
export interface ToolLookup {
    /** Shorthand for a single required attribute, e.g. `"email"` or `"phone"`. */
    by?: string;
    /** Explicit list, e.g. `["email"]` or `["phone", "customer_id"]`. */
    required?: string[];
}

/**
 * Business Tool definition. `TInput`/`TOutput` carry the tool's typed contract
 * through app.tool() so handlers receive typed parameters and must return the
 * declared output. Both default to the untyped JavaScript shapes, so existing
 * code compiles unchanged.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface ToolDefinition<
    TInput = Record<string, unknown>,
    TOutput = unknown,
> {
    name: string;
    description?: string;
    input_schema?: Record<string, unknown>;
    authentication_methods?: string[];
    auth?: ToolAuthMode;
    permissions?: string[];
    timeout?: number;
    default_auth_method?: string;
    /**
     * What identity the runtime must have before invoking this tool.
     * Runtime resolves from channel identity → conversation values → ask user.
     * SDK never hardcodes WhatsApp/Widget/Portal rules.
     */
    lookup?: ToolLookup;
}

export interface RegisteredTool {
    name: string;
    description?: string;
    input_schema?: Record<string, unknown>;
    authentication_methods?: string[];
    auth?: ToolAuthMode;
    permissions?: string[];
    timeout?: number;
    lookup?: ToolLookup;
}

/** Typed tool handler: receives typed parameters, must return the declared output. */
export type ToolHandler<TInput = Record<string, unknown>, TOutput = unknown> = (
    ctx: ToolContext<TInput>,
) => Promise<TOutput>;

/** Runtime-facing handler shape stored in the registry (parameters arrive untyped). */
export type AnyToolHandler = (ctx: ToolContext) => Promise<unknown>;

export interface ToolContext<TParameters = Record<string, unknown>> {
    identity: Record<string, unknown>;
    parameters: TParameters;
    conversation: { id: string };
    channel?: string;
    authentication?: Record<string, unknown>;
    logger: Pick<Console, 'info' | 'warn' | 'error'>;
    /**
     * Correlation id from `x-qefro-trace-id` when the platform forwarded it
     * (stabilization Phase 1 — headers only; `/qefro` body unchanged).
     */
    trace_id?: string;
    /**
     * Customer Hub identity (resolve/lookup/create/update/note/tag) plus
     * optional external `CustomerProvider` auth (`authorize`).
     * Hub participation is optional — gated by QEFRO_CUSTOMER_HUB_*.
     */
    customer: CustomerContext;
    /**
     * Customer Hub Person (Qefro memory mutations queue).
     * Optional when the conversation has no linked Person yet.
     */
    person: PersonContext;
    /**
     * Managed document storage (ADR-002). App business logic persists here.
     * Routes to storage-service — never Mongo or a solution-owned database.
     */
    storage: StorageContext;
    /** Append Customer Hub timeline activities (person_activities). */
    timeline: TimelineContext;
    /** Attach/detach solution membership on a Hub customer. */
    membership: MembershipContext;
    /** Grant/revoke consent purposes on a Hub customer. */
    consent: ConsentContext;
    requireCustomer<T>(resolver: (auth: AuthBuilder<T>) => Promise<AuthOutcome<T>>): Promise<T>;
    authorizeCustomer<T>(resolver: (auth: AuthBuilder<T>) => Promise<AuthOutcome<T>>): Promise<T>;
    /** @deprecated Use ctx.customer.lookup + ctx.customer.authorize */
    requireAuthentication<T>(resolver: (auth: AuthBuilder<T>) => Promise<AuthOutcome<T>>): Promise<T>;
}

export interface ToolRegistration {
    definition: ToolDefinition;
    handler: AnyToolHandler;
}

/** Normalize `lookup.by` / `lookup.required` into a deduped attribute list. */
export function normalizeLookup(lookup?: ToolLookup): string[] {
    if (!lookup) return [];
    const raw = [
        ...(lookup.required ?? []),
        ...(lookup.by ? [lookup.by] : []),
    ];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of raw) {
        const key = String(item || '')
            .trim()
            .toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(key);
    }
    return out;
}

export function normalizeToolDefinition(definition: ToolDefinition): ToolDefinition {
    const lookup = normalizeLookup(definition.lookup);
    return {
        ...definition,
        auth: definition.auth ?? 'optional',
        permissions: definition.permissions ?? [],
        authentication_methods: definition.authentication_methods ?? [],
        lookup: lookup.length > 0 ? { required: lookup } : undefined,
    };
}

export function parseToolRegistration(
    arg1: string | ToolDefinition,
    arg2: Omit<ToolDefinition, 'name'> | AnyToolHandler,
    arg3?: Omit<ToolDefinition, 'name'> | AnyToolHandler,
): ToolRegistration {
    if (typeof arg1 === 'string') {
        if (typeof arg2 === 'function') {
            const handler = arg2;
            const metadata = (arg3 ?? {}) as Omit<ToolDefinition, 'name'>;
            return {
                definition: normalizeToolDefinition({ name: arg1, ...metadata }),
                handler,
            };
        }
        if (typeof arg3 === 'function') {
            return {
                definition: normalizeToolDefinition({ name: arg1, ...arg2 }),
                handler: arg3,
            };
        }
    } else if (typeof arg2 === 'function') {
        return {
            definition: normalizeToolDefinition(arg1),
            handler: arg2,
        };
    }

    throw new Error('Invalid tool() signature');
}
