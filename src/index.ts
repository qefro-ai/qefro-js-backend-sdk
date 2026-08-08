/**
 * @qefro-ai/backend — public API surface.
 * Modules live under src/*.ts; this file re-exports for backward compatibility.
 */

export { Qefro } from './app.js';
export { default } from './app.js';

export type { QefroConfig } from './protocol.js';
export { SDK_NAME, SDK_VERSION } from './protocol.js';

export type { ListenOptions, QefroServerHandle } from './server.js';

export type {
    ToolLookup,
    ToolDefinition,
    RegisteredTool,
    ToolHandler,
    ToolContext,
} from './tools.js';
export { normalizeLookup } from './tools.js';

export type {
    PlatformStorageContext,
    PlatformCustomerContext,
    PlatformMarketingContext,
    PlatformMarketingBinding,
    PlatformOrganizationContext,
    PlatformOrganizationBinding,
    PlatformCapabilities,
    StorageContext,
} from './storage.js';

export type {
    FlowTrigger,
    BusinessFlowMetadata,
    FlowStepType,
    AskStepConfig,
    ToolStepConfig,
    ChallengeStepConfig,
    UploadStepConfig,
    ConditionStepConfig,
    DelayStepConfig,
    ApprovalStepConfig,
    CompleteStepConfig,
    MessageStepConfig,
    TagStepConfig,
    ActivityStepConfig,
    AssignStepConfig,
    FlowStep,
    BusinessFlow,
} from './flow.js';
export { FlowBuilder, normalizeFlowTrigger } from './flow.js';

export type {
    EventHandlerDefinition,
    EventHandler,
    EventContext,
} from './events.js';

export type {
    ChallengePayload,
    AuthenticationContextPayload,
    AuthBuilder,
} from './auth.js';

export type {
    CustomerLookupContext,
    CustomerAuthorizeContext,
    CustomerProvider,
    CustomerAuthorizeOptions,
    CustomerContext,
    CustomerIdentityInput,
    CustomerUpdateInput,
    CustomerNoteOptions,
    CustomerTagOptions,
    HubCustomer,
    TimelineAppendInput,
    TimelineContext,
    MembershipAttachInput,
    MembershipContext,
    ConsentInput,
    ConsentContext,
} from './customer.js';
export {
    readIdentityPhone,
    envFlagTrue,
    isCustomerHubEnabled,
    isCustomerHubOptional,
    hubCustomerFromPerson,
    buildHubCustomerContext,
    buildTimelineContext,
    buildMembershipContext,
    buildConsentContext,
} from './customer.js';

export type {
    PersonRecord,
    PersonMutation,
    PersonContext,
    PersonEventName,
} from './person.js';
export {
    PersonEvents,
    personEventTrigger,
    onPersonCreated,
    onPersonUpdated,
    onPersonStatusChanged,
    onPersonMerged,
} from './person.js';

export type { Middleware, BeforeHook, AfterHook } from './middleware.js';

export type {
    MarketingAudienceSource,
    MarketingVariableType,
    MarketingVariableSource,
    MarketingActionKind,
    MarketingLandingHost,
    MarketingChannelId,
    MarketingAudienceCustomerHub,
    MarketingAudienceAppQuery,
    MarketingAudience,
    MarketingVariable,
    MarketingAction,
    MarketingLandingPage,
    MarketingChannel,
    MarketingDefinition,
    MarketingRegistration,
    MarketingCapability,
    MarketingContext,
} from './marketing.js';
export {
    validateMarketingDefinition,
    toMarketingCapability,
    isMarketingEnabled,
    buildMarketingContext,
} from './marketing.js';
export type {
    OrganizationTaskPriority,
    OrganizationEvent,
    OrganizationAction,
    OrganizationTaskType,
    OrganizationDefinition,
    OrganizationCapabilities,
    OrganizationCapability,
    OrganizationContext,
} from './organization.js';
export {
    validateOrganizationDefinition,
    toOrganizationCapability,
    isOrganizationEnabled,
    buildOrganizationContext,
} from './organization.js';
