export interface IZipDeployStart {
    files: string[];
    zipPath: string;
    zipSize: number;
}

export interface IZipDeployEnd {
    files: string[];
    duration: number;
}

export interface ISftpZipDeployConfig {
    /**
     * Connection parameters.
     */
    cn: {
        host: string;
        port: number;
        user: string;
        password: string;
    }

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

    onStart?: (files: string[]) => void;
    onEnd?: (files: string[]) => void;
    onError?: (err: Error) => void;
}
