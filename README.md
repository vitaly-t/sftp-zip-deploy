# sftp-zip-deploy

[![Build Status](https://github.com/vitaly-t/sftp-zip-deploy/actions/workflows/ci.yml/badge.svg)](https://github.com/vitaly-t/sftp-zip-deploy/actions/workflows/ci.yml)
[![Node Version](https://img.shields.io/badge/nodejs-%2026-green.svg?logo=node.js&style=flat)](https://nodejs.org)

Fast and efficient way to auto-deploy your project to a server:

- It zips your distribution folder and sends the archive to your server via SFTP
- It supports remote commands for before / after zip deployment, via SSH2
- It provides detailed data about what is going on all the way

**IMPORTANT:**

This library relies on NodeJS-native support for SSH2 and ZIP, and therefore requires Node v26 or newer.

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
    zipFile: {
        name: 'release.zip', // set custom name for the archive
        dir: './' // we can change where zip is created
    },
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

* [onZipReady] - notifies when zip is ready
* [onFilter] - to let you filter files inside distribution folder
* [onCmdOutput] - to get all output from remote commands

[onZipReady]:https://github.com/vitaly-t/sftp-zip-deploy/blob/main/src/config.ts#L67
[onFilter]:https://github.com/vitaly-t/sftp-zip-deploy/blob/main/src/config.ts#L61
[onCmdOutput]:https://github.com/vitaly-t/sftp-zip-deploy/blob/main/src/config.ts#L84

[ISftpZipDeployConfig]:https://github.com/vitaly-t/sftp-zip-deploy/blob/main/src/config.ts#L6

## Tips

Because this library uses the latest ZIP functionality from Node, you may get this warning in the console:

> ExperimentalWarning: The zlib ZIP archive API is an experimental feature and might change at any time

You can suppress it by adding `--no-warnings=ExperimentalWarning=9820` to your node script command.
