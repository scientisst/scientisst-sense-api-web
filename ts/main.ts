import {
    serial as polyfill, SerialPort as SerialPortPolyfill,
} from 'web-serial-polyfill';

let port: SerialPort;
const API_SCIENTISST = 2;

const encoder = new TextEncoder();

const deviceBtn: HTMLElement = document.getElementById('device')!;
const versionBtn: HTMLElement = document.getElementById('version')!;
const startBtn: HTMLElement = document.getElementById('start')!;


if ("serial" in navigator) {
    // The Web Serial API is supported.
    console.log("Serial available");
    const serial = (navigator as any).serial;

    serial.addEventListener("connect", (event: any) => {
        // TODO: Automatically open event.target or warn user a port is available.
        console.log(event);
    });

    serial.addEventListener("disconnect", (event: any) => {
        // TODO: Remove |event.target| from the UI.
        // If the serial port was opened, a stream error would be observed as well.
        console.log(event);

        setButtonsDisabled(true);
    });

    deviceBtn.addEventListener('click', async () => {
        // Prompt user to select any serial port.
        port = await serial.requestPort();

        await port.open({ baudRate: 115200 });
        await changeAPI(API_SCIENTISST);

        setButtonsDisabled(false);
    });

    versionBtn.addEventListener('click', async () => {
        const version_str = await version();
        alert(version_str);
    });

    startBtn.addEventListener('click', async () => {
        start(100, [1, 2]);
    });


}

function setButtonsDisabled(value: boolean) {
    const collection = document.getElementsByClassName("acquisition");
    for (let i = 0; i < collection.length; i++) {
        (<HTMLInputElement>collection[i]).disabled = value;
    }
}

async function version() {
    const cmd = "\x07";
    send(cmd);

    const result = await recv(1024);
    const decoder = new TextDecoder();
    const result_text = decoder.decode(result);
    const index = result_text.indexOf("\x00");
    return result_text.substring(0, index);
}

async function changeAPI(mode: number) {
    mode <<= 4
    mode |= 0b11

    await send(mode);
}

async function start(fs: number,
    channels: Array<number>) {

    let chMask = 0

    channels.forEach(ch => {
        const mask = 1 << (ch - 1)
        chMask |= mask

    });

    //  Sample rate
    let sr = 0b01000011
    sr |= fs << 8
    await send(sr, 4)

    //  Cleanup existing data in bluetooth socket
    // self.__clear()

    let cmd = 0x01
    cmd |= chMask << 8

    await send(cmd);

}

async function recv(length: number) {
    while (port.readable) {
        if (!port.readable.locked) {
            const reader = port.readable.getReader();
            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) {
                        console.log("done");
                        // Allow the serial port to be closed later.
                        reader.releaseLock();
                        break;
                    }
                    if (value) {
                        return value;
                    }
                }
            } catch (error) {
                console.log("Error: " + error);
                // TODO: Handle non-fatal read error.
            }
        }
    }
    return;
}

async function send(data: any, length: number = 1) {
    if (port.writable == null) {
        console.warn(`unable to find writable port`);
        return;
    }

    if (!port.writable.locked) {
        const writer = port.writable.getWriter();

        console.log(encoder.encode(data));
        await writer.write(encoder.encode(data))

        // Allow the serial port to be closed later.
        writer.releaseLock();
    } else {
        console.log("port is locked");
    }
}