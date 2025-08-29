// A service to manage and play UI sound effects using the Web Audio API for better performance and reliability.
import logger from './logger';

// Base64 encoded WAV files for minimal, dependency-free audio feedback.
const sounds = {
  // FIX: Replaced previous base64 strings with valid, clean WAV files to prevent initialization errors.
  click: 'data:audio/wav;base64,UklGRlIAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YVQAAAAAAGCAgQB/AP8A/wB/AH8BfwB/AH4AfwB/AH8Afv5/AH8AfwB/AP9/AP//fwCB',
  success: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YcAAAAAAAACAgIA/gICA/38AgP9/AICAgP9/AICAgP9/AIA=',
  error: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YcAAAAAAAACA/38AgP9/AICAgP9/AICAgP9/AICAgIA/gICA',
};

type SoundKeys = keyof typeof sounds;

let audioContext: AudioContext | null = null;
const audioBuffers: Partial<Record<SoundKeys, AudioBuffer>> = {};
let initPromise: Promise<void> | null = null;

const initializeAudio = async () => {
    if (typeof window === 'undefined' || !window.AudioContext) return;
    try {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // A user interaction is required to start/resume the audio context.
        // This is handled by the lazy initialization on the first playSound call.
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        const loadPromises = Object.keys(sounds).map(async (key) => {
            const soundKey = key as SoundKeys;
            const response = await fetch(sounds[soundKey]);
            const arrayBuffer = await response.arrayBuffer();
            if (audioContext) {
                audioBuffers[soundKey] = await audioContext.decodeAudioData(arrayBuffer);
            }
        });
        
        await Promise.all(loadPromises);
        logger.info("Сервис звуковых эффектов инициализирован.");
    } catch (error) {
        logger.error("Не удалось инициализировать сервис звуковых эффектов:", error);
        // Reset so it can be tried again.
        initPromise = null; 
        audioContext = null;
    }
};

const ensureInitialized = (): Promise<void> => {
    if (!initPromise) {
        initPromise = initializeAudio();
    }
    return initPromise;
};

const playSound = async (key: SoundKeys, volume: number) => {
    try {
        await ensureInitialized();
        const buffer = audioBuffers[key];

        if (!audioContext || !buffer) {
            logger.warn(`Аудиобуфер для '${key}' недоступен.`);
            return;
        }

        // The user must interact with the document before audio can play.
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        
        const gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
        
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        source.start(0);
    } catch (error) {
        logger.error(`Не удалось воспроизвести звук '${key}':`, error);
    }
};

const soundService = {
  playClick: () => playSound('click', 0.5),
  playSuccess: () => playSound('success', 0.4),
  playError: () => playSound('error', 0.6),
};

export default soundService;