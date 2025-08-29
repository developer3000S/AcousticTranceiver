import { START_CHAR, STOP_CHAR, CHECKSUM_CHAR_CANDIDATES, Protocol } from '../constants';
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

/**
 * Plays one or more audio frequencies simultaneously.
 * @param frequencies An array of frequencies to play.
 * @param duration The duration in milliseconds.
 * @param volume The playback volume (0 to 1).
 * @returns A promise that resolves when the tone has finished playing.
 */
const playTones = (frequencies: number[], duration: number, volume: number): Promise<void> => {
  return new Promise(resolve => {
    logger.log(`Playing tone(s): ${frequencies.join(', ')}Hz for ${duration}ms at volume ${volume}`);
    const context = getAudioContext();
    const gainNode = context.createGain();
    gainNode.gain.setValueAtTime(volume, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration / 1000);
    gainNode.connect(context.destination);

    const oscillators = frequencies.map(freq => {
        const oscillator = context.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(freq, context.currentTime);
        oscillator.connect(gainNode);
        return oscillator;
    });

    oscillators.forEach(osc => osc.start(context.currentTime));
    oscillators.forEach(osc => osc.stop(context.currentTime + duration / 1000));

    // Resolve when the first oscillator finishes, as they all have the same duration.
    oscillators[0].onended = () => {
      resolve();
    };
  });
};

export const playMessage = async (
  message: string,
  volume: number,
  protocol: Protocol,
  pauseDuration: number,
  onProgress: (currentIndex: number | null, totalLength: number, currentToken: string | null, currentFreq: number | null) => void
): Promise<void> => {
  logger.info('Starting message transmission:', message);

  let transmissionTokens: string[];
  const { charToFreqMap, toneDuration } = protocol;

  if (protocol.customPacketHandling && protocol.transform) {
    const fullPacket = protocol.transform(message);
    transmissionTokens = fullPacket.split('');
    logger.info(`Full packet (custom handling): ${fullPacket}`);
  } else {
    const transformedMessage = protocol.transform ? protocol.transform(message) : message;
    const checksum = calculateChecksum(transformedMessage);
    transmissionTokens = [START_CHAR, ...transformedMessage.split(''), checksum, STOP_CHAR];
    logger.info(`Full packet: [START]${transformedMessage}[${checksum}][STOP]`);
  }
  
  for (let i = 0; i < transmissionTokens.length; i++) {
    const token = transmissionTokens[i];
    const freqsValue = charToFreqMap.get(token);
    const freqsArray = freqsValue ? (Array.isArray(freqsValue) ? freqsValue : [freqsValue]) : [];

    // Pass token and the first frequency (for visualizer) to callback
    onProgress(i, transmissionTokens.length, token, freqsArray.length > 0 ? freqsArray[0] : null);

    if (freqsArray.length > 0) {
      await playTones(freqsArray, toneDuration, volume);
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
    protocol: Protocol,
    pauseDuration: number,
): Promise<Blob | null> => {
    try {
        logger.info('Starting WAV generation for message:', message);
        
        const { charToFreqMap, toneDuration } = protocol;
        let transmissionTokens: string[];

        if (protocol.customPacketHandling && protocol.transform) {
            const fullPacket = protocol.transform(message);
            transmissionTokens = fullPacket.split('');
            logger.info(`Full packet for WAV (custom handling): ${fullPacket}`);
        } else {
            const transformedMessage = protocol.transform ? protocol.transform(message) : message;
            const checksum = calculateChecksum(transformedMessage);
            transmissionTokens = [START_CHAR, ...transformedMessage.split(''), checksum, STOP_CHAR];
            logger.info(`Full packet for WAV: [START]${transformedMessage}[${checksum}][STOP]`);
        }
        
        const initialPauseSeconds = 1; // Add a 1-second pause at the beginning

        // Use an offline context to render the audio without playing it
        const messageDurationSeconds = transmissionTokens.length * (toneDuration + pauseDuration) / 1000;
        const totalDurationSeconds = messageDurationSeconds + initialPauseSeconds;
        // A standard sample rate for WAV files
        const sampleRate = 44100;
        const offlineContext = new OfflineAudioContext(1, Math.ceil(sampleRate * totalDurationSeconds), sampleRate);

        let currentTime = initialPauseSeconds; // Start tones after the initial pause
        for (const token of transmissionTokens) {
            const freqsValue = charToFreqMap.get(token);
            const freqsArray = freqsValue ? (Array.isArray(freqsValue) ? freqsValue : [freqsValue]) : [];

            if (freqsArray.length > 0) {
                const gainNode = offlineContext.createGain();
                gainNode.gain.setValueAtTime(volume, currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.0001, currentTime + toneDuration / 1000);
                gainNode.connect(offlineContext.destination);

                freqsArray.forEach(freq => {
                    const oscillator = offlineContext.createOscillator();
                    oscillator.type = 'sine';
                    oscillator.frequency.setValueAtTime(freq, currentTime);
                    oscillator.connect(gainNode);
                    oscillator.start(currentTime);
                    oscillator.stop(currentTime + toneDuration / 1000);
                });
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