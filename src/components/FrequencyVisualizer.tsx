import React, { useMemo } from 'react';
import { RECEIVER_CONFIG, DTMF_FREQUENCIES } from '../constants';

interface FrequencyVisualizerProps {
  data: Uint8Array;
  isListening: boolean;
  sampleRate: number;
  threshold: number;
}

const NUM_BINS_TO_SHOW = 256;

const FrequencyVisualizer: React.FC<FrequencyVisualizerProps> = ({ data, isListening, sampleRate, threshold }) => {
  const validBins = useMemo(() => {
    const FREQ_PER_BIN = sampleRate / RECEIVER_CONFIG.FFT_SIZE;
    const bins = new Set<number>();
    
    // Highlight all standard DTMF frequencies
    Object.values(DTMF_FREQUENCIES).flat().forEach(freq => {
        const bin = Math.round(freq / FREQ_PER_BIN);
        if (bin < NUM_BINS_TO_SHOW) {
            bins.add(bin);
        }
    });

    return bins;
  }, [sampleRate]);

  const relevantBins = useMemo(() => Array.from(data).slice(0, NUM_BINS_TO_SHOW), [data]);

  return (
    <div className="relative w-full h-24 bg-white dark:bg-black rounded-md p-2 border border-gray-300 dark:border-gray-700 overflow-hidden">
      <div className="absolute inset-0 flex items-end justify-start space-x-px px-2" aria-hidden="true">
        {Array.from({ length: NUM_BINS_TO_SHOW }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 h-full ${validBins.has(i) ? 'bg-cyan-500/10 dark:bg-cyan-900/40 border-t-2 border-cyan-500/20 dark:border-cyan-800/50' : ''}`}
          />
        ))}
      </div>
      
      {isListening && (
        <div
            className="absolute left-2 right-2 h-px bg-red-500/80 z-20 pointer-events-none"
            style={{
            bottom: `${(threshold / 255) * 100}%`,
            transition: 'bottom 0.2s ease-out',
            }}
            aria-hidden="true"
        >
            <div className="absolute -top-2.5 right-0 text-xs text-red-500 dark:text-red-400 font-semibold bg-white/70 dark:bg-black/70 backdrop-blur-sm px-1.5 py-0.5 rounded">
                порог
            </div>
        </div>
      )}

      <div className="relative z-10 w-full h-full flex items-end justify-center space-x-px">
        {isListening ? (
          relevantBins.map((value, i) => {
            const isHot = value > threshold && validBins.has(i);
            return (
              <div
                key={i}
                className={`flex-1 transition-all duration-75 ease-out ${
                  isHot 
                  ? 'bg-gradient-to-t from-amber-400 to-red-500' 
                  : 'bg-gradient-to-t from-cyan-400 to-purple-500'
                }`}
                style={{
                  height: `${(value / 255) * 100}%`,
                  boxShadow: isHot ? '0 0 8px rgba(251, 191, 36, 0.9)' : 'none',
                }}
              />
            )
          })
        ) : (
          <p className="z-20 text-gray-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            Начните слушать, чтобы увидеть спектр аудио
          </p>
        )}
      </div>
    </div>
  );
};

export default FrequencyVisualizer;
