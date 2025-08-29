import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  MASTER_FREQ_TO_CHAR_MAP,
  RECEIVER_CONFIG,
  START_CHAR,
  STOP_CHAR,
  CHARACTERS,
  START_FREQ_SIGNAL,
  STOP_FREQ_SIGNAL,
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
  const isReceivingRef = useRef<boolean>(false);
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

  const analysisLoop = useCallback(() => {
    if (!analyserRef.current || !audioContextRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    setFrequencyData(dataArray);

    let maxAmplitude = 0;
    let maxIndex = 0;
    let totalAmplitude = 0;

    for (let i = 0; i < dataArray.length; i++) {
      totalAmplitude += dataArray[i];
      if (dataArray[i] > maxAmplitude) {
        maxAmplitude = dataArray[i];
        maxIndex = i;
      }
    }

    // --- Automatic Gain Control (AGC) Logic ---
    const averageAmplitude = totalAmplitude / dataArray.length;
    // Slowly adjust ambient noise level if the current frame is quiet
    if (maxAmplitude < currentThreshold) {
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
    if (maxAmplitude > newThreshold) {
        const quality = calculateSignalQuality(
            maxAmplitude,
            totalAmplitude,
            newThreshold,
            dataArray.length
        );
        setSignalQuality(quality);
    } else {
        setSignalQuality('none');
    }


    // --- State-based Tone Decoding Logic ---
    switch (decoderStateRef.current) {
        case 'IDLE':
            if (maxAmplitude > newThreshold) {
                // A potential tone is detected. Let's identify it.
                const detectedFreq = maxIndex * (audioContextRef.current.sampleRate / RECEIVER_CONFIG.FFT_SIZE);
                let matchedChar: string | null = null;
                
                for (const [freq, char] of decodingMap.entries()) {
                    if (Math.abs(detectedFreq - freq) <= RECEIVER_CONFIG.FREQUENCY_TOLERANCE) {
                    matchedChar = char;
                    break;
                    }
                }

                if (matchedChar) {
                    // Character found! Process it and enter COOLDOWN.
                    logger.log(`Character decoded: '${matchedChar}'`);
                    
                    // --- Protocol State Machine ---
                    if (matchedChar === START_CHAR) {
                        if (isReceivingRef.current) {
                            logger.warn('New START signal received before STOP. Resetting message.');
                        }
                        isReceivingRef.current = true;
                        currentMessageBufferRef.current = '';
                        logger.info('START signal detected. Began receiving message.');
                    } else if (matchedChar === STOP_CHAR) {
                        if (isReceivingRef.current) {
                            const fullReceived = currentMessageBufferRef.current;
                            logger.info(`STOP signal detected. Full packet: "${fullReceived}"`);
                            
                            isReceivingRef.current = false;
                            currentMessageBufferRef.current = '';

                            if (fullReceived.length < 1) {
                                logger.error('Received an empty message packet.');
                            } else {
                                const payload = fullReceived.slice(0, -1);
                                const receivedChecksum = fullReceived.slice(-1);
                                const calculatedChecksum = calculateChecksum(payload);
                                const timestamp = new Date().toLocaleTimeString('ru-RU');

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
                            logger.warn('STOP signal received without a START. Ignoring.');
                        }
                    } else if (isReceivingRef.current) {
                        currentMessageBufferRef.current += matchedChar;
                    }
                    // --- End Protocol State Machine ---
                    
                    decoderStateRef.current = 'COOLDOWN';
                    // FIX: Explicitly reset the quiet frame counter when a new tone is detected.
                    quietFramesCountRef.current = 0;
                }
            }
            break;

        case 'COOLDOWN':
            // FIX: A more resilient state transition that can tolerate single frames of noise/echo.
            if (maxAmplitude < newThreshold) {
                quietFramesCountRef.current++; // Increment on quiet frames.
            } else {
                // On a noisy frame, decrement the counter. This prevents a single
                // noise spike from resetting our confidence that a pause is happening.
                quietFramesCountRef.current = Math.max(0, quietFramesCountRef.current - 1);
            }

            // Require 3 *net* quiet frames to be confident it's a pause.
            if (quietFramesCountRef.current >= 3) {
                decoderStateRef.current = 'IDLE';
            }
            break;
    }

    animationFrameIdRef.current = requestAnimationFrame(analysisLoop);
  }, [currentThreshold, decodingMap]);
  
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
      isReceivingRef.current = false;
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
    isReceivingRef.current = false;
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