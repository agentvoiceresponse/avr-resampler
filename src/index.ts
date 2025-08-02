import { create, ConverterType } from '@alexanderolsen/libsamplerate-js';

/**
 * Audio Resampler for STS or TTS service
 * Handles conversion between provider sample rate and client sample rate (8000 Hz)
 */
class AudioResampler {
  private providerSampleRate: number;
  private clientSampleRate: number;
  private downResampler: any;
  private upResampler: any;
  private downsampleQueue: Buffer[];
  private isInitialized: boolean;

  constructor(providerSampleRate: number = 24000) {
    // Configuration - Provider sample rate is configurable, client rate is fixed
    this.providerSampleRate = providerSampleRate;
    this.clientSampleRate = 8000; // Fixed for client compatibility
    
    this.downResampler = null;
    this.upResampler = null;
    this.downsampleQueue = [];
    this.isInitialized = false;
  }

  /**
   * Initialize the audio resamplers for converting between different sample rates
   * - Downsampler: Provider rate -> 8000 Hz (for output to client)
   * - Upsampler: 8000 Hz -> Provider rate (for input to provider)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.log(`Initializing resamplers: ${this.providerSampleRate} Hz <-> ${this.clientSampleRate} Hz`);
    
    this.downResampler = await create(1, this.providerSampleRate, this.clientSampleRate, {
      converterType: ConverterType.SRC_SINC_FASTEST,
    });

    this.upResampler = await create(1, this.clientSampleRate, this.providerSampleRate, {
      converterType: ConverterType.SRC_SINC_FASTEST,
    });

    this.isInitialized = true;
  }

  /**
   * Convert Int16 audio samples to Float32 format for resampling
   * @param int16 - Input Int16 audio samples
   * @returns Float32 audio samples normalized to [-1, 1]
   */
  static int16ToFloat32(int16: Int16Array): Float32Array {
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }
    return float32;
  }

  /**
   * Convert Float32 audio samples back to Int16 format
   * @param float32 - Input Float32 audio samples
   * @returns Int16 audio samples
   */
  static float32ToInt16(float32: Float32Array): Int16Array {
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      let sample = float32[i] * 32768;
      sample = Math.max(-32768, Math.min(32767, sample));
      int16[i] = sample;
    }
    return int16;
  }

  /**
   * Calculate buffer sizes based on sample rates
   * @returns Buffer size configuration
   */
  getBufferSizes(): {
    providerChunkSize: number;
    clientChunkSize: number;
    downsampleThreshold: number;
  } {
    // For 48000 Hz: 960 bytes = 480 samples (10ms at 48000 Hz)
    // For 8000 Hz: 320 bytes = 160 samples (20ms at 8000 Hz)
    const providerChunkSize = Math.floor(this.providerSampleRate * 0.01 * 2); // 10ms at provider rate, 2 bytes per sample
    const clientChunkSize = Math.floor(this.clientSampleRate * 0.02 * 2); // 20ms at client rate, 2 bytes per sample
    
    return {
      providerChunkSize,
      clientChunkSize,
      downsampleThreshold: providerChunkSize * 2, // Process 2 chunks at a time
    };
  }

  /**
   * Process incoming audio chunks from provider and convert to client format (8000 Hz)
   * Uses buffering to accumulate enough data before processing
   * @param data - Raw audio data from provider
   * @returns Converted audio data or null if not enough data accumulated
   */
  async handleDownsampleChunk(data: Buffer): Promise<Buffer | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    this.downsampleQueue.push(data);

    const { downsampleThreshold, clientChunkSize } = this.getBufferSizes();
    const totalLength = this.downsampleQueue.reduce((sum, buffer) => sum + buffer.length, 0);
    
    // Process when we have enough data (2 chunks of provider rate)
    if (totalLength >= downsampleThreshold) {
      const combinedBuffer = Buffer.concat(this.downsampleQueue.splice(0, 2)); // Take 2 chunks
      const int16Samples = new Int16Array(combinedBuffer.buffer, combinedBuffer.byteOffset, combinedBuffer.length / 2);
      const float32Samples = AudioResampler.int16ToFloat32(int16Samples);

      const resampledFloat32 = this.downResampler.simple(float32Samples);
      const resampledInt16 = AudioResampler.float32ToInt16(resampledFloat32);
      const resampledBuffer = Buffer.from(resampledInt16.buffer);

      // Ensure output is exactly the client chunk size
      if (resampledBuffer.length >= clientChunkSize) {
        return resampledBuffer.subarray(0, clientChunkSize);
      } else {
        const outputBuffer = Buffer.alloc(clientChunkSize);
        resampledBuffer.copy(outputBuffer);
        return outputBuffer;
      }
    }

    return null; // Not enough data accumulated yet
  }

  /**
   * Process incoming audio chunks from client (8000 Hz) and convert to provider format
   * @param data - Raw audio data from client
   * @returns Converted audio data for provider
   */
  async handleUpsampleChunk(data: Buffer): Promise<Buffer> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const int16Samples = new Int16Array(data.buffer, data.byteOffset, data.length / 2);
    const float32Samples = AudioResampler.int16ToFloat32(int16Samples);

    const resampledFloat32 = this.upResampler.simple(float32Samples);
    const resampledInt16 = AudioResampler.float32ToInt16(resampledFloat32);
    const resampledBuffer = Buffer.from(resampledInt16.buffer);

    return resampledBuffer;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.downsampleQueue = [];
    this.isInitialized = false;
    this.downResampler = null;
    this.upResampler = null;
  }
}

export {
  AudioResampler,
}; 