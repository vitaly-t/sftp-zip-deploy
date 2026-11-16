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
     * Source directory.
     */
    srcDir: string;

    /**
     * Destination directory.
     */
    destDir: string;

    /**
     * Optional path for the zip file.
     */
    zipPath?: string;

    /**
     * Optional remote commands to run before or after zip file has been copied over.
     */
    commands?: {
        before?: string | string[],
        after?: string | string[]
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
