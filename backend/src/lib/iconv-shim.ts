// Worker-compatible lightweight iconv-lite shim using standard TextDecoder/Buffer
export function decode(buf: Buffer | ArrayBuffer | Uint8Array, encoding?: string): string {
  if (typeof buf === 'string') return buf;
  const enc = (encoding || 'utf-8').toLowerCase().replace(/[^a-z0-9-]/g, '');
  try {
    return new TextDecoder(enc).decode(buf);
  } catch (_e) {
    return Buffer.from(buf as any).toString((encoding as BufferEncoding) || 'utf-8');
  }
}

export function encode(str: string, encoding?: string): Buffer {
  return Buffer.from(str, (encoding as BufferEncoding) || 'utf-8');
}

export function encodingExists(_encoding: string): boolean {
  return true;
}

export function getDecoder(encoding?: string): { write(buf: any): string; end(): string } {
  return {
    write(buf: any) {
      return decode(buf, encoding);
    },
    end() {
      return '';
    },
  };
}

export function getEncoder(encoding?: string): { write(str: string): Buffer; end(): Buffer } {
  return {
    write(str: string) {
      return encode(str, encoding);
    },
    end() {
      return Buffer.alloc(0);
    },
  };
}

export default {
  decode,
  encode,
  encodingExists,
  getDecoder,
  getEncoder,
};
