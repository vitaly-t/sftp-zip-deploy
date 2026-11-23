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
npm i sftp-zip-deploy --save-dev
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

        // also supports "before" command 
    }
});
```

Note that we use option `-o` (overwrite) with `unzip`, because otherwise the command may prompt for input,
if files are already there, and this library does not deal with remote prompts, it will just get stuck.
So avoid running commands that may trigger an input prompt.

## API

The main interface [ISftpZipDeployConfig] has a number of options, including events for providing progress details:

* [onZipReady] - notifies when local zip file is ready
* [onZipDeployed] - notifies when zip file has been transferred
* [onCmdOutput] - gets output from all remote commands

[onZipReady]:https://github.com/vitaly-t/sftp-zip-deploy/blob/main/src/config.ts#L60
[onZipDeployed]:https://github.com/vitaly-t/sftp-zip-deploy/blob/main/src/config.ts#L71
[onCmdOutput]:https://github.com/vitaly-t/sftp-zip-deploy/blob/main/src/config.ts#L88

[ISftpZipDeployConfig]:https://github.com/vitaly-t/sftp-zip-deploy/blob/main/src/config.ts#L6
