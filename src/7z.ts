import {spawn} from 'child_process';
import {path7za} from '7zip-bin';

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
 * Compresses a folder into a 7z file as specified in the path.
 *
 * @private
 *
 * @param srcDir
 * @param zipPath
 * @param opt
 */
export function pack7z(srcDir: string, zipPath: string, opt?: I7zipOptions): Promise<void> {
    return new Promise((resolve, reject) => {
        const commands = ['a'];
        if (opt?.compression) {
            commands.push(`-mx${opt?.compression}`);
        }
        if (opt?.password) {
            commands.push(`-p${opt.password}`);
        }
        const proc = spawn(path7za, [...commands, zipPath, patch7zDir(srcDir)], {windowsHide: true});
        proc.on('error', (err: any) => {
            reject(err);
        });
        proc.on('close', (code: number) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`7zip process exited with code ${code}`));
            }
        });
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
