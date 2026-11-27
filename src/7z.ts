import {spawn} from 'child_process';
import {path7z} from '7z-bin';

/**
 * Options to be passed into `zipOptions`.
 */
export interface I7zipOptions {
    /**
     * Compression level:
     * 1 - fastest
     * 5 - default
     * 9 - ultra
     */
    compression?: number;

    /**
     * Sets password on the archive.
     */
    password?: string;
}

/**
 * Compresses a folder into a 7z file as specified in the path,
 * and resolves with the number of files in the new archive.
 *
 * @private
 *
 * @param srcDir
 * @param zipPath
 * @param opt
 */
export function pack7z(srcDir: string, zipPath: string, opt?: I7zipOptions): Promise<{ count: number }> {
    return new Promise((resolve, reject) => {
        const commands = ['a'];
        let count = 0;
        if (opt?.compression) {
            commands.push(`-mx${opt?.compression}`);
        }
        if (opt?.password) {
            commands.push(`-p${opt.password}`);
        }
        const proc = spawn(path7z, [...commands, zipPath, patch7zDir(srcDir)], {windowsHide: true});
        const removeListeners = () => {
            proc.off('error', onError);
            proc.stderr.off('error', onError);
            proc.off('close', onClose);
            proc.stdout.off('data', onData);
        };
        const onError = (err: Error) => {
            removeListeners();
            reject(err);
        };
        proc.once('error', onError);
        proc.stderr.once('error', onError);
        const onClose = (code: number | null) => {
            removeListeners();
            switch (code) {
                case 0:
                    resolve({count});
                    break;
                case null:
                    reject(new Error(`7-zip process terminated abnormally`));
                    break;
                default:
                    reject(new Error(`7-zip process exited with code ${code}`));
                    break;
            }
        };
        const onData = (chunk: Buffer) => {
            const m = chunk.toString().match(/(\d+)\s+files/);
            if (m) {
                count = parseInt(m[1]);
            }
        };
        proc.once('close', onClose);
        proc.stdout.on('data', onData);
    });
}

/**
 * 7z caveat is that it makes the last folder in the source directory
 * the top directory inside the archive, which we do not want, as we
 * want it to be consistent with how zip compression works.
 *
 * In order to avoid it, the directory needs to end with `/*`.
 * This function makes sure, in a safe way, that it is always the case.
 *
 * @private
 */
export function patch7zDir(dir: string) {
    return dir.replace(/[\\\/*]*$/, '/*');
}
