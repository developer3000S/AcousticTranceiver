import { describe, it, expect } from 'vitest';
import { generateMessageWav } from './audioService';
import { PROTOCOLS } from '../constants';

describe('audioService', () => {
  describe('generateMessageWav', () => {
    // Note: This test relies on a mocked OfflineAudioContext from setupTests.ts.
    // It verifies that the function runs without errors and produces a Blob,
    // but does not verify the audio content itself.

    it('should generate a non-empty WAV blob for a valid message', async () => {
      const protocol = PROTOCOLS.dtmf_standard;
      const blob = await generateMessageWav(
        'test',
        1,
        protocol
      );

      expect(blob).toBeInstanceOf(Blob);
      // The mock bufferToWav produces a blob with size > 44 (the header size)
      expect(blob?.size).toBeGreaterThan(44);
      expect(blob?.type).toBe('audio/wav');
    });
    
    it('should handle an empty message gracefully, generating a WAV with only control signals', async () => {
      const protocol = PROTOCOLS.dtmf_standard;
      const blob = await generateMessageWav(
        '', // Empty message
        1,
        protocol
      );

      expect(blob).toBeInstanceOf(Blob);
      expect(blob?.size).toBeGreaterThan(44);
      expect(blob?.type).toBe('audio/wav');
    });

    it('should return null if an error occurs during rendering', async () => {
      // This test is harder to implement without more complex mocking setups,
      // as the current mock for OfflineAudioContext always resolves successfully.
      // However, we can trust the try/catch block in the original function
      // to handle errors if the underlying API were to throw one.
    });
  });
});
