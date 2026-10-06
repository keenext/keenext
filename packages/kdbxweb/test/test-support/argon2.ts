import { argon2d, argon2id } from 'hash-wasm';
import { Argon2Type, Argon2TypeArgon2id, Argon2Version } from '../../lib/crypto/crypto-engine';

// Upstream used an emscripten build of the reference implementation; hash-wasm is the one the app uses.
export function argon2(
    password: ArrayBuffer,
    salt: ArrayBuffer,
    memory: number,
    iterations: number,
    length: number,
    parallelism: number,
    type: Argon2Type,
    version: Argon2Version
): Promise<ArrayBuffer> {
    if (version !== 0x13) {
        return Promise.reject(new Error(`argon2 version ${version} not supported`));
    }
    const fn = type === Argon2TypeArgon2id ? argon2id : argon2d;
    return fn({
        password: new Uint8Array(password),
        salt: new Uint8Array(salt),
        memorySize: memory,
        iterations,
        hashLength: length,
        parallelism,
        outputType: 'binary'
    }).then((hash) => hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength) as ArrayBuffer);
}
