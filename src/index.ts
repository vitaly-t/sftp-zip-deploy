import {ISftpZipDeployConfig} from './config.js';
import SftpClient from 'ssh2-sftp-client';
import {Client as SSH2Client} from 'ssh2';
import {stat} from 'node:fs/promises';
import {connectSSH2Client, execSSH2Command} from './utils.js';
import {zip} from 'zip-a-folder';
import path from 'node:path';

export {ISftpZipDeployConfig} from './config.js';
export type {ConnectOptions} from 'ssh2-sftp-client';

/**
 * From the configuration object, it implements the following steps:
 *
 * 1. Executes `cmd.before` command (via SSH2), if such was specified
 * 2. Zips content of `srcDir` and triggers `onZipReady` (if specified)
 * 3. Uploads zip file to the remote machine (via SFTP) and triggers `onZipDeployed` (if specified)
 * 4. Executes `cmd.after` command (via SSH2), if such was specified
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
        const {size} = await stat(zipPath);
        cfg.onZipReady?.(zipPath, size);
        const remotePath = path.posix.join(cfg.destDir, path.basename(zipPath));
        await sftp.connect(cfg.cn);
        await sftp.put(zipPath, remotePath);
        cfg.onZipDeployed?.(remotePath, size);
        if (after) {
            await execSSH2Command(ssh2, after, (err, std) => cfg.onCmdOutput?.(after, err, std));
        }
    } finally {
        await sftp.end();
        ssh2.end();
    }
}
