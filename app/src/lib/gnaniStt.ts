import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

const GNANI_STT_URL = 'https://api.vachana.ai/stt/v3';
const GNANI_MODEL = 'prisma-v3.0';
const GNANI_TIMEOUT_MS = 45_000;

export type GnaniSttErrorCode =
  | 'NOT_CONFIGURED'
  | 'VOICE_UNAVAILABLE'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'AUTH'
  | 'CREDITS'
  | 'BUSY'
  | 'AUDIO_TOO_LONG'
  | 'EMPTY_TRANSCRIPT'
  | 'SERVER'
  | 'REQUEST_FAILED'
  | 'INVALID_RESPONSE'
  | 'UNKNOWN';

export class GnaniSttError extends Error {
  readonly code: GnaniSttErrorCode;
  readonly status?: number;

  constructor(code: GnaniSttErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'GnaniSttError';
    this.code = code;
    this.status = status;
  }
}

export type GnaniTranscript = {
  text: string;
  requestId: string;
  detectedLanguage?: string;
  truncated: boolean;
};

type GnaniTranscribeOptions = {
  keyterms?: string[];
  signal?: AbortSignal;
};

function getApiKey() {
  return process.env.EXPO_PUBLIC_GNANI_API_KEY?.trim() ?? '';
}

function getLanguageCode() {
  return process.env.EXPO_PUBLIC_GNANI_STT_LANGUAGE?.trim() || 'en-IN';
}

export function isGnaniConfigured() {
  return getApiKey().length > 0;
}

export function isVoiceInputSupported() {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

function getRecordingFile(uri: string) {
  let audioFile: File;

  try {
    audioFile = new File(uri);
  } catch {
    throw new GnaniSttError(
      'REQUEST_FAILED',
      'The recording could not be read. Try again.'
    );
  }

  if (!audioFile.exists || audioFile.size <= 0) {
    throw new GnaniSttError(
      'REQUEST_FAILED',
      'The recording could not be read. Try again.'
    );
  }

  return audioFile;
}

function extractString(
  source: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = source[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function extractErrorDetails(data: unknown) {
  if (!data || typeof data !== 'object') {
    return { code: '', message: '' };
  }

  const record = data as Record<string, unknown>;
  const nested =
    record.error && typeof record.error === 'object'
      ? (record.error as Record<string, unknown>)
      : null;

  return {
    code: extractString(nested ?? record, ['code', 'error_code']) ?? '',
    message:
      extractString(nested ?? record, ['message', 'detail', 'error']) ??
      extractString(record, ['message', 'detail']) ??
      '',
  };
}

function extractTranscript(data: unknown) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const record = data as Record<string, unknown>;
  const nested =
    record.data && typeof record.data === 'object'
      ? (record.data as Record<string, unknown>)
      : null;
  const result =
    record.result && typeof record.result === 'object'
      ? (record.result as Record<string, unknown>)
      : null;
  const source = nested ?? result ?? record;
  const text = extractString(source, ['transcript', 'text']);

  if (!text) {
    return null;
  }

  const truncatedValue = source.truncated;
  const truncated =
    truncatedValue === true ||
    (typeof truncatedValue === 'string' &&
      truncatedValue.toLowerCase() === 'true');

  return {
    text,
    requestId:
      extractString(source, ['request_id', 'requestId']) ??
      extractString(record, ['request_id', 'requestId']) ??
      '',
    detectedLanguage:
      extractString(source, [
        'detected_language_code',
        'detectedLanguageCode',
        'detected_language',
        'language_code',
        'languageCode',
      ]) ??
      extractString(record, [
        'detected_language_code',
        'detectedLanguageCode',
        'detected_language',
      ]),
    truncated,
  };
}

function errorForStatus(
  status: number,
  details: { code: string; message: string }
): GnaniSttError {
  const combined = `${details.code} ${details.message}`.toUpperCase();

  if (
    status === 400 &&
    (combined.includes('MAX_AUDIO_DURATION_EXCEEDED') ||
      combined.includes('AUDIO_DURATION') ||
      combined.includes('TOO LONG'))
  ) {
    return new GnaniSttError(
      'AUDIO_TOO_LONG',
      'Keep the recording under 30 seconds.',
      status
    );
  }

  if (status === 401) {
    return new GnaniSttError(
      'AUTH',
      "Voice input isn't available right now. You can type the correction instead.",
      status
    );
  }

  if (status === 402 || status === 403) {
    return new GnaniSttError(
      'CREDITS',
      "Voice input isn't available right now. You can type the correction instead.",
      status
    );
  }

  if (status === 413) {
    return new GnaniSttError(
      'AUDIO_TOO_LONG',
      'Keep the recording under 30 seconds.',
      status
    );
  }

  if (status === 429) {
    return new GnaniSttError(
      'BUSY',
      'Speech service is busy; wait a moment and retry.',
      status
    );
  }

  if (status >= 500) {
    return new GnaniSttError(
      'SERVER',
      'Could not reach speech recognition. Try again.',
      status
    );
  }

  return new GnaniSttError(
    'REQUEST_FAILED',
    details.message || 'Speech recognition could not process this recording. Try again.',
    status
  );
}

export async function transcribeAudio(
  uri: string,
  options: GnaniTranscribeOptions = {}
): Promise<GnaniTranscript> {
  if (!isVoiceInputSupported()) {
    throw new GnaniSttError(
      'VOICE_UNAVAILABLE',
      'Voice input is available in the mobile app.'
    );
  }

  const apiKey = getApiKey();

  if (!apiKey) {
    throw new GnaniSttError(
      'NOT_CONFIGURED',
      "Voice input isn't available right now. You can type the correction instead."
    );
  }

  const form = new FormData();

  // Expo's fetch serializes Blob/File parts, not React Native's { uri } parts.
  form.append('audio_file', getRecordingFile(uri));
  form.append('model', GNANI_MODEL);
  form.append('language_code', getLanguageCode());
  form.append('format', 'transcribe');
  form.append('topic', 'Warehouse delivery note correction');

  if (options.keyterms && options.keyterms.length > 0) {
    form.append(
      'keyterms',
      JSON.stringify(
        Array.from(new Set(options.keyterms.map((term) => term.trim())))
          .filter(Boolean)
          .slice(0, 60)
      )
    );
  }

  const requestId = Crypto.randomUUID();
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, GNANI_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  const callerSignal = options.signal;

  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener('abort', abortFromCaller);
    }
  }

  const networkFailure = () => {
    if (timedOut) {
      return new GnaniSttError(
        'TIMEOUT',
        'Could not reach speech recognition. Try again.'
      );
    }

    if (callerSignal?.aborted) {
      return new GnaniSttError('ABORTED', 'Voice input was cancelled.');
    }

    return new GnaniSttError(
      'NETWORK',
      'Could not reach speech recognition. Try again.'
    );
  };

  let response: Awaited<ReturnType<typeof fetch>>;

  try {
    try {
      response = await fetch(GNANI_STT_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'X-API-Key-ID': apiKey,
          'X-API-Request-ID': requestId,
        },
        body: form,
        signal: controller.signal,
      });
    } catch {
      throw networkFailure();
    }

    let responseText = '';

    try {
      responseText = await response.text();
    } catch {
      throw networkFailure();
    }

    let data: unknown = null;

    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch {
        data = null;
      }
    }

    if (!response.ok) {
      throw errorForStatus(response.status, extractErrorDetails(data));
    }

    const transcript = extractTranscript(data);

    if (!transcript) {
      throw new GnaniSttError(
        'EMPTY_TRANSCRIPT',
        "I didn't catch that. Try again."
      );
    }

    return {
      text: transcript.text,
      requestId: transcript.requestId || requestId,
      detectedLanguage: transcript.detectedLanguage,
      truncated: transcript.truncated,
    };
  } finally {
    clearTimeout(timeout);

    if (callerSignal) {
      callerSignal.removeEventListener('abort', abortFromCaller);
    }
  }
}
