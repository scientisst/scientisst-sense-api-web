export enum CHANNEL {
	AI1 = 1,
	AI2 = 2,
	AI3 = 3,
	AI4 = 4,
	AI5 = 5,
	AI6 = 6,
	AX1 = 7,
	AX2 = 8
}

export enum COMMUNICATION_MODE {
	BLUETOOTH,
	WEB_SOCKET
}

export class ScientISSTException extends Error {
	constructor(message: string) {
		super(message)
	}
}

export class ConnectionInProgressException extends ScientISSTException {
	constructor() {
		super("Connection with the device is already in progress")
	}
}

export class NotImplementedException extends ScientISSTException {
	constructor() {
		super("Not implemented")
	}
}

export class NotSupportedException extends ScientISSTException {
	constructor() {
		super(
			"This communication mode is not supported in this browser or platform"
		)
	}
}

export class UserCancelledException extends ScientISSTException {
	constructor() {
		super("User cancelled the action")
	}
}

export class ConnectionFailedException extends ScientISSTException {
	constructor() {
		super("Failed to connect to the device")
	}
}

export class NotConnectedException extends ScientISSTException {
	constructor() {
		super("Device is not connected")
	}
}

export class ConnectionLostException extends ScientISSTException {
	constructor() {
		super("Lost connection with device")
	}
}

export class AlreadyConnectedException extends ScientISSTException {
	constructor() {
		super("Device is already connected")
	}
}

export class IdleException extends ScientISSTException {
	constructor() {
		super("This action cannot be performed in idle state")
	}
}

export class NotIdleException extends ScientISSTException {
	constructor() {
		super("This action can only be performed in idle state")
	}
}

export class NoChannelsEnabledException extends ScientISSTException {
	constructor() {
		super("No channels are enabled")
	}
}

export class InvalidSamplingRateException extends ScientISSTException {
	constructor() {
		super("Invalid sampling rate")
	}
}

export enum ADC_UNIT {
	ADC_UNIT_1 = 1,
	ADC_UNIT_2 = 2,
	ADC_UNIT_BOTH = 3,
	ADC_UNIT_ALTER = 7
}

export enum ADC_ATTEN {
	ADC_ATTEN_DB_0 = 0,
	ADC_ATTEN_DB_2_5 = 1,
	ADC_ATTEN_DB_6 = 2,
	ADC_ATTEN_DB_11 = 3
}

export enum ADC_BITS_WIDTH {
	ADC_BITS_WIDTH_9 = 1,
	ADC_BITS_WIDTH_10 = 2,
	ADC_BITS_WIDTH_11 = 3,
	ADC_BITS_WIDTH_12 = 4
}

export class ScientISSTAdcCharacteristics {
	public readonly adcNum: ADC_UNIT
	public readonly adcAtten: ADC_ATTEN
	public readonly adcBitWidth: ADC_BITS_WIDTH
	public readonly coeffA: number
	public readonly coeffB: number
	public readonly vRef: number

	constructor(
		adcNum: ADC_UNIT,
		adcAtten: ADC_ATTEN,
		adcBitWidth: ADC_BITS_WIDTH,
		coeffA: number,
		coeffB: number,
		vRef: number
	) {
		this.adcNum = adcNum
		this.adcAtten = adcAtten
		this.adcBitWidth = adcBitWidth
		this.coeffA = coeffA
		this.coeffB = coeffB
		this.vRef = vRef
	}
}

export class ScientISSTFrame {
	public readonly ScientificISSTAdcCharacteristics: ScientISSTAdcCharacteristics
	public readonly analog: Record<CHANNEL, number | null | undefined>
	public readonly sequence: number

	constructor(
		ScientificISSTAdcCharacteristics: ScientISSTAdcCharacteristics,
		analog: Record<CHANNEL, number | null | undefined>,
		sequence: number
	) {
		this.ScientificISSTAdcCharacteristics = ScientificISSTAdcCharacteristics
		this.analog = analog
		this.sequence = sequence
	}
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

				try {
					await this.serialPort.open({
						baudRate: 115200
					})
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

	private async send(data: Uint8Array) {
		if (!this.connected) {
			throw new NotConnectedException()
		}

		switch (this.communicationMode) {
			case COMMUNICATION_MODE.BLUETOOTH:
				try {
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
