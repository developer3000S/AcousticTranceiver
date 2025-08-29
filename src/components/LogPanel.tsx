import React, { useState, useEffect, useRef } from 'react';
import logger, { LogEntry, LogLevel } from '../services/logger';
import soundService from '../services/soundService';

const getLogLevelColor = (level: LogLevel): string => {
  switch (level) {
    case 'ERROR': return 'text-red-600 dark:text-red-400';
    case 'WARN': return 'text-amber-600 dark:text-amber-400';
    case 'INFO': return 'text-cyan-600 dark:text-cyan-400';
    default: return 'text-gray-600 dark:text-gray-400';
  }
};

const LogPanel: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [filterLevel, setFilterLevel] = useState<LogLevel | 'ALL'>('ALL');
  const [isCopied, setIsCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleNewLogs = (newLogs: LogEntry[]) => {
      setLogs(newLogs);
    };

    logger.subscribe(handleNewLogs);

    return () => {
      logger.unsubscribe(handleNewLogs);
    };
  }, []);

  useEffect(() => {
    // Auto-scroll to the bottom on new log entry if expanded
    if (isExpanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isExpanded]);

  const filteredLogs = logs.filter(log => filterLevel === 'ALL' || log.level === filterLevel);

  const handleClearLogs = () => {
    soundService.playClick();
    logger.clearLogs();
  };

  const handleCopyLogs = async () => {
    if (filteredLogs.length === 0 || isCopied) return;
    soundService.playClick();

    const formattedLogs = filteredLogs
      .map(log => `${log.timestamp} ${log.message}`)
      .join('\n');

    try {
      await navigator.clipboard.writeText(formattedLogs);
      setIsCopied(true);
      soundService.playSuccess();
      setTimeout(() => setIsCopied(false), 2500);
    } catch (err) {
      logger.error('Не удалось скопировать журнал в буфер обмена.', err);
      soundService.playError();
    }
  };
  
  const handleToggleExpand = () => {
    soundService.playClick();
    setIsExpanded(!isExpanded);
  };
  
  const handleSetFilter = (level: LogLevel | 'ALL') => {
    soundService.playClick();
    setFilterLevel(level);
  };

  const filterLevels: (LogLevel | 'ALL')[] = ['ALL', 'INFO', 'WARN', 'ERROR'];

  const getFilterButtonClass = (level: LogLevel | 'ALL'): string => {
    const base = 'px-3 py-1 rounded-md text-xs sm:text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-950 focus:ring-cyan-500';
    if (level === filterLevel) {
      return `${base} bg-cyan-600 text-white`;
    }
    return `${base} bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200`;
  };

  return (
    <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl shadow-2xl p-4 sm:p-6 mt-6 sm:mt-8">
      <div className="flex justify-between items-center mb-4 border-b-2 border-gray-200 dark:border-gray-700 pb-2">
        <h2 id="log-panel-heading" className="text-2xl font-semibold text-gray-900 dark:text-white">Журнал событий</h2>
        <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={handleCopyLogs}
              disabled={filteredLogs.length === 0 || isCopied}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-950 disabled:opacity-50 disabled:cursor-not-allowed ${
                isCopied
                  ? 'bg-green-600 text-white focus:ring-green-500'
                  : 'bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 focus:ring-cyan-500'
              }`}
            >
              {isCopied ? 'Скопировано!' : 'Копировать'}
            </button>
            <button
              onClick={handleClearLogs}
              className="px-3 py-1 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-950 focus:ring-cyan-500"
            >
              Очистить
            </button>
            <button
                onClick={handleToggleExpand}
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-950 focus:ring-cyan-500"
                aria-expanded={isExpanded}
                aria-controls="log-content"
                title={isExpanded ? 'Скрыть журнал' : 'Показать журнал'}
            >
                <span className="sr-only">{isExpanded ? 'Скрыть журнал' : 'Показать журнал'}</span>
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-300 ${isExpanded ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>
        </div>
      </div>
      <div
        id="log-content"
        className={`transition-all duration-300 ease-in-out overflow-hidden ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Фильтр:</span>
                {filterLevels.map(level => (
                    <button
                        key={level}
                        onClick={() => handleSetFilter(level)}
                        className={getFilterButtonClass(level)}
                    >
                        {level === 'ALL' ? 'Все' : level}
                    </button>
                ))}
            </div>
            <span className="text-sm text-gray-500">{filteredLogs.length} из {logs.length} записей</span>
        </div>
        <div 
          ref={scrollRef} 
          className="bg-gray-100 dark:bg-black rounded-md p-3 h-48 font-mono text-sm overflow-y-auto border border-gray-300 dark:border-gray-700"
          aria-labelledby="log-panel-heading"
          aria-live="polite"
          role="log"
          tabIndex={isExpanded ? 0 : -1}
        >
          {filteredLogs.length > 0 ? (
            filteredLogs.map((log, index) => (
              <div key={index} className="flex">
                <span className="text-gray-500 mr-2 flex-shrink-0">{log.timestamp}</span>
                <span className={`flex-1 whitespace-pre-wrap break-words ${getLogLevelColor(log.level)}`}>{log.message}</span>
              </div>
            ))
          ) : (
            <p className="text-gray-500">
                {logs.length > 0 ? 'Нет записей, соответствующих фильтру.' : 'Здесь будут отображаться действия приложения...'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default LogPanel;