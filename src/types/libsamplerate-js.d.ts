declare module '@alexanderolsen/libsamplerate-js' {
  export enum ConverterType {
    SRC_SINC_FASTEST = 0,
    SRC_SINC_MEDIUM_QUALITY = 1,
    SRC_SINC_BEST_QUALITY = 2,
    SRC_ZERO_ORDER_HOLD = 3,
    SRC_LINEAR = 4
  }

  export interface ResamplerOptions {
    converterType: ConverterType;
  }

  export interface Resampler {
    simple(input: Float32Array): Float32Array;
  }

  export function create(
    channels: number,
    inputSampleRate: number,
    outputSampleRate: number,
    options?: ResamplerOptions
  ): Promise<Resampler>;
} 