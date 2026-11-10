import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import type { PurchaseOrderItemRef, DeliveryNoteDetails } from '@/lib/deliveryNote';
import {
  normalizeScopedFieldValue,
  parseScopedItemChanges,
  parseVoiceCorrectionsDetailed,
  type VoiceChange,
  type VoiceParseResult,
  type VoiceTarget,
} from '@/lib/voiceFill';
import { colors, radii } from '@/theme';

type VoiceCorrectionSheetProps = {
  visible: boolean;
  target?: VoiceTarget;
  draft: DeliveryNoteDetails;
  orderItems: PurchaseOrderItemRef[];
  keyterms: string[];
  supported: boolean;
  configured: boolean;
  onClose: () => void;
  onApplyScopedValue: (
    target: VoiceTarget,
    value: string,
    transcript: string
  ) => void;
  onApplyChanges: (
    changes: VoiceChange[],
    transcript: string,
    targetLabel?: string
  ) => void;
};

const EMPTY_PARSE: VoiceParseResult = { changes: [], warnings: [] };

const FREE_FORM_EXAMPLES = [
  'Supplier is Acme Supplies',
  'Delivery date is 6 November 2026',
  'Cement bags quantity is 48',
  'Cement bags delivered 48, 2 damaged',
  'Cement bags description steel rebar',
  'Remove steel rebar',
  'Add paint buckets quantity 6',
];

function formatDuration(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(
    seconds % 60
  ).padStart(2, '0')}`;
}

function fieldPrompt(target: VoiceTarget) {
  if (target.kind !== 'field') {
    return '';
  }

  switch (target.field) {
    case 'poNumber':
      return 'Say the purchase order number, for example “PO 1042”.';
    case 'noteNumber':
      return 'Say the delivery note number, for example “DN 1042”.';
    case 'supplier':
      return 'Say the supplier name, for example “Acme Supplies”.';
    case 'deliveryDate':
      return 'Say the delivery date, for example “6th November 2026”.';
    case 'site':
      return 'Say the delivery site, for example “Riverside Tower”.';
    default:
      return 'Say the value for this field.';
  }
}

function fieldErrorMessage(target: VoiceTarget) {
  if (target.kind !== 'field') {
    return "I couldn't read that value. Edit the text or try again.";
  }

  if (target.field === 'deliveryDate') {
    return 'I couldn’t read that date. Try “6 November 2026”.';
  }

  if (target.field === 'poNumber' || target.field === 'noteNumber') {
    return 'I couldn’t find a reference number. Try “PO 1042” or “DN 1042”.';
  }

  return 'I couldn’t read that value. Edit the text or try again.';
}

export function VoiceCorrectionSheet({
  visible,
  target,
  draft,
  orderItems,
  keyterms,
  supported,
  configured,
  onClose,
  onApplyScopedValue,
  onApplyChanges,
}: VoiceCorrectionSheetProps) {
  const insets = useSafeAreaInsets();
  const {
    status,
    error,
    transcript,
    elapsedSeconds,
    maxDurationSeconds,
    startRecording,
    stopRecording,
    cancel,
    reset,
    openSettings,
  } = useVoiceRecorder({ keyterms, maxDurationSeconds: 30 });

  const [transcriptText, setTranscriptText] = useState('');
  const [parseResult, setParseResult] = useState<VoiceParseResult>(EMPTY_PARSE);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [fieldError, setFieldError] = useState<string | null>(null);
  const parsedTranscriptRef = useRef<string | null>(null);
  const [pulse] = useState(() => new Animated.Value(0));

  const mode =
    target?.kind === 'field' ? 'field' : target?.kind === 'item' ? 'item' : 'freeform';
  const targetItem =
    target?.kind === 'item'
      ? draft.items.find((item) => item.id === target.itemId) ?? null
      : null;

  const parseTranscript = useCallback(
    (text: string) => {
      if (mode === 'field') {
        setParseResult(EMPTY_PARSE);
        setSelected({});
        return;
      }

      if (mode === 'item' && targetItem) {
        const changes = parseScopedItemChanges(text, targetItem);
        setParseResult({ changes, warnings: [] });
        setSelected(
          changes.reduce<Record<string, boolean>>((next, change) => {
            next[change.id] = true;
            return next;
          }, {})
        );
        return;
      }

      const result = parseVoiceCorrectionsDetailed(text, draft, orderItems);
      setParseResult(result);
      setSelected(
        result.changes.reduce<Record<string, boolean>>((next, change) => {
          next[change.id] = true;
          return next;
        }, {})
      );
    },
    [draft, mode, orderItems, targetItem]
  );

  useEffect(() => {
    if (status !== 'recording') {
      pulse.setValue(0);
      return;
    }

    let cancelled = false;
    let animation: Animated.CompositeAnimation | null = null;

    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (cancelled || reduceMotion) {
        return;
      }

      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 900,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
    });

    return () => {
      cancelled = true;
      animation?.stop();
      pulse.setValue(0);
    };
  }, [pulse, status]);

  const clearTranscript = useCallback(() => {
    setTranscriptText('');
    setParseResult(EMPTY_PARSE);
    setSelected({});
    setFieldError(null);
  }, []);

  useEffect(() => {
    if (!transcript || transcript.requestId === parsedTranscriptRef.current) {
      return;
    }

    parsedTranscriptRef.current = transcript.requestId;
    setTranscriptText(transcript.text);
    parseTranscript(transcript.text);
  }, [parseTranscript, transcript]);

  const hasTranscript = transcriptText.trim().length > 0;
  const selectedChanges = parseResult.changes.filter(
    (change) => selected[change.id]
  );
  const canApplyField = Boolean(
    mode === 'field' && target && hasTranscript
  );
  const canApplyChanges = mode !== 'field' && selectedChanges.length > 0;

  const handleClose = () => {
    void cancel();
    onClose();
  };

  const handleStart = () => {
    clearTranscript();
    parsedTranscriptRef.current = null;
    void startRecording();
  };

  const handleStop = () => {
    void stopRecording();
  };

  const handleTryAgain = () => {
    clearTranscript();
    parsedTranscriptRef.current = null;
    reset();
  };

  const handleReparse = () => {
    setFieldError(null);
    parseTranscript(transcriptText);
  };

  const handleUseScopedValue = () => {
    if (!target || target.kind !== 'field') {
      return;
    }

    const value = normalizeScopedFieldValue(target.field, transcriptText);

    if (!value) {
      setFieldError(fieldErrorMessage(target));
      return;
    }

    setFieldError(null);
    onApplyScopedValue(target, value, transcriptText.trim());
    handleClose();
  };

  const handleApplyChanges = () => {
    if (!target || target.kind !== 'item') {
      return;
    }

    if (parseResult.changes.length === 0) {
      return;
    }

    onApplyChanges(
      parseResult.changes,
      transcriptText.trim(),
      target.label
    );
    handleClose();
  };

  const handleApplyFreeForm = () => {
    if (selectedChanges.length === 0) {
      return;
    }

    onApplyChanges(
      selectedChanges,
      transcriptText.trim(),
      'Voice corrections'
    );
    handleClose();
  };

  const toggleChange = (id: string) => {
    setSelected((current) => ({ ...current, [id]: !current[id] }));
  };

  const title =
    target?.kind === 'field'
      ? `Dictate ${target.label.toLowerCase()}`
      : target?.kind === 'item'
        ? `Fix ${target.label}`
        : 'Speak corrections';

  const prompt =
    target?.kind === 'field'
      ? fieldPrompt(target)
      : target?.kind === 'item'
        ? `Say the description, delivered quantity, or damaged count for ${target.label}. For example “delivered 48, 2 damaged” or “description steel rebar”.`
        : 'Describe one or more corrections in one go.';

  const renderRecorder = () => {
    if (status === 'requesting-permission') {
      return (
        <View style={styles.progressRow}>
          <ActivityIndicator size="small" color={colors.forest} />
          <Text style={styles.progressText}>Checking microphone access…</Text>
        </View>
      );
    }

    if (status === 'permission-denied') {
      return (
        <View style={styles.errorBox}>
          <View style={styles.errorTitleRow}>
            <Ionicons name="mic-off-outline" size={16} color={colors.danger} />
            <Text style={styles.errorTitle}>Microphone access is off</Text>
          </View>
          <Text style={styles.errorText}>
            {error?.message ?? 'Allow microphone access to use voice correction.'}
          </Text>
          {error?.canOpenSettings ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open device settings"
              onPress={openSettings}
              style={({ pressed }) => [
                styles.linkButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.linkButtonText}>Open settings</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Try microphone permission again"
              onPress={handleStart}
              style={({ pressed }) => [
                styles.linkButton,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="refresh-outline" size={13} color={colors.forest} />
              <Text style={styles.linkButtonText}>Try again</Text>
            </Pressable>
          )}
        </View>
      );
    }

    if (status === 'recording') {
      return (
        <View style={styles.recordingBox}>
          <Text style={styles.recordingTimer}>
            {formatDuration(elapsedSeconds)} / {formatDuration(maxDurationSeconds)}
          </Text>
          <Text style={styles.recordingHint}>Listening… tap stop when finished.</Text>
          <View style={styles.stopButtonWrap}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.pulseRing,
                {
                  opacity: pulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.45, 0],
                  }),
                  transform: [
                    {
                      scale: pulse.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.55],
                      }),
                    },
                  ],
                },
              ]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop recording"
              onPress={handleStop}
              style={({ pressed }) => [
                styles.stopButton,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="stop" size={24} color={colors.white} />
            </Pressable>
          </View>
        </View>
      );
    }

    if (status === 'transcribing') {
      return (
        <View style={styles.progressBox}>
          <ActivityIndicator size="large" color={colors.forest} />
          <Text style={styles.progressTitle}>Transcribing your voice…</Text>
          <Text style={styles.progressText}>
            This usually takes a few seconds.
          </Text>
        </View>
      );
    }

    if (status === 'error' && !hasTranscript) {
      return (
        <View style={styles.errorBox}>
          <View style={styles.errorTitleRow}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={styles.errorTitle}>Voice input stopped</Text>
          </View>
          <Text style={styles.errorText}>
            {error?.message ?? 'Something went wrong. Try again.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try recording again"
            onPress={handleTryAgain}
            style={({ pressed }) => [
              styles.linkButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="refresh-outline" size={13} color={colors.forest} />
            <Text style={styles.linkButtonText}>Try again</Text>
          </Pressable>
        </View>
      );
    }

    if (hasTranscript) {
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Record again"
          onPress={handleTryAgain}
          style={({ pressed }) => [
            styles.recordAgainButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="mic-outline" size={15} color={colors.forest} />
          <Text style={styles.recordAgainText}>Record again</Text>
        </Pressable>
      );
    }

    return (
      <View style={styles.recordBox}>
        <Text style={styles.recordHint}>
          Up to {maxDurationSeconds} seconds. Speak clearly and include quantities.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start recording"
          onPress={handleStart}
          style={({ pressed }) => [
            styles.recordButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="mic" size={30} color={colors.white} />
        </Pressable>
        <Text style={styles.recordLabel}>Tap to record</Text>
      </View>
    );
  };

  const renderChange = (change: VoiceChange) => {
    const isChecked = selected[change.id] === true;
    const valueText = change.from
      ? `${change.from} → ${change.to ?? '—'}`
      : change.to ?? '';

    return (
      <Pressable
        key={change.id}
        accessibilityRole={mode === 'freeform' ? 'checkbox' : undefined}
        accessibilityState={
          mode === 'freeform' ? { checked: isChecked } : undefined
        }
        aria-checked={mode === 'freeform' ? isChecked : undefined}
        accessibilityLabel={`${change.label}: ${valueText}`}
        onPress={mode === 'freeform' ? () => toggleChange(change.id) : undefined}
        style={({ pressed }) => [
          styles.changeRow,
          pressed && mode === 'freeform' && styles.pressed,
        ]}
      >
        {mode === 'freeform' ? (
          <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
            {isChecked ? (
              <Ionicons name="checkmark" size={12} color={colors.white} />
            ) : null}
          </View>
        ) : (
          <View style={styles.changeIcon}>
            <Ionicons name="mic-outline" size={12} color={colors.forest} />
          </View>
        )}

        <View style={styles.changeCopy}>
          <Text style={styles.changeLabel}>{change.label}</Text>
          <Text style={styles.changeValue}>{valueText}</Text>
        </View>

        <View
          style={[
            styles.confidenceBadge,
            change.confidence === 'exact'
              ? styles.confidenceMatched
              : styles.confidenceReview,
          ]}
        >
          <Text
            style={[
              styles.confidenceText,
              change.confidence === 'exact'
                ? styles.confidenceTextMatched
                : styles.confidenceTextReview,
            ]}
          >
            {change.confidence === 'exact' ? 'Matched' : 'Review'}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close voice corrections"
          onPress={handleClose}
          style={styles.backdrop}
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardWrap}
        >
          <View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(24, insets.bottom + 12) },
            ]}
          >
            <View style={styles.grabber} />

            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>
                  {target ? 'Dictate one detail' : 'Voice corrections'}
                </Text>
                <Text style={styles.title}>{title}</Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close voice corrections"
                onPress={handleClose}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="close" size={19} color={colors.forest} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {!supported ? (
                <View style={styles.disabledBox}>
                  <Ionicons name="phone-portrait-outline" size={18} color={colors.inkSoft} />
                  <Text style={styles.disabledText}>
                    Voice input is available in the mobile app.
                  </Text>
                </View>
              ) : !configured ? (
                <View style={styles.disabledBox}>
                  <Ionicons name="mic-off-outline" size={18} color={colors.inkSoft} />
                  <Text style={styles.disabledText}>
                    Voice input isn&apos;t available right now. You can type the
                    correction instead.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.prompt}>{prompt}</Text>

                  {mode === 'freeform' &&
                  (!hasTranscript || parseResult.changes.length === 0) ? (
                    <View style={styles.examplesBox}>
                      <Text style={styles.examplesTitle}>Try saying</Text>
                      {FREE_FORM_EXAMPLES.map((example) => (
                        <View key={example} style={styles.exampleRow}>
                          <View style={styles.exampleDot} />
                          <Text style={styles.exampleText}>“{example}”</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {renderRecorder()}

                  {hasTranscript ? (
                    <View style={styles.transcriptCard}>
                      <View style={styles.transcriptHeader}>
                        <View style={styles.transcriptLabelRow}>
                          <Ionicons
                            name="pencil"
                            size={12}
                            color={colors.inkFaint}
                          />
                          <Text style={styles.transcriptLabel}>Transcript</Text>
                        </View>
                        {mode !== 'field' ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Re-parse transcript"
                            onPress={handleReparse}
                            style={({ pressed }) => [
                              styles.reparseButton,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Ionicons name="refresh-outline" size={12} color={colors.forest} />
                            <Text style={styles.reparseText}>Re-parse</Text>
                          </Pressable>
                        ) : null}
                      </View>

                      <TextInput
                        value={transcriptText}
                        onChangeText={(value) => {
                          setTranscriptText(value);
                          setFieldError(null);
                        }}
                        accessibilityLabel="Voice transcript"
                        multiline
                        autoCapitalize="sentences"
                        placeholder="Your words will appear here"
                        placeholderTextColor={colors.inkFaint}
                        selectionColor={colors.forest}
                        style={styles.transcriptInput}
                      />

                      {transcript?.truncated ? (
                        <Text style={styles.truncatedText}>
                          Only the first part of the recording was transcribed.
                        </Text>
                      ) : null}

                      {fieldError ? (
                        <View style={styles.inlineError}>
                          <Ionicons
                            name="alert-circle-outline"
                            size={14}
                            color={colors.danger}
                          />
                          <Text style={styles.inlineErrorText}>{fieldError}</Text>
                        </View>
                      ) : null}

                      {mode !== 'field' ? (
                        <View style={styles.changesSection}>
                          <Text style={styles.changesTitle}>
                            {mode === 'item'
                              ? 'This will update'
                              : 'Proposed changes'}
                          </Text>

                          {parseResult.changes.length > 0 ? (
                            <View style={styles.changeList}>
                              {parseResult.changes.map(renderChange)}
                            </View>
                          ) : (
                            <Text style={styles.emptyChanges}>
                              {mode === 'item'
                                ? 'I couldn’t find a description or quantity. Edit the transcript and tap Re-parse.'
                                : 'I couldn’t find a change in that transcript. Edit it and tap Re-parse, or record again.'}
                            </Text>
                          )}

                          {parseResult.warnings.length > 0 ? (
                            <View style={styles.warningBox}>
                              {parseResult.warnings.map((warning) => (
                                <View key={warning} style={styles.warningRow}>
                                  <Ionicons
                                    name="information-circle-outline"
                                    size={13}
                                    color={colors.inkSoft}
                                  />
                                  <Text style={styles.warningText}>{warning}</Text>
                                </View>
                              ))}
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  <View style={styles.actionRow}>
                    {mode === 'field' ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Use this value"
                        accessibilityState={{ disabled: !canApplyField }}
                        disabled={!canApplyField}
                        onPress={handleUseScopedValue}
                        style={({ pressed }) => [
                          styles.primaryButton,
                          !canApplyField && styles.primaryButtonDisabled,
                          pressed && canApplyField && styles.pressed,
                        ]}
                      >
                        <Ionicons
                          name="checkmark"
                          size={17}
                          color={colors.white}
                        />
                        <Text style={styles.primaryButtonText}>Use this value</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={
                          mode === 'item'
                            ? 'Apply item changes'
                            : `Apply ${selectedChanges.length} changes`
                        }
                        accessibilityState={{ disabled: !canApplyChanges }}
                        disabled={!canApplyChanges}
                        onPress={
                          mode === 'item'
                            ? handleApplyChanges
                            : handleApplyFreeForm
                        }
                        style={({ pressed }) => [
                          styles.primaryButton,
                          !canApplyChanges && styles.primaryButtonDisabled,
                          pressed && canApplyChanges && styles.pressed,
                        ]}
                      >
                        <Ionicons
                          name="checkmark"
                          size={17}
                          color={colors.white}
                        />
                        <Text style={styles.primaryButtonText}>
                          {mode === 'item'
                            ? 'Use these changes'
                            : `Apply ${selectedChanges.length} ${
                                selectedChanges.length === 1 ? 'change' : 'changes'
                              }`}
                        </Text>
                      </Pressable>
                    )}
                  </View>

                  {hasTranscript ? (
                    <View style={styles.secondaryActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Try voice again"
                        onPress={handleTryAgain}
                        style={({ pressed }) => [
                          styles.secondaryButton,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Ionicons name="refresh-outline" size={14} color={colors.forest} />
                        <Text style={styles.secondaryButtonText}>Try again</Text>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Discard voice corrections"
                        onPress={handleClose}
                        style={({ pressed }) => [
                          styles.secondaryButton,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Ionicons name="close-outline" size={14} color={colors.inkSoft} />
                        <Text style={styles.discardButtonText}>Discard</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </>
              )}

              <View style={styles.privacyRow}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={12}
                  color={colors.inkFaint}
                />
                <Text style={styles.privacyText}>
                  Audio is sent to Gnani for transcription. Crewline does not keep
                  the recording.
                </Text>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.scrim,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  keyboardWrap: {
    maxHeight: '92%',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 20,
    paddingBottom: 24,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
    maxHeight: '100%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    marginBottom: 14,
    backgroundColor: colors.lineStrong,
    borderRadius: radii.pill,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    color: colors.inkSoft,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  title: {
    marginTop: 5,
    color: colors.ink,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '700',
    letterSpacing: -0.7,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.sm,
  },
  scroll: {
    marginTop: 12,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  prompt: {
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  examplesBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    gap: 6,
  },
  examplesTitle: {
    color: colors.inkFaint,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  exampleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  exampleDot: {
    width: 4,
    height: 4,
    marginTop: 6,
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
  },
  exampleText: {
    flex: 1,
    color: colors.inkSoft,
    fontSize: 12.5,
    lineHeight: 18,
  },
  recordBox: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
  },
  recordHint: {
    maxWidth: 280,
    color: colors.inkFaint,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  recordButton: {
    width: 74,
    height: 74,
    marginTop: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.forest,
    borderRadius: radii.pill,
    shadowColor: colors.forest,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
  recordLabel: {
    marginTop: 9,
    color: colors.forest,
    fontSize: 12,
    fontWeight: '700',
  },
  recordingBox: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentSoft,
    borderRadius: radii.md,
  },
  recordingTimer: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  recordingHint: {
    marginTop: 4,
    color: colors.inkSoft,
    fontSize: 12,
  },
  stopButtonWrap: {
    width: 64,
    height: 64,
    marginTop: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButton: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
    borderRadius: radii.pill,
  },
  pulseRing: {
    position: 'absolute',
    width: 64,
    height: 64,
    backgroundColor: colors.danger,
    borderRadius: radii.pill,
  },
  progressBox: {
    marginTop: 16,
    alignItems: 'center',
    padding: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    gap: 7,
  },
  progressTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  progressRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
  },
  progressText: {
    flexShrink: 1,
    color: colors.inkSoft,
    fontSize: 12.5,
    lineHeight: 18,
  },
  errorBox: {
    marginTop: 16,
    padding: 13,
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.sm,
    gap: 5,
  },
  errorTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  errorTitle: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  errorText: {
    color: colors.inkSoft,
    fontSize: 12.5,
    lineHeight: 18,
  },
  linkButton: {
    minHeight: 44,
    alignSelf: 'flex-start',
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
  },
  linkButtonText: {
    color: colors.forest,
    fontSize: 12.5,
    fontWeight: '700',
  },
  recordAgainButton: {
    minHeight: 44,
    alignSelf: 'center',
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: colors.sage,
    borderRadius: radii.pill,
  },
  recordAgainText: {
    color: colors.forest,
    fontSize: 12,
    fontWeight: '700',
  },
  transcriptCard: {
    marginTop: 14,
    padding: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
  },
  transcriptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  transcriptLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  transcriptLabel: {
    color: colors.inkFaint,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  reparseButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  reparseText: {
    color: colors.forest,
    fontSize: 12,
    fontWeight: '700',
  },
  transcriptInput: {
    minHeight: 70,
    marginTop: 9,
    padding: 11,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'top',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
  },
  truncatedText: {
    marginTop: 6,
    color: colors.inkFaint,
    fontSize: 11,
    lineHeight: 16,
  },
  inlineError: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    padding: 9,
    backgroundColor: colors.dangerSoft,
    borderRadius: 9,
  },
  inlineErrorText: {
    flex: 1,
    color: colors.danger,
    fontSize: 12,
    lineHeight: 17,
  },
  changesSection: {
    marginTop: 13,
  },
  changesTitle: {
    color: colors.inkFaint,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  changeList: {
    marginTop: 8,
    gap: 6,
  },
  changeRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 9,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
  },
  checkbox: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: 5,
  },
  checkboxChecked: {
    backgroundColor: colors.forest,
    borderColor: colors.forest,
  },
  changeIcon: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.sage,
    borderRadius: 5,
  },
  changeCopy: {
    flex: 1,
    gap: 1,
  },
  changeLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  changeValue: {
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  confidenceBadge: {
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: radii.pill,
  },
  confidenceMatched: {
    backgroundColor: colors.successSoft,
  },
  confidenceReview: {
    backgroundColor: colors.warningSoft,
  },
  confidenceText: {
    fontSize: 11,
    fontWeight: '700',
  },
  confidenceTextMatched: {
    color: colors.success,
  },
  confidenceTextReview: {
    color: colors.warning,
  },
  emptyChanges: {
    marginTop: 7,
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  warningBox: {
    marginTop: 9,
    padding: 9,
    backgroundColor: colors.accentSoft,
    borderRadius: radii.sm,
    gap: 5,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  warningText: {
    flex: 1,
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  actionRow: {
    marginTop: 14,
  },
  primaryButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.forest,
    borderRadius: radii.sm,
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryActions: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.sm,
  },
  secondaryButtonText: {
    color: colors.forest,
    fontSize: 12,
    fontWeight: '700',
  },
  discardButtonText: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: '700',
  },
  disabledBox: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    padding: 14,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
  },
  disabledText: {
    flex: 1,
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  privacyRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 5,
  },
  privacyText: {
    maxWidth: 320,
    color: colors.inkFaint,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
});
