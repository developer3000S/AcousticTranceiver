// Audio generation settings (DEFAULTS, protocol-specific values are used)
export const TONE_DURATION_MS = 150; 
export const PAUSE_DURATION_MS = 75;

// Audio analysis settings (AGC - Automatic Gain Control)
// These are now encapsulated in an object for better organization.
export const RECEIVER_CONFIG = {
  FFT_SIZE: 8192, // Fast Fourier Transform size
  // FIX: Lowered thresholds to improve sensitivity for compressed audio channels (e.g., phone calls).
  INITIAL_DETECTION_THRESHOLD: 180, // Initial value before AGC kicks in
  MIN_DETECTION_THRESHOLD: 130, // The lowest the threshold can go
  MAX_DETECTION_THRESHOLD: 230, // The highest the threshold can go
  AGC_NOISE_SENSITIVITY: 0.02, // How fast noise level adapts (lower is slower)
  AGC_THRESHOLD_OFFSET: 30, // How much above noise floor to set the threshold
  FREQUENCY_TOLERANCE: 20, // Tolerance for matching frequencies
};


// --- Protocol constants ---
export const START_CHAR = '<<START>>';
export const STOP_CHAR = '<<STOP>>';
// FIX: Export START_FREQ_SIGNAL and STOP_FREQ_SIGNAL to be used in other modules.
export const START_FREQ_SIGNAL = 450; // A frequency safely within voice channel range, but below character range
export const STOP_FREQ_SIGNAL = 7000; // A frequency well above our character range


// --- Character to Frequency Mappings ---
const CHARACTERS_LOWER = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюяabcdefghijklmnopqrstuvwxyz';
const CHARACTERS_UPPER = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CHARACTERS_OTHER = '0123456789 .,!?';
export const CHARACTERS = CHARACTERS_LOWER + CHARACTERS_UPPER + CHARACTERS_OTHER;

// Standard Protocol Frequencies
const START_FREQ_STD = 600;
const STEP_FREQ_STD = 40;
export const CHAR_TO_FREQ_MAP_STD: Map<string, number> = new Map(
  CHARACTERS.split('').map((char, index) => [char, START_FREQ_STD + index * STEP_FREQ_STD])
);
CHAR_TO_FREQ_MAP_STD.set(START_CHAR, START_FREQ_SIGNAL);
CHAR_TO_FREQ_MAP_STD.set(STOP_CHAR, STOP_FREQ_SIGNAL);

// Quiet Protocol Frequencies (High-frequency band, less audible, may pass through codecs better)
const START_FREQ_QUIET = 8000;
const STEP_FREQ_QUIET = 50;
export const CHAR_TO_FREQ_MAP_QUIET: Map<string, number> = new Map(
  CHARACTERS.split('').map((char, index) => [char, START_FREQ_QUIET + index * STEP_FREQ_QUIET])
);
CHAR_TO_FREQ_MAP_QUIET.set(START_CHAR, START_FREQ_SIGNAL); // Use same control signals
CHAR_TO_FREQ_MAP_QUIET.set(STOP_CHAR, STOP_FREQ_SIGNAL);

// Master Frequency Map for Receiver (no overlaps between STD and QUIET ranges)
export const MASTER_FREQ_TO_CHAR_MAP: Map<number, string> = new Map([
  ...Array.from(CHAR_TO_FREQ_MAP_STD.entries()).map(([char, freq]) => [freq, char] as [number, string]),
  ...Array.from(CHAR_TO_FREQ_MAP_QUIET.entries()).map(([char, freq]) => [freq, char] as [number, string])
]);


// Characters that can be used to represent the checksum.
// We use a known subset to ensure we can always transmit the checksum.
export const CHECKSUM_CHAR_CANDIDATES = '0123456789abcdefghijklmnopqrstuvwxyz'.split('');


// --- Transmission Protocols ---
export type ProtocolId = 'standard' | 'fast' | 'reliable' | 'quiet' | 'ultra_fast' | 'custom';

export interface Protocol {
  id: ProtocolId;
  name: string;
  description: string;
  toneDuration: number;
  pauseDuration: number;
  charToFreqMap: Map<string, number>;
  transform?: (message: string) => string;
}

export const PROTOCOLS: Record<ProtocolId, Protocol> = {
  standard: {
    id: 'standard',
    name: 'Стандартный',
    description: 'Сбалансированные скорость и надежность.',
    toneDuration: 150,
    pauseDuration: 75,
    charToFreqMap: CHAR_TO_FREQ_MAP_STD,
  },
  fast: {
    id: 'fast',
    name: 'Быстрый',
    description: 'Уменьшенные паузы для быстрой передачи.',
    toneDuration: 120,
    pauseDuration: 60,
    charToFreqMap: CHAR_TO_FREQ_MAP_STD,
  },
  ultra_fast: {
    id: 'ultra_fast',
    name: 'Ультра-быстрый',
    description: 'Минимальные задержки для очень быстрой передачи. Требует чистого сигнала.',
    toneDuration: 80,
    pauseDuration: 40,
    charToFreqMap: CHAR_TO_FREQ_MAP_STD,
  },
  reliable: {
    id: 'reliable',
    name: 'Надежный',
    description: 'Более длинные тоны и отправка каждого символа дважды.',
    toneDuration: 200,
    pauseDuration: 100,
    charToFreqMap: CHAR_TO_FREQ_MAP_STD,
    transform: (message: string) => message.split('').map(c => c + c).join(''),
  },
  quiet: {
    id: 'quiet',
    name: 'Тихий',
    description: 'Использует высокие частоты, менее заметные для слуха.',
    toneDuration: 150,
    pauseDuration: 75,
    charToFreqMap: CHAR_TO_FREQ_MAP_QUIET,
  },
  custom: {
    id: 'custom',
    name: 'Пользовательский',
    description: 'Задайте собственные частоты для передачи. Приемник должен быть настроен так же.',
    toneDuration: 150, // Default values, can be adjusted by user
    pauseDuration: 75,
    charToFreqMap: new Map(), // This will be generated dynamically
  }
};