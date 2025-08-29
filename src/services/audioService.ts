import { START_CHAR, STOP_CHAR, CHECKSUM_CHAR_CANDIDATES } from '../constants';
import logger from './logger';

let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext => {
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    logger.info('AudioContext created or recreated.');
  }
  return audioContext;
};

/**
 * Calculates a simple checksum for a message.
 * The checksum character is selected from a list of known transmittable characters.
 * @param message The message to process.
 * @returns A single character representing the checksum.
 */
export const calculateChecksum = (message: string): string => {
  if (!message) return CHECKSUM_CHAR_CANDIDATES[0];
  // Simple XOR checksum
  const sum = message.split('').reduce((acc, char) => acc ^ char.charCodeAt(0), 0);
  const index = sum % CHECKSUM_CHAR_CANDIDATES.length;
  return CHECKSUM_CHAR_CANDIDATES[index];
};


const playTone = (frequency: number, duration: number, volume: number): Promise<void> => {
  return new Promise(resolve => {
    logger.log(`Playing tone: ${frequency}Hz for ${duration}ms at volume ${volume}`);
    const context = getAudioContext();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    gainNode.gain.setValueAtTime(volume, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration / 1000);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + duration / 1000);

    oscillator.onended = () => {
      resolve();
    };
  });
};

export const playMessage = async (
  message: string,
  volume: number,
  toneDuration: number,
  pauseDuration: number,
  charToFreqMap: Map<string, number>,
  onProgress: (currentIndex: number | null, totalLength: number, currentToken: string | null, currentFreq: number | null) => void
): Promise<void> => {
  logger.info('Starting message transmission:', message);
  const checksum = calculateChecksum(message);
  // FIX: Treat START, message characters, checksum, and STOP as an array of tokens
  // to prevent iterating over the letters of the control words.
  const transmissionTokens = [START_CHAR, ...message.split(''), checksum, STOP_CHAR];
  
  logger.info(`Full packet: [START]${message}[${checksum}][STOP]`);

  for (let i = 0; i < transmissionTokens.length; i++) {
    const token = transmissionTokens[i];
    const freq = charToFreqMap.get(token);

    // Pass token and frequency to callback
    onProgress(i, transmissionTokens.length, token, freq ?? null);

    if (freq) {
      await playTone(freq, toneDuration, volume);
    } else {
        logger.warn(`Character '${token}' not in frequency map. Playing silence.`);
    }
    
    await new Promise(resolve => setTimeout(resolve, pauseDuration));
  }
  // Pass nulls to callback on completion
  onProgress(null, transmissionTokens.length, null, null); // Signal completion
  logger.info('Message transmission finished.');
};


// --- WAV File Generation ---

const bufferToWav = (buffer: AudioBuffer): Blob => {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const arrayBuffer = new ArrayBuffer(length);
  const view = new DataView(arrayBuffer);
  const channels = [];
  let pos = 0;

  const setUint16 = (data: number) => {
    view.setUint16(pos, data, true);
    pos += 2;
  };

  const setUint32 = (data: number) => {
    view.setUint32(pos, data, true);
    pos += 4;
  };

  // RIFF header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8);
  setUint32(0x45564157); // "WAVE"

  // "fmt " sub-chunk
  setUint32(0x20746d66); // "fmt "
  setUint32(16); // chunk size
  setUint16(1); // audio format (1 = PCM)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // byte rate
  setUint16(numOfChan * 2); // block align
  setUint16(16); // bits per sample

  // "data" sub-chunk
  setUint32(0x61746164); // "data"
  setUint32(length - pos - 4);

  // Write PCM data
  for (let i = 0; i < numOfChan; i++) {
    channels.push(buffer.getChannelData(i));
  }

  for (let i = 0; i < buffer.length; i++) {
    for (let j = 0; j < numOfChan; j++) {
      let sample = Math.max(-1, Math.min(1, channels[j][i]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
  }

  return new Blob([view], { type: 'audio/wav' });
};


export const generateMessageWav = async (
    message: string,
    volume: number,
    toneDuration: number,
    pauseDuration: number,
    charToFreqMap: Map<string, number>
): Promise<Blob | null> => {
    try {
        logger.info('Starting WAV generation for message:', message);
        
        const checksum = calculateChecksum(message);
        // FIX: Treat START, message characters, checksum, and STOP as an array of tokens
        // to prevent iterating over the letters of the control words.
        const transmissionTokens = [START_CHAR, ...message.split(''), checksum, STOP_CHAR];
        logger.info(`Full packet for WAV: [START]${message}[${checksum}][STOP]`);

        const initialPauseSeconds = 1; // Add a 1-second pause at the beginning

        // Use an offline context to render the audio without playing it
        const messageDurationSeconds = transmissionTokens.length * (toneDuration + pauseDuration) / 1000;
        const totalDurationSeconds = messageDurationSeconds + initialPauseSeconds;
        // A standard sample rate for WAV files
        const sampleRate = 44100;
        const offlineContext = new OfflineAudioContext(1, Math.ceil(sampleRate * totalDurationSeconds), sampleRate);

        let currentTime = initialPauseSeconds; // Start tones after the initial pause
        for (const token of transmissionTokens) {
            const freq = charToFreqMap.get(token);
            if (freq) {
                const oscillator = offlineContext.createOscillator();
                const gainNode = offlineContext.createGain();
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(freq, currentTime);
                gainNode.gain.setValueAtTime(volume, currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.0001, currentTime + toneDuration / 1000);
                oscillator.connect(gainNode);
                gainNode.connect(offlineContext.destination);
                oscillator.start(currentTime);
                oscillator.stop(currentTime + toneDuration / 1000);
            }
            currentTime += (toneDuration + pauseDuration) / 1000;
        }

        const renderedBuffer = await offlineContext.startRendering();
        logger.log('Audio rendered to buffer');
        const wavBlob = bufferToWav(renderedBuffer);
        logger.info('WAV blob created, size:', wavBlob.size);
        return wavBlob;
    } catch (err) {
        logger.error('Failed to generate WAV file', err);
        return null;
    }
};