import { KdbxError } from '../errors/kdbx-error';
import { ErrorCodes } from '../defs/consts';

/*
 * Twofish (Schneier, Kelsey, Whiting, Wagner, Hall, Ferguson, 1998), 128-bit
 * blocks, 128/192/256-bit keys. Names follow the specification: q0/q1 fixed
 * permutations, MDS and RS matrices, h function, 40 round subkeys K.
 * The key-dependent S-boxes are merged with the MDS columns into four 256-entry
 * tables, so g() is four lookups.
 */

// 4-bit tables t0..t3 defining q0 and q1 (specification, section 4.3.5).
const Q0_T = [
    [0x8, 0x1, 0x7, 0xd, 0x6, 0xf, 0x3, 0x2, 0x0, 0xb, 0x5, 0x9, 0xe, 0xc, 0xa, 0x4],
    [0xe, 0xc, 0xb, 0x8, 0x1, 0x2, 0x3, 0x5, 0xf, 0x4, 0xa, 0x6, 0x7, 0x0, 0x9, 0xd],
    [0xb, 0xa, 0x5, 0xe, 0x6, 0xd, 0x9, 0x0, 0xc, 0x8, 0xf, 0x3, 0x2, 0x4, 0x7, 0x1],
    [0xd, 0x7, 0xf, 0x4, 0x1, 0x2, 0x6, 0xe, 0x9, 0xb, 0x3, 0x0, 0x8, 0x5, 0xc, 0xa]
];
const Q1_T = [
    [0x2, 0x8, 0xb, 0xd, 0xf, 0x7, 0x6, 0xe, 0x3, 0x1, 0x9, 0x4, 0x0, 0xa, 0xc, 0x5],
    [0x1, 0xe, 0x2, 0xb, 0x4, 0xc, 0x3, 0x7, 0x6, 0xd, 0xa, 0x5, 0xf, 0x9, 0x0, 0x8],
    [0x4, 0xc, 0x7, 0x5, 0x1, 0x6, 0x9, 0xa, 0x0, 0xe, 0xd, 0x8, 0x2, 0xb, 0x3, 0xf],
    [0xb, 0x9, 0x5, 0x1, 0xc, 0x3, 0xd, 0xe, 0x6, 0x4, 0x7, 0xf, 0x2, 0x0, 0x8, 0xa]
];

const MDS = [
    [0x01, 0xef, 0x5b, 0x5b],
    [0x5b, 0xef, 0xef, 0x01],
    [0xef, 0x5b, 0x01, 0xef],
    [0xef, 0x01, 0xef, 0x5b]
];
const RS = [
    [0x01, 0xa4, 0x55, 0x87, 0x5a, 0x58, 0xdb, 0x9e],
    [0xa4, 0x56, 0x82, 0xf3, 0x1e, 0xc6, 0x68, 0xe5],
    [0x02, 0xa1, 0xfc, 0xc1, 0x47, 0xae, 0x3d, 0x19],
    [0xa4, 0x55, 0x87, 0x5a, 0x58, 0xdb, 0x9e, 0x03]
];
// GF(2^8) reduction polynomials: x^8+x^6+x^5+x^3+1 for MDS, x^8+x^6+x^3+x^2+1 for RS.
const MDS_POLY = 0x169;
const RS_POLY = 0x14d;
const RHO = 0x01010101;
const ROUNDS = 16;

function ror4(x: number, n: number): number {
    return ((x >>> n) | (x << (4 - n))) & 0xf;
}

function buildQ(t: number[][]): Uint8Array {
    const q = new Uint8Array(256);
    for (let x = 0; x < 256; x++) {
        const a0 = x >>> 4;
        const b0 = x & 0xf;
        const a1 = a0 ^ b0;
        const b1 = a0 ^ ror4(b0, 1) ^ ((8 * a0) & 0xf);
        const a2 = t[0][a1];
        const b2 = t[1][b1];
        const a3 = a2 ^ b2;
        const b3 = a2 ^ ror4(b2, 1) ^ ((8 * a2) & 0xf);
        q[x] = (t[3][b3] << 4) | t[2][a3];
    }
    return q;
}

export const Q0 = buildQ(Q0_T);
export const Q1 = buildQ(Q1_T);

function gfMul(a: number, b: number, poly: number): number {
    let result = 0;
    while (b) {
        if (b & 1) {
            result ^= a;
        }
        a <<= 1;
        if (a & 0x100) {
            a ^= poly;
        }
        b >>>= 1;
    }
    return result;
}

// MDS_COLUMNS[j][v]: contribution of input byte v at position j to the MDS product (little-endian word).
const MDS_COLUMNS = [0, 1, 2, 3].map((j) => {
    const table = new Uint32Array(256);
    for (let v = 0; v < 256; v++) {
        table[v] =
            (gfMul(MDS[0][j], v, MDS_POLY) |
                (gfMul(MDS[1][j], v, MDS_POLY) << 8) |
                (gfMul(MDS[2][j], v, MDS_POLY) << 16) |
                (gfMul(MDS[3][j], v, MDS_POLY) << 24)) >>>
            0;
    }
    return table;
});

function byteOf(word: number, index: number): number {
    return (word >>> (8 * index)) & 0xff;
}

/** The q-permutation and key-byte chain of h() for byte position j, before the MDS step. */
function hChain(j: number, x: number, l: number[]): number {
    const k = l.length;
    let y = x;
    if (k === 4) {
        y = (j === 0 || j === 3 ? Q1[y] : Q0[y]) ^ byteOf(l[3], j);
    }
    if (k >= 3) {
        y = (j <= 1 ? Q1[y] : Q0[y]) ^ byteOf(l[2], j);
    }
    switch (j) {
        case 0:
            return Q1[Q0[Q0[y] ^ byteOf(l[1], 0)] ^ byteOf(l[0], 0)];
        case 1:
            return Q0[Q0[Q1[y] ^ byteOf(l[1], 1)] ^ byteOf(l[0], 1)];
        case 2:
            return Q1[Q1[Q0[y] ^ byteOf(l[1], 2)] ^ byteOf(l[0], 2)];
        default:
            return Q0[Q1[Q1[y] ^ byteOf(l[1], 3)] ^ byteOf(l[0], 3)];
    }
}

function h(x: number, l: number[]): number {
    let result = 0;
    for (let j = 0; j < 4; j++) {
        result ^= MDS_COLUMNS[j][hChain(j, byteOf(x, j), l)];
    }
    return result >>> 0;
}

function rol(x: number, n: number): number {
    return ((x << n) | (x >>> (32 - n))) >>> 0;
}

function ror(x: number, n: number): number {
    return ((x >>> n) | (x << (32 - n))) >>> 0;
}

function readWord(bytes: Uint8Array, offset: number): number {
    return (
        (bytes[offset] |
            (bytes[offset + 1] << 8) |
            (bytes[offset + 2] << 16) |
            (bytes[offset + 3] << 24)) >>>
        0
    );
}

function writeWord(bytes: Uint8Array, offset: number, word: number): void {
    bytes[offset] = word & 0xff;
    bytes[offset + 1] = (word >>> 8) & 0xff;
    bytes[offset + 2] = (word >>> 16) & 0xff;
    bytes[offset + 3] = (word >>> 24) & 0xff;
}

export class Twofish {
    static readonly BlockSize = 16;

    private readonly subkeys = new Uint32Array(40);
    private readonly sboxes = [0, 1, 2, 3].map(() => new Uint32Array(256));

    constructor(key: Uint8Array) {
        if (key.length !== 16 && key.length !== 24 && key.length !== 32) {
            throw new KdbxError(ErrorCodes.InvalidArg, 'twofish key must be 16, 24 or 32 bytes');
        }
        const k = key.length / 8;
        const me: number[] = [];
        const mo: number[] = [];
        const s: number[] = [];
        for (let i = 0; i < k; i++) {
            me.push(readWord(key, 8 * i));
            mo.push(readWord(key, 8 * i + 4));
            let word = 0;
            for (let row = 0; row < 4; row++) {
                let value = 0;
                for (let col = 0; col < 8; col++) {
                    value ^= gfMul(RS[row][col], key[8 * i + col], RS_POLY);
                }
                word |= value << (8 * row);
            }
            // S = (S_{k-1}, ..., S_0)
            s.unshift(word >>> 0);
        }

        for (let i = 0; i < 20; i++) {
            const a = h(2 * i * RHO, me);
            const b = rol(h((2 * i + 1) * RHO, mo), 8);
            this.subkeys[2 * i] = (a + b) >>> 0;
            this.subkeys[2 * i + 1] = rol((a + 2 * b) >>> 0, 9);
        }

        for (let j = 0; j < 4; j++) {
            for (let x = 0; x < 256; x++) {
                this.sboxes[j][x] = MDS_COLUMNS[j][hChain(j, x, s)];
            }
        }
        me.fill(0);
        mo.fill(0);
        s.fill(0);
    }

    private g(x: number): number {
        const [s0, s1, s2, s3] = this.sboxes;
        return (s0[x & 0xff] ^ s1[(x >>> 8) & 0xff] ^ s2[(x >>> 16) & 0xff] ^ s3[x >>> 24]) >>> 0;
    }

    /** Encrypts the 16-byte block at `offset` in place. */
    encryptBlock(block: Uint8Array, offset = 0): void {
        const k = this.subkeys;
        let r0 = readWord(block, offset) ^ k[0];
        let r1 = readWord(block, offset + 4) ^ k[1];
        let r2 = readWord(block, offset + 8) ^ k[2];
        let r3 = readWord(block, offset + 12) ^ k[3];
        for (let r = 0; r < ROUNDS; r++) {
            const t0 = this.g(r0 >>> 0);
            const t1 = this.g(rol(r1 >>> 0, 8));
            const f0 = (t0 + t1 + k[2 * r + 8]) >>> 0;
            const f1 = (t0 + 2 * t1 + k[2 * r + 9]) >>> 0;
            const next0 = ror((r2 ^ f0) >>> 0, 1);
            const next1 = (rol(r3 >>> 0, 1) ^ f1) >>> 0;
            r2 = r0;
            r3 = r1;
            r0 = next0;
            r1 = next1;
        }
        // The last round's swap is undone by the output order.
        writeWord(block, offset, (r2 ^ k[4]) >>> 0);
        writeWord(block, offset + 4, (r3 ^ k[5]) >>> 0);
        writeWord(block, offset + 8, (r0 ^ k[6]) >>> 0);
        writeWord(block, offset + 12, (r1 ^ k[7]) >>> 0);
    }

    /** Decrypts the 16-byte block at `offset` in place. */
    decryptBlock(block: Uint8Array, offset = 0): void {
        const k = this.subkeys;
        let r2 = readWord(block, offset) ^ k[4];
        let r3 = readWord(block, offset + 4) ^ k[5];
        let r0 = readWord(block, offset + 8) ^ k[6];
        let r1 = readWord(block, offset + 12) ^ k[7];
        for (let r = ROUNDS - 1; r >= 0; r--) {
            const t0 = this.g(r2 >>> 0);
            const t1 = this.g(rol(r3 >>> 0, 8));
            const f0 = (t0 + t1 + k[2 * r + 8]) >>> 0;
            const f1 = (t0 + 2 * t1 + k[2 * r + 9]) >>> 0;
            const previous2 = (rol(r0 >>> 0, 1) ^ f0) >>> 0;
            const previous3 = ror((r1 ^ f1) >>> 0, 1);
            r0 = r2;
            r1 = r3;
            r2 = previous2;
            r3 = previous3;
        }
        writeWord(block, offset, (r0 ^ k[0]) >>> 0);
        writeWord(block, offset + 4, (r1 ^ k[1]) >>> 0);
        writeWord(block, offset + 8, (r2 ^ k[2]) >>> 0);
        writeWord(block, offset + 12, (r3 ^ k[3]) >>> 0);
    }

    /** CBC with PKCS#7 padding; always adds 1–16 padding bytes. */
    encryptCbc(data: Uint8Array, iv: Uint8Array): Uint8Array {
        if (iv.length !== Twofish.BlockSize) {
            throw new KdbxError(ErrorCodes.InvalidArg, 'twofish iv must be 16 bytes');
        }
        const padding = Twofish.BlockSize - (data.length % Twofish.BlockSize);
        const out = new Uint8Array(data.length + padding);
        out.set(data);
        out.fill(padding, data.length);
        let previous = iv;
        for (let offset = 0; offset < out.length; offset += Twofish.BlockSize) {
            for (let i = 0; i < Twofish.BlockSize; i++) {
                out[offset + i] ^= previous[i];
            }
            this.encryptBlock(out, offset);
            previous = out.subarray(offset, offset + Twofish.BlockSize);
        }
        return out;
    }

    /**
     * Inverse of encryptCbc. A wrong key almost always yields invalid padding,
     * reported as InvalidKey like the AES path does.
     */
    decryptCbc(data: Uint8Array, iv: Uint8Array): Uint8Array {
        if (iv.length !== Twofish.BlockSize) {
            throw new KdbxError(ErrorCodes.InvalidArg, 'twofish iv must be 16 bytes');
        }
        if (data.length === 0 || data.length % Twofish.BlockSize !== 0) {
            throw new KdbxError(ErrorCodes.FileCorrupt, 'twofish data is not a multiple of the block size');
        }
        const out = new Uint8Array(data);
        let previous = new Uint8Array(iv);
        const current = new Uint8Array(Twofish.BlockSize);
        for (let offset = 0; offset < out.length; offset += Twofish.BlockSize) {
            current.set(out.subarray(offset, offset + Twofish.BlockSize));
            this.decryptBlock(out, offset);
            for (let i = 0; i < Twofish.BlockSize; i++) {
                out[offset + i] ^= previous[i];
            }
            previous = new Uint8Array(current);
        }
        const padding = out[out.length - 1];
        let valid = padding >= 1 && padding <= Twofish.BlockSize;
        for (let i = out.length - padding; valid && i < out.length; i++) {
            valid = out[i] === padding;
        }
        if (!valid) {
            out.fill(0);
            throw new KdbxError(ErrorCodes.InvalidKey, 'invalid key');
        }
        return out.slice(0, out.length - padding);
    }

    /** Overwrites the expanded key material. */
    clear(): void {
        this.subkeys.fill(0);
        for (const sbox of this.sboxes) {
            sbox.fill(0);
        }
    }
}
