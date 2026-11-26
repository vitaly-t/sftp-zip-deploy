import assert from 'node:assert/strict';
import test from 'node:test';
import {patch7zDir} from '../dist/7z.js';

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
