import {ISftpZipDeployConfig} from './config.js';
import SftpClient from 'ssh2-sftp-client';
import {stat, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {executeCommand, fixWindowsPath} from './utils.js';
import {zip} from 'zip-a-folder';

export {ISftpZipDeployConfig} from './config.js';
export type {ConnectOptions} from 'ssh2-sftp-client';

// Best all-around (131072 / 128 KB).
// Recommended by Files.com and ExaVault as the safest starting point
// to boost throughput without hitting server buffer caps:
const chunkSize = 131072;

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
    const {before = '', after = ''} = cfg.cmd ?? {};
    try {
        await sftp.connect(cfg.cn);
        if (before) {
            await executeCommand(sftp, before, (err, std) => cfg.onCmdOutput?.(before, err, std));
        }
        const zipPath = cfg.zipFile || './release.zip';
        await mkdir(path.dirname(zipPath), {recursive: true});
        await zip(cfg.srcDir, zipPath, cfg.zipOptions);
        const {size} = await stat(zipPath);
        cfg.onZipReady?.(zipPath, size);
        const remoteDir = fixWindowsPath(cfg.destDir);
        const zipName = path.posix.basename(fixWindowsPath(zipPath));
        const remotePath = path.posix.join(remoteDir, zipName);
        await sftp.fastPut(zipPath, remotePath, {
            chunkSize,
            step(totalTransferred: number, chunk: number, total: number) {
                const percent = parseFloat((100 * totalTransferred / total).toFixed(2));
                cfg.onUploadStep?.(percent, totalTransferred);
            }
        });
        cfg.onZipDeployed?.(remotePath, size);
        if (after) {
            await executeCommand(sftp, after, (err, std) => cfg.onCmdOutput?.(after, err, std));
        }
    } finally {
        await sftp.end();
    }
}
