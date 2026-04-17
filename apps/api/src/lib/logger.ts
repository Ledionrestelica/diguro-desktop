type Level = 'debug' | 'info' | 'warn' | 'error';
const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): Logger;
}

export function createLogger(minLevel: Level, baseContext: Record<string, unknown> = {}): Logger {
  const min = LEVELS[minLevel];
  const log = (level: Level, msg: string, meta?: Record<string, unknown>) => {
    if (LEVELS[level] < min) return;
    const entry = {
      level,
      time: new Date().toISOString(),
      msg,
      ...baseContext,
      ...(meta ?? {}),
    };
    const line = JSON.stringify(entry);
    if (level === 'error' || level === 'warn') {
      console.error(line);
    } else {
      console.log(line);
    }
  };
  return {
    debug: (m, meta) => log('debug', m, meta),
    info: (m, meta) => log('info', m, meta),
    warn: (m, meta) => log('warn', m, meta),
    error: (m, meta) => log('error', m, meta),
    child: (ctx) => createLogger(minLevel, { ...baseContext, ...ctx }),
  };
}
