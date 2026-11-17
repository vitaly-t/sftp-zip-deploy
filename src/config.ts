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
     * Optional name + location of the local zip file.
     *
     * It defaults to {dir: './', name: 'release.zip'},
     * to create it in the root of your project.
     */
    zipFile?: {
        /**
         * Local directory where zip file is to be created.
         * Default is './'
         */
        dir?: string,
        /**
         * Name for the local zip file. Default is 'release.zip'
         */
        name?: string
    };

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
     * Optional filter on file enumeration (found in `srcDir`),
     * returning:
     *
     *  - true for files to be added;
     *  - false for files to be skipped.
     */
    onFilter?: (file: string) => boolean;

    /**
     * Notification when zip file has been built,
     * and we are ready to start its transfer.
     */
    onZipReady?: (zd: IZipDetails) => void;

    /**
     * Notification of every output produced by a remote command.
     *
     * @param cmd
     * Command that produced an output.
     *
     * @param err
     * Set when the output was sent into StdErr, i.e. an error is reported.
     *
     * @param std
     * Set when normal/standard output is generated (not an error).
     */
    onCmdOutput?: (cmd: string, err?: Buffer, std?: Buffer) => void;
}

/**
 * For use with onZipReady event.
 */
export interface IZipDetails {
    /**
     * All files placed into zip.
     */
    files: string[];

    /**
     * Local path to the zip file.
     */
    zipLocalPath: string;

    /**
     * Remote path to the zip file.
     */
    zipRemotePath: string;

    /**
     * Zip file size, in bytes.
     */
    zipSize: number;
}
