import type { PlatformCapabilities } from './storage.js';
import type { PersonRecord, PersonMutation } from './person.js';
import type { RegisteredTool } from './tools.js';
import type { BusinessFlow } from './flow.js';
import type { EventHandlerDefinition } from './events.js';
import type { BusinessEventDefinition, EmittedBusinessEvent } from './business_events.js';
import type { AuthenticationContextPayload, ChallengePayload } from './auth.js';
import type { MarketingCapability } from './marketing.js';
import type { OrganizationCapability } from './organization.js';

export type QefroRequestType = 'ping' | 'tools.list' | 'capabilities.list' | 'tool.invoke' | 'tool.resume';

export const SDK_NAME = '@qefro-ai/backend';
export const SDK_VERSION = '1.7.1';

export interface QefroConfig {
    signingSecret: string;
    protocolVersion?: string;
    maxTimestampSkewSeconds?: number;
    endpointPath?: string;
    /**
     * Directory for the durable Business Event outbox.
     * `ctx.emit()` fsyncs here before returning; delivery is async.
     */
    eventOutboxDir?: string;
    /**
     * Signed ingest URL (`/api/v1/org/events/ingest/{tenant}/signed`).
     * When set, pending outbox events are flushed independently of tool.invoke.
     * Does not wait for CRM automation.
     */
    eventIngestUrl?: string;
}

export interface ProtocolRequest {
    protocol_version: string;
    request_id: string;
    type: QefroRequestType;
    organization_id?: string;
    conversation_id?: string;
    channel?: string;
    identity?: Record<string, unknown>;
    tool?: string;
    parameters?: Record<string, unknown>;
    authentication?: Record<string, unknown>;
    resume_token?: string;
    challenge_response?: string;
    /** Customer Hub Person snapshot from Qefro memory (not connector customer). */
    person?: PersonRecord | null;
    /** Managed storage gateway for sdk.storage.* (never call Mongo directly). */
    platform?: PlatformCapabilities;
    /**
     * Per-install marketplace settings (API URLs, keys, brand, …).
     * Injected by the platform on tool.invoke for managed apps.
     */
    settings?: Record<string, unknown>;
}

export type ProtocolResponse =
    | { type: 'pong'; protocol_version?: string; sdk_version?: string }
    | { type: 'tools.list'; tools: RegisteredTool[]; protocol_version?: string; sdk_version?: string }
    | {
          type: 'capabilities.list';
          tools: RegisteredTool[];
          flows: BusinessFlow[];
          events?: EventHandlerDefinition[];
          webhooks?: EventHandlerDefinition[];
          schedules?: Array<EventHandlerDefinition & { cron: string }>;
          /** Business Events this connector emits (CRM triggers). Not tools. */
          business_events?: BusinessEventDefinition[];
          /** Present when `app.marketing(...)` was registered. */
          marketing?: MarketingCapability;
          /** Present when `app.organization(...)` was registered (ADR-005). */
          organization?: OrganizationCapability;
          protocol_version?: string;
          sdk_version?: string;
          sdk_name?: string;
      }
    | {
          type: 'result';
          output: unknown;
          authentication_context?: AuthenticationContextPayload;
          /** Queued Customer Hub mutations for the Qefro runtime to apply. */
          person_mutations?: PersonMutation[];
          /** Explicit Business Events to publish. Never inferred from the tool name. */
          events?: EmittedBusinessEvent[];
      }
    | { type: 'challenge'; resume_token: string; challenge: ChallengePayload }
    | { type: 'error'; code: string; message: string };
