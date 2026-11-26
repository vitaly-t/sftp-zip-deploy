import {ConnectOptions} from 'ssh2-sftp-client';
import {ZipArchiveOptions} from 'zip-a-folder';
import {I7zipOptions} from './7z.js';

export type ZipType = 'zip' | '7z';

/**
 * Configuration structure, to be passed into `zipAndDeploy`.
 */
export interface ISftpZipDeployConfig {
    /**
     * Connection parameters for SFTP + SSH2.
     */
    cn: ConnectOptions;

    /**
     * Source directory (on the local machine).
     * The property value cannot be empty.
     */
    srcDir: string;

    /**
     * Destination directory (on the remote server).
     * The property value cannot be empty.
     *
     * If the path doesn't exist, it is created recursively.
     */
    destDir: string;

    /**
     * Optional local path + name for the local zip file.
     * It defaults to './release.zip'
     *
     * If the file name ends with `.7z`, the compression engine
     * will automatically change to 7-zip.
     *
     * If the directory doesn't exist, it is created recursively.
     */
    zipFile?: string;

    /**
     * Options to be passed into `zip-a-folder` library
     * when creating a zip. It is not used for 7z.
     */
    zipOptions?: ZipArchiveOptions | I7zipOptions;

    /**
     * Optional commands to execute before / after deploying the zip file.
     */
    cmd?: {
        /**
         * Command(s) to be executed before creating zip file.
         */
        before?: string,
        /**
         * Command(s) to be executed after zip has been deployed.
         */
        after?: string
    }

    /**
     * Notification when zip file has been built, and we are ready
     * to start its transfer.
     *
     * @param params
     * Event parameters.
     *
     * @param params.localPath
     * Path + name of the local zip file created.
     *
     * @param params.size
     * Size of the local zip file.
     *
     * @param params.zt
     * Type of zip archive used: 'zip' or '7z'
     */
    onZipReady?: (this: ISftpZipDeployConfig, params: { localPath: string, size: number, zt: ZipType }) => void;

    /**
     * Notification when zip file has been copied over via SFTP.
     *
     * @param params
     * Event parameters.
     *
     * @param params.remotePath
     * Path + name of the remote zip file copied.
     *
     * @param params.size
     * Size of the zip file transferred.
     *
     * @param params.zt
     * Type of zip archive used: 'zip' or '7z'
     */
    onZipDeployed?: (this: ISftpZipDeployConfig, params: { remotePath: string, size: number, zt: ZipType }) => void;

    /**
     * Notification of every output produced by a remote command.
     *
     * @param params
     * Event parameters.
     *
     * @param params.cmd
     * Command that produced the output.
     *
     * @param params.err
     * Set when the output was sent into StdErr, i.e. an error is reported.
     *
     * In most cases, when there is an issue, the command also returns
     * an error code, which makes the API throw an error.
     *
     * @param params.std
     * Set when normal/standard output is generated (not an error).
     *
     * @param params.zt
     * Type of zip archive used: 'zip' or '7z'
     */
    onCmdOutput?: (this: ISftpZipDeployConfig, params: {
        cmd: string,
        err?: Buffer,
        std?: Buffer,
        zt: ZipType
    }) => void;

    /**
     * Notification of the ZIP upload progress, reported for every chunk.
     *
     * @param params
     * Event parameters.
     *
     * @param params.percent
     * Completion percent (0 - 100%).
     *
     * @param params.total
     * Total number of bytes uploaded so far.
     *
     * @param params.zt
     * Type of zip archive used: 'zip' or '7z'
     */
    onUploadStep?: (this: ISftpZipDeployConfig, params: { percent: number, total: number, zt: ZipType }) => void;
}
