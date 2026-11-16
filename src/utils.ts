import {Client as SSH2Client, ConnectConfig} from 'ssh2';

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
