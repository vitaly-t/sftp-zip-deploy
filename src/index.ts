import {ISftpZipDeployConfig} from './config.js';
import SftpClient from 'ssh2-sftp-client';
import {Client as SSH2Client} from 'ssh2';
import {connectSSH2Client, execSHH2Command, fixWindowsPath, zipFiles} from './utils.js';
import {globSync} from 'glob';

export {default as ConnectOptions} from 'ssh2-sftp-client';

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

    const zipSize = await zipFiles('./dist', files, 'release.zip');
    cfg.onZipReady?.({files: files, zipSize, zipLocalPath: '', zipRemotePath: ''});

    const sftp = new SftpClient();
    await sftp.connect(cfg.cn);

    const p = `${cfg.destDir}/release.zip`;
    await sftp.put('release.zip', p);

    if (after) {
        await execSHH2Command(ssh2Client, after, (err, std) => cfg.onCmdOutput?.(after, err, std));
    }

    await sftp.end();
    ssh2Client.end();

    return files.length > 0;
}
