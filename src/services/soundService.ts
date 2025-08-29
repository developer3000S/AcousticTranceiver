// A service to manage and play UI sound effects.

// Base64 encoded WAV files for minimal, dependency-free audio feedback.
const sounds = {
  click: 'data:audio/wav;base64,UklGRiIAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAATElTVBoAAABJTkZPSVNGVAAAAAwAAABDdXN0b20gRGF0YQAAAABkYXRhAgAAAP////8=',
  success: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAATElTVBoAAABJTkZPSVNGVAAAAAwAAABDdXN0b20gRGF0YQAAAABkYXRhCAAAAMDA3+DV6f3r/vE=',
  error: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAATElTVBoAAABJTkZPSVNGVAAAAAwAAABDdXN0b20gRGF0YQAAAABkYXRhCAAAAPDg3+zK6Pvj9+/=',
};

// Preload audio elements for responsiveness
const audio = {
  click: new Audio(sounds.click),
  success: new Audio(sounds.success),
  error: new Audio(sounds.error),
};

// Set volumes for subtle effect
audio.click.volume = 0.5;
audio.success.volume = 0.4;
audio.error.volume = 0.6;

/**
 * Plays a sound effect.
 * @param sound The audio element to play.
 */
const playSound = (sound: HTMLAudioElement) => {
  // If the sound is already playing, reset it to the start to allow for rapid plays.
  if (!sound.paused) {
    sound.currentTime = 0;
  }
  sound.play().catch(error => {
    // Autoplay can be blocked by the browser, we'll log this but not bother the user.
    console.warn("Sound effect failed to play:", error);
  });
};

const soundService = {
  playClick: () => playSound(audio.click),
  playSuccess: () => playSound(audio.success),
  playError: () => playSound(audio.error),
};

export default soundService;
