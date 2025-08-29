import { useState, useRef, useCallback, useEffect } from 'react';
import {
  RECEIVER_CONFIG,
  DTMF_FREQUENCIES,
  DTMF_CHARACTERS,
  TEXT_DECODING_MAP
} from '../constants';
import logger from '../services/logger';
import soundService from '../services/soundService';

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
  const strength = (maxAmplitude - threshold) / (255 - threshold);
  const totalOtherAmplitude = totalAmplitude - maxAmplitude;
  const averageOtherAmplitude = totalOtherAmplitude / (dataLength - 1);
  const clarity = 1 - (averageOtherAmplitude / (maxAmplitude + 1e-6));
  const combinedQuality = (strength * 0.4 + clarity * 0.6);

  if (combinedQuality > 0.7) return 'good';
  if (combinedQuality > 0.4) return 'fair';
  return 'poor';
};

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
      return savedMessages ? JSON.parse(savedMessages) : [];
    } catch (error) {
      logger.error('Не удалось загрузить сообщения из localStorage.', error);
      return [];
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [frequencyData, setFrequencyData] = useState(new Uint8Array(RECEIVER_CONFIG.FFT_SIZE / 2));
  const [currentThreshold, setCurrentThreshold] = useState(RECEIVER_CONFIG.INITIAL_DETECTION_THRESHOLD);
  const [sampleRate, setSampleRate] = useState(44100);
  const [signalQuality, setSignalQuality] = useState<SignalQuality>('none');

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameIdRef = useRef<number>(0);
  
  const receivingStateRef = useRef<'IDLE' | 'DTMF_TEXT'>('IDLE');
  const currentMessageBufferRef = useRef<string>('');
  const lastCharTimestampRef = useRef<number>(0);
  const decoderStateRef = useRef<'IDLE' | 'COOLDOWN'>('IDLE');
  const quietFramesCountRef = useRef(0);
  const ambientNoiseLevelRef = useRef(40);

  useEffect(() => {
    try {
      localStorage.setItem('decodedMessages', JSON.stringify(decodedMessages));
    } catch (error) {
      logger.error('Не удалось сохранить сообщения в localStorage.', error);
    }
  }, [decodedMessages]);

  const processDecodedChar = useCallback((char: string) => {
    logger.log(`Символ декодирован: '${char}'`);
    lastCharTimestampRef.current = performance.now();
    const timestamp = new Date().toLocaleTimeString('ru-RU');

    switch (char) {
        case '*':
            if (receivingStateRef.current !== 'IDLE' && currentMessageBufferRef.current.length > 0) {
                logger.warn(`Новый стартовый сигнал (*) получен во время активной сессии. Предыдущее сообщение отброшено.`);
                const prevBuffer = currentMessageBufferRef.current;
                soundService.playError();
                setDecodedMessages(prev => [...prev, { text: `[Отброшено: ${prevBuffer}]`, status: 'error', timestamp }]);
            } else if (receivingStateRef.current !== 'IDLE') {
                logger.warn(`Новый стартовый сигнал (*) получен во время активной сессии. Сброс.`);
            }
            receivingStateRef.current = 'DTMF_TEXT';
            currentMessageBufferRef.current = '';
            logger.info('Стартовый сигнал DTMF (*) обнаружен. Начало приема.');
            break;

        case '#':
            if (receivingStateRef.current === 'DTMF_TEXT') {
                const digitString = currentMessageBufferRef.current;
                logger.info(`Стоп-сигнал DTMF (#) обнаружен. Строка цифр: "${digitString}"`);

                if (digitString.length > 0 && digitString.length % 2 === 0) {
                    let decodedText = '';
                    for (let i = 0; i < digitString.length; i += 2) {
                        const code = digitString.substring(i, i + 2);
                        const decodedChar = TEXT_DECODING_MAP.get(code);
                        if (decodedChar) {
                            decodedText += decodedChar;
                        } else {
                            logger.warn(`Неизвестный двухзначный код: ${code}`);
                            decodedText += '?';
                        }
                    }
                    logger.info(`Сообщение успешно декодировано: "${decodedText}"`);
                    soundService.playSuccess();
                    setDecodedMessages(prev => [...prev, { text: decodedText, status: 'success', timestamp }]);
                } else {
                    logger.error(`Получен поврежденный пакет. Длина нечетная или пустая: ${digitString.length}`);
                    soundService.playError();
                    if (digitString.length > 0) {
                        setDecodedMessages(prev => [...prev, { text: `[Повреждено: ${digitString}]`, status: 'error', timestamp }]);
                    }
                }
            } else {
                logger.warn(`Стоп-сигнал (#) получен вне сессии. Игнорируется.`);
            }
            receivingStateRef.current = 'IDLE';
            currentMessageBufferRef.current = '';
            break;

        default:
            if (receivingStateRef.current === 'DTMF_TEXT') {
                if (/\d/.test(char)) {
                    currentMessageBufferRef.current += char;
                } else {
                    logger.warn(`Игнорируется нецифровой символ '${char}' во время приема.`);
                }
            }
            break;
    }
    
    decoderStateRef.current = 'COOLDOWN';
    quietFramesCountRef.current = 0;
  }, []);

  const analysisLoop = useCallback(() => {
    if (!analyserRef.current || !audioContextRef.current) return;

    const MESSAGE_TIMEOUT_MS = 5000;
    if (
      receivingStateRef.current === 'DTMF_TEXT' &&
      performance.now() - lastCharTimestampRef.current > MESSAGE_TIMEOUT_MS
    ) {
      logger.warn(`Сообщение не завершено в течение ${MESSAGE_TIMEOUT_MS / 1000}с. Сброс.`);
      const digitString = currentMessageBufferRef.current;

      if (digitString.length > 0) {
        soundService.playError();
        const timestamp = new Date().toLocaleTimeString('ru-RU');
        setDecodedMessages(prev => [...prev, { text: `[Тайм-аут: ${digitString}]`, status: 'error', timestamp }]);
      }
      
      receivingStateRef.current = 'IDLE';
      currentMessageBufferRef.current = '';
    }

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    setFrequencyData(dataArray);

    let maxOverallAmplitude = 0;
    let totalAmplitude = 0;
    for (const amp of dataArray) {
      totalAmplitude += amp;
      if (amp > maxOverallAmplitude) maxOverallAmplitude = amp;
    }

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
    
    setSignalQuality(maxOverallAmplitude > newThreshold 
      ? calculateSignalQuality(maxOverallAmplitude, totalAmplitude, newThreshold, dataArray.length) 
      : 'none');

    switch (decoderStateRef.current) {
        case 'IDLE':
            if (maxOverallAmplitude > newThreshold) {
                const freqPerBin = audioContextRef.current.sampleRate / RECEIVER_CONFIG.FFT_SIZE;
                
                const lowBand = findPeakInBand(dataArray, Math.round(650 / freqPerBin), Math.round(1000 / freqPerBin), freqPerBin);
                const highBand = findPeakInBand(dataArray, Math.round(1150 / freqPerBin), Math.round(1550 / freqPerBin), freqPerBin);

                if (lowBand.peakAmp > newThreshold && highBand.peakAmp > newThreshold) {
                    let matchedLowFreq = 0;
                    let matchedHighFreq = 0;
                    
                    // Find the closest standard DTMF frequencies
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
                                break;
                            }
                        }
                    }
                }
            }
            break;

        case 'COOLDOWN':
            if (maxOverallAmplitude < newThreshold) {
                quietFramesCountRef.current++;
            } else {
                quietFramesCountRef.current = 0;
            }
            if (quietFramesCountRef.current >= 2) { // Use 2 frames (~33ms) to be compatible with fastest protocol (35ms pause).
                decoderStateRef.current = 'IDLE';
            }
            break;
    }

    animationFrameIdRef.current = requestAnimationFrame(analysisLoop);
  }, [currentThreshold, processDecodedChar]);
  
  const startListening = useCallback(async () => {
    if (isListening) return;
    logger.info('Попытка начать прослушивание...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = context;
      setSampleRate(context.sampleRate);
      
      const analyser = context.createAnalyser();
      analyser.fftSize = RECEIVER_CONFIG.FFT_SIZE;
      analyserRef.current = analyser;

      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;
      
      setIsListening(true);
      setError(null);
      
      receivingStateRef.current = 'IDLE';
      currentMessageBufferRef.current = '';
      lastCharTimestampRef.current = 0;
      decoderStateRef.current = 'IDLE';
      quietFramesCountRef.current = 0;

      animationFrameIdRef.current = requestAnimationFrame(analysisLoop);
      logger.info('Прослушивание успешно начато.');
    } catch (err) {
      logger.error('Ошибка доступа к микрофону:', err);
      setError('Доступ к микрофону запрещен. Пожалуйста, разрешите доступ к микрофону в настройках вашего браузера.');
      soundService.playError();
    }
  }, [isListening, analysisLoop]);

  const stopListening = useCallback(() => {
    if (!isListening) return;
    logger.info('Остановка прослушивания...');
    
    cancelAnimationFrame(animationFrameIdRef.current);
    
    streamRef.current?.getTracks().forEach(track => track.stop());
    sourceRef.current?.disconnect();
    audioContextRef.current?.close().catch(e => logger.warn("Ошибка при закрытии AudioContext", e));

    streamRef.current = null;
    sourceRef.current = null;
    audioContextRef.current = null;
    analyserRef.current = null;

    receivingStateRef.current = 'IDLE';
    currentMessageBufferRef.current = '';
    decoderStateRef.current = 'IDLE';
    quietFramesCountRef.current = 0;
    logger.info('Состояние приемника сброшено.');

    setIsListening(false);
    setSignalQuality('none');
    logger.info('Прослушивание остановлено.');
  }, [isListening]);

  const clearDecodedMessages = useCallback(() => {
    setDecodedMessages([]);
    logger.info('Декодированные сообщения очищены пользователем.');
  }, []);
  
  useEffect(() => {
    return () => stopListening();
  }, [stopListening]);

  return { isListening, decodedMessages, frequencyData, error, currentThreshold, sampleRate, signalQuality, startListening, stopListening, clearDecodedMessages };
};