import Frame from "./frame.js";
import EspAdcCalChars from "./esp_adc/esp_adc.js";

import { sleep, bytesArray } from './utils.js'

const API_SCIENTISST = 2;

const TIMEOUT_IN_MILLISECONDS = 3000;

const AI1 = 1;
const AI2 = 2;
const AI3 = 3;
const AI4 = 4;
const AI5 = 5;
const AI6 = 6;
const AX1 = 7;
const AX2 = 8;

const MAX_BUFFER_SIZE = 4096;

export default class ScientISST {
    #port;

    #packetSize = 0;
    #bytesToRead;
    #numFrames;

    #chs = [];
    #numChs = 0;

    connected = false;
    #connecting;

    live = false;

    #writer = null;

    #reader = null;
    #keepReading = true;
    #closedPromise = null;

    #recvBuffer = [];

    #adc1Chars;



    constructor(port) {
        this.#port = port;

        navigator.serial.addEventListener("connect", (event) => {
            console.log(event);
            this.connected = true;
        });

        navigator.serial.addEventListener("disconnect", (event) => {
            // If the serial port was opened, a stream error would be observed as well.
            console.log(event);
            this.connected = false;
        });
    }

    static async requestPort() {
        // Prompt user to select any serial port.
        const port = await navigator.serial.requestPort();

        return new ScientISST(port);
    }

    static checkCRC4(data, length) {
        const CRC4tab = [0, 3, 6, 5, 12, 15, 10, 9, 11, 8, 13, 14, 7, 4, 1, 2]
        let crc = 0;
        let b;
        for (let i = 0; i < length - 1; i++) {
            b = data[i];
            crc = CRC4tab[crc] ^ (b >> 4);
            crc = CRC4tab[crc] ^ (b & 0x0F);
        }

        crc = CRC4tab[crc] ^ (data[data.length - 1] >> 4);
        crc = CRC4tab[crc]

        return crc == (data[data.length - 1] & 0x0F);
    }

    async connect() {
        this.#connecting = true;
        await this.#port.open({ baudRate: 115200 });

        this.#writer = this.#port.writable.getWriter();
        this.#closedPromise = this.readUntilClosed();

        await this.changeAPI(API_SCIENTISST);
        await this.versionAndAdcChars();

        this.#connecting = false;
        this.connected = true;
        console.log("ScientISST Sense CONNECTED");
    }

    async disconnect() {

        this.#keepReading = false;
        if (this.live) {
            await this.stop();
        }

        if (this.#writer) {
            this.#writer.releaseLock();
        }

        if (this.#reader) {
            this.#reader.cancel()
            await this.#closedPromise;
        }

        this.clear();
        this.connected = false;
        console.log("ScientISST Sense DISCONNECTED");
    }

    async versionAndAdcChars() {
        if (!this.connected && !this.#connecting) {
            throw "ScientISST not connected";
        }
        if (this.live) {
            throw "ScientISST not idle";
        }

        const cmd = bytesArray(7);
        await this.send(cmd);

        const result = await this.recv(1024);

        const decoder = new TextDecoder();
        const result_text = decoder.decode(new Uint8Array(result));
        const index = result_text.indexOf("\x00");
        const version = result_text.substring(0, index);

        this.#adc1Chars = new EspAdcCalChars(result.slice(index + 1));

        console.log("ScientISST Board Vref: " + this.#adc1Chars.vref);
        console.log("ScientISST Board ADC Attenuation Mode: " + this.#adc1Chars.atten);

        return version;

    }


    async changeAPI(mode) {
        if (!this.connected && !this.#connecting) {
            throw "ScientISST not connected";
        }
        if (this.live) {
            throw "ScientISST not idle";
        }

        mode <<= 4
        mode |= 0b11

        const cmd = bytesArray(mode);
        await this.send(cmd);
    }

    async start(sampleRate,
        channels,
        readsPerSecond = 5) {
        if (!this.connected) {
            throw "ScientISST not connected";
        }
        if (this.live) {
            throw "ScientISST not idle";
        }

        let chMask = 0
        this.#chs = [];
        this.#numChs = 0;

        channels.forEach((ch) => {
            if (ch <= 0 || ch > 8) {
                throw "Invalid channel";
            }
            this.#chs.push(ch);

            const mask = 1 << (ch - 1)

            if (chMask & mask) {
                this.#numChs = 0;
                throw "Invalid channel";
            }

            chMask |= mask
            this.#numChs++;
        });

        //  Sample rate
        const sr = bytesArray(sampleRate);
        sr.push(67);

        await this.send(sr, 4);

        //  Cleanup existing data in bluetooth socket
        this.clear();

        const cmd = bytesArray(chMask);
        cmd.push(1);

        await this.send(cmd);


        this.#packetSize = this.getPacketSize();

        this.#bytesToRead = this.#packetSize * Math.max(
            Math.floor(sampleRate / readsPerSecond), 1
        );
        if (this.#bytesToRead > MAX_BUFFER_SIZE) {
            this.#bytesToRead = MAX_BUFFER_SIZE - (
                MAX_BUFFER_SIZE % this.#packetSize
            );
        }

        if (this.#bytesToRead % this.#packetSize) {
            this.#numChs = 0;
            console.log("Error, bytes_to_read needs to be devisible by packet_size");
            throw "Invalid parameter";
        } else {
            this.#numFrames = Math.floor(this.#bytesToRead / this.#packetSize);
        }

        this.live = true;
    }

    async stop() {
        if (!this.connected) {
            throw "ScientISST not connected";
        }
        if (!this.live) {
            throw "ScientISST not live";
        }

        const cmd = 0;
        this.live = false;
        await this.send([cmd]);

        this.#numChs = 0;

        this.clear();
    }

    async read(convert = true) {

        if (!this.connected) {
            throw "ScientISST not connected";
        }
        if (!this.live) {
            throw "ScientISST not live";
        }

        const frames = new Array(this.#numFrames);

        const result = await this.recv(this.#bytesToRead);

        let bf;
        let midFrameFlag;
        let f;
        let byteIt, index, currCh, value;
        let result_tmp;

        for (let it = 0; it < this.#numFrames; it++) {

            bf = result.splice(0, this.#packetSize);
            midFrameFlag = 0;

            while (!ScientISST.checkCRC4(bf, this.#packetSize)) {
                console.log("Error checking CRC4");

                result_tmp = this.recv(1);

                result.push(result_tmp);

                bf = bf.slice(1).push(result.splice(0, 1));

            }

            f = new Frame(this.#numChs);
            frames[it] = f;

            f.seq = bf[bf.length - 1] >> 4;

            for (let i = 0; i < 4; i++) {
                if ((bf[bf.length - 2] & (0x80 >> i)) == 0) {
                    f.digital[i] = 0;
                } else {
                    f.digital[i] = 1;
                }
            }

            byteIt = 0;
            for (let i = 0; i < this.#numChs; i++) {
                index = this.#numChs - 1 - i;
                currCh = this.#chs[index];

                if (currCh == AX1 || currCh == AX2) {
                    // TODO
                } else {

                    if (!midFrameFlag) {
                        value = bf[byteIt + 1] << 8;
                        value |= bf[byteIt];
                        value &= 0xFFF;
                        f.a[index] = value

                        byteIt += 1;
                        midFrameFlag = 1;
                    } else {
                        value = bf[byteIt + 1] << 8;
                        value |= bf[byteIt];
                        value >>= 4;
                        f.a[index] = value

                        byteIt += 2;
                        midFrameFlag = 0;
                    }

                    if (convert) {
                        f.mv[index] =
                            this.#adc1Chars.espAdcCalRawToVoltage(
                                f.a[index]
                            );
                    }

                }

            }

        }
        return frames;

    }

    getPacketSize() {
        let packetSize = 0;

        let num_intern_active_chs = 0;
        let num_extern_active_chs = 0;

        this.#chs.forEach((ch) => {
            if (ch) {
                if (ch == AX1 || ch == AX2) {
                    num_extern_active_chs++;
                } else {
                    num_intern_active_chs++;
                }
            }
        });
        packetSize = 3 * num_extern_active_chs;

        if (num_intern_active_chs % 2) {
            packetSize += (
                (num_intern_active_chs * 12) - 4
            ) / 8;
        } else {
            packetSize += (num_intern_active_chs * 12) / 8;
        }

        packetSize += 2;

        return Math.floor(packetSize)
    }

    async readUntilClosed() {
        while (this.#port.readable && this.#keepReading) {
            this.#reader = this.#port.readable.getReader();
            try {
                while (true) {
                    const { value, done } = await this.#reader.read();
                    if (done) {
                        // Allow the serial port to be closed later.
                        break;
                    }
                    if (value) {
                        this.#recvBuffer.push(...value);
                    }
                }
            } catch (error) {
                console.log(error);
            } finally {
                // Allow the serial port to be closed later.
                this.#reader.releaseLock();
            }
        }
        await this.#port.close();
    }

    clear() {
        this.#recvBuffer = [];
    }

    async recv(nrOfBytes, log = false) {
        let result = [];
        let n = 0;
        let l = 0;
        let bytesToRead = 0;
        let removed;


        const n_sleep = 100;
        let n_to_wait = TIMEOUT_IN_MILLISECONDS / n_sleep;

        while (result.length != nrOfBytes && n_to_wait > 0) {
            l = this.#recvBuffer.length;
            if (l > 0) {
                n = nrOfBytes - result.length;

                bytesToRead = Math.min(n, l)
                removed = this.#recvBuffer.splice(0, bytesToRead);

                result.push(...removed);
            } else {
                await sleep(n_sleep);
                n_to_wait--;
            }
        }
        if (log) {
            console.log("Bytes read: " + result);
        }

        if (result.length == 0) {
            throw "Error contacting device";
        }
        return result;
    }

    async send(data, nrOfBytes, log = false) {
        nrOfBytes = nrOfBytes || data.length;

        const bytesDiff = nrOfBytes - data.length;
        for (let i = 0; i < bytesDiff; i++) {
            data.unshift(0);
        }

        if (data.length > 1) {
            data = data.reverse();
        }

        if (log) {
            console.log("Bytes sent: " + data);
        }

        if (this.#port.writable == null) {
            console.warn(`unable to find writable port`);
            return;
        }

        await this.#writer.write(new Uint8Array(data))

        await sleep(250);
    }
}

