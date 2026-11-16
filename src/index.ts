import {ISftpZipDeployConfig} from './config';
import SftpClient from 'ssh2-sftp-client';
import {Client as SSH2Client} from 'ssh2';
import {connectSSH2Client, execSHH2Command} from './utils';
import {createZipArchive, ZipEntry} from 'node:zlib';
import {createWriteStream} from 'node:fs';
import {globSync} from 'glob';
import {readFile} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';

export {default as ConnectOptions} from 'ssh2-sftp-client';

export async function zipAndDeploy(cfg: ISftpZipDeployConfig): Promise<boolean> {

    const ac = cfg.commands?.after ?? [];
    const afterCommands = (Array.isArray(ac) ? ac : [ac]);
    const bc = cfg.commands?.before ?? [];
    const beforeCommands = (Array.isArray(bc) ? bc : [bc]);

    const ssh2Client = new SSH2Client();

    if (ac.length > 0 || bc.length > 0) {
        await connectSSH2Client(ssh2Client, cfg.cn);
        for (const c of beforeCommands) {
            await execSHH2Command(ssh2Client, c, (err, std) => {
                if (typeof cfg.onCmdOutput === 'function') {
                    cfg.onCmdOutput(c, err, std);
                }
            });
        }
    }

    let allFiles = globSync('**/{*.*,.*}', {cwd: cfg.srcDir})
        .map(f => f.replace(/\\/g, '/'));

    if (typeof cfg.onFilter === 'function') {
        allFiles = allFiles.filter(cfg.onFilter);
    }

    if (allFiles.length === 0) {
        return false; // nothing to deploy
    }

    const entries: ZipEntry[] = [];
    for (const src of allFiles) {
        entries.push(await ZipEntry.create(src, await readFile(src)));
    }

    const archive = createZipArchive(entries);
    const ws = createWriteStream('release.zip');
    await pipeline(archive, ws);

    const sftp = new SftpClient();
    await sftp.connect(cfg.cn);

    const p = `${cfg.destDir}/release.zip`;
    await sftp.put('release.zip', p);

    await sftp.end();

    for (const c of afterCommands) {
        await execSHH2Command(ssh2Client, c, (err, std) => {
            if (typeof cfg.onCmdOutput === 'function') {
                cfg.onCmdOutput(c, err, std);
            }
        });
    }

    ssh2Client.end();
    return true;
}

