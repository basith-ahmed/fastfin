import pino, { type DestinationStream, type Logger } from "pino";

import { env } from "../config/env";

const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

const levelConfig: Record<number, { label: string; color: string }> = {
  10: { label: "TRACE", color: colors.dim },
  20: { label: "DEBUG", color: colors.cyan },
  30: { label: "INFO ", color: colors.green },
  40: { label: "WARN ", color: colors.yellow },
  50: { label: "ERROR", color: colors.red },
  60: { label: "FATAL", color: colors.magenta },
};

function formatConsoleChunk(chunk: string): string {
  try {
    const data = JSON.parse(chunk) as Record<string, unknown>;
    const timeNum = typeof data.time === "number" ? data.time : Date.now();
    const timeStr = new Date(timeNum).toLocaleTimeString();
    const lvlNum = typeof data.level === "number" ? data.level : 30;
    const lvl = levelConfig[lvlNum] ?? { label: "INFO ", color: colors.green };
    const levelFormatted = `${lvl.color}${lvl.label}${colors.reset}`;

    const component = typeof data.component === "string" ? data.component : null;
    const compFormatted = component ? `${colors.bold}[${component}]${colors.reset} ` : "";

    // Handle pino-http request logs
    if (data.req && typeof data.req === "object" && data.res && typeof data.res === "object") {
      const req = data.req as Record<string, unknown>;
      const res = data.res as Record<string, unknown>;
      const method = typeof req.method === "string" ? req.method : "REQ";
      const url = typeof req.url === "string" ? req.url : "/";
      const status = typeof res.statusCode === "number" ? res.statusCode : 200;
      const statusColor =
        status >= 500 ? colors.red : status >= 400 ? colors.yellow : colors.green;
      const responseTime = typeof data.responseTime === "number" ? Math.round(data.responseTime) : null;
      const timeTag = responseTime !== null ? ` (${responseTime}ms)` : "";

      return `${colors.dim}[${timeStr}]${colors.reset} ${levelFormatted} ${compFormatted}HTTP ${colors.bold}${method}${colors.reset} ${url} -> ${statusColor}${status}${colors.reset}${colors.dim}${timeTag}${colors.reset}\n`;
    }

    const msg = typeof data.msg === "string" ? data.msg : "";
    const err = data.err as Record<string, unknown> | undefined;

    // Filter out internal pino fields for concise metadata display
    const {
      time: _t,
      level: _l,
      pid: _p,
      hostname: _h,
      msg: _m,
      component: _c,
      err: _e,
      req: _req,
      res: _res,
      responseTime: _rt,
      ...rest
    } = data;

    let line = `${colors.dim}[${timeStr}]${colors.reset} ${levelFormatted} ${compFormatted}${msg}`;

    if (Object.keys(rest).length > 0) {
      line += ` ${colors.dim}${JSON.stringify(rest)}${colors.reset}`;
    }

    if (err && typeof err === "object") {
      const errMsg =
        typeof err.message === "string"
          ? err.message
          : typeof err === "string"
            ? err
            : "Unknown error";
      line += `\n  ${colors.red}${colors.bold}Error:${colors.reset} ${colors.red}${errMsg}${colors.reset}`;
      if (typeof err.stack === "string") {
        const stackLines = err.stack
          .split("\n")
          .slice(1)
          .map((s) => `  ${colors.dim}${s}${colors.reset}`)
          .join("\n");
        if (stackLines) {
          line += `\n${stackLines}`;
        }
      }
    }

    return `${line}\n`;
  } catch {
    return `${chunk}\n`;
  }
}

function createDestinationStream(): DestinationStream | undefined {
  if (env.NODE_ENV === "production") {
    return undefined;
  }

  return {
    write(chunk: string) {
      process.stdout.write(formatConsoleChunk(chunk));
    },
  };
}

const pinoOptions: pino.LoggerOptions = {
  enabled: env.NODE_ENV !== "test",
  level: env.NODE_ENV === "production" ? "info" : "debug",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "OPENAI_API_KEY",
      "GEMINI_API_KEY",
    ],
    censor: "[REDACTED]",
  },
};

const destination = createDestinationStream();

export const logger: Logger = destination ? pino(pinoOptions, destination) : pino(pinoOptions);

export const serverLogger: Logger = logger.child({ component: "Server" });
export const workerLogger: Logger = logger.child({ component: "Worker" });

