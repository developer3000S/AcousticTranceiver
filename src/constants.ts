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
  DTMF_FREQUENCY_TOLERANCE: 15, // Stricter tolerance for DTMF
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
// FIX: Shifted the standard protocol frequency range higher to avoid collision with DTMF tones.
const START_FREQ_STD = 2000;
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


// --- DTMF Protocol Constants ---
export const DTMF_CHARACTERS = '123456789*0#';
const DTMF_LOW_FREQS = [697, 770, 852, 941];
const DTMF_HIGH_FREQS = [1209, 1336, 1477]; // Standard telephone keypad only has 3 high-freq columns

export const DTMF_FREQUENCIES: { [key: string]: [number, number] } = {
  '1': [DTMF_LOW_FREQS[0], DTMF_HIGH_FREQS[0]], // 697, 1209
  '2': [DTMF_LOW_FREQS[0], DTMF_HIGH_FREQS[1]], // 697, 1336
  '3': [DTMF_LOW_FREQS[0], DTMF_HIGH_FREQS[2]], // 697, 1477
  '4': [DTMF_LOW_FREQS[1], DTMF_HIGH_FREQS[0]], // 770, 1209
  '5': [DTMF_LOW_FREQS[1], DTMF_HIGH_FREQS[1]], // 770, 1336
  '6': [DTMF_LOW_FREQS[1], DTMF_HIGH_FREQS[2]], // 770, 1477
  '7': [DTMF_LOW_FREQS[2], DTMF_HIGH_FREQS[0]], // 852, 1209
  '8': [DTMF_LOW_FREQS[2], DTMF_HIGH_FREQS[1]], // 852, 1336
  '9': [DTMF_LOW_FREQS[2], DTMF_HIGH_FREQS[2]], // 852, 1477
  '*': [DTMF_LOW_FREQS[3], DTMF_HIGH_FREQS[0]], // 941, 1209
  '0': [DTMF_LOW_FREQS[3], DTMF_HIGH_FREQS[1]], // 941, 1336
  '#': [DTMF_LOW_FREQS[3], DTMF_HIGH_FREQS[2]], // 941, 1477
};

export const CHAR_TO_FREQ_MAP_DTMF: Map<string, number[]> = new Map(Object.entries(DTMF_FREQUENCIES));
CHAR_TO_FREQ_MAP_DTMF.set(START_CHAR, [START_FREQ_SIGNAL]); // Use single tones for control signals
CHAR_TO_FREQ_MAP_DTMF.set(STOP_CHAR, [STOP_FREQ_SIGNAL]);


// --- Text-to-DTMF Protocol Encoding Maps ---
// A reduced character set to fit within 100 two-digit codes (00-99).
const TEXT_PROTOCOL_CHARS_LOWER = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюяabcdefghijklmnopqrstuvwxyz';
const TEXT_PROTOCOL_CHARS_OTHER = '0123456789 .,!?';
export const TEXT_PROTOCOL_CHARSET = TEXT_PROTOCOL_CHARS_LOWER + TEXT_PROTOCOL_CHARS_OTHER;

// Create two-digit encoding map
export const TEXT_ENCODING_MAP: Map<string, string> = new Map(
  TEXT_PROTOCOL_CHARSET.split('').map((char, index) => [char, String(index).padStart(2, '0')])
);

// Create decoding map for the receiver
export const TEXT_DECODING_MAP: Map<string, string> = new Map(
  Array.from(TEXT_ENCODING_MAP.entries()).map(([char, code]) => [code, char])
);


// Master Frequency Map for Receiver (no overlaps between STD and QUIET ranges)
export const MASTER_FREQ_TO_CHAR_MAP: Map<number, string> = new Map([
  ...Array.from(CHAR_TO_FREQ_MAP_STD.entries()).map(([char, freq]) => [freq, char] as [number, string]),
  ...Array.from(CHAR_TO_FREQ_MAP_QUIET.entries()).map(([char, freq]) => [freq, char] as [number, string])
]);


// Characters that can be used to represent the checksum.
// We use a known subset to ensure we can always transmit the checksum.
export const CHECKSUM_CHAR_CANDIDATES = '0123456789abcdefghijklmnopqrstuvwxyz'.split('');


// --- Transmission Protocols ---
export type ProtocolId = 'standard' | 'fast' | 'reliable' | 'quiet' | 'dtmf' | 'text_to_dtmf' | 'ultra_fast' | 'custom';

export interface Protocol {
  id: ProtocolId;
  name: string;
  description: string;
  toneDuration: number;
  pauseDuration: number;
  // FIX: Value can be a single frequency (number) or multiple for DTMF (number[])
  charToFreqMap: Map<string, number | number[]>;
  // If true, audioService will not add START/STOP/CHECKSUM. The transform function must create the full packet.
  customPacketHandling?: boolean;
  transform?: (message: string) => string;
}

export const PROTOCOLS: Record<string, Protocol> = {
  standard: {
    id: 'standard',
    name: 'Стандартный',
    description: 'Сбалансированные скорость и надежность. (FSK)',
    toneDuration: 150,
    pauseDuration: 75,
    charToFreqMap: CHAR_TO_FREQ_MAP_STD,
  },
  text_to_dtmf: {
    id: 'text_to_dtmf',
    name: 'Текст в DTMF (Цифровой)',
    description: 'Кодирует текст (только строчные буквы и цифры) в цифры и передает через DTMF. Надежно.',
    toneDuration: 150,
    pauseDuration: 100,
    charToFreqMap: CHAR_TO_FREQ_MAP_DTMF,
    customPacketHandling: true,
    transform: (message: string) => {
      // Message is pre-filtered for supported chars. Here we just encode and frame.
      const encoded = message.toLowerCase().split('').map(char => TEXT_ENCODING_MAP.get(char) || '').join('');
      return `*${encoded}#`;
    },
  },
  dtmf: {
    id: 'dtmf',
    name: 'DTMF (Телеф. тоны)',
    description: 'Использует стандартные телефонные тоны. Только цифры, * и #.',
    toneDuration: 150,
    pauseDuration: 100, // Slightly longer pause for DTMF stability
    charToFreqMap: CHAR_TO_FREQ_MAP_DTMF,
  },
  fast: {
    id: 'fast',
    name: 'Быстрый (FSK)',
    description: 'Уменьшенные паузы для быстрой передачи.',
    toneDuration: 120,
    pauseDuration: 60,
    charToFreqMap: CHAR_TO_FREQ_MAP_STD,
  },
  ultra_fast: {
    id: 'ultra_fast',
    name: 'Ультра-быстрый (FSK)',
    description: 'Минимальные задержки. Требует чистого сигнала.',
    toneDuration: 80,
    pauseDuration: 40,
    charToFreqMap: CHAR_TO_FREQ_MAP_STD,
  },
  reliable: {
    id: 'reliable',
    name: 'Надежный (FSK)',
    description: 'Более длинные тоны и отправка каждого символа дважды.',
    toneDuration: 200,
    pauseDuration: 100,
    charToFreqMap: CHAR_TO_FREQ_MAP_STD,
    transform: (message: string) => message.split('').map(c => c + c).join(''),
  },
  quiet: {
    id: 'quiet',
    name: 'Тихий (FSK)',
    description: 'Использует высокие частоты, менее заметные для слуха.',
    toneDuration: 150,
    pauseDuration: 75,
    charToFreqMap: CHAR_TO_FREQ_MAP_QUIET,
  },
  custom: {
    id: 'custom',
    name: 'Пользовательский (FSK)',
    description: 'Задайте собственные частоты для передачи. Приемник должен быть настроен так же.',
    toneDuration: 150, // Default values, can be adjusted by user
    pauseDuration: 75,
    charToFreqMap: new Map(), // This will be generated dynamically
  }
};