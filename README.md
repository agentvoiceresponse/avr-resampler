# Agent Voice Response - Resampler

[![Discord](https://img.shields.io/discord/1347239846632226998?label=Discord&logo=discord)](https://discord.gg/DFTU69Hg74)
[![GitHub Repo stars](https://img.shields.io/github/stars/agentvoiceresponse/avr-resampler?style=social)](https://github.com/agentvoiceresponse/avr-resampler)
[![npm version](https://img.shields.io/npm/v/avr-resampler.svg)](https://www.npmjs.com/package/avr-resampler)
[![npm downloads](https://img.shields.io/npm/dm/avr-resampler.svg)](https://www.npmjs.com/package/avr-resampler)
[![Ko-fi](https://img.shields.io/badge/Support%20us%20on-Ko--fi-ff5e5b.svg)](https://ko-fi.com/agentvoiceresponse)

A TypeScript npm package for audio resampling between different sample rates, specifically designed for AVR (Agent Voice Response) STS or TTS service integration.

## Features

- **Configurable Provider Sample Rate**: Set the provider sample rate via constructor parameter
- **Fixed Client Sample Rate**: Client sample rate is fixed at 8000 Hz for compatibility (Asterisk AudioSocket Module)
- **Bidirectional Resampling**: Handle both upsampling (client → provider) and downsampling (provider → client)
- **Buffered Processing**: Accumulates audio chunks for optimal processing
- **TypeScript Support**: Full TypeScript support with type definitions

## Installation

```bash
npm install avr-resampler
```

## Usage

### Basic Usage

```typescript
import { AudioResampler } from 'avr-resampler';

const customResampler = new AudioResampler(48000); // 48 kHz provider rate
const result = await customResampler.handleDownsampleChunk(audioBuffer);
```

### Constructor Parameters

- `providerSampleRate` (number, optional): The sample rate of the audio provider in Hz. Defaults to 24000 Hz.

### Methods

#### `handleDownsampleChunk(data: Buffer): Promise<Buffer | null>`

Processes incoming audio chunks from the provider and converts them to client format (8000 Hz).

- **Input**: Raw audio data from provider
- **Output**: Converted audio data or `null` if not enough data accumulated
- **Usage**: Call repeatedly with incoming audio chunks

#### `handleUpsampleChunk(data: Buffer): Promise<Buffer>`

Processes incoming audio chunks from the client (8000 Hz) and converts them to provider format.

- **Input**: Raw audio data from client
- **Output**: Converted audio data for provider
- **Usage**: Call with client audio chunks

#### `destroy(): void`

Cleans up resources and resets the resampler state.

#### `initialize(): Promise<void>`

Initializes the audio resamplers. Called automatically when needed.

### Static Methods

#### `AudioResampler.int16ToFloat32(int16: Int16Array): Float32Array`

Converts Int16 audio samples to Float32 format for resampling.

#### `AudioResampler.float32ToInt16(float32: Float32Array): Int16Array`

Converts Float32 audio samples back to Int16 format.

## Example

```typescript
import { AudioResampler } from 'avr-resampler';

// Create resampler for 48 kHz provider
const resampler = new AudioResampler(48000);

// Process provider audio → client audio
const providerAudio = Buffer.from([/* your audio data */]);
const clientAudio = await resampler.handleDownsampleChunk(providerAudio);

if (clientAudio) {
  // Send to client
  sendToClient(clientAudio);
}

// Process client audio → provider audio
const clientInput = Buffer.from([/* client audio data */]);
const providerInput = await resampler.handleUpsampleChunk(clientInput);

// Send to provider
sendToProvider(providerInput);

// Clean up when done
resampler.destroy();
```

## Buffer Sizes

The package automatically calculates optimal buffer sizes based on sample rates:

- **Provider Chunk Size**: 10ms of audio at provider sample rate
- **Client Chunk Size**: 20ms of audio at 8000 Hz
- **Downsample Threshold**: 2 provider chunks for processing

## Dependencies

- `@alexanderolsen/libsamplerate-js`: Audio resampling library

## Support & Community

*   **GitHub:** [https://github.com/agentvoiceresponse](https://github.com/agentvoiceresponse) - Report issues, contribute code.
*   **Discord:** [https://discord.gg/DFTU69Hg74](https://discord.gg/DFTU69Hg74) - Join the community discussion.
*   **Docker Hub:** [https://hub.docker.com/u/agentvoiceresponse](https://hub.docker.com/u/agentvoiceresponse) - Find Docker images.
*   **NPM:** [https://www.npmjs.com/~agentvoiceresponse](https://www.npmjs.com/~agentvoiceresponse) - Browse our packages.
*   **Wiki:** [https://wiki.agentvoiceresponse.com/en/home](https://wiki.agentvoiceresponse.com/en/home) - Project documentation and guides.

## Support AVR

AVR is free and open-source. If you find it valuable, consider supporting its development:

<a href="https://ko-fi.com/agentvoiceresponse" target="_blank"><img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support us on Ko-fi"></a>

## License

MIT License - see the [LICENSE](LICENSE.md) file for details.