interface IDeployArguments {

    /**
     * Search-file pattern override.
     */
    pattern: string;

    /**
     * To output all comm-s diagnostics into the console.
     */
    debug: boolean;

    /**
     * To pull the top-level list of files/folders from the server,
     * just to see what's there at the moment and check the connection.
     */
    list: boolean;

    /**
     * Commands to zip up everything and send one file to the server instead.
     */
    zip: boolean;

    /**
     * Installs dependencies after unpacking zip file.
     * Used only when `zip` option is set.
     */
    install: boolean;
}

const args: IDeployArguments = (function () {
    const a = getArguments(['pattern', 'debug', 'list', 'zip', 'install'], true);
    return {
        pattern: a.pattern,
        debug: isTruthyArg(a.debug),
        list: isTruthyArg(a.list),
        zip: isTruthyArg(a.zip),
        install: isTruthyArg(a.install)
    }
})();

// Helper to wrap ssh2's callback-based exec in a Promise
function runCommand(sftp: SftpClient, command: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
        (sftp as any).client.exec(command, (err: any, stream: any) => {
            if (err) return reject(err);
            let stdout = '';
            let stderr = '';
            stream
                .on('close', (code: any) => resolve({code, stdout, stderr}))
                .on('data', (data: Buffer) => {
                    stdout += data.toString();
                })
                .stderr.on('data', (data: any) => {
                stderr += data.toString();
            });
        });
    });
}

async function createClientConnection(): Promise<SftpClient> {
    console.log('Connecting to SFTP server...\n');
    const sftp = new SftpClient('piglet');
    const {SFTP_HOST, SFTP_PORT, SFTP_USER, SFTP_PWD} = process.env;
    await sftp.connect({
        host: SFTP_HOST,
        username: SFTP_USER,
        password: SFTP_PWD,
        port: parseInt(SFTP_PORT ?? ''),
        debug(message: string) {
            if (args.debug) {
                console.log(colors.gray(message));
            }
        }
    });
    return sftp;
}

const distPath = 'dist';
const distFolder = `./${distPath}`;
const remoteFolder = '/root/web/piglet';
const zipOutput = 'release.zip';

async function listContent(sftp: SftpClient) {
    const res = await sftp.list(remoteFolder)
        .then(data => {
            return data.sort((a, b) => a.type < b.type ? 1 : -1);
        });
    for (const a of res) {
        const size = (a.size / 1024).toFixed(2) + 'Kb';
        const updated = new Date(a.modifyTime).toLocaleString();
        if (a.type === 'd') {
            console.log(` • ${colors.green('/' + a.name)} | ${colors.yellow(size)} | ${colors.magenta(updated)}`);
        } else {
            console.log(` • ${colors.cyan(a.name)} | ${colors.yellow(size)} | ${colors.magenta(updated)}`);
        }
    }
}

async function deployFiles(sftp: SftpClient, files: string[]) {
    const fixPath = (p: string) => p.replace(/\\/g, '/');
    if (!args.zip) {
        console.log(`Starting to deploy ${files.length} file(s)...\n`);
    }
    const entries: ZipEntry[] = [];
    for (const [i, f] of files.entries()) {
        const src = fixPath(path.join(distFolder, f));
        if (args.zip) {
            const localPath = src.replace(`${distPath}/`, '');
            entries.push(await ZipEntry.create(localPath, await readFile(f)));
            continue;
        }
        const dest = fixPath(path.join(remoteFolder, f));
        const destFolder = path.dirname(dest);
        const exists = await sftp.exists(destFolder);
        if (!exists) {
            await sftp.mkdir(destFolder, true);
        }
        console.log(`${i + 1}. Copying ${colors.yellow(src)} to ${colors.cyan(dest)}`);
        await sftp.put(src, dest);
    }
    if (args.zip) {
        const archive = createZipArchive(entries);
        const ws = createWriteStream(zipOutput);
        await pipeline(archive, ws);
        const p = `${remoteFolder}/${zipOutput}`;
        await sftp.put(zipOutput, p);
        console.log(`Copied ${files.length} local files into remote archive:\n\t${colors.yellow(p)} | ${ws.bytesWritten.toLocaleString()} bytes`);
        let cmd = `cd ${remoteFolder} && unzip -o -q ${zipOutput}`;
        if (args.install) {
            cmd += ' && npm i';
        }
        console.log(`Running remote command:\n\t${colors.cyan(cmd)}`);
        await runCommand(sftp, cmd);
    }
}

// Search for a specified pattern or for all files by default:
const searchPattern = args.pattern || '**/{*.*,.*}';

const distFiles = globSync(searchPattern, {cwd: distFolder});

(async function runDeployment() {
    const start = Date.now();
    const client = await createClientConnection();
    if (args.list) {
        await listContent(client);
        console.log();
    } else {
        await deployFiles(client, distFiles);
        const duration = (Date.now() - start).toLocaleString();
        console.log(`Successfully deployed in ${duration} ms\n`);
    }
    await client.end();
})();
