import {Client as SSH2Client} from 'ssh2';
import type {ConnectConfig} from 'ssh2';
import {createZipArchive, ZipEntry} from 'node:zlib';
import {readFile, mkdir, access} from 'node:fs/promises';
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
            stream.once('close', (code: number) => {
                switch (code) {
                    case 0:
                        resolve();
                        break;
                    case null:
                    case undefined:
                        reject(new Error(`Command "${cmd}" terminated abnormally`));
                        break;
                    default:
                        reject(new Error(`Command "${cmd}" exited with code ${code}`));
                }
            });
            stream.once('error', (err: any) => reject(err));
            stream.on('data', (chunk: Buffer) => output(undefined, chunk));
            stream.stderr.on('data', (chunk: Buffer) => output(chunk, undefined));
        });
    });
}

/**
 * Zips list of files, and resolves with the size of the resulting archive (in bytes).
 */
export async function zipFiles(dir: string, files: string[], zip: { dir: string, name: string }): Promise<number> {
    const entries: ZipEntry[] = [];
    for (const f of files) {
        const p = path.join(dir, f);
        entries.push(await ZipEntry.create(f, await readFile(p)));
    }
    const archive = createZipArchive(entries);
    await access(zip.dir).catch(() => mkdir(zip.dir, {recursive: true}));
    const ws = createWriteStream(path.join(zip.dir, zip.name));
    await pipeline(archive, ws);
    return ws.bytesWritten;
}

/**
 * Fixes Windows paths, by replacing every '\' with '/'
 */
export function fixWindowsPath(path: string): string {
    return path.replace(/\\/g, '/');
}
