test('executeCommand rejects abnormal and non-zero exit codes', async (t) => {
    await t.test('abnormal termination', async () => {
        const ssh = new MockSSH();
        ssh.exec = ((_command: string, callback: (err: Error | undefined, stream: CommandStream) => void) => {
            const stream = makeCommandStream();
            callback(undefined, stream);
            stream.emit('close', null);
            return ssh;
        }) as typeof ssh.exec;
