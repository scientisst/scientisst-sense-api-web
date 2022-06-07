import ScientISST from "./src/scientisst.js";

const connectBtn = document.getElementById("connect");
const disconnectBtn = document.getElementById("disconnect");
const versionBtn = document.getElementById("version");
const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
const textArea = document.getElementById("textarea");
const deviceSettingsForm = document.getElementById("device-settings");

let scientisst;

if ("serial" in navigator) {
    connectBtn.addEventListener("click", async () => {
        scientisst = await ScientISST.requestPort();
        try {
            await scientisst.connect(() => {
                console.log("Connection lost :(")
            });
        } catch (e) {
            console.log(e);
        }
    });

    disconnectBtn.addEventListener("click", async () => {
        if (scientisst) {
            await scientisst.disconnect();
        }
    });

    versionBtn.addEventListener("click", async () => {
        if (scientisst) {
            const version_str = await scientisst.versionAndAdcChars();
            alert(version_str);
        }
    });

    startBtn.addEventListener("click", async () => {
        if (scientisst && !scientisst.live) {

            const samplingRate = deviceSettingsForm["sampling-rate"].value;
            const channels = [];
            const convert = deviceSettingsForm["mv"].checked;

            for (let ch = 1; ch <= 6; ch++) {
                if (deviceSettingsForm["AI" + ch].checked) {
                    channels.push(ch);
                }
            }

            await scientisst.start(samplingRate, channels);
            let frames, frame, frameStr;
            textArea.value = "";
            while (scientisst.live) {
                try {
                    frames = await scientisst.read(convert);
                    frame = frames[0];
                    frameStr =
                        "seq: " +
                        frame.seq +
                        ", d: " +
                        frame.digital +
                        ", a: " +
                        frame.a;
                    if (convert) {
                        frameStr += ", mv: " +
                            frame.mv
                            ;
                    }
                    frameStr += "\n";

                    console.log(frameStr);
                    textArea.value += frameStr;
                    textarea.scrollTop = textarea.scrollHeight;
                } catch (e) {
                    console.log(scientisst)
                    console.log(e);
                }
            }
        }
    });

    stopBtn.addEventListener("click", async () => {
        if (scientisst && scientisst.live) {
            await scientisst.stop();
        }
    });
} else {
    alert("Browser not compatible with Web Serial API");
}