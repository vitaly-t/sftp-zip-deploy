import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {mkdtemp, mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {Client as SSH2Client} from 'ssh2';
import SftpClient from 'ssh2-sftp-client';
import {EventEmitter} from 'node:events';
import {zipAndDeploy} from '../src/index.js';

async function fixture(): Promise<{dir: string; zip: string}> {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sftp-zip-deploy-'));
    await mkdir(path.join(dir, 'nested'));
    await writeFile(path.join(dir, 'hello.txt'), 'Hello, ZIP!');
    await writeFile(path.join(dir, 'nested', 'data.json'), '{"ok":true}');
    return {dir, zip: path.join(dir, 'release.zip')};
}

class MockSftp extends EventEmitter {
    connectCalls = 0;
    putCalls: Array<[string, string]> = [];
    endCalls = 0;

    async connect(): Promise<void> {
        this.connectCalls++;
    }

    async put(local: string, remote: string): Promise<void> {
        this.putCalls.push([local, remote]);
    }

    async end(): Promise<void> {
        this.endCalls++;
    }
}

class MockSSH extends EventEmitter {
    connectCalls = 0;
    commands: string[] = [];
    endCalls = 0;

    connect(): this {
        this.connectCalls++;
        queueMicrotask(() => this.emit('ready'));
        return this;
    }

    exec(command: string, callback: (err: Error | undefined, stream: EventEmitter) => void): void {
        this.commands.push(command);
        const stream = new EventEmitter();
        callback(undefined, stream);
        queueMicrotask(() => {
            stream.emit('data', Buffer.from(command));
            stream.emit('close', 0);
        });
    }

    end(): this {
        this.endCalls++;
        return this;
    }
}

function mockConstructors(sftp: MockSftp, ssh: MockSSH): () => void {
    const oldSftp = SftpClient;
    const oldSSH = SSH2Client;
    Object.setPrototypeOf(SftpClient, function(): MockSftp { return sftp; });
    Object.setPrototypeOf(SSH2Client, function(): MockSSH { return ssh; });
    return () => {
        Object.setPrototypeOf(SftpClient, oldSftp);
        Object.setPrototypeOf(SSH2Client, oldSSH);
    };
}

test('zipAndDeploy creates an archive and reports ready/deployed callbacks', async (t) => {
    const {dir, zip} = await fixture();
    t.after(() => rm(dir, {recursive: true, force: true}));

    const sftp = new MockSftp();
    const ssh = new MockSSH();
    const restore = mockConstructors(sftp, ssh);
    t.after(restore);

    let ready: [string, number] | undefined;
    let deployed: [string, number] | undefined;

    await zipAndDeploy({
        cn: {host: 'example.test', username: 'deploy'},
        srcDir: dir,
        destDir: '/srv/app\\dist',
        zipFile: zip,
        onZipReady: (localPath, size) => ready = [localPath, size],
        onZipDeployed: (remotePath, size) => deployed = [remotePath, size]
    });

    const archive = await readFile(zip);
    const archiveSize = (await stat(zip)).size;

    assert.equal(archive.subarray(0, 4).toString('hex'), '504b0304');
    assert.equal(ready?.[0], zip);
    assert.equal(ready?.[1], archiveSize);
    assert.equal(deployed?.[0], '/srv/app/dist/release.zip');
    assert.equal(deployed?.[1], archiveSize);
    assert.equal(sftp.connectCalls, 1);
    assert.deepEqual(sftp.putCalls, [[zip, '/srv/app/dist/release.zip']]);
    assert.equal(sftp.endCalls, 1);
    assert.equal(ssh.endCalls, 1);
    assert.ok(archive.byteLength > 0);
});

test('zipAndDeploy executes before/after commands and forwards command output', async (t) => {
    const {dir, zip} = await fixture();
    t.after(() => rm(dir, {recursive: true, force: true}));

    const sftp = new MockSftp();
    const ssh = new MockSSH();
    const restore = mockConstructors(sftp, ssh);
    t.after(restore);

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

test('zipAndDeploy uses release.zip and always closes both clients', async (t) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sftp-zip-default-'));
    const originalCwd = process.cwd();
    t.after(async () => {
        process.chdir(originalCwd);
        await rm(dir, {recursive: true, force: true});
        await rm(path.join(originalCwd, 'release.zip'), {force: true});
    });

    await writeFile(path.join(dir, 'hello.txt'), 'hello');
    process.chdir(dir);

    const sftp = new MockSftp();
    const ssh = new MockSSH();
    const restore = mockConstructors(sftp, ssh);
    t.after(restore);

    await zipAndDeploy({
        cn: {host: 'example.test', username: 'deploy'},
        srcDir: dir,
        destDir: '/deploy'
    });

    assert.equal(sftp.putCalls[0][0], './release.zip');
    assert.equal(sftp.putCalls[0][1], '/deploy/release.zip');
    assert.equal(sftp.endCalls, 1);
    assert.equal(ssh.endCalls, 1);
});
