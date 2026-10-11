import { describe, expect, it } from 'vitest';
import {
  base64Decode,
  base64Encode,
  base64UrlEncode,
  decodeJwt,
  hashes,
  htmlDecode,
  htmlEncode,
  isReadable,
  jwtTimes,
  urlDecode,
  urlEncode,
} from './transforms.js';

describe('base64', () => {
  it('round-trips text, including non-ASCII', () => {
    expect(base64Encode('héllo 👋')).toBe('aMOpbGxvIPCfkYs=');
    expect(base64Decode('aMOpbGxvIPCfkYs=')).toBe('héllo 👋');
  });

  it('reads URL-safe Base64 and missing padding', () => {
    expect(base64UrlEncode('a?b>c')).toBe('YT9iPmM');
    expect(base64Decode('YT9iPmM')).toBe('a?b>c');
  });

  it('ignores line breaks inside the Base64', () => {
    expect(base64Decode('aGVsbG8g\nd29ybGQ=')).toBe('hello world');
  });

  it("doesn't treat ordinary words or binary as Base64 text", () => {
    expect(base64Decode('test')).toBeUndefined();
    expect(base64Decode('hello')).toBeUndefined();
    expect(base64Decode('hi there')).toBeUndefined();
    expect(base64Decode(Buffer.from([0, 1, 2, 255]).toString('base64'))).toBeUndefined();
    expect(base64Decode('ab+c-d==')).toBeUndefined();
  });
});

describe('url', () => {
  it('encodes and decodes', () => {
    expect(urlEncode('a b&c=d/é')).toBe('a%20b%26c%3Dd%2F%C3%A9');
    expect(urlDecode('a%20b%26c%3Dd%2F%C3%A9')).toBe('a b&c=d/é');
  });

  it('reads + as a space in query strings', () => {
    expect(urlDecode('q=open+palette')).toBe('q=open palette');
  });

  it('leaves text that isn’t encoded alone', () => {
    expect(urlDecode('plain text')).toBeUndefined();
    expect(urlDecode('1 + 1')).toBeUndefined();
    expect(urlDecode('%E0%A4%A')).toBeUndefined();
  });
});

describe('html', () => {
  it('encodes the characters HTML cares about', () => {
    expect(htmlEncode(`<a href="x">Tom & Jerry's</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;',
    );
  });

  it('decodes named and numeric entities', () => {
    expect(htmlDecode('&lt;p&gt; &amp; &#39; &#x1F600; &copy;')).toBe("<p> & ' 😀 ©");
    expect(htmlDecode('no entities here')).toBeUndefined();
    expect(htmlDecode('&unknown;')).toBeUndefined();
  });
});

describe('decodeJwt', () => {
  const token = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: 'alex', iat: 1760000000, exp: 1760003600 })).toString('base64url'),
    'c2lnbmF0dXJl',
  ].join('.');

  it('reads the header and claims', () => {
    expect(decodeJwt(token)).toEqual({
      header: { alg: 'HS256', typ: 'JWT' },
      payload: { sub: 'alex', iat: 1760000000, exp: 1760003600 },
    });
  });

  it('accepts a Bearer prefix', () => {
    expect(decodeJwt(`Bearer ${token}`)?.payload.sub).toBe('alex');
  });

  it('rejects anything else with dots in it', () => {
    expect(decodeJwt('example.com.au')).toBeUndefined();
    expect(decodeJwt('a.b')).toBeUndefined();
  });

  it('turns the time claims into dates', () => {
    const payload = decodeJwt(token)?.payload ?? {};
    expect(jwtTimes(payload).map((time) => [time.label, time.date.toISOString()])).toEqual([
      ['Issued', '2025-10-09T08:53:20.000Z'],
      ['Expires', '2025-10-09T09:53:20.000Z'],
    ]);
  });
});

describe('hashes', () => {
  it('hashes the UTF-8 bytes', () => {
    const byName = Object.fromEntries(hashes('abc').map((hash) => [hash.name, hash.value]));
    expect(byName['SHA-256']).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(byName.MD5).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(byName['SHA-1']).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
  });
});

describe('isReadable', () => {
  it('allows line breaks and tabs but not other control characters', () => {
    expect(isReadable('a\tb\nc')).toBe(true);
    expect(isReadable('a\u0000b')).toBe(false);
    expect(isReadable('')).toBe(false);
  });
});
