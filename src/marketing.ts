import { envFlagTrue } from './env.js';
import type {
    PlatformCapabilities,
    PlatformMarketingBinding,
    PlatformMarketingContext,
} from './storage.js';

export type { PlatformMarketingBinding, PlatformMarketingContext };

/** Audience resolution source (resolve execution is Phase 2+). */
export type MarketingAudienceSource = 'customer_hub' | 'app_query' | 'static_filter';

export type MarketingVariableType =
    | 'string'
    | 'number'
    | 'datetime'
    | 'boolean'
    | 'url'
    | 'currency';

export type MarketingVariableSource = 'customer_hub' | 'app_context' | 'campaign' | 'literal';

export type MarketingActionKind =
    | 'url'
    | 'deep_link'
    | 'quick_reply'
    | 'whatsapp_cta'
    | 'postback';

export type MarketingLandingHost = 'app' | 'platform';

/** Well-known channel ids; apps may also register custom string ids. */
export type MarketingChannelId = 'whatsapp' | 'email' | 'website_widget' | (string & {});

export interface MarketingAudienceCustomerHub {
    tags?: string[];
    consentPurpose?: string;
    attrs?: Record<string, unknown>;
}

export interface MarketingAudienceAppQuery {
    tool: string;
    input?: Record<string, unknown>;
}

export interface MarketingAudience {
    id: string;
    label: string;
    description?: string;
    source: MarketingAudienceSource;
    customerHub?: MarketingAudienceCustomerHub;
    appQuery?: MarketingAudienceAppQuery;
    staticFilter?: Record<string, unknown>;
}

export interface MarketingVariable {
    id: string;
    label: string;
    type: MarketingVariableType;
    source: MarketingVariableSource;
    path?: string;
    required?: boolean;
}

export interface MarketingAction {
    id: string;
    label: string;
    kind: MarketingActionKind;
    landingPageId?: string;
    urlTemplate?: string;
    payload?: Record<string, unknown>;
}

export interface MarketingLandingPage {
    id: string;
    label: string;
    path: string;
    host: MarketingLandingHost;
}

/**
 * Channel support declaration. `provider` is reserved for multi-provider
 * routing (meta, twilio, sendgrid, resend, …) — not implemented in Phase 1.
 */
export interface MarketingChannel {
    id: MarketingChannelId;
    provider?: string;
    label?: string;
    enabled?: boolean;
}

/** Input to `app.marketing({...})`. */
export interface MarketingDefinition {
    version?: number;
    audiences?: MarketingAudience[];
    variables?: MarketingVariable[];
    actions?: MarketingAction[];
    landingPages?: MarketingLandingPage[];
    channels?: MarketingChannel[];
}

/** Normalized registration stored on the app and nested under capabilities.list. */
export interface MarketingRegistration {
    version: number;
    audiences: MarketingAudience[];
    variables: MarketingVariable[];
    actions: MarketingAction[];
    landingPages: MarketingLandingPage[];
    channels: MarketingChannel[];
}

/**
 * Wire shape for `capabilities.list.marketing`.
 * Future fields (`permissions`, `providers`, `runtime`, `health`) sit beside `metadata`.
 */
export interface MarketingCapability {
    version: number;
    metadata: {
        audiences: MarketingAudience[];
        variables: MarketingVariable[];
        actions: MarketingAction[];
        landingPages: MarketingLandingPage[];
        channels: MarketingChannel[];
    };
}

/** Thin client to read the app's own registration via platform.marketing (get only). */
export interface MarketingContext {
    /** Fetch this solution's persisted marketing registration envelope, if any. */
    getRegistration(): Promise<Record<string, unknown> | null>;
}

const AUDIENCE_SOURCES = new Set<MarketingAudienceSource>([
    'customer_hub',
    'app_query',
    'static_filter',
]);
const VARIABLE_TYPES = new Set<MarketingVariableType>([
    'string',
    'number',
    'datetime',
    'boolean',
    'url',
    'currency',
]);
const VARIABLE_SOURCES = new Set<MarketingVariableSource>([
    'customer_hub',
    'app_context',
    'campaign',
    'literal',
]);
const ACTION_KINDS = new Set<MarketingActionKind>([
    'url',
    'deep_link',
    'quick_reply',
    'whatsapp_cta',
    'postback',
]);
const LANDING_HOSTS = new Set<MarketingLandingHost>(['app', 'platform']);

function requireNonEmptyString(value: unknown, path: string): string {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`marketing: ${path} must be a non-empty string`);
    }
    return value.trim();
}

function optionalString(value: unknown, path: string): string | undefined {
    if (value == null) return undefined;
    if (typeof value !== 'string') {
        throw new Error(`marketing: ${path} must be a string`);
    }
    const trimmed = value.trim();
    return trimmed || undefined;
}

function optionalBoolean(value: unknown, path: string): boolean | undefined {
    if (value == null) return undefined;
    if (typeof value !== 'boolean') {
        throw new Error(`marketing: ${path} must be a boolean`);
    }
    return value;
}

function optionalRecord(value: unknown, path: string): Record<string, unknown> | undefined {
    if (value == null) return undefined;
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`marketing: ${path} must be an object`);
    }
    return value as Record<string, unknown>;
}

function assertUniqueIds(ids: string[], kind: string): void {
    const seen = new Set<string>();
    for (const id of ids) {
        if (seen.has(id)) {
            throw new Error(`marketing: duplicate ${kind} id "${id}"`);
        }
        seen.add(id);
    }
}

function validateAudience(raw: unknown, index: number): MarketingAudience {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`marketing: audiences[${index}] must be an object`);
    }
    const a = raw as Record<string, unknown>;
    const id = requireNonEmptyString(a.id, `audiences[${index}].id`);
    const label = requireNonEmptyString(a.label, `audiences[${index}].label`);
    const source = requireNonEmptyString(a.source, `audiences[${index}].source`);
    if (!AUDIENCE_SOURCES.has(source as MarketingAudienceSource)) {
        throw new Error(
            `marketing: audiences[${index}].source must be one of customer_hub|app_query|static_filter`,
        );
    }

    const out: MarketingAudience = {
        id,
        label,
        source: source as MarketingAudienceSource,
    };
    const description = optionalString(a.description, `audiences[${index}].description`);
    if (description) out.description = description;

    if (a.customerHub != null) {
        if (typeof a.customerHub !== 'object' || Array.isArray(a.customerHub)) {
            throw new Error(`marketing: audiences[${index}].customerHub must be an object`);
        }
        const ch = a.customerHub as Record<string, unknown>;
        const customerHub: MarketingAudienceCustomerHub = {};
        if (ch.tags != null) {
            if (!Array.isArray(ch.tags) || !ch.tags.every((t) => typeof t === 'string')) {
                throw new Error(`marketing: audiences[${index}].customerHub.tags must be string[]`);
            }
            customerHub.tags = ch.tags.map((t) => String(t));
        }
        const consentPurpose = optionalString(
            ch.consentPurpose,
            `audiences[${index}].customerHub.consentPurpose`,
        );
        if (consentPurpose) customerHub.consentPurpose = consentPurpose;
        if (ch.attrs != null) {
            customerHub.attrs = optionalRecord(ch.attrs, `audiences[${index}].customerHub.attrs`);
        }
        out.customerHub = customerHub;
    }

    if (a.appQuery != null) {
        if (typeof a.appQuery !== 'object' || Array.isArray(a.appQuery)) {
            throw new Error(`marketing: audiences[${index}].appQuery must be an object`);
        }
        const aq = a.appQuery as Record<string, unknown>;
        const tool = requireNonEmptyString(aq.tool, `audiences[${index}].appQuery.tool`);
        const appQuery: MarketingAudienceAppQuery = { tool };
        if (aq.input != null) {
            appQuery.input = optionalRecord(aq.input, `audiences[${index}].appQuery.input`);
        }
        out.appQuery = appQuery;
    }

    if (a.staticFilter != null) {
        out.staticFilter = optionalRecord(a.staticFilter, `audiences[${index}].staticFilter`);
    }

    return out;
}

function validateVariable(raw: unknown, index: number): MarketingVariable {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`marketing: variables[${index}] must be an object`);
    }
    const v = raw as Record<string, unknown>;
    const id = requireNonEmptyString(v.id, `variables[${index}].id`);
    const label = requireNonEmptyString(v.label, `variables[${index}].label`);
    const type = requireNonEmptyString(v.type, `variables[${index}].type`);
    if (!VARIABLE_TYPES.has(type as MarketingVariableType)) {
        throw new Error(
            `marketing: variables[${index}].type must be one of string|number|datetime|boolean|url|currency`,
        );
    }
    const source = requireNonEmptyString(v.source, `variables[${index}].source`);
    if (!VARIABLE_SOURCES.has(source as MarketingVariableSource)) {
        throw new Error(
            `marketing: variables[${index}].source must be one of customer_hub|app_context|campaign|literal`,
        );
    }
    const out: MarketingVariable = {
        id,
        label,
        type: type as MarketingVariableType,
        source: source as MarketingVariableSource,
    };
    const path = optionalString(v.path, `variables[${index}].path`);
    if (path) out.path = path;
    const required = optionalBoolean(v.required, `variables[${index}].required`);
    if (required !== undefined) out.required = required;
    return out;
}

function validateAction(raw: unknown, index: number): MarketingAction {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`marketing: actions[${index}] must be an object`);
    }
    const a = raw as Record<string, unknown>;
    const id = requireNonEmptyString(a.id, `actions[${index}].id`);
    const label = requireNonEmptyString(a.label, `actions[${index}].label`);
    const kind = requireNonEmptyString(a.kind, `actions[${index}].kind`);
    if (!ACTION_KINDS.has(kind as MarketingActionKind)) {
        throw new Error(
            `marketing: actions[${index}].kind must be one of url|deep_link|quick_reply|whatsapp_cta|postback`,
        );
    }
    const out: MarketingAction = {
        id,
        label,
        kind: kind as MarketingActionKind,
    };
    const landingPageId = optionalString(a.landingPageId, `actions[${index}].landingPageId`);
    if (landingPageId) out.landingPageId = landingPageId;
    const urlTemplate = optionalString(a.urlTemplate, `actions[${index}].urlTemplate`);
    if (urlTemplate) out.urlTemplate = urlTemplate;
    if (a.payload != null) {
        out.payload = optionalRecord(a.payload, `actions[${index}].payload`);
    }
    return out;
}

function validateLandingPage(raw: unknown, index: number): MarketingLandingPage {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`marketing: landingPages[${index}] must be an object`);
    }
    const p = raw as Record<string, unknown>;
    const id = requireNonEmptyString(p.id, `landingPages[${index}].id`);
    const label = requireNonEmptyString(p.label, `landingPages[${index}].label`);
    const path = requireNonEmptyString(p.path, `landingPages[${index}].path`);
    const host = requireNonEmptyString(p.host, `landingPages[${index}].host`);
    if (!LANDING_HOSTS.has(host as MarketingLandingHost)) {
        throw new Error(`marketing: landingPages[${index}].host must be one of app|platform`);
    }
    return { id, label, path, host: host as MarketingLandingHost };
}

function validateChannel(raw: unknown, index: number): MarketingChannel {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`marketing: channels[${index}] must be an object`);
    }
    const c = raw as Record<string, unknown>;
    const id = requireNonEmptyString(c.id, `channels[${index}].id`);
    const out: MarketingChannel = { id };
    const provider = optionalString(c.provider, `channels[${index}].provider`);
    if (provider) out.provider = provider;
    const label = optionalString(c.label, `channels[${index}].label`);
    if (label) out.label = label;
    const enabled = optionalBoolean(c.enabled, `channels[${index}].enabled`);
    if (enabled !== undefined) out.enabled = enabled;
    return out;
}

/**
 * Validate and normalize a marketing definition.
 * Throws on invalid schema; returns a frozen-shape registration.
 */
export function validateMarketingDefinition(def: MarketingDefinition): MarketingRegistration {
    if (!def || typeof def !== 'object' || Array.isArray(def)) {
        throw new Error('marketing: definition must be an object');
    }

    let version = 1;
    if (def.version != null) {
        if (typeof def.version !== 'number' || !Number.isInteger(def.version) || def.version < 1) {
            throw new Error('marketing: version must be a positive integer');
        }
        version = def.version;
    }

    const audiencesRaw = def.audiences ?? [];
    const variablesRaw = def.variables ?? [];
    const actionsRaw = def.actions ?? [];
    const landingPagesRaw = def.landingPages ?? [];
    const channelsRaw = def.channels ?? [];

    if (!Array.isArray(audiencesRaw)) throw new Error('marketing: audiences must be an array');
    if (!Array.isArray(variablesRaw)) throw new Error('marketing: variables must be an array');
    if (!Array.isArray(actionsRaw)) throw new Error('marketing: actions must be an array');
    if (!Array.isArray(landingPagesRaw)) throw new Error('marketing: landingPages must be an array');
    if (!Array.isArray(channelsRaw)) throw new Error('marketing: channels must be an array');

    const audiences = audiencesRaw.map(validateAudience);
    const variables = variablesRaw.map(validateVariable);
    const actions = actionsRaw.map(validateAction);
    const landingPages = landingPagesRaw.map(validateLandingPage);
    const channels = channelsRaw.map(validateChannel);

    assertUniqueIds(
        audiences.map((a) => a.id),
        'audience',
    );
    assertUniqueIds(
        variables.map((v) => v.id),
        'variable',
    );
    assertUniqueIds(
        actions.map((a) => a.id),
        'action',
    );
    assertUniqueIds(
        landingPages.map((p) => p.id),
        'landingPage',
    );
    assertUniqueIds(
        channels.map((c) => c.id),
        'channel',
    );

    for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        if (action.landingPageId) {
            const exists = landingPages.some((p) => p.id === action.landingPageId);
            if (!exists) {
                throw new Error(
                    `marketing: actions[${i}].landingPageId "${action.landingPageId}" does not match any landingPages[].id`,
                );
            }
        }
    }

    return { version, audiences, variables, actions, landingPages, channels };
}

/** Build the capabilities.list.marketing wire object. */
export function toMarketingCapability(reg: MarketingRegistration): MarketingCapability {
    return {
        version: reg.version,
        metadata: {
            audiences: reg.audiences,
            variables: reg.variables,
            actions: reg.actions,
            landingPages: reg.landingPages,
            channels: reg.channels,
        },
    };
}

export function isMarketingEnabled(): boolean {
    return envFlagTrue('QEFRO_MARKETING_ENABLED', false);
}

/**
 * Thin get-own-registration client via `platform.marketing`.
 * No campaign APIs — registry read only.
 */
export function buildMarketingContext(platform?: PlatformCapabilities): MarketingContext {
    return {
        getRegistration: async (): Promise<Record<string, unknown> | null> => {
            if (!isMarketingEnabled()) return null;
            const binding = platform?.marketing;
            const fromEnv = process.env.QEFRO_MARKETING_URL?.replace(/\/$/, '');
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
            const url = `${baseUrl}/v1/internal/marketing/registrations/${encodeURIComponent(solutionId)}`;
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
                throw new Error(`marketing.getRegistration failed (${res.status}): ${text}`);
            }
            if (!text) return null;
            return JSON.parse(text) as Record<string, unknown>;
        },
    };
}
