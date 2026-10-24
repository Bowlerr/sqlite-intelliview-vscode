export const DEFAULT_QUERY_MAX_ROWS = 10000;
export const DEFAULT_MAX_TABLE_PAGE_SIZE = 100000;
export const DEFAULT_TABLE_PAGE_SIZE = 1000;

export type RowLimitSetting = 'queryMaxRows' | 'maxTablePageSize' | 'defaultPageSize';
export type RowLimitReader = (setting: RowLimitSetting, defaultValue: number) => unknown;

/** Zero is the only unlimited value; invalid settings retain the safe default. */
export function normalizeRowLimit(value: unknown, defaultValue: number): number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : defaultValue;
}

/** Normalize before capping, including the fallback for invalid requested sizes. */
export function normalizePageSize(value: unknown, maxPageSize: number, fallback = 100): number {
    const requested = typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
    return maxPageSize === 0 ? requested : Math.min(requested, maxPageSize);
}

export function readRowLimitSettings(read: RowLimitReader) {
    const maxTablePageSize = normalizeRowLimit(read('maxTablePageSize', DEFAULT_MAX_TABLE_PAGE_SIZE), DEFAULT_MAX_TABLE_PAGE_SIZE);
    const queryMaxRows = normalizeRowLimit(read('queryMaxRows', DEFAULT_QUERY_MAX_ROWS), DEFAULT_QUERY_MAX_ROWS);
    const configuredDefault = read('defaultPageSize', DEFAULT_TABLE_PAGE_SIZE);
    const defaultPageSize = normalizePageSize(
        typeof configuredDefault === 'number' && Number.isSafeInteger(configuredDefault) && configuredDefault > 0
            ? Math.max(10, configuredDefault) : DEFAULT_TABLE_PAGE_SIZE,
        maxTablePageSize,
        DEFAULT_TABLE_PAGE_SIZE
    );
    return { queryMaxRows, maxTablePageSize, defaultPageSize };
}

/** The same effective page size drives both the SQL offset and response metadata. */
export function normalizeTablePage(page: unknown, pageSize: unknown, maxPageSize: number) {
    const safePage = typeof page === 'number' && Number.isSafeInteger(page) && page > 0 ? page : 1;
    const safePageSize = normalizePageSize(pageSize, maxPageSize);
    const offset = (safePage - 1) * safePageSize;
    if (!Number.isSafeInteger(offset)) {
        throw new Error('The requested page offset exceeds the supported integer range.');
    }
    return { page: safePage, pageSize: safePageSize, offset, maxTablePageSize: maxPageSize };
}
