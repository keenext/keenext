import { ByteUtils, KdbxUuid, ProtectedValue } from '../../lib';

/**
 * Turns kdbxweb values into plain JSON-comparable data. expect.js `eql` treats
 * every Map as equal to every other, so Maps are compared as entry lists.
 */
export function normalize(value: unknown): unknown {
    if (value instanceof Date) {
        return { date: value.toISOString() };
    }
    if (value instanceof KdbxUuid) {
        return { uuid: value.id };
    }
    if (value instanceof ProtectedValue) {
        return { protected: value.getText() };
    }
    if (value instanceof ArrayBuffer) {
        return { bytes: ByteUtils.bytesToHex(value) };
    }
    if (value instanceof Map) {
        return { map: [...value].map(([key, item]) => [key, normalize(item)]) };
    }
    if (Array.isArray(value)) {
        return value.map(normalize);
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, normalize(item)])
        );
    }
    return value;
}

/**
 * Lists the own properties of a fresh instance, except `notCopied`, that `source`
 * leaves unset or that differ between `source` and `copy`. Because unset ones are
 * listed, a property added to the class fails until the test populates it.
 */
export function copyProblems(
    fresh: object,
    source: object,
    copy: object,
    notCopied: string[]
): string[] {
    const keys = Object.keys(fresh).filter((key) => !notCopied.includes(key));
    const get = (obj: object, key: string) => (obj as Record<string, unknown>)[key];
    const unset = keys.filter((key) => get(source, key) === undefined);
    const differing = keys.filter(
        (key) =>
            JSON.stringify(normalize(get(copy, key))) !==
            JSON.stringify(normalize(get(source, key)))
    );
    return [...unset.map((key) => `${key}: not set in source`), ...differing];
}
