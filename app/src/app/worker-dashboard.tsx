import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { BrandMark, IconButton, Screen, SectionHeader, StatusPill } from '@/components/ui';
import { colors, radii } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type Task = {
  id: string;
  title: string;
  location: string;
  time: string;
  priority: 'High' | 'Normal';
};

const TASKS: Task[] = [
  {
    id: 'scaffolding',
    title: 'Inspect scaffolding',
    location: 'North Wing · Level 4',
    time: '8:30 AM',
    priority: 'High',
  },
  {
    id: 'footings',
    title: 'Pour concrete footings',
    location: 'Zone B · Foundation',
    time: '10:00 AM',
    priority: 'Normal',
  },
  {
    id: 'safety',
    title: 'Safety walkthrough',
    location: 'Site office',
    time: '12:30 PM',
    priority: 'Normal',
  },
  {
    id: 'ppe',
    title: 'Restock PPE station',
    location: 'Storage unit',
    time: '2:00 PM',
    priority: 'Normal',
  },
];

const QUICK_ACTIONS: { label: string; icon: IconName }[] = [
  { label: 'Report issue', icon: 'warning-outline' },
  { label: 'Log hours', icon: 'time-outline' },
  { label: 'My schedule', icon: 'calendar-outline' },
];

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return 'Good morning';
  }

  if (hour < 18) {
    return 'Good afternoon';
  }

  return 'Good evening';
}

function formatToday() {
  const today = new Date();
  return `${SHORT_WEEKDAYS[today.getDay()]}, ${today.getDate()} ${
    SHORT_MONTHS[today.getMonth()]
  } ${today.getFullYear()}`;
}

function getDisplayName(identifier?: string) {
  if (!identifier || !identifier.includes('@')) {
    return 'Worker';
  }

  const [localPart] = identifier.split('@');
  const name = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  return name || 'Worker';
}

function getInitials(name: string) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return initials || 'W';
}

export default function WorkerDashboardScreen() {
  const router = useRouter();
  const { identifier } = useLocalSearchParams<{ identifier?: string }>();
  const { width } = useWindowDimensions();
  const showStickyAction = width < 720;

  const displayName = getDisplayName(identifier);
  const firstName = displayName.split(' ')[0];
  const initials = getInitials(displayName);

  const [completedTaskIds, setCompletedTaskIds] = useState<Record<string, boolean>>({
    scaffolding: true,
  });

  const completedCount = TASKS.filter((task) => completedTaskIds[task.id]).length;
  const remainingCount = TASKS.length - completedCount;

  const toggleTask = (taskId: string) => {
    setCompletedTaskIds((current) => ({ ...current, [taskId]: !current[taskId] }));
  };

  const handleQuickAction = (label: string) => {
    Alert.alert(label, 'This shortcut is not connected yet.');
  };

  const handleNotifications = () => {
    Alert.alert('Notifications', "You're all caught up.");
  };

  const handleSignOut = () => {
    router.replace('/');
  };

  const openDeliveryNote = () => {
    router.push({
      pathname: '/delivery-note',
      params: {
        identifier: identifier ?? '',
        workerName: displayName,
      },
    });
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          showStickyAction && styles.scrollContentWithSticky,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <View style={styles.topRow}>
            <BrandMark compact />

            <View style={styles.headerActions}>
              <IconButton
                icon="notifications-outline"
                accessibilityLabel="Notifications"
                onPress={handleNotifications}
              />

              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            </View>
          </View>

          <View style={styles.greetingSection}>
            <Text style={styles.dateLabel}>{formatToday()}</Text>
            <Text style={styles.greeting}>
              {getGreeting()}, {firstName}.
            </Text>
            <Text style={styles.greetingSubtitle}>
              You&apos;re on site at Riverside Tower. Here&apos;s what&apos;s ahead today.
            </Text>
          </View>

          <View style={styles.shiftCard}>
            <View style={styles.shiftGlow} />

            <View style={styles.shiftTopRow}>
              <Text style={styles.shiftLabel}>Today&apos;s shift</Text>
              <StatusPill label="On site" tone="accent" />
            </View>

            <Text style={styles.shiftTime}>8:00 AM – 4:00 PM</Text>

            <View style={styles.shiftSiteRow}>
              <Ionicons name="location-outline" size={14} color={colors.onForestMuted} />
              <Text style={styles.shiftSite}>Riverside Tower · Zone B</Text>
            </View>

            <View style={styles.shiftStats}>
              <View style={styles.shiftStat}>
                <Text style={styles.shiftStatValue}>{remainingCount}</Text>
                <Text style={styles.shiftStatLabel}>Tasks left</Text>
              </View>
              <View style={styles.shiftStatDivider} />
              <View style={styles.shiftStat}>
                <Text style={styles.shiftStatValue}>{completedCount}</Text>
                <Text style={styles.shiftStatLabel}>Done today</Text>
              </View>
              <View style={styles.shiftStatDivider} />
              <View style={styles.shiftStat}>
                <Text style={styles.shiftStatValue}>3.5</Text>
                <Text style={styles.shiftStatLabel}>Hours logged</Text>
              </View>
            </View>

            <View style={styles.shiftFooter}>
              <View style={styles.clockedRow}>
                <Ionicons name="checkmark-circle" size={15} color={colors.accent} />
                <Text style={styles.clockedText}>Clocked in at 7:58 AM</Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View shift schedule"
                onPress={() => handleQuickAction('Shift schedule')}
                hitSlop={8}
                style={({ pressed }) => [styles.viewShift, pressed && styles.pressed]}
              >
                <Text style={styles.viewShiftText}>View</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.accent} />
              </Pressable>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan a delivery note"
            onPress={openDeliveryNote}
            style={({ pressed }) => [styles.deliveryCard, pressed && styles.pressed]}
          >
            <View style={styles.deliveryGlow} />

            <View style={styles.deliveryIcon}>
              <Ionicons name="document-text-outline" size={24} color={colors.accent} />
            </View>

            <View style={styles.deliveryCopy}>
              <View style={styles.deliveryTitleRow}>
                <Text style={styles.deliveryTitle}>Scan delivery note</Text>
                <View style={styles.deliveryBadge}>
                  <Text style={styles.deliveryBadgeText}>OCR + voice</Text>
                </View>
              </View>
              <Text style={styles.deliverySubtitle}>
                Capture the note, correct it by voice and confirm the delivery.
              </Text>
            </View>

            <View style={styles.deliveryArrow}>
              <Ionicons name="arrow-forward" size={17} color={colors.white} />
            </View>
          </Pressable>

          <View style={styles.tasksSection}>
            <SectionHeader
              title="Today&apos;s tasks"
              hint={`${remainingCount} ${remainingCount === 1 ? 'task' : 'tasks'} left`}
            />

            <View style={styles.taskList}>
              {TASKS.map((task, index) => {
                const isDone = Boolean(completedTaskIds[task.id]);

                return (
                  <Pressable
                    key={task.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isDone }}
                    aria-checked={isDone}
                    accessibilityLabel={`${task.title}, ${task.time} at ${task.location}`}
                    onPress={() => toggleTask(task.id)}
                    style={({ pressed }) => [
                      styles.taskRow,
                      index > 0 && styles.taskRowDivider,
                      isDone && styles.taskRowDone,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={[styles.taskCheck, isDone && styles.taskCheckDone]}>
                      {isDone ? (
                        <Ionicons name="checkmark" size={14} color={colors.white} />
                      ) : null}
                    </View>

                    <View style={styles.taskBody}>
                      <View style={styles.taskTitleRow}>
                        <Text
                          numberOfLines={1}
                          style={[styles.taskTitle, isDone && styles.taskTitleDone]}
                        >
                          {task.title}
                        </Text>

                        {task.priority === 'High' && !isDone ? (
                          <StatusPill label="High" tone="warning" />
                        ) : null}
                      </View>

                      <View style={styles.taskMetaRow}>
                        <Ionicons name="time-outline" size={13} color={colors.inkFaint} />
                        <Text style={styles.taskMeta}>{task.time}</Text>
                        <View style={styles.metaDot} />
                        <Ionicons name="location-outline" size={13} color={colors.inkFaint} />
                        <Text numberOfLines={1} style={styles.taskMeta}>
                          {task.location}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.quickSection}>
            <SectionHeader title="Quick actions" />

            <View style={styles.quickGrid}>
              {QUICK_ACTIONS.map((action) => (
                <Pressable
                  key={action.label}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  onPress={() => handleQuickAction(action.label)}
                  style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}
                >
                  <View style={styles.quickIcon}>
                    <Ionicons name={action.icon} size={18} color={colors.forest} />
                  </View>
                  <Text style={styles.quickLabel}>{action.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan another document and extract its text"
            onPress={() => router.push('/scan')}
            style={({ pressed }) => [styles.scanCard, pressed && styles.pressed]}
          >
            <View style={styles.scanIcon}>
              <Ionicons name="scan-outline" size={18} color={colors.inkSoft} />
            </View>

            <View style={styles.scanCopy}>
              <Text style={styles.scanTitle}>Scan another document</Text>
              <Text style={styles.scanSubtitle}>
                Capture a form or receipt and pull out the text on-device.
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={17} color={colors.inkFaint} />
          </Pressable>

          <View style={styles.signOutRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              onPress={handleSignOut}
              style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}
            >
              <Ionicons name="log-out-outline" size={16} color={colors.inkSoft} />
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {showStickyAction ? (
        <View style={styles.stickyBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan delivery note"
            onPress={openDeliveryNote}
            style={({ pressed }) => [styles.stickyButton, pressed && styles.pressed]}
          >
            <Ionicons name="document-text-outline" size={19} color={colors.white} />
            <Text style={styles.stickyButtonText}>Scan delivery note</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.white} />
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  scrollContentWithSticky: {
    paddingBottom: 104,
  },
  content: {
    width: '100%',
    maxWidth: 480,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  avatar: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.sage,
    borderRadius: radii.pill,
  },
  avatarText: {
    color: colors.forest,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  greetingSection: {
    marginTop: 22,
  },
  dateLabel: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: '600',
  },
  greeting: {
    marginTop: 6,
    color: colors.ink,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -1,
  },
  greetingSubtitle: {
    maxWidth: 350,
    marginTop: 6,
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 21,
  },
  shiftCard: {
    marginTop: 18,
    padding: 18,
    backgroundColor: colors.forest,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  shiftGlow: {
    position: 'absolute',
    top: -60,
    right: -50,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.forestGlow,
  },
  shiftTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shiftLabel: {
    color: colors.onForestFaint,
    fontSize: 12,
    fontWeight: '600',
  },
  shiftTime: {
    marginTop: 10,
    color: colors.white,
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: -0.7,
    fontVariant: ['tabular-nums'],
  },
  shiftSiteRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shiftSite: {
    color: colors.onForestMuted,
    fontSize: 13,
  },
  shiftStats: {
    marginTop: 16,
    paddingTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.onForestOverlay,
  },
  shiftStat: {
    flex: 1,
  },
  shiftStatValue: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  shiftStatLabel: {
    marginTop: 1,
    color: colors.onForestMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  shiftStatDivider: {
    width: 1,
    height: 28,
    marginHorizontal: 12,
    backgroundColor: colors.onForestOverlay,
  },
  shiftFooter: {
    marginTop: 14,
    paddingTop: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.onForestOverlay,
  },
  clockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  clockedText: {
    color: colors.onForest,
    fontSize: 12,
    fontWeight: '600',
  },
  viewShift: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  viewShiftText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  deliveryCard: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    backgroundColor: colors.forest,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  deliveryGlow: {
    position: 'absolute',
    top: -52,
    right: -36,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.forestGlow,
  },
  deliveryIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.onForestOverlay,
    borderRadius: 14,
  },
  deliveryCopy: {
    flex: 1,
  },
  deliveryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  deliveryTitle: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  deliveryBadge: {
    minHeight: 22,
    paddingHorizontal: 7,
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
  },
  deliveryBadgeText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '700',
  },
  deliverySubtitle: {
    marginTop: 4,
    color: colors.onForestMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  deliveryArrow: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.onForestOverlay,
    borderRadius: 11,
  },
  tasksSection: {
    marginTop: 24,
  },
  taskList: {
    marginTop: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  taskRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  taskRowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  taskRowDone: {
    backgroundColor: colors.surfaceMuted,
  },
  taskCheck: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: 7,
  },
  taskCheckDone: {
    backgroundColor: colors.forest,
    borderColor: colors.forest,
  },
  taskBody: {
    flex: 1,
    minWidth: 0,
  },
  taskTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  taskTitle: {
    flexShrink: 1,
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  taskTitleDone: {
    color: colors.inkFaint,
    textDecorationLine: 'line-through',
  },
  taskMetaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  taskMeta: {
    flexShrink: 1,
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: '500',
  },
  metaDot: {
    width: 2,
    height: 2,
    marginHorizontal: 1,
    backgroundColor: colors.lineStrong,
    borderRadius: radii.pill,
  },
  quickSection: {
    marginTop: 24,
  },
  quickGrid: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 9,
  },
  quickCard: {
    flex: 1,
    minHeight: 88,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
  },
  quickIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.sage,
    borderRadius: 11,
  },
  quickLabel: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  scanCard: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
  },
  scanIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: 11,
  },
  scanCopy: {
    flex: 1,
  },
  scanTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  scanSubtitle: {
    marginTop: 2,
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  signOutRow: {
    marginTop: 20,
    alignItems: 'center',
  },
  signOutButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  signOutText: {
    color: colors.inkSoft,
    fontSize: 13,
    fontWeight: '600',
  },
  stickyBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  stickyButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 18,
    backgroundColor: colors.forest,
    borderRadius: radii.md,
  },
  stickyButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
});
