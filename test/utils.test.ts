import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fixWindowsPath, zipFiles} from '../src/utils.ts';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';

test('fixWindowsPath replaces every backslash and preserves forward slashes', () => {
    assert.equal(fixWindowsPath('C:\\Users\\alice\\project\\file.txt'), 'C:/Users/alice/project/file.txt');
    assert.equal(fixWindowsPath('folder/subfolder/file.txt'), 'folder/subfolder/file.txt');
    assert.equal(fixWindowsPath('mixed\\path/with\\both'), 'mixed/path/with/both');
    assert.equal(fixWindowsPath(''), '');
});

test('zipFiles creates an archive containing the requested files and reports its size', async t => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sftp-zip-deploy-'));
    t.after(() => rm(dir, {recursive: true, force: true}));

    await writeFile(path.join(dir, 'hello.txt'), 'Hello, ZIP!');
    await writeFile(path.join(dir, 'nested.json'), '{"ok":true}');
    const archivePath = path.join(dir, 'files.zip');

    const reportedSize = await zipFiles(dir, ['hello.txt', 'nested.json'], archivePath);
    const archive = await readFile(archivePath);

    assert.equal(reportedSize, archive.byteLength);
    assert.ok(reportedSize > 0);
    assert.deepEqual(archive.subarray(0, 4), Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    assert.notEqual(archive.indexOf(Buffer.from('hello.txt')), -1);
    assert.notEqual(archive.indexOf(Buffer.from('nested.json')), -1);
});

test('zipFiles rejects when a requested input file does not exist', async t => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sftp-zip-deploy-'));
    t.after(() => rm(dir, {recursive: true, force: true}));

    await assert.rejects(zipFiles(dir, ['missing.txt'], path.join(dir, 'files.zip')), {
        code: 'ENOENT'
    });
});
