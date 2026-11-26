# sftp-zip-deploy

[![Build Status](https://github.com/vitaly-t/sftp-zip-deploy/actions/workflows/ci.yml/badge.svg)](https://github.com/vitaly-t/sftp-zip-deploy/actions/workflows/ci.yml)
[![Node Version](https://img.shields.io/badge/nodejs-22%20--%2026-green.svg?logo=node.js&style=flat)](https://nodejs.org)

Fast single-zip deployment over SFTP for your project's distribution folder:

- It zips your distribution folder and sends the archive to your server via SFTP
- It supports remote commands for before / after zip deployment, via SSH2
- It provides details about what is going on all the way

## Rationale

This library was created because file-by-file deployments over SFTP are too slow,
especially for large projects.

For example, my project that produced about 100 files for distribution, was taking about
4 minutes to re-deploy, while on 1Gbt Internet. Switching over to this single-zip deployment
brought the time to under 10 seconds.

## Install

```
npm i sftp-zip-deploy
```

## Usage

In the example below, we deploy a NodeJS project into `/root/web` on our remote server.

Once the zip file is deployed, we use `cmd.after` commands to set that folder as active, then unpack
the archive and install the project's dependencies.

```ts
import {zipAndDeploy} from 'sftp-zip-deploy';

await zipAndDeploy({
    srcDir: './dist', // local folder with content to deploy
    destDir: '/root/web/', // remote folder to copy our zip file
    cn: {
        host: '1.2.3.4',
        port: 123,
        username: 'root',
        password: '#########'
    },
    // Settings below are optional
    zipFile: './release.zip', // this is the default
    cmd: {
        // remote command to execute after zip deployment:
        after: 'cd /root/web && unzip -o release.zip && npm i'

        // it also supports "before" command 
    }
});
```

Note that we use option `-o` (overwrite) with `unzip`, because otherwise the command may prompt for input,
if files are already there, and this library doesn't work with remote prompts, it will just get stuck.

## API

The main interface [ISftpZipDeployConfig] has a number of options, including events for providing progress details:

* [onZipReady] - notifies when local zip file is ready
* [onZipDeployed] - notifies when zip file has been transferred
* [onCmdOutput] - gets output from all remote commands
* [onUploadStep] - tracks zip upload progress

Below is example of using the full potential of the events supported:

```ts
{
    onZipReady({localPath, size}) {
        const s = Math.round(size / 1024).toLocaleString();
        console.log(`Compressed: ${localPath} | ${s} KB`);
    },
    onZipDeployed({remotePath, size}) {
        const s = Math.round(size / 1024).toLocaleString();
        console.log(`Deployed: ${remotePath} | ${s} KB`);
    },
    onCmdOutput({err, std}) {
        const txt = (err || std)?.toString().trim();
        if (txt) {
            if (err) {
                console.error(txt); // err
            } else {
                console.log(txt); // std
            }
        }
    },
    // Upload steps are reported for every chunk, which is too much for
    // dumping into the console, so we throttle it to report once a second:
    onUploadStep: throttle(1000, ({percent, total}) => {
        const t = Math.round(total / 1024).toLocaleString();
        console.log(`${percent}% | ${t} KB`);
    })
}
```

<details>
<summary><b>See generic throttling helper</b></summary>

```ts
function throttle<T, R, A, B, C, D, E>(delay: number, fn: (this: T, p1: A, p2: B, p3: C, p4: D, p5: E) => R)
    : (this: T, p1?: A, p2?: B, p3?: C, p4?: D, p5?: E) => R;

function throttle(delay: number, fn: (this: any, ...a: any[]) => void) {
    let lastCall = 0;
    return function (this: any, ...args: any[]) {
        const now = Date.now();
        if (now - lastCall >= delay) {
            lastCall = now;
            fn.apply(this, args);
        }
    }
}
```

</details>

### 7-zip Archives

Passing in `zipFile` with `.7z` file extension automatically changes the compression to 7-zip.

7-zip compression is significantly faster and more efficient, often 60% better for text, source code
and documents than zip. The only downside, you may need to install 7z unpacking tools on the server,
while for zip it is a ubiquitous default.

For example, typical for Linux is `p7zip-full` package, and then you can use `7z x -y release.7z`
within `cmd.after`, where `-y` is to avoid input prompts.

[onZipReady]:https://github.com/vitaly-t/sftp-zip-deploy/blob/main/src/config.ts#L77
[onZipDeployed]:https://github.com/vitaly-t/sftp-zip-deploy/blob/main/src/config.ts#L94
[onCmdOutput]:https://github.com/vitaly-t/sftp-zip-deploy/blob/main/src/config.ts#L117
[onUploadStep]:https://github.com/vitaly-t/sftp-zip-deploy/blob/main/src/config.ts#L140
[ISftpZipDeployConfig]:https://github.com/vitaly-t/sftp-zip-deploy/blob/main/src/config.ts#L10
