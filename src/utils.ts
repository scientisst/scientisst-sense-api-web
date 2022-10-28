/*
  Utilitary functions
*/

// Convert bytes list to integer
export function intFromBytes(bytes, endian = "little") {
	if (endian == "little") {
		bytes = bytes.reverse()
	}

	let result = 0

	bytes.forEach(byte => {
		result <<= 8
		result |= byte
	})

	return result
}

// Sleep for ms seconds
export function sleep(ms) {
	return new Promise(r => setTimeout(r, ms))
}

// Convert integer to array of bytes
export function bytesArray(n) {
	if (!n) return new ArrayBuffer(0)
	const a = []
	a.unshift(n & 255)
	while (n >= 256) {
		n = n >>> 8
		a.unshift(n & 255)
	}
	return a
}
