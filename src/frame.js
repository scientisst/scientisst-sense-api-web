export default class Frame {

    digital = [0, 0, 0, 0];
    seq = -1;
    a = null;
    mv = null;

    constructor(numChannels) {
        this.a = new Array(numChannels);
        this.mv = new Array(numChannels);
    }

}