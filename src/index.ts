import {ISftpZipDeployConfig} from './config.js';
import SftpClient from 'ssh2-sftp-client';
import {Client as SSH2Client} from 'ssh2';
import {stat} from 'node:fs/promises';
import {connectSSH2Client, execSSH2Command} from './utils.js';
import {zip} from 'zip-a-folder';
import * as path from 'node:path';

export {ISftpZipDeployConfig} from './config.js';
export type {ConnectOptions} from 'ssh2-sftp-client';

/**
 * From the configuration object, it implements the following steps:
 *
 * 1. Executes `cmd.before` commands, if such were specified
 * 2. Enumerates all files inside `srcDir`, plus filters them via `onFilter` (if specified)
 * 3. Produces zip file with all the resulting files and triggers `onZipReady` (if specified)
 * 4. Uploads zip file to the remote machine
 * 5. Executes `cmd.after` commands, if such were specified (and zip was actually deployed).
 * 6. Resolves with `true`, if at least one file was found and zip was created + deployed,
 *    or `false` otherwise (i.e. it does not create an empty zip)
 */
export async function zipAndDeploy(cfg: ISftpZipDeployConfig): Promise<void> {
    const sftp = new SftpClient();
    const ssh2 = new SSH2Client();
    const {before = '', after = ''} = cfg.cmd ?? {};
    try {
        if (before || after) {
            await connectSSH2Client(ssh2, cfg.cn);
        }
        if (before) {
            await execSSH2Command(ssh2, before, (err, std) => cfg.onCmdOutput?.(before, err, std));
        }
        const zipPath = cfg.zipFile || './release.zip';
        await zip(cfg.srcDir, zipPath);
        const {size: zipSize} = await stat(zipPath);
        cfg.onZipReady?.(zipPath, zipSize);
        const remotePath = path.join(cfg.destDir, path.basename(zipPath)).replace(/\\/g, '/');
        await sftp.connect(cfg.cn);
        await sftp.put(zipPath, remotePath);
        cfg.onZipDeployed?.(remotePath, zipSize);
        if (after) {
            await execSSH2Command(ssh2, after, (err, std) => cfg.onCmdOutput?.(after, err, std));
        }
    } finally {
        await sftp.end();
        ssh2.end();
    }
}

await zipAndDeploy({
    srcDir: './dist', // local folder with content to deploy
    destDir: '/root/web/', // remote folder to copy our zip file
    cn: {
        host: '69.48.191.37',
        port: 7822,
        username: 'root',
        password: '694b54a95c724624'
    },
    // Settings below are optional
    cmd: {
        // remote command to execute after zip deployment:
        after: 'cd /root/web && unzip -o release.zip'

        // also supports "before" command
    },
    onZipReady(file: string, size: number) {
        console.log('Zip Ready:', file, size);
    },
    onCmdOutput(cmd, err, std,) {
        const msg = (err || std || '').toString().trim();
        console.log(msg);
    }
});
