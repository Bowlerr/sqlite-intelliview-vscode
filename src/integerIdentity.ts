/** JSON-safe SQLite INTEGER identity, distinct from a text key with the same digits. */
export interface SerializedIntegerIdentityValue {
    type: 'integer';
    decimal: string;
}

export function isSerializedIntegerIdentityValue(value: unknown): value is SerializedIntegerIdentityValue {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const candidate = value as Partial<SerializedIntegerIdentityValue>;
    if (candidate.type !== 'integer' || typeof candidate.decimal !== 'string' ||
        !/^(?:0|-?[1-9][0-9]{0,18})$/.test(candidate.decimal)) {
        return false;
    }
    const integer = BigInt(candidate.decimal);
    return integer >= -9223372036854775808n && integer <= 9223372036854775807n;
}
