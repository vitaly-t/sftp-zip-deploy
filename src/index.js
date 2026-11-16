"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectOptions = void 0;
exports.zipAndDeploy = zipAndDeploy;
const ssh2_sftp_client_1 = __importDefault(require("ssh2-sftp-client"));
const ssh2_1 = require("ssh2");
const utils_1 = require("./utils");
const node_zlib_1 = require("node:zlib");
const node_fs_1 = require("node:fs");
const glob_1 = require("glob");
const promises_1 = require("node:fs/promises");
const promises_2 = require("node:stream/promises");
var ssh2_sftp_client_2 = require("ssh2-sftp-client");
Object.defineProperty(exports, "ConnectOptions", { enumerable: true, get: function () { return __importDefault(ssh2_sftp_client_2).default; } });
async function zipAndDeploy(cfg) {
    const ac = cfg.commands?.after ?? [];
    const afterCommands = (Array.isArray(ac) ? ac : [ac]);
    const bc = cfg.commands?.before ?? [];
    const beforeCommands = (Array.isArray(bc) ? bc : [bc]);
    const ssh2Client = new ssh2_1.Client();
    if (ac.length > 0 || bc.length > 0) {
        await (0, utils_1.connectSSH2Client)(ssh2Client, cfg.cn);
        for (const c of beforeCommands) {
            await (0, utils_1.execSHH2Command)(ssh2Client, c, (err, std) => {
                if (typeof cfg.onCmdOutput === 'function') {
                    cfg.onCmdOutput(c, err, std);
                }
            });
        }
    }
    let allFiles = (0, glob_1.globSync)('**/{*.*,.*}', { cwd: cfg.srcDir })
        .map(f => f.replace(/\\/g, '/'));
    if (typeof cfg.onFilter === 'function') {
        allFiles = allFiles.filter(cfg.onFilter);
    }
    if (allFiles.length === 0) {
        return false;
    }
    const entries = [];
    for (const src of allFiles) {
        entries.push(await node_zlib_1.ZipEntry.create(src, await (0, promises_1.readFile)(src)));
    }
    const archive = (0, node_zlib_1.createZipArchive)(entries);
    const ws = (0, node_fs_1.createWriteStream)('release.zip');
    await (0, promises_2.pipeline)(archive, ws);
    const sftp = new ssh2_sftp_client_1.default();
    await sftp.connect(cfg.cn);
    const p = `${cfg.destDir}/release.zip`;
    await sftp.put('release.zip', p);
    await sftp.end();
    for (const c of afterCommands) {
        await (0, utils_1.execSHH2Command)(ssh2Client, c, (err, std) => {
            if (typeof cfg.onCmdOutput === 'function') {
                cfg.onCmdOutput(c, err, std);
            }
        });
    }
    ssh2Client.end();
    return true;
}
(async function main() {
    const start = Date.now();
    await zipAndDeploy({
        srcDir: './src',
        destDir: '/root/web/',
        cn: {
            host: '69.48.191.37',
            port: 7822,
            username: 'root',
            password: '694b54a95c724624'
        }
    });
    console.log(`Finished in: ${Date.now() - start} ms`);
})();
