import {
    serial as polyfill, SerialPort as SerialPortPolyfill,
} from 'web-serial-polyfill';

import ScientISST from './scientisst';

export { default as ScientISST } from './scientisst';

let scientisst: ScientISST;
if ("serial" in navigator) {
    // The Web Serial API is supported.
    console.log("Serial available");
    const serial = (navigator as any).serial;

    serial.requestPort().then((result: any) => main(result));
}

async function main(port: SerialPort) {
    scientisst = new ScientISST(port);


    const version_str = await scientisst.version();
    alert(version_str);

    scientisst.start(100, [1, 2]);

}