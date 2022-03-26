const API_SCIENTISST = 2;

const TIMEOUT_IN_SECONDS = 3;

const encoder = new TextEncoder();

export default class ScientISST {
    private port: SerialPort;

    constructor(port: SerialPort) {
        this.port = port;

    }

    async connect() {
        await this.port.open({ baudRate: 115200 });
        await this.changeAPI(API_SCIENTISST);
    }

    async disconnect() {
        await this.port.close();
    }

    async changeAPI(mode: number) {
        mode <<= 4
        mode |= 0b11

        await this.send(mode);
    }

    async version() {
        const cmd = "\x07";
        this.send(cmd);

        const result = await this.recv(1024);
        const decoder = new TextDecoder();
        const result_text = decoder.decode(result);
        const index = result_text.indexOf("\x00");
        return result_text.substring(0, index);
    }

    async start(fs: number,
        channels: Array<number>) {

        let chMask = 0

        channels.forEach(ch => {
            const mask = 1 << (ch - 1)
            chMask |= mask

        });

        //  Sample rate
        let sr = 0b01000011
        sr |= fs << 8
        await this.send(sr, 4)

        let cmd = 0x01
        cmd |= chMask << 8

        await this.send(cmd);

    }


    private async recv(length: number): Promise<Uint8Array> {
        const buffer = new Uint8Array(length);
        while (this.port.readable) {
            if (!this.port.readable.locked) {
                const reader = this.port.readable.getReader();
                let offset = 0;
                let done = false;
                while (true) {
                    try {
                        const result = await Promise.race<ReadableStreamDefaultReadResult<Uint8Array> | Error>([
                            reader.read(),
                            new Promise<Error>((_, reject) => setTimeout(reject, TIMEOUT_IN_SECONDS * 1000, new Error("timeout")))
                        ]);
                        done = (result as ReadableStreamDefaultReadResult<Uint8Array>).done;
                        console.log(done);
                        const value = (result as ReadableStreamDefaultReadResult<Uint8Array>).value;

                        if (value) {
                            if (offset + value.length <= buffer.length) {
                                buffer.set(value, offset);
                                offset += value.length;
                            } else {
                                buffer.set(value.subarray(0, buffer.length - offset), offset);
                                done = true;
                            }
                        }
                    } catch {
                        done = true;
                    }
                    if (done || buffer.length == length) {
                        await reader.cancel();
                        reader.releaseLock();
                        return buffer;
                    }
                }
            }
        }
        return buffer;
    }

    private async send(data: any, length: number = 1) {
        if (this.port.writable == null) {
            console.warn(`unable to find writable port`);
            return;
        }

        if (!this.port.writable.locked) {
            const writer = this.port.writable.getWriter();

            console.log(encoder.encode(data).toString());
            await writer.write(encoder.encode(data))

            // Allow the serial port to be closed later.
            writer.releaseLock();
        } else {
            console.log("port is locked");
        }
    }
}