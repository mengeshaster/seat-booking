import { AsyncLocalStorage } from "node:async_hooks";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogFields = Record<string, unknown>;
type RequestLogContext = { requestId: string };

const requestLogContext = new AsyncLocalStorage<RequestLogContext>();

function serializeValue(value: unknown): unknown {
    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message,
            stack: value.stack
        };
    }

    return value;
}

function write(level: LogLevel, message: string, fields: LogFields = {}): void {
    const context = requestLogContext.getStore();
    const normalizedFields = Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [key, serializeValue(value)])
    );

    process.stdout.write(
        `${JSON.stringify({
            timestamp: new Date().toISOString(),
            level,
            message,
            ...(context && { requestId: context.requestId }),
            ...normalizedFields
        })}\n`
    );
}

export function runWithRequestLogContext<T>(requestId: string, callback: () => T): T {
    return requestLogContext.run({ requestId }, callback);
}

export const logger = {
    debug: (message: string, fields?: LogFields) => write("debug", message, fields),
    info: (message: string, fields?: LogFields) => write("info", message, fields),
    warn: (message: string, fields?: LogFields) => write("warn", message, fields),
    error: (message: string, fields?: LogFields) => write("error", message, fields)
};
