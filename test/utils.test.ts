import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {mkdtemp, mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {Client as SSH2Client} from 'ssh2';
import SftpClient from 'ssh2-sftp-client';
import {EventEmitter} from 'node:events';
import {executeCommand, fixWindowsPath} from '../dist/utils.js';
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

type CommandStream = EventEmitter & {
    stderr: EventEmitter;
    stdin: EventEmitter;
};

class MockSftp extends EventEmitter {
    client?: MockSSH;
    connectCalls = 0;
    existsResult: string | false = 'd';
    existsCalls: string[] = [];
    mkdirCalls: Array<[string, boolean | undefined]> = [];
    fastPutCalls: Array<[string, string, FastPutOptions]> = [];
    endCalls = 0;

    async connect(): Promise<void> {
        this.connectCalls++;
    }

    async exists(remote: string): Promise<string | false> {
        this.existsCalls.push(remote);
        return this.existsResult;
    }

    async mkdir(remote: string, recursive?: boolean): Promise<string> {
        this.mkdirCalls.push([remote, recursive]);
        return remote;
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

class MockSSH extends SSH2Client {
    commands: string[] = [];

    constructor() {
        super();
        // executeCommand checks client.constructor.name, so expose the ssh2
        // Client constructor while keeping the mock's exec implementation.
        Object.defineProperty(this, 'constructor', {value: SSH2Client});
        Object.defineProperty(this, 'exec', {
            configurable: true,
            writable: true,
            value: (command: string, callback: (err: Error | undefined, stream: CommandStream) => void): this => {
                this.commands.push(command);
                const stream = makeCommandStream();
                callback(undefined, stream);
                stream.emit('data', Buffer.from(command));
                stream.stderr.emit('data', Buffer.from(`${command} stderr`));
                stream.emit('close', 0);
                return this;
            }
        });
    }
}

function makeCommandStream(): CommandStream {
    return Object.assign(new EventEmitter(), {
        stderr: new EventEmitter(),
        stdin: new EventEmitter()
    });
}

function mockClientMethods(sftp: MockSftp, ssh: MockSSH): () => void {
    const overrides: Array<[object, string, PropertyDescriptor | undefined]> = [];
    const replace = (prototype: object, key: string, value: (...args: any[]) => any) => {
        overrides.push([prototype, key, Object.getOwnPropertyDescriptor(prototype, key)]);
        Object.defineProperty(prototype, key, {configurable: true, value});
    };

    replace(SftpClient.prototype, 'connect', sftp.connect.bind(sftp));
    replace(SftpClient.prototype, 'exists', sftp.exists.bind(sftp));
    replace(SftpClient.prototype, 'mkdir', sftp.mkdir.bind(sftp));
    replace(SftpClient.prototype, 'fastPut', sftp.fastPut.bind(sftp));
    replace(SftpClient.prototype, 'end', sftp.end.bind(sftp));

    // Direct executeCommand unit tests use MockSftp; the integration-style
    // zipAndDeploy tests use the real SftpClient, whose underlying SSH2
    // client's exec method is replaced below.
    sftp.client = ssh;
    replace(SSH2Client.prototype, 'exec', ssh.exec.bind(ssh));

    return () => {
        sftp.client = undefined;
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

test('executeCommand forwards stdout and stderr and resolves on exit code zero', async () => {
    const ssh = new MockSSH();
    let stream: CommandStream;
    ssh.exec = ((_command: string, callback: (err: Error | undefined, stream: CommandStream) => void) => {
        stream = makeCommandStream();
        callback(undefined, stream);
        stream.emit('data', Buffer.from('standard output'));
        stream.stderr.emit('data', Buffer.from('error output'));
        stream.emit('close', 0);
        return ssh;
    }) as typeof ssh.exec;

    const sftp = new MockSftp();
    const restore = mockClientMethods(sftp, ssh);
    try {
        const output: Array<[Buffer | undefined, Buffer | undefined]> = [];
        await executeCommand(sftp as unknown as SftpClient, 'echo test', (err, std) => output.push([err, std]));
        assert.deepEqual(output, [
            [undefined, Buffer.from('standard output')],
            [Buffer.from('error output'), undefined]
        ]);
        assert.equal(stream!.listenerCount('close'), 0);
        assert.equal(stream!.listenerCount('error'), 0);
        assert.equal(stream!.stderr.listenerCount('error'), 0);
        assert.equal(stream!.stderr.listenerCount('data'), 0);
        assert.equal(stream!.stdin.listenerCount('data'), 0);
    } finally {
        restore();
    }
});

test('executeCommand rejects exec errors', async () => {
    const ssh = new MockSSH();
    ssh.exec = ((_command: string, callback: (err: Error | undefined, stream: CommandStream) => void) => {
        callback(new Error('exec failed'), makeCommandStream());
        return ssh;
    }) as typeof ssh.exec;

    const sftp = new MockSftp();
    const restore = mockClientMethods(sftp, ssh);
    try {
        await assert.rejects(
            executeCommand(sftp as unknown as SftpClient, 'bad command', () => undefined),
            /exec failed/
        );
    } finally {
        restore();
    }
});

test('executeCommand rejects stream errors and removes listeners', async () => {
    const ssh = new MockSSH();
    let stream: CommandStream;
    ssh.exec = ((_command: string, callback: (err: Error | undefined, stream: CommandStream) => void) => {
        stream = makeCommandStream();
        callback(undefined, stream);
        stream.emit('error', new Error('stream failed'));
        return ssh;
    }) as typeof ssh.exec;

    const sftp = new MockSftp();
    const restore = mockClientMethods(sftp, ssh);
    try {
        await assert.rejects(
            executeCommand(sftp as unknown as SftpClient, 'bad command', () => undefined),
            /stream failed/
        );
        assert.equal(stream!.listenerCount('close'), 0);
        assert.equal(stream!.listenerCount('error'), 0);
        assert.equal(stream!.stderr.listenerCount('error'), 0);
        assert.equal(stream!.stderr.listenerCount('data'), 0);
        assert.equal(stream!.stdin.listenerCount('data'), 0);
    } finally {
        restore();
    }
});

test('executeCommand rejects stderr errors', async () => {
    const ssh = new MockSSH();
    ssh.exec = ((_command: string, callback: (err: Error | undefined, stream: CommandStream) => void) => {
        const stream = makeCommandStream();
        callback(undefined, stream);
        stream.stderr.emit('error', new Error('stderr failed'));
        return ssh;
    }) as typeof ssh.exec;

    const sftp = new MockSftp();
    const restore = mockClientMethods(sftp, ssh);
    try {
        await assert.rejects(
            executeCommand(sftp as unknown as SftpClient, 'bad command', () => undefined),
            /stderr failed/
        );
    } finally {
        restore();
    }
});

test('executeCommand rejects abnormal and non-zero exit codes', async (t) => {
    await t.test('abnormal termination', async () => {
        const ssh = new MockSSH();
        ssh.exec = ((_command: string, callback: (err: Error | undefined, stream: CommandStream) => void) => {
            const stream = makeCommandStream();
            callback(undefined, stream);
            stream.emit('close', undefined);
            return ssh;
        }) as typeof ssh.exec;

        const sftp = new MockSftp();
        const restore = mockClientMethods(sftp, ssh);
        try {
            await assert.rejects(
                executeCommand(sftp as unknown as SftpClient, 'whoami', () => undefined),
                /Command "whoami" terminated abnormally/
            );
        } finally {
            restore();
        }
    });

    await t.test('non-zero exit code', async () => {
        const ssh = new MockSSH();
        ssh.exec = ((_command: string, callback: (err: Error | undefined, stream: CommandStream) => void) => {
            const stream = makeCommandStream();
            callback(undefined, stream);
            stream.emit('close', 23);
            return ssh;
        }) as typeof ssh.exec;

        const sftp = new MockSftp();
        const restore = mockClientMethods(sftp, ssh);
        try {
            await assert.rejects(
                executeCommand(sftp as unknown as SftpClient, 'exit 23', () => undefined),
                /Command "exit 23" exited with code 23/
            );
        } finally {
            restore();
        }
    });
});

test('executeCommand rejects incompatible ssh2-sftp-client versions', () => {
    const sftp = new MockSftp();
    assert.throws(
        () => executeCommand(sftp as unknown as SftpClient, 'uname', () => undefined),
        /Compatibility issue with "ssh2-sftp-client" version/
    );
});

test('zipAndDeploy creates an archive, creates a missing remote directory, and reports callbacks and summary', async (t) => {
    const {root, dir, zip} = await fixture();
    t.after(() => rm(root, {recursive: true, force: true}));

    const sftp = new MockSftp();
    sftp.existsResult = false;
    const ssh = new MockSSH();
    t.after(mockClientMethods(sftp, ssh));

    let ready: [string, number] | undefined;
    let deployed: [string, number] | undefined;
    const uploadSteps: Array<[number, number]> = [];

    const summary = await zipAndDeploy({
        cn: {host: 'example.test', username: 'deploy'},
        srcDir: dir,
        destDir: '/srv/app\\dist',
        zipFile: zip,
        onZipReady: ({localPath, size}) => ready = [localPath, size],
        onZipDeployed: ({remotePath, size}) => deployed = [remotePath, size],
        onUploadStep: ({percent, total}) => uploadSteps.push([percent, total])
    });

    const archive = await readFile(zip);
    const archiveSize = (await stat(zip)).size;

    assert.equal(archive.subarray(0, 4).toString('hex'), '504b0304');
    assert.deepEqual(ready, [zip, archiveSize]);
    assert.deepEqual(deployed, ['/srv/app/dist/release.zip', archiveSize]);
    assert.deepEqual(summary, {
        zip: {path: zip, files: 2, size: archiveSize, type: 'zip'},
        srcDir: dir,
        destPath: '/srv/app/dist/release.zip',
        duration: summary.duration
    });
    assert.ok(Number.isFinite(summary.duration));
    assert.ok(summary.duration >= 0);
    assert.equal(sftp.connectCalls, 1);
    assert.deepEqual(sftp.existsCalls, ['/srv/app/dist']);
    assert.deepEqual(sftp.mkdirCalls, [['/srv/app/dist', true]]);
    assert.deepEqual(sftp.fastPutCalls.map(([local, remote, {chunkSize}]) => [local, remote, {chunkSize}]), [
        [zip, '/srv/app/dist/release.zip', {chunkSize: 131072}]
    ]);
    assert.equal(typeof sftp.fastPutCalls[0][2].step, 'function');
    assert.deepEqual(uploadSteps, [[25, 1], [100, 4]]);
    assert.equal(sftp.endCalls, 1);
});

test('zipAndDeploy executes before/after commands and forwards command output', async (t) => {
    const {root, dir, zip} = await fixture();
    t.after(() => rm(root, {recursive: true, force: true}));

    const sftp = new MockSftp();
    const ssh = new MockSSH();
    t.after(mockClientMethods(sftp, ssh));

    const output: Array<[string, Buffer | undefined, Buffer | undefined]> = [];
    await zipAndDeploy({
        cn: {host: 'example.test', username: 'deploy'},
        srcDir: dir,
        destDir: '/srv/app',
        zipFile: zip,
        cmd: {before: 'echo before', after: 'echo after'},
        onCmdOutput: ({cmd, err, std}) => output.push([cmd, err, std])
    });

    assert.deepEqual(ssh.commands, ['echo before', 'echo after']);
    assert.equal(sftp.connectCalls, 1);
    assert.deepEqual(output, [
        ['echo before', undefined, Buffer.from('echo before')],
        ['echo before', Buffer.from('echo before stderr'), undefined],
        ['echo after', undefined, Buffer.from('echo after')],
        ['echo after', Buffer.from('echo after stderr'), undefined]
    ]);
    assert.deepEqual(sftp.existsCalls, ['/srv/app']);
    assert.deepEqual(sftp.mkdirCalls, []);
    assert.equal(sftp.endCalls, 1);
});

test('zipAndDeploy uses release.zip and closes the SFTP client', async (t) => {
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
});
