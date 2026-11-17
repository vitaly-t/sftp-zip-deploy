import {ISftpZipDeployConfig} from './config.js';
import SftpClient from 'ssh2-sftp-client';
import {Client as SSH2Client} from 'ssh2';
import {connectSSH2Client, execSSH2Command, fixWindowsPath, zipFiles} from './utils.js';
import {globSync} from 'glob';
import path from 'node:path';

export {IZipDetails, ISftpZipDeployConfig} from './config.js';
export {default as ConnectOptions} from 'ssh2-sftp-client';

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

    const ssh2Client = new SSH2Client();
    const {before = '', after = ''} = cfg.cmd ?? {};

    if (before || after) {
        await connectSSH2Client(ssh2Client, cfg.cn);
    }
    if (before) {
        await execSSH2Command(ssh2Client, before, (err, std) => cfg.onCmdOutput?.(before, err, std));
    }

    let files = globSync('**/{*.*,*}', {cwd: cfg.srcDir, nodir: true, dot: true})
        .map(f => fixWindowsPath(f));

    if (typeof cfg.onFilter === 'function') {
        files = files.filter(cfg.onFilter);
    }

    if (files.length > 0) {
        const zipFileDir = cfg.zipFile?.dir ?? './';
        const zipFileName = cfg.zipFile?.name ?? 'release.zip';

        const zipLocalPath = fixWindowsPath(path.join(zipFileDir, zipFileName));
        const zipRemotePath = fixWindowsPath(path.join(cfg.destDir, zipFileName));

        const zipSize = await zipFiles(cfg.srcDir, files, zipLocalPath);
        cfg.onZipReady?.({files, zipLocalPath, zipRemotePath, zipSize});

        const sftp = new SftpClient();
        await sftp.connect(cfg.cn);
        await sftp.put(zipLocalPath, zipRemotePath);
        await sftp.end();

        if (after) {
            await execSSH2Command(ssh2Client, after, (err, std) => cfg.onCmdOutput?.(after, err, std));
        }
    }
    ssh2Client.end();
    return files.length > 0;
}
