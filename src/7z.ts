import {spawn} from 'child_process';
import {path7z} from '7z-bin';

/**
 * Options to be passed into `zipOptions`.
 */
export interface I7zipOptions {
    /**
     * Compression level (1 - 9):
     * 1 - fastest
     * 5 - default
     * 9 - ultra
     */
    compression?: number;

    /**
     * Sets password on the archive.
     */
    password?: string;

    /**
     * Tracks archiving progress, in percent.
     */
    onProgress?: (percent: number) => void;
}

/**
 * Compresses a folder into a 7-zip file as specified in the path,
 * and resolves with the number of files in the new archive.
 *
 * @internal
 */
export function pack7z(srcDir: string, zipPath: string, opt?: I7zipOptions): Promise<{ count: number }> {
    return new Promise((resolve, reject) => {
        const args = ['a'];
        let count = 0;
        if (opt?.compression) {
            args.push(`-mx${opt?.compression}`);
        }
        if (opt?.password) {
            args.push(`-p${opt.password}`);
        }
        const tracking = typeof opt?.onProgress === 'function';
        if (tracking) {
            args.push('-aoa', '-bsp1');
        }
        args.push(zipPath, patch7zDir(srcDir)); // the last arguments
        let lastProgress = 0;
        const notifyProgress = (percent: number) => {
            lastProgress = percent;
            opt?.onProgress?.(percent);
        };
        const proc = spawn(path7z, args, {windowsHide: true});
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
                    if (tracking && lastProgress < 100) {
                        notifyProgress(100);
                    }
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
            const s = chunk.toString().trim();
            const m = s.match(/(\d+)\s+files/);
            if (m) {
                count = parseInt(m[1]);
            }
            if (tracking) {
                const a = s.match(/^(\d+)%\s/);
                if (a) {
                    notifyProgress(parseInt(a[1]));
                }
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
 * @internal
 */
export function patch7zDir(dir: string) {
    return dir.replace(/[\\\/*]*$/, '/*');
}
