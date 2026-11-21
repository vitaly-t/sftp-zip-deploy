import {Client as SSH2Client} from 'ssh2';
import type {ConnectConfig} from 'ssh2';

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
 * Fixes Windows paths, by replacing every '\' with '/'
 */
export function fixWindowsPath(path: string): string {
    return path.replace(/\\/g, '/');
}
