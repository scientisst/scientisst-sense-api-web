import { ScientISSTAdcCharacteristics } from "./adcCharacteristics"
import { CHANNEL_SIZE } from "./constants"
import {
	ADC_ATTEN,
	ADC_BITS_WIDTH,
	ADC_UNIT,
	CHANNEL,
	COMMUNICATION_MODE
} from "./enums"
import {
	AlreadyConnectedException,
	ConnectionFailedException,
	ConnectionInProgressException,
	ConnectionLostException,
	IdleException,
	InvalidSamplingRateException,
	NoChannelsEnabledException,
	NotConnectedException,
	NotIdleException,
	NotImplementedException,
	NotSupportedException,
	UserCancelledException
} from "./exceptions"
import { ScientISSTFrame } from "./frame"
import { framesToUtf16, utf16ToFrames } from "./utils"

export {
	AlreadyConnectedException,
	ConnectionFailedException,
	ConnectionInProgressException,
	ConnectionLostException,
	IdleException,
	InvalidSamplingRateException,
	NoChannelsEnabledException,
	NotConnectedException,
	NotIdleException,
	NotImplementedException,
	NotSupportedException,
	UserCancelledException,
	ADC_ATTEN,
	ADC_BITS_WIDTH,
	ADC_UNIT,
	CHANNEL,
	COMMUNICATION_MODE,
	ScientISSTAdcCharacteristics,
	ScientISSTFrame,
	framesToUtf16,
	utf16ToFrames,
	CHANNEL_SIZE
}

export class ScientISST {
	private connecting = false
	private connected = false
	private idle = true
	private communicationMode?: COMMUNICATION_MODE = undefined
	private serialPort?: SerialPort = undefined
	private writer?: WritableStreamDefaultWriter<Uint8Array> = undefined
	private reader?: ReadableStreamDefaultReader<Uint8Array> = undefined
	private readerBuffer: number[] = []
	private version = ""
	private adcCharacteristics?: ScientISSTAdcCharacteristics = undefined
	private versionAdcQueue: Array<{
		resolve: () => void
		reject: () => void
	}> = []
	private frameReadingQueue: Array<{
		resolve: () => void
		reject: () => void
	}> = []
	private frameReadingLocked = false
	private channelsEnabled: CHANNEL[] = []
	private packetSize = 0
	private webSocket?: WebSocket = undefined
	private connectionLost = false

	public isIdle() {
		return this.idle
	}

	public isConnected() {
		return this.connected
	}

	public isConnecting() {
		return this.connecting
	}

	public async getVersion() {
		if (!this.connected) {
			throw new NotConnectedException()
		}

		if (this.version !== "") {
			return this.version
		}

		try {
			await new Promise((resolve, reject) => {
				this.versionAdcQueue.push({
					resolve: () => resolve(undefined),
					reject
				})
			})
		} catch {
			throw new ConnectionLostException()
		}

		return this.version
	}

	public async getAdcCharacteristics() {
		if (!this.connected) {
			throw new NotConnectedException()
		}

		if (this.adcCharacteristics !== undefined) {
			return this.adcCharacteristics
		}

		try {
			await new Promise((resolve, reject) => {
				this.versionAdcQueue.push({
					resolve: () => resolve(undefined),
					reject
				})
			})
		} catch {
			throw new ConnectionLostException()
		}

		return this.adcCharacteristics
	}

	async connect(mode: COMMUNICATION_MODE) {
		if (this.connected) {
			throw new AlreadyConnectedException()
		}
		if (this.connecting) {
			throw new ConnectionInProgressException()
		}

		this.connecting = true
		this.communicationMode = mode

		switch (mode) {
			case COMMUNICATION_MODE.BLUETOOTH:
				if (!navigator || !navigator.serial) {
					throw new NotSupportedException()
				}

				try {
					this.serialPort = await navigator.serial.requestPort()
				} catch {
					await this.disconnect()
					throw new UserCancelledException()
				}

				// DO NOT REMOVE THIS TIMEOUT
				// MacOS WILL NOT WORK WITHOUT IT
				if (this.isMacOS()) {
					await new Promise(resolve => {
						setTimeout(resolve, 2000)
					})
				}

				try {
					await this.serialPort.open({
						baudRate: 115200
					})

					// DO NOT REMOVE THIS TIMEOUT
					// MacOS WILL NOT WORK WITHOUT IT
					if (this.isMacOS()) {
						await new Promise(resolve => {
							setTimeout(resolve, 8000)
						})
					}
				} catch {
					await this.disconnect()
					throw new ConnectionFailedException()
				}

				try {
					this.writer = this.serialPort.writable.getWriter()
					this.reader = this.serialPort.readable.getReader()
				} catch {
					await this.disconnect()
					throw new ConnectionFailedException()
				}

				this.connected = true
				this.connecting = false

				try {
					await this.getVersionAndAdcCharacteristics()
				} catch {
					await this.disconnect()
					throw new ConnectionFailedException()
				}

				break
			case COMMUNICATION_MODE.WEB_SOCKET:
				if (!window || !window.WebSocket) {
					throw new NotSupportedException()
				}

				try {
					this.webSocket = await new Promise((resolve, reject) => {
						const webSocket = new WebSocket(
							"wss://scientisst.local"
						)
						webSocket.onopen = () => resolve(webSocket)
						webSocket.onerror = () => reject()
					})

					this.webSocket.onmessage = event => {
						console.log("data", event.data)
						this.readerBuffer.push(...event.data)
					}

					this.webSocket.onerror = () => {
						this.connectionLost = true
					}

					this.webSocket.onclose = () => {
						this.connectionLost = true
					}
				} catch {
					await this.disconnect()
					throw new ConnectionFailedException()
				}

				break
			default:
				throw new NotImplementedException()
		}
	}

	async disconnect() {
		switch (this.communicationMode) {
			case COMMUNICATION_MODE.BLUETOOTH:
				try {
					this.writer?.releaseLock()
				} catch {}
				try {
					await this.writer?.close()
				} catch {}
				try {
					this.reader?.releaseLock()
				} catch {}
				try {
					await this.serialPort?.close()
				} catch {}
				break
			case COMMUNICATION_MODE.WEB_SOCKET:
				try {
					this.webSocket.close()
				} catch {}
				break
			default:
				break
		}

		this.connected = false
		this.connecting = false
		this.idle = true
		this.communicationMode = undefined
		this.serialPort = undefined
		this.writer = undefined
		this.reader = undefined
		this.readerBuffer = []
		this.version = ""
		this.adcCharacteristics = undefined
		this.webSocket = undefined
		this.connectionLost = false

		for (const queue of this.versionAdcQueue) {
			queue.reject()
		}
		this.versionAdcQueue = []

		for (const queue of this.frameReadingQueue) {
			queue.reject()
		}
		this.frameReadingQueue = []

		this.channelsEnabled = []
		this.packetSize = 0
	}

	public async start(
		channels: CHANNEL[],
		samplingRate: number,
		simulated = false
	) {
		if (!this.connected) {
			throw new NotConnectedException()
		}
		if (!this.idle) {
			throw new NotIdleException()
		}
		if (channels.length === 0) {
			throw new NoChannelsEnabledException()
		}
		if (samplingRate < 1 || samplingRate > 16000) {
			throw new InvalidSamplingRateException()
		}
		this.idle = false

		this.channelsEnabled = channels.sort((a, b) => a - b)

		const internalChannels = channels.filter(
			x => x !== CHANNEL.AX1 && x !== CHANNEL.AX2
		).length
		const externalChannels = channels.filter(
			x => x === CHANNEL.AX1 || x === CHANNEL.AX2
		).length

		let packetSize = 3 * externalChannels + 2

		if (internalChannels % 2) {
			packetSize += (internalChannels * 12 - 4) / 8
		} else {
			packetSize += (internalChannels * 12) / 8
		}

		this.packetSize = packetSize

		samplingRate = Math.floor(samplingRate)
		await this.send(
			new Uint8Array([
				0x43,
				samplingRate & 0xff,
				(samplingRate >> 8) & 0xff
			])
		)

		await this.send(
			new Uint8Array([
				simulated ? 0x02 : 0x01,
				(channels.includes(CHANNEL.AI1) ? 1 : 0) |
					(channels.includes(CHANNEL.AI2) ? 1 << 1 : 0) |
					(channels.includes(CHANNEL.AI3) ? 1 << 2 : 0) |
					(channels.includes(CHANNEL.AI4) ? 1 << 3 : 0) |
					(channels.includes(CHANNEL.AI5) ? 1 << 4 : 0) |
					(channels.includes(CHANNEL.AI6) ? 1 << 5 : 0) |
					(channels.includes(CHANNEL.AX1) ? 1 << 6 : 0) |
					(channels.includes(CHANNEL.AX2) ? 1 << 7 : 0)
			])
		)
	}

	private hasValidCRC4(data: Uint8Array): boolean {
		const CRC4tab = [0, 3, 6, 5, 12, 15, 10, 9, 11, 8, 13, 14, 7, 4, 1, 2]
		let crc = 0
		let b: number

		for (let i = 0; i < data.length - 1; i++) {
			b = data[i]
			crc = CRC4tab[crc] ^ (b >> 4)
			crc = CRC4tab[crc] ^ (b & 0x0f)
		}

		crc = CRC4tab[crc] ^ (data[data.length - 1] >> 4)
		crc = CRC4tab[crc]

		return crc == (data[data.length - 1] & 0x0f)
	}

	public async readFrames(count = 1): Promise<Array<ScientISSTFrame | null>> {
		if (!this.connected) {
			throw new NotConnectedException()
		}
		if (this.idle) {
			throw new IdleException()
		}

		if (this.frameReadingLocked) {
			try {
				await new Promise((resolve, reject) => {
					this.frameReadingQueue.push({
						resolve: () => resolve(undefined),
						reject
					})
				})
			} catch {
				return []
			}
		} else {
			this.frameReadingLocked = true
		}

		const result: Array<ScientISSTFrame | null> = []
		let buffer = await this.recv(count * this.packetSize)
		let offset = 0

		for (let i = 0; i < count; i++) {
			let frameBuffer = buffer.slice(
				this.packetSize * i + offset,
				this.packetSize * (i + 1) + offset
			)

			while (!this.hasValidCRC4(frameBuffer)) {
				// TODO: return null for invalid frames

				buffer = new Uint8Array([...buffer, ...(await this.recv(1))])
				offset++

				frameBuffer = buffer.slice(
					this.packetSize * i + offset,
					this.packetSize * (i + 1) + offset
				)
			}

			const frameSkeleton: Record<CHANNEL, number | null | undefined> = {
				[CHANNEL.AI1]: undefined,
				[CHANNEL.AI2]: undefined,
				[CHANNEL.AI3]: undefined,
				[CHANNEL.AI4]: undefined,
				[CHANNEL.AI5]: undefined,
				[CHANNEL.AI6]: undefined,
				[CHANNEL.AX1]: undefined,
				[CHANNEL.AX2]: undefined
			}

			const sequenceNumber = frameBuffer[frameBuffer.length - 1] >> 4

			let byteOffset = 0
			let midFrame = false
			for (let i = this.channelsEnabled.length - 1; i >= 0; i--) {
				const channel = this.channelsEnabled[i]

				if (channel === CHANNEL.AX1 || channel === CHANNEL.AX2) {
					frameSkeleton[channel] =
						frameBuffer[byteOffset] |
						(frameBuffer[byteOffset + 1] << 8) |
						(frameBuffer[byteOffset + 2] << 16)

					byteOffset += 3
				} else if (!midFrame) {
					frameSkeleton[channel] =
						((frameBuffer[byteOffset + 1] << 8) |
							frameBuffer[byteOffset]) &
						0xfff

					byteOffset += 1
					midFrame = true
				} else {
					frameSkeleton[channel] =
						((frameBuffer[byteOffset + 1] << 8) |
							frameBuffer[byteOffset]) >>
						4

					byteOffset += 2
					midFrame = false
				}

				// console.log(channel, frameSkeleton[channel])
			}

			result.push(
				new ScientISSTFrame(
					this.adcCharacteristics,
					frameSkeleton,
					sequenceNumber
				)
			)
		}

		if (this.frameReadingQueue.length > 0) {
			const queue = this.frameReadingQueue.shift()
			queue.resolve()
		} else {
			this.frameReadingLocked = false
		}

		return result
	}

	public async stop() {
		if (!this.connected) {
			throw new NotConnectedException()
		}
		if (this.idle) {
			throw new IdleException()
		}

		await this.send(new Uint8Array([0x00]))
		this.idle = true
	}

	private isMacOS(): boolean {
		return (
			navigator &&
			typeof navigator.userAgent === "string" &&
			navigator.userAgent.includes("Mac OS")
		)
	}

	private async send(data: Uint8Array) {
		if (!this.connected) {
			throw new NotConnectedException()
		}

		switch (this.communicationMode) {
			case COMMUNICATION_MODE.BLUETOOTH:
				try {
					// DO NOT REMOVE THIS CONSOLE.LOG
					// IF REMOVED, IT WILL BREAK THE APPLICATION FOR MacOS (IN BTH)
					if (this.isMacOS()) {
						console.log("Sending...", data)
					}
					await this.writer.write(data)
					await this.writer.ready
				} catch {
					await this.disconnect()
					throw new ConnectionLostException()
				}

				break
			case COMMUNICATION_MODE.WEB_SOCKET:
				throw new NotImplementedException()
				break
			default:
				throw new NotImplementedException()
		}
	}

	private async recv(byteCount = 0) {
		if (!this.connected) {
			throw new NotConnectedException()
		}

		switch (this.communicationMode) {
			case COMMUNICATION_MODE.BLUETOOTH:
				try {
					while (this.readerBuffer.length < byteCount) {
						const { value, done } = await this.reader.read()

						if (done) {
							await this.disconnect()
							throw new ConnectionLostException()
						}

						this.readerBuffer.push(...value)
					}

					return new Uint8Array(
						this.readerBuffer.splice(0, byteCount)
					)
				} catch {
					await this.disconnect()
					throw new ConnectionLostException()
				}
			case COMMUNICATION_MODE.WEB_SOCKET:
				throw new NotImplementedException()
				break
			default:
				throw new NotImplementedException()
		}
	}

	private async recvUntil(byte: number) {
		const result = []

		byte = byte & 0xff
		let recvByte = (await this.recv(1))[0]

		while (recvByte !== byte) {
			result.push(recvByte)
			recvByte = (await this.recv(1))[0]
		}

		result.push(recvByte)
		return new Uint8Array(result)
	}

	private async getVersionAndAdcCharacteristics() {
		if (!this.idle) {
			throw new NotIdleException()
		}

		await this.send(new Uint8Array([0x23]))
		await this.send(new Uint8Array([0x07]))

		const version = await this.recvUntil(0x00)
		this.version = new TextDecoder().decode(version).slice(0, -1).trim()

		const adcCharacteristics = await this.recv(24)

		const adcNum: ADC_UNIT =
			adcCharacteristics[0] |
			(adcCharacteristics[1] << 8) |
			(adcCharacteristics[2] << 16) |
			(adcCharacteristics[3] << 24)

		const adcAtten: ADC_ATTEN =
			adcCharacteristics[4] |
			(adcCharacteristics[5] << 8) |
			(adcCharacteristics[6] << 16) |
			(adcCharacteristics[7] << 24)

		const adcBitWidth: ADC_BITS_WIDTH =
			adcCharacteristics[8] |
			(adcCharacteristics[9] << 8) |
			(adcCharacteristics[10] << 16) |
			(adcCharacteristics[11] << 24)

		const coeffA =
			adcCharacteristics[12] |
			(adcCharacteristics[13] << 8) |
			(adcCharacteristics[14] << 16) |
			(adcCharacteristics[15] << 24)

		const coeffB =
			adcCharacteristics[16] |
			(adcCharacteristics[17] << 8) |
			(adcCharacteristics[18] << 16) |
			(adcCharacteristics[19] << 24)

		const vRef =
			adcCharacteristics[20] |
			(adcCharacteristics[21] << 8) |
			(adcCharacteristics[22] << 16) |
			(adcCharacteristics[23] << 24)

		this.adcCharacteristics = new ScientISSTAdcCharacteristics(
			adcNum,
			adcAtten,
			adcBitWidth,
			coeffA,
			coeffB,
			vRef
		)

		for (const queue of this.versionAdcQueue) {
			queue.resolve()
		}
		this.versionAdcQueue = []
	}
}
