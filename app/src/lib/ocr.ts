import { requireOptionalNativeModule } from 'expo';

type TextExtractorModule = typeof import('expo-text-extractor');

export type OcrAvailability =
  | 'ready'
  | 'missing-native-module'
  | 'unsupported';

let textExtractorModule: TextExtractorModule | null = null;
let loadPromise: Promise<TextExtractorModule | null> | null = null;

/**
 * `expo-text-extractor` is a custom native module that is not bundled with
 * Expo Go. Its JS entry point calls `requireNativeModule` at module scope, so
 * importing it when the native module is missing crashes the app before a
 * `try/catch` can help. `requireOptionalNativeModule` returns null instead of
 * throwing, which lets us check before triggering the import.
 */
export function isTextExtractorLinked(): boolean {
  return requireOptionalNativeModule('ExpoTextExtractor') != null;
}

export async function loadTextExtractor(): Promise<TextExtractorModule | null> {
  if (textExtractorModule) {
    return textExtractorModule;
  }

  if (!isTextExtractorLinked()) {
    return null;
  }

  if (!loadPromise) {
    loadPromise = import('expo-text-extractor')
      .then((module) => {
        textExtractorModule = module;
        return module;
      })
      .catch(() => {
        loadPromise = null;
        return null;
      });
  }

  return loadPromise;
}

/**
 * Reports whether on-device text recognition can be used in this build and on
 * this device, without importing the native module when it is unavailable.
 */
export async function getOcrAvailability(): Promise<OcrAvailability> {
  if (!isTextExtractorLinked()) {
    return 'missing-native-module';
  }

  const module = await loadTextExtractor();

  if (!module) {
    return 'missing-native-module';
  }

  return module.isSupported ? 'ready' : 'unsupported';
}

/**
 * Runs on-device text recognition and returns cleaned, non-empty lines.
 * Throws a user-facing error when OCR is not available in this build.
 */
export async function recognizeText(uri: string): Promise<string[]> {
  const module = await loadTextExtractor();

  if (!module) {
    throw new Error(
      'Text recognition is unavailable right now. Try again on a supported Android or iOS device.'
    );
  }

  if (!module.isSupported) {
    throw new Error('This device cannot run on-device text recognition.');
  }

  const lines = await module.extractTextFromImage(uri);

  return lines.map((line) => line.trim()).filter(Boolean);
}
