import { ADC_ATTEN, ADC_BITS_WIDTH, ADC_UNIT } from "./enums"

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
