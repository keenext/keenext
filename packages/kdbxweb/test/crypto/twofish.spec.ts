import { describe, expect, it } from 'vitest';
import { ByteUtils, Consts, CryptoEngine, KdbxError } from '../../lib';
import { Q0, Q1, Twofish } from '../../lib/crypto/twofish';

const hex = (bytes: Uint8Array) => ByteUtils.bytesToHex(bytes).toUpperCase();
const bytes = (value: string) => new Uint8Array(ByteUtils.hexToBytes(value));

function encryptBlock(key: string, plaintext: string): string {
    const block = bytes(plaintext);
    new Twofish(bytes(key)).encryptBlock(block);
    return hex(block);
}

describe('Twofish', () => {
    it('builds the q permutations of the specification', () => {
        expect(hex(Q0.subarray(0, 8))).toBe('A967B3E804FDA376');
        expect(hex(Q1.subarray(0, 8))).toBe('75F3C6F4DB7BFBC8');
        expect(new Set(Q0).size).toBe(256);
        expect(new Set(Q1).size).toBe(256);
    });

    // Known-answer tests from the Twofish submission (ecb_tbl.txt, I=1 for each key size).
    it.each([
        ['00000000000000000000000000000000', '9F589F5CF6122C32B6BFEC2F2AE8C35A'],
        ['000000000000000000000000000000000000000000000000', 'EFA71F788965BD4453F860178FC19101'],
        ['0000000000000000000000000000000000000000000000000000000000000000', '57FF739D4DC92C1BD7FC01700CC8216F']
    ])('encrypts the zero block with key %s', (key, expected) => {
        expect(encryptBlock(key, '00000000000000000000000000000000')).toBe(expected);
    });

    // Iterated known-answer chain for 128-bit keys (ecb_tbl.txt I=2, I=3).
    it('follows the iterated 128-bit chain', () => {
        expect(encryptBlock('00000000000000000000000000000000', '9F589F5CF6122C32B6BFEC2F2AE8C35A')).toBe(
            'D491DB16E7B1C39E86CB086B789F5419'
        );
        expect(encryptBlock('9F589F5CF6122C32B6BFEC2F2AE8C35A', 'D491DB16E7B1C39E86CB086B789F5419')).toBe(
            '019F9809DE1711858FAAC3A3BA20FBC3'
        );
    });

    it('decrypts what it encrypts', () => {
        const key = CryptoEngine.random(32);
        const block = CryptoEngine.random(16);
        const copy = block.slice();
        const cipher = new Twofish(key);
        cipher.encryptBlock(block);
        expect(hex(block)).not.toBe(hex(copy));
        cipher.decryptBlock(block);
        expect(hex(block)).toBe(hex(copy));
    });

    describe('CBC with PKCS#7', () => {
        const key = bytes('0123456789ABCDEFFEDCBA987654321000112233445566778899AABBCCDDEEFF');
        const iv = bytes('000102030405060708090A0B0C0D0E0F');

        it.each([0, 1, 15, 16, 17, 1000])('round-trips %i bytes', (length) => {
            const data = CryptoEngine.random(length);
            const encrypted = new Twofish(key).encryptCbc(data, iv);
            expect(encrypted.length).toBe((Math.floor(length / 16) + 1) * 16);
            expect(hex(new Twofish(key).decryptCbc(encrypted, iv))).toBe(hex(data));
        });

        it('chains blocks', () => {
            const encrypted = new Twofish(key).encryptCbc(new Uint8Array(32), iv);
            expect(hex(encrypted.subarray(0, 16))).not.toBe(hex(encrypted.subarray(16, 32)));
        });

        it('reports a wrong key as InvalidKey', () => {
            const encrypted = new Twofish(key).encryptCbc(new TextEncoder().encode('secret data'), iv);
            const wrongKey = key.slice();
            wrongKey[0] ^= 1;
            expect(() => new Twofish(wrongKey).decryptCbc(encrypted, iv)).toThrow(
                expect.objectContaining({ code: Consts.ErrorCodes.InvalidKey })
            );
        });

        it('rejects data that is not whole blocks', () => {
            expect(() => new Twofish(key).decryptCbc(new Uint8Array(17), iv)).toThrow(KdbxError);
            expect(() => new Twofish(key).decryptCbc(new Uint8Array(0), iv)).toThrow(KdbxError);
        });

        it('is exposed through CryptoEngine', async () => {
            const data = new TextEncoder().encode('via crypto engine');
            const encrypted = await CryptoEngine.twofishCbc(
                ByteUtils.arrayToBuffer(data),
                ByteUtils.arrayToBuffer(key),
                ByteUtils.arrayToBuffer(iv),
                true
            );
            const decrypted = await CryptoEngine.twofishCbc(
                encrypted,
                ByteUtils.arrayToBuffer(key),
                ByteUtils.arrayToBuffer(iv),
                false
            );
            expect(new TextDecoder().decode(decrypted)).toBe('via crypto engine');
        });
    });

    it('rejects unsupported key sizes', () => {
        expect(() => new Twofish(new Uint8Array(20))).toThrow(KdbxError);
    });
});
