export default class Frame {
  /*
  ScientISST Device Frame class

  A frame returned by ScientISST.read()

  Attributes:
      seq (int): Frame sequence number (0...15).
        This number is incremented by 1 on each consecutive frame, and it overflows to 0 after 15 (it is a 4-bit number).
        This number can be used to detect if frames were dropped while transmitting data.

      digital (list): Array of digital ports states (False for low level or True for high level).
        The array contents are: I1 I2 O1 O2.

      a (list): Array of raw analog inputs values of the active channels.

      mv (list): Array of analog inputs values of the active channels in mV.
  */

  digital = [0, 0, 0, 0];
  seq = -1;
  a = null;
  mv = null;

  constructor(numChannels) {
    this.a = new Array(numChannels);
    this.mv = new Array(numChannels);
  }
}
