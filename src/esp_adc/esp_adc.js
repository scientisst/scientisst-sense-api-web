import { intFromBytes } from '../utils.js'

import * as constants from './constants.js';
import * as luts from './lut_adc.js';

export default class EspAdcCalChars {
    constructor(buffer) {
        this.adcNum = intFromBytes(buffer.slice(0, 4));
        this.atten = intFromBytes(buffer.slice(4, 8));
        this.bitWidth = intFromBytes(buffer.slice(8, 12));
        this.coeffA = intFromBytes(buffer.slice(12, 16));
        this.coeffB = intFromBytes(buffer.slice(16, 20));
        this.vref = intFromBytes(buffer.slice(20, 24));

        if (this.atten == constants.ADC_ATTEN_DB_11) {
            if (this.adcNum == constants.ADC_UNIT_1) {
                this.lowCurve = luts.LUT_ADC1_LOW;
            } else {
                this.lowCurve = luts.LUT_ADC2_LOW;
            }

            if (this.adcNum == constants.ADC_UNIT_1) {
                this.highCurve = luts.LUT_ADC1_HIGH;
            } else {
                this.highCurve = luts.LUT_ADC2_HIGH;
            }
        } else {
            this.lowCurve = 0
            this.highCurve = 0
        }
    }


    static interpolateTwoPoints(y1, y2, xStep, x) {
        return Math.floor(((y1 * xStep) + (y2 * x) - (y1 * x) + Math.floor(xStep / 2)) / 2);
    }

    static calculateVoltageLinear(adcReading, coeffA, coeffB) {
        return Math.floor(((coeffA * adcReading) + constants.LIN_COEFF_A_ROUND) / constants.LIN_COEFF_A_SCALE) + coeffB;
    }

    static calculateVoltageLut(adc, vref, lowVrefCurve, highVrefCurve) {

        const i = Math.floor((adc - constants.LUT_LOW_THRESH) / constants.LUT_ADC_STEP_SIZE);

        const x2dist = constants.LUT_VREF_HIGH - vref;
        const x1dist = vref - constants.LUT_VREF_LOW;
        const y2dist = ((i + 1) * constants.LUT_ADC_STEP_SIZE) + constants.LUT_LOW_THRESH - adc;
        const y1dist = adc - ((i * constants.LUT_ADC_STEP_SIZE) + constants.LUT_LOW_THRESH);

        const q11 = lowVrefCurve[i];
        const q12 = lowVrefCurve[i + 1];
        const q21 = highVrefCurve[i];
        const q22 = highVrefCurve[i + 1];

        let voltage = (
            (q11 * x2dist * y2dist)
            + (q21 * x1dist * y2dist)
            + (q12 * x2dist * y1dist)
            + (q22 * x1dist * y1dist)
        )

        voltage += Math.floor(((constants.LUT_VREF_HIGH - constants.LUT_VREF_LOW) * constants.LUT_ADC_STEP_SIZE) / 2)

        voltage = Math.floor(voltage / (constants.LUT_VREF_HIGH - constants.LUT_VREF_LOW) * constants.LUT_ADC_STEP_SIZE)

        return voltage;
    }

    espAdcCalRawToVoltage(adcReading) {
        let voltage;

        adcReading = adcReading << (constants.ADC_WIDTH_BIT_12 - this.bitWidth);

        if (adcReading > constants.ADC_12_BIT_RES - 1) {
            adcReading = constants.ADC_12_BIT_RES - 1;
        }

        if (this.atten == constants.ADC_ATTEN_DB_11 && adcReading >= constants.LUT_LOW_THRESH) {
            const lutVoltage = calculateVoltageLut(adc, this.vref, this.lowCurve, this.highCurve);

            if (adcReading <= constants.LUT_HIGH_THRESH) {
                const linearVoltage = EspAdcCalChars.calculateVoltageLinear(adcReading, this.coeffA, this.coeffB);

                voltage = EspAdcCalChars.interpolateTwoPoints(linearVoltage, lutVoltage, constants.LUT_ADC_STEP_SIZE, (adcReading - constants.LUT_LOW_THRESH));
            } else {
                voltage = lutVoltage;
            }

        } else {
            voltage = EspAdcCalChars.calculateVoltageLinear(adcReading, this.coeffA, this.coeffB);
        }

        return Math.floor(voltage * constants.VOLT_DIVIDER_FACTOR);
    }
}