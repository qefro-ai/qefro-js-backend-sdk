/** Platform capabilities injected on tool.invoke (ADR-002 / ADR-003 / ADR-004). */
export interface PlatformStorageContext {
    tenant_id: string;
    workspace_id: string;
    installation_id: string;
    solution_id: string;
    identity_id?: string | null;
    capabilities: string[];
    source?: string;
}

/** Customer Hub gateway for sdk.customer.* / timeline / membership / consent. */
export interface PlatformCustomerContext {
    tenant_id: string;
    workspace_id: string;
    installation_id?: string | null;
    solution_id?: string;
    identity_id?: string | null;
    conversation_id?: string | null;
    person_id?: string | null;
    capabilities?: string[];
    source?: string;
}

/** Marketing registry gateway for sdk.marketing.* (ADR-004). */
export interface PlatformMarketingContext {
    tenant_id: string;
    workspace_id: string;
    installation_id?: string | null;
    solution_id?: string;
    identity_id?: string | null;
    capabilities?: string[];
    source?: string;
}

export interface PlatformMarketingBinding {
    base_url?: string;
    token?: string;
    context: PlatformMarketingContext;
}

export interface PlatformCapabilities {
    storage?: {
        base_url?: string;
        token?: string;
        context: PlatformStorageContext;
    };
    /** Optional Customer Hub binding (QEFRO_CUSTOMER_HUB_ENABLED). */
    customer?: {
        base_url?: string;
        token?: string;
        context: PlatformCustomerContext;
    };
    /** Optional Marketing registry binding (QEFRO_MARKETING_ENABLED). */
    marketing?: PlatformMarketingBinding;
}

/** Document storage via storage-service (ADR-002). Used only from app tools. */
export interface StorageContext {
    insert(
        collection: string,
        document: Record<string, unknown>,
        options?: { allocate_code?: { prefix: string; start?: number } },
    ): Promise<Record<string, unknown>>;
    find(
        collection: string,
        options?: {
            filter?: Record<string, unknown>;
            limit?: number;
            sort?: Record<string, unknown>;
        },
    ): Promise<{ items: Record<string, unknown>[]; total: number }>;
    get(collection: string, id: string): Promise<Record<string, unknown>>;
    update(
        collection: string,
        id: string,
        patch: Record<string, unknown>,
    ): Promise<Record<string, unknown>>;
    delete(collection: string, id: string): Promise<Record<string, unknown>>;
}

/** ADR-002: sdk.storage.* → storage-service (managed env or invoke platform block). */
export function buildStorageContext(platform?: PlatformCapabilities): StorageContext {
    const fromEnv = process.env.QEFRO_STORAGE_URL?.replace(/\/$/, '');
    const baseUrl = (platform?.storage?.base_url ?? fromEnv ?? '').replace(/\/$/, '');
    const token =
        platform?.storage?.token ??
        process.env.QEFRO_SERVICE_TOKEN ??
        process.env.QEFRO_INTERNAL_TOKEN ??
        '';
    const context = platform?.storage?.context;

    const call = async (
        op: string,
        body: Record<string, unknown>,
    ): Promise<Record<string, unknown>> => {
        if (!baseUrl) {
            throw new Error(
                'ctx.storage requires platform.storage.base_url or QEFRO_STORAGE_URL',
            );
        }
        if (!context) {
            throw new Error('ctx.storage requires platform.storage.context on tool.invoke');
        }
        const res = await fetch(`${baseUrl}/v1/internal/storage/${op}`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...(token ? { authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ ...body, context }),
        });
        const text = await res.text();
        if (!res.ok) {
            throw new Error(`storage.${op} failed (${res.status}): ${text}`);
        }
        return text ? (JSON.parse(text) as Record<string, unknown>) : {};
    };

    return {
        async insert(collection, document, options) {
            return call('insert', {
                collection,
                document,
                ...(options?.allocate_code ? { allocate_code: options.allocate_code } : {}),
            });
        },
        async find(collection, options) {
            const out = await call('find', {
                collection,
                filter: options?.filter ?? {},
                ...(options?.limit != null ? { limit: options.limit } : {}),
                ...(options?.sort ? { sort: options.sort } : {}),
            });
            const items = Array.isArray(out.items)
                ? (out.items as Record<string, unknown>[])
                : [];
            const total = typeof out.total === 'number' ? out.total : items.length;
            return { items, total };
        },
        async get(collection, id) {
            return call('get', { collection, id });
        },
        async update(collection, id, patch) {
            return call('update', { collection, id, patch });
        },
        async delete(collection, id) {
            return call('delete', { collection, id });
        },
    };
}
