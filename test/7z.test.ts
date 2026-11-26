import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {mkdtemp, mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import SftpClient from 'ssh2-sftp-client';
import {pack7z, patch7zDir} from '../dist/7z.js';
import {zipAndDeploy, type ZipType} from '../dist/index.js';

async function fixture(): Promise<{ root: string; dir: string; archive: string }> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sftp-zip-deploy-7z-'));
    const dir = path.join(root, 'source');
    const archive = path.join(root, 'release.7z');
    await mkdir(path.join(dir, 'nested'), {recursive: true});
    await writeFile(path.join(dir, 'hello.txt'), 'Hello, 7z!');
    await writeFile(path.join(dir, 'nested', 'data.json'), '{"ok":true}');
    return {root, dir, archive};
}

type FastPutOptions = {
    chunkSize: number;
    step?: (totalTransferred: number, chunk: number, total: number) => void;
};

class MockSftp {
    connectCalls = 0;
    existsCalls: string[] = [];
    mkdirCalls: Array<[string, boolean | undefined]> = [];
    fastPutCalls: Array<[string, string, FastPutOptions]> = [];
    endCalls = 0;

    async connect(): Promise<void> {
        this.connectCalls++;
    }

    async exists(remote: string): Promise<string | false> {
        this.existsCalls.push(remote);
        return 'd';
    }

    async mkdir(remote: string, recursive?: boolean): Promise<string> {
        this.mkdirCalls.push([remote, recursive]);
        return remote;
    }

    async fastPut(local: string, remote: string, options: FastPutOptions): Promise<void> {
        this.fastPutCalls.push([local, remote, options]);
        options.step?.(2, 2, 4);
        options.step?.(4, 2, 4);
    }

    async end(): Promise<void> {
        this.endCalls++;
    }
}

function mockSftp(sftp: MockSftp): () => void {
    const prototypes = [
        ['connect', sftp.connect.bind(sftp)],
        ['exists', sftp.exists.bind(sftp)],
        ['mkdir', sftp.mkdir.bind(sftp)],
        ['fastPut', sftp.fastPut.bind(sftp)],
        ['end', sftp.end.bind(sftp)]
    ] as const;
    const descriptors = prototypes.map(([key]) => [key, Object.getOwnPropertyDescriptor(SftpClient.prototype, key)] as const);

    for (const [key, value] of prototypes) {
        Object.defineProperty(SftpClient.prototype, key, {configurable: true, value});
    }

    return () => {
        for (const [key, descriptor] of descriptors) {
            if (descriptor) {
                Object.defineProperty(SftpClient.prototype, key, descriptor);
            } else {
                delete (SftpClient.prototype as unknown as Record<string, unknown>)[key];
            }
        }
    };
}

test('patch7zDir ensures the path ends with /*', () => {
    const cases: Array<[string, string]> = [
        ['folder', 'folder/*'],
        ['folder/', 'folder/*'],
        ['folder\\', 'folder/*'],
        ['folder/*', 'folder/*'],
        ['folder*', 'folder/*'],
        ['folder///\\**', 'folder/*'],
        ['folder/*/child', 'folder/*/child/*'],
        ['', '/*']
    ];

    for (const [input, expected] of cases) {
        const actual = patch7zDir(input);
        assert.equal(actual, expected, `patch7zDir(${JSON.stringify(input)})`);
        assert.ok(actual.endsWith('/*'), `Expected ${JSON.stringify(actual)} to end with /*`);
    }
});

test('pack7z creates a real 7z archive with compression and password options', async (t) => {
    const {root, dir, archive} = await fixture();
    t.after(() => rm(root, {recursive: true, force: true}));

    await pack7z(dir, archive, {compression: 9, password: 'test-password'});

    const bytes = await readFile(archive);
    const size = (await stat(archive)).size;
    assert.ok(size > 0);
    assert.equal(bytes.subarray(0, 6).toString('hex'), '377abcaf271c');
});

test('zipAndDeploy creates, uploads, and reports a 7z archive', async (t) => {
    const {root, dir, archive} = await fixture();
    t.after(() => rm(root, {recursive: true, force: true}));

    const sftp = new MockSftp();
    const restore = mockSftp(sftp);
    t.after(restore);

    let ready: { localPath: string; size: number; zt: ZipType } | undefined;
    let deployed: { remotePath: string; size: number; zt: ZipType } | undefined;
    const uploadSteps: Array<{ percent: number; total: number; zt: ZipType }> = [];

    await zipAndDeploy({
        cn: {host: 'example.test', username: 'deploy'},
        srcDir: dir,
        destDir: '/srv/app',
        zipFile: archive,
        zipOptions: {compression: 9, password: 'test-password'},
        onZipReady: params => ready = params,
        onZipDeployed: params => deployed = params,
        onUploadStep: params => uploadSteps.push(params)
    });

    const bytes = await readFile(archive);
    const archiveSize = (await stat(archive)).size;
    assert.equal(bytes.subarray(0, 6).toString('hex'), '377abcaf271c');
    assert.deepEqual(ready, {localPath: archive, size: archiveSize, zt: '7z'});
    assert.deepEqual(deployed, {remotePath: '/srv/app/release.7z', size: archiveSize, zt: '7z'});
    assert.equal(sftp.connectCalls, 1);
    assert.deepEqual(sftp.existsCalls, ['/srv/app']);
    assert.deepEqual(sftp.fastPutCalls.map(([local, remote, {chunkSize}]) => [local, remote, {chunkSize}]), [
        [archive, '/srv/app/release.7z', {chunkSize: 131072}]
    ]);
    assert.equal(typeof sftp.fastPutCalls[0][2].step, 'function');
    assert.deepEqual(uploadSteps, [
        {percent: 50, total: 2, zt: '7z'},
        {percent: 100, total: 4, zt: '7z'}
    ]);
    assert.equal(sftp.endCalls, 1);
});
