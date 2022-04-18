export const LIN_COEFF_A_SCALE = 65536
export const LIN_COEFF_A_ROUND = LIN_COEFF_A_SCALE / 2

export const LUT_VREF_LOW = 1000
export const LUT_VREF_HIGH = 1200
export const LUT_ADC_STEP_SIZE = 64
export const LUT_POINTS = 20
export const LUT_LOW_THRESH = 2880
export const LUT_HIGH_THRESH = LUT_LOW_THRESH + LUT_ADC_STEP_SIZE
export const ADC_12_BIT_RES = 4096

export const ADC_UNIT_1 = 1  // SAR ADC 1.
export const ADC_UNIT_2 = 2  // SAR ADC 2.
export const ADC_UNIT_BOTH = 3  // SAR ADC 1 and 2.
export const ADC_UNIT_ALTER = 7  // SAR ADC 1 and 2 alternative mode.

export const ADC_ATTEN_DB_0 = 0  // No input attenumation, ADC can measure up to approx. 800 mV. 
export const ADC_ATTEN_DB_2_5 = 1  // The input voltage of ADC will be attenuated, extending the range of measurement to up to approx. 1100 mV.
export const ADC_ATTEN_DB_6 = 2  // The input voltage of ADC will be attenuated, extending the range of measurement to up to  approx. 1350 mV.
export const ADC_ATTEN_DB_11 = 3  // The input voltage of ADC will be attenuated, extending the range of measurement to up to  approx. 2600 mV.

export const ADC_WIDTH_BIT_9 = 0  // ADC capture width is 9Bit. Only ESP32 is supported.
export const ADC_WIDTH_BIT_10 = 1  // ADC capture width is 10Bit. Only ESP32 is supported.
export const ADC_WIDTH_BIT_11 = 2  // ADC capture width is 11Bit. Only ESP32 is supported.
export const ADC_WIDTH_BIT_12 = 3  // ADC capture width is 12Bit. Only ESP32 is supported.

export const VOLT_DIVIDER_FACTOR = 3.399