export type WalCheckpointModeSetting = 'full' | 'passive' | 'off';

export interface WebviewSettingsPayload {
    defaultPageSize: number;
    externalRefreshDebounceMs: number;
    walMonitoring: boolean;
    walAutoCheckpoint: boolean;
    walCheckpointMode: WalCheckpointModeSetting;
}

// Webview -> Extension messages
export interface RequestDatabaseInfoMessage {
    type: 'requestDatabaseInfo';
    key?: string;
}

export interface ReloadDatabaseMessage {
    type: 'reloadDatabase';
    key?: string;
}

export interface ExecuteQueryMessage {
    type: 'executeQuery';
    query: string;
    key?: string;
}

export interface GetTableSchemaMessage {
    type: 'getTableSchema';
    tableName: string;
    key?: string;
}

export interface GetTableDataMessage {
    type: 'getTableData';
    tableName: string;
    key?: string;
    page?: number;
    pageSize?: number;
}

export interface UpdateCellDataMessage {
    type: 'updateCellData';
    tableName: string;
    rowIndex: number;
    columnName: string;
    newValue: unknown;
    key?: string;
}

export interface DeleteRowMessage {
    type: 'deleteRow';
    tableName: string;
    rowId: unknown;
    key?: string;
}

export interface GenerateERDiagramMessage {
    type: 'generateERDiagram';
    key?: string;
}

export interface DownloadBlobMessage {
    type: 'downloadBlob';
    requestId: string;
    filename: string;
    mime: string;
    dataBase64: string;
}

export type WebviewToExtensionMessage =
    | RequestDatabaseInfoMessage
    | ReloadDatabaseMessage
    | ExecuteQueryMessage
    | GetTableSchemaMessage
    | GetTableDataMessage
    | UpdateCellDataMessage
    | DeleteRowMessage
    | GenerateERDiagramMessage
    | DownloadBlobMessage;

// Extension -> Webview messages
export interface UpdateMessage {
    type: 'update';
    databasePath: string;
    settings: WebviewSettingsPayload;
}

export interface DatabaseLoadErrorMessage {
    type: 'databaseLoadError';
    error: string;
}

export interface DatabaseReloadedMessage {
    type: 'databaseReloaded';
    databasePath: string;
}

export interface ExternalDatabaseChangedMessage {
    type: 'externalDatabaseChanged';
    databasePath: string;
}

export interface ErrorMessage {
    type: 'error';
    message: string;
    [key: string]: unknown;
}

export interface DownloadBlobResultMessage {
    type: 'downloadBlobResult';
    requestId?: string;
    success?: boolean;
    canceled?: boolean;
    bytes?: number;
    message?: string;
    [key: string]: unknown;
}

export interface GenericExtensionToWebviewMessage {
    type:
        | 'databaseInfo'
        | 'tableData'
        | 'tableRowCount'
        | 'tableColumnInfo'
        | 'tableDataDelta'
        | 'queryResult'
        | 'tableSchema'
        | 'erDiagram'
        | 'erDiagramProgress'
        | 'cellUpdateSuccess'
        | 'cellUpdateError'
        | 'deleteRowSuccess'
        | 'deleteRowError'
        | 'maximizeSidebar';
    [key: string]: unknown;
}

export type ExtensionToWebviewMessage =
    | UpdateMessage
    | DatabaseLoadErrorMessage
    | DatabaseReloadedMessage
    | ExternalDatabaseChangedMessage
    | ErrorMessage
    | DownloadBlobResultMessage
    | GenericExtensionToWebviewMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
    return typeof value === 'string';
}

function isOptionalString(value: unknown): value is string | undefined {
    return value === undefined || typeof value === 'string';
}

function isOptionalNumber(value: unknown): value is number | undefined {
    return value === undefined || typeof value === 'number';
}

function hasDefinedProperty(value: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined;
}

function isExtensionMessageType(type: unknown): type is ExtensionToWebviewMessage['type'] {
    return typeof type === 'string' && EXTENSION_TO_WEBVIEW_TYPES.has(type as ExtensionToWebviewMessage['type']);
}

function isWebviewMessageType(type: unknown): type is WebviewToExtensionMessage['type'] {
    return typeof type === 'string' && WEBVIEW_TO_EXTENSION_TYPES.has(type as WebviewToExtensionMessage['type']);
}

const EXTENSION_TO_WEBVIEW_TYPES = new Set<ExtensionToWebviewMessage['type']>([
    'update',
    'databaseLoadError',
    'databaseReloaded',
    'externalDatabaseChanged',
    'databaseInfo',
    'tableData',
    'tableRowCount',
    'tableColumnInfo',
    'tableDataDelta',
    'queryResult',
    'tableSchema',
    'erDiagram',
    'erDiagramProgress',
    'error',
    'cellUpdateSuccess',
    'cellUpdateError',
    'deleteRowSuccess',
    'deleteRowError',
    'downloadBlobResult',
    'maximizeSidebar'
]);

const WEBVIEW_TO_EXTENSION_TYPES = new Set<WebviewToExtensionMessage['type']>([
    'requestDatabaseInfo',
    'reloadDatabase',
    'executeQuery',
    'getTableSchema',
    'getTableData',
    'updateCellData',
    'deleteRow',
    'generateERDiagram',
    'downloadBlob'
]);

export function isExtensionToWebviewMessage(value: unknown): value is ExtensionToWebviewMessage {
    if (!isRecord(value) || !isExtensionMessageType(value.type)) {
        return false;
    }

    switch (value.type) {
        case 'update':
            return (
                isString(value.databasePath) &&
                isRecord(value.settings) &&
                typeof value.settings.defaultPageSize === 'number' &&
                typeof value.settings.externalRefreshDebounceMs === 'number' &&
                typeof value.settings.walMonitoring === 'boolean' &&
                typeof value.settings.walAutoCheckpoint === 'boolean' &&
                (value.settings.walCheckpointMode === 'full' ||
                    value.settings.walCheckpointMode === 'passive' ||
                    value.settings.walCheckpointMode === 'off')
            );
        case 'databaseLoadError':
            return isString(value.error);
        case 'databaseReloaded':
        case 'externalDatabaseChanged':
            return isString(value.databasePath);
        case 'error':
            return isString(value.message);
        case 'downloadBlobResult':
            return (
                isOptionalString(value.requestId) &&
                (value.success === undefined || typeof value.success === 'boolean') &&
                (value.canceled === undefined || typeof value.canceled === 'boolean') &&
                isOptionalNumber(value.bytes) &&
                isOptionalString(value.message)
            );
        default:
            return true;
    }
}

export function isWebviewToExtensionMessage(value: unknown): value is WebviewToExtensionMessage {
    if (!isRecord(value) || !isWebviewMessageType(value.type)) {
        return false;
    }

    switch (value.type) {
        case 'requestDatabaseInfo':
        case 'reloadDatabase':
        case 'generateERDiagram':
            return isOptionalString(value.key);
        case 'executeQuery':
            return isString(value.query) && isOptionalString(value.key);
        case 'getTableSchema':
            return isString(value.tableName) && isOptionalString(value.key);
        case 'getTableData':
            return (
                isString(value.tableName) &&
                isOptionalString(value.key) &&
                isOptionalNumber(value.page) &&
                isOptionalNumber(value.pageSize)
            );
        case 'updateCellData':
            return (
                isString(value.tableName) &&
                typeof value.rowIndex === 'number' &&
                isString(value.columnName) &&
                hasDefinedProperty(value, 'newValue') &&
                isOptionalString(value.key)
            );
        case 'deleteRow':
            return isString(value.tableName) && hasDefinedProperty(value, 'rowId') && isOptionalString(value.key);
        case 'downloadBlob':
            return (
                isString(value.requestId) &&
                isString(value.filename) &&
                isString(value.mime) &&
                isString(value.dataBase64)
            );
        default:
            return false;
    }
}
