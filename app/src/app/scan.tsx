import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { DocumentCamera } from '@/components/DocumentCamera';
import { AppHeader, Notice, Pill, Screen } from '@/components/ui';
import { getOcrAvailability, recognizeText } from '@/lib/ocr';
import { colors, radii } from '@/theme';

type CapturedDocument = {
  uri: string;
};

type OcrState = 'idle' | 'running' | 'done' | 'error';

export default function ScanDocumentScreen() {
  const router = useRouter();
  const [photo, setPhoto] = useState<CapturedDocument | null>(null);
  const [ocrState, setOcrState] = useState<OcrState>('idle');
  const [textLines, setTextLines] = useState<string[]>([]);
  const [ocrError, setOcrError] = useState<string | null>(null);

  const combinedText = textLines.join('\n');

  const handleExtracted = ({ uri, lines }: { uri: string; lines: string[] }) => {
    setPhoto({ uri });
    setTextLines(lines);
    setOcrError(null);
    setOcrState('done');
  };

  const handleRetry = async () => {
    if (!photo) {
      return;
    }

    setOcrState('running');
    setOcrError(null);

    try {
      const availability = await getOcrAvailability();

      if (availability !== 'ready') {
        setOcrState('error');
        setOcrError(
          availability === 'unsupported'
            ? "This device can't read text from photos."
            : "Text recognition isn't available in this version of the app. Try again on a supported Android or iOS device."
        );
        return;
      }

      const lines = await recognizeText(photo.uri);
      setTextLines(lines);
      setOcrState('done');
    } catch (error) {
      setOcrState('error');
      setOcrError(
        error instanceof Error ? error.message : 'Text recognition failed. Please try again.'
      );
    }
  };

  const handleRetake = () => {
    setPhoto(null);
    setTextLines([]);
    setOcrError(null);
    setOcrState('idle');
  };

  const handleShare = async () => {
    if (!combinedText) {
      return;
    }

    try {
      await Share.share({ title: 'Scanned document', message: combinedText });
    } catch {
      // The share sheet can be dismissed without an error.
    }
  };

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/worker-dashboard');
  };

  const renderStatusChip = () => {
    if (ocrState === 'running') {
      return (
        <Pill
          label="Reading"
          tone="accent"
          leading={
            <ActivityIndicator
              size="small"
              color={colors.ink}
              style={styles.statusSpinner}
            />
          }
        />
      );
    }

    if (ocrState === 'error') {
      return <Pill label="Failed" tone="danger" />;
    }

    if (ocrState === 'done') {
      return <Pill label="Ready" tone="success" />;
    }

    return <Pill label="Waiting" tone="neutral" />;
  };

  const renderBody = () => {
    if (photo) {
      return (
        <ScrollView
          contentContainerStyle={styles.resultScroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.previewWrap}>
            <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="cover" />
            <View style={styles.previewBadge}>
              <Ionicons name="document-text-outline" size={12} color={colors.forest} />
              <Text style={styles.previewBadgeText}>1 page</Text>
            </View>
          </View>

          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultLabel}>Extracted text</Text>
              {renderStatusChip()}
            </View>

            {ocrState === 'running' ? (
              <View style={styles.resultLoading}>
                <ActivityIndicator color={colors.forest} />
                <Text style={styles.resultLoadingText}>Reading the page…</Text>
              </View>
            ) : null}

            {ocrState === 'error' ? (
              <View style={styles.resultError}>
                <Notice
                  tone="danger"
                  icon="alert-circle-outline"
                  title="Couldn't read this page"
                >
                  {ocrError ?? 'Try again with more light and less glare.'}
                </Notice>
              </View>
            ) : null}

            {ocrState === 'done' && textLines.length === 0 ? (
              <View style={styles.resultEmpty}>
                <Text style={styles.resultEmptyTitle}>No text detected</Text>
                <Text style={styles.resultEmptyBody}>
                  Try again with more light, less glare, and the page filling the frame.
                </Text>
              </View>
            ) : null}

            {ocrState === 'done' && textLines.length > 0 ? (
              <>
                <Text selectable style={styles.resultText}>
                  {combinedText}
                </Text>
                <View style={styles.resultMeta}>
                  <Text style={styles.resultMetaText}>
                    {textLines.length} {textLines.length === 1 ? 'line' : 'lines'}
                  </Text>
                  <View style={styles.metaDot} />
                  <Text style={styles.resultMetaText}>{combinedText.length} characters</Text>
                </View>
              </>
            ) : null}
          </View>

          <View style={styles.actionsRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Scan another document"
              onPress={handleRetake}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            >
              <Ionicons name="camera-outline" size={16} color={colors.forest} />
              <Text style={styles.secondaryButtonText}>Scan again</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share extracted text"
              accessibilityState={{ disabled: !combinedText }}
              disabled={!combinedText}
              onPress={() => void handleShare()}
              style={({ pressed }) => [
                styles.primaryButton,
                styles.shareButton,
                !combinedText && styles.buttonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="share-outline" size={16} color={colors.white} />
              <Text style={styles.primaryButtonText}>Share text</Text>
            </Pressable>
          </View>

          {ocrState === 'error' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry text recognition"
              onPress={() => void handleRetry()}
              style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            >
              <Ionicons name="refresh-outline" size={15} color={colors.inkSoft} />
              <Text style={styles.retryButtonText}>Retry text recognition</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      );
    }

    return (
      <DocumentCamera
        onExtracted={handleExtracted}
        onCancel={handleClose}
        instruction="Fill the frame with the page"
        readingLabel="Reading the page…"
      />
    );
  };

  return (
    <Screen>
      <View style={styles.content}>
        <AppHeader
          title="Scan document"
          subtitle="Capture a page"
          onBack={handleClose}
        />

        {renderBody()}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingTop: 10,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  primaryButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    backgroundColor: colors.forest,
    borderRadius: radii.sm,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.sm,
  },
  secondaryButtonText: {
    color: colors.forest,
    fontSize: 13,
    fontWeight: '700',
  },
  shareButton: {
    flex: 1,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  resultScroll: {
    paddingBottom: 28,
  },
  previewWrap: {
    height: 190,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.lg,
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  previewBadge: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3,
    paddingHorizontal: 9,
    backgroundColor: colors.previewBadge,
    borderRadius: radii.pill,
  },
  previewBadgeText: {
    color: colors.forest,
    fontSize: 11,
    fontWeight: '700',
  },
  resultCard: {
    marginTop: 12,
    padding: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resultLabel: {
    color: colors.inkSoft,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  statusSpinner: {
    transform: [{ scale: 0.7 }],
  },
  resultLoading: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resultLoadingText: {
    color: colors.inkSoft,
    fontSize: 13,
    fontWeight: '600',
  },
  resultError: {
    marginTop: 12,
  },
  resultEmpty: {
    marginTop: 14,
    paddingVertical: 6,
  },
  resultEmptyTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  resultEmptyBody: {
    marginTop: 4,
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  resultText: {
    marginTop: 14,
    color: colors.ink,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
  resultMeta: {
    marginTop: 14,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  resultMetaText: {
    color: colors.inkFaint,
    fontSize: 11,
    fontWeight: '600',
  },
  metaDot: {
    width: 2,
    height: 2,
    backgroundColor: colors.lineStrong,
    borderRadius: radii.pill,
  },
  actionsRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
  },
  retryButton: {
    minHeight: 44,
    marginTop: 8,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  retryButtonText: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.85,
  },
});
