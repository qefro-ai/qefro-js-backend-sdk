/** Durable local outbox for Business Events (`ctx.emit()` = persist, then deliver). */

import {
    closeSync,
    fsyncSync,
    mkdirSync,
    openSync,
    readdirSync,
    readFileSync,
    renameSync,
    statSync,
    unlinkSync,
    writeSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';
import type { EmittedBusinessEvent } from './business_events.js';

const MAX_FILES = 200;

export function defaultOutboxDir(signingSecret: string): string {
    const shard = createHash('sha256').update(signingSecret).digest('hex').slice(0, 12);
    return join(tmpdir(), 'qefro-event-outbox', shard);
}

function fileNameFor(eventId: string): string {
    return `${Buffer.from(eventId, 'utf8').toString('base64url').slice(0, 180)}.json`;
}

export class EventOutbox {
    constructor(private readonly dir: string) {
        mkdirSync(dir, { recursive: true });
    }

    /** Persist then fsync so emit survives process crash after ERP commit. */
    put(event: EmittedBusinessEvent): EmittedBusinessEvent {
        const eventId = event.event_id?.trim();
        if (!eventId) {
            throw new Error('outbox.put requires event_id');
        }
        mkdirSync(this.dir, { recursive: true });
        const dest = join(this.dir, fileNameFor(eventId));
        const tmp = `${dest}.tmp`;
        const body = JSON.stringify({ ...event, queued_at: new Date().toISOString() });
        const fd = openSync(tmp, 'w');
        try {
            writeSync(fd, body);
            fsyncSync(fd);
        } finally {
            closeSync(fd);
        }
        renameSync(tmp, dest);
        this.prune();
        return event;
    }

    pending(): EmittedBusinessEvent[] {
        const out: EmittedBusinessEvent[] = [];
        let names: string[];
        try {
            names = readdirSync(this.dir);
        } catch {
            return out;
        }
        for (const name of names) {
            if (!name.endsWith('.json')) continue;
            try {
                const raw = JSON.parse(readFileSync(join(this.dir, name), 'utf8')) as EmittedBusinessEvent & {
                    queued_at?: string;
                };
                if (raw && typeof raw.event_type === 'string') {
                    const { queued_at: _queued, ...event } = raw;
                    out.push(event);
                }
            } catch {
                // skip corrupt
            }
        }
        return out;
    }

    ack(eventId: string): void {
        const id = eventId.trim();
        if (!id) return;
        try {
            unlinkSync(join(this.dir, fileNameFor(id)));
        } catch {
            // already delivered
        }
    }

    private prune(): void {
        let names: string[];
        try {
            names = readdirSync(this.dir).filter((n) => n.endsWith('.json'));
        } catch {
            return;
        }
        if (names.length <= MAX_FILES) return;
        names.sort((a, b) => statSync(join(this.dir, a)).mtimeMs - statSync(join(this.dir, b)).mtimeMs);
        for (const name of names.slice(0, names.length - MAX_FILES)) {
            try {
                unlinkSync(join(this.dir, name));
            } catch {
                // ignore
            }
        }
    }
}
