import React, { useState, useEffect, useMemo } from 'react';
import { playMessage, generateMessageWav } from '../services/audioService';
import logger from '../services/logger';
import { TRANSMISSION_PROTOCOL, TransmissionProtocol, TEXT_ENCODING_MAP } from '../constants';
import soundService from '../services/soundService';

interface SenderProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

const Sender: React.FC<SenderProps> = ({ isCollapsed, onToggle }) => {
  const [message, setMessage] = useState<string>('привет мир');
  const [isTransmitting, setIsTransmitting] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  
  const [transmissionProgress, setTransmissionProgress] = useState(0);
  const [transmittingChar, setTransmittingChar] = useState<string | null>(null);
  const [transmittingFreq, setTransmittingFreq] = useState<number | null>(null);
  
  const [volume, setVolume] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const [wavUrl, setWavUrl] = useState<string | null>(null);

  // Settings state
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [toneDuration, setToneDuration] = useState<number>(TRANSMISSION_PROTOCOL.toneDuration);
  const [pauseDuration, setPauseDuration] = useState<number>(TRANSMISSION_PROTOCOL.pauseDuration);

  const initialTemplates = ["тест 123", "как дела?", "5550123", "пока"];

  const [templates, setTemplates] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('messageTemplates');
      return saved ? JSON.parse(saved).sort((a: string, b: string) => a.localeCompare(b)) : initialTemplates;
    } catch (error) {
      logger.error('Failed to parse templates from localStorage', error);
      return initialTemplates;
    }
  });
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  
  const currentProtocol = useMemo((): TransmissionProtocol => {
      return {
          ...TRANSMISSION_PROTOCOL,
          toneDuration,
          pauseDuration,
          name: 'Пользовательский',
          description: `Тон: ${toneDuration}мс, Пауза: ${pauseDuration}мс`
      };
  }, [toneDuration, pauseDuration]);

  useEffect(() => {
    try {
      localStorage.setItem('messageTemplates', JSON.stringify(templates));
    } catch (error) {
      logger.error('Failed to save templates to localStorage', error);
    }
  }, [templates]);

  useEffect(() => {
    return () => {
        if (wavUrl) URL.revokeObjectURL(wavUrl);
    };
  }, [wavUrl]);

  const handleRemoveTemplate = () => {
    soundService.playClick();
    if (!selectedTemplate) return;
    const templateToRemove = selectedTemplate;
    setTemplates(templates.filter(t => t !== templateToRemove));
    setSelectedTemplate('');
    if (message === templateToRemove) {
      setMessage('');
    }
    logger.info(`Шаблон удален: "${templateToRemove}"`);
  };

  const handleSelectTemplate = (template: string) => {
    soundService.playClick();
    if (template) {
      if (template === message) {
        setSelectedTemplate('');
        return;
      }
      setSelectedTemplate(template);
      setMessage(template);
      setError(null);
    }
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    if (selectedTemplate && e.target.value !== selectedTemplate) {
      setSelectedTemplate('');
    }
    if (wavUrl) {
        setWavUrl(null);
    }
  };

  const handleSaveMessageAsTemplate = () => {
    soundService.playClick();
    const trimmedMessage = message.trim().toLowerCase();
    if (!trimmedMessage || templates.includes(trimmedMessage)) return;
    const newTemplates = [...templates, trimmedMessage].sort((a, b) => a.localeCompare(b));
    setTemplates(newTemplates);
    setSelectedTemplate(trimmedMessage);
    logger.info(`Сообщение сохранено как шаблон: "${trimmedMessage}"`);
  };
  
  const commonButtonDisabled = isTransmitting || isSaving || isTesting;

  const isCharSupported = (char: string): boolean => {
    // Check against the characters defined in our encoding map.
    return TEXT_ENCODING_MAP.has(char.toLowerCase());
  };

  const getTransmissionPayload = (msg: string): string => {
    // This function now just filters the message based on supported characters.
    // The actual encoding to digits is handled by the protocol's transform function.
    return msg.toLowerCase().split('').filter(isCharSupported).join('');
  }

  const handleTransmit = async () => {
    soundService.playClick();
    if (wavUrl) {
        setWavUrl(null);
    }
    if (!message || commonButtonDisabled) return;
    setError(null);
    setIsTransmitting(true);
    try {
      const payload = getTransmissionPayload(message);
      if (!payload) {
        logger.warn("Передача отменена: в сообщении нет поддерживаемых символов.");
        setIsTransmitting(false);
        return;
      }
      logger.info(`Начало передачи аудио... (${currentProtocol.description})`);
      
      await playMessage(
        payload, 
        volume, 
        currentProtocol,
        (index, totalLength, token, freq) => {
            // FSK uses single frequencies, so we expect a number, not an array.
            const currentFreq = Array.isArray(freq) ? freq[0] : freq;
            setTransmittingFreq(currentFreq);
            setTransmittingChar(token);
            if (index !== null) {
                setTransmissionProgress(((index + 1) / totalLength) * 100);
            } else {
                setTransmissionProgress(0);
                setTransmittingFreq(null);
                setTransmittingChar(null);
            }
        }
      );
      setMessage('');
      setSelectedTemplate('');
    } catch (err) {
      logger.error('Ошибка при передаче аудио', err);
      setError('Не удалось передать аудио.');
      soundService.playError();
    } finally {
      setIsTransmitting(false);
      setTransmissionProgress(0);
    }
  };
  
  const handleTestConnection = async () => {
    soundService.playClick();
    if (commonButtonDisabled) return;

    const messageToTest = "тест 12345";
    
    setError(null);
    setIsTesting(true);
    try {
        const payload = getTransmissionPayload(messageToTest);
        logger.info(`Начало тестовой передачи... (${currentProtocol.description})`);
        await playMessage(
            payload, 
            volume, 
            currentProtocol,
            (index, totalLength, token, freq) => {
                const currentFreq = Array.isArray(freq) ? freq[0] : freq;
                setTransmittingFreq(currentFreq);
                setTransmittingChar(token);
                if (index !== null) {
                    setTransmissionProgress(((index + 1) / totalLength) * 100);
                } else {
                    setTransmissionProgress(0);
                    setTransmittingFreq(null);
                    setTransmittingChar(null);
                }
            }
        );
        logger.info('Тестовая передача завершена.');
    } catch (err) {
      logger.error('Ошибка во время тестовой передачи', err);
      setError('Не удалось выполнить тестовую передачу.');
      soundService.playError();
    } finally {
        setIsTesting(false);
        setTransmissionProgress(0);
    }
  };

  const handleSave = async () => {
    soundService.playClick();
    if (wavUrl) {
        setWavUrl(null);
    }
    if (!message || commonButtonDisabled) return;
    setError(null);
    setIsSaving(true);
    try {
      const payload = getTransmissionPayload(message);
      if (!payload) {
        logger.warn("Сохранение отменено: в сообщении нет поддерживаемых символов.");
        setIsSaving(false);
        return;
      }
      logger.info(`Начало генерации WAV файла... (${currentProtocol.description})`);
      const blob = await generateMessageWav(payload, volume, currentProtocol);

      if (blob) {
        const url = URL.createObjectURL(blob);
        setWavUrl(url);
        const a = document.createElement('a');
        a.href = url;
        a.download = `message_${Date.now()}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        logger.info('WAV файл успешно сохранен.');
        soundService.playSuccess();
        setMessage('');
        setSelectedTemplate('');
      } else {
        throw new Error('Сгенерированный blob имеет значение null.');
      }
    } catch (err) {
      logger.error('Не удалось сохранить WAV файл', err);
      setError('Не удалось сохранить WAV файл.');
      soundService.playError();
    } finally {
      setIsSaving(false);
    }
  };

  const renderMessageWithHighlight = () => {
    return message.split('').map((char, index) => (
      <span
        key={index}
        className={`transition-colors duration-100 ${!isCharSupported(char) ? 'text-red-400 underline decoration-wavy decoration-red-500' : (isTransmitting ? 'text-gray-500 dark:text-gray-600' : 'text-gray-700 dark:text-gray-400')}`}
      >
        {char}
      </span>
    ));
  };

  const hasUnsupportedChars = useMemo(() => message.split('').some(char => !isCharSupported(char)), [message]);
  const canSaveAsTemplate = message.trim() && !templates.includes(message.trim().toLowerCase()) && getTransmissionPayload(message).length > 0;
  
  const effectiveMessageLength = useMemo(() => {
    const payload = getTransmissionPayload(message);
    return currentProtocol.transform(payload).length;
  }, [message, currentProtocol]);

  const getDisplayChar = (char: string | null): string => {
    if (char === ' ') return '⎵';
    if (char === null) return '-';
    return char;
  };

  return (
    <div className="bg-white dark:bg-gray-950 rounded-lg p-4 sm:p-6 shadow-lg border border-gray-200 dark:border-gray-800">
      <button
        onClick={onToggle}
        className="w-full flex justify-between items-center text-left focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-950 focus:ring-cyan-500 rounded-md"
        aria-expanded={!isCollapsed}
        aria-controls="sender-content"
      >
        <div className="flex items-center">
          <div className="w-10 h-10 bg-cyan-500/10 dark:bg-cyan-500/20 rounded-full flex items-center justify-center mr-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-cyan-500 dark:text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Отправитель</h2>
        </div>
        <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-6 w-6 transition-transform duration-300 text-gray-500 dark:text-gray-400 ${isCollapsed ? '' : 'rotate-180'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div
        id="sender-content"
        className={`transition-all duration-500 ease-in-out overflow-hidden ${isCollapsed ? 'max-h-0' : 'max-h-[2200px]'}`}
      >
        <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-800">
          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-3 rounded-md relative mb-4" role="alert">
                <span className="block sm:inline">{error}</span>
                <button onClick={() => setError(null)} className="absolute top-0 bottom-0 right-0 px-4 py-3" aria-label="Закрыть">
                    <svg className="fill-current h-6 w-6 text-red-400" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><title>Закрыть</title><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"/></svg>
                </button>
            </div>
          )}
          
          <div className="space-y-6">
            <div>
              <label htmlFor="message-input" className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Сообщение для передачи</label>
              <div className={`relative bg-gray-100 dark:bg-black rounded-md p-2 pr-8 border border-gray-300 dark:border-gray-700 transition-all ${isTransmitting ? 'bg-gray-200 dark:bg-gray-900' : 'focus-within:border-cyan-500 focus-within:ring-1 focus-within:ring-cyan-500'}`}>
                <div className="font-mono text-lg h-10 overflow-x-auto whitespace-pre flex items-center">
                  {message ? renderMessageWithHighlight() : <span className="text-gray-500">Введите ваше сообщение...</span>}
                </div>
                <textarea
                  id="message-input" value={message} onChange={handleMessageChange}
                  className="absolute top-0 left-0 w-full h-full bg-transparent border-0 text-transparent caret-cyan-400 resize-none p-2 focus:outline-none focus:ring-0"
                  disabled={commonButtonDisabled} aria-label="Message to transmit"
                />
              </div>
              <div className="flex justify-between items-center mt-1 px-1 text-xs">
                {hasUnsupportedChars ? (
                  <p className="text-amber-500 dark:text-amber-400">Неподдерживаемые символы <span className="text-red-400 underline decoration-wavy decoration-red-500">подчеркнуты</span>.</p>
                ) : (
                  <p className="text-gray-500">Все символы поддерживаются.</p>
                )}
                <p className="text-gray-500">{message.length} символов</p>
              </div>
            </div>

            <div>
              <label htmlFor="template-select" className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Шаблоны</label>
              <div className="flex flex-wrap gap-2 items-center">
                  <select
                      id="template-select" value={selectedTemplate} onChange={(e) => handleSelectTemplate(e.target.value)} disabled={commonButtonDisabled}
                      className={`w-full sm:w-auto sm:flex-grow bg-white dark:bg-black border rounded-md px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 disabled:opacity-50 transition-colors ${selectedTemplate ? 'border-cyan-500' : 'border-gray-300 dark:border-gray-700'}`}
                      aria-label="Выберите шаблон"
                  >
                      <option value="" disabled>Выберите из списка...</option>
                      {templates.map((template) => (<option key={template} value={template}>{template}</option>))}
                  </select>
                   <button
                      onClick={handleRemoveTemplate} disabled={commonButtonDisabled || !selectedTemplate}
                      className="p-2 bg-gray-200 dark:bg-gray-800 hover:bg-red-500/20 dark:hover:bg-red-600/50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-white rounded-md transition-colors"
                      aria-label="Удалить выбранный шаблон" title="Удалить выбранный шаблон"
                  >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                  <button
                      onClick={handleSaveMessageAsTemplate} disabled={commonButtonDisabled || !canSaveAsTemplate}
                      className="p-2 bg-gray-200 dark:bg-gray-800 hover:bg-green-500/20 dark:hover:bg-green-600/50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-white rounded-md transition-colors"
                      aria-label="Сохранить текущее сообщение как шаблон" title="Сохранить текущее сообщение как шаблон"
                  >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                  </button>
              </div>
            </div>

            {/* --- Settings Section --- */}
            <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800/50 rounded-lg p-4">
              <button
                onClick={() => {
                  soundService.playClick();
                  setIsSettingsVisible(!isSettingsVisible);
                }}
                className="w-full flex justify-between items-center text-left text-gray-700 dark:text-gray-300 font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-50 dark:focus:ring-offset-gray-900 focus:ring-cyan-500 rounded"
                aria-expanded={isSettingsVisible}
              >
                <span>Настройки передачи</span>
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-300 ${isSettingsVisible ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </button>
              <div className={`transition-all duration-500 ease-in-out overflow-hidden space-y-4 ${isSettingsVisible ? 'max-h-[500px] pt-4 mt-2 border-t border-gray-200 dark:border-gray-800' : 'max-h-0'}`}>
                <div>
                  <label htmlFor="tone-duration-slider" className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Длительность тона: <span className="font-bold text-cyan-500 dark:text-cyan-400">{toneDuration} мс</span></label>
                  <input id="tone-duration-slider" type="range" min="20" max="200" step="5" value={toneDuration} onChange={(e) => setToneDuration(parseInt(e.target.value, 10))} disabled={commonButtonDisabled} className="w-full h-2 bg-gray-300 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 disabled:opacity-50"/>
                </div>
                <div>
                  <label htmlFor="pause-duration-slider" className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Пауза между символами: <span className="font-bold text-cyan-500 dark:text-cyan-400">{pauseDuration} мс</span></label>
                  <input id="pause-duration-slider" type="range" min="20" max="200" step="5" value={pauseDuration} onChange={(e) => setPauseDuration(parseInt(e.target.value, 10))} disabled={commonButtonDisabled} className="w-full h-2 bg-gray-300 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 disabled:opacity-50"/>
                </div>
                <div>
                  <label htmlFor="volume-slider" className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Громкость передачи: <span className="font-bold text-cyan-500 dark:text-cyan-400">{Math.round(volume * 100)}%</span></label>
                  <input id="volume-slider" type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} disabled={commonButtonDisabled} className="w-full h-2 bg-gray-300 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 disabled:opacity-50"/>
                </div>
              </div>
            </div>
            
            {(isTransmitting || isTesting) && (
              <div className="pt-2 space-y-2">
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-cyan-500 dark:text-cyan-300">{isTesting ? 'Прогресс теста:' : 'Передача:'}</span>
                    <span className="font-mono text-lg px-2 py-0.5 bg-gray-200 dark:bg-gray-800 rounded text-cyan-500 dark:text-cyan-300">{getDisplayChar(transmittingChar)}</span>
                    {transmittingFreq && (
                      <span className="text-xs font-mono text-cyan-500 dark:text-cyan-400">
                        {Math.round(transmittingFreq)} Гц
                      </span>
                    )}
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">({Math.ceil(transmissionProgress / 100 * effectiveMessageLength)}/{effectiveMessageLength})</span>
                  </div>
                  <span className="text-sm font-medium text-cyan-500 dark:text-cyan-300">{transmissionProgress.toFixed(0)}%</span>
                </div>
                <div className="w-full bg-gray-300 dark:bg-gray-700 rounded-full h-2.5">
                  <div className="bg-cyan-500 h-2.5 rounded-full transition-all duration-150 ease-linear" style={{ width: `${transmissionProgress}%` }} />
                </div>
              </div>
            )}

            <div className="flex items-center justify-center h-8 text-sm">
              {isTransmitting || isSaving || isTesting ? (
                <div className="flex items-center text-cyan-500 dark:text-cyan-400" role="status" aria-live="assertive">
                  <svg className="animate-spin mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  <span>Статус: {isTransmitting ? 'Передача...' : isSaving ? 'Сохранение...' : 'Тестирование...'}</span>
                </div>
              ) : (
                <div className="flex items-center text-green-600 dark:text-green-400" role="status">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span>Статус: Готово к работе</span>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={handleTransmit} disabled={commonButtonDisabled || !message || hasUnsupportedChars}
                className="w-full flex justify-center items-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black focus:ring-cyan-500 disabled:bg-gray-400 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-all"
              >
                Передать аудио
              </button>
              <button
                onClick={handleSave} disabled={commonButtonDisabled || !message || hasUnsupportedChars}
                className="w-full flex justify-center items-center px-4 py-3 border border-gray-400 dark:border-gray-700 text-base font-medium rounded-md shadow-sm text-gray-800 dark:text-gray-200 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black focus:ring-gray-500 disabled:bg-gray-400 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-all"
              >
                Сохранить .wav
              </button>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-800 my-4"></div>
            <button
                onClick={handleTestConnection} disabled={commonButtonDisabled}
                className="w-full flex justify-center items-center gap-2 px-4 py-2 border border-yellow-500/50 text-base font-medium rounded-md shadow-sm text-yellow-600 dark:text-yellow-300 bg-yellow-500/10 dark:bg-yellow-600/20 hover:bg-yellow-500/20 dark:hover:bg-yellow-600/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
                Проверить связь
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sender;
