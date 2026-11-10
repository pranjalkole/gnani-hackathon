import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { VoiceTarget } from '@/lib/voiceFill';
import { colors, radii } from '@/theme';

type VoiceFixCardProps = {
  targets: VoiceTarget[];
  supported: boolean;
  configured: boolean;
  transcriptCount: number;
  lastTranscript?: string;
  disabled?: boolean;
  onSpeakTarget: (target: VoiceTarget) => void;
  onSpeakCorrections: () => void;
};

const MAX_VISIBLE_TARGETS = 5;

export function VoiceFixCard({
  targets,
  supported,
  configured,
  transcriptCount,
  lastTranscript,
  disabled = false,
  onSpeakTarget,
  onSpeakCorrections,
}: VoiceFixCardProps) {
  const [showTargets, setShowTargets] = useState(false);
  const voiceAvailable = supported && configured && !disabled;
  const hiddenTargetCount = Math.max(0, targets.length - MAX_VISIBLE_TARGETS);
  const visibleTargets = targets.slice(0, MAX_VISIBLE_TARGETS);
  const availabilityMessage = !supported
    ? 'Voice input is available in the mobile app.'
    : "Voice input isn't available right now. Type the correction instead.";

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Ionicons name="mic-outline" size={18} color={colors.forest} />
        <Text style={styles.title}>Fix by voice</Text>
      </View>

      <Text style={styles.body}>
        {supported && configured
          ? targets.length > 0
            ? `${targets.length} ${
                targets.length === 1 ? 'detail needs' : 'details need'
              } checking. Speak a correction, or open the list to fix one field at a time.`
            : 'Everything required is filled in. You can still speak a correction.'
          : availabilityMessage}
      </Text>

      {voiceAvailable ? (
        <>
          {visibleTargets.length > 0 ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  showTargets
                    ? 'Hide details to check'
                    : `Show ${targets.length} ${
                        targets.length === 1 ? 'detail' : 'details'
                      } to check`
                }
                accessibilityState={{ expanded: showTargets }}
                onPress={() => setShowTargets((current) => !current)}
                style={({ pressed }) => [
                  styles.targetToggle,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.targetToggleCopy}>
                  <Ionicons
                    name="list-outline"
                    size={15}
                    color={colors.forest}
                  />
                  <Text style={styles.targetToggleText}>
                    {showTargets ? 'Hide details' : 'Details to check'}
                  </Text>
                  <View style={styles.targetCount}>
                    <Text style={styles.targetCountText}>{targets.length}</Text>
                  </View>
                </View>
                <Ionicons
                  name={showTargets ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.inkFaint}
                />
              </Pressable>

              {showTargets ? (
                <View style={styles.targetList}>
                  {visibleTargets.map((target) => (
                    <View
                      key={
                        target.kind === 'field'
                          ? `field-${target.field}`
                          : `item-${target.itemId}`
                      }
                      style={styles.targetRow}
                    >
                      <View style={styles.targetCopy}>
                        <Text style={styles.targetLabel}>{target.label}</Text>
                        <Text numberOfLines={2} style={styles.targetReason}>
                          {target.reason}
                        </Text>
                      </View>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Speak ${target.label}`}
                        onPress={() => onSpeakTarget(target)}
                        hitSlop={6}
                        style={({ pressed }) => [
                          styles.speakButton,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Ionicons name="mic" size={13} color={colors.forest} />
                        <Text style={styles.speakButtonText}>Speak</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}

              {showTargets && hiddenTargetCount > 0 ? (
                <Text style={styles.moreText}>
                  {hiddenTargetCount} more{' '}
                  {hiddenTargetCount === 1 ? 'detail needs' : 'details need'}{' '}
                  checking. Use the item mics or Speak corrections.
                </Text>
              ) : null}
            </>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Speak corrections"
            onPress={onSpeakCorrections}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="mic-outline" size={18} color={colors.white} />
            <Text style={styles.primaryButtonText}>Speak corrections</Text>
          </Pressable>

          {transcriptCount > 0 ? (
            <View style={styles.transcriptSummary}>
              <View style={styles.transcriptTitleRow}>
                <Ionicons
                  name="checkmark-circle"
                  size={14}
                  color={colors.forest}
                />
                <Text style={styles.transcriptTitle}>
                  {transcriptCount}{' '}
                  {transcriptCount === 1
                    ? 'voice correction applied'
                    : 'voice corrections applied'}
                </Text>
              </View>
              {lastTranscript ? (
                <Text numberOfLines={1} style={styles.transcriptPreview}>
                  “{lastTranscript}”
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={styles.privacyRow}>
            <Ionicons
              name="shield-checkmark-outline"
              size={13}
              color={colors.inkFaint}
            />
            <Text style={styles.privacyText}>
              Audio is sent to Gnani for transcription. Crewline does not keep the
              recording.
            </Text>
          </View>
        </>
      ) : !supported || !configured ? (
        <View style={styles.disabledNotice}>
          <Ionicons
            name="mic-off-outline"
            size={16}
            color={colors.inkFaint}
          />
          <Text style={styles.disabledText}>{availabilityMessage}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    padding: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600',
  },
  body: {
    marginTop: 10,
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  targetToggle: {
    minHeight: 44,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
  },
  targetToggleCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  targetToggleText: {
    color: colors.forest,
    fontSize: 13,
    fontWeight: '700',
  },
  targetCount: {
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    backgroundColor: colors.sage,
    borderRadius: radii.pill,
  },
  targetCountText: {
    color: colors.forest,
    fontSize: 11,
    fontWeight: '700',
  },
  targetList: {
    marginTop: 8,
    gap: 7,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    backgroundColor: colors.surfaceExpanded,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.sm,
  },
  targetCopy: {
    flex: 1,
    gap: 2,
  },
  targetLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  targetReason: {
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  speakButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 11,
    backgroundColor: colors.sage,
    borderRadius: radii.pill,
  },
  speakButtonText: {
    color: colors.forest,
    fontSize: 11,
    fontWeight: '700',
  },
  moreText: {
    marginTop: 8,
    color: colors.inkFaint,
    fontSize: 11,
    lineHeight: 16,
  },
  primaryButton: {
    minHeight: 48,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.forest,
    borderRadius: radii.sm,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  transcriptSummary: {
    marginTop: 10,
    padding: 11,
    backgroundColor: colors.sage,
    borderRadius: radii.sm,
    gap: 3,
  },
  transcriptTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  transcriptTitle: {
    color: colors.forest,
    fontSize: 12,
    fontWeight: '700',
  },
  transcriptPreview: {
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 17,
    fontStyle: 'italic',
  },
  privacyRow: {
    marginTop: 11,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  privacyText: {
    flex: 1,
    color: colors.inkFaint,
    fontSize: 11,
    lineHeight: 16,
  },
  disabledNotice: {
    marginTop: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 11,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
  },
  disabledText: {
    flex: 1,
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  pressed: {
    opacity: 0.85,
  },
});
