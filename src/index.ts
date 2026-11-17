import {ISftpZipDeployConfig} from './config.js';
import SftpClient from 'ssh2-sftp-client';
import {Client as SSH2Client} from 'ssh2';
import {connectSSH2Client, execSSH2Command, fixWindowsPath, zipFiles} from './utils.js';
import {glob} from 'glob';
import path from 'node:path';

export {IZipDetails, ISftpZipDeployConfig} from './config.js';
export type {ConnectOptions} from 'ssh2-sftp-client';

/**
 * From the configuration object, it implements the following steps:
 *
 * 1. Executes `cmd.before` commands, if such were specified
 * 2. Enumerates all files inside `srcDir`, plus filters them via `onFilter` (if used)
 * 3. Produces zip file with all the resulting files and triggers `onZipReady` (if used)
 * 4. Uploads zip file to the remote machine
 * 5. Executes `cmd.after` commands, if such were specified, and zip was actually deployed.
 * 6. Resolves with `true`, if at least one file was found and zip was created,
 *    or `false` otherwise (i.e. it does not create an empty zip)
 */
export async function zipAndDeploy(cfg: ISftpZipDeployConfig): Promise<boolean> {

    const sftp = new SftpClient();
    const ssh2 = new SSH2Client();
    const {before = '', after = ''} = cfg.cmd ?? {};
    let hasFiles = false;

    try {
        if (before || after) {
            await connectSSH2Client(ssh2, cfg.cn);
        }
        if (before) {
            await execSSH2Command(ssh2, before, (err, std) => cfg.onCmdOutput?.(before, err, std));
        }

        let files = await glob('**/{*.*,*}', {cwd: cfg.srcDir, nodir: true, dot: true})
            .then(a => a.map(f => fixWindowsPath(f)));

        if (typeof cfg.onFilter === 'function') {
            files = files.filter(cfg.onFilter);
        }

        hasFiles = files.length > 0;

        if (hasFiles) {
            const zipFileDir = cfg.zipFile?.dir ?? './';
            const zipFileName = cfg.zipFile?.name ?? 'release.zip';

            const zipLocalPath = fixWindowsPath(path.join(zipFileDir, zipFileName));
            const zipRemotePath = fixWindowsPath(path.join(cfg.destDir, zipFileName));

            const zipSize = await zipFiles(cfg.srcDir, files, {dir: zipFileDir, name: zipFileName});
            cfg.onZipReady?.({files, zipLocalPath, zipRemotePath, zipSize});

            await sftp.connect(cfg.cn);
            await sftp.put(zipLocalPath, zipRemotePath);

            if (after) {
                await execSSH2Command(ssh2, after, (err, std) => cfg.onCmdOutput?.(after, err, std));
            }
        }
    } finally {
        await sftp.end();
        ssh2.end();
    }

    return hasFiles;
}
