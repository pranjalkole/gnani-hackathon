import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';

import {
  GnaniSttError,
  transcribeAudio,
  type GnaniTranscript,
} from '@/lib/gnaniStt';

export type VoiceRecorderStatus =
  | 'idle'
  | 'requesting-permission'
  | 'permission-denied'
  | 'recording'
  | 'transcribing'
  | 'error';

export type VoiceRecorderError = {
  code: string;
  message: string;
  canOpenSettings: boolean;
};

type UseVoiceRecorderOptions = {
  keyterms?: string[];
  maxDurationSeconds?: number;
  onTranscript?: (transcript: GnaniTranscript) => void;
};

const DEFAULT_MAX_DURATION_SECONDS = 30;
const MIN_RECORDING_MILLISECONDS = 900;

function toRecorderError(error: unknown): VoiceRecorderError {
  if (error instanceof GnaniSttError) {
    return {
      code: error.code,
      message: error.message,
      canOpenSettings: false,
    };
  }

  return {
    code: 'RECORDING_FAILED',
    message: 'Could not use the microphone. Try again.',
    canOpenSettings: false,
  };
}

export function useVoiceRecorder({
  keyterms,
  maxDurationSeconds = DEFAULT_MAX_DURATION_SECONDS,
  onTranscript,
}: UseVoiceRecorderOptions = {}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 100);
  const [status, setStatus] = useState<VoiceRecorderStatus>('idle');
  const [error, setError] = useState<VoiceRecorderError | null>(null);
  const [transcript, setTranscript] = useState<GnaniTranscript | null>(null);

  const mountedRef = useRef(true);
  const statusRef = useRef<VoiceRecorderStatus>('idle');
  const sessionRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingStartedAtRef = useRef(0);
  const stopRecordingRef = useRef<() => void>(() => undefined);
  const keytermsRef = useRef(keyterms);
  const onTranscriptRef = useRef(onTranscript);

  const isSupported =
    Platform.OS === 'android' || Platform.OS === 'ios';

  const elapsedSeconds = Math.min(
    maxDurationSeconds,
    Math.max(0, Math.floor(recorderState.durationMillis / 1000))
  );

  useEffect(() => {
    keytermsRef.current = keyterms;
    onTranscriptRef.current = onTranscript;
  }, [keyterms, onTranscript]);

  const updateStatus = useCallback((next: VoiceRecorderStatus) => {
    statusRef.current = next;

    if (mountedRef.current) {
      setStatus(next);
    }
  }, []);

  const clearAutoStopTimer = useCallback(() => {
    if (autoStopTimerRef.current !== null) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      sessionRef.current += 1;
      abortRef.current?.abort();
      clearAutoStopTimer();

      if (recorder.isRecording) {
        void recorder.stop().catch(() => undefined);
      }

      void setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      }).catch(() => undefined);
    };
  }, [clearAutoStopTimer, recorder]);

  useEffect(() => {
    if (!isSupported) {
      return;
    }

    let cancelled = false;

    void AudioModule.getRecordingPermissionsAsync()
      .then((permission) => {
        if (cancelled || permission.granted || permission.canAskAgain) {
          return;
        }

        updateStatus('permission-denied');
        setError({
          code: 'PERMISSION_DENIED',
          message: 'Microphone access is off. Open settings to allow it.',
          canOpenSettings: true,
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [isSupported, updateStatus]);

  const startRecording = useCallback(async () => {
    if (!isSupported) {
      setError({
        code: 'VOICE_UNAVAILABLE',
        message: 'Voice input is available in the mobile app.',
        canOpenSettings: false,
      });
      updateStatus('error');
      return;
    }

    if (
      statusRef.current === 'requesting-permission' ||
      statusRef.current === 'recording' ||
      statusRef.current === 'transcribing'
    ) {
      return;
    }

    sessionRef.current += 1;
    const session = sessionRef.current;

    clearAutoStopTimer();
    setError(null);
    setTranscript(null);
    updateStatus('requesting-permission');

    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();

      if (!mountedRef.current || session !== sessionRef.current) {
        return;
      }

      if (!permission.granted) {
        setError({
          code: 'PERMISSION_DENIED',
          message: permission.canAskAgain
            ? 'Microphone access is needed for voice correction.'
            : 'Microphone access is off. Open settings to allow it.',
          canOpenSettings: !permission.canAskAgain,
        });
        updateStatus('permission-denied');
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      if (!mountedRef.current || session !== sessionRef.current) {
        return;
      }

      await recorder.prepareToRecordAsync();

      if (!mountedRef.current || session !== sessionRef.current) {
        return;
      }

      recorder.record({ forDuration: maxDurationSeconds });
      recordingStartedAtRef.current = Date.now();
      updateStatus('recording');

      autoStopTimerRef.current = setTimeout(
        () => {
          autoStopTimerRef.current = null;
          stopRecordingRef.current();
        },
        Math.max(1000, maxDurationSeconds * 1000 - 200)
      );
    } catch (recordingError) {
      if (!mountedRef.current || session !== sessionRef.current) {
        return;
      }

      setError(toRecorderError(recordingError));
      updateStatus('error');
    }
  }, [
    clearAutoStopTimer,
    isSupported,
    maxDurationSeconds,
    recorder,
    updateStatus,
  ]);

  const stopRecording = useCallback(async () => {
    if (statusRef.current !== 'recording') {
      return;
    }

    clearAutoStopTimer();
    const session = sessionRef.current;
    const wasRecording = recorder.isRecording;
    const durationMillis = wasRecording
      ? Math.max(Date.now() - recordingStartedAtRef.current, 0)
      : maxDurationSeconds * 1000;

    updateStatus('transcribing');

    let uri: string | null = null;

    try {
      if (wasRecording) {
        await recorder.stop();
      }

      uri = recorder.uri;
    } catch (recordingError) {
      if (!mountedRef.current || session !== sessionRef.current) {
        return;
      }

      setError(toRecorderError(recordingError));
      updateStatus('error');
      return;
    } finally {
      void setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      }).catch(() => undefined);
    }

    if (!mountedRef.current || session !== sessionRef.current) {
      return;
    }

    if (!uri || durationMillis < MIN_RECORDING_MILLISECONDS) {
      setError({
        code: 'EMPTY_RECORDING',
        message: "Hold on, I didn't hear anything. Try again.",
        canOpenSettings: false,
      });
      updateStatus('error');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await transcribeAudio(uri, {
        keyterms: keytermsRef.current,
        signal: controller.signal,
      });

      if (!mountedRef.current || session !== sessionRef.current) {
        return;
      }

      setTranscript(result);
      updateStatus('idle');
      onTranscriptRef.current?.(result);
    } catch (transcriptionError) {
      if (!mountedRef.current || session !== sessionRef.current) {
        return;
      }

      if (
        transcriptionError instanceof GnaniSttError &&
        transcriptionError.code === 'ABORTED'
      ) {
        return;
      }

      setError(toRecorderError(transcriptionError));
      updateStatus('error');
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [clearAutoStopTimer, maxDurationSeconds, recorder, updateStatus]);

  useEffect(() => {
    stopRecordingRef.current = () => {
      void stopRecording();
    };
  }, [stopRecording]);

  const cancel = useCallback(async () => {
    sessionRef.current += 1;
    abortRef.current?.abort();
    clearAutoStopTimer();
    recordingStartedAtRef.current = 0;

    if (statusRef.current === 'recording') {
      updateStatus('idle');

      try {
        await recorder.stop();
      } catch {
        // The recorder may already have been released.
      }

      void setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      }).catch(() => undefined);
    } else if (statusRef.current !== 'idle') {
      updateStatus('idle');
    }

    if (mountedRef.current) {
      setError(null);
      setTranscript(null);
    }
  }, [clearAutoStopTimer, recorder, updateStatus]);

  const reset = useCallback(() => {
    void cancel();
  }, [cancel]);

  const openSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  return {
    status,
    error,
    transcript,
    elapsedSeconds,
    maxDurationSeconds,
    isSupported,
    isRecording: status === 'recording',
    isTranscribing: status === 'transcribing',
    isBusy:
      status === 'requesting-permission' ||
      status === 'recording' ||
      status === 'transcribing',
    startRecording,
    stopRecording,
    cancel,
    reset,
    openSettings,
  };
}
