import { Duplex } from "node:stream";
import { connect, type Socket } from "node:net";
import { Buffer } from "node:buffer";
import { Pool, type QueryResultRow } from "pg";

type GlobalWithPgPool = typeof globalThis & {
  __blogPgPool?: Pool;
  __blogPgConnectionString?: string;
};

const globalForPg = globalThis as GlobalWithPgPool;

function poolMax() {
  const configured = Number(process.env.PG_POOL_MAX);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.floor(configured);
  }

  return process.env.NODE_ENV === "production" ? 5 : 3;
}

class HttpConnectStream extends Duplex {
  private socket?: Socket;

  private connected = false;

  private responseBuffer = Buffer.alloc(0);

  constructor(private readonly proxyUrl: URL) {
    super();
  }

  connect(port: number, host: string) {
    const proxyPort = Number(this.proxyUrl.port || 80);
    this.socket = connect(proxyPort, this.proxyUrl.hostname);

    this.socket.once("connect", () => {
      const authority = `${host}:${port}`;
      const headers = [
        `CONNECT ${authority} HTTP/1.1`,
        `Host: ${authority}`,
        "Proxy-Connection: Keep-Alive"
      ];

      if (this.proxyUrl.username) {
        const credentials = `${decodeURIComponent(this.proxyUrl.username)}:${decodeURIComponent(this.proxyUrl.password)}`;
        headers.push(
          `Proxy-Authorization: Basic ${Buffer.from(credentials).toString("base64")}`
        );
      }

      this.socket?.write(`${headers.join("\r\n")}\r\n\r\n`);
    });

    this.socket.on("data", (chunk) => {
      if (this.connected) {
        this.push(chunk);
        return;
      }

      this.responseBuffer = Buffer.concat([this.responseBuffer, chunk]);
      const headerEnd = this.responseBuffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;

      const header = this.responseBuffer.slice(0, headerEnd).toString("utf8");
      const statusLine = header.split("\r\n")[0] ?? "";
      if (!/^HTTP\/\d(?:\.\d)? 2\d\d\b/.test(statusLine)) {
        this.destroy(new Error(`Database proxy CONNECT failed: ${statusLine}`));
        return;
      }

      this.connected = true;
      this.emit("connect");

      const rest = this.responseBuffer.slice(headerEnd + 4);
      if (rest.length > 0) {
        this.push(rest);
      }
      this.responseBuffer = Buffer.alloc(0);
    });

    this.socket.once("close", () => this.push(null));
    this.socket.once("error", (error) => this.destroy(error));
    return this;
  }

  setNoDelay(noDelay?: boolean) {
    this.socket?.setNoDelay(noDelay);
    return this;
  }

  setKeepAlive(enable?: boolean, initialDelay?: number) {
    this.socket?.setKeepAlive(enable, initialDelay);
    return this;
  }

  ref() {
    this.socket?.ref();
    return this;
  }

  unref() {
    this.socket?.unref();
    return this;
  }

  _read() {
    // Data is pushed from the wrapped socket's "data" handler.
  }

  _write(
    chunk: Buffer,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ) {
    if (!this.socket || !this.connected) {
      callback(new Error("Database proxy tunnel is not connected"));
      return;
    }

    this.socket.write(chunk, encoding, callback);
  }

  _destroy(error: Error | null, callback: (error?: Error | null) => void) {
    this.socket?.destroy();
    callback(error);
  }

  _final(callback: (error?: Error | null) => void) {
    this.socket?.end();
    callback();
  }
}

function databaseProxyUrl() {
  const value = process.env.DATABASE_PROXY_URL || process.env.PG_HTTP_PROXY;
  if (!value) return null;

  const proxyUrl = new URL(value);
  if (proxyUrl.protocol !== "http:") {
    throw new Error("DATABASE_PROXY_URL only supports http:// proxies");
  }

  return proxyUrl;
}

function createPool(connectionString: string) {
  const proxyUrl = databaseProxyUrl();
  const nextPool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    stream: proxyUrl ? () => new HttpConnectStream(proxyUrl) : undefined,
    max: poolMax(),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
    maxUses: 750
  });

  nextPool.on("error", (error) => {
    console.warn("Idle database connection error:", error.message);
  });

  return nextPool;
}

function resetPool() {
  const current = globalForPg.__blogPgPool;
  globalForPg.__blogPgPool = undefined;
  globalForPg.__blogPgConnectionString = undefined;
  void current?.end().catch(() => undefined);
}

function isReadQuery(text: string) {
  const query = text.trim().toLowerCase();
  return query.startsWith("select") || query.startsWith("with");
}

function isTransientConnectionError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("Connection terminated unexpectedly") ||
    error.message.includes("Connection ended unexpectedly") ||
    error.message.includes("Connection terminated") ||
    error.message.includes("ECONNRESET") ||
    error.message.includes("ETIMEDOUT") ||
    error.message.includes("timeout exceeded when trying to connect")
  );
}

export function getPool() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL or POSTGRES_URL is required");
  }

  if (
    !globalForPg.__blogPgPool ||
    globalForPg.__blogPgConnectionString !== connectionString
  ) {
    void globalForPg.__blogPgPool?.end().catch(() => undefined);
    globalForPg.__blogPgPool = createPool(connectionString);
    globalForPg.__blogPgConnectionString = connectionString;
  }

  return globalForPg.__blogPgPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = []
) {
  const canRetry = isReadQuery(text);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await getPool().query<T>(text, values);
      return result.rows;
    } catch (error) {
      if (!canRetry || attempt > 0 || !isTransientConnectionError(error)) {
        throw error;
      }

      resetPool();
    }
  }

  return [];
}

export async function one<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = []
) {
  const rows = await query<T>(text, values);
  return rows[0] ?? null;
}
