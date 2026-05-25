import net from "node:net";
import tls from "node:tls";

type MailOptions = {
  to: string;
  subject: string;
  text: string;
};

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

function requireSmtpConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE !== "false";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM || user;

  if (!host || !Number.isFinite(port) || !user || !pass || !from) {
    throw new Error("SMTP email service is not configured");
  }

  return { host, port, secure, user, pass, from };
}

function extractEmailAddress(value: string) {
  const matched = value.match(/<([^>]+)>/);
  return (matched?.[1] || value).trim();
}

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function escapeData(value: string) {
  return value.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

function readResponse(socket: net.Socket) {
  return new Promise<string>((resolve, reject) => {
    let buffer = "";

    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines.at(-1);
      if (last && /^\d{3} /.test(last)) {
        cleanup();
        resolve(buffer);
      }
    };

    socket.on("data", onData);
    socket.on("error", onError);
  });
}

async function command(socket: net.Socket, value: string, expectedCodes: string[]) {
  const responsePromise = readResponse(socket);
  socket.write(`${value}\r\n`);
  const response = await responsePromise;
  if (!expectedCodes.some((code) => response.startsWith(code))) {
    throw new Error("SMTP command failed");
  }
}

function createSocket(config: SmtpConfig) {
  if (!config.secure) {
    return net.connect({ host: config.host, port: config.port });
  }

  return tls.connect({
    host: config.host,
    port: config.port,
    servername: config.host
  });
}

export async function sendMail(options: MailOptions) {
  const config = requireSmtpConfig();
  const socket = createSocket(config);
  socket.setTimeout(15_000, () => {
    socket.destroy(new Error("SMTP connection timed out"));
  });

  try {
    const greeting = await readResponse(socket);
    if (!greeting.startsWith("220")) throw new Error("SMTP server did not accept the connection");

    await command(socket, "EHLO localhost", ["250"]);
    await command(socket, "AUTH LOGIN", ["334"]);
    await command(socket, Buffer.from(config.user).toString("base64"), ["334"]);
    await command(socket, Buffer.from(config.pass).toString("base64"), ["235"]);
    await command(socket, `MAIL FROM:<${extractEmailAddress(config.from)}>`, ["250"]);
    await command(socket, `RCPT TO:<${extractEmailAddress(options.to)}>`, ["250", "251"]);
    await command(socket, "DATA", ["354"]);

    const message = [
      `From: ${config.from}`,
      `To: ${options.to}`,
      `Subject: ${encodeHeader(options.subject)}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      escapeData(options.text),
      "."
    ].join("\r\n");

    await command(socket, message, ["250"]);
    await command(socket, "QUIT", ["221"]);
  } finally {
    socket.end();
  }
}
