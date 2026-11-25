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

export function pack7z(srcDir: string, zipPath: string, opt?: I7zipOptions): Promise<void> {
    return new Promise((resolve, reject) => {
        const src = srcDir.replace(/[\\\/*]*$/, '/*');
        const commands = ['a'];
        if (opt?.compression) {
            commands.push(`-mx${opt?.compression}`);
        }
        if (opt?.password) {
            commands.push(`-p${opt.password}`);
        }
        const proc = spawn(path7za, [...commands, zipPath, src], {windowsHide: true});
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
