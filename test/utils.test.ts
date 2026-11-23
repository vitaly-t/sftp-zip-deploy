import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {mkdtemp, mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {Client as SSH2Client} from 'ssh2';
import SftpClient from 'ssh2-sftp-client';
import {EventEmitter} from 'node:events';
import {fixWindowsPath} from '../dist/utils.js';
import {zipAndDeploy} from '../dist/index.js';

async function fixture(): Promise<{ root: string; dir: string; zip: string }> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sftp-zip-deploy-'));
    const dir = path.join(root, 'source');
    const zip = path.join(root, 'release.zip');
    await mkdir(path.join(dir, 'nested'), {recursive: true});
    await writeFile(path.join(dir, 'hello.txt'), 'Hello, ZIP!');
    await writeFile(path.join(dir, 'nested', 'data.json'), '{"ok":true}');
    return {root, dir, zip};
}

type FastPutOptions = {
    chunkSize: number;
    step?: (totalTransferred: number, chunk: number, total: number) => void;
};

class MockSftp extends EventEmitter {
    connectCalls = 0;
    fastPutCalls: Array<[string, string, FastPutOptions]> = [];
    endCalls = 0;

    async connect(): Promise<void> {
        this.connectCalls++;
    }

    async fastPut(local: string, remote: string, options: FastPutOptions): Promise<void> {
        this.fastPutCalls.push([local, remote, options]);
        options.step?.(1, 1, 4);
        options.step?.(4, 3, 4);
    }

    async end(): Promise<void> {
        this.endCalls++;
    }
}

class MockSSH extends EventEmitter {
    connectCalls = 0;
    commands: string[] = [];
    endCalls = 0;

    exec(command: string, callback: (err: Error | undefined, stream: EventEmitter & {
        stderr: EventEmitter
    }) => void): void {
        this.commands.push(command);
        const stream = Object.assign(new EventEmitter(), {stderr: new EventEmitter()});
        callback(undefined, stream);
        // The helper installs stream listeners in the callback. Emit only after
        // that callback returns, without relying on runtime-specific scheduling.
        stream.emit('data', Buffer.from(command));
        stream.emit('close', 0);
    }

    end(): this {
        this.endCalls++;
        return this;
    }
}

function mockClientMethods(sftp: MockSftp, ssh: MockSSH): () => void {
    const overrides: Array<[object, string, PropertyDescriptor | undefined]> = [];
    const replace = (prototype: object, key: string, value: (...args: any[]) => any) => {
        overrides.push([prototype, key, Object.getOwnPropertyDescriptor(prototype, key)]);
        Object.defineProperty(prototype, key, {configurable: true, value});
    };

    replace(SftpClient.prototype, 'connect', sftp.connect.bind(sftp));
    replace(SftpClient.prototype, 'fastPut', sftp.fastPut.bind(sftp));
    replace(SftpClient.prototype, 'end', sftp.end.bind(sftp));
    replace(SSH2Client.prototype, 'connect', function (this: SSH2Client) {
        ssh.connectCalls++;
        // connectSSH2Client attaches its listener before calling connect.
        this.emit('ready');
        return this;
    });
    replace(SSH2Client.prototype, 'exec', ssh.exec.bind(ssh));
    replace(SSH2Client.prototype, 'end', ssh.end.bind(ssh));

    return () => {
        for (const [prototype, key, descriptor] of overrides.reverse()) {
            if (descriptor) {
                Object.defineProperty(prototype, key, descriptor);
            } else {
                delete (prototype as Record<string, unknown>)[key];
            }
        }
    };
}

test('fixWindowsPath replaces Windows path separators', () => {
    assert.equal(fixWindowsPath('C:\\deploy\\app\\release.zip'), 'C:/deploy/app/release.zip');
    assert.equal(fixWindowsPath('/srv/app\\dist'), '/srv/app/dist');
    assert.equal(fixWindowsPath('\\\\server\\share\\folder'), '//server/share/folder');
});

test('fixWindowsPath preserves already-normalized paths', () => {
    assert.equal(fixWindowsPath('/srv/app/dist'), '/srv/app/dist');
    assert.equal(fixWindowsPath('./release.zip'), './release.zip');
    assert.equal(fixWindowsPath(''), '');
});

test('zipAndDeploy creates an archive and reports ready/deployed callbacks', async (t) => {
    const {root, dir, zip} = await fixture();
    t.after(() => rm(root, {recursive: true, force: true}));

    const sftp = new MockSftp();
    const ssh = new MockSSH();
    t.after(mockClientMethods(sftp, ssh));

    let ready: [string, number] | undefined;
    let deployed: [string, number] | undefined;
    const uploadSteps: Array<[number, number]> = [];

    await zipAndDeploy({
        cn: {host: 'example.test', username: 'deploy'},
        srcDir: dir,
        destDir: '/srv/app\\dist',
        zipFile: zip,
        onZipReady: (localPath, size) => ready = [localPath, size],
        onZipDeployed: (remotePath, size) => deployed = [remotePath, size],
        onUploadStep: (percent, total) => uploadSteps.push([percent, total])
    });

    const archive = await readFile(zip);
    const archiveSize = (await stat(zip)).size;

    assert.equal(archive.subarray(0, 4).toString('hex'), '504b0304');
    assert.deepEqual(ready, [zip, archiveSize]);
    assert.deepEqual(deployed, ['/srv/app/dist/release.zip', archiveSize]);
    assert.equal(sftp.connectCalls, 1);
    assert.deepEqual(sftp.fastPutCalls.map(([local, remote, {chunkSize}]) => [local, remote, {chunkSize}]), [
        [zip, '/srv/app/dist/release.zip', {chunkSize: 131072}]
    ]);
    assert.equal(typeof sftp.fastPutCalls[0][2].step, 'function');
    assert.deepEqual(uploadSteps, [[25, 4], [100, 4]]);
    assert.equal(sftp.endCalls, 1);
    assert.equal(ssh.endCalls, 1);
});

test('zipAndDeploy executes before/after commands and forwards command output', async (t) => {
    const {root, dir, zip} = await fixture();
    t.after(() => rm(root, {recursive: true, force: true}));

    const sftp = new MockSftp();
    const ssh = new MockSSH();
    t.after(mockClientMethods(sftp, ssh));

    const output: string[] = [];
    await zipAndDeploy({
        cn: {host: 'example.test', username: 'deploy'},
        srcDir: dir,
        destDir: '/srv/app',
        zipFile: zip,
        cmd: {before: 'echo before', after: 'echo after'},
        onCmdOutput: (cmd) => output.push(cmd)
    });

    assert.deepEqual(ssh.commands, ['echo before', 'echo after']);
    assert.equal(ssh.connectCalls, 1);
    assert.deepEqual(output, ['echo before', 'echo after']);
    assert.equal(sftp.endCalls, 1);
    assert.equal(ssh.endCalls, 1);
});

test('zipAndDeploy uses release.zip and closes both clients', async (t) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sftp-zip-default-'));
    const dir = path.join(root, 'source');
    const originalCwd = process.cwd();
    await mkdir(dir);
    await writeFile(path.join(dir, 'hello.txt'), 'hello');
    process.chdir(root);
    t.after(async () => {
        process.chdir(originalCwd);
        await rm(root, {recursive: true, force: true});
    });

    const sftp = new MockSftp();
    const ssh = new MockSSH();
    t.after(mockClientMethods(sftp, ssh));

    await zipAndDeploy({
        cn: {host: 'example.test', username: 'deploy'},
        srcDir: dir,
        destDir: '/deploy'
    });

    assert.deepEqual(sftp.fastPutCalls.map(([local, remote, {chunkSize}]) => [local, remote, {chunkSize}]), [
        ['./release.zip', '/deploy/release.zip', {chunkSize: 131072}]
    ]);
    assert.equal(typeof sftp.fastPutCalls[0][2].step, 'function');
    assert.equal(sftp.endCalls, 1);
    assert.equal(ssh.endCalls, 1);
});
