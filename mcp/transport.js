/**
 * JSON-RPC STDIO Transport implementation
 */
export class StdioTransport {
  constructor(input = process.stdin, output = process.stdout, errorOutput = process.stderr) {
    this.input = input;
    this.output = output;
    this.errorOutput = errorOutput;
    this.buffer = Buffer.alloc(0);
    this.onMessage = null;
    this.messageEncoding = null;
  }

  start() {
    this.input.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.pump();
    });

    this.input.on("end", () => {
      process.exitCode = 0;
    });
  }

  send(message) {
    const json = JSON.stringify(message);
    if (this.messageEncoding === "json-line") {
      this.output.write(`${json}\n`);
      return;
    }
    this.output.write(`Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`);
  }

  pump() {
    while (true) {
      if (this.tryPumpContentLength()) continue;
      if (this.tryPumpJsonLines()) continue;
      return;
    }
  }

  tryPumpContentLength() {
    const headerEnd = this.buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) return false;

    const headerText = this.buffer.slice(0, headerEnd).toString("utf8");
    const match = headerText.match(/content-length:\s*(\d+)/i);
    if (!match) {
      this.buffer = this.buffer.slice(headerEnd + 4);
      return true;
    }

    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (this.buffer.length < bodyEnd) return false;

    const bodyText = this.buffer.slice(bodyStart, bodyEnd).toString("utf8");
    this.buffer = this.buffer.slice(bodyEnd);
    if (!bodyText.trim()) return true;

    this.messageEncoding ||= "content-length";
    this.dispatchParsed(bodyText);
    return true;
  }

  tryPumpJsonLines() {
    const text = this.buffer.toString("utf8");
    if (!text.trim()) {
      this.buffer = Buffer.alloc(0);
      return false;
    }

    if (/^content-length\s*:/i.test(text)) {
      return false;
    }

    const newlineIndex = text.search(/\r?\n/);
    if (newlineIndex === -1) return false;

    const lines = text.split(/\r?\n/);
    const hasTrailingNewline = /\r?\n$/.test(text);
    const completeLines = hasTrailingNewline ? lines : lines.slice(0, -1);
    const remainder = hasTrailingNewline ? "" : lines.at(-1) || "";

    let consumedAny = false;
    for (const line of completeLines) {
      const trimmed = line.trim();
      if (!trimmed) {
        consumedAny = true;
        continue;
      }
      this.messageEncoding ||= "json-line";
      this.dispatchParsed(trimmed);
      consumedAny = true;
    }

    if (!consumedAny) return false;

    this.buffer = Buffer.from(remainder, "utf8");
    return true;
  }

  dispatchParsed(text) {
    let message;
    try {
      message = JSON.parse(text);
    } catch (error) {
      this.errorOutput.write(`${String(error)}\n`);
      return;
    }

    if (this.onMessage) {
      this.onMessage(message);
    }
  }
}
