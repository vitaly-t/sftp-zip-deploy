import SftpClient from 'ssh2-sftp-client';
import {Client as SSH2Client} from 'ssh2';

export function execSSH2Command(sftp: SftpClient, cmd: string, output: (err?: Buffer, std?: Buffer) => void): Promise<void> {
    const client = (sftp as any).client as SSH2Client; // overriding ssh2-sftp-client (see #595 there)
    return new Promise((resolve, reject) => {
        client.exec(cmd, (err, stream) => {
            const onError = (err: any) => {
                stream.removeAllListeners();
                reject(err);
            };
            if (err) {
                return onError(err);
            }
            stream.once('close', (code: number) => {
                stream.removeAllListeners();
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
                        break;
                }
            });
            stream.once('error', onError);
            stream.stderr.once('error', onError);
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
