class Frame {
    digital: Array<number> = [0, 0, 0, 0];
    seq: number;
    a: Array<number>;
    mv: Array<number>;

    constructor(numChannels: number) {
        this.a = Array<number>(numChannels);
        this.mv = Array<number>(numChannels);
    }
}