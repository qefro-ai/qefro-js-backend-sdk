import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

type QefroRequestType = 'ping' | 'tools.list' | 'tool.invoke' | 'tool.resume';
const SDK_NAME = '@qefro-ai/backend';
const SDK_VERSION = '1.0.0';

export interface QefroConfig {
    signingSecret: string;
    protocolVersion?: string;
    maxTimestampSkewSeconds?: number;
    endpointPath?: string;
}

export interface ListenOptions {
    port: number;
    host?: string;
    path?: string;
}

export interface QefroServerHandle {
    url: string;
    close(): Promise<void>;
}

type ToolAuthMode = 'none' | 'optional' | 'required';

export interface ToolDefinition {
    name: string;
    description?: string;
    input_schema?: Record<string, unknown>;
    authentication_methods?: string[];
    auth?: ToolAuthMode;
    permissions?: string[];
    timeout?: number;
    default_auth_method?: string;
}

export interface RegisteredTool {
    name: string;
    description?: string;
    input_schema?: Record<string, unknown>;
    authentication_methods?: string[];
    auth?: ToolAuthMode;
    permissions?: string[];
    timeout?: number;
}

interface ProtocolRequest {
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
}

type ProtocolResponse =
    | { type: 'pong'; protocol_version?: string; sdk_version?: string }
    | { type: 'tools.list'; tools: RegisteredTool[]; protocol_version?: string; sdk_version?: string }
    | { type: 'result'; output: unknown; authentication_context?: AuthenticationContextPayload }
    | { type: 'challenge'; resume_token: string; challenge: ChallengePayload }
    | { type: 'error'; code: string; message: string };

export interface ChallengePayload {
    type: 'email_otp' | 'sms_otp' | 'login' | 'custom';
    message: string;
    destination_hint?: string;
    login_url?: string;
}

export interface AuthenticationContextPayload {
    type?: 'bearer_token' | 'jwt' | 'cookie';
    access_token?: string;
    credential?: string;
    refresh_token?: string;
    expires_in?: number;
    customer_id?: string;
}

type AuthOutcome<T> =
    | { kind: 'success'; customer: T; auth: AuthenticationContextPayload }
    | { kind: 'challenge'; challenge: ChallengePayload }
    | { kind: 'denied' }
    | { kind: 'not_found' };

interface PendingInvocation {
    tool: string;
    conversationId: string;
    parameters: Record<string, unknown>;
    identity?: Record<string, unknown>;
    channel?: string;
}

interface StoredAuth {
    customer: unknown;
    auth: AuthenticationContextPayload;
    expiresAt: number;
}

interface CustomerState {
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

export interface CustomerContext {
    lookup(): Promise<unknown | null>;
    lookupByPhone(phone?: string): Promise<unknown | null>;
    authorize(options?: CustomerAuthorizeOptions): Promise<unknown>;
    get<T = unknown>(): T | undefined;
    require<T = unknown>(): T;
    [key: string]: unknown;
}

export type Middleware = (ctx: ToolContext, next: () => Promise<unknown>) => Promise<unknown>;
export type BeforeHook = (ctx: ToolContext) => Promise<void> | void;
export type AfterHook = (ctx: ToolContext, output: unknown) => Promise<unknown> | unknown;

export interface ToolContext {
    identity: Record<string, unknown>;
    parameters: Record<string, unknown>;
    conversation: { id: string };
    channel?: string;
    authentication?: Record<string, unknown>;
    logger: Pick<Console, 'info' | 'warn' | 'error'>;
    customer: CustomerContext;
    requireCustomer<T>(resolver: (auth: AuthBuilder<T>) => Promise<AuthOutcome<T>>): Promise<T>;
    authorizeCustomer<T>(resolver: (auth: AuthBuilder<T>) => Promise<AuthOutcome<T>>): Promise<T>;
    /** @deprecated Use ctx.customer.lookup + ctx.customer.authorize */
    requireAuthentication<T>(resolver: (auth: AuthBuilder<T>) => Promise<AuthOutcome<T>>): Promise<T>;
}

export interface AuthBuilder<T> {
    response?: string;
    success(
        customer: T,
        token: Omit<AuthenticationContextPayload, 'customer_id'> & { customer_id?: string },
    ): AuthOutcome<T>;
    denied(): AuthOutcome<T>;
    notFound(): AuthOutcome<T>;
    challenge: {
        emailOTP(email: string, message?: string): AuthOutcome<T>;
        smsOTP(phone: string, message?: string): AuthOutcome<T>;
        login(url: string, message?: string): AuthOutcome<T>;
        custom(challenge: ChallengePayload): AuthOutcome<T>;
    };
}

interface ToolRegistration {
    definition: ToolDefinition;
    handler: (ctx: ToolContext) => Promise<unknown>;
}

class ChallengeSignal extends Error {
    challenge: ChallengePayload;

    constructor(challenge: ChallengePayload) {
        super(challenge.message);
        this.challenge = challenge;
    }
}

export class Qefro {
    private readonly tools = new Map<string, ToolRegistration>();
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

    tool(name: string, handler: (ctx: ToolContext) => Promise<unknown>, metadata?: Omit<ToolDefinition, 'name'>): void;
    tool(name: string, metadata: Omit<ToolDefinition, 'name'>, handler: (ctx: ToolContext) => Promise<unknown>): void;
    tool(definition: ToolDefinition, handler: (ctx: ToolContext) => Promise<unknown>): void;
    tool(
        arg1: string | ToolDefinition,
        arg2: Omit<ToolDefinition, 'name'> | ((ctx: ToolContext) => Promise<unknown>),
        arg3?: Omit<ToolDefinition, 'name'> | ((ctx: ToolContext) => Promise<unknown>),
    ): void {
        const parsed = this.parseToolRegistration(arg1, arg2, arg3);
        this.tools.set(parsed.definition.name, parsed);
    }

    verifySignature(signature: string | undefined, timestamp: string | undefined, body: string): boolean {
        if (!signature || !timestamp) return false;
        const ts = Number(timestamp);
        if (!Number.isFinite(ts)) return false;

        const now = Math.floor(Date.now() / 1000);
        if (Math.abs(now - ts) > this.maxTimestampSkewSeconds) return false;

        const payload = `v1:${ts}:${body}`;
        const expected = `v1=${createHmac('sha256', this.signingSecret).update(payload).digest('hex')}`;
        const a = Buffer.from(expected);
        const b = Buffer.from(signature);
        return a.length === b.length && timingSafeEqual(a, b);
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
        return this.handle(req);
    }

    private parseToolRegistration(
        arg1: string | ToolDefinition,
        arg2: Omit<ToolDefinition, 'name'> | ((ctx: ToolContext) => Promise<unknown>),
        arg3?: Omit<ToolDefinition, 'name'> | ((ctx: ToolContext) => Promise<unknown>),
    ): ToolRegistration {
        if (typeof arg1 === 'string') {
            if (typeof arg2 === 'function') {
                const handler = arg2;
                const metadata = (arg3 ?? {}) as Omit<ToolDefinition, 'name'>;
                return {
                    definition: this.normalizeToolDefinition({ name: arg1, ...metadata }),
                    handler,
                };
            }
            if (typeof arg3 === 'function') {
                return {
                    definition: this.normalizeToolDefinition({ name: arg1, ...arg2 }),
                    handler: arg3,
                };
            }
        } else if (typeof arg2 === 'function') {
            return {
                definition: this.normalizeToolDefinition(arg1),
                handler: arg2,
            };
        }

        throw new Error('Invalid tool() signature');
    }

    private normalizeToolDefinition(definition: ToolDefinition): ToolDefinition {
        return {
            ...definition,
            auth: definition.auth ?? 'optional',
            permissions: definition.permissions ?? [],
            authentication_methods: definition.authentication_methods ?? [],
        };
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
        }));
    }

    private async handle(req: ProtocolRequest): Promise<ProtocolResponse> {
        if (req.protocol_version !== this.protocolVersion) {
            return { type: 'error', code: 'protocol_mismatch', message: 'Unsupported protocol version' };
        }

        if (req.type === 'ping') {
            return { type: 'pong', protocol_version: this.protocolVersion, sdk_version: '0.1.0' };
        }

        if (req.type === 'tools.list') {
            return {
                type: 'tools.list',
                tools: this.listRegisteredTools(),
                protocol_version: this.protocolVersion,
                sdk_version: '0.1.0',
            };
        }

        if (!req.tool) {
            return { type: 'error', code: 'invalid_request', message: 'tool is required' };
        }

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

        const customer = this.buildCustomerContext({
            identity: identity ?? {},
            parameters,
            conversationId,
            channel,
            logger: console,
            state,
            authResponse,
        });

        const ctx: ToolContext = {
            identity: identity ?? {},
            parameters,
            conversation: { id: conversationId },
            channel,
            authentication,
            logger: console,
            customer,
            requireCustomer: async <T>(resolver: (auth: AuthBuilder<T>) => Promise<AuthOutcome<T>>): Promise<T> => {
                const outcome = await resolver(this.authBuilder(authResponse));
                return this.consumeAuthOutcome(outcome, conversationId, state);
            },
            authorizeCustomer: async <T>(resolver: (auth: AuthBuilder<T>) => Promise<AuthOutcome<T>>): Promise<T> => {
                const outcome = await resolver(this.authBuilder(authResponse));
                return this.consumeAuthOutcome(outcome, conversationId, state);
            },
            requireAuthentication: async <T>(resolver: (auth: AuthBuilder<T>) => Promise<AuthOutcome<T>>): Promise<T> => {
                const outcome = await resolver(this.authBuilder(authResponse));
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

            let output = await this.runMiddlewares(ctx, async () => registration.handler(ctx));
            for (const hook of this.afterHooks) {
                output = await hook(ctx, output);
            }

            const latest = this.authByConversation.get(conversationId);
            return {
                type: 'result',
                output,
                authentication_context: latest?.auth,
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

    private buildCustomerContext(args: {
        identity: Record<string, unknown>;
        parameters: Record<string, unknown>;
        conversationId: string;
        channel?: string;
        logger: Pick<Console, 'info' | 'warn' | 'error'>;
        state: CustomerState;
        authResponse?: string;
    }): CustomerContext {
        const api: CustomerContext = {
            lookup: async (): Promise<unknown | null> => {
                if (!this.customerProvider) {
                    throw new Error('customer_provider_missing');
                }
                if (args.state.lookupCompleted) {
                    return args.state.current ?? null;
                }
                const customer = await this.customerProvider.lookup({
                    identity: args.identity,
                    parameters: args.parameters,
                    conversation: { id: args.conversationId },
                    channel: args.channel,
                    logger: args.logger,
                });
                args.state.current = customer ?? undefined;
                args.state.lookupCompleted = true;
                return customer;
            },
            lookupByPhone: async (phone?: string): Promise<unknown | null> => {
                if (!this.customerProvider) {
                    throw new Error('customer_provider_missing');
                }
                const source = phone ?? this.readIdentityPhone(args.identity);
                if (!source) {
                    args.state.lookupCompleted = true;
                    args.state.current = undefined;
                    return null;
                }
                const customer = await this.customerProvider.lookup({
                    identity: { ...args.identity, phone: source },
                    parameters: args.parameters,
                    conversation: { id: args.conversationId },
                    channel: args.channel,
                    logger: args.logger,
                });
                args.state.current = customer ?? undefined;
                args.state.lookupCompleted = true;
                return customer;
            },
            authorize: async (options?: CustomerAuthorizeOptions): Promise<unknown> => {
                if (!this.customerProvider) {
                    throw new Error('customer_provider_missing');
                }

                const existing = this.authByConversation.get(args.conversationId);
                if (existing && existing.expiresAt > Date.now()) {
                    args.state.current = existing.customer;
                    args.state.lookupCompleted = true;
                    return existing.customer;
                }

                const customer = await api.lookup();
                if (!customer) {
                    throw new Error('customer_not_found');
                }

                const outcome = await this.customerProvider.authorize({
                    customer,
                    method: options?.method,
                    response: args.authResponse,
                    identity: args.identity,
                    parameters: args.parameters,
                    conversation: { id: args.conversationId },
                    channel: args.channel,
                    logger: args.logger,
                });

                return this.consumeAuthOutcome(outcome, args.conversationId, args.state);
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

    private authBuilder<T>(authResponse?: string): AuthBuilder<T> {
        return {
            response: authResponse,
            success: (customer, token) => ({
                kind: 'success',
                customer,
                auth: {
                    ...token,
                    customer_id: token.customer_id ?? this.readCustomerId(customer),
                },
            }),
            denied: () => ({ kind: 'denied' }),
            notFound: () => ({ kind: 'not_found' }),
            challenge: {
                emailOTP: (email, message) => ({
                    kind: 'challenge',
                    challenge: {
                        type: 'email_otp',
                        message: message ?? 'Enter the OTP sent to your email.',
                        destination_hint: this.mask(email),
                    },
                }),
                smsOTP: (phone, message) => ({
                    kind: 'challenge',
                    challenge: {
                        type: 'sms_otp',
                        message: message ?? 'Enter the OTP sent to your phone.',
                        destination_hint: this.mask(phone),
                    },
                }),
                login: (url, message) => ({
                    kind: 'challenge',
                    challenge: {
                        type: 'login',
                        message: message ?? 'Please continue in your login page.',
                        login_url: url,
                    },
                }),
                custom: (challenge) => ({ kind: 'challenge', challenge }),
            },
        };
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

    private readCustomerId(customer: unknown): string | undefined {
        if (!customer || typeof customer !== 'object') return undefined;
        const id = (customer as Record<string, unknown>).id;
        return typeof id === 'string' ? id : undefined;
    }

    private readIdentityPhone(identity: Record<string, unknown>): string | undefined {
        const phone = identity.phone;
        return typeof phone === 'string' && phone.trim() ? phone : undefined;
    }

    private mask(value: string): string {
        if (value.length <= 4) return value;
        return `${value.slice(0, 2)}***${value.slice(-2)}`;
    }

    private async runMiddlewares(ctx: ToolContext, handler: () => Promise<unknown>): Promise<unknown> {
        let index = -1;
        const dispatch = async (i: number): Promise<unknown> => {
            if (i <= index) {
                throw new Error('next() called multiple times');
            }
            index = i;
            if (i === this.middlewares.length) {
                return handler();
            }
            const mw = this.middlewares[i];
            return mw(ctx, () => dispatch(i + 1));
        };
        return dispatch(0);
    }

    private async handleHttp(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
        this.applyProtocolHeaders(res);

        if ((req.method ?? 'GET').toUpperCase() !== 'POST' || (req.url ?? '') !== path) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'not_found' }));
            return;
        }

        try {
            const body = await this.readBody(req);
            const headers: Record<string, string | undefined> = {
                'x-qefro-signature': this.headerValue(req, 'x-qefro-signature'),
                'x-qefro-timestamp': this.headerValue(req, 'x-qefro-timestamp'),
                'x-qefro-protocol': this.headerValue(req, 'x-qefro-protocol'),
                'x-qefro-protocol-version': this.headerValue(req, 'x-qefro-protocol-version'),
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

    private headerValue(req: IncomingMessage, key: string): string | undefined {
        const value = req.headers[key];
        if (Array.isArray(value)) return value[0];
        return value;
    }

    private applyProtocolHeaders(res: ServerResponse): void {
        res.setHeader('X-Qefro-Protocol', this.protocolVersion);
        res.setHeader('X-Qefro-Protocol-Version', this.protocolVersion);
        res.setHeader('X-Qefro-SDK', SDK_NAME);
        res.setHeader('X-Qefro-Version', SDK_VERSION);
    }

    private async readBody(req: IncomingMessage): Promise<string> {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
            chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks).toString('utf8');
    }
}

export default Qefro;