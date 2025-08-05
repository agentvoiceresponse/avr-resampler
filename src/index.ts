import { create, ConverterType } from "@alexanderolsen/libsamplerate-js";

/**
 * Audio Resampler for STS or TTS service
 * Handles conversion between provider sample rate and client sample rate (8000 Hz)
 */
class AudioResampler {
  private inputSampleRate: number;
  private outputSampleRate: number;
  private downResampler: any;
  private upResampler: any;

  constructor(outputSampleRate: number = 48000) {
    this.inputSampleRate = 8000; // Fixed for client
    this.outputSampleRate = outputSampleRate;
  }

  /**
   * Initialize the downsampler (provider -> client)
   */
  async initialize(): Promise<void> {
    console.log(
      `Initializing downsampler: ${this.outputSampleRate} Hz -> ${this.inputSampleRate} Hz`
    );

    this.downResampler = await create(
      1,
      this.outputSampleRate,
      this.inputSampleRate,
      {
        converterType: ConverterType.SRC_SINC_BEST_QUALITY, // best quality sinc filter
      }
    );

    console.log(`Initializing upsampler: ${this.inputSampleRate} Hz -> ${this.outputSampleRate} Hz`)

    this.upResampler = await create(
      1, 
      this.inputSampleRate,
      this.outputSampleRate,
      {
        converterType: ConverterType.SRC_SINC_BEST_QUALITY, // best quality sinc filter
      }
    );
  }

  /**
   * Convert PCM16 to Float32, downsample, filter and convert back to PCM16
   */
  async downsample(pcm: Buffer): Promise<Buffer> {
    const sampleCount = pcm.length / 2;
    const float32Input = new Float32Array(sampleCount);
  
    for (let i = 0; i < sampleCount; i++) {
      const int16 = pcm.readInt16LE(i * 2);
      float32Input[i] = int16 / 32768;
    }
  
    const float32Output: Float32Array = await this.downResampler.full(float32Input);
  
    const int16Output = new Int16Array(float32Output.length);
    for (let i = 0; i < float32Output.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Output[i]));
      int16Output[i] = Math.round(s * 32767);
    }
    
    return Buffer.from(int16Output.buffer);
  }

  async upsample(pcm: Buffer): Promise<Buffer> {
    const sampleCount = pcm.length / 2; // 16 bit = 2 byte per sample
    const float32Input = new Float32Array(sampleCount);

    // Converti Int16 LE -> Float32 normalizzati (-1.0 a 1.0)
    for (let i = 0; i < sampleCount; i++) {
      const int16 = pcm.readInt16LE(i * 2);
      float32Input[i] = int16 / 32768;
    } 
  
    const float32Output: Float32Array = await this.upResampler.full(float32Input);

    const int16Output = new Int16Array(float32Output.length);
    for (let i = 0; i < float32Output.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Output[i]));
      int16Output[i] = Math.round(s * 32767);
    }
  
    return Buffer.from(int16Output.buffer);
  }

  async destroy(): Promise<void> {
    await this.downResampler.destroy();
    await this.upResampler.destroy();
  }
}

export { AudioResampler };