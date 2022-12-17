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

	public toJSON(): string {
		return JSON.stringify({
			adcNum: this.adcNum,
			adcAtten: this.adcAtten,
			adcBitWidth: this.adcBitWidth,
			coeffA: this.coeffA,
			coeffB: this.coeffB,
			vRef: this.vRef
		})
	}

	public static fromJSON(json: string): ScientISSTAdcCharacteristics {
		const obj = JSON.parse(json)

		if (obj.adcNum === undefined) {
			throw new Error("adcNum is undefined")
		}

		if (obj.adcAtten === undefined) {
			throw new Error("adcAtten is undefined")
		}

		if (obj.adcBitWidth === undefined) {
			throw new Error("adcBitWidth is undefined")
		}

		if (obj.coeffA === undefined) {
			throw new Error("coeffA is undefined")
		}

		if (obj.coeffB === undefined) {
			throw new Error("coeffB is undefined")
		}

		if (obj.vRef === undefined) {
			throw new Error("vRef is undefined")
		}

		return new ScientISSTAdcCharacteristics(
			obj.adcNum,
			obj.adcAtten,
			obj.adcBitWidth,
			obj.coeffA,
			obj.coeffB,
			obj.vRef
		)
	}
}
