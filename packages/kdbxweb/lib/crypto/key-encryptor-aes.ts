import * as CryptoEngine from './crypto-engine';
import { arrayToBuffer, zeroBuffer } from '../utils/byte-utils';

const maxRoundsPreIteration = 10000;
const aesBlockSize = 16;
const credentialSize = 32;

/*
In order to simulate multiple rounds of ECB encryption, we do CBC encryption
across a zero buffer of large length with the IV being the desired plaintext.
The zero buffer does not contribute to the xor, so xoring the previous block
with the next one simulates running ECB multiple times. We limit the maximum
size of the zero buffer to prevent enormous memory usage.
*/

/** Aborting `signal` rejects with its reason at the next chunk of rounds. */
export function encrypt(
    credentials: Uint8Array,
    key: Uint8Array | ArrayBuffer,
    rounds: number,
    signal?: AbortSignal
): Promise<Uint8Array> {
    const algo = CryptoEngine.createAesCbc();
    return algo
        .importKey(arrayToBuffer(key))
        .then(() => {
            const resolvers = [];
            for (let idx = 0; idx < credentialSize; idx += aesBlockSize) {
                resolvers.push(
                    encryptBlock(
                        algo,
                        credentials.subarray(idx, idx + aesBlockSize),
                        rounds,
                        signal
                    )
                );
            }
            return Promise.all(resolvers);
        })
        .then((results) => {
            const res = new Uint8Array(credentialSize);
            results.forEach((result, idx) => {
                const base = idx * aesBlockSize;
                for (let i = 0; i < aesBlockSize; ++i) {
                    res[i + base] = result[i];
                }
                zeroBuffer(result);
            });
            return res;
        });
}

// Chunks run one after another, so the number of rounds (from the file) costs time, not memory.
async function encryptBlock(
    algo: CryptoEngine.AesCbc,
    iv: Uint8Array | ArrayBuffer,
    rounds: number,
    signal: AbortSignal | undefined
): Promise<Uint8Array> {
    let result = arrayToBuffer(iv);
    const buffer = new Uint8Array(aesBlockSize * Math.min(rounds, maxRoundsPreIteration));

    while (rounds > 0) {
        signal?.throwIfAborted();
        const currentRounds = Math.min(rounds, maxRoundsPreIteration);
        rounds -= currentRounds;

        const dataLen = aesBlockSize * currentRounds;
        const zeroData =
            buffer.length === dataLen ? buffer.buffer : arrayToBuffer(buffer.subarray(0, dataLen));
        result = await encryptBlockBuffer(algo, result, zeroData);
    }

    return new Uint8Array(result);
}

async function encryptBlockBuffer(
    algo: CryptoEngine.AesCbc,
    iv: ArrayBuffer,
    buffer: ArrayBuffer
): Promise<ArrayBuffer> {
    const buf = await algo.encrypt(buffer, iv);
    const res = arrayToBuffer(new Uint8Array(buf).subarray(-2 * aesBlockSize, -aesBlockSize));
    zeroBuffer(buf);
    return res;
}
