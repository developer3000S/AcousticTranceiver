// Audio analysis settings (AGC - Automatic Gain Control)
export const RECEIVER_CONFIG = {
  FFT_SIZE: 8192, // Fast Fourier Transform size
  INITIAL_DETECTION_THRESHOLD: 180, // Initial value before AGC kicks in
  MIN_DETECTION_THRESHOLD: 130, // The lowest the threshold can go
  MAX_DETECTION_THRESHOLD: 230, // The highest the threshold can go
  AGC_NOISE_SENSITIVITY: 0.02, // How fast noise level adapts (lower is slower)
  AGC_THRESHOLD_OFFSET: 30, // How much above noise floor to set the threshold
  FSK_FREQUENCY_TOLERANCE: 40, // Wider tolerance for FSK to handle call codec shifts
};


// --- Text Encoding Protocol ---
// Defines the character set and their two-digit codes for transmission.

const SUPPORTED_CHARACTERS = 
  'абвгдежзийклмнопрстуфхцчшщъыьэюя' + // 32 chars (excluding ё)
  '0123456789' +
  ' .,!?-';

export const TEXT_ENCODING_MAP: Map<string, string> = new Map(
  SUPPORTED_CHARACTERS.split('').map((char, index) => [
    char,
    index.toString().padStart(2, '0')
  ])
);

// Create the reverse map for decoding
export const TEXT_DECODING_MAP: Map<string, string> = new Map(
  Array.from(TEXT_ENCODING_MAP.entries()).map(([key, value]) => [value, key])
);


// --- FSK Protocol Constants ---
export const FSK_CHARACTERS = '0123456789*#';

// A map where each character has a unique frequency.
const FSK_BASE_FREQUENCY = 1000;
const FSK_FREQUENCY_STEP = 100;
export const FSK_CHAR_TO_FREQ_MAP: Map<string, number> = new Map(
  FSK_CHARACTERS.split('').map((char, index) => [
    char,
    FSK_BASE_FREQUENCY + index * FSK_FREQUENCY_STEP,
  ])
);


// --- Transmission Protocol ---

export interface TransmissionProtocol {
  name: string;
  description: string;
  toneDuration: number;
  pauseDuration: number;
  charToFreqMap: Map<string, number>;
  transform: (message: string) => string;
}

/**
 * Transforms a user-facing message into a transmittable packet.
 * 1. Filters the message to only include supported characters.
 * 2. Encodes each character into its two-digit numerical code.
 * 3. Joins the codes into a single string of digits.
 * 4. Wraps the result with start (*) and end (#) markers.
 * e.g., "привет" -> "*151608010419#"
 */
const fskTransform = (message: string): string => {
    const encoded = message
        .toLowerCase()
        .split('')
        .filter(char => TEXT_ENCODING_MAP.has(char))
        .map(char => TEXT_ENCODING_MAP.get(char)!)
        .join('');
    // Wrap the packet with start and end markers.
    return `*${encoded}#`;
};

export const TRANSMISSION_PROTOCOL: TransmissionProtocol = {
    name: 'FSK (Частотная модуляция)',
    description: 'Оптимизирован для надежной передачи цифровых данных.',
    toneDuration: 75,
    pauseDuration: 35,
    charToFreqMap: FSK_CHAR_TO_FREQ_MAP,
    transform: fskTransform,
};
