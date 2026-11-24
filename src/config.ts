import {ConnectOptions} from 'ssh2-sftp-client';
import {ZipArchiveOptions} from 'zip-a-folder';

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
     *
     * If the path doesn't exist, it is created recursively.
     */
    srcDir: string;

    /**
     * Destination directory (on the remote server).
     *
     * If the path doesn't exist, it is created recursively.
     */
    destDir: string;

    /**
     * Optional local path + name for the local zip file.
     *
     * It defaults to './release.zip'
     */
    zipFile?: string;

    /**
     * Options to be passed into `zip-a-folder` library
     * when creating a zip archive.
     */
    zipOptions?: ZipArchiveOptions;

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
     * @param localPath
     * Path + name of the local zip file created.
     *
     * @param size
     * Size of the local zip file.
     */
    onZipReady?: (this: ISftpZipDeployConfig, localPath: string, size: number) => void;

    /**
     * Notification when zip file has been copied over via SFTP.
     *
     * @param remotePath
     * Path + name of the remote zip file copied.
     *
     * @param size
     * Size of the zip file transferred.
     */
    onZipDeployed?: (this: ISftpZipDeployConfig, remotePath: string, size: number) => void;

    /**
     * Notification of every output produced by a remote command.
     *
     * @param cmd
     * Command that produced the output.
     *
     * @param err
     * Set when the output was sent into StdErr, i.e. an error is reported.
     *
     * In most cases, when there is an issue, the command also returns
     * an error code, which makes the API throw an error.
     *
     * @param std
     * Set when normal/standard output is generated (not an error).
     */
    onCmdOutput?: (this: ISftpZipDeployConfig, cmd: string, err?: Buffer, std?: Buffer) => void;

    /**
     * Notification of the ZIP upload progress, reported for every chunk.
     *
     * @param percent
     * Completion percent (0 - 100%).
     *
     * @param total
     * Total number of bytes uploaded so far.
     */
    onUploadStep?: (this: ISftpZipDeployConfig, percent: number, total: number) => void;
}
