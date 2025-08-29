import { useState, useRef, useCallback, useEffect } from 'react';
import {
  RECEIVER_CONFIG,
  FSK_CHARACTERS,
  FSK_CHAR_TO_FREQ_MAP,
  TEXT_DECODING_MAP,
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
  
  const receivingStateRef = useRef<'IDLE' | 'RECEIVING'>('IDLE');
  const decoderStateRef = useRef<'WAITING_FOR_TONE' | 'WAITING_FOR_SILENCE'>('WAITING_FOR_TONE');
  const currentMessageBufferRef = useRef<string>('');
  const lastCharTimestampRef = useRef<number>(0); // For 5s message timeout
  const ambientNoiseLevelRef = useRef(40);
  const silenceFramesCounterRef = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem('decodedMessages', JSON.stringify(decodedMessages));
    } catch (error) {
      logger.error('Не удалось сохранить сообщения в localStorage.', error);
    }
  }, [decodedMessages]);

  /**
   * Централизованная функция для обработки ошибок декодирования.
   * Воспроизводит звук ошибки, записывает в журнал и добавляет сообщение об ошибке в UI.
   * @param reason - Причина ошибки.
   * @param bufferContent - Содержимое буфера на момент ошибки.
   */
  const handleDecodingError = useCallback((reason: 'Тайм-аут' | 'Новый старт', bufferContent: string) => {
    const timestamp = new Date().toLocaleTimeString('ru-RU');
    soundService.playError();

    let logMessage = '';
    switch(reason) {
        case 'Тайм-аут':
            logMessage = `Сообщение не завершено в течение 5с. Сброс. Буфер: "${bufferContent}"`;
            break;
        case 'Новый старт':
            logMessage = `Новый стартовый сигнал (*) получен во время активной сессии. Предыдущее сообщение отброшено. Буфер: "${bufferContent}"`;
            break;
    }
    logger.warn(logMessage);

    if (bufferContent.length > 0) {
      setDecodedMessages(prev => [...prev, { text: `[${reason}: ${bufferContent}]`, status: 'error', timestamp }]);
    }
    
    // Reset state after error
    receivingStateRef.current = 'IDLE';
    currentMessageBufferRef.current = '';
    lastCharTimestampRef.current = 0;
  }, []);
  
  /**
   * Decodes a string of digit pairs back into text.
   * @param digitString The string of digits received between '*' and '#'.
   * @returns The decoded text message. Returns an error string if decoding fails.
   */
  const decodeMessageFromDigits = (digitString: string): { text: string; status: MessageStatus } => {
    if (digitString.length % 2 !== 0) {
      logger.error(`Ошибка декодирования: нечетное количество цифр (${digitString.length}). Пакет: "${digitString}"`);
      return { text: `[Ошибка: Нечетные данные]`, status: 'error' };
    }

    let decodedText = '';
    for (let i = 0; i < digitString.length; i += 2) {
      const pair = digitString.substring(i, i + 2);
      const char = TEXT_DECODING_MAP.get(pair);
      if (char) {
        decodedText += char;
      } else {
        logger.warn(`Ошибка декодирования: неизвестный код '${pair}' в пакете "${digitString}"`);
        decodedText += '�'; // Replacement character for unknown codes
      }
    }
    return { text: decodedText, status: 'success' };
  };

  const processDecodedChar = useCallback((char: string) => {
    logger.log(`Символ декодирован: '${char}'`);
    lastCharTimestampRef.current = performance.now(); // Update the 5s message timeout timer
    const timestamp = new Date().toLocaleTimeString('ru-RU');

    switch (char) {
        case '*':
            if (receivingStateRef.current === 'RECEIVING' && currentMessageBufferRef.current.length > 0) {
                // An active session is being interrupted. Handle it as an error.
                handleDecodingError('Новый старт', currentMessageBufferRef.current);
            }
            // Start the new session
            receivingStateRef.current = 'RECEIVING';
            currentMessageBufferRef.current = '';
            lastCharTimestampRef.current = performance.now(); // Reset timer for the new message
            logger.info('Стартовый сигнал (*) обнаружен. Начало приема.');
            break;

        case '#':
            if (receivingStateRef.current === 'RECEIVING') {
                const receivedDigitString = currentMessageBufferRef.current;
                logger.info(`Стоп-сигнал (#) обнаружен. Цифровой пакет: "${receivedDigitString}"`);

                if (receivedDigitString.length > 0) {
                    const { text: receivedText, status } = decodeMessageFromDigits(receivedDigitString);

                    if (status === 'success') {
                        soundService.playSuccess();
                        logger.info(`Сообщение успешно декодировано: "${receivedText}"`);
                    } else {
                        soundService.playError();
                        logger.warn(`Ошибка при декодировании сообщения.`);
                    }
                    setDecodedMessages(prev => [...prev, { text: receivedText, status, timestamp }]);

                } else {
                    logger.warn(`Получен пустой пакет. Игнорируется.`);
                }
                
                // Reset state on success or empty packet
                receivingStateRef.current = 'IDLE';
                currentMessageBufferRef.current = '';

            } else {
                logger.warn(`Стоп-сигнал (#) получен вне сессии. Игнорируется.`);
            }
            break;

        default:
            if (receivingStateRef.current === 'RECEIVING') {
                if (FSK_CHARACTERS.includes(char)) {
                    currentMessageBufferRef.current += char;
                } else {
                    logger.warn(`Игнорируется неизвестный символ '${char}' во время приема.`);
                }
            }
            break;
    }
  }, [handleDecodingError]);

  const analysisLoop = useCallback(() => {
    if (!analyserRef.current || !audioContextRef.current) return;

    const MESSAGE_TIMEOUT_MS = 5000;
    if (
      receivingStateRef.current === 'RECEIVING' &&
      performance.now() - lastCharTimestampRef.current > MESSAGE_TIMEOUT_MS &&
      lastCharTimestampRef.current > 0 // Ensure it doesn't fire on init
    ) {
      // Use centralized error handler for timeout
      handleDecodingError('Тайм-аут', currentMessageBufferRef.current);
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
      
    // State-based decoding logic. Prevents a single tone from being decoded multiple times.
    if (decoderStateRef.current === 'WAITING_FOR_TONE') {
        if (maxOverallAmplitude > newThreshold) {
            const freqPerBin = audioContextRef.current.sampleRate / RECEIVER_CONFIG.FFT_SIZE;
            
            let peakBin = -1;
            let peakAmp = 0;
            // Find the bin with the highest amplitude
            for(let i = 0; i < dataArray.length; i++) {
                if (dataArray[i] > peakAmp) {
                    peakAmp = dataArray[i];
                    peakBin = i;
                }
            }

            if (peakBin !== -1) {
                const peakFreq = peakBin * freqPerBin;

                let bestMatchChar: string | null = null;
                let minDistance = Infinity;

                for (const [char, freq] of FSK_CHAR_TO_FREQ_MAP.entries()) {
                    const distance = Math.abs(peakFreq - freq);
                    if (distance < minDistance) {
                        minDistance = distance;
                        bestMatchChar = char;
                    }
                }

                if (bestMatchChar && minDistance <= RECEIVER_CONFIG.FSK_FREQUENCY_TOLERANCE) {
                    processDecodedChar(bestMatchChar);
                    // Tone successfully decoded, now wait for silence before trying again.
                    decoderStateRef.current = 'WAITING_FOR_SILENCE';
                    silenceFramesCounterRef.current = 0;
                }
            }
        }
    } else if (decoderStateRef.current === 'WAITING_FOR_SILENCE') {
        if (maxOverallAmplitude < newThreshold) {
            silenceFramesCounterRef.current++;
        } else {
            silenceFramesCounterRef.current = 0;
        }
        
        // Require only one frame of silence for faster response to short pauses.
        if (silenceFramesCounterRef.current >= 1) {
            decoderStateRef.current = 'WAITING_FOR_TONE';
            silenceFramesCounterRef.current = 0;
        }
    }

    animationFrameIdRef.current = requestAnimationFrame(analysisLoop);
  }, [currentThreshold, processDecodedChar, handleDecodingError]);
  
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
      decoderStateRef.current = 'WAITING_FOR_TONE';
      currentMessageBufferRef.current = '';
      lastCharTimestampRef.current = 0;
      silenceFramesCounterRef.current = 0;

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
    decoderStateRef.current = 'WAITING_FOR_TONE';
    currentMessageBufferRef.current = '';
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
