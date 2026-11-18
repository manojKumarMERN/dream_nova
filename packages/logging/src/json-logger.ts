import { redactSensitive } from './redact';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  organizationId?: string;
  [key: string]: unknown;
}

export interface StructuredLogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error: unknown, context?: LogContext): void;
}

export interface LoggerOptions {
  service: string;
  level?: LogLevel;
  sink?: (line: string) => void;
  now?: () => Date;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return { message: String(error) };
}

export function createJsonLogger(options: LoggerOptions): StructuredLogger {
  const minimumLevel = options.level ?? 'info';
  const sink = options.sink ?? ((line: string) => console.log(line));
  const now = options.now ?? (() => new Date());

  function write(level: LogLevel, message: string, context: LogContext, error?: unknown): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minimumLevel]) {
      return;
    }

    const entry = {
      timestamp: now().toISOString(),
      level,
      service: options.service,
      message,
      context: redactSensitive(context),
      ...(error === undefined ? {} : { error: redactSensitive(serializeError(error)) })
    };

    sink(JSON.stringify(entry));
  }

  return {
    debug(message, context = {}) {
      write('debug', message, context);
    },
    info(message, context = {}) {
      write('info', message, context);
    },
    warn(message, context = {}) {
      write('warn', message, context);
    },
    error(message, error, context = {}) {
      write('error', message, context, error);
    }
  };
}
