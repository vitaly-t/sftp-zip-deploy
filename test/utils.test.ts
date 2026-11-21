import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {mkdtemp, mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {Client as SSH2Client} from 'ssh2';
import SftpClient from 'ssh2-sftp-client';
import {EventEmitter} from 'node:events';
import {zipAndDeploy} from '../dist/index.js';

async function fixture(): Promise<{root: string; dir: string; zip: string}> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sftp-zip-deploy-'));
    const dir = path.join(root, 'source');
    const zip = path.join(root, 'release.zip');
    await mkdir(path.join(dir, 'nested'), {recursive: true});
    await writeFile(path.join(dir, 'hello.txt'), 'Hello, ZIP!');
    await writeFile(path.join(dir, 'nested', 'data.json'), '{"ok":true}');
    return {root, dir, zip};
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
        setImmediate(() => this.emit('ready'));
        return this;
    }

    exec(command: string, callback: (err: Error | undefined, stream: EventEmitter & {stderr: EventEmitter}) => void): void {
        this.commands.push(command);
        const stream = Object.assign(new EventEmitter(), {stderr: new EventEmitter()});
        callback(undefined, stream);
        setImmediate(() => {
            stream.emit('data', Buffer.from(command));
            stream.emit('close', 0);
        });
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
    replace(SftpClient.prototype, 'put', sftp.put.bind(sftp));
    replace(SftpClient.prototype, 'end', sftp.end.bind(sftp));
    // The production code listens for events on its SSH2Client instance, so
    // emit `ready` on that instance rather than on the separate MockSSH object.
    replace(SSH2Client.prototype, 'connect', function(this: SSH2Client) {
        ssh.connectCalls++;
        setImmediate(() => this.emit('ready'));
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

test('zipAndDeploy creates an archive and reports ready/deployed callbacks', async (t) => {
    const {root, dir, zip} = await fixture();
    t.after(() => rm(root, {recursive: true, force: true}));

    const sftp = new MockSftp();
    const ssh = new MockSSH();
    t.after(mockClientMethods(sftp, ssh));

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
    assert.deepEqual(ready, [zip, archiveSize]);
    assert.deepEqual(deployed, ['/srv/app/dist/release.zip', archiveSize]);
    assert.equal(sftp.connectCalls, 1);
    assert.deepEqual(sftp.putCalls, [[zip, '/srv/app/dist/release.zip']]);
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

    assert.deepEqual(sftp.putCalls, [['./release.zip', '/deploy/release.zip']]);
    assert.equal(sftp.endCalls, 1);
    assert.equal(ssh.endCalls, 1);
});
