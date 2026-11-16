import {ConnectOptions} from 'ssh2-sftp-client';

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
         */
        dir?: string,
        /**
         * Name for the local zip file.
         */
        name?: string
    };

    /**
     * Optional command to execute before and/or after deploying zip file.
     */
    cmd?: {
        before?: string,
        after?: string
    }

    /**
     * Optional filter on file enumeration, returning:
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
     */
    onCmdOutput?: (cmd: string, err?: Buffer, std?: Buffer) => void;
}
