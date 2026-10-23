import { performance } from 'node:perf_hooks';

export function formatDuration(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(
    2,
    '0'
  );
  const hours = Math.floor(totalSeconds / 3600);
  return `${hours ? `${hours}:` : ''}${minutes}:${seconds}`;
}

export function startStopwatch(name) {
  const startedAt = performance.now();
  const timestamp = () => new Date().toISOString();
  console.log(`[${timestamp()}] Starting the ${name}.`);
  return (result) => {
    const elapsed = formatDuration(performance.now() - startedAt);
    console.log(
      `[${timestamp()}] The ${name} finished with ${result} after ${elapsed}.`
    );
  };
}
