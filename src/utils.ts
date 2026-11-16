import {Client as SSH2Client, ConnectConfig} from 'ssh2';
import {createZipArchive, ZipEntry, createGzip, constants} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';

export function connectSSH2Client(client: SSH2Client, cn: ConnectConfig): Promise<SSH2Client> {
    return new Promise((resolve, reject) => {
        client.once('ready', () => resolve(client));
        client.once('error', err => reject(err));
        client.connect(cn);
    });
}

export function execSSH2Command(client: SSH2Client, cmd: string, output: (err?: Buffer, std?: Buffer) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        client.exec(cmd, (err, stream) => {
            if (err) {
                return reject(err);
            }
            stream.once('close', () => resolve());
            stream.on('data', (chunk: Buffer) => output(undefined, chunk));
            stream.stderr.on('data', (chunk: Buffer) => output(chunk, undefined));
        });
    });
}

/**
 * Zips list of files, and resolves with the size of the resulting archive (in bytes).
 */
export async function zipFiles(dir: string, files: string[], zipPath: string): Promise<number> {
    const entries: ZipEntry[] = [];
    for (const f of files) {
        const p = path.join(dir, f);
        entries.push(await ZipEntry.create(f, await readFile(p)));
    }
    const archive = createZipArchive(entries);
    const ws = createWriteStream(zipPath);

    const maxCompressionOptions = {
        level: constants.Z_BEST_COMPRESSION, // 9 (default is 6)
        windowBits: 15, // Max 32KB history window (default is 15)
        memLevel: 9,    // Max internal hash table memory (default is 8)
        strategy: constants.Z_DEFAULT_STRATEGY,
    };

    await pipeline(archive, createGzip(maxCompressionOptions), ws);
    return ws.bytesWritten;
}

/**
 * Fixes Windows path-s, by replacing every '\' with '/'
 */
export function fixWindowsPath(path: string): string {
    return path.replace(/\\/g, '/');
}
