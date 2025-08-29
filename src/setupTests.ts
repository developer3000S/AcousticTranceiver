import { vi } from 'vitest';

// Mock Web Audio API for jsdom environment
// It doesn't need to be perfect, just enough to prevent crashes during tests.

const mockAudioBuffer = {
  getChannelData: vi.fn(() => new Float32Array(100)),
  length: 100,
  numberOfChannels: 1,
  sampleRate: 44100,
  copyFromChannel: vi.fn(),
  copyToChannel: vi.fn(),
  duration: 1,
};

const mockAudioContext = {
  decodeAudioData: vi.fn(),
  createBuffer: vi.fn(),
  createBufferSource: vi.fn(),
  createGain: vi.fn(() => ({
    connect: vi.fn(),
    gain: {
      value: 1,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
  })),
  createOscillator: vi.fn(() => ({
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    type: 'sine',
    frequency: {
      value: 440,
      setValueAtTime: vi.fn(),
    },
    onended: null,
  })),
  resume: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  destination: {},
  currentTime: 0,
  sampleRate: 44100,
  state: 'running',
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
};

const mockOfflineAudioContext = vi.fn().mockImplementation(() => ({
  ...mockAudioContext,
  startRendering: vi.fn().mockResolvedValue(mockAudioBuffer),
  length: 44100,
  oncomplete: null,
}));


Object.defineProperty(window, 'AudioContext', {
  writable: true,
  value: vi.fn().mockImplementation(() => mockAudioContext),
});

Object.defineProperty(window, 'OfflineAudioContext', {
    writable: true,
    value: mockOfflineAudioContext,
});

Object.defineProperty(window, 'webkitAudioContext', {
    writable: true,
    value: vi.fn().mockImplementation(() => mockAudioContext),
});
