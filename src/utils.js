"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectSSH2Client = connectSSH2Client;
exports.execSHH2Command = execSHH2Command;
function connectSSH2Client(client, cn) {
    return new Promise((resolve, reject) => {
        client.once('ready', () => resolve(client));
        client.once('error', err => reject(err));
        client.connect(cn);
    });
}
function execSHH2Command(client, cmd, output) {
    return new Promise((resolve, reject) => {
        client.exec(cmd, (err, stream) => {
            if (err) {
                reject(err);
                return;
            }
            stream.once('close', () => resolve());
            stream.on('data', (chunk) => output(undefined, chunk));
            stream.stderr.on('data', (chunk) => output(chunk, undefined));
        });
    });
}
