import React, { useState, useEffect, useRef } from 'react';
import { useAudioProcessor, SignalQuality } from '../hooks/useAudioProcessor';
import FrequencyVisualizer from './FrequencyVisualizer';
import soundService from '../services/soundService';

interface ReceiverProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

const QualityIndicator: React.FC<{ quality: SignalQuality, isListening: boolean }> = ({ quality, isListening }) => {
    const qualityMap = {
        good: { text: 'Хорошее', color: 'bg-green-500', textColor: 'text-green-500 dark:text-green-400' },
        fair: { text: 'Среднее', color: 'bg-amber-500', textColor: 'text-amber-500 dark:text-amber-400' },
        poor: { text: 'Плохое', color: 'bg-red-500', textColor: 'text-red-500 dark:text-red-400' },
        none: { text: 'Нет сигнала', color: 'bg-gray-600', textColor: 'text-gray-600 dark:text-gray-500' },
    };

    const currentQuality = !isListening ? { text: '-', color: 'bg-gray-300 dark:bg-gray-700', textColor: 'text-gray-500 dark:text-gray-400' } : qualityMap[quality];

    return (
        <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500 dark:text-gray-400">Качество связи:</span>
            <div className="flex items-center gap-1.5" title={`Качество сигнала: ${currentQuality.text}`}>
                <span className={`h-2 w-2 rounded-full ${currentQuality.color}`} />
                <span className={`font-semibold ${currentQuality.textColor}`}>{currentQuality.text}</span>
            </div>
        </div>
    );
};


const Receiver: React.FC<ReceiverProps> = ({ isCollapsed, onToggle }) => {
  const { 
    isListening, 
    decodedMessages, 
    frequencyData, 
    error, 
    currentThreshold,
    sampleRate,
    signalQuality,
    startListening, 
    stopListening, 
    clearDecodedMessages 
  } = useAudioProcessor();

  const [isCopied, setIsCopied] = useState(false);
  const [isVibrationEnabled, setIsVibrationEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('vibrationEnabled');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true; // Default to true if parsing fails
    }
  });

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(decodedMessages.length);

  useEffect(() => {
    try {
      localStorage.setItem('vibrationEnabled', JSON.stringify(isVibrationEnabled));
    } catch (e) {
      console.error("Failed to save vibration setting to localStorage", e);
    }
  }, [isVibrationEnabled]);

  useEffect(() => {
    // Auto-scroll to the bottom when new messages arrive
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
    
    // Vibrate on new successful message
    if (decodedMessages.length > prevMessagesLengthRef.current) {
      const lastMessage = decodedMessages[decodedMessages.length - 1];
      if (lastMessage && lastMessage.status === 'success' && isVibrationEnabled) {
        if ('vibrate' in navigator) {
          navigator.vibrate(100); // Vibrate for 100ms
        }
      }
    }
    prevMessagesLengthRef.current = decodedMessages.length;

  }, [decodedMessages, isVibrationEnabled]);

  const handleStartListening = () => {
    soundService.playClick();
    startListening();
  };

  const handleStopListening = () => {
    soundService.playClick();
    stopListening();
  };
  
  const handleClear = () => {
    soundService.playClick();
    clearDecodedMessages();
  };

  const handleCopyMessages = async () => {
    if (decodedMessages.length === 0) return;
    soundService.playClick();
    
    // The order is now chronological, so no need to reverse.
    const formattedMessages = decodedMessages
      .map(msg => {
        const statusMarker = msg.status === 'success' ? '' : '[ОШИБКА] ';
        return `${msg.timestamp} - ${statusMarker}"${msg.text}"`;
      })
      .join('\n');

    try {
      await navigator.clipboard.writeText(formattedMessages);
      setIsCopied(true);
      soundService.playSuccess();
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Не удалось скопировать сообщения', err);
      soundService.playError();
    }
  };

  const StatusIcon: React.FC<{ status: 'success' | 'error' }> = ({ status }) => {
    if (status === 'success') {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    }
    return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-950 rounded-lg p-4 sm:p-6 shadow-lg border border-gray-200 dark:border-gray-800">
      <button
        onClick={onToggle}
        className="w-full flex justify-between items-center text-left focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-950 focus:ring-purple-500 rounded-md"
        aria-expanded={!isCollapsed}
        aria-controls="receiver-content"
      >
        <div className="flex items-center">
          <div className="w-10 h-10 bg-purple-500/10 dark:bg-purple-500/20 rounded-full flex items-center justify-center mr-4">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-500 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
             </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Получатель</h2>
        </div>
        <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-6 w-6 transition-transform duration-300 text-gray-500 dark:text-gray-400 ${isCollapsed ? '' : 'rotate-180'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
        >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div
        id="receiver-content"
        className={`transition-all duration-500 ease-in-out overflow-hidden ${isCollapsed ? 'max-h-0' : 'max-h-[2000px]'}`}
      >
        <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-800">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={handleStartListening}
                disabled={isListening}
                className="w-full px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black focus:ring-green-500 disabled:bg-gray-400 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-all duration-200"
              >
                Начать прослушивание
              </button>
              <button
                onClick={handleStopListening}
                disabled={!isListening}
                className="w-full px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black focus:ring-red-500 disabled:bg-gray-400 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-all duration-200"
              >
                Остановить прослушивание
              </button>
            </div>

            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            <div>
              <div className="flex justify-between items-center mb-1">
                <label htmlFor="decoded-output" className="block text-sm font-medium text-gray-600 dark:text-gray-300">
                  Декодированное сообщение
                </label>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleCopyMessages}
                        disabled={decodedMessages.length === 0 || isCopied}
                        className={`px-2 py-0.5 text-xs font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                            isCopied 
                            ? 'bg-green-600 text-white' 
                            : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                        }`}
                        title="Скопировать все сообщения"
                    >
                        {isCopied ? 'Скопировано!' : 'Копировать'}
                    </button>
                    <button
                        onClick={handleClear}
                        disabled={decodedMessages.length === 0}
                        className="px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-200 dark:bg-gray-800 rounded-md hover:bg-gray-300 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Очистить сообщение"
                    >
                        Очистить
                    </button>
                </div>
              </div>
              <div
                id="decoded-output"
                ref={messagesContainerRef}
                className="w-full h-48 bg-gray-100 dark:bg-black rounded-md p-3 font-mono border border-gray-300 dark:border-gray-700 overflow-y-auto flex flex-col items-start gap-3"
              >
                {decodedMessages.length > 0 ? (
                    decodedMessages.map((msg, index) => (
                        <div 
                          key={index} 
                          className={`relative flex max-w-xs sm:max-w-sm rounded-xl p-3 shadow-md ${msg.status === 'success' ? 'bg-gray-200 dark:bg-gray-800' : 'bg-red-500/10 dark:bg-red-900/50 border border-red-500/20 dark:border-red-500/30'}`}
                        >
                            <div className="flex-shrink-0 mr-3">
                                <StatusIcon status={msg.status} />
                            </div>
                            <div className='w-full'>
                                <p className={`whitespace-pre-wrap break-words ${msg.status === 'error' ? 'text-red-500 dark:text-red-300 line-through' : 'text-cyan-600 dark:text-cyan-300'}`}>
                                    {msg.text || <span className='italic text-gray-500'>[пустое сообщение]</span>}
                                </p>
                                <p className="text-xs text-gray-500 mt-1 text-right w-full">{msg.timestamp}</p>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="flex items-center justify-center h-full w-full text-gray-500 text-sm">
                        {isListening ? 'Ожидание сигнала...' : 'Здесь появятся принятые сообщения.'}
                    </div>
                )}
                 {isListening && <span className="animate-pulse text-cyan-500 dark:text-cyan-400">|</span>}
              </div>
            </div>

            <div>
                <div className="flex justify-between items-center mb-1 flex-wrap gap-2">
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">
                        Спектр аудио в реальном времени
                    </label>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                          <label htmlFor="vibration-toggle" className="cursor-pointer select-none">Вибрация</label>
                          <button
                              type="button"
                              id="vibration-toggle"
                              role="switch"
                              aria-checked={isVibrationEnabled}
                              onClick={() => {
                                soundService.playClick();
                                setIsVibrationEnabled(!isVibrationEnabled);
                              }}
                              className={`${isVibrationEnabled ? 'bg-purple-600' : 'bg-gray-400 dark:bg-gray-600'} relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-950`}
                          >
                              <span className="sr-only">Использовать вибрацию</span>
                              <span
                                  aria-hidden="true"
                                  className={`${isVibrationEnabled ? 'translate-x-4' : 'translate-x-0'} pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                              />
                          </button>
                        </div>
                        <QualityIndicator quality={signalQuality} isListening={isListening} />
                        {isListening && (
                            <span className="text-xs text-gray-500 dark:text-gray-400" title="Порог обнаружения сигнала">
                                Порог: <span className="font-semibold text-cyan-600 dark:text-cyan-400">{currentThreshold}</span>
                            </span>
                        )}
                    </div>
                </div>
                <FrequencyVisualizer data={frequencyData} isListening={isListening} sampleRate={sampleRate} threshold={currentThreshold} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Receiver;