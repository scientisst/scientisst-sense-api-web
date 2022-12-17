import { ScientISSTAdcCharacteristics } from "./adcCharacteristics"
import { CHANNEL_SIZE } from "./constants"
import { CHANNEL } from "./enums"
import { ScientISSTFrame } from "./frame"

export const framesToUtf16 = (frames: ScientISSTFrame[]) => {
	const charCodes: number[] = []
	let offset = 0

	for (let i = 0; i < frames.length; i++) {
		const frame = frames[i]

		const channels = Object.keys(frame.analog)
		channels.sort()

		for (const channel in channels) {
			let value = frame.analog[channel]
			const size = CHANNEL_SIZE[channel]

			if (value === undefined) {
				continue
			} else if (value === null) {
				value = 2 ** size - 1
			} else if (value > 2 ** size - 2) {
				value = 2 ** size - 2
			}

			for (let localOffset = 0; localOffset < size; ) {
				const usedBits = Math.min(size - localOffset, 16 - offset)

				if (offset === 0) {
					charCodes.push((value >> localOffset) & 0xffff)
				} else {
					charCodes[charCodes.length - 1] |=
						((value >> localOffset) << offset) & 0xffff
				}

				localOffset += usedBits
				offset = (offset + usedBits) % 16
			}
		}
	}

	return String.fromCharCode(...charCodes)
}

export const utf16ToFrames = (
	utf16: string,
	channels: CHANNEL[],
	adcChars: ScientISSTAdcCharacteristics
) => {
	const frames: ScientISSTFrame[] = []
	let seq = 0

	channels = [...channels]
	channels.sort()

	let offset = 0
	let i = 0
	while (i < utf16.length) {
		const analog: Record<CHANNEL, number | undefined | null> = {
			[CHANNEL.AI1]: undefined,
			[CHANNEL.AI2]: undefined,
			[CHANNEL.AI3]: undefined,
			[CHANNEL.AI4]: undefined,
			[CHANNEL.AI5]: undefined,
			[CHANNEL.AI6]: undefined,
			[CHANNEL.AX1]: undefined,
			[CHANNEL.AX2]: undefined
		}

		let discardFrame = false
		for (let j = 0; j < channels.length && i < utf16.length; j++) {
			const channel = channels[j]
			const size = CHANNEL_SIZE[channel]
			let value = 0

			for (
				let localOffset = 0;
				localOffset < size && i < utf16.length;

			) {
				const charCode = utf16[i].charCodeAt(0)
				const usedBits = Math.min(size - localOffset, 16 - offset)

				value |=
					((charCode >> offset) & (2 ** usedBits - 1)) << localOffset

				if (offset + usedBits >= 16) {
					i++

					if (i >= utf16.length) {
						discardFrame = true
						break
					}
				}

				localOffset += usedBits
				offset = (offset + usedBits) % 16
			}

			if (value === 2 ** size - 1) {
				analog[channel] = null
			} else {
				analog[channel] = value
			}
		}

		if (!discardFrame) {
			frames.push(new ScientISSTFrame(adcChars, analog, seq++ % 16))
		}
	}

	return frames
}
