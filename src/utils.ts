import {Client as SSH2Client, ConnectConfig} from 'ssh2';
import {createZipArchive, ZipEntry} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';

export function connectSSH2Client(client: SSH2Client, cn: ConnectConfig): Promise<SSH2Client> {
    return new Promise((resolve, reject) => {
        client.once('ready', () => resolve(client));
        client.once('error', err => reject(err));
        client.connect(cn);
    });
}

export function execSHH2Command(client: SSH2Client, cmd: string, output: (err?: Buffer, std?: Buffer) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        client.exec(cmd, (err, stream) => {
            if (err) {
                reject(err);
                return;
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
export async function zipFiles(files: string[], zipPath: string): Promise<number> {
    const entries: ZipEntry[] = [];
    for (const f of files) {
        entries.push(await ZipEntry.create(f, await readFile(f)));
    }
    const archive = createZipArchive(entries);
    const ws = createWriteStream(zipPath);
    await pipeline(archive, ws);
    return ws.bytesWritten;
}
