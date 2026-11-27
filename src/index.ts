import {ISftpZipDeployConfig, IZipDeploySummary, ZipType} from './types.js';
import SftpClient from 'ssh2-sftp-client';
import {stat, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {executeCommand, fixWindowsPath} from './utils.js';
import {zip, ZipArchiveOptions} from 'zip-a-folder';
import {I7zipOptions, pack7z} from './7z.js';

export {I7zipOptions} from './7z.js';
export {ISftpZipDeployConfig, ZipType} from './types.js';
export type {ConnectOptions} from 'ssh2-sftp-client';

// Best all-around (131072 / 128 KB).
// Recommended by Files.com and ExaVault as the safest starting point
// to boost throughput without hitting server buffer caps:
const chunkSize = 131072;

// Check for 7z file extension used in zipFile,
// so we switch the compression engine to 7z:
const is_7z = (s: string) =>
    s.trim().toLowerCase().endsWith('.7z');

/**
 * From the configuration object, it implements the following steps:
 *
 * 1. Executes `cmd.before` command (via SSH2), if such was specified
 * 2. Archives content of `srcDir` and triggers `onZipReady` (if specified)
 * 3. Uploads archive file to the remote machine (via SFTP) and triggers `onZipDeployed` (if specified)
 * 4. Executes `cmd.after` command (via SSH2), if such was specified
 */
export async function zipAndDeploy(cfg: ISftpZipDeployConfig): Promise<IZipDeploySummary> {
    const start = Date.now();
    const sftp = new SftpClient();
    const {before = '', after = ''} = cfg.cmd ?? {};
    const zipPath = cfg.zipFile || './release.zip';
    const zt: ZipType = is_7z(zipPath) ? '7z' : 'zip';
    try {
        await sftp.connect(cfg.cn);
        if (before) {
            await executeCommand(sftp, before, (err, std) => cfg.onCmdOutput?.call(cfg, {cmd: before, err, std, zt}));
        }
        await mkdir(path.dirname(zipPath), {recursive: true});
        let count = 0;
        if (zt === '7z') {
            count = (await pack7z(cfg.srcDir, zipPath, cfg.zipOptions as I7zipOptions)).count;
        } else {
            count = (await zip(cfg.srcDir, zipPath, cfg.zipOptions as ZipArchiveOptions)).count;
        }
        const {size} = await stat(zipPath);
        cfg.onZipReady?.call(cfg, {localPath: zipPath, count, size, zt});
        const remoteDir = fixWindowsPath(cfg.destDir);
        const zipName = path.posix.basename(fixWindowsPath(zipPath));
        const remotePath = path.posix.join(remoteDir, zipName);
        await sftp.exists(remoteDir).then(e => {
            if (!e) {
                return sftp.mkdir(remoteDir, true);
            }
        });
        await sftp.fastPut(zipPath, remotePath, {
            chunkSize,
            step(transferred: number, chunk: number, total: number) {
                const percent = total > 0
                    ? Math.min(100, parseFloat((100 * transferred / total).toFixed(2)))
                    : 0;
                cfg.onUploadStep?.call(cfg, {percent, total: transferred, zt});
            }
        });
        cfg.onZipDeployed?.call(cfg, {remotePath, size, zt});
        if (after) {
            await executeCommand(sftp, after, (err, std) => cfg.onCmdOutput?.call(cfg, {cmd: after, err, std, zt}));
        }
        return {
            zip: {
                path: zipPath,
                files: count,
                size,
                type: zt
            },
            srcDir: cfg.srcDir,
            destPath: remotePath,
            duration: parseFloat(((Date.now() - start) / 1000).toFixed(1))
        };
    } finally {
        await sftp.end();
    }
}
