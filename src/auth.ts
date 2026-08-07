import type { PlatformCapabilities } from './storage.js';

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

export type AuthOutcome<T> =
    | { kind: 'success'; customer: T; auth: AuthenticationContextPayload }
    | { kind: 'challenge'; challenge: ChallengePayload }
    | { kind: 'denied' }
    | { kind: 'not_found' };

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

export interface PendingInvocation {
    tool: string;
    conversationId: string;
    parameters: Record<string, unknown>;
    identity?: Record<string, unknown>;
    channel?: string;
    platform?: PlatformCapabilities;
}

export interface StoredAuth {
    customer: unknown;
    auth: AuthenticationContextPayload;
    expiresAt: number;
}

export class ChallengeSignal extends Error {
    challenge: ChallengePayload;

    constructor(challenge: ChallengePayload) {
        super(challenge.message);
        this.challenge = challenge;
    }
}

export function maskSecret(value: string): string {
    if (value.length <= 4) return value;
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

export function readCustomerId(customer: unknown): string | undefined {
    if (!customer || typeof customer !== 'object') return undefined;
    const id = (customer as Record<string, unknown>).id;
    return typeof id === 'string' ? id : undefined;
}

export function createAuthBuilder<T>(authResponse?: string): AuthBuilder<T> {
    return {
        response: authResponse,
        success: (customer, token) => ({
            kind: 'success',
            customer,
            auth: {
                ...token,
                customer_id: token.customer_id ?? readCustomerId(customer),
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
                    destination_hint: maskSecret(email),
                },
            }),
            smsOTP: (phone, message) => ({
                kind: 'challenge',
                challenge: {
                    type: 'sms_otp',
                    message: message ?? 'Enter the OTP sent to your phone.',
                    destination_hint: maskSecret(phone),
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
