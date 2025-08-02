import { create, ConverterType } from '@alexanderolsen/libsamplerate-js';

/**
 * Audio Resampler for STS or TTS service
 * Handles conversion between provider sample rate and client sample rate (8000 Hz)
 * 
 * This class manages bidirectional audio resampling:
 * - Downsampling: Provider rate -> 8000 Hz (for client output)
 * - Upsampling: 8000 Hz -> Provider rate (for provider input)
 */
class AudioResampler {
  private providerSampleRate: number;
  private clientSampleRate: number;
  private downResampler: any;
  private upResampler: any;
  private downsampleBuffer: Buffer | null = null; // Accumulated buffer for processing
  private isInitialized: boolean;

  constructor(providerSampleRate: number = 24000) {
    // Configuration - Provider sample rate is configurable, client rate is fixed
    this.providerSampleRate = providerSampleRate;
    this.clientSampleRate = 8000; // Fixed for client compatibility
    
    this.downResampler = null;
    this.upResampler = null;
    this.downsampleBuffer = null;
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
    
    // Create downsampler: provider rate -> client rate
    this.downResampler = await create(1, this.providerSampleRate, this.clientSampleRate, {
      converterType: ConverterType.SRC_SINC_FASTEST,
    });

    // Create upsampler: client rate -> provider rate
    this.upResampler = await create(1, this.clientSampleRate, this.providerSampleRate, {
      converterType: ConverterType.SRC_SINC_FASTEST,
    });

    this.isInitialized = true;
  }

  /**
   * Convert Int16 audio samples to Float32 format for resampling
   * @param int16Samples - Input Int16 audio samples
   * @returns Float32 audio samples normalized to [-1, 1]
   */
  static int16ToFloat32(int16Samples: Int16Array): Float32Array {
    const float32Samples = new Float32Array(int16Samples.length);
    for (let i = 0; i < int16Samples.length; i++) {
      float32Samples[i] = int16Samples[i] / 32768; // Normalize to [-1, 1] range
    }
    return float32Samples;
  }

  /**
   * Convert Float32 audio samples back to Int16 format
   * @param float32Samples - Input Float32 audio samples
   * @returns Int16 audio samples
   */
  static float32ToInt16(float32Samples: Float32Array): Int16Array {
    const int16Samples = new Int16Array(float32Samples.length);
    for (let i = 0; i < float32Samples.length; i++) {
      let sample = float32Samples[i] * 32768; // Denormalize from [-1, 1] range
      sample = Math.max(-32768, Math.min(32767, sample)); // Clamp to valid range
      int16Samples[i] = sample;
    }
    return int16Samples;
  }

  /**
   * Calculate buffer sizes based on sample rates
   * @returns Buffer size configuration for processing chunks
   */
  getBufferSizes(): {
    providerChunkSize: number;
    clientChunkSize: number;
    downsampleThreshold: number;
  } {
    // Calculate chunk sizes for different sample rates:
    // - Provider: 10ms chunks at provider rate (e.g., 480 samples at 48000 Hz)
    // - Client: 20ms chunks at client rate (160 samples at 8000 Hz)
    const providerChunkSize = Math.floor(this.providerSampleRate * 0.01 * 2); // 10ms at provider rate, 2 bytes per sample
    const clientChunkSize = Math.floor(this.clientSampleRate * 0.02 * 2); // 20ms at client rate, 2 bytes per sample
    
    return {
      providerChunkSize,
      clientChunkSize,
      downsampleThreshold: providerChunkSize * 2, // Process 2 chunks at a time for better efficiency
    };
  }

  /**
   * Process incoming audio chunks from provider and convert to client format (8000 Hz)
   * Uses buffering to accumulate enough data before processing
   * @param incomingData - Raw audio data from provider
   * @returns Array of converted audio chunks ready for client or empty array if not enough data
   */
  async handleDownsampleChunk(incomingData: Buffer): Promise<Buffer[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  
    const { downsampleThreshold, clientChunkSize } = this.getBufferSizes();
  
    // Combine previous buffer remainder with new incoming data
    const combinedBuffer = this.downsampleBuffer
      ? Buffer.concat([this.downsampleBuffer, incomingData])
      : incomingData;
  
    const outputChunks: Buffer[] = [];
    let processingOffset = 0;
  
    // Process complete chunks while we have enough data
    while (processingOffset + downsampleThreshold <= combinedBuffer.length) {
      const currentChunk = combinedBuffer.subarray(processingOffset, processingOffset + downsampleThreshold);
      processingOffset += downsampleThreshold;
  
      // Convert to Float32 for resampling
      const int16Samples = new Int16Array(currentChunk.buffer, currentChunk.byteOffset, currentChunk.length / 2);
      const float32Samples = AudioResampler.int16ToFloat32(int16Samples);
      
      // Perform downsampling
      const resampledFloat32 = await this.downResampler.simple(float32Samples);
      const resampledInt16 = AudioResampler.float32ToInt16(resampledFloat32);
      const resampledBuffer = Buffer.from(resampledInt16.buffer);
  
      // Split resampled buffer into client-sized chunks
      let resampledOffset = 0;
      while (resampledOffset + clientChunkSize <= resampledBuffer.length) {
        outputChunks.push(resampledBuffer.subarray(resampledOffset, resampledOffset + clientChunkSize));
        resampledOffset += clientChunkSize;
      }
  
      // Save any remaining resampled data for next iteration
      this.downsampleBuffer = resampledOffset < resampledBuffer.length
        ? resampledBuffer.subarray(resampledOffset)
        : null;
    }
  
    // Save unprocessed input data for next call
    this.downsampleBuffer = processingOffset < combinedBuffer.length
      ? combinedBuffer.subarray(processingOffset)
      : this.downsampleBuffer ?? null;
  
    return outputChunks;
  }

  /**
   * Process incoming audio chunks from client (8000 Hz) and convert to provider format
   * @param incomingData - Raw audio data from client
   * @returns Converted audio data ready for provider
   */
  async handleUpsampleChunk(incomingData: Buffer): Promise<Buffer> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Convert to Float32 for resampling
    const int16Samples = new Int16Array(incomingData.buffer, incomingData.byteOffset, incomingData.length / 2);
    const float32Samples = AudioResampler.int16ToFloat32(int16Samples);

    // Perform upsampling
    const resampledFloat32 = this.upResampler.simple(float32Samples);
    const resampledInt16 = AudioResampler.float32ToInt16(resampledFloat32);
    const resampledBuffer = Buffer.from(resampledInt16.buffer);

    return resampledBuffer;
  }

  /**
   * Process any remaining buffered data and return final chunks
   * This should be called when the audio stream ends to flush remaining data
   * @returns Array of final audio chunks, padded with zeros if necessary
   */
  async flushDownsampleRemainder(): Promise<Buffer[]> {
    const { clientChunkSize } = this.getBufferSizes();
    const outputChunks: Buffer[] = [];
  
    if (!this.downsampleBuffer || this.downsampleBuffer.length === 0) {
      return [];
    }
  
    // Convert remaining buffer to Float32 for processing
    const int16Samples = new Int16Array(
      this.downsampleBuffer.buffer,
      this.downsampleBuffer.byteOffset,
      this.downsampleBuffer.length / 2
    );
    const float32Samples = AudioResampler.int16ToFloat32(int16Samples);
  
    // Resample the remaining data
    const resampledFloat32 = await this.downResampler.simple(float32Samples);
    const resampledInt16 = AudioResampler.float32ToInt16(resampledFloat32);
    const resampledBuffer = Buffer.from(resampledInt16.buffer);
  
    // Split into complete client chunks
    let offset = 0;
    while (offset + clientChunkSize <= resampledBuffer.length) {
      outputChunks.push(resampledBuffer.subarray(offset, offset + clientChunkSize));
      offset += clientChunkSize;
    }
  
    // Pad final chunk with zeros if we have remaining data less than a full chunk
    if (offset < resampledBuffer.length) {
      const finalChunk = Buffer.alloc(clientChunkSize, 0); // Fill with zeros
      resampledBuffer.copy(finalChunk, 0, offset); // Copy only the remaining bytes
      outputChunks.push(finalChunk);
    }
  
    this.downsampleBuffer = null; // Clear the buffer
  
    return outputChunks;
  }

  /**
   * Clean up resources and reset internal state
   */
  destroy(): void {
    this.downsampleBuffer = null;
    this.isInitialized = false;
    this.downResampler = null;
    this.upResampler = null;
  }
}

export {
  AudioResampler,
}; 