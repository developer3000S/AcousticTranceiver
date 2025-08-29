import React, { useMemo } from 'react';

// FIX: Update props to accept a character-to-frequency map to support different protocols.
interface TransmissionVisualizerProps {
  currentFrequency: number | null;
  charToFreqMap: Map<string, number | number[]>;
}

const NUM_BINS = 64; // Number of visual bins

const TransmissionVisualizer: React.FC<TransmissionVisualizerProps> = ({ currentFrequency, charToFreqMap }) => {
  // FIX: Use .flat() to handle maps that contain both numbers and arrays of numbers (for DTMF).
  // This correctly calculates the frequency range for the visualizer across all protocols.
  const { MIN_FREQ, FREQ_RANGE } = useMemo(() => {
    const frequencies = Array.from(charToFreqMap.values()).flat();
    if (frequencies.length === 0) {
        return { MIN_FREQ: 0, MAX_FREQ: 0, FREQ_RANGE: 0 };
    }
    const MIN_FREQ = Math.min(...frequencies);
    const MAX_FREQ = Math.max(...frequencies);
    const FREQ_RANGE = MAX_FREQ - MIN_FREQ;
    return { MIN_FREQ, MAX_FREQ, FREQ_RANGE };
  }, [charToFreqMap]);

  const activeBinIndex = currentFrequency !== null && FREQ_RANGE > 0
    ? Math.floor(((currentFrequency - MIN_FREQ) / FREQ_RANGE) * (NUM_BINS - 1))
    : -1;

  return (
    <div className="relative w-full h-12 bg-white dark:bg-black rounded-md p-2 border border-gray-300 dark:border-gray-700 flex items-center" aria-hidden="true">
      {currentFrequency !== null ? (
        <>
          {/* Track */}
          <div className="w-full h-1 bg-gray-200 dark:bg-gray-800 rounded-full" />
          {/* Indicator Dot */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-cyan-400 rounded-full transition-all duration-100 ease-in-out"
            style={{
              left: `calc(${(activeBinIndex / (NUM_BINS - 1)) * 100}% - 0.5rem)`, // position - half width of dot
              boxShadow: '0 0 10px 2px #22d3ee, 0 0 2px 1px #22d3ee inset',
            }}
          />
        </>
      ) : (
        <p className="text-gray-500 w-full text-center text-sm">Ожидание передачи...</p>
      )}
    </div>
  );
};

export default TransmissionVisualizer;