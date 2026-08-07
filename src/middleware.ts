import type { ToolContext } from './tools.js';

export type Middleware = (ctx: ToolContext, next: () => Promise<unknown>) => Promise<unknown>;
export type BeforeHook = (ctx: ToolContext) => Promise<void> | void;
export type AfterHook = (ctx: ToolContext, output: unknown) => Promise<unknown> | unknown;

export async function runMiddlewares(
    middlewares: Middleware[],
    ctx: ToolContext,
    handler: () => Promise<unknown>,
): Promise<unknown> {
    let index = -1;
    const dispatch = async (i: number): Promise<unknown> => {
        if (i <= index) {
            throw new Error('next() called multiple times');
        }
        index = i;
        if (i === middlewares.length) {
            return handler();
        }
        const mw = middlewares[i];
        return mw(ctx, () => dispatch(i + 1));
    };
    return dispatch(0);
}
