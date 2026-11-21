import {ConnectOptions} from 'ssh2-sftp-client';

/**
 * Configuration structure, to be passed into `zipAndDeploy`.
 */
export interface ISftpZipDeployConfig {
    /**
     * Connection parameters.
     */
    cn: ConnectOptions;

    /**
     * Source directory (on the local machine).
     */
    srcDir: string;

    /**
     * Destination directory (on the remote server).
     */
    destDir: string;

    /**
     * Optional path to the local zip file.
     *
     * It defaults to './release.zip'
     */
    zipFile?: string;

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
         *
         * It is skipped, if no zip was deployed (no files found).
         */
        after?: string
    }

    /**
     * Notification when zip file has been built, and we are ready
     * to start its transfer, passing local zip file + size.
     */
    onZipReady?: (localZip: string, size: number) => void;

    /**
     * Notification when zip file has been copied over via SFTP,
     * passing remote zip file path + size.
     */
    onZipDeployed?: (remoteZip: string, size: number) => void;

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
    onCmdOutput?: (cmd: string, err?: Buffer, std?: Buffer) => void;
}
