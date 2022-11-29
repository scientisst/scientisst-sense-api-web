import { ScientISSTAdcCharacteristics } from "./adcCharacteristics"
import { CHANNEL } from "./enums"

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
