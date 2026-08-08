import type {
    PlatformCapabilities,
    PlatformOrganizationBinding,
    PlatformOrganizationContext,
} from './storage.js';

export type { PlatformOrganizationBinding, PlatformOrganizationContext };

export type OrganizationTaskPriority = 'low' | 'normal' | 'high' | 'urgent' | (string & {});

/** Business event published for organization orchestration (metadata only). */
export interface OrganizationEvent {
    id: string;
    label?: string;
    description?: string;
    payloadSchema?: Record<string, unknown>;
}

/** Executable business action published for organization orchestration. */
export interface OrganizationAction {
    id: string;
    label?: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
}

/** Human task type published for organization orchestration. */
export interface OrganizationTaskType {
    id: string;
    label: string;
    description?: string;
    suggested_workspace_type?: string;
    suggested_team?: string;
    priority?: OrganizationTaskPriority;
}

/** Input to `app.organization({...})`. Phase 1: events / actions / tasks only. */
export interface OrganizationDefinition {
    version?: number;
    events?: OrganizationEvent[];
    actions?: OrganizationAction[];
    tasks?: OrganizationTaskType[];
}

/** Normalized capabilities stored on the app and nested under capabilities.list. */
export interface OrganizationCapabilities {
    version: number;
    events: OrganizationEvent[];
    actions: OrganizationAction[];
    tasks: OrganizationTaskType[];
}

/**
 * Wire shape for `capabilities.list.organization`.
 * Future fields sit beside `metadata`.
 */
export interface OrganizationCapability {
    version: number;
    metadata: {
        events: OrganizationEvent[];
        actions: OrganizationAction[];
        tasks: OrganizationTaskType[];
    };
}

/** Thin client to read the app's own capability envelope via platform.organization. */
export interface OrganizationContext {
    /** Fetch this solution's persisted organization capability envelope, if any. */
    getCapabilities(): Promise<Record<string, unknown> | null>;
}

function requireNonEmptyString(value: unknown, path: string): string {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`organization: ${path} must be a non-empty string`);
    }
    return value.trim();
}

function optionalString(value: unknown, path: string): string | undefined {
    if (value == null) return undefined;
    if (typeof value !== 'string') {
        throw new Error(`organization: ${path} must be a string`);
    }
    const trimmed = value.trim();
    return trimmed || undefined;
}

function optionalRecord(value: unknown, path: string): Record<string, unknown> | undefined {
    if (value == null) return undefined;
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`organization: ${path} must be an object`);
    }
    return value as Record<string, unknown>;
}

function assertUniqueIds(ids: string[], kind: string): void {
    const seen = new Set<string>();
    for (const id of ids) {
        if (seen.has(id)) {
            throw new Error(`organization: duplicate ${kind} id "${id}"`);
        }
        seen.add(id);
    }
}

function assertOpaqueCapabilityId(id: string, path: string): void {
    if (id.includes('.')) {
        throw new Error(
            `organization: ${path} must be an opaque capability id (no '.' / app prefix); got "${id}"`,
        );
    }
}

function validateEvent(raw: unknown, index: number): OrganizationEvent {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`organization: events[${index}] must be an object`);
    }
    const e = raw as Record<string, unknown>;
    const id = requireNonEmptyString(e.id, `events[${index}].id`);
    assertOpaqueCapabilityId(id, `events[${index}].id`);
    const out: OrganizationEvent = { id };
    const label = optionalString(e.label, `events[${index}].label`);
    if (label) out.label = label;
    const description = optionalString(e.description, `events[${index}].description`);
    if (description) out.description = description;
    if (e.payloadSchema != null) {
        out.payloadSchema = optionalRecord(e.payloadSchema, `events[${index}].payloadSchema`);
    }
    return out;
}

function validateAction(raw: unknown, index: number): OrganizationAction {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`organization: actions[${index}] must be an object`);
    }
    const a = raw as Record<string, unknown>;
    const id = requireNonEmptyString(a.id, `actions[${index}].id`);
    assertOpaqueCapabilityId(id, `actions[${index}].id`);
    const out: OrganizationAction = { id };
    const label = optionalString(a.label, `actions[${index}].label`);
    if (label) out.label = label;
    const description = optionalString(a.description, `actions[${index}].description`);
    if (description) out.description = description;
    if (a.inputSchema != null) {
        out.inputSchema = optionalRecord(a.inputSchema, `actions[${index}].inputSchema`);
    }
    if (a.outputSchema != null) {
        out.outputSchema = optionalRecord(a.outputSchema, `actions[${index}].outputSchema`);
    }
    return out;
}

function validateTask(raw: unknown, index: number): OrganizationTaskType {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`organization: tasks[${index}] must be an object`);
    }
    const t = raw as Record<string, unknown>;
    const id = requireNonEmptyString(t.id, `tasks[${index}].id`);
    assertOpaqueCapabilityId(id, `tasks[${index}].id`);
    const label = requireNonEmptyString(t.label, `tasks[${index}].label`);
    const out: OrganizationTaskType = { id, label };
    const description = optionalString(t.description, `tasks[${index}].description`);
    if (description) out.description = description;
    const suggestedWorkspaceType = optionalString(
        t.suggested_workspace_type ?? t.suggestedWorkspaceType,
        `tasks[${index}].suggested_workspace_type`,
    );
    if (suggestedWorkspaceType) out.suggested_workspace_type = suggestedWorkspaceType;
    const suggestedTeam = optionalString(
        t.suggested_team ?? t.suggestedTeam,
        `tasks[${index}].suggested_team`,
    );
    if (suggestedTeam) out.suggested_team = suggestedTeam;
    const priority = optionalString(t.priority, `tasks[${index}].priority`);
    if (priority) out.priority = priority;
    return out;
}

/**
 * Validate and normalize an organization definition.
 * Throws on invalid schema; returns a frozen-shape capabilities object.
 */
export function validateOrganizationDefinition(
    def: OrganizationDefinition,
): OrganizationCapabilities {
    if (!def || typeof def !== 'object' || Array.isArray(def)) {
        throw new Error('organization: definition must be an object');
    }

    if ((def as { templates?: unknown }).templates != null) {
        throw new Error(
            'organization: templates are organization-owned assets (Phase 4); do not publish from apps',
        );
    }

    let version = 1;
    if (def.version != null) {
        if (typeof def.version !== 'number' || !Number.isInteger(def.version) || def.version < 1) {
            throw new Error('organization: version must be a positive integer');
        }
        version = def.version;
    }

    const eventsRaw = def.events ?? [];
    const actionsRaw = def.actions ?? [];
    const tasksRaw = def.tasks ?? [];

    if (!Array.isArray(eventsRaw)) throw new Error('organization: events must be an array');
    if (!Array.isArray(actionsRaw)) throw new Error('organization: actions must be an array');
    if (!Array.isArray(tasksRaw)) throw new Error('organization: tasks must be an array');

    const events = eventsRaw.map(validateEvent);
    const actions = actionsRaw.map(validateAction);
    const tasks = tasksRaw.map(validateTask);

    assertUniqueIds(
        events.map((e) => e.id),
        'event',
    );
    assertUniqueIds(
        actions.map((a) => a.id),
        'action',
    );
    assertUniqueIds(
        tasks.map((t) => t.id),
        'task',
    );

    // Ids must also be unique across kinds — one opaque id maps to one node.
    assertUniqueIds(
        [...events.map((e) => e.id), ...actions.map((a) => a.id), ...tasks.map((t) => t.id)],
        'capability',
    );

    return { version, events, actions, tasks };
}

/** Build the capabilities.list.organization wire object. */
export function toOrganizationCapability(caps: OrganizationCapabilities): OrganizationCapability {
    return {
        version: caps.version,
        metadata: {
            events: caps.events,
            actions: caps.actions,
            tasks: caps.tasks,
        },
    };
}

function envFlagTrue(name: string, defaultValue = false): boolean {
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

export function isOrganizationEnabled(): boolean {
    return envFlagTrue('QEFRO_ORGANIZATION_ENABLED', false);
}

/**
 * Thin get-own-capabilities client via `platform.organization`.
 * Registry read only — no workflow/task execution.
 */
export function buildOrganizationContext(platform?: PlatformCapabilities): OrganizationContext {
    return {
        getCapabilities: async (): Promise<Record<string, unknown> | null> => {
            if (!isOrganizationEnabled()) return null;
            const binding = platform?.organization;
            const fromEnv = process.env.QEFRO_ORGANIZATION_URL?.replace(/\/$/, '');
            const baseUrl = (binding?.base_url ?? fromEnv ?? '').replace(/\/$/, '');
            const context = binding?.context;
            if (!baseUrl || !context?.tenant_id || !context?.workspace_id) {
                return null;
            }
            const solutionId = context.solution_id;
            if (!solutionId) return null;
            const token =
                binding?.token ??
                process.env.QEFRO_SERVICE_TOKEN ??
                process.env.QEFRO_INTERNAL_TOKEN ??
                process.env.QEFRO_INTERNAL_BEARER ??
                '';
            const url = `${baseUrl}/v1/internal/organization/capabilities/${encodeURIComponent(solutionId)}`;
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'content-type': 'application/json',
                    ...(token ? { authorization: `Bearer ${token}` } : {}),
                    'x-qefro-tenant-id': context.tenant_id,
                    'x-qefro-workspace-id': context.workspace_id,
                    ...(context.installation_id
                        ? { 'x-qefro-installation-id': String(context.installation_id) }
                        : {}),
                },
            });
            if (res.status === 404) return null;
            const text = await res.text();
            if (!res.ok) {
                throw new Error(`organization.getCapabilities failed (${res.status}): ${text}`);
            }
            if (!text) return null;
            return JSON.parse(text) as Record<string, unknown>;
        },
    };
}
