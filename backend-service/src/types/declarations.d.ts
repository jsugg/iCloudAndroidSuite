declare module 'apple-auth';
declare module 'webdav' {
    export interface WebDAVClientOptions {
        username: string;
        password: string;
    }

    export interface WebDAVClient {
        getFileContents(path: string): Promise<Buffer>;
        putFileContents(path: string, data: Buffer): Promise<boolean>;
        getDirectoryContents(path: string): Promise<FileStat[]>;
        createDirectory(path: string): Promise<void>;
        deleteFile(path: string): Promise<void>;
        moveFile(fromPath: string, toPath: string): Promise<void>;
        copyFile(fromPath: string, toPath: string): Promise<void>;
        stat(path: string): Promise<FileStat>;
    }

    export interface FileStat {
        filename: string;
    }

    export function createClient(remoteURL: string, options: WebDAVClientOptions): WebDAVClient;

    export interface ResponseDataDetailed<T> {
        data: T;
        headers: Headers;
        status: number;
        statusText: string;
    }
}
