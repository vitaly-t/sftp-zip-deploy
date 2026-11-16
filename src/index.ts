import {ISftpZipDeployConfig} from './config.js';
import SftpClient from 'ssh2-sftp-client';
import {Client as SSH2Client} from 'ssh2';
import {connectSSH2Client, execSHH2Command, fixWindowsPath, zipFiles} from './utils.js';
import {globSync} from 'glob';
import path from 'node:path';

export {IZipDetails, ISftpZipDeployConfig} from './config.js';
export {ConnectOptions} from 'ssh2-sftp-client';

export async function zipAndDeploy(cfg: ISftpZipDeployConfig): Promise<boolean> {

    const ssh2Client = new SSH2Client();
    const {before = '', after = ''} = cfg.cmd ?? {};

    if (before || after) {
        await connectSSH2Client(ssh2Client, cfg.cn);
        await execSHH2Command(ssh2Client, before, (err, std) => cfg.onCmdOutput?.(before, err, std));
    }

    let files = globSync('**/{*.*,.*}', {cwd: cfg.srcDir})
        .map(f => fixWindowsPath(f));

    if (typeof cfg.onFilter === 'function') {
        files = files.filter(cfg.onFilter);
    }

    const zipFileDir = cfg.zipFile?.dir ?? './';
    const zipFileName = cfg.zipFile?.name ?? 'release.zip';

    const zipLocalPath = fixWindowsPath(path.join(zipFileDir, zipFileName));
    const zipRemotePath = fixWindowsPath(path.join(cfg.destDir, zipFileName));

    const zipSize = await zipFiles(cfg.srcDir, files, zipLocalPath);
    cfg.onZipReady?.({files, zipLocalPath, zipRemotePath, zipSize});

    const sftp = new SftpClient();
    await sftp.connect(cfg.cn);

    await sftp.put(zipLocalPath, zipRemotePath);

    if (after) {
        await execSHH2Command(ssh2Client, after, (err, std) => cfg.onCmdOutput?.(after, err, std));
    }

    await sftp.end();
    ssh2Client.end();

    return files.length > 0;
}
