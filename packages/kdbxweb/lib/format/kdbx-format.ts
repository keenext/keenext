import { gzipSync, gunzipSync } from 'fflate';
import { Kdbx } from './kdbx';
import { CipherId, CompressionAlgorithm, ErrorCodes } from '../defs/consts';
import { KdbxError } from '../errors/kdbx-error';
import { BinaryStream } from '../utils/binary-stream';
import { KdbxContext } from './kdbx-context';
import { KdbxHeader } from './kdbx-header';
import {
    arrayBufferEquals,
    arrayToBuffer,
    bytesToString,
    stringToBytes,
    zeroBuffer
} from '../utils/byte-utils';
import { ProtectSaltGenerator } from '../crypto/protect-salt-generator';
import * as XmlUtils from '../utils/xml-utils';
import * as HmacBlockTransform from '../crypto/hmac-block-transform';
import * as HashedBlockTransform from '../crypto/hashed-block-transform';
import * as CryptoEngine from '../crypto/crypto-engine';
import * as KeyEncryptorAes from '../crypto/key-encryptor-aes';
import * as KeyEncryptorKdf from '../crypto/key-encryptor-kdf';
import { Int64 } from '../utils/int64';

/*
 * Every buffer holding key material (credential hash, derived keys, master and
 * HMAC keys) is zeroed in a `finally`, so a wrong key, a corrupt file or an
 * aborted derivation does not leave it behind.
 */
export class KdbxFormat {
    readonly kdbx: Kdbx;
    readonly ctx: KdbxContext;

    preserveXml = false;
    /** Stops key derivation when aborted; set by Kdbx.load. */
    signal: AbortSignal | undefined;

    constructor(kdbx: Kdbx) {
        this.kdbx = kdbx;
        this.ctx = new KdbxContext({ kdbx });
    }

    async load(data: ArrayBuffer): Promise<Kdbx> {
        const stm = new BinaryStream(data);
        await this.kdbx.credentials.ready;
        this.kdbx.header = KdbxHeader.read(stm, this.ctx);
        if (this.kdbx.header.versionMajor === 3) {
            return this.loadV3(stm);
        } else if (this.kdbx.header.versionMajor === 4) {
            return this.loadV4(stm);
        } else {
            throw new KdbxError(ErrorCodes.InvalidVersion, `bad version: ${this.kdbx.versionMajor}`);
        }
    }

    private async loadV3(stm: BinaryStream): Promise<Kdbx> {
        const xmlStr = await this.decryptXmlV3(stm);
        this.kdbx.xml = XmlUtils.parse(xmlStr);
        await this.setProtectedValues();
        await this.kdbx.loadFromXml(this.ctx);
        await this.checkHeaderHashV3(stm);
        this.cleanXml();
        return this.kdbx;
    }

    private async loadV4(stm: BinaryStream): Promise<Kdbx> {
        const headerSha = await this.getHeaderHash(stm);
        const expectedHeaderSha = stm.readBytes(headerSha.byteLength);
        if (!arrayBufferEquals(expectedHeaderSha, headerSha)) {
            throw new KdbxError(ErrorCodes.FileCorrupt, 'header hash mismatch');
        }
        let data: ArrayBuffer;
        const keys = await this.computeKeysV4();
        try {
            const headerHmac = await this.getHeaderHmac(stm, keys.hmacKey);
            const expectedHeaderHmac = stm.readBytes(headerHmac.byteLength);
            if (!arrayBufferEquals(expectedHeaderHmac, headerHmac)) {
                throw new KdbxError(ErrorCodes.InvalidKey);
            }
            const encrypted = await HmacBlockTransform.decrypt(stm.readBytesToEnd(), keys.hmacKey);
            data = await this.decryptData(encrypted, keys.cipherKey);
        } finally {
            zeroBuffer(keys.cipherKey);
            zeroBuffer(keys.hmacKey);
        }
        if (this.kdbx.header.compression === CompressionAlgorithm.GZip) {
            data = arrayToBuffer(gunzipSync(new Uint8Array(data)));
        }
        const innerStm = new BinaryStream(arrayToBuffer(data));
        this.kdbx.header.readInnerHeader(innerStm, this.ctx);
        this.kdbx.xml = XmlUtils.parse(bytesToString(innerStm.readBytesToEnd()));
        await this.setProtectedValues();
        await this.kdbx.loadFromXml(this.ctx);
        this.cleanXml();
        return this.kdbx;
    }

    async loadXml(xmlStr: string): Promise<Kdbx> {
        await this.kdbx.credentials.ready;
        this.kdbx.header = KdbxHeader.create();
        this.kdbx.xml = XmlUtils.parse(xmlStr);
        XmlUtils.protectPlainValues(this.kdbx.xml.documentElement);
        await this.kdbx.loadFromXml(this.ctx);
        this.cleanXml();
        return this.kdbx;
    }

    /** KDBX 4.0 files become 4.1 when they hold values 4.0 cannot store, instead of losing them. */
    private raiseMinorVersionIfNeeded(): void {
        if (
            this.kdbx.versionMajor === 4 &&
            this.kdbx.versionMinor < 1 &&
            this.kdbx.hasKdbx41Values()
        ) {
            this.kdbx.header.versionMinor = 1;
        }
    }

    async save(): Promise<ArrayBuffer> {
        await this.kdbx.credentials.ready;
        const stm = new BinaryStream();
        this.raiseMinorVersionIfNeeded();
        this.kdbx.header.generateSalts();
        this.kdbx.header.write(stm);
        if (this.kdbx.versionMajor === 3) {
            return this.saveV3(stm);
        } else if (this.kdbx.versionMajor === 4) {
            return this.saveV4(stm);
        } else {
            throw new KdbxError(ErrorCodes.InvalidVersion, `bad version: ${this.kdbx.versionMajor}`);
        }
    }

    private async saveV3(stm: BinaryStream): Promise<ArrayBuffer> {
        this.kdbx.meta.headerHash = await this.getHeaderHash(stm);
        this.kdbx.buildXml(this.ctx);
        const gen = await this.getProtectSaltGenerator();
        XmlUtils.updateProtectedValuesSalt(this.requireXml().documentElement, gen);
        const data = await this.encryptXmlV3();
        this.cleanXml();
        stm.writeBytes(data);
        return stm.getWrittenBytes();
    }

    private async saveV4(stm: BinaryStream): Promise<ArrayBuffer> {
        this.kdbx.buildXml(this.ctx);
        stm.writeBytes(await this.getHeaderHash(stm));
        const keys = await this.computeKeysV4();
        try {
            stm.writeBytes(await this.getHeaderHmac(stm, keys.hmacKey));
            const gen = await this.getProtectSaltGenerator();
            const xmlDoc = this.requireXml();
            XmlUtils.updateProtectedValuesSalt(xmlDoc.documentElement, gen);
            const xml = XmlUtils.serialize(xmlDoc);
            const innerHeaderStm = new BinaryStream();
            this.kdbx.header.writeInnerHeader(innerHeaderStm, this.ctx);
            const innerHeaderData = innerHeaderStm.getWrittenBytes();
            const xmlData = arrayToBuffer(stringToBytes(xml));
            let data = new ArrayBuffer(innerHeaderData.byteLength + xmlData.byteLength);
            const dataArr = new Uint8Array(data);
            dataArr.set(new Uint8Array(innerHeaderData));
            dataArr.set(new Uint8Array(xmlData), innerHeaderData.byteLength);
            zeroBuffer(xmlData);
            zeroBuffer(innerHeaderData);
            if (this.kdbx.header.compression === CompressionAlgorithm.GZip) {
                data = arrayToBuffer(gzipSync(new Uint8Array(data)));
            }
            const encrypted = await this.encryptData(data, keys.cipherKey);
            const blocks = await HmacBlockTransform.encrypt(encrypted, keys.hmacKey);
            this.cleanXml();
            stm.writeBytes(blocks);
            return stm.getWrittenBytes();
        } finally {
            zeroBuffer(keys.cipherKey);
            zeroBuffer(keys.hmacKey);
        }
    }

    async saveXml(prettyPrint = false): Promise<string> {
        await this.kdbx.credentials.ready;
        this.raiseMinorVersionIfNeeded();
        this.kdbx.header.generateSalts();
        this.ctx.exportXml = true;
        this.kdbx.buildXml(this.ctx);
        const xmlDoc = this.requireXml();
        XmlUtils.unprotectValues(xmlDoc.documentElement);
        const xml = XmlUtils.serialize(xmlDoc, prettyPrint);
        XmlUtils.protectUnprotectedValues(xmlDoc.documentElement);
        this.cleanXml();
        return xml;
    }

    private async decryptXmlV3(stm: BinaryStream): Promise<string> {
        const encrypted = stm.readBytesToEnd();
        let data: ArrayBuffer;
        const masterKey = await this.getMasterKeyV3();
        try {
            data = await this.decryptData(encrypted, masterKey);
        } finally {
            zeroBuffer(masterKey);
        }
        data = this.trimStartBytesV3(data);
        data = await HashedBlockTransform.decrypt(data);
        if (this.kdbx.header.compression === CompressionAlgorithm.GZip) {
            data = arrayToBuffer(gunzipSync(new Uint8Array(data)));
        }
        return bytesToString(data);
    }

    private async encryptXmlV3(): Promise<ArrayBuffer> {
        const xml = XmlUtils.serialize(this.requireXml());
        let data = arrayToBuffer(stringToBytes(xml));
        if (this.kdbx.header.compression === CompressionAlgorithm.GZip) {
            data = arrayToBuffer(gzipSync(new Uint8Array(data)));
        }
        const blocks = await HashedBlockTransform.encrypt(data);
        if (!this.kdbx.header.streamStartBytes) {
            throw new KdbxError(ErrorCodes.InvalidState, 'no header start bytes');
        }
        const ssb = new Uint8Array(this.kdbx.header.streamStartBytes);
        const withStartBytes = new Uint8Array(blocks.byteLength + ssb.length);
        withStartBytes.set(ssb);
        withStartBytes.set(new Uint8Array(blocks), ssb.length);
        const masterKey = await this.getMasterKeyV3();
        try {
            return await this.encryptData(arrayToBuffer(withStartBytes), masterKey);
        } finally {
            zeroBuffer(masterKey);
        }
    }

    private async getMasterKeyV3(): Promise<ArrayBuffer> {
        const { transformSeed, keyEncryptionRounds, masterSeed } = this.kdbx.header;
        if (!transformSeed || !keyEncryptionRounds || !masterSeed) {
            throw new KdbxError(ErrorCodes.FileCorrupt, 'no header transform parameters');
        }
        const credHash = await this.kdbx.credentials.getHash();
        let chalResp: ArrayBuffer | Uint8Array | null = null;
        let encKey: Uint8Array | undefined;
        let keyHash: ArrayBuffer | undefined;
        let all: Uint8Array | undefined;
        try {
            chalResp = await this.kdbx.credentials.getChallengeResponse(masterSeed);
            encKey = await KeyEncryptorAes.encrypt(
                new Uint8Array(credHash),
                transformSeed,
                keyEncryptionRounds,
                this.signal
            );
            keyHash = await CryptoEngine.sha256(arrayToBuffer(encKey));

            const chalRespLength = chalResp ? chalResp.byteLength : 0;
            all = new Uint8Array(masterSeed.byteLength + keyHash.byteLength + chalRespLength);
            all.set(new Uint8Array(masterSeed), 0);
            if (chalResp) {
                all.set(new Uint8Array(chalResp), masterSeed.byteLength);
            }
            all.set(new Uint8Array(keyHash), masterSeed.byteLength + chalRespLength);
            return await CryptoEngine.sha256(arrayToBuffer(all));
        } finally {
            for (const buffer of [credHash, chalResp, encKey, keyHash, all, masterSeed]) {
                if (buffer) {
                    zeroBuffer(buffer);
                }
            }
        }
    }

    private trimStartBytesV3(data: ArrayBuffer): ArrayBuffer {
        if (!this.kdbx.header.streamStartBytes) {
            throw new KdbxError(ErrorCodes.FileCorrupt, 'no stream start bytes');
        }
        const ssb = this.kdbx.header.streamStartBytes;
        if (data.byteLength < ssb.byteLength) {
            throw new KdbxError(ErrorCodes.FileCorrupt, 'short start bytes');
        }
        if (!arrayBufferEquals(data.slice(0, this.kdbx.header.streamStartBytes.byteLength), ssb)) {
            throw new KdbxError(ErrorCodes.InvalidKey);
        }
        return data.slice(ssb.byteLength);
    }

    private async setProtectedValues(): Promise<void> {
        const gen = await this.getProtectSaltGenerator();
        XmlUtils.setProtectedValues(this.requireXml().documentElement, gen);
    }

    private getProtectSaltGenerator(): Promise<ProtectSaltGenerator> {
        if (!this.kdbx.header.protectedStreamKey || !this.kdbx.header.crsAlgorithm) {
            throw new KdbxError(ErrorCodes.InvalidState, 'bad header parameters');
        }
        return ProtectSaltGenerator.create(
            this.kdbx.header.protectedStreamKey,
            this.kdbx.header.crsAlgorithm
        );
    }

    private getHeaderHash(stm: BinaryStream): Promise<ArrayBuffer> {
        if (!this.kdbx.header.endPos) {
            throw new KdbxError(ErrorCodes.InvalidState, 'no end pos');
        }
        const src = stm.readBytesNoAdvance(0, this.kdbx.header.endPos);
        return CryptoEngine.sha256(src);
    }

    private async getHeaderHmac(stm: BinaryStream, key: ArrayBuffer): Promise<ArrayBuffer> {
        if (!this.kdbx.header.endPos) {
            throw new KdbxError(ErrorCodes.InvalidState, 'no end pos');
        }
        const src = stm.readBytesNoAdvance(0, this.kdbx.header.endPos);
        const keySha = await HmacBlockTransform.getHmacKey(key, new Int64(0xffffffff, 0xffffffff));
        try {
            return await CryptoEngine.hmacSha256(keySha, src);
        } finally {
            zeroBuffer(keySha);
        }
    }

    private async checkHeaderHashV3(stm: BinaryStream): Promise<void> {
        const metaHash = this.kdbx.meta.headerHash;
        if (metaHash) {
            const actualHash = await this.getHeaderHash(stm);
            if (!arrayBufferEquals(metaHash, actualHash)) {
                throw new KdbxError(ErrorCodes.FileCorrupt, 'header hash mismatch');
            }
        }
    }

    private async computeKeysV4(): Promise<{ cipherKey: ArrayBuffer; hmacKey: ArrayBuffer }> {
        const masterSeed = this.kdbx.header.masterSeed;
        if (!masterSeed || masterSeed.byteLength !== 32) {
            throw new KdbxError(ErrorCodes.FileCorrupt, 'bad master seed');
        }
        const kdfParams = this.kdbx.header.kdfParameters;
        if (!kdfParams) {
            throw new KdbxError(ErrorCodes.FileCorrupt, 'no kdf params');
        }
        const kdfSalt = kdfParams.get('S');
        if (!(kdfSalt instanceof ArrayBuffer)) {
            throw new KdbxError(ErrorCodes.FileCorrupt, 'no salt');
        }
        const credHash = await this.kdbx.credentials.getHash(kdfSalt);
        let encKey: ArrayBuffer | undefined;
        const keyWithSeed = new Uint8Array(65);
        let cipherKeySource: ArrayBuffer | undefined;
        try {
            encKey = await KeyEncryptorKdf.encrypt(credHash, kdfParams, this.signal);
            if (!encKey || encKey.byteLength !== 32) {
                throw new KdbxError(ErrorCodes.Unsupported, 'bad derived key');
            }
            keyWithSeed.set(new Uint8Array(masterSeed), 0);
            keyWithSeed.set(new Uint8Array(encKey), masterSeed.byteLength);
            keyWithSeed[64] = 1;
            cipherKeySource = keyWithSeed.buffer.slice(0, 64);
            const [cipherKey, hmacKey] = await Promise.all([
                CryptoEngine.sha256(cipherKeySource),
                CryptoEngine.sha512(keyWithSeed.buffer)
            ]);
            return { cipherKey, hmacKey };
        } finally {
            for (const buffer of [credHash, encKey, keyWithSeed, cipherKeySource, masterSeed]) {
                if (buffer) {
                    zeroBuffer(buffer);
                }
            }
        }
    }

    private decryptData(data: ArrayBuffer, cipherKey: ArrayBuffer): Promise<ArrayBuffer> {
        const cipherId = this.kdbx.header.dataCipherUuid;
        if (!cipherId) {
            throw new KdbxError(ErrorCodes.FileCorrupt, 'no cipher id');
        }
        switch (cipherId.toString()) {
            case CipherId.Aes:
                return this.transformDataV4Aes(data, cipherKey, false);
            case CipherId.ChaCha20:
                return this.transformDataV4ChaCha20(data, cipherKey);
            case CipherId.Twofish:
                return this.transformDataTwofish(data, cipherKey, false);
            default:
                return Promise.reject(new KdbxError(ErrorCodes.Unsupported, 'unsupported cipher'));
        }
    }

    private encryptData(data: ArrayBuffer, cipherKey: ArrayBuffer): Promise<ArrayBuffer> {
        const cipherId = this.kdbx.header.dataCipherUuid;
        if (!cipherId) {
            throw new KdbxError(ErrorCodes.FileCorrupt, 'no cipher id');
        }
        switch (cipherId.toString()) {
            case CipherId.Aes:
                return this.transformDataV4Aes(data, cipherKey, true);
            case CipherId.ChaCha20:
                return this.transformDataV4ChaCha20(data, cipherKey);
            case CipherId.Twofish:
                return this.transformDataTwofish(data, cipherKey, true);
            default:
                return Promise.reject(new KdbxError(ErrorCodes.Unsupported, 'unsupported cipher'));
        }
    }

    private getEncryptionIV(length: number): ArrayBuffer {
        const iv = this.kdbx.header.encryptionIV;
        if (!iv) {
            throw new KdbxError(ErrorCodes.FileCorrupt, 'no encryption IV');
        }
        if (iv.byteLength !== length) {
            throw new KdbxError(ErrorCodes.FileCorrupt, `bad encryption IV length: ${iv.byteLength}`);
        }
        return iv;
    }

    private transformDataTwofish(
        data: ArrayBuffer,
        cipherKey: ArrayBuffer,
        encrypt: boolean
    ): Promise<ArrayBuffer> {
        const iv = this.getEncryptionIV(16);
        return CryptoEngine.twofishCbc(data, cipherKey, iv, encrypt);
    }

    private transformDataV4Aes(
        data: ArrayBuffer,
        cipherKey: ArrayBuffer,
        encrypt: boolean
    ): Promise<ArrayBuffer> {
        const aesCbc = CryptoEngine.createAesCbc();
        const iv = this.getEncryptionIV(16);
        return aesCbc.importKey(cipherKey).then(() => {
            return encrypt ? aesCbc.encrypt(data, iv) : aesCbc.decrypt(data, iv);
        });
    }

    private transformDataV4ChaCha20(
        data: ArrayBuffer,
        cipherKey: ArrayBuffer
    ): Promise<ArrayBuffer> {
        const iv = this.getEncryptionIV(12);
        return CryptoEngine.chacha20(data, cipherKey, iv);
    }

    private requireXml(): Document {
        if (!this.kdbx.xml) {
            throw new KdbxError(ErrorCodes.InvalidState, 'no xml');
        }
        return this.kdbx.xml;
    }

    private cleanXml() {
        if (!this.preserveXml) {
            this.kdbx.xml = undefined;
        }
    }
}
