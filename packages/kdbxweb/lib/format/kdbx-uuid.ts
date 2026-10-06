import { arrayToBuffer, base64ToBytes, bytesToBase64 } from '../utils/byte-utils';
import { ErrorCodes } from '../defs/consts';
import { KdbxError } from '../errors/kdbx-error';
import * as CryptoEngine from '../crypto/crypto-engine';

const UuidLength = 16;
const EmptyUuidStr = 'AAAAAAAAAAAAAAAAAAAAAA==';

export class KdbxUuid {
    readonly id: string;
    readonly empty: boolean;

    constructor(ab?: ArrayBuffer | Uint8Array | string) {
        const bytes =
            ab === undefined
                ? new Uint8Array(UuidLength)
                : typeof ab === 'string'
                ? base64ToBytes(ab)
                : ab;
        if (bytes.byteLength !== UuidLength) {
            throw new KdbxError(ErrorCodes.FileCorrupt, `bad UUID length: ${bytes.byteLength}`);
        }
        this.id = bytesToBase64(bytes);
        this.empty = this.id === EmptyUuidStr;
    }

    equals(other: KdbxUuid | string | null | undefined): boolean {
        return (other && other.toString() === this.toString()) || false;
    }

    get bytes(): ArrayBuffer {
        return this.toBytes();
    }

    static random(): KdbxUuid {
        return new KdbxUuid(CryptoEngine.random(UuidLength));
    }

    toString(): string {
        return this.id;
    }

    valueOf(): string {
        return this.id;
    }

    toBytes(): ArrayBuffer {
        return arrayToBuffer(base64ToBytes(this.id));
    }
}
