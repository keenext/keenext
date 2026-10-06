import { KdbxError } from '../errors/kdbx-error';
import { ErrorCodes } from '../defs/consts';
import { arrayToBuffer, hexToBytes } from '../utils/byte-utils';
import { ChaCha20 } from './chacha20';
import { Twofish } from './twofish';

const EmptySha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const EmptySha512 =
    'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce' +
    '47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e';

// maxRandomQuota is the max number of random bytes you can asks for from the cryptoEngine
// https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues
const MaxRandomQuota = 65536;

// WebCrypto only: available in all browsers and globally in Node >= 19.
function webCrypto(): Crypto {
    if (!globalThis.crypto?.subtle) {
        throw new KdbxError(ErrorCodes.NotImplemented, 'WebCrypto is not available');
    }
    return globalThis.crypto;
}

export function sha256(data: ArrayBuffer): Promise<ArrayBuffer> {
    if (!data.byteLength) {
        return Promise.resolve(arrayToBuffer(hexToBytes(EmptySha256)));
    }
    return webCrypto().subtle.digest({ name: 'SHA-256' }, data);
}

export function sha512(data: ArrayBuffer): Promise<ArrayBuffer> {
    if (!data.byteLength) {
        return Promise.resolve(arrayToBuffer(hexToBytes(EmptySha512)));
    }
    return webCrypto().subtle.digest({ name: 'SHA-512' }, data);
}

export function hmacSha256(key: ArrayBuffer, data: ArrayBuffer): Promise<ArrayBuffer> {
    const algo = { name: 'HMAC', hash: { name: 'SHA-256' } };
    const { subtle } = webCrypto();
    return subtle.importKey('raw', key, algo, false, ['sign']).then((subtleKey) => {
        return subtle.sign(algo, subtleKey, data);
    });
}

export abstract class AesCbc {
    abstract importKey(key: ArrayBuffer): Promise<void>;
    abstract encrypt(data: ArrayBuffer, iv: ArrayBuffer): Promise<ArrayBuffer>;
    abstract decrypt(data: ArrayBuffer, iv: ArrayBuffer): Promise<ArrayBuffer>;
}

class AesCbcSubtle extends AesCbc {
    private _key: CryptoKey | undefined;

    private get key(): CryptoKey {
        if (!this._key) {
            throw new KdbxError(ErrorCodes.InvalidState, 'no key');
        }
        return this._key;
    }

    importKey(key: ArrayBuffer): Promise<void> {
        return webCrypto()
            .subtle.importKey('raw', key, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt'])
            .then((key) => {
                this._key = key;
            });
    }

    encrypt(data: ArrayBuffer, iv: ArrayBuffer): Promise<ArrayBuffer> {
        return Promise.resolve().then(() =>
            webCrypto().subtle.encrypt({ name: 'AES-CBC', iv }, this.key, data)
        );
    }

    decrypt(data: ArrayBuffer, iv: ArrayBuffer): Promise<ArrayBuffer> {
        return Promise.resolve()
            .then(() => webCrypto().subtle.decrypt({ name: 'AES-CBC', iv }, this.key, data))
            .catch((e: unknown) => {
                if (e instanceof KdbxError) {
                    throw e;
                }
                throw new KdbxError(ErrorCodes.InvalidKey, 'invalid key');
            });
    }
}

export function createAesCbc(): AesCbc {
    return new AesCbcSubtle();
}

export function random(len: number): Uint8Array {
    const crypto = webCrypto();
    const randomBytes = new Uint8Array(len);
    while (len > 0) {
        let segmentSize = len % MaxRandomQuota;
        segmentSize = segmentSize > 0 ? segmentSize : MaxRandomQuota;
        const randomBytesSegment = new Uint8Array(segmentSize);
        crypto.getRandomValues(randomBytesSegment);
        len -= segmentSize;
        randomBytes.set(randomBytesSegment, len);
    }
    return randomBytes;
}

/**
 * Twofish-256 in CBC mode with PKCS#7 padding, as used for KDBX payloads by
 * KeePass (TwofishCipher plugin), KeePassXC and KeePassDX.
 */
export function twofishCbc(
    data: ArrayBuffer,
    key: ArrayBuffer,
    iv: ArrayBuffer,
    encrypt: boolean
): Promise<ArrayBuffer> {
    return Promise.resolve().then(() => {
        const cipher = new Twofish(new Uint8Array(key));
        try {
            const result = encrypt
                ? cipher.encryptCbc(new Uint8Array(data), new Uint8Array(iv))
                : cipher.decryptCbc(new Uint8Array(data), new Uint8Array(iv));
            return arrayToBuffer(result);
        } finally {
            cipher.clear();
        }
    });
}

export function chacha20(
    data: ArrayBuffer,
    key: ArrayBuffer,
    iv: ArrayBuffer
): Promise<ArrayBuffer> {
    return Promise.resolve().then(() => {
        const algo = new ChaCha20(new Uint8Array(key), new Uint8Array(iv));
        return arrayToBuffer(algo.encrypt(new Uint8Array(data)));
    });
}

export const Argon2TypeArgon2d = 0;
export const Argon2TypeArgon2id = 2;

export type Argon2Type = typeof Argon2TypeArgon2d | typeof Argon2TypeArgon2id;
export type Argon2Version = 0x10 | 0x13;

export type Argon2Fn = (
    password: ArrayBuffer,
    salt: ArrayBuffer,
    memory: number,
    iterations: number,
    length: number,
    parallelism: number,
    type: Argon2Type,
    version: Argon2Version
) => Promise<ArrayBuffer>;

let argon2impl: Argon2Fn | undefined;

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
    if (argon2impl) {
        return argon2impl(
            password,
            salt,
            memory,
            iterations,
            length,
            parallelism,
            type,
            version
        ).then(arrayToBuffer);
    }
    return Promise.reject(new KdbxError(ErrorCodes.NotImplemented, 'argon2 not implemented'));
}

export function setArgon2Impl(impl: Argon2Fn): void {
    argon2impl = impl;
}
