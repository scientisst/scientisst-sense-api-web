export function intFromBytes(bytes, endian = "little") {
    if (endian == "little") {
        bytes = bytes.reverse();
    }

    let result = 0;

    bytes.forEach((byte) => {
        result <<= 8;
        result |= byte;
    });

    return result;
}