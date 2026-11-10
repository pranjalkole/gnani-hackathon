import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { DocumentCamera } from '@/components/DocumentCamera';
import { FormField } from '@/components/FormField';
import { VoiceCorrectionSheet } from '@/components/VoiceCorrectionSheet';
import { VoiceFixCard } from '@/components/VoiceFixCard';
import { AppHeader, Notice, Screen } from '@/components/ui';
import {
  ApiError,
  createClientRequestId,
  createDelivery,
  validateDeliveryNote,
  type DeliveryValidationResponse,
  type ValidationIssue,
} from '@/lib/api';
import {
  attachPurchaseOrderItemIds,
  createDeliveryItem,
  getGoodQuantity,
  normalizeDeliveryDate,
  parseDeliveryNote,
  parseNonNegativeQuantity,
  parsePositiveQuantity,
  roundQuantity,
  type DeliveryNoteDetails,
  type DeliveryNoteItem,
} from '@/lib/deliveryNote';
import { isGnaniConfigured, isVoiceInputSupported } from '@/lib/gnaniStt';
import {
  applyVoiceChanges,
  getVoiceTargets,
  type VoiceChange,
  type VoiceTarget,
} from '@/lib/voiceFill';
import { colors, radii } from '@/theme';

type ScreenStage = 'capture' | 'review' | 'success';
type EditableField = 'poNumber' | 'noteNumber' | 'supplier' | 'deliveryDate' | 'site';
type ValidationStatus = 'idle' | 'checking' | 'valid' | 'invalid' | 'error';

type FormErrors = {
  poNumber?: string;
  noteNumber?: string;
  supplier?: string;
  deliveryDate?: string;
  site?: string;
  items?: string;
  itemErrors?: Record<string, string>;
  confirmation?: string;
};

type ConfirmedSummary = {
  details: DeliveryNoteDetails;
  confirmedAt: string;
};

type RecordedSummary = {
  id: string;
  idempotentReplay: boolean;
  orderStatus: string;
  recordedAt: string;
};

type VoiceTranscriptEntry = {
  target: string;
  text: string;
  createdAt: string;
};

type SummaryRowProps = {
  label: string;
  value: string;
  isLast?: boolean;
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function formatConfirmedAt(date: Date) {
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;

  return `${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)} ${date.getFullYear()} · ${displayHour}:${minutes} ${meridiem}`;
}

function getOcrNotice(parsed: DeliveryNoteDetails, lines: string[]) {
  if (lines.length === 0) {
    return 'No text was detected. Enter the delivery details manually below.';
  }

  const missingFields: string[] = [];

  if (!parsed.poNumber) {
    missingFields.push('PO number');
  }

  if (!parsed.noteNumber) {
    missingFields.push('note number');
  }

  if (!parsed.supplier) {
    missingFields.push('supplier');
  }

  if (!parsed.deliveryDate) {
    missingFields.push('date');
  }

  if (!parsed.site) {
    missingFields.push('site');
  }

  if (parsed.items.length === 0) {
    missingFields.push('items');
  }

  if (missingFields.length === 0) {
    return null;
  }

  return `OCR could not read the ${missingFields.join(
    ', '
  )}. Check the details and fill in anything that is missing.`;
}

function formatOrderStatus(status: string) {
  return status.replace(/_/g, ' ');
}

function isDraftReadyForValidation(draft: DeliveryNoteDetails) {
  if (
    !draft.poNumber.trim() ||
    !draft.noteNumber.trim() ||
    !draft.supplier.trim() ||
    !draft.site.trim() ||
    !normalizeDeliveryDate(draft.deliveryDate)
  ) {
    return false;
  }

  if (draft.items.length === 0) {
    return false;
  }

  return draft.items.every(
    (item) =>
      item.description.trim() !== '' &&
      parsePositiveQuantity(item.quantity) !== null &&
      (!item.received || getGoodQuantity(item) !== null)
  );
}

function issueColor(issue: ValidationIssue) {
  return issue.severity === 'warning' ? colors.inkSoft : colors.danger;
}

function issueDetail(issue: ValidationIssue) {
  const parts: string[] = [];

  if (issue.expectedMax !== undefined && issue.expectedMax !== null) {
    parts.push(`Max ${issue.expectedMax}`);
  }

  if (issue.expected !== undefined && issue.expected !== null && issue.expected !== '') {
    parts.push(`Expected ${issue.expected}`);
  }

  if (issue.actual !== undefined && issue.actual !== null && issue.actual !== '') {
    parts.push(`Got ${issue.actual}`);
  }

  return parts.join(' · ');
}

function SummaryRow({ label, value, isLast = false }: SummaryRowProps) {
  return (
    <View style={[styles.summaryRow, isLast && styles.summaryRowLast]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value || '—'}</Text>
    </View>
  );
}

export default function DeliveryNoteScreen() {
  const router = useRouter();
  const { identifier, workerName } = useLocalSearchParams<{
    identifier?: string;
    workerName?: string;
  }>();

  const [stage, setStage] = useState<ScreenStage>('capture');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [rawLines, setRawLines] = useState<string[]>([]);
  const [showRawText, setShowRawText] = useState(false);
  const [draft, setDraft] = useState<DeliveryNoteDetails | null>(null);
  const [ocrNotice, setOcrNotice] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [confirmedSummary, setConfirmedSummary] = useState<ConfirmedSummary | null>(null);
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>('idle');
  const [validationResult, setValidationResult] = useState<DeliveryValidationResponse | null>(
    null
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [serverIssues, setServerIssues] = useState<ValidationIssue[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [clientRequestId, setClientRequestId] = useState<string | null>(null);
  const [recordedSummary, setRecordedSummary] = useState<RecordedSummary | null>(null);
  const [voiceSheet, setVoiceSheet] = useState<{
    visible: boolean;
    target?: VoiceTarget;
  }>({ visible: false });
  const [voiceTranscripts, setVoiceTranscripts] = useState<VoiceTranscriptEntry[]>([]);
  const submittingRef = useRef(false);
  // Prevent a late validation response from enabling confirmation after an edit.
  const validationRunRef = useRef(0);

  const workerLabel = (workerName ?? '').trim() || 'Worker';
  const workerIdentifier = (identifier ?? '').trim();
  const voiceSupported = isVoiceInputSupported();
  const voiceConfigured = isGnaniConfigured();
  const voiceAvailable = voiceSupported && voiceConfigured;
  const voiceKeyterms = draft
    ? [
        'purchase order',
        'delivery note',
        'supplier',
        'delivery date',
        'site',
        ...(validationResult?.order?.items ?? []).map((item) => item.description),
        ...draft.items.map((item) => item.description),
        draft.poNumber,
        draft.noteNumber,
        draft.supplier,
        draft.site,
      ].filter((term) => term.trim().length > 0)
    : [];

  const invalidateValidation = () => {
    validationRunRef.current += 1;
    setConfirmed(false);
    setValidationStatus('idle');
    setValidationResult(null);
    setValidationError(null);
    setSubmitError(null);
    setServerIssues([]);
    setClientRequestId(null);
  };

  const handleClose = () => {
    if (submittingRef.current) {
      return;
    }

    const leave = () => {
      if (router.canGoBack()) {
        router.back();
        return;
      }

      router.replace('/worker-dashboard');
    };

    if (stage === 'review') {
      Alert.alert(
        'Discard this delivery?',
        'Your scanned details will not be saved.',
        [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: leave },
        ]
      );
      return;
    }

    leave();
  };

  const resetToCapture = () => {
    if (submittingRef.current) {
      return;
    }

    validationRunRef.current += 1;
    setStage('capture');
    setPhotoUri(null);
    setRawLines([]);
    setShowRawText(false);
    setDraft(null);
    setOcrNotice(null);
    setConfirmed(false);
    setErrors({});
    setConfirmedSummary(null);
    setValidationStatus('idle');
    setValidationResult(null);
    setValidationError(null);
    setValidationAttempt(0);
    setSubmitError(null);
    setServerIssues([]);
    setSubmitting(false);
    submittingRef.current = false;
    setClientRequestId(null);
    setRecordedSummary(null);
    setVoiceSheet({ visible: false });
    setVoiceTranscripts([]);
  };

  const handleExtracted = ({ uri, lines }: { uri: string; lines: string[] }) => {
    const parsed = parseDeliveryNote(lines);

    validationRunRef.current += 1;
    setPhotoUri(uri);
    setRawLines(lines);
    setDraft({
      ...parsed,
      items:
        parsed.items.length > 0 ? parsed.items : [createDeliveryItem('', '')],
    });
    setOcrNotice(getOcrNotice(parsed, lines));
    setShowRawText(false);
    setConfirmed(false);
    setErrors({});
    setValidationStatus('idle');
    setValidationResult(null);
    setValidationError(null);
    setValidationAttempt(0);
    setSubmitError(null);
    setServerIssues([]);
    setSubmitting(false);
    submittingRef.current = false;
    setClientRequestId(null);
    setRecordedSummary(null);
    setVoiceSheet({ visible: false });
    setVoiceTranscripts([]);
    setStage('review');
  };

  const updateField = (field: EditableField, value: string) => {
    if (submittingRef.current) {
      return;
    }

    setDraft((current) => (current ? { ...current, [field]: value } : current));
    setErrors((current) =>
      current[field] ? { ...current, [field]: undefined } : current
    );
    invalidateValidation();
  };

  const updateItem = (
    itemId: string,
    patch: Partial<
      Pick<
        DeliveryNoteItem,
        'description' | 'quantity' | 'damagedQuantity' | 'received'
      >
    >
  ) => {
    if (submittingRef.current) {
      return;
    }

    setDraft((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === itemId ? { ...item, ...patch } : item
            ),
          }
        : current
    );

    setErrors((current) => {
      let next = current;

      if (current.itemErrors?.[itemId]) {
        const itemErrors = { ...current.itemErrors };
        delete itemErrors[itemId];
        next = { ...next, itemErrors };
      }

      if (patch.description !== undefined || patch.quantity !== undefined) {
        next = { ...next, items: undefined };
      }

      return next;
    });

    invalidateValidation();
  };

  const handleAddItem = () => {
    if (submittingRef.current) {
      return;
    }

    setDraft((current) =>
      current
        ? {
            ...current,
            items: [...current.items, createDeliveryItem('', '')],
          }
        : current
    );
    invalidateValidation();
  };

  const handleRemoveItem = (itemId: string) => {
    if (submittingRef.current) {
      return;
    }

    setDraft((current) => {
      if (!current || current.items.length <= 1) {
        return current;
      }

      return {
        ...current,
        items: current.items.filter((item) => item.id !== itemId),
      };
    });
    setErrors((current) => {
      if (!current.itemErrors?.[itemId]) {
        return current;
      }

      const itemErrors = { ...current.itemErrors };
      delete itemErrors[itemId];

      return { ...current, itemErrors };
    });
    invalidateValidation();
  };

  const appendVoiceTranscript = (target: string, text: string) => {
    const trimmed = text.trim();

    if (!trimmed) {
      return;
    }

    setVoiceTranscripts((current) => [
      ...current,
      { target, text: trimmed, createdAt: new Date().toISOString() },
    ]);
  };

  const openVoiceSheet = (target?: VoiceTarget) => {
    if (submittingRef.current || !draft) {
      return;
    }

    Keyboard.dismiss();
    setVoiceSheet({ visible: true, target });
  };

  const handleApplyScopedValue = (
    target: VoiceTarget,
    value: string,
    transcript: string
  ) => {
    if (submittingRef.current || target.kind !== 'field') {
      return;
    }

    const field = target.field;
    setDraft((current) => (current ? { ...current, [field]: value } : current));
    setErrors((current) => ({ ...current, [field]: undefined }));
    appendVoiceTranscript(target.label, transcript);
    invalidateValidation();
  };

  const handleApplyVoiceChanges = (
    changes: VoiceChange[],
    transcript: string,
    targetLabel?: string
  ) => {
    if (submittingRef.current || changes.length === 0) {
      return;
    }

    setDraft((current) =>
      current ? applyVoiceChanges(current, changes) : current
    );
    setErrors((current) => {
      const next = { ...current };

      for (const change of changes) {
        if (change.kind === 'field' && change.field) {
          next[change.field] = undefined;
        }
      }

      if (changes.some((change) => change.kind !== 'field')) {
        next.items = undefined;
        next.itemErrors = undefined;
      }

      return next;
    });
    appendVoiceTranscript(targetLabel ?? 'Voice corrections', transcript);
    invalidateValidation();
  };

  const fieldVoiceProps = (field: EditableField, label: string) => ({
    onVoicePress: () =>
      openVoiceSheet({ kind: 'field' as const, field, label, reason: '' }),
    voiceState: voiceAvailable ? ('idle' as const) : ('disabled' as const),
  });

  useEffect(() => {
    if (stage !== 'review' || !draft) {
      return;
    }

    if (!isDraftReadyForValidation(draft)) {
      return;
    }

    let cancelled = false;
    const runId = validationRunRef.current + 1;
    validationRunRef.current = runId;
    const timer = setTimeout(() => {
      setValidationStatus('checking');
      setValidationError(null);
      setSubmitError(null);
      setServerIssues([]);

      void validateDeliveryNote(draft, rawLines.join('\n'))
        .then((result) => {
          if (cancelled || runId !== validationRunRef.current) {
            return;
          }

          setValidationResult(result);
          setValidationStatus(result.valid ? 'valid' : 'invalid');
        })
        .catch((error) => {
          if (cancelled || runId !== validationRunRef.current) {
            return;
          }

          setValidationResult(null);
          setValidationStatus('error');
          setValidationError(
            error instanceof ApiError
              ? error.message
              : 'Could not validate the delivery note. Check the connection and try again.'
          );
        });
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft, rawLines, stage, validationAttempt]);

  const handleConfirm = async () => {
    if (!draft || submittingRef.current) {
      return;
    }

    const nextErrors: FormErrors = {};
    const normalizedDate = normalizeDeliveryDate(draft.deliveryDate);

    if (!draft.poNumber.trim()) {
      nextErrors.poNumber = 'Enter the purchase order number.';
    }

    if (!draft.noteNumber.trim()) {
      nextErrors.noteNumber = 'Enter the delivery note number.';
    }

    if (!draft.supplier.trim()) {
      nextErrors.supplier = 'Enter the supplier name.';
    }

    if (!draft.deliveryDate.trim()) {
      nextErrors.deliveryDate = 'Enter the delivery date.';
    } else if (!normalizedDate) {
      nextErrors.deliveryDate =
        'Enter a valid date, for example 30/10/2026 or 2026-10-30.';
    }

    if (!draft.site.trim()) {
      nextErrors.site = 'Enter the delivery site.';
    }

    const hasIncompleteItem = draft.items.some(
      (item) =>
        !item.description.trim() || parsePositiveQuantity(item.quantity) === null
    );

    if (draft.items.length === 0) {
      nextErrors.items = 'Add at least one delivered item.';
    } else if (hasIncompleteItem) {
      nextErrors.items =
        'Give every item a description and a positive quantity with up to three decimals.';
    }

    const itemErrors: Record<string, string> = {};

    for (const item of draft.items) {
      if (!item.received) {
        continue;
      }

      const quantity = parsePositiveQuantity(item.quantity);
      const damagedQuantity = parseNonNegativeQuantity(item.damagedQuantity);

      if (damagedQuantity === null) {
        itemErrors[item.id] =
          'Enter 0 or more damaged units with up to three decimals.';
      } else if (quantity !== null && damagedQuantity > quantity) {
        itemErrors[item.id] = 'Damaged units cannot be more than the note quantity.';
      }
    }

    if (Object.keys(itemErrors).length > 0) {
      nextErrors.itemErrors = itemErrors;
    }

    if (!confirmed) {
      nextErrors.confirmation =
        'Tick the confirmation box to confirm these details.';
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    if (!normalizedDate) {
      return;
    }

    if (!workerIdentifier) {
      setSubmitError('Your worker identity is missing. Sign in again and retry.');
      return;
    }

    if (validationStatus !== 'valid' || !validationResult?.valid) {
      setSubmitError(
        'Check the delivery against the purchase order before confirming.'
      );
      return;
    }

    const matchedItems = attachPurchaseOrderItemIds(
      draft.items,
      validationResult.order?.items ?? []
    );

    if (matchedItems.some((item) => !item.poItemId)) {
      setErrors((current) => ({
        ...current,
        items:
          'One or more items could not be matched to a purchase order line. Check the descriptions and retry.',
      }));
      return;
    }

    Keyboard.dismiss();

    const cleanedDetails: DeliveryNoteDetails = {
      ...draft,
      poNumber: draft.poNumber.trim(),
      noteNumber: draft.noteNumber.trim(),
      supplier: draft.supplier.trim(),
      deliveryDate: normalizedDate,
      site: draft.site.trim(),
      items: matchedItems.map((item) => ({
        ...item,
        description: item.description.trim(),
        quantity: item.quantity.trim(),
      })),
    };

    const voiceTranscript = voiceTranscripts
      .map((entry) => `[${entry.target}] ${entry.text}`)
      .join('\n');

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setServerIssues([]);

    try {
      const requestId = clientRequestId ?? createClientRequestId();

      if (!clientRequestId) {
        setClientRequestId(requestId);
      }

      const response = await createDelivery({
        details: cleanedDetails,
        worker: {
          name: workerLabel,
          identifier: workerIdentifier,
        },
        clientRequestId: requestId,
        rawOcrText: rawLines.join('\n'),
        voiceTranscript: voiceTranscript || undefined,
      });

      const recordedAt = new Date(response.recordedAt);

      validationRunRef.current += 1;
      setDraft(cleanedDetails);
      setRecordedSummary(response);
      setConfirmedSummary({
        details: cleanedDetails,
        confirmedAt: formatConfirmedAt(
          Number.isNaN(recordedAt.getTime()) ? new Date() : recordedAt
        ),
      });
      setStage('success');
    } catch (error) {
      if (error instanceof ApiError) {
        setSubmitError(error.message);
        setServerIssues(error.issues);

        if (error.status === 409 || error.status === 422) {
          setValidationStatus('invalid');
        }
      } else {
        setSubmitError(
          'Could not record the delivery. Check the connection and try again.'
        );
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleToggleConfirmed = () => {
    if (submittingRef.current) {
      return;
    }

    setConfirmed((current) => !current);
    setErrors((current) =>
      current.confirmation ? { ...current, confirmation: undefined } : current
    );
  };

  const renderHeader = () => (
    <AppHeader
      title="Delivery note"
      subtitle="Review and confirm"
      onBack={handleClose}
    />
  );

  const renderReview = () => {
    if (!draft) {
      return null;
    }

    const displayIssues =
      serverIssues.length > 0 ? serverIssues : (validationResult?.issues ?? []);
    const blockingIssues = displayIssues.filter((issue) => issue.severity === 'error');
    const warningIssues = displayIssues.filter((issue) => issue.severity === 'warning');
    const itemErrorCount = Object.keys(errors.itemErrors ?? {}).length;
    const canConfirm =
      validationStatus === 'valid' && !submitting && itemErrorCount === 0;
    const voiceTargets = getVoiceTargets(draft, validationResult);
    const issueCount = blockingIssues.length;

    const statusText = submitError
      ? 'Delivery not recorded'
      : validationStatus === 'checking'
        ? `Checking against ${draft.poNumber.trim() || 'the purchase order'}…`
        : validationStatus === 'valid'
          ? 'Matches the purchase order'
          : validationStatus === 'invalid'
            ? issueCount > 0
              ? `${issueCount} ${issueCount === 1 ? 'issue needs' : 'issues need'} attention`
              : 'This delivery cannot be confirmed yet'
            : validationStatus === 'error'
              ? "We can't reach the site server"
              : 'Complete the details to check this note';

    const statusIcon =
      validationStatus === 'valid' && !submitError
        ? 'checkmark-circle'
        : validationStatus === 'checking'
          ? 'sync-outline'
          : 'alert-circle';

    const disabledReason = submitting
      ? 'Recording the delivery…'
      : submitError
        ? submitError
        : validationStatus === 'checking'
          ? 'Wait for the check to finish.'
          : validationStatus === 'idle'
            ? itemErrorCount > 0
              ? 'Fix the highlighted damaged quantities.'
              : 'Complete every required detail and item quantity.'
            : validationStatus === 'invalid'
              ? 'Fix the highlighted issues above.'
              : validationStatus === 'error'
                ? 'Check your connection and try again.'
                : !confirmed
                  ? 'Tick the confirmation box above.'
                  : 'Confirm is unavailable right now.';

    return (
      <View style={styles.reviewWrap}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.reviewScroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.sourceCard}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.sourceImage} resizeMode="cover" />
          ) : null}

          <View style={styles.sourceCopy}>
            <Text style={styles.sourceTitle}>Delivery note scanned</Text>
            <Text style={styles.sourceMeta}>
              {rawLines.length} {rawLines.length === 1 ? 'line' : 'lines'} read ·
              check every field
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retake delivery note photo"
            onPress={resetToCapture}
            hitSlop={8}
            style={({ pressed }) => [styles.retakeButton, pressed && styles.pressed]}
          >
            <Ionicons name="camera-outline" size={14} color={colors.forest} />
            <Text style={styles.retakeText}>Retake</Text>
          </Pressable>
        </View>

        {ocrNotice ? (
          <Notice tone="warning" icon="information-circle-outline" style={styles.topNotice}>
            {ocrNotice}
          </Notice>
        ) : null}

        {submitError ? (
          <Notice tone="danger" title="Delivery not recorded" style={styles.topNotice}>
            {submitError}
          </Notice>
        ) : null}

        {validationStatus === 'error' && validationError ? (
          <Notice tone="danger" title="Could not check this delivery" style={styles.topNotice}>
            {validationError}
          </Notice>
        ) : null}

        {blockingIssues.length > 0 ? (
          <Notice
            tone="danger"
            title={`${blockingIssues.length} ${
              blockingIssues.length === 1 ? 'issue needs' : 'issues need'
            } attention`}
            style={styles.topNotice}
          >
            Fix the highlighted details before confirming.
          </Notice>
        ) : null}

        <VoiceFixCard
          targets={voiceTargets}
          supported={voiceSupported}
          configured={voiceConfigured}
          transcriptCount={voiceTranscripts.length}
          lastTranscript={voiceTranscripts[voiceTranscripts.length - 1]?.text}
          disabled={submitting}
          onSpeakTarget={openVoiceSheet}
          onSpeakCorrections={() => openVoiceSheet()}
        />

        <View style={styles.intro}>
          <Text style={styles.introTitle}>Check scanned details</Text>
          <Text style={styles.introBody}>
            Correct anything that does not match the paper note, then confirm the
            delivery.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Delivery details</Text>
          </View>

          <View style={styles.fieldStack}>
            <FormField
              label="PO number"
              icon="clipboard-outline"
              value={draft.poNumber}
              onChangeText={(value) => updateField('poNumber', value)}
              placeholder="e.g. PO-1042"
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="next"
              error={errors.poNumber}
              {...fieldVoiceProps('poNumber', 'PO number')}
            />

            <FormField
              label="Note number"
              icon="pricetag-outline"
              value={draft.noteNumber}
              onChangeText={(value) => updateField('noteNumber', value)}
              placeholder="e.g. DN-1042"
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="next"
              error={errors.noteNumber}
              {...fieldVoiceProps('noteNumber', 'Note number')}
            />

            <FormField
              label="Supplier"
              icon="business-outline"
              value={draft.supplier}
              onChangeText={(value) => updateField('supplier', value)}
              placeholder="Who sent the delivery?"
              autoCapitalize="words"
              returnKeyType="next"
              error={errors.supplier}
              {...fieldVoiceProps('supplier', 'Supplier')}
            />

            <FormField
              label="Delivery date"
              icon="calendar-outline"
              value={draft.deliveryDate}
              onChangeText={(value) => updateField('deliveryDate', value)}
              placeholder="e.g. 30/10/2026 or 2026-10-30"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              error={errors.deliveryDate}
              {...fieldVoiceProps('deliveryDate', 'Delivery date')}
            />

            <FormField
              label="Site / location"
              icon="location-outline"
              value={draft.site}
              onChangeText={(value) => updateField('site', value)}
              placeholder="Where was it delivered?"
              autoCapitalize="words"
              returnKeyType="done"
              error={errors.site}
              {...fieldVoiceProps('site', 'Site / location')}
            />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Delivered items</Text>

            <Text style={styles.cardCount}>
              {draft.items.length} {draft.items.length === 1 ? 'item' : 'items'}
            </Text>
          </View>

          <Text style={styles.cardHint}>
            All scanned lines are marked received. If something did not arrive,
            mark it as not delivered. Remove a line only if it is not on the paper
            note.
          </Text>

          <View style={styles.itemList}>
            {draft.items.map((item, index) => {
              const goodQuantity = getGoodQuantity(item);
              const damagedQuantity =
                parseNonNegativeQuantity(item.damagedQuantity) ?? 0;
              const quantityValue = parsePositiveQuantity(item.quantity);
              const immediateDamageError =
                item.received &&
                quantityValue !== null &&
                damagedQuantity > quantityValue
                  ? 'Damaged units cannot be more than the note quantity.'
                  : null;
              const itemError =
                errors.itemErrors?.[item.id] ?? immediateDamageError;

              return (
                <View
                  key={item.id}
                  style={[styles.itemRow, index > 0 && styles.itemRowDivider]}
                >
                  <View style={styles.itemTopRow}>
                    <View style={styles.itemTitleRow}>
                      <Text style={styles.itemNumber}>Item {index + 1}</Text>
                      {!item.received ? (
                        <View style={styles.missingPill}>
                          <Text style={styles.missingPillText}>Missing</Text>
                        </View>
                      ) : null}
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Dictate changes for item ${index + 1}`}
                      accessibilityState={{ disabled: !voiceAvailable }}
                      disabled={!voiceAvailable}
                      onPress={() =>
                        openVoiceSheet({
                          kind: 'item',
                          itemId: item.id,
                          label: item.description.trim() || `Item ${index + 1}`,
                          reason: '',
                        })
                      }
                      hitSlop={6}
                      style={({ pressed }) => [
                        styles.itemVoiceButton,
                        !voiceAvailable && styles.itemVoiceButtonDisabled,
                        pressed && voiceAvailable && styles.pressed,
                      ]}
                    >
                      <Ionicons
                        name={voiceAvailable ? 'mic-outline' : 'mic-off-outline'}
                        size={15}
                        color={voiceAvailable ? colors.forest : colors.inkFaint}
                      />
                    </Pressable>
                  </View>

                  <View style={styles.descriptionField}>
                    <Text style={styles.itemLabel}>Description</Text>
                    <TextInput
                      value={item.description}
                      onChangeText={(value) =>
                        updateItem(item.id, { description: value })
                      }
                      accessibilityLabel={`Item ${index + 1} description`}
                      placeholder="Item description"
                      placeholderTextColor={colors.inkFaint}
                      selectionColor={colors.forest}
                      autoCapitalize="sentences"
                      style={styles.itemInput}
                    />
                  </View>

                  <View style={styles.itemFieldsRow}>
                    <View style={styles.quantityField}>
                      <Text style={styles.itemLabel}>Qty</Text>
                      <TextInput
                        value={item.quantity}
                        onChangeText={(value) =>
                          updateItem(item.id, { quantity: value })
                        }
                        accessibilityLabel={`Item ${index + 1} quantity`}
                        placeholder="0"
                        placeholderTextColor={colors.inkFaint}
                        selectionColor={colors.forest}
                        keyboardType="numeric"
                        selectTextOnFocus
                        style={[styles.itemInput, styles.quantityInput]}
                      />
                    </View>

                    {item.received ? (
                      <View style={styles.damagedField}>
                        <Text style={styles.itemLabel}>Damaged</Text>
                        <TextInput
                          value={item.damagedQuantity}
                          onChangeText={(value) =>
                            updateItem(item.id, { damagedQuantity: value })
                          }
                          accessibilityLabel={`Item ${index + 1} damaged quantity`}
                          placeholder="0"
                          placeholderTextColor={colors.inkFaint}
                          selectionColor={colors.forest}
                          keyboardType="decimal-pad"
                          selectTextOnFocus
                          style={[styles.itemInput, styles.damagedInput]}
                        />
                      </View>
                    ) : null}
                  </View>

                  {item.received ? (
                    <View style={styles.goodRow}>
                      <Ionicons
                        name={
                          damagedQuantity > 0
                            ? 'warning-outline'
                            : 'checkmark-circle-outline'
                        }
                        size={14}
                        color={damagedQuantity > 0 ? colors.danger : colors.success}
                      />
                      <Text
                        style={[
                          styles.goodText,
                          damagedQuantity > 0 && styles.goodTextWarning,
                        ]}
                      >
                        Good: {goodQuantity ?? '—'}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.missingNote}>
                      <Ionicons
                        name="alert-circle-outline"
                        size={15}
                        color={colors.warning}
                      />
                      <Text style={styles.missingNoteText}>
                        Listed on the note but not delivered. The line is kept as
                        a shortage.
                      </Text>
                    </View>
                  )}

                  {itemError ? (
                    <View style={styles.inlineError}>
                      <Ionicons
                        name="alert-circle-outline"
                        size={15}
                        color={colors.danger}
                      />
                      <Text style={styles.inlineErrorText}>{itemError}</Text>
                    </View>
                  ) : null}

                  <View style={styles.itemFooterActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        item.received
                          ? `Mark item ${index + 1} as not delivered`
                          : `Mark item ${index + 1} as received`
                      }
                      onPress={() => {
                        const received = !item.received;

                        updateItem(item.id, {
                          received,
                          ...(received ? {} : { damagedQuantity: '0' }),
                        });
                      }}
                      hitSlop={6}
                      style={({ pressed }) => [
                        styles.itemActionButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons
                        name={
                          item.received
                            ? 'close-circle-outline'
                            : 'checkmark-circle-outline'
                        }
                        size={15}
                        color={colors.inkSoft}
                      />
                      <Text style={styles.itemActionText}>
                        {item.received ? 'Mark not delivered' : 'Mark received'}
                      </Text>
                    </Pressable>

                    {draft.items.length > 1 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove item ${index + 1}`}
                        onPress={() => handleRemoveItem(item.id)}
                        hitSlop={6}
                        style={({ pressed }) => [
                          styles.itemActionButton,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={14}
                          color={colors.danger}
                        />
                        <Text style={[styles.itemActionText, styles.removeText]}>
                          Remove
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add another item"
            onPress={handleAddItem}
            style={({ pressed }) => [styles.addItemButton, pressed && styles.pressed]}
          >
            <Ionicons name="add" size={16} color={colors.forest} />
            <Text style={styles.addItemText}>Add item</Text>
          </Pressable>

          {errors.items ? (
            <View style={styles.inlineError}>
              <Ionicons name="alert-circle-outline" size={15} color={colors.danger} />
              <Text style={styles.inlineErrorText}>{errors.items}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.rawCard}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showRawText ? 'Hide scanned text' : 'Show scanned text'}
            onPress={() => setShowRawText((current) => !current)}
            style={({ pressed }) => [styles.rawToggle, pressed && styles.pressed]}
          >
            <View style={styles.rawTitleRow}>
              <Ionicons name="code-slash-outline" size={16} color={colors.forest} />
              <Text style={styles.rawTitle}>Scanned text</Text>
            </View>

            <View style={styles.rawAction}>
              <Text style={styles.rawCount}>{rawLines.length} lines</Text>
              <Ionicons
                name={showRawText ? 'chevron-up' : 'chevron-down'}
                size={15}
                color={colors.inkFaint}
              />
            </View>
          </Pressable>

          {showRawText ? (
            <View style={styles.rawTextWrap}>
              {rawLines.length > 0 ? (
                <Text selectable style={styles.rawText}>
                  {rawLines.join('\n')}
                </Text>
              ) : (
                <Text style={styles.rawEmpty}>No text was detected in this scan.</Text>
              )}
            </View>
          ) : null}
        </View>

        <View style={styles.confirmCard}>
          <View
            style={[
              styles.validationPanel,
              validationStatus === 'valid' && styles.validationPanelValid,
              validationStatus === 'checking' && styles.validationPanelChecking,
              validationStatus === 'invalid' && styles.validationPanelInvalid,
              validationStatus === 'error' && styles.validationPanelInvalid,
              submitError ? styles.validationPanelInvalid : null,
            ]}
          >
            {validationStatus === 'checking' ? (
              <View style={styles.validationCheckRow}>
                <ActivityIndicator size="small" color={colors.forest} />
                <Text style={styles.validationTitle}>
                  Checking against {draft.poNumber.trim() || 'the purchase order'}…
                </Text>
              </View>
            ) : null}

            {validationStatus === 'valid' && !submitError ? (
              <View style={styles.validationCheckRow}>
                <Ionicons name="checkmark-circle" size={17} color={colors.forest} />
                <Text style={styles.validationTitle}>
                  Matches the purchase order
                </Text>
              </View>
            ) : null}

            {validationStatus === 'invalid' &&
            blockingIssues.length === 0 &&
            !submitError ? (
              <Text style={styles.validationTitle}>
                This delivery cannot be confirmed yet.
              </Text>
            ) : null}

            {validationStatus === 'idle' ? (
              <Text style={styles.validationBody}>
                {draft.deliveryDate.trim() &&
                !normalizeDeliveryDate(draft.deliveryDate)
                  ? 'Use a valid delivery date, for example 30/10/2026 or 2026-10-30.'
                  : 'Complete every required delivery detail and item quantity to check this note against the purchase order.'}
              </Text>
            ) : null}

            {validationStatus === 'error' ? (
              <>
                <Text style={styles.validationTitle}>
                  Could not check this delivery
                </Text>
                <Text style={styles.validationBody}>{validationError}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retry delivery validation"
                  onPress={() => setValidationAttempt((current) => current + 1)}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.validationRetry,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons name="refresh-outline" size={13} color={colors.forest} />
                  <Text style={styles.validationRetryText}>Try again</Text>
                </Pressable>
              </>
            ) : null}

            {blockingIssues.length > 0 ? (
              <View style={styles.issueList}>
                {blockingIssues.map((issue, index) => {
                  const detail = issueDetail(issue);

                  return (
                    <View
                      key={`${issue.code}-${issue.field ?? 'general'}-${index}`}
                      style={styles.issueRow}
                    >
                      <Ionicons
                        name="alert-circle"
                        size={14}
                        color={issueColor(issue)}
                      />
                      <View style={styles.issueCopy}>
                        <Text style={[styles.issueText, { color: issueColor(issue) }]}>
                          {issue.message}
                        </Text>
                        {detail ? (
                          <Text style={styles.issueDetail}>{detail}</Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {warningIssues.length > 0 ? (
              <View style={styles.issueList}>
                {warningIssues.map((issue, index) => {
                  const detail = issueDetail(issue);

                  return (
                    <View
                      key={`${issue.code}-${issue.field ?? 'general'}-${index}`}
                      style={styles.issueRow}
                    >
                      <Ionicons
                        name="information-circle"
                        size={14}
                        color={issueColor(issue)}
                      />
                      <View style={styles.issueCopy}>
                        <Text style={[styles.issueText, { color: issueColor(issue) }]}>
                          {issue.message}
                        </Text>
                        {detail ? (
                          <Text style={styles.issueDetail}>{detail}</Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {submitError ? (
              <Text style={styles.validationSubmitError}>{submitError}</Text>
            ) : null}
          </View>

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: confirmed }}
            aria-checked={confirmed}
            accessibilityLabel="I have checked these details and confirm they match the paper delivery note"
            onPress={handleToggleConfirmed}
            style={({ pressed }) => [
              styles.confirmRow,
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.checkbox, confirmed && styles.checkboxChecked]}>
              {confirmed ? (
                <Ionicons name="checkmark" size={14} color={colors.white} />
              ) : null}
            </View>

            <View style={styles.confirmCopy}>
              <Text style={styles.confirmTitle}>I&apos;ve checked these details</Text>
              <Text style={styles.confirmBody}>
                They match the paper delivery note, including quantities and
                item condition.
              </Text>
            </View>
          </Pressable>

          {errors.confirmation ? (
            <View style={styles.inlineError}>
              <Ionicons name="alert-circle-outline" size={15} color={colors.danger} />
              <Text style={styles.inlineErrorText}>{errors.confirmation}</Text>
            </View>
          ) : null}

          {errors.poNumber ||
          errors.noteNumber ||
          errors.supplier ||
          errors.deliveryDate ||
          errors.site ? (
            <View style={styles.inlineError}>
              <Ionicons name="alert-circle-outline" size={15} color={colors.danger} />
              <Text style={styles.inlineErrorText}>
                Check the highlighted delivery details above.
              </Text>
            </View>
          ) : null}

          <View style={styles.privacyRow}>
            <Ionicons name="shield-checkmark-outline" size={13} color={colors.inkFaint} />
            <Text style={styles.privacyText}>
              OCR runs on this device and the photo is never uploaded. Voice
              recordings are sent for transcription and are not kept by Crewline.
            </Text>
          </View>
        </View>

        <Text style={styles.reviewFootnote}>
          The delivery is validated against its purchase order before it is
          recorded. The paper note remains the record of delivery.
        </Text>
        </ScrollView>

        <View style={styles.actionBar}>
          <View style={styles.actionStatusRow}>
            {validationStatus === 'checking' && !submitError ? (
              <ActivityIndicator size="small" color={colors.info} />
            ) : (
              <Ionicons
                name={statusIcon}
                size={16}
                color={
                  validationStatus === 'valid' && !submitError
                    ? colors.success
                    : validationStatus === 'idle'
                      ? colors.inkSoft
                      : colors.danger
                }
              />
            )}
            <Text
              style={[
                styles.actionStatusText,
                validationStatus === 'valid' && !submitError && styles.actionStatusSuccess,
                (submitError || validationStatus === 'invalid' || validationStatus === 'error') &&
                  styles.actionStatusDanger,
              ]}
            >
              {statusText}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Confirm delivery note"
            accessibilityState={{ disabled: !canConfirm, busy: submitting }}
            disabled={!canConfirm}
            onPress={() => void handleConfirm()}
            style={({ pressed }) => [
              styles.confirmButton,
              !canConfirm && styles.confirmButtonDisabled,
              pressed && canConfirm && styles.pressed,
            ]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={colors.inkSoft} />
            ) : (
              <Ionicons
                name="checkmark-circle-outline"
                size={18}
                color={canConfirm ? colors.white : colors.inkSoft}
              />
            )}
            <Text
              style={[
                styles.confirmButtonText,
                !canConfirm && styles.confirmButtonTextDisabled,
              ]}
            >
              {submitting ? 'Recording delivery…' : 'Confirm delivery'}
            </Text>
          </Pressable>

          {!canConfirm ? (
            <Text numberOfLines={2} style={styles.actionReason}>
              {disabledReason}
            </Text>
          ) : null}
        </View>
      </View>
    );
  };

  const renderSuccess = () => {
    if (!confirmedSummary) {
      return null;
    }

    const { details } = confirmedSummary;
    const receivedCount = details.items.filter((item) => item.received).length;
    const damagedTotal = roundQuantity(
      details.items.reduce(
        (total, item) =>
          total + (parseNonNegativeQuantity(item.damagedQuantity) ?? 0),
        0
      )
    );

    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.successScroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.successHero}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={26} color={colors.white} />
          </View>
          <Text style={styles.successTitle}>
            {recordedSummary?.idempotentReplay
              ? 'Already recorded'
              : 'Delivery recorded'}
          </Text>
          <Text style={styles.successBody}>
            {recordedSummary?.idempotentReplay
              ? 'This confirmation was already saved. No duplicate delivery was created.'
              : 'The note has been checked and recorded against its purchase order.'}
          </Text>
          <Text style={styles.successTime}>{confirmedSummary.confirmedAt}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Summary</Text>
          </View>

          <View style={styles.summaryRows}>
            <SummaryRow label="PO number" value={details.poNumber} />
            <SummaryRow label="Note number" value={details.noteNumber} />
            <SummaryRow label="Supplier" value={details.supplier} />
            <SummaryRow label="Delivery date" value={details.deliveryDate} />
            <SummaryRow label="Site" value={details.site} />
            <SummaryRow
              label="PO status"
              value={
                recordedSummary
                  ? formatOrderStatus(recordedSummary.orderStatus)
                  : '—'
              }
            />
            {damagedTotal > 0 ? (
              <SummaryRow
                label="Damaged units"
                value={String(damagedTotal)}
              />
            ) : null}
            <SummaryRow
              label="Items"
              value={`${receivedCount} of ${details.items.length} received`}
              isLast
            />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Items</Text>
            <Text style={styles.cardCount}>{details.items.length}</Text>
          </View>

          <View style={styles.successItemList}>
            {details.items.map((item, index) => {
              const damagedQuantity =
                parseNonNegativeQuantity(item.damagedQuantity) ?? 0;
              const goodQuantity = getGoodQuantity(item);
              const hasDamage = item.received && damagedQuantity > 0;
              const statusText = !item.received
                ? 'Missing'
                : hasDamage
                  ? goodQuantity === 0
                    ? 'All damaged'
                    : `${damagedQuantity} damaged`
                  : 'Received';

              return (
                <View key={item.id} style={styles.successItemRow}>
                  <View style={styles.successItemIndex}>
                    <Text style={styles.successItemIndexText}>{index + 1}</Text>
                  </View>

                  <View style={styles.successItemCopy}>
                    <Text style={styles.successItemTitle}>{item.description}</Text>
                    <Text style={styles.successItemMeta}>
                      Qty {item.quantity}
                      {item.received && goodQuantity !== null
                        ? ` · ${goodQuantity} good`
                        : ''}
                      {hasDamage ? ` · ${damagedQuantity} damaged` : ''}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.itemStatus,
                      !item.received && styles.itemStatusMissing,
                      hasDamage && styles.itemStatusDamaged,
                    ]}
                  >
                    <Text
                      style={[
                        styles.itemStatusText,
                        !item.received && styles.itemStatusTextMissing,
                        hasDamage && styles.itemStatusTextDamaged,
                      ]}
                    >
                      {statusText}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.confirmedByCard}>
          <View style={styles.confirmedByCopy}>
            <Text style={styles.confirmedByLabel}>Recorded by</Text>
            <Text style={styles.confirmedByValue}>{workerLabel}</Text>
            {workerIdentifier ? (
              <Text numberOfLines={1} style={styles.confirmedByIdentifier}>
                {workerIdentifier}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.successActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan another delivery note"
            onPress={resetToCapture}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="camera-outline" size={16} color={colors.forest} />
            <Text style={styles.secondaryButtonText}>Scan another</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to worker dashboard"
            onPress={handleClose}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryButtonText}>Done</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.white} />
          </Pressable>
        </View>

        <Text style={styles.reviewFootnote}>
          The delivery is recorded on the server. Keep the paper note on file in
          case the office needs to check it.
        </Text>
      </ScrollView>
    );
  };

  const renderBody = () => {
    if (stage === 'capture') {
      return (
        <DocumentCamera
          onExtracted={handleExtracted}
          onCancel={handleClose}
          instruction="Fit the whole delivery note in the frame"
          readingLabel="Reading the delivery note…"
        />
      );
    }

    if (stage === 'success') {
      return renderSuccess();
    }

    return renderReview();
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={styles.content}>
          {renderHeader()}
          {renderBody()}
        </View>

        {draft && voiceSheet.visible ? (
          <VoiceCorrectionSheet
            key={
              voiceSheet.target?.kind === 'field'
                ? `field:${voiceSheet.target.field}`
                : voiceSheet.target?.kind === 'item'
                  ? `item:${voiceSheet.target.itemId}`
                  : 'freeform'
            }
            visible
            target={voiceSheet.target}
            draft={draft}
            orderItems={validationResult?.order?.items ?? []}
            keyterms={voiceKeyterms}
            supported={voiceSupported}
            configured={voiceConfigured}
            onClose={() => setVoiceSheet({ visible: false })}
            onApplyScopedValue={handleApplyScopedValue}
            onApplyChanges={handleApplyVoiceChanges}
          />
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 0,
  },
  reviewWrap: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  reviewScroll: {
    paddingBottom: 24,
  },
  successScroll: {
    paddingBottom: 30,
  },
  topNotice: {
    marginTop: 10,
  },
  actionBar: {
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.background,
    gap: 7,
  },
  actionStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  actionStatusText: {
    flex: 1,
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: '600',
  },
  actionStatusSuccess: {
    color: colors.success,
  },
  actionStatusDanger: {
    color: colors.danger,
  },
  actionReason: {
    color: colors.inkSoft,
    fontSize: 11,
    lineHeight: 15,
  },
  sourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 11,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
  },
  sourceImage: {
    width: 52,
    height: 52,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 11,
  },
  sourceCopy: {
    flex: 1,
  },
  sourceTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  sourceMeta: {
    marginTop: 3,
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: '500',
  },
  retakeButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  retakeText: {
    color: colors.forest,
    fontSize: 12,
    fontWeight: '700',
  },
  notice: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    backgroundColor: colors.accentSoft,
    borderRadius: radii.sm,
  },
  noticeText: {
    flex: 1,
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  intro: {
    marginTop: 20,
  },
  introTitle: {
    color: colors.ink,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  introBody: {
    marginTop: 6,
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  card: {
    marginTop: 14,
    padding: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  cardCount: {
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: '600',
  },
  cardHint: {
    marginTop: 8,
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  fieldStack: {
    marginTop: 16,
    gap: 16,
  },
  itemList: {
    marginTop: 12,
  },
  itemRow: {
    paddingVertical: 13,
  },
  itemRowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemVoiceButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
  },
  itemVoiceButtonDisabled: {
    opacity: 0.5,
  },
  itemNumber: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: '600',
  },
  missingPill: {
    minHeight: 22,
    justifyContent: 'center',
    paddingHorizontal: 8,
    backgroundColor: colors.warningSoft,
    borderRadius: radii.pill,
  },
  missingPillText: {
    color: colors.warning,
    fontSize: 11,
    fontWeight: '600',
  },
  itemFieldsRow: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
  },
  descriptionField: {
    width: '100%',
    marginTop: 8,
  },
  quantityField: {
    flex: 1,
  },
  damagedField: {
    flex: 1,
  },
  itemLabel: {
    marginBottom: 5,
    color: colors.inkSoft,
    fontSize: 11,
    fontWeight: '600',
  },
  itemInput: {
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
  },
  quantityInput: {
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  damagedInput: {
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  goodRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  goodText: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: '600',
  },
  goodTextWarning: {
    color: colors.danger,
  },
  missingNote: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    padding: 10,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
  },
  missingNoteText: {
    flex: 1,
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  itemFooterActions: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  itemActionButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
  },
  itemActionText: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: '500',
  },
  removeText: {
    color: colors.danger,
  },
  addItemButton: {
    minHeight: 46,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderStyle: 'dashed',
    borderRadius: radii.sm,
  },
  addItemText: {
    color: colors.forest,
    fontSize: 13,
    fontWeight: '700',
  },
  inlineError: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    padding: 10,
    backgroundColor: colors.dangerSoft,
    borderRadius: 9,
  },
  inlineErrorText: {
    flex: 1,
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
  rawCard: {
    marginTop: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  rawToggle: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  rawTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rawTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  rawAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  rawCount: {
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: '600',
  },
  rawTextWrap: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    padding: 14,
    backgroundColor: colors.surfaceMuted,
  },
  rawText: {
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
  rawEmpty: {
    color: colors.inkFaint,
    fontSize: 13,
    fontStyle: 'italic',
  },
  confirmCard: {
    marginTop: 14,
    padding: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
  },
  validationPanel: {
    marginBottom: 14,
    padding: 12,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.sm,
    gap: 7,
  },
  validationPanelValid: {
    backgroundColor: colors.successSoft,
    borderColor: colors.successSoft,
  },
  validationPanelChecking: {
    backgroundColor: colors.infoSoft,
    borderColor: colors.infoSoft,
  },
  validationPanelInvalid: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerSoft,
  },
  validationCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  validationTitle: {
    flexShrink: 1,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  validationBody: {
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  issueList: {
    marginTop: 2,
    gap: 6,
  },
  issueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  issueCopy: {
    flex: 1,
    gap: 2,
  },
  issueText: {
    fontSize: 13,
    lineHeight: 19,
  },
  issueDetail: {
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  validationSubmitError: {
    marginTop: 4,
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  validationRetry: {
    alignSelf: 'flex-start',
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  validationRetryText: {
    color: colors.forest,
    fontSize: 12,
    fontWeight: '700',
  },
  confirmRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
  },
  checkbox: {
    width: 24,
    height: 24,
    marginTop: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: 7,
  },
  checkboxChecked: {
    backgroundColor: colors.forest,
    borderColor: colors.forest,
  },
  confirmCopy: {
    flex: 1,
  },
  confirmTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  confirmBody: {
    marginTop: 4,
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  confirmButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.forest,
    borderRadius: radii.md,
  },
  confirmButtonDisabled: {
    backgroundColor: colors.sage,
  },
  confirmButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  confirmButtonTextDisabled: {
    color: colors.inkSoft,
  },
  privacyRow: {
    marginTop: 11,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 5,
  },
  privacyText: {
    flex: 1,
    color: colors.inkFaint,
    fontSize: 11,
    lineHeight: 16,
  },
  reviewFootnote: {
    marginTop: 16,
    alignSelf: 'center',
    maxWidth: 320,
    color: colors.inkFaint,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  successHero: {
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 8,
  },
  successIcon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.forest,
    borderRadius: radii.pill,
  },
  successTitle: {
    marginTop: 16,
    color: colors.ink,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  successBody: {
    maxWidth: 300,
    marginTop: 7,
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  successTime: {
    marginTop: 10,
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: '600',
  },
  summaryRows: {
    marginTop: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 18,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  summaryRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 2,
  },
  summaryLabel: {
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: '600',
  },
  summaryValue: {
    flex: 1,
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  successItemList: {
    marginTop: 12,
    gap: 8,
  },
  successItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
  },
  successItemIndex: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: 8,
  },
  successItemIndexText: {
    color: colors.forest,
    fontSize: 12,
    fontWeight: '700',
  },
  successItemCopy: {
    flex: 1,
  },
  successItemTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  successItemMeta: {
    marginTop: 2,
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: '600',
  },
  itemStatus: {
    maxWidth: 96,
    paddingVertical: 4,
    paddingHorizontal: 7,
    backgroundColor: colors.successSoft,
    borderRadius: radii.pill,
  },
  itemStatusMissing: {
    backgroundColor: colors.warningSoft,
  },
  itemStatusDamaged: {
    backgroundColor: colors.dangerSoft,
  },
  itemStatusText: {
    color: colors.success,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  itemStatusTextMissing: {
    color: colors.warning,
  },
  itemStatusTextDamaged: {
    color: colors.danger,
  },
  confirmedByCard: {
    marginTop: 14,
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
  },
  confirmedByCopy: {
    flex: 1,
  },
  confirmedByLabel: {
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: '500',
  },
  confirmedByValue: {
    marginTop: 2,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  confirmedByIdentifier: {
    marginTop: 1,
    color: colors.inkFaint,
    fontSize: 11,
  },
  successActions: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.sm,
  },
  secondaryButtonText: {
    color: colors.forest,
    fontSize: 12.5,
    fontWeight: '700',
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 18,
    backgroundColor: colors.forest,
    borderRadius: radii.sm,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 12.5,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
});
