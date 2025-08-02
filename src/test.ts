import { AudioResampler } from './index';

async function testAudioResampler() {
  console.log('Testing AudioResampler...');

  // Test with default provider sample rate (24000 Hz)
  const resampler1 = new AudioResampler();
  console.log('Created resampler with default provider rate:', resampler1);

  // Test with custom provider sample rate (48000 Hz)
  const resampler2 = new AudioResampler(48000);
  console.log('Created resampler with 48kHz provider rate:', resampler2);

  // Test buffer sizes
  const bufferSizes1 = resampler1.getBufferSizes();
  const bufferSizes2 = resampler2.getBufferSizes();
  
  console.log('Buffer sizes for 24kHz provider:', bufferSizes1);
  console.log('Buffer sizes for 48kHz provider:', bufferSizes2);

  // Test static methods
  const testInt16 = new Int16Array([1000, -1000, 500, -500]);
  const float32 = AudioResampler.int16ToFloat32(testInt16);
  const backToInt16 = AudioResampler.float32ToInt16(float32);
  
  console.log('Original Int16:', testInt16);
  console.log('Converted Float32:', float32);
  console.log('Back to Int16:', backToInt16);

  // Test initialization
  await resampler1.initialize();
  await resampler2.initialize();
  console.log('Resamplers initialized successfully');

  // Test with sample audio data (silence)
  const sampleAudio = Buffer.alloc(480); // 240 samples at 24kHz
  const result1 = await resampler1.handleDownsampleChunk(sampleAudio);
  console.log('Downsample result (24kHz):', result1 ? result1.length : 'null');

  const sampleAudio2 = Buffer.alloc(960); // 480 samples at 48kHz
  const result2 = await resampler2.handleDownsampleChunk(sampleAudio2);
  console.log('Downsample result (48kHz):', result2 ? result2.length : 'null');

  // Test upsampling
  const clientAudio = Buffer.alloc(320); // 160 samples at 8kHz
  const upsampled1 = await resampler1.handleUpsampleChunk(clientAudio);
  const upsampled2 = await resampler2.handleUpsampleChunk(clientAudio);
  
  console.log('Upsampled (24kHz provider):', upsampled1.length);
  console.log('Upsampled (48kHz provider):', upsampled2.length);

  // Clean up
  resampler1.destroy();
  resampler2.destroy();
  console.log('Test completed successfully');
}

// Run test if this file is executed directly
if (require.main === module) {
  testAudioResampler().catch(console.error);
} 