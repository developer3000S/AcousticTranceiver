// FIX: The `waitFor` utility is not always correctly exported from '@testing-library/react' in some test environments or older versions. Importing it directly from '@testing-library/dom' is a robust workaround, as `@testing-library/react` re-exports it from there.
import { renderHook, act } from '@testing-library/react';
import { waitFor } from '@testing-library/dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAudioProcessor } from './useAudioProcessor';
import { RECEIVER_CONFIG, FSK_CHAR_TO_FREQ_MAP } from '../constants';
import logger from '../services/logger';
import soundService from '../services/soundService';

// Mock services to prevent side effects and allow for spying
vi.mock('../services/logger');
vi.mock('../services/soundService');

// --- Mocks for Browser APIs ---

const MOCK_SAMPLE_RATE = 44100;

// Mock implementation for AnalyserNode
const createMockAnalyserNode = () => ({
  fftSize: RECEIVER_CONFIG.FFT_SIZE,
  frequencyBinCount: RECEIVER_CONFIG.FFT_SIZE / 2,
  getByteFrequencyData: vi.fn((array) => {
    // Fill with some baseline noise
    array.fill(10);
  }),
  connect: vi.fn(),
  disconnect: vi.fn(),
});

let mockAnalyserNode = createMockAnalyserNode();

// Mock implementation for AudioContext
const mockAudioContext = {
  sampleRate: MOCK_SAMPLE_RATE,
  createAnalyser: vi.fn(() => mockAnalyserNode),
  createMediaStreamSource: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
  close: vi.fn().mockResolvedValue(undefined),
  resume: vi.fn().mockResolvedValue(undefined),
  state: 'running',
};

// Mock for getUserMedia
// FIX: `navigator.mediaDevices` is a read-only property. Use `Object.defineProperty` to mock it.
Object.defineProperty(global.navigator, 'mediaDevices', {
  writable: true,
  value: {
    ...global.navigator.mediaDevices,
    getUserMedia: vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream),
  },
});

// --- Test Suite ---

describe('useAudioProcessor', () => {
  let animationFrameCallback: FrameRequestCallback | null = null;

  // Helper function to simulate a FSK tone by manipulating the analyser's mock data
  const simulateTone = (char: string | null) => {
    mockAnalyserNode.getByteFrequencyData.mockImplementation((array: Uint8Array) => {
      array.fill(20); // Background noise
      if (char && FSK_CHAR_TO_FREQ_MAP.has(char)) {
        const freq = FSK_CHAR_TO_FREQ_MAP.get(char)!;
        const freqPerBin = MOCK_SAMPLE_RATE / RECEIVER_CONFIG.FFT_SIZE;
        
        const bin = Math.round(freq / freqPerBin);

        if(bin < array.length) array[bin] = 200; // Above threshold
      }
    });
    // Manually trigger the analysis loop
    if (animationFrameCallback) {
      animationFrameCallback(performance.now());
    }
  };
  
  // Helper to run the loop multiple times for state changes
  const runAnalysisLoop = (times = 1) => {
      for(let i = 0; i < times; i++) {
        if (animationFrameCallback) {
            animationFrameCallback(performance.now());
        }
      }
  };

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    mockAnalyserNode = createMockAnalyserNode();
    vi.spyOn(window, 'AudioContext').mockImplementation(() => mockAudioContext as any);
    
    // Spy on requestAnimationFrame to control the analysis loop manually
    animationFrameCallback = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        animationFrameCallback = cb;
        return 0; // Return a dummy ID
    });
    
    // Use fake timers to control timeouts
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Clean up mocks
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should successfully decode a valid encoded sequence', async () => {
    const { result } = renderHook(() => useAudioProcessor());

    // Start listening
    await act(async () => {
      await result.current.startListening();
    });

    // Simulate the sequence for "тест" -> "*19041819#"
    // т -> 19, е -> 04, с -> 18, т -> 19
    const sequence = ['*', '1', '9', '0', '4', '1', '8', '1', '9', '#'];
    
    for (const char of sequence) {
        act(() => simulateTone(char));
        act(() => simulateTone(null)); // Silence between tones
    }
    
    await waitFor(() => {
      expect(result.current.decodedMessages.length).toBe(1);
    });
    
    const lastMessage = result.current.decodedMessages[0];
    expect(lastMessage.text).toBe('тест');
    expect(lastMessage.status).toBe('success');
    expect(soundService.playSuccess).toHaveBeenCalled();
  });

  it('should return an error for a packet with an odd number of digits', async () => {
    const { result } = renderHook(() => useAudioProcessor());
    await act(async () => { await result.current.startListening(); });

    // Simulate "*123#"
    const sequence = ['*', '1', '2', '3', '#'];
    for (const char of sequence) {
        act(() => simulateTone(char));
        act(() => simulateTone(null));
    }

    await waitFor(() => {
        expect(result.current.decodedMessages.length).toBe(1);
    });

    const lastMessage = result.current.decodedMessages[0];
    expect(lastMessage.text).toBe('[Ошибка: Нечетные данные]');
    expect(lastMessage.status).toBe('error');
    expect(soundService.playError).toHaveBeenCalled();
  });
  
  it('should handle a message timeout error', async () => {
    const { result } = renderHook(() => useAudioProcessor());

    await act(async () => {
      await result.current.startListening();
    });

    // Start a message but don't finish it
    act(() => simulateTone('*'));
    act(() => simulateTone(null));
    act(() => simulateTone('1'));
    act(() => simulateTone(null));
    act(() => simulateTone('2'));
    
    // Advance time by 6 seconds to trigger the timeout
    await act(async () => {
        vi.advanceTimersByTime(6000);
    });

    // Run the analysis loop to detect the timeout
    act(() => runAnalysisLoop());

    await waitFor(() => {
        expect(result.current.decodedMessages.length).toBe(1);
    });

    const lastMessage = result.current.decodedMessages[0];
    expect(lastMessage.text).toBe('[Тайм-аут: 12]');
    expect(lastMessage.status).toBe('error');
    expect(soundService.playError).toHaveBeenCalled();
  });

  it('should handle an interrupted session with a new start signal', async () => {
    const { result } = renderHook(() => useAudioProcessor());

    await act(async () => {
        await result.current.startListening();
    });

    // Start a message
    act(() => simulateTone('*'));
    act(() => simulateTone(null));
    act(() => simulateTone('1'));
    
    // Interrupt with a new start signal
    act(() => simulateTone('*'));

    await waitFor(() => {
        expect(result.current.decodedMessages.length).toBe(1);
    });

    const lastMessage = result.current.decodedMessages[0];
    expect(lastMessage.text).toBe('[Новый старт: 1]');
    expect(lastMessage.status).toBe('error');
    
    // Check that a new message can be received correctly. Test for "ок" -> "*1410#"
    act(() => simulateTone(null));
    act(() => simulateTone('1'));
    act(() => simulateTone(null));
    act(() => simulateTone('4'));
    act(() => simulateTone(null));
    act(() => simulateTone('1'));
    act(() => simulateTone(null));
    act(() => simulateTone('0'));
    act(() => simulateTone(null));
    act(() => simulateTone('#'));
    
    await waitFor(() => {
        expect(result.current.decodedMessages.length).toBe(2);
    });
    
    const newMessage = result.current.decodedMessages[1];
    expect(newMessage.text).toBe('ок');
    expect(newMessage.status).toBe('success');
  });

  it('should ignore data received before the start signal (*)', async () => {
      const { result } = renderHook(() => useAudioProcessor());
      await act(async () => {
          await result.current.startListening();
      });

      // Send digits before start
      act(() => simulateTone('1'));
      act(() => simulateTone(null));
      act(() => simulateTone('2'));
      
      // State should not have changed, no messages
      expect(result.current.decodedMessages.length).toBe(0);

      // Now start a proper message "a" -> "00"
      act(() => simulateTone('*'));
      act(() => simulateTone(null));
      act(() => simulateTone('0'));
      act(() => simulateTone(null));
      act(() => simulateTone('0'));
      act(() => simulateTone(null));
      act(() => simulateTone('#'));

      await waitFor(() => {
          expect(result.current.decodedMessages.length).toBe(1);
      });
      expect(result.current.decodedMessages[0].text).toBe('а');
  });
  
  it('should ignore a stop signal (#) if no session is active', async () => {
      const { result } = renderHook(() => useAudioProcessor());
      await act(async () => {
          await result.current.startListening();
      });

      // Send a stop signal without a start
      act(() => simulateTone('#'));
      
      // Give it a moment, but nothing should happen
      await act(async () => {
          vi.advanceTimersByTime(100);
      });

      expect(result.current.decodedMessages.length).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith('Стоп-сигнал (#) получен вне сессии. Игнорируется.');
  });
});
