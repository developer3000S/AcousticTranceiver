import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  MASTER_FREQ_TO_CHAR_MAP,
  RECEIVER_CONFIG,
  START_CHAR,
  STOP_CHAR,
  CHARACTERS,
  START_FREQ_SIGNAL,
  STOP_FREQ_SIGNAL,
  DTMF_FREQUENCIES,
  DTMF_CHARACTERS,
  TEXT_DECODING_MAP
} from '../constants';
import logger from '../services/logger';
import soundService from '../services/soundService';
import { calculateChecksum } from '../services/audioService';

export type MessageStatus = 'success' | 'error';
export interface DecodedMessage {
  text: string;
  status: MessageStatus;
  timestamp: string;
}

export type SignalQuality = 'good' | 'fair' | 'poor' | 'none';

interface AudioProcessorState {
  isListening: boolean;
  decodedMessages: DecodedMessage[];
  frequencyData: Uint8Array;
  error: string | null;
  currentThreshold: number;
  sampleRate: number;
  signalQuality: SignalQuality;
  startListening: () => Promise<void>;
  stopListening: () => void;
  clearDecodedMessages: () => void;
}

/**
 * Вычисляет качество входящего сигнала на основе его силы и четкости.
 * @param maxAmplitude - Максимальная амплитуда, найденная в частотном спектре.
 * @param totalAmplitude - Сумма всех амплитуд в спектре.
 * @param threshold - Текущий порог шума для обнаружения сигнала.
 * @param dataLength - Длина массива данных о частоте.
 * @returns Оценка качества сигнала: 'good', 'fair' или 'poor'.
 */
const calculateSignalQuality = (
  maxAmplitude: number,
  totalAmplitude: number,
  threshold: number,
  dataLength: number,
): SignalQuality => {
  // 1. Рассчитать силу сигнала (приближенное соотношение сигнал/шум)
  // Этот показатель измеряет, насколько пиковая амплитуда превышает динамический порог шума.
  // Нормализуется до значения от 0 до 1.
  const strength = (maxAmplitude - threshold) / (255 - threshold);

  // 2. Рассчитать четкость сигнала (чистоту пика)
  // Этот показатель измеряет, насколько доминирует пик основной частоты по сравнению с остальной частью спектра.
  // Высокое значение четкости означает, что пик резкий и отличается от фонового шума.
  const totalOtherAmplitude = totalAmplitude - maxAmplitude;
  const averageOtherAmplitude = totalOtherAmplitude / (dataLength - 1);
  // Добавляем небольшое значение (эпсилон), чтобы предотвратить деление на ноль, если maxAmplitude равно 0.
  const clarity = 1 - (averageOtherAmplitude / (maxAmplitude + 1e-6));

  // 3. Комбинировать метрики
  // Для получения единой оценки качества используется средневзвешенное значение. Четкость имеет немного
  // больший вес, так как чистый сигнал часто важнее, чем громкий, но зашумленный.
  const combinedQuality = (strength * 0.4 + clarity * 0.6);

  // 4. Определить итоговую категорию качества на основе комбинированной оценки.
  if (combinedQuality > 0.7) {
    return 'good';
  }
  if (combinedQuality > 0.4) {
    return 'fair';
  }
  return 'poor';
};

// Helper to find the peak frequency in a specific range of the spectrum
const findPeakInBand = (
    dataArray: Uint8Array,
    startBin: number,
    endBin: number,
    freqPerBin: number
): { peakFreq: number; peakAmp: number } => {
    let peakAmp = 0;
    let peakBin = 0;
    for (let i = startBin; i <= endBin; i++) {
        if (dataArray[i] > peakAmp) {
            peakAmp = dataArray[i];
            peakBin = i;
        }
    }
    return { peakFreq: peakBin * freqPerBin, peakAmp };
};

export const useAudioProcessor = (): AudioProcessorState => {
  const [isListening, setIsListening] = useState(false);
  const [decodedMessages, setDecodedMessages] = useState<DecodedMessage[]>(() => {
    try {
      const savedMessages = localStorage.getItem('decodedMessages');
      if (savedMessages) {
        logger.info('Сообщения загружены из localStorage.');
        return JSON.parse(savedMessages);
      }
      return [];
    } catch (error) {
      logger.error('Не удалось загрузить сообщения из localStorage.', error);
      return [];
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [frequencyData, setFrequencyData] = useState(new Uint8Array(RECEIVER_CONFIG.FFT_SIZE / 2));
  const [currentThreshold, setCurrentThreshold] = useState(RECEIVER_CONFIG.INITIAL_DETECTION_THRESHOLD);
  const [sampleRate, setSampleRate] = useState(44100); // Default, will be updated
  const [signalQuality, setSignalQuality] = useState<SignalQuality>('none');

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameIdRef = useRef<number>(0);
  
  // State machine for receiving protocol packets
  const receivingStateRef = useRef<'IDLE' | 'FSK' | 'DTMF_TEXT'>('IDLE');
  const currentMessageBufferRef = useRef<string>('');

  // State machine for decoding tones to prevent duplicates.
  // 'IDLE': Ready to detect a new tone.
  // 'COOLDOWN': A tone was just detected, waiting for signal to drop (pause between tones).
  const decoderStateRef = useRef<'IDLE' | 'COOLDOWN'>('IDLE');
  // FIX: Counter for consecutive quiet frames to make state transitions more robust.
  const quietFramesCountRef = useRef(0);
  
  // AGC state
  const ambientNoiseLevelRef = useRef(40);

  // --- Custom Protocol Support ---
  const decodingMap = useMemo(() => {
    try {
      const savedBase = localStorage.getItem('customBaseFreq');
      const savedStep = localStorage.getItem('customStepFreq');
      const baseFreq = savedBase ? parseInt(savedBase, 10) : 1000;
      const stepFreq = savedStep ? parseInt(savedStep, 10) : 50;
      
      const customFreqMap = new Map<number, string>(
        CHARACTERS.split('').map((char, index) => [baseFreq + index * stepFreq, char])
      );
      // Ensure control signals are always present. They are not part of the dynamic map.
      customFreqMap.set(START_FREQ_SIGNAL, START_CHAR);
      customFreqMap.set(STOP_FREQ_SIGNAL, STOP_CHAR);

      // Combine with master map for universal decoding
      return new Map([...MASTER_FREQ_TO_CHAR_MAP.entries(), ...customFreqMap.entries()]);

    } catch (e) {
      logger.error("Failed to read custom protocol settings for receiver, using standard map.", e);
      return MASTER_FREQ_TO_CHAR_MAP;
    }
  }, []);
  // --- End Custom Protocol Support ---

  // Save messages to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('decodedMessages', JSON.stringify(decodedMessages));
    } catch (error) {
      logger.error('Не удалось сохранить сообщения в localStorage.', error);
    }
  }, [decodedMessages]);

  const processDecodedChar = useCallback((char: string) => {
    logger.log(`Character decoded: '${char}'`);
    const timestamp = new Date().toLocaleTimeString('ru-RU');

    // --- Universal Protocol State Machine ---
    switch (char) {
        case START_CHAR:
            if (receivingStateRef.current !== 'IDLE') {
                logger.warn(`New START signal received during active '${receivingStateRef.current}' session. Resetting.`);
            }
            receivingStateRef.current = 'FSK';
            currentMessageBufferRef.current = '';
            logger.info('FSK START signal detected. Began receiving message.');
            break;

        case STOP_CHAR:
            if (receivingStateRef.current === 'FSK') {
                const fullReceived = currentMessageBufferRef.current;
                logger.info(`FSK STOP signal detected. Full packet: "${fullReceived}"`);
                
                if (fullReceived.length < 1) {
                    logger.error('Received an empty FSK message packet.');
                } else {
                    const payload = fullReceived.slice(0, -1);
                    const receivedChecksum = fullReceived.slice(-1);
                    const calculatedChecksum = calculateChecksum(payload);

                    if (receivedChecksum === calculatedChecksum) {
                        logger.info(`Checksums match! ('${receivedChecksum}'). Message is valid.`);
                        soundService.playSuccess();
                        setDecodedMessages(prev => [...prev, { text: payload, status: 'success', timestamp }]);
                    } else {
                        logger.error(`Checksum mismatch! Received: '${receivedChecksum}', Calculated: '${calculatedChecksum}'. Message is corrupt.`);
                        soundService.playError();
                        setDecodedMessages(prev => [...prev, { text: payload, status: 'error', timestamp }]);
                    }
                }
            } else {
                logger.warn(`STOP signal received outside of FSK session (current state: ${receivingStateRef.current}). Ignoring.`);
            }
            receivingStateRef.current = 'IDLE';
            currentMessageBufferRef.current = '';
            break;

        case '*':
            if (receivingStateRef.current !== 'IDLE') {
                logger.warn(`New '*' signal received during active '${receivingStateRef.current}' session. Resetting.`);
            }
            receivingStateRef.current = 'DTMF_TEXT';
            currentMessageBufferRef.current = '';
            logger.info('DTMF_TEXT START signal (*) detected. Began receiving message.');
            break;

        case '#':
            if (receivingStateRef.current === 'DTMF_TEXT') {
                const digitString = currentMessageBufferRef.current;
                logger.info(`DTMF_TEXT STOP signal (#) detected. Digit string: "${digitString}"`);

                if (digitString.length > 0 && digitString.length % 2 === 0) {
                    let decodedText = '';
                    for (let i = 0; i < digitString.length; i += 2) {
                        const code = digitString.substring(i, i + 2);
                        const decodedChar = TEXT_DECODING_MAP.get(code);
                        if (decodedChar) {
                            decodedText += decodedChar;
                        } else {
                            logger.warn(`Unknown 2-digit code received: ${code}`);
                            decodedText += '?'; // Placeholder for unknown codes
                        }
                    }
                    logger.info(`Successfully decoded DTMF_TEXT message: "${decodedText}"`);
                    soundService.playSuccess();
                    setDecodedMessages(prev => [...prev, { text: decodedText, status: 'success', timestamp }]);
                } else {
                    logger.error(`Received corrupt DTMF_TEXT packet. Length is not even or is empty: ${digitString.length}`);
                    soundService.playError();
                    if (digitString.length > 0) {
                        setDecodedMessages(prev => [...prev, { text: `[Corrupt: ${digitString}]`, status: 'error', timestamp }]);
                    }
                }
            } else {
                logger.warn(`'#' signal received outside of DTMF_TEXT session (current state: ${receivingStateRef.current}). Ignoring.`);
            }
            receivingStateRef.current = 'IDLE';
            currentMessageBufferRef.current = '';
            break;

        default:
            // Append character to buffer if in a receiving state
            if (receivingStateRef.current === 'FSK') {
                currentMessageBufferRef.current += char;
            } else if (receivingStateRef.current === 'DTMF_TEXT') {
                // Only append digits to the buffer in this state
                if (/\d/.test(char)) {
                    currentMessageBufferRef.current += char;
                } else {
                    logger.warn(`Ignoring non-digit character '${char}' during DTMF_TEXT reception.`);
                }
            }
            break;
    }
    
    decoderStateRef.current = 'COOLDOWN';
    quietFramesCountRef.current = 0;
  }, []);

  const analysisLoop = useCallback(() => {
    if (!analyserRef.current || !audioContextRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    setFrequencyData(dataArray);

    let maxOverallAmplitude = 0;
    let totalAmplitude = 0;

    for (let i = 0; i < dataArray.length; i++) {
      totalAmplitude += dataArray[i];
      if (dataArray[i] > maxOverallAmplitude) {
        maxOverallAmplitude = dataArray[i];
      }
    }

    // --- Automatic Gain Control (AGC) Logic ---
    const averageAmplitude = totalAmplitude / dataArray.length;
    if (maxOverallAmplitude < currentThreshold) {
      ambientNoiseLevelRef.current = ambientNoiseLevelRef.current * (1 - RECEIVER_CONFIG.AGC_NOISE_SENSITIVITY) + averageAmplitude * RECEIVER_CONFIG.AGC_NOISE_SENSITIVITY;
    }
    const newThreshold = Math.round(
      Math.max(
        RECEIVER_CONFIG.MIN_DETECTION_THRESHOLD,
        Math.min(RECEIVER_CONFIG.MAX_DETECTION_THRESHOLD, ambientNoiseLevelRef.current + RECEIVER_CONFIG.AGC_THRESHOLD_OFFSET)
      )
    );
    setCurrentThreshold(newThreshold);
    // --- End AGC Logic ---
    
    // Update UI signal quality
    if (maxOverallAmplitude > newThreshold) {
        const quality = calculateSignalQuality(maxOverallAmplitude, totalAmplitude, newThreshold, dataArray.length);
        setSignalQuality(quality);
    } else {
        setSignalQuality('none');
    }

    // --- State-based Tone Decoding Logic ---
    switch (decoderStateRef.current) {
        case 'IDLE':
            if (maxOverallAmplitude > newThreshold) {
                const freqPerBin = audioContextRef.current.sampleRate / RECEIVER_CONFIG.FFT_SIZE;
                let characterFound = false;

                // --- 1. Attempt DTMF Decode First ---
                const lowBand = findPeakInBand(dataArray, Math.round(650 / freqPerBin), Math.round(1000 / freqPerBin), freqPerBin);
                const highBand = findPeakInBand(dataArray, Math.round(1150 / freqPerBin), Math.round(1550 / freqPerBin), freqPerBin);

                if (lowBand.peakAmp > newThreshold && highBand.peakAmp > newThreshold) {
                    let matchedLowFreq = 0;
                    let matchedHighFreq = 0;
                    
                    for (const char of DTMF_CHARACTERS) {
                        const [lowFreq, highFreq] = DTMF_FREQUENCIES[char];
                        if (Math.abs(lowBand.peakFreq - lowFreq) <= RECEIVER_CONFIG.DTMF_FREQUENCY_TOLERANCE) matchedLowFreq = lowFreq;
                        if (Math.abs(highBand.peakFreq - highFreq) <= RECEIVER_CONFIG.DTMF_FREQUENCY_TOLERANCE) matchedHighFreq = highFreq;
                    }

                    if (matchedLowFreq && matchedHighFreq) {
                        for (const char of DTMF_CHARACTERS) {
                            const [lowFreq, highFreq] = DTMF_FREQUENCIES[char];
                            if (lowFreq === matchedLowFreq && highFreq === matchedHighFreq) {
                                processDecodedChar(char);
                                characterFound = true;
                                break;
                            }
                        }
                    }
                }
                
                // --- 2. Fallback to FSK (Single Tone) Decode ---
                if (!characterFound) {
                    const maxIndex = dataArray.indexOf(maxOverallAmplitude);
                    const detectedFreq = maxIndex * freqPerBin;
                    
                    for (const [freq, char] of decodingMap.entries()) {
                        if (Math.abs(detectedFreq - freq) <= RECEIVER_CONFIG.FREQUENCY_TOLERANCE) {
                            processDecodedChar(char);
                            characterFound = true;
                            break;
                        }
                    }
                }
            }
            break;

        case 'COOLDOWN':
            if (maxOverallAmplitude < newThreshold) {
                quietFramesCountRef.current++;
            } else {
                quietFramesCountRef.current = Math.max(0, quietFramesCountRef.current - 1);
            }
            if (quietFramesCountRef.current >= 3) {
                decoderStateRef.current = 'IDLE';
            }
            break;
    }

    animationFrameIdRef.current = requestAnimationFrame(analysisLoop);
  }, [currentThreshold, decodingMap, processDecodedChar]);
  
  const startListening = useCallback(async () => {
    if (isListening) return;
    logger.info('Attempting to start listening...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = context;
      setSampleRate(context.sampleRate); // Update to the actual sample rate
      
      const analyser = context.createAnalyser();
      analyser.fftSize = RECEIVER_CONFIG.FFT_SIZE;
      analyserRef.current = analyser;

      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;
      
      setIsListening(true);
      setError(null);
      
      // Reset protocol state
      receivingStateRef.current = 'IDLE';
      currentMessageBufferRef.current = '';
      decoderStateRef.current = 'IDLE';
      quietFramesCountRef.current = 0;

      animationFrameIdRef.current = requestAnimationFrame(analysisLoop);
      logger.info('Successfully started listening.');
    } catch (err) {
      logger.error('Error accessing microphone:', err);
      setError('Доступ к микрофону запрещен. Пожалуйста, разрешите доступ к микрофону в настройках вашего браузера.');
      soundService.playError();
    }
  }, [isListening, analysisLoop]);

  const stopListening = useCallback(() => {
    if (!isListening) return;
    logger.info('Stopping listening...');
    
    cancelAnimationFrame(animationFrameIdRef.current);
    
    streamRef.current?.getTracks().forEach(track => track.stop());
    sourceRef.current?.disconnect();
    audioContextRef.current?.close().catch(e => logger.warn("Error closing AudioContext", e));

    streamRef.current = null;
    sourceRef.current = null;
    audioContextRef.current = null;
    analyserRef.current = null;

    // Resetting protocol state on stop to prevent corruption on next listen.
    receivingStateRef.current = 'IDLE';
    currentMessageBufferRef.current = '';
    decoderStateRef.current = 'IDLE';
    quietFramesCountRef.current = 0;
    logger.info('Receiver state has been reset.');

    setIsListening(false);
    setSignalQuality('none');
    logger.info('Stopped listening.');
  }, [isListening]);

  const clearDecodedMessages = useCallback(() => {
    setDecodedMessages([]);
    logger.info('Decoded text cleared by user.');
  }, []);
  
  useEffect(() => {
    // Cleanup on unmount
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return { isListening, decodedMessages, frequencyData, error, currentThreshold, sampleRate, signalQuality, startListening, stopListening, clearDecodedMessages };
};