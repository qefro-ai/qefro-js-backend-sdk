import type { AuthOutcome } from './auth.js';
import type { PlatformCapabilities, PlatformCustomerContext } from './storage.js';

export interface CustomerState {
    current?: unknown;
    lookupCompleted: boolean;
}

export interface CustomerLookupContext {
    identity: Record<string, unknown>;
    parameters: Record<string, unknown>;
    conversation: { id: string };
    channel?: string;
    logger: Pick<Console, 'info' | 'warn' | 'error'>;
}

export interface CustomerAuthorizeContext {
    customer: unknown;
    method?: string;
    response?: string;
    identity: Record<string, unknown>;
    parameters: Record<string, unknown>;
    conversation: { id: string };
    channel?: string;
    logger: Pick<Console, 'info' | 'warn' | 'error'>;
}

export interface CustomerProvider {
    lookup(ctx: CustomerLookupContext): Promise<unknown | null>;
    authorize(ctx: CustomerAuthorizeContext): Promise<AuthOutcome<unknown>>;
}

export interface CustomerAuthorizeOptions {
    method?: string;
}

/** Identity fields accepted by Customer Hub resolve/lookup/create. */
export interface CustomerIdentityInput {
    id?: string;
    phone?: string;
    phone_number?: string;
    whatsapp_number?: string;
    email?: string;
    display_name?: string;
    name?: string;
    channel?: string;
    identifier?: string;
    [key: string]: unknown;
}

/** Canonical Customer Hub customer projection for SDK apps. */
export interface HubCustomer {
    id: string;
    phone_number?: string | null;
    whatsapp_number?: string | null;
    display_name?: string | null;
    email?: string | null;
    status?: string | null;
    workspace_id?: string | null;
    [key: string]: unknown;
}

export interface CustomerNoteOptions {
    author_id?: string;
}

export interface CustomerTagOptions {
    color?: string;
}

export interface CustomerUpdateInput {
    id?: string;
    display_name?: string;
    name?: string;
    phone?: string;
    phone_number?: string;
    whatsapp_number?: string;
    email?: string;
    status?: string;
    [key: string]: unknown;
}

/**
 * Customer Hub + optional external CRM auth.
 *
 * Hub methods (`resolve` / `create` / `update` / `note` / `tag`) talk to the
 * platform Customer Hub via `platform.customer`. External `CustomerProvider`
 * auth (`authorize` / provider `lookup`) is unchanged for connector CRMs.
 */
export interface CustomerContext {
    /** Resolve-or-create Customer Hub identity (preferred for apps). */
    resolve(input?: CustomerIdentityInput): Promise<HubCustomer | null>;
    /** Lookup only (no create). Hub when enabled; else external provider. */
    lookup(input?: CustomerIdentityInput): Promise<unknown | null>;
    lookupByPhone(phone?: string): Promise<unknown | null>;
    create(input: CustomerIdentityInput): Promise<HubCustomer | null>;
    update(input: CustomerUpdateInput): Promise<HubCustomer | null>;
    note(content: string, options?: CustomerNoteOptions): Promise<void>;
    tag(name: string, options?: CustomerTagOptions): Promise<void>;
    authorize(options?: CustomerAuthorizeOptions): Promise<unknown>;
    get<T = unknown>(): T | undefined;
    require<T = unknown>(): T;
    /** Convenience properties (proxied from current hub/provider customer). */
    id?: string;
    phone_number?: string | null;
    whatsapp_number?: string | null;
    display_name?: string | null;
    [key: string]: unknown;
}

export interface TimelineAppendInput {
    event_type: string;
    payload?: Record<string, unknown>;
    customer_id?: string;
    source?: string;
}

export interface TimelineContext {
    append(input: TimelineAppendInput): Promise<void>;
}

export interface MembershipAttachInput {
    customer_id?: string;
    solution_id?: string;
    role?: string;
    metadata?: Record<string, unknown>;
}

export interface MembershipContext {
    attach(input?: MembershipAttachInput): Promise<void>;
    detach(input?: MembershipAttachInput): Promise<void>;
}

export interface ConsentInput {
    purpose: string;
    customer_id?: string;
    metadata?: Record<string, unknown>;
}

export interface ConsentContext {
    grant(input: ConsentInput): Promise<void>;
    revoke(input: ConsentInput): Promise<void>;
}

export function readIdentityPhone(identity: Record<string, unknown>): string | undefined {
    for (const key of ['phone', 'phone_number', 'whatsapp_number', 'whatsapp']) {
        const value = identity[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return undefined;
}

export function envFlagTrue(name: string, defaultValue = false): boolean {
    const raw = process.env[name];
    if (raw == null || raw === '') return defaultValue;
    switch (raw.trim().toLowerCase()) {
        case '1':
        case 'true':
        case 'yes':
        case 'on':
            return true;
        case '0':
        case 'false':
        case 'no':
        case 'off':
            return false;
        default:
            return defaultValue;
    }
}

/** Master switch — when false, hub methods soft-skip (never call Hub). */
export function isCustomerHubEnabled(): boolean {
    return envFlagTrue('QEFRO_CUSTOMER_HUB_ENABLED', false);
}

/**
 * When true (default), missing hub config returns null / no-ops instead of
 * throwing so apps keep working without Customer Hub.
 */
export function isCustomerHubOptional(): boolean {
    return envFlagTrue('QEFRO_CUSTOMER_HUB_OPTIONAL', true);
}

export function hubCustomerFromPerson(person: Record<string, unknown> | null | undefined): HubCustomer | null {
    if (!person || typeof person !== 'object') return null;
    const id = person.id;
    if (typeof id !== 'string' || !id.trim()) return null;

    const phone =
        (typeof person.phone_number === 'string' && person.phone_number) ||
        (typeof person.phone === 'string' && person.phone) ||
        null;
    const whatsapp =
        (typeof person.whatsapp_number === 'string' && person.whatsapp_number) ||
        phone;
    const display =
        (typeof person.display_name === 'string' && person.display_name) ||
        (typeof person.name === 'string' && person.name) ||
        null;

    return {
        ...person,
        id: id.trim(),
        phone_number: phone,
        whatsapp_number: whatsapp,
        display_name: display,
        email: typeof person.email === 'string' ? person.email : (person.email as null) ?? null,
    };
}

function resolveHubEndpoint(platform?: PlatformCapabilities): {
    baseUrl: string;
    token: string;
    context: PlatformCustomerContext;
} | null {
    const fromEnv = process.env.QEFRO_CUSTOMER_HUB_URL?.replace(/\/$/, '');
    const customer = platform?.customer;
    const baseUrl = (customer?.base_url ?? fromEnv ?? '').replace(/\/$/, '');
    const context = customer?.context;
    if (!baseUrl || !context?.tenant_id || !context?.workspace_id) {
        return null;
    }
    const token =
        customer?.token ??
        process.env.QEFRO_SERVICE_TOKEN ??
        process.env.QEFRO_INTERNAL_TOKEN ??
        process.env.QEFRO_INTERNAL_BEARER ??
        '';
    return { baseUrl, token, context };
}

async function hubCall(
    platform: PlatformCapabilities | undefined,
    op: string,
    body: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
    if (!isCustomerHubEnabled()) {
        if (isCustomerHubOptional()) return null;
        throw new Error('customer_hub_disabled');
    }

    const endpoint = resolveHubEndpoint(platform);
    if (!endpoint) {
        if (isCustomerHubOptional()) return null;
        throw new Error('customer_hub_unavailable');
    }

    const res = await fetch(`${endpoint.baseUrl}/v1/internal/customer-hub/${op}`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(endpoint.token ? { authorization: `Bearer ${endpoint.token}` } : {}),
        },
        body: JSON.stringify({ ...body, context: endpoint.context }),
    });
    const text = await res.text();
    if (!res.ok) {
        if (isCustomerHubOptional() && (res.status === 404 || res.status >= 500)) {
            return null;
        }
        throw new Error(`customer_hub.${op} failed (${res.status}): ${text}`);
    }
    if (!text) return {};
    return JSON.parse(text) as Record<string, unknown>;
}

function pickIdentity(input?: CustomerIdentityInput, identity?: Record<string, unknown>) {
    const merged = { ...(identity ?? {}), ...(input ?? {}) };
    const phone =
        (typeof merged.phone_number === 'string' && merged.phone_number) ||
        (typeof merged.phone === 'string' && merged.phone) ||
        undefined;
    const whatsapp =
        (typeof merged.whatsapp_number === 'string' && merged.whatsapp_number) ||
        undefined;
    const email = typeof merged.email === 'string' ? merged.email : undefined;
    const display =
        (typeof merged.display_name === 'string' && merged.display_name) ||
        (typeof merged.name === 'string' && merged.name) ||
        undefined;
    const channel =
        (typeof merged.channel === 'string' && merged.channel) ||
        (whatsapp ? 'whatsapp' : phone ? 'sms' : email ? 'email' : 'api');
    const identifier =
        (typeof merged.identifier === 'string' && merged.identifier) ||
        whatsapp ||
        phone ||
        email ||
        (typeof merged.id === 'string' ? merged.id : undefined);

    return {
        id: typeof merged.id === 'string' ? merged.id : undefined,
        phone_number: phone,
        whatsapp_number: whatsapp,
        email,
        display_name: display,
        channel,
        identifier,
    };
}

export function buildHubCustomerContext(args: {
    identity: Record<string, unknown>;
    parameters: Record<string, unknown>;
    conversationId: string;
    channel?: string;
    logger: Pick<Console, 'info' | 'warn' | 'error'>;
    state: CustomerState;
    authResponse?: string;
    platform?: PlatformCapabilities;
    customerProvider?: CustomerProvider | null;
    getCachedAuth?: () => unknown | undefined;
    consumeAuthOutcome: (
        outcome: AuthOutcome<unknown>,
        conversationId: string,
        state: CustomerState,
    ) => unknown;
}): CustomerContext {
    const setCurrent = (customer: unknown) => {
        args.state.current = customer ?? undefined;
        args.state.lookupCompleted = true;
        return customer;
    };

    const requireCurrentId = (): string => {
        const cur = args.state.current as HubCustomer | undefined;
        if (cur && typeof cur.id === 'string' && cur.id) return cur.id;
        throw new Error('customer_not_found');
    };

    const api: CustomerContext = {
        resolve: async (input?: CustomerIdentityInput): Promise<HubCustomer | null> => {
            const identity = pickIdentity(input, args.identity);
            const out = await hubCall(args.platform, 'resolve', {
                ...identity,
                channel: args.channel ?? identity.channel,
                conversation_id: args.conversationId,
            });
            const hub = hubCustomerFromPerson(out);
            if (hub) setCurrent(hub);
            return hub;
        },
        lookup: async (input?: CustomerIdentityInput): Promise<unknown | null> => {
            // Explicit hub lookup when identity args or hub-only mode.
            if (input || !args.customerProvider) {
                if (args.state.lookupCompleted && !input && args.state.current !== undefined) {
                    return args.state.current ?? null;
                }
                const identity = pickIdentity(input, args.identity);
                const out = await hubCall(args.platform, 'lookup', {
                    ...identity,
                    channel: args.channel ?? identity.channel,
                    conversation_id: args.conversationId,
                });
                const hub = hubCustomerFromPerson(out);
                setCurrent(hub);
                return hub;
            }

            if (args.state.lookupCompleted) {
                return args.state.current ?? null;
            }
            const customer = await args.customerProvider.lookup({
                identity: args.identity,
                parameters: args.parameters,
                conversation: { id: args.conversationId },
                channel: args.channel,
                logger: args.logger,
            });
            return setCurrent(customer ?? undefined) ?? null;
        },
        lookupByPhone: async (phone?: string): Promise<unknown | null> => {
            const source = phone ?? readIdentityPhone(args.identity);
            if (!source) {
                args.state.lookupCompleted = true;
                args.state.current = undefined;
                return null;
            }
            if (!args.customerProvider || isCustomerHubEnabled()) {
                return api.lookup({ phone_number: source, whatsapp_number: source });
            }
            const customer = await args.customerProvider.lookup({
                identity: { ...args.identity, phone: source },
                parameters: args.parameters,
                conversation: { id: args.conversationId },
                channel: args.channel,
                logger: args.logger,
            });
            return setCurrent(customer ?? undefined) ?? null;
        },
        create: async (input: CustomerIdentityInput): Promise<HubCustomer | null> => {
            const identity = pickIdentity(input, args.identity);
            const out = await hubCall(args.platform, 'create', {
                ...identity,
                channel: args.channel ?? identity.channel,
                conversation_id: args.conversationId,
            });
            const hub = hubCustomerFromPerson(out);
            if (hub) setCurrent(hub);
            return hub;
        },
        update: async (input: CustomerUpdateInput): Promise<HubCustomer | null> => {
            const id =
                (typeof input.id === 'string' && input.id) ||
                (args.state.current as HubCustomer | undefined)?.id;
            if (!id) {
                if (isCustomerHubOptional()) return null;
                throw new Error('customer_not_found');
            }
            const identity = pickIdentity(input, args.identity);
            const out = await hubCall(args.platform, 'update', {
                ...identity,
                id,
            });
            const hub = hubCustomerFromPerson(out);
            if (hub) setCurrent(hub);
            return hub;
        },
        note: async (content: string, options?: CustomerNoteOptions): Promise<void> => {
            const trimmed = content.trim();
            if (!trimmed) throw new Error('customer_note_empty');
            let customerId: string;
            try {
                customerId = requireCurrentId();
            } catch (err) {
                if (isCustomerHubOptional()) return;
                throw err;
            }
            await hubCall(args.platform, 'note', {
                customer_id: customerId,
                content: trimmed,
                author_id: options?.author_id,
            });
        },
        tag: async (name: string, options?: CustomerTagOptions): Promise<void> => {
            const trimmed = name.trim();
            if (!trimmed) throw new Error('customer_tag_empty');
            let customerId: string;
            try {
                customerId = requireCurrentId();
            } catch (err) {
                if (isCustomerHubOptional()) return;
                throw err;
            }
            await hubCall(args.platform, 'tag', {
                customer_id: customerId,
                name: trimmed,
                color: options?.color,
            });
        },
        authorize: async (options?: CustomerAuthorizeOptions): Promise<unknown> => {
            if (!args.customerProvider) {
                throw new Error('customer_provider_missing');
            }
            const cached = args.getCachedAuth?.();
            if (cached !== undefined) {
                args.state.current = cached;
                args.state.lookupCompleted = true;
                return cached;
            }
            const customer = await api.lookup();
            if (!customer) {
                throw new Error('customer_not_found');
            }
            const outcome = await args.customerProvider.authorize({
                customer,
                method: options?.method,
                response: args.authResponse,
                identity: args.identity,
                parameters: args.parameters,
                conversation: { id: args.conversationId },
                channel: args.channel,
                logger: args.logger,
            });
            return args.consumeAuthOutcome(outcome, args.conversationId, args.state);
        },
        get: <T = unknown>(): T | undefined => args.state.current as T | undefined,
        require: <T = unknown>(): T => {
            if (args.state.current === undefined || args.state.current === null) {
                throw new Error('customer_not_found');
            }
            return args.state.current as T;
        },
    };

    return new Proxy(api, {
        get(target, prop, receiver) {
            if (Reflect.has(target, prop)) {
                return Reflect.get(target, prop, receiver);
            }
            const value = args.state.current;
            if (value && typeof value === 'object') {
                return (value as Record<string, unknown>)[String(prop)];
            }
            return undefined;
        },
    }) as CustomerContext;
}

export function buildTimelineContext(args: {
    platform?: PlatformCapabilities;
    state: CustomerState;
}): TimelineContext {
    return {
        append: async (input: TimelineAppendInput): Promise<void> => {
            const eventType = String(input.event_type || '').trim();
            if (!eventType) throw new Error('timeline_event_empty');
            const customerId =
                input.customer_id ||
                (args.state.current as HubCustomer | undefined)?.id;
            if (!customerId) {
                if (isCustomerHubOptional()) return;
                throw new Error('customer_not_found');
            }
            await hubCall(args.platform, 'timeline_append', {
                customer_id: customerId,
                event_type: eventType,
                payload: input.payload ?? {},
                source: input.source ?? 'sdk',
            });
        },
    };
}

export function buildMembershipContext(args: {
    platform?: PlatformCapabilities;
    state: CustomerState;
    solutionId?: string;
}): MembershipContext {
    const customerIdOrOptional = (input?: MembershipAttachInput): string | null => {
        const id =
            input?.customer_id ||
            (args.state.current as HubCustomer | undefined)?.id;
        if (id) return id;
        if (isCustomerHubOptional()) return null;
        throw new Error('customer_not_found');
    };

    return {
        attach: async (input?: MembershipAttachInput): Promise<void> => {
            const customerId = customerIdOrOptional(input);
            if (!customerId) return;
            await hubCall(args.platform, 'membership_attach', {
                customer_id: customerId,
                solution_id: input?.solution_id ?? args.solutionId,
                role: input?.role,
                metadata: input?.metadata ?? {},
            });
        },
        detach: async (input?: MembershipAttachInput): Promise<void> => {
            const customerId = customerIdOrOptional(input);
            if (!customerId) return;
            await hubCall(args.platform, 'membership_detach', {
                customer_id: customerId,
                solution_id: input?.solution_id ?? args.solutionId,
                role: input?.role,
                metadata: input?.metadata ?? {},
            });
        },
    };
}

export function buildConsentContext(args: {
    platform?: PlatformCapabilities;
    state: CustomerState;
}): ConsentContext {
    const customerIdOrOptional = (input: ConsentInput): string | null => {
        const id =
            input.customer_id ||
            (args.state.current as HubCustomer | undefined)?.id;
        if (id) return id;
        if (isCustomerHubOptional()) return null;
        throw new Error('customer_not_found');
    };

    return {
        grant: async (input: ConsentInput): Promise<void> => {
            const purpose = String(input.purpose || '').trim();
            if (!purpose) throw new Error('consent_purpose_empty');
            const customerId = customerIdOrOptional(input);
            if (!customerId) return;
            await hubCall(args.platform, 'consent_grant', {
                customer_id: customerId,
                purpose,
                metadata: input.metadata ?? {},
            });
        },
        revoke: async (input: ConsentInput): Promise<void> => {
            const purpose = String(input.purpose || '').trim();
            if (!purpose) throw new Error('consent_purpose_empty');
            const customerId = customerIdOrOptional(input);
            if (!customerId) return;
            await hubCall(args.platform, 'consent_revoke', {
                customer_id: customerId,
                purpose,
                metadata: input.metadata ?? {},
            });
        },
    };
}
