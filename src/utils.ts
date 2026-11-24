import SftpClient from 'ssh2-sftp-client';
import {Client as SSH2Client} from 'ssh2';

export function executeCommand(sftp: SftpClient, cmd: string, output: (err?: Buffer, std?: Buffer) => void): Promise<void> {
    const client = (sftp as any).client as SSH2Client; // overriding ssh2-sftp-client (see issue #595 there)
    if (client?.constructor?.name !== 'Client') {
        // because as per #595, the author refuses to make the underlying SSH2 client available;
        // so we run explicit check for SSH2 layer compatibility here.
        throw new Error(`Compatibility issue with "ssh2-sftp-client" version`);
    }
    return new Promise((resolve, reject) => {
        client.exec(cmd, (err, stream) => {
            if (err) {
                return reject(err);
            }
            const removeListeners = () => {
                stream.off('close', onClose);
                stream.off('error', onError);
                stream.off('data', onData);
                stream.stderr.off('error', onError);
                stream.stderr.off('data', onErrorData);
                stream.stdin.off('data', onInputData);
            };
            const onError = (err: any) => {
                removeListeners();
                reject(err);
            };
            const onClose = (code: number) => {
                removeListeners();
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
            };
            stream.once('close', onClose);
            const onInputData = (chunk: Buffer) => {
                // For some reason, input can be received without any prompt on the server
                // onError(new Error(`Command "${cmd}" triggerred input prompt.${chunk.toString()}`));
            };
            stream.stdin.once('data', onInputData);
            stream.once('error', onError);
            stream.stderr.once('error', onError);
            const onData = (chunk: Buffer) => {
                output(undefined, chunk);
            };
            const onErrorData = (chunk: Buffer) => {
                output(chunk, undefined);
            };
            stream.on('data', onData);
            stream.stderr.on('data', onErrorData);
        });
    });
}

/**
 * Fixes Windows paths, by replacing every '\' with '/'
 */
export function fixWindowsPath(path: string): string {
    return path.replace(/\\/g, '/');
}
