import { createServer } from 'http';
import { randomUUID } from 'crypto';
import {
    ChallengeSignal,
    createAuthBuilder,
    type AuthBuilder,
    type AuthOutcome,
    type PendingInvocation,
    type StoredAuth,
} from './auth.js';
import {
    buildConsentContext,
    buildHubCustomerContext,
    buildMembershipContext,
    buildTimelineContext,
    type CustomerContext,
    type CustomerProvider,
    type CustomerState,
} from './customer.js';
import {
    type EventHandler,
    type EventHandlerDefinition,
    type NamedHandlerRegistration,
} from './events.js';
import {
    FlowBuilder,
    normalizeFlowTrigger,
    type BusinessFlow,
    type BusinessFlowMetadata,
    type FlowRegistration,
} from './flow.js';
import { runMiddlewares, type AfterHook, type BeforeHook, type Middleware } from './middleware.js';
import {
    buildPersonContext,
    type PersonMutation,
    type PersonRecord,
} from './person.js';
import {
    SDK_NAME,
    SDK_VERSION,
    type ProtocolRequest,
    type ProtocolResponse,
    type QefroConfig,
} from './protocol.js';
import {
    applyProtocolHeaders,
    headerValue,
    readBody,
    type ListenOptions,
    type QefroServerHandle,
} from './server.js';
import { buildStorageContext, type PlatformCapabilities } from './storage.js';
import {
    parseToolRegistration,
    type AnyToolHandler,
    type RegisteredTool,
    type ToolContext,
    type ToolDefinition,
    type ToolHandler,
    type ToolRegistration,
} from './tools.js';
import { verifySignature } from './transport.js';

export class Qefro {
    private readonly tools = new Map<string, ToolRegistration>();
    private readonly flows = new Map<string, FlowRegistration>();
    private readonly events = new Map<string, NamedHandlerRegistration>();
    private readonly webhooks = new Map<string, NamedHandlerRegistration>();
    private readonly schedules = new Map<string, NamedHandlerRegistration>();
    private readonly pending = new Map<string, PendingInvocation>();
    private readonly authByConversation = new Map<string, StoredAuth>();
    private readonly protocolVersion: string;
    private readonly maxTimestampSkewSeconds: number;
    private readonly signingSecret: string;
    private readonly endpointPath: string;
    private readonly middlewares: Middleware[] = [];
    private readonly beforeHooks: BeforeHook[] = [];
    private readonly afterHooks: AfterHook[] = [];
    private customerProvider?: CustomerProvider;

    constructor(config: QefroConfig) {
        this.signingSecret = config.signingSecret;
        this.protocolVersion = config.protocolVersion ?? '1';
        this.maxTimestampSkewSeconds = config.maxTimestampSkewSeconds ?? 300;
        this.endpointPath = config.endpointPath ?? '/qefro';
    }

    use(middleware: Middleware): this {
        this.middlewares.push(middleware);
        return this;
    }

    before(hook: BeforeHook): this {
        this.beforeHooks.push(hook);
        return this;
    }

    after(hook: AfterHook): this {
        this.afterHooks.push(hook);
        return this;
    }

    customer(provider: CustomerProvider): this {
        this.customerProvider = provider;
        return this;
    }

    tool<TInput = Record<string, unknown>, TOutput = unknown>(
        name: string,
        handler: ToolHandler<TInput, TOutput>,
        metadata?: Omit<ToolDefinition<TInput, TOutput>, 'name'>,
    ): void;
    tool<TInput = Record<string, unknown>, TOutput = unknown>(
        name: string,
        metadata: Omit<ToolDefinition<TInput, TOutput>, 'name'>,
        handler: ToolHandler<TInput, TOutput>,
    ): void;
    tool<TInput = Record<string, unknown>, TOutput = unknown>(
        definition: ToolDefinition<TInput, TOutput>,
        handler: ToolHandler<TInput, TOutput>,
    ): void;
    tool(
        arg1: string | ToolDefinition,
        arg2: Omit<ToolDefinition, 'name'> | AnyToolHandler,
        arg3?: Omit<ToolDefinition, 'name'> | AnyToolHandler,
    ): void {
        const parsed = parseToolRegistration(arg1, arg2, arg3);
        this.tools.set(parsed.definition.name, parsed);
    }

    /**
     * Register a Business Flow. Flows are metadata only: the SDK advertises them
     * through `capabilities.list` and the Qefro Runtime orchestrates execution.
     *
     * Optional `metadata.trigger` selects the entry path:
     * - `{ type: 'conversation' }` (default) — chat / semantic selection
     * - `{ type: 'event', event: 'shopify.order.created' }` — bus event
     * - `{ type: 'schedule', cron: '0 9 * * *' }` — cron tick
     * - `{ type: 'webhook', name?: 'shipment.delivered' }` — webhook alias
     */
    flow(metadata: BusinessFlowMetadata): FlowBuilder {
        const id = typeof metadata.id === 'string' ? metadata.id.trim() : '';
        if (!id) {
            throw new Error('flow() requires a non-empty metadata.id');
        }
        if (this.flows.has(id)) {
            throw new Error(`Flow "${id}" is already registered`);
        }
        const trigger = normalizeFlowTrigger(metadata.trigger);
        const registration: FlowRegistration = {
            metadata: {
                ...metadata,
                id,
                version: metadata.version ?? 1,
                ...(trigger ? { trigger } : {}),
            },
            steps: [],
        };
        this.flows.set(id, registration);
        return new FlowBuilder(registration);
    }

    /**
     * Register a standalone event handler. Advertised via `capabilities.list`;
     * the Qefro runtime owns delivery. Connectors emit into the bus — they never
     * execute flows directly.
     */
    event(def: EventHandlerDefinition & { handler: EventHandler }): this;
    event(def: EventHandlerDefinition, handler: EventHandler): this;
    event(
        def: EventHandlerDefinition & { handler?: EventHandler },
        handler?: EventHandler,
    ): this {
        const h = handler ?? def.handler;
        if (!h) throw new Error('event() requires a handler');
        this.registerNamedHandler(this.events, 'event', def, h);
        return this;
    }

    /** Register a webhook alias (normalized to an orchestration event at ingest). */
    webhook(def: EventHandlerDefinition & { handler: EventHandler }): this;
    webhook(def: EventHandlerDefinition, handler: EventHandler): this;
    webhook(
        def: EventHandlerDefinition & { handler?: EventHandler },
        handler?: EventHandler,
    ): this {
        const h = handler ?? def.handler;
        if (!h) throw new Error('webhook() requires a handler');
        this.registerNamedHandler(this.webhooks, 'webhook', def, h);
        return this;
    }

    /**
     * Register a cron schedule. The runtime scheduler emits the named event;
     * this does not run inside the SDK process.
     */
    schedule(def: EventHandlerDefinition & { cron: string; handler: EventHandler }): this;
    schedule(def: EventHandlerDefinition & { cron: string }, handler: EventHandler): this;
    schedule(
        def: EventHandlerDefinition & { cron: string; handler?: EventHandler },
        handler?: EventHandler,
    ): this {
        const cron = typeof def.cron === 'string' ? def.cron.trim() : '';
        if (!cron) throw new Error('schedule() requires a non-empty cron expression');
        const h = handler ?? def.handler;
        if (!h) throw new Error('schedule() requires a handler');
        this.registerNamedHandler(this.schedules, 'schedule', { ...def, cron }, h);
        return this;
    }

    private registerNamedHandler(
        map: Map<string, NamedHandlerRegistration>,
        kind: 'event' | 'webhook' | 'schedule',
        def: EventHandlerDefinition,
        handler: EventHandler,
    ): void {
        const name = typeof def.name === 'string' ? def.name.trim() : '';
        if (!name) throw new Error(`${kind}() requires a non-empty name`);
        if (map.has(name)) throw new Error(`${kind} "${name}" is already registered`);
        map.set(name, {
            kind,
            definition: {
                name,
                description: def.description,
                ...(def.cron ? { cron: def.cron } : {}),
            },
            handler,
        });
    }

    verifySignature(signature: string | undefined, timestamp: string | undefined, body: string): boolean {
        return verifySignature(
            this.signingSecret,
            signature,
            timestamp,
            body,
            this.maxTimestampSkewSeconds,
        );
    }

    async listen(options: ListenOptions): Promise<QefroServerHandle> {
        const host = options.host ?? '0.0.0.0';
        const path = options.path ?? this.endpointPath;
        const server = createServer(async (req, res) => {
            await this.handleHttp(req, res, path);
        });

        await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(options.port, host, () => resolve());
        });

        return {
            url: `http://${host}:${options.port}${path}`,
            close: () =>
                new Promise<void>((resolve, reject) => {
                    server.close((err) => (err ? reject(err) : resolve()));
                }),
        };
    }

    async handleRaw(body: string, headers: Record<string, string | undefined>): Promise<unknown> {
        if (!this.verifySignature(headers['x-qefro-signature'], headers['x-qefro-timestamp'], body)) {
            return { error: 'invalid_signature' };
        }
        const protocolHeader = headers['x-qefro-protocol'] ?? headers['x-qefro-protocol-version'];
        if (protocolHeader && protocolHeader !== this.protocolVersion) {
            return { error: 'protocol_mismatch', expected: this.protocolVersion, received: protocolHeader };
        }
        const req = JSON.parse(body) as ProtocolRequest;
        return this.handle(req, headers);
    }

    private listRegisteredFlows(): BusinessFlow[] {
        return [...this.flows.values()].map((flow) => ({
            metadata: flow.metadata,
            steps: flow.steps,
        }));
    }

    private listRegisteredTools(): RegisteredTool[] {
        return [...this.tools.values()].map((tool) => ({
            name: tool.definition.name,
            description: tool.definition.description,
            input_schema: tool.definition.input_schema,
            authentication_methods: tool.definition.authentication_methods,
            auth: tool.definition.auth,
            permissions: tool.definition.permissions,
            timeout: tool.definition.timeout,
            lookup: tool.definition.lookup,
        }));
    }

    private listRegisteredEvents(): EventHandlerDefinition[] {
        return [...this.events.values()].map((e) => e.definition);
    }

    private listRegisteredWebhooks(): EventHandlerDefinition[] {
        return [...this.webhooks.values()].map((e) => e.definition);
    }

    private listRegisteredSchedules(): Array<EventHandlerDefinition & { cron: string }> {
        return [...this.schedules.values()].map((e) => ({
            name: e.definition.name,
            description: e.definition.description,
            cron: e.definition.cron ?? '',
        }));
    }

    private async handle(
        req: ProtocolRequest,
        headers?: Record<string, string | undefined>,
    ): Promise<ProtocolResponse> {
        if (req.protocol_version !== this.protocolVersion) {
            return { type: 'error', code: 'protocol_mismatch', message: 'Unsupported protocol version' };
        }

        if (req.type === 'ping') {
            return { type: 'pong', protocol_version: this.protocolVersion, sdk_version: SDK_VERSION };
        }

        if (req.type === 'tools.list') {
            return {
                type: 'tools.list',
                tools: this.listRegisteredTools(),
                protocol_version: this.protocolVersion,
                sdk_version: SDK_VERSION,
            };
        }

        if (req.type === 'capabilities.list') {
            return {
                type: 'capabilities.list',
                tools: this.listRegisteredTools(),
                flows: this.listRegisteredFlows(),
                events: this.listRegisteredEvents(),
                webhooks: this.listRegisteredWebhooks(),
                schedules: this.listRegisteredSchedules(),
                protocol_version: this.protocolVersion,
                sdk_version: SDK_VERSION,
                sdk_name: SDK_NAME,
            };
        }

        if (!req.tool) {
            return { type: 'error', code: 'invalid_request', message: 'tool is required' };
        }

        const traceId = headers?.['x-qefro-trace-id']?.trim() || undefined;

        if (req.type === 'tool.resume') {
            if (!req.resume_token || !req.challenge_response) {
                return {
                    type: 'error',
                    code: 'invalid_request',
                    message: 'resume_token and challenge_response are required',
                };
            }

            const pending = this.pending.get(req.resume_token);
            if (!pending) {
                return { type: 'error', code: 'not_found', message: 'resume token not found or expired' };
            }
            this.pending.delete(req.resume_token);

            return this.invokeTool(
                pending.tool,
                pending.parameters,
                pending.conversationId,
                pending.identity,
                pending.channel,
                req.challenge_response,
                req.authentication,
                req.person,
                req.platform ?? pending.platform,
                traceId,
            );
        }

        return this.invokeTool(
            req.tool,
            req.parameters ?? {},
            req.conversation_id ?? randomUUID(),
            req.identity,
            req.channel,
            undefined,
            req.authentication,
            req.person,
            req.platform,
            traceId,
        );
    }

    private async invokeTool(
        toolName: string,
        parameters: Record<string, unknown>,
        conversationId: string,
        identity?: Record<string, unknown>,
        channel?: string,
        authResponse?: string,
        authentication?: Record<string, unknown>,
        personSnapshot?: PersonRecord | null,
        platform?: PlatformCapabilities,
        traceId?: string,
    ): Promise<ProtocolResponse> {
        const registration = this.tools.get(toolName);
        if (!registration) {
            return { type: 'error', code: 'not_found', message: `Unknown tool: ${toolName}` };
        }

        const stored = this.authByConversation.get(conversationId);
        const hasValidStored = Boolean(stored && stored.expiresAt > Date.now());
        const state: CustomerState = {
            current: hasValidStored ? stored?.customer : undefined,
            lookupCompleted: hasValidStored,
        };

        const logger: Pick<Console, 'info' | 'warn' | 'error'> = {
            info: (...args: unknown[]) =>
                console.info(traceId ? { trace_id: traceId } : {}, ...args),
            warn: (...args: unknown[]) =>
                console.warn(traceId ? { trace_id: traceId } : {}, ...args),
            error: (...args: unknown[]) =>
                console.error(traceId ? { trace_id: traceId } : {}, ...args),
        };

        const customer = buildHubCustomerContext({
            identity: identity ?? {},
            parameters,
            conversationId,
            channel,
            logger,
            state,
            authResponse,
            platform,
            customerProvider: this.customerProvider,
            getCachedAuth: () => {
                const existing = this.authByConversation.get(conversationId);
                if (existing && existing.expiresAt > Date.now()) {
                    return existing.customer;
                }
                return undefined;
            },
            consumeAuthOutcome: (outcome, conversationId, customerState) =>
                this.consumeAuthOutcome(outcome, conversationId, customerState),
        });

        // Seed hub customer from Person snapshot when present (native chat path).
        if (personSnapshot && typeof personSnapshot === 'object' && personSnapshot.id) {
            const seeded = {
                id: personSnapshot.id,
                phone_number: personSnapshot.phone ?? null,
                whatsapp_number: personSnapshot.phone ?? null,
                display_name: personSnapshot.name ?? null,
                email: personSnapshot.email ?? null,
                status: personSnapshot.status ?? null,
                workspace_id: personSnapshot.workspace_id ?? null,
            };
            state.current = seeded;
            state.lookupCompleted = true;
        }

        const personMutations: PersonMutation[] = [];
        const person = buildPersonContext({
            snapshot: personSnapshot,
            mutations: personMutations,
        });

        const storage = buildStorageContext(platform);
        const timeline = buildTimelineContext({ platform, state });
        const membership = buildMembershipContext({
            platform,
            state,
            solutionId: platform?.customer?.context?.solution_id ?? platform?.storage?.context?.solution_id,
        });
        const consent = buildConsentContext({ platform, state });

        const ctx: ToolContext = {
            identity: identity ?? {},
            parameters,
            conversation: { id: conversationId },
            channel,
            authentication,
            logger,
            trace_id: traceId,
            customer,
            person,
            storage,
            timeline,
            membership,
            consent,
            requireCustomer: async <T>(resolver: (auth: AuthBuilder<T>) => Promise<AuthOutcome<T>>): Promise<T> => {
                const outcome = await resolver(createAuthBuilder(authResponse));
                return this.consumeAuthOutcome(outcome, conversationId, state);
            },
            authorizeCustomer: async <T>(resolver: (auth: AuthBuilder<T>) => Promise<AuthOutcome<T>>): Promise<T> => {
                const outcome = await resolver(createAuthBuilder(authResponse));
                return this.consumeAuthOutcome(outcome, conversationId, state);
            },
            requireAuthentication: async <T>(resolver: (auth: AuthBuilder<T>) => Promise<AuthOutcome<T>>): Promise<T> => {
                const outcome = await resolver(createAuthBuilder(authResponse));
                return this.consumeAuthOutcome(outcome, conversationId, state);
            },
        };

        try {
            for (const hook of this.beforeHooks) {
                await hook(ctx);
            }

            if (registration.definition.auth === 'required') {
                await ctx.customer.authorize({ method: registration.definition.default_auth_method });
            }

            let output = await runMiddlewares(this.middlewares, ctx, async () => registration.handler(ctx));
            for (const hook of this.afterHooks) {
                output = await hook(ctx, output);
            }

            const latest = this.authByConversation.get(conversationId);
            return {
                type: 'result',
                output,
                authentication_context: latest?.auth,
                person_mutations: personMutations.length > 0 ? personMutations : undefined,
            };
        } catch (err) {
            if (err instanceof ChallengeSignal) {
                const resumeToken = randomUUID();
                this.pending.set(resumeToken, {
                    tool: toolName,
                    conversationId,
                    parameters,
                    identity,
                    channel,
                    platform,
                });
                return {
                    type: 'challenge',
                    resume_token: resumeToken,
                    challenge: err.challenge,
                };
            }

            const message = err instanceof Error ? err.message : String(err);
            if (message === 'denied') {
                return { type: 'error', code: 'denied', message: 'Authentication denied' };
            }
            if (message === 'customer_not_found') {
                return { type: 'error', code: 'customer_not_found', message: 'Customer not found' };
            }
            if (message === 'person_not_found') {
                return {
                    type: 'error',
                    code: 'person_not_found',
                    message: 'No Customer Hub Person is linked to this conversation.',
                };
            }
            if (message === 'customer_provider_missing') {
                return {
                    type: 'error',
                    code: 'configuration_error',
                    message: 'Tool requires customer provider. Configure app.customer(...) first.',
                };
            }

            return { type: 'error', code: 'internal_error', message };
        }
    }

    private consumeAuthOutcome<T>(outcome: AuthOutcome<T>, conversationId: string, state: CustomerState): T {
        if (outcome.kind === 'success') {
            const expiresIn = Math.max(1, outcome.auth.expires_in ?? 900);
            this.authByConversation.set(conversationId, {
                customer: outcome.customer,
                auth: outcome.auth,
                expiresAt: Date.now() + expiresIn * 1000,
            });
            state.current = outcome.customer;
            state.lookupCompleted = true;
            return outcome.customer;
        }

        if (outcome.kind === 'challenge') {
            throw new ChallengeSignal(outcome.challenge);
        }

        if (outcome.kind === 'denied') {
            throw new Error('denied');
        }

        throw new Error('customer_not_found');
    }

    private async handleHttp(
        req: import('http').IncomingMessage,
        res: import('http').ServerResponse,
        path: string,
    ): Promise<void> {
        applyProtocolHeaders(res, this.protocolVersion);

        if ((req.method ?? 'GET').toUpperCase() !== 'POST' || (req.url ?? '') !== path) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'not_found' }));
            return;
        }

        try {
            const body = await readBody(req);
            const headers: Record<string, string | undefined> = {
                'x-qefro-signature': headerValue(req, 'x-qefro-signature'),
                'x-qefro-timestamp': headerValue(req, 'x-qefro-timestamp'),
                'x-qefro-protocol': headerValue(req, 'x-qefro-protocol'),
                'x-qefro-protocol-version': headerValue(req, 'x-qefro-protocol-version'),
            };

            const protocolHeader = headers['x-qefro-protocol'] ?? headers['x-qefro-protocol-version'];
            if (protocolHeader && protocolHeader !== this.protocolVersion) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(
                    JSON.stringify({
                        type: 'error',
                        code: 'protocol_mismatch',
                        message: `Unsupported protocol version ${protocolHeader}`,
                    }),
                );
                return;
            }

            if (!this.verifySignature(headers['x-qefro-signature'], headers['x-qefro-timestamp'], body)) {
                res.statusCode = 401;
                res.setHeader('Content-Type', 'application/json');
                res.end(
                    JSON.stringify({
                        type: 'error',
                        code: 'invalid_signature',
                        message: 'Invalid Qefro signature',
                    }),
                );
                return;
            }

            const protocolReq = JSON.parse(body) as ProtocolRequest;
            const protocolResp = await this.handle(protocolReq);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(protocolResp));
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ type: 'error', code: 'internal_error', message }));
        }
    }
}

export default Qefro;
