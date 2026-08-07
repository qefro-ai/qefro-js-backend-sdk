import type { IncomingMessage, ServerResponse } from 'http';
import { SDK_NAME, SDK_VERSION } from './protocol.js';

export interface ListenOptions {
    port: number;
    host?: string;
    path?: string;
}

export interface QefroServerHandle {
    url: string;
    close(): Promise<void>;
}

export function headerValue(req: IncomingMessage, key: string): string | undefined {
    const value = req.headers[key];
    if (Array.isArray(value)) return value[0];
    return value;
}

export function applyProtocolHeaders(res: ServerResponse, protocolVersion: string): void {
    res.setHeader('X-Qefro-Protocol', protocolVersion);
    res.setHeader('X-Qefro-Protocol-Version', protocolVersion);
    res.setHeader('X-Qefro-SDK', SDK_NAME);
    res.setHeader('X-Qefro-Version', SDK_VERSION);
}

export async function readBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
}
