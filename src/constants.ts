// Audio generation settings
export const TONE_DURATION_MS = 150; 
export const PAUSE_DURATION_MS = 100;

// Audio analysis settings (AGC - Automatic Gain Control)
export const RECEIVER_CONFIG = {
  FFT_SIZE: 8192, // Fast Fourier Transform size
  INITIAL_DETECTION_THRESHOLD: 180, // Initial value before AGC kicks in
  MIN_DETECTION_THRESHOLD: 130, // The lowest the threshold can go
  MAX_DETECTION_THRESHOLD: 230, // The highest the threshold can go
  AGC_NOISE_SENSITIVITY: 0.02, // How fast noise level adapts (lower is slower)
  AGC_THRESHOLD_OFFSET: 30, // How much above noise floor to set the threshold
  DTMF_FREQUENCY_TOLERANCE: 15, // Stricter tolerance for DTMF
};


// --- DTMF Protocol Constants ---
export const DTMF_CHARACTERS = '123456789*0#';
const DTMF_LOW_FREQS = [697, 770, 852, 941];
const DTMF_HIGH_FREQS = [1209, 1336, 1477];

export const DTMF_FREQUENCIES: { [key: string]: [number, number] } = {
  '1': [DTMF_LOW_FREQS[0], DTMF_HIGH_FREQS[0]],
  '2': [DTMF_LOW_FREQS[0], DTMF_HIGH_FREQS[1]],
  '3': [DTMF_LOW_FREQS[0], DTMF_HIGH_FREQS[2]],
  '4': [DTMF_LOW_FREQS[1], DTMF_HIGH_FREQS[0]],
  '5': [DTMF_LOW_FREQS[1], DTMF_HIGH_FREQS[1]],
  '6': [DTMF_LOW_FREQS[1], DTMF_HIGH_FREQS[2]],
  '7': [DTMF_LOW_FREQS[2], DTMF_HIGH_FREQS[0]],
  '8': [DTMF_LOW_FREQS[2], DTMF_HIGH_FREQS[1]],
  '9': [DTMF_LOW_FREQS[2], DTMF_HIGH_FREQS[2]],
  '*': [DTMF_LOW_FREQS[3], DTMF_HIGH_FREQS[0]],
  '0': [DTMF_LOW_FREQS[3], DTMF_HIGH_FREQS[1]],
  '#': [DTMF_LOW_FREQS[3], DTMF_HIGH_FREQS[2]],
};

// This is the only frequency map now.
export const CHAR_TO_FREQ_MAP_DTMF: Map<string, number[]> = new Map(Object.entries(DTMF_FREQUENCIES));


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


// --- Transmission Protocols ---
export type ProtocolId = 'dtmf_standard' | 'dtmf_fast' | 'dtmf_ultra_fast' | 'dtmf_reliable' | 'dtmf_quiet' | 'dtmf_ultra_quiet' | 'custom';

export interface Protocol {
  id: ProtocolId;
  name: string;
  description: string;
  toneDuration: number;
  pauseDuration: number;
  charToFreqMap: Map<string, number[]>;
  // All protocols are now custom handled. The transform function must create the full packet.
  customPacketHandling: true;
  transform: (message: string) => string;
}

const baseDtmfTransform = (message: string): string => {
    const encoded = message.toLowerCase().split('').map(char => TEXT_ENCODING_MAP.get(char) || '').join('');
    return `*${encoded}#`;
};

export const PROTOCOLS: Record<ProtocolId, Protocol> = {
  dtmf_standard: {
    id: 'dtmf_standard',
    name: 'Стандартный',
    description: 'Сбалансированные скорость и надежность.',
    toneDuration: 150,
    pauseDuration: 100,
    charToFreqMap: CHAR_TO_FREQ_MAP_DTMF,
    customPacketHandling: true,
    transform: baseDtmfTransform,
  },
  dtmf_fast: {
    id: 'dtmf_fast',
    name: 'Быстрый',
    description: 'Уменьшенные паузы для быстрой передачи.',
    toneDuration: 100,
    pauseDuration: 60,
    charToFreqMap: CHAR_TO_FREQ_MAP_DTMF,
    customPacketHandling: true,
    transform: baseDtmfTransform,
  },
  dtmf_ultra_fast: {
    id: 'dtmf_ultra_fast',
    name: 'Ультра-быстрый',
    description: 'Минимальные задержки. Требует чистого сигнала.',
    toneDuration: 70,
    pauseDuration: 35,
    charToFreqMap: CHAR_TO_FREQ_MAP_DTMF,
    customPacketHandling: true,
    transform: baseDtmfTransform,
  },
  dtmf_reliable: {
    id: 'dtmf_reliable',
    name: 'Надежный',
    description: 'Более длинные тоны и отправка каждой цифры дважды.',
    toneDuration: 200,
    pauseDuration: 120,
    charToFreqMap: CHAR_TO_FREQ_MAP_DTMF,
    customPacketHandling: true,
    transform: (message: string) => {
      const encoded = message.toLowerCase().split('').map(char => TEXT_ENCODING_MAP.get(char) || '').join('');
      // Duplicate each digit of the encoded string
      const duplicatedEncoded = encoded.split('').map(digit => digit + digit).join('');
      return `*${duplicatedEncoded}#`;
    },
  },
  dtmf_quiet: {
    id: 'dtmf_quiet',
    name: 'Тихий',
    description: 'Очень длинные тоны и паузы для прохождения через помехи.',
    toneDuration: 300,
    pauseDuration: 200,
    charToFreqMap: CHAR_TO_FREQ_MAP_DTMF,
    customPacketHandling: true,
    transform: baseDtmfTransform,
  },
  dtmf_ultra_quiet: {
    id: 'dtmf_ultra_quiet',
    name: 'Сверх-тихий',
    description: 'Максимальная длина тонов для экстремальных условий.',
    toneDuration: 500,
    pauseDuration: 350,
    charToFreqMap: CHAR_TO_FREQ_MAP_DTMF,
    customPacketHandling: true,
    transform: baseDtmfTransform,
  },
  custom: {
    id: 'custom',
    name: 'Пользовательский',
    description: 'Ручная настройка длительности тона и пауз.',
    toneDuration: 150, // Default values, will be adjusted by user
    pauseDuration: 100,
    charToFreqMap: CHAR_TO_FREQ_MAP_DTMF,
    customPacketHandling: true,
    transform: baseDtmfTransform,
  }
};
