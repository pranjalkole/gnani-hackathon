import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ComponentProps } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { BrandMark, Screen } from '@/components/ui';
import { ApiError } from '@/lib/api';
import {
  filterOrders,
  formatExpectedDate,
  formatQuantity,
  getCancellationDetail,
  getCancellationMeta,
  getDisplayName,
  getGreeting,
  getInitials,
  getOrderCounts,
  getOrderStatusMeta,
  getSupervisorTotals,
  getTodayLabel,
  ORDER_FILTERS,
  sortOrdersForSupervisor,
  summarizeOrder,
  type OrderFilter,
  type OrderStatus,
  type SupervisorOrder,
} from '@/lib/supervisor';
import { fetchSupervisorOrders } from '@/lib/supervisorApi';
import { colors, radii } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function getLoadErrorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "We can't load orders right now. Check your connection and try again.";
}

type MetricCardProps = {
  icon: IconName;
  iconColor: string;
  iconBackground: string;
  value: string;
  label: string;
  wide: boolean;
};

function MetricCard({
  icon,
  iconColor,
  iconBackground,
  value,
  label,
  wide,
}: MetricCardProps) {
  return (
    <View
      style={[styles.metricCard, wide && styles.metricCardWide]}
      accessibilityLabel={`${value} ${label}`}
    >
      <View style={[styles.metricIcon, { backgroundColor: iconBackground }]}>
        <Ionicons name={icon} size={15} color={iconColor} />
      </View>
      <View style={styles.metricCopy}>
        <Text style={styles.metricValue}>{value}</Text>
        <Text numberOfLines={2} style={styles.metricLabel}>
          {label}
        </Text>
      </View>
    </View>
  );
}

function OrdersSkeleton() {
  return (
    <View style={styles.skeletonWrap} accessibilityLiveRegion="polite">
      <Text style={styles.skeletonLabel}>Loading orders…</Text>
      {[0, 1, 2].map((index) => (
        <View key={index} style={styles.skeletonCard}>
          <View style={styles.skeletonTopRow}>
            <View style={styles.skeletonTitle} />
            <View style={styles.skeletonPill} />
          </View>
          <View style={styles.skeletonMeta} />
          <View style={styles.skeletonTrack} />
          <View style={styles.skeletonMetrics} />
        </View>
      ))}
    </View>
  );
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const meta = getOrderStatusMeta(status);

  return (
    <View style={[styles.statusBadge, { backgroundColor: meta.backgroundColor }]}>
      <View style={[styles.statusDot, { backgroundColor: meta.dotColor }]} />
      <Text style={[styles.statusText, { color: meta.textColor }]}>
        {meta.shortLabel}
      </Text>
    </View>
  );
}

function OrderDetails({ order, wide }: { order: SupervisorOrder; wide: boolean }) {
  const cancelled = order.status === 'cancelled';
  const cancellationMeta = getCancellationMeta(order);

  return (
    <View style={[styles.detailPanel, wide && styles.detailPanelWide]}>
      {cancelled ? (
        <View style={styles.cancelBanner}>
          <Ionicons name="ban-outline" size={15} color={colors.inkSoft} />
          <View style={styles.cancelBannerCopy}>
            <Text style={styles.cancelBannerTitle}>Order cancelled</Text>
            {cancellationMeta ? (
              <Text style={styles.cancelBannerMeta}>{cancellationMeta}</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      <View style={styles.detailHeader}>
        <View style={styles.detailTitleRow}>
          <Ionicons name="list-outline" size={15} color={colors.forest} />
          <Text style={styles.detailTitle}>Order lines</Text>
        </View>
        <Text style={styles.detailCount}>
          {order.items.length} {order.items.length === 1 ? 'line' : 'lines'}
        </Text>
      </View>

      <View>
        {order.items.map((item, index) => {
          const remaining = Math.max(
            item.orderedQuantity - item.receivedQuantity,
            0
          );
          const isLast = index === order.items.length - 1;
          const lineMeta = cancelled
            ? `Ordered ${formatQuantity(item.orderedQuantity)} · ${
                item.receivedQuantity > 0
                  ? `Received before cancellation ${formatQuantity(
                      item.receivedQuantity
                    )}`
                  : 'No units received'
              }`
            : `Ordered ${formatQuantity(
                item.orderedQuantity
              )} · Remaining ${formatQuantity(remaining)}`;

          return (
            <View
              key={item.id}
              style={[styles.lineRow, isLast && styles.lineRowLast]}
            >
              <View style={styles.lineCopy}>
                <Text style={styles.lineDescription}>{item.description}</Text>
                <Text style={styles.lineMeta}>{lineMeta}</Text>
              </View>

              <View style={styles.lineRight}>
                <Text style={styles.lineReceived}>
                  {formatQuantity(item.receivedQuantity)}
                  <Text style={styles.lineOrdered}>
                    {' '}
                    / {formatQuantity(item.orderedQuantity)}
                  </Text>
                </Text>

                {item.damagedQuantity > 0 ? (
                  <View style={styles.damagePill}>
                    <Text style={styles.damagePillText}>
                      {formatQuantity(item.damagedQuantity)} damaged
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.detailNote}>
        <Ionicons
          name="information-circle-outline"
          size={13}
          color={colors.inkFaint}
        />
        <Text style={styles.detailNoteText}>
          Damaged units are tracked separately and do not count as received.
        </Text>
      </View>
    </View>
  );
}

type OrderRowProps = {
  order: SupervisorOrder;
  expanded: boolean;
  wide: boolean;
  onToggle: () => void;
};

function OrderRow({ order, expanded, wide, onToggle }: OrderRowProps) {
  const summary = summarizeOrder(order);
  const statusMeta = getOrderStatusMeta(order.status);
  const cancelled = order.status === 'cancelled';
  const cancellationMeta = cancelled ? getCancellationMeta(order) : '';
  const cancellationDetail = cancelled ? getCancellationDetail(order) : '';
  const quantityLabel = cancelled
    ? summary.receivedQuantity > 0
      ? `${formatQuantity(summary.receivedQuantity)} of ${formatQuantity(
          summary.orderedQuantity
        )} units received before cancellation`
      : 'no units received before cancellation'
    : `${formatQuantity(summary.receivedQuantity)} of ${formatQuantity(
        summary.orderedQuantity
      )} received`;

  return (
    <View style={[styles.orderBlock, wide && styles.orderBlockWide]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${order.poNumber}, ${order.supplier}, ${statusMeta.label}, ${quantityLabel}`}
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={({ pressed }) => [
          wide ? styles.tableRow : styles.orderCard,
          !wide && { borderLeftColor: statusMeta.dotColor },
          pressed && styles.pressed,
          expanded && !wide && styles.orderCardExpanded,
        ]}
      >
        {wide ? (
          <>
            <View style={styles.colOrder}>
              <Text numberOfLines={1} style={styles.tableOrderNumber}>
                {order.poNumber}
              </Text>
              <Text numberOfLines={1} style={styles.tableOrderSupplier}>
                {order.supplier}
              </Text>
            </View>

            <View style={styles.colSite}>
              <Text numberOfLines={1} style={styles.tableCellText}>
                {order.site}
              </Text>
            </View>

            <View style={styles.colDate}>
              <Text numberOfLines={1} style={styles.tableCellText}>
                {formatExpectedDate(order.expectedDeliveryDate)}
              </Text>
            </View>

            <View style={styles.colReceived}>
              <Text
                style={[
                  styles.tableReceivedValue,
                  cancelled && styles.tableReceivedValueMuted,
                ]}
              >
                {formatQuantity(summary.receivedQuantity)}
                <Text style={styles.tableReceivedTotal}>
                  {' '}
                  / {formatQuantity(summary.orderedQuantity)}
                </Text>
              </Text>
              {cancelled ? null : (
                <View style={styles.miniTrack}>
                  <View
                    style={[
                      styles.miniReceived,
                      { width: `${summary.receivedPercent}%` },
                    ]}
                  />
                  <View
                    style={[
                      styles.miniDamaged,
                      { width: `${summary.damagedPercent}%` },
                    ]}
                  />
                </View>
              )}
            </View>

            <View style={styles.colDamaged}>
              <Text
                style={[
                  styles.tableDamagedValue,
                  summary.damagedQuantity > 0 &&
                    styles.tableDamagedValueActive,
                ]}
              >
                {formatQuantity(summary.damagedQuantity)}
              </Text>
            </View>

            <View style={styles.colStatus}>
              <StatusBadge status={order.status} />
            </View>

            <View style={styles.colChevron}>
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={15}
                color={colors.inkFaint}
              />
            </View>
          </>
        ) : (
          <>
            <View style={styles.orderTopRow}>
              <View style={styles.orderTitleBlock}>
                <Text style={styles.orderNumber}>{order.poNumber}</Text>
                <Text style={styles.orderSupplier}>{order.supplier}</Text>
              </View>
              <StatusBadge status={order.status} />
            </View>

            <View style={styles.orderMetaRow}>
              <Ionicons
                name="location-outline"
                size={12}
                color={colors.inkFaint}
              />
              <Text numberOfLines={1} style={styles.orderMetaText}>
                {order.site}
              </Text>
              <View style={styles.metaDot} />
              <Ionicons
                name="calendar-outline"
                size={12}
                color={colors.inkFaint}
              />
              <Text style={styles.orderMetaText}>
                {formatExpectedDate(order.expectedDeliveryDate)}
              </Text>
            </View>

            {cancelled ? (
              <View style={styles.cancelledSummary}>
                <Ionicons
                  name="ban-outline"
                  size={14}
                  color={colors.inkSoft}
                />
                <View style={styles.cancelledSummaryCopy}>
                  <Text style={styles.cancelledSummaryTitle}>
                    Order cancelled
                  </Text>
                  {cancellationMeta ? (
                    <Text style={styles.cancelledSummaryMeta}>
                      {cancellationMeta}
                    </Text>
                  ) : null}
                  <Text style={styles.cancelledSummaryDetail}>
                    {cancellationDetail}
                  </Text>
                </View>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.inkFaint}
                />
              </View>
            ) : (
              <>
                <View style={styles.progressRow}>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressReceived,
                        { width: `${summary.receivedPercent}%` },
                      ]}
                    />
                    <View
                      style={[
                        styles.progressDamaged,
                        { width: `${summary.damagedPercent}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressValue}>
                    {Math.round(summary.receivedPercent)}%
                  </Text>
                </View>

                <View style={styles.orderMetricsRow}>
                  <View style={styles.orderMetric}>
                    <Text style={styles.orderMetricLabel}>Received</Text>
                    <Text style={styles.orderMetricValue}>
                      {formatQuantity(summary.receivedQuantity)} /{' '}
                      {formatQuantity(summary.orderedQuantity)}
                    </Text>
                  </View>

                  <View style={styles.orderMetric}>
                    <Text style={styles.orderMetricLabel}>Damaged</Text>
                    <Text
                      style={[
                        styles.orderMetricValue,
                        summary.damagedQuantity > 0 &&
                          styles.orderMetricDanger,
                      ]}
                    >
                      {formatQuantity(summary.damagedQuantity)}
                    </Text>
                  </View>

                  <View style={styles.orderMetric}>
                    <Text style={styles.orderMetricLabel}>Remaining</Text>
                    <Text style={styles.orderMetricValue}>
                      {formatQuantity(summary.remainingQuantity)}
                    </Text>
                  </View>

                  <Ionicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.inkFaint}
                  />
                </View>
              </>
            )}
          </>
        )}
      </Pressable>

      {expanded ? <OrderDetails order={order} wide={wide} /> : null}
    </View>
  );
}

export default function SupervisorDashboardScreen() {
  const router = useRouter();
  const { identifier } = useLocalSearchParams<{ identifier?: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 720;

  const displayName = getDisplayName(identifier);
  const firstName = displayName.split(' ')[0];
  const initials = getInitials(displayName);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<OrderFilter>('all');
  const [expandedPO, setExpandedPO] = useState<string | null>(null);
  const [orders, setOrders] = useState<SupervisorOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const fetchOrders = useCallback(async (mode: 'initial' | 'refresh') => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    try {
      const nextOrders = await fetchSupervisorOrders();
      if (requestId !== requestIdRef.current) {
        return;
      }
      setOrders(nextOrders);
      setLoadError(null);
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      const message = getLoadErrorMessage(error);

      if (mode === 'refresh') {
        Alert.alert('Refresh failed', message);
      } else {
        setLoadError(message);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    fetchSupervisorOrders()
      .then((nextOrders) => {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setOrders(nextOrders);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setLoadError(getLoadErrorMessage(error));
      })
      .finally(() => {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      });

    return () => {
      requestIdRef.current += 1;
    };
  }, []);

  const handleRetry = () => {
    setLoadError(null);
    setLoading(true);
    void fetchOrders('initial');
  };

  const handleRefresh = () => {
    setRefreshing(true);
    void fetchOrders('refresh');
  };

  const totals = getSupervisorTotals(orders);
  const counts = getOrderCounts(orders);
  const filteredOrders = sortOrdersForSupervisor(
    filterOrders(orders, query, filter)
  );
  const visibleCancelled = filteredOrders.filter(
    (order) => order.status === 'cancelled'
  ).length;
  const siteNames = Array.from(
    new Set(orders.map((order) => order.site).filter(Boolean))
  ).sort();
  const siteLabel =
    siteNames.length > 1 ? 'All sites' : (siteNames[0] ?? 'All sites');
  const hasOrders = orders.length > 0;

  const resetFilters = () => {
    setQuery('');
    setFilter('all');
  };

  const handleSignOut = () => {
    router.replace('/');
  };

  const metrics: MetricCardProps[] = [
    {
      icon: 'folder-open-outline',
      iconColor: colors.forest,
      iconBackground: colors.sage,
      value: String(totals.openOrders),
      label: 'Open orders',
      wide: isWide,
    },
    {
      icon: 'hourglass-outline',
      iconColor: colors.ink,
      iconBackground: colors.accentSoft,
      value: String(totals.partialOrders),
      label: 'Partial orders',
      wide: isWide,
    },
    {
      icon: 'checkmark-done-outline',
      iconColor: colors.forest,
      iconBackground: colors.surfaceMuted,
      value: String(totals.closedOrders),
      label: 'Closed orders',
      wide: isWide,
    },
    {
      icon: 'warning-outline',
      iconColor: colors.danger,
      iconBackground: colors.dangerSoft,
      value: formatQuantity(totals.damagedUnits),
      label: 'Damaged units',
      wide: isWide,
    },
  ];

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isWide && styles.scrollContentWide,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.forest}
            colors={[colors.forest]}
          />
        }
      >
        <View style={[styles.content, isWide && styles.contentWide]}>
          <View style={styles.topRow}>
            <BrandMark compact />

            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>

          <View style={styles.greetingSection}>
            <View style={styles.greetingTopRow}>
              <Text style={styles.dateLabel}>{getTodayLabel()}</Text>
              <View style={styles.rolePill}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={10}
                  color={colors.forest}
                />
                <Text style={styles.roleText}>Supervisor</Text>
              </View>
            </View>

            <Text style={styles.greeting}>
              {getGreeting()}, {firstName}.
            </Text>
            <Text style={styles.greetingSubtitle}>
              Delivery status across your{' '}
              {siteNames.length > 1 ? 'sites' : 'site'}.
            </Text>
          </View>

          {loading ? (
            <OrdersSkeleton />
          ) : loadError ? (
            <View style={styles.stateCard} accessibilityLiveRegion="polite">
              <View style={[styles.stateIcon, styles.stateIconDanger]}>
                <Ionicons
                  name="cloud-offline-outline"
                  size={21}
                  color={colors.danger}
                />
              </View>
              <Text style={styles.stateTitle}>Couldn&apos;t load orders</Text>
              <Text style={styles.stateBody}>{loadError}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry loading orders"
                onPress={handleRetry}
                style={({ pressed }) => [
                  styles.stateButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="refresh-outline"
                  size={13}
                  color={colors.forest}
                />
                <Text style={styles.stateButtonText}>Try again</Text>
              </Pressable>
            </View>
          ) : !hasOrders ? (
            <View style={styles.stateCard} accessibilityLiveRegion="polite">
              <View style={styles.stateIcon}>
                <Ionicons
                  name="file-tray-outline"
                  size={21}
                  color={colors.forest}
                />
              </View>
              <Text style={styles.stateTitle}>No purchase orders yet</Text>
              <Text style={styles.stateBody}>
                New orders will appear here as soon as they&apos;re created.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Refresh purchase orders"
                onPress={handleRetry}
                style={({ pressed }) => [
                  styles.stateButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="refresh-outline"
                  size={13}
                  color={colors.forest}
                />
                <Text style={styles.stateButtonText}>Refresh</Text>
              </Pressable>
            </View>
          ) : (
            <>
          <View style={styles.siteCard}>
            <View style={styles.siteTopRow}>
              <Text style={styles.siteLabel}>Site overview</Text>
              <View style={styles.activeBadge}>
                <View style={styles.activeDot} />
                <Text style={styles.activeText}>
                  {totals.activeOrders} active
                </Text>
              </View>
            </View>

            <Text style={styles.siteName}>{siteLabel}</Text>
            <Text style={styles.siteMeta}>
              {totals.totalOrders} orders · {formatQuantity(totals.receivedUnits)}{' '}
              of {formatQuantity(totals.orderedUnits)} units received
            </Text>

            <View style={styles.siteProgressTrack}>
              <View
                style={[
                  styles.siteProgressReceived,
                  { width: `${totals.receivedPercent}%` },
                ]}
              />
              <View
                style={[
                  styles.siteProgressDamaged,
                  { width: `${totals.damagedPercent}%` },
                ]}
              />
            </View>

            <View style={styles.siteFooter}>
              <Text style={styles.siteFooterText}>
                {Math.round(totals.receivedPercent)}% received
              </Text>
              <Text style={styles.siteFooterText}>
                {formatQuantity(totals.damagedUnits)} damaged
              </Text>
              <Text style={styles.siteFooterText}>
                {formatQuantity(totals.remainingUnits)} remaining
              </Text>
            </View>
          </View>

          <View style={styles.controls}>
            <View style={styles.searchShell}>
              <Ionicons
                name="search-outline"
                size={18}
                color={colors.inkFaint}
              />
              <TextInput
                value={query}
                onChangeText={setQuery}
                accessibilityLabel="Search orders"
                placeholder="Search PO, supplier, or site"
                placeholderTextColor={colors.inkFaint}
                selectionColor={colors.forest}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                style={styles.searchInput}
              />
              {query ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  onPress={() => setQuery('')}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.clearSearch,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons
                    name="close-circle"
                    size={17}
                    color={colors.inkFaint}
                  />
                </Pressable>
              ) : null}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {ORDER_FILTERS.map((option) => {
                const isActive = option.id === filter;

                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={`Filter by ${option.label}`}
                    onPress={() => setFilter(option.id)}
                    style={({ pressed }) => [
                      styles.chip,
                      isActive && styles.chipActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        isActive && styles.chipTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                    <View
                      style={[
                        styles.chipCount,
                        isActive && styles.chipCountActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipCountText,
                          isActive && styles.chipCountTextActive,
                        ]}
                      >
                        {counts[option.id]}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.metricsGrid}>
            {metrics.map((metric) => (
              <MetricCard key={metric.label} {...metric} />
            ))}
          </View>

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Orders</Text>
              <Text style={styles.sectionSubtitle}>
                Received, damaged and status by purchase order
              </Text>
            </View>
            <Text style={styles.sectionHint}>
              {filteredOrders.length} shown
              {visibleCancelled > 0 && filter !== 'cancelled'
                ? ` · ${visibleCancelled} cancelled`
                : ''}
            </Text>
          </View>

          {filteredOrders.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name="search-outline"
                  size={21}
                  color={colors.forest}
                />
              </View>
              <Text style={styles.emptyTitle}>No orders match these filters.</Text>
              <Text style={styles.emptyBody}>
                Try another PO number, supplier, site, or status.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear order filters"
                onPress={resetFilters}
                style={({ pressed }) => [
                  styles.emptyButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="refresh-outline"
                  size={13}
                  color={colors.forest}
                />
                <Text style={styles.emptyButtonText}>Clear filters</Text>
              </Pressable>
            </View>
          ) : isWide ? (
            <View style={styles.tableCard}>
              <View style={styles.tableHeader}>
                <View style={styles.colOrder}>
                  <Text style={styles.tableHeaderText}>Order</Text>
                </View>
                <View style={styles.colSite}>
                  <Text style={styles.tableHeaderText}>Site</Text>
                </View>
                <View style={styles.colDate}>
                  <Text style={styles.tableHeaderText}>Expected</Text>
                </View>
                <View style={styles.colReceived}>
                  <Text style={styles.tableHeaderText}>Received</Text>
                </View>
                <View style={styles.colDamaged}>
                  <Text style={styles.tableHeaderText}>Damaged</Text>
                </View>
                <View style={styles.colStatus}>
                  <Text style={styles.tableHeaderText}>Status</Text>
                </View>
                <View style={styles.colChevron} />
              </View>

              {filteredOrders.map((order) => (
                <OrderRow
                  key={order.poNumber}
                  order={order}
                  expanded={expandedPO === order.poNumber}
                  wide
                  onToggle={() =>
                    setExpandedPO((current) =>
                      current === order.poNumber ? null : order.poNumber
                    )
                  }
                />
              ))}
            </View>
          ) : (
            <View style={styles.orderList}>
              {filteredOrders.map((order) => (
                <OrderRow
                  key={order.poNumber}
                  order={order}
                  expanded={expandedPO === order.poNumber}
                  wide={false}
                  onToggle={() =>
                    setExpandedPO((current) =>
                      current === order.poNumber ? null : order.poNumber
                    )
                  }
                />
              ))}
            </View>
          )}
            </>
          )}

          <Text style={styles.footnote}>
            Orders update live. Pull down to refresh.
          </Text>

          <View style={styles.signOutRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              onPress={handleSignOut}
              style={({ pressed }) => [
                styles.signOutButton,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name="log-out-outline"
                size={16}
                color={colors.inkSoft}
              />
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingTop: 14,
    paddingHorizontal: 22,
    paddingBottom: 28,
  },
  scrollContentWide: {
    paddingHorizontal: 32,
  },
  content: {
    width: '100%',
    maxWidth: 480,
  },
  contentWide: {
    maxWidth: 900,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatar: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.sage,
    borderRadius: radii.pill,
  },
  avatarText: {
    color: colors.forest,
    fontSize: 12,
    fontWeight: '700',
  },
  greetingSection: {
    marginTop: 26,
  },
  greetingTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  dateLabel: {
    color: colors.inkSoft,
    fontSize: 11,
    fontWeight: '600',
  },
  rolePill: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    backgroundColor: colors.sage,
    borderRadius: radii.pill,
  },
  roleText: {
    color: colors.forest,
    fontSize: 11,
    fontWeight: '700',
  },
  greeting: {
    marginTop: 8,
    color: colors.ink,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: -0.7,
  },
  greetingSubtitle: {
    maxWidth: 340,
    marginTop: 8,
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 20,
  },
  siteCard: {
    marginTop: 22,
    padding: 18,
    backgroundColor: colors.forest,
    borderRadius: radii.lg,
  },
  siteTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  siteLabel: {
    color: colors.onForestFaint,
    fontSize: 11,
    fontWeight: '600',
  },
  activeBadge: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3,
    paddingHorizontal: 9,
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
  },
  activeDot: {
    width: 5,
    height: 5,
    backgroundColor: colors.forest,
    borderRadius: radii.pill,
  },
  activeText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '700',
  },
  siteName: {
    marginTop: 10,
    color: colors.white,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  siteMeta: {
    marginTop: 6,
    color: colors.onForestMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  siteProgressTrack: {
    marginTop: 16,
    height: 8,
    flexDirection: 'row',
    backgroundColor: colors.onForestOverlay,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  siteProgressReceived: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  siteProgressDamaged: {
    height: '100%',
    backgroundColor: colors.damagedSegment,
  },
  siteFooter: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  siteFooterText: {
    color: colors.onForestMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  metricsGrid: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
  },
  metricCardWide: {
    flexBasis: '22%',
    minWidth: 0,
  },
  metricIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  metricCopy: {
    flex: 1,
    minWidth: 0,
  },
  metricValue: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  metricLabel: {
    marginTop: 1,
    color: colors.inkSoft,
    fontSize: 11,
    fontWeight: '600',
  },
  controls: {
    marginTop: 22,
  },
  searchShell: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
    color: colors.ink,
    fontSize: 14,
  },
  clearSearch: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: {
    marginTop: 10,
    gap: 8,
    paddingRight: 4,
  },
  chip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.pill,
  },
  chipActive: {
    backgroundColor: colors.forest,
    borderColor: colors.forest,
  },
  chipText: {
    color: colors.inkSoft,
    fontSize: 11,
    fontWeight: '700',
  },
  chipTextActive: {
    color: colors.white,
  },
  chipCount: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
  },
  chipCountActive: {
    backgroundColor: colors.onForestOverlayStrong,
  },
  chipCountText: {
    color: colors.inkSoft,
    fontSize: 11,
    fontWeight: '700',
  },
  chipCountTextActive: {
    color: colors.white,
  },
  sectionHeader: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    marginTop: 3,
    color: colors.inkFaint,
    fontSize: 11,
  },
  sectionHint: {
    color: colors.inkFaint,
    fontSize: 11,
    fontWeight: '600',
  },
  orderList: {
    marginTop: 11,
    gap: 9,
  },
  orderBlock: {
    width: '100%',
  },
  orderBlockWide: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  orderCard: {
    padding: 15,
    paddingLeft: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderColor: colors.line,
    borderRadius: radii.md,
  },
  orderCardExpanded: {
    backgroundColor: colors.surfaceExpanded,
    borderColor: colors.lineStrong,
  },
  orderTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  orderTitleBlock: {
    flex: 1,
  },
  orderNumber: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  orderSupplier: {
    marginTop: 2,
    color: colors.inkSoft,
    fontSize: 11.5,
  },
  statusBadge: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: radii.pill,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  orderMetaRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  orderMetaText: {
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
  progressRow: {
    marginTop: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 7,
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  progressReceived: {
    height: '100%',
    backgroundColor: colors.forest,
  },
  progressDamaged: {
    height: '100%',
    backgroundColor: colors.danger,
  },
  progressValue: {
    width: 34,
    color: colors.forest,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  orderMetricsRow: {
    marginTop: 12,
    paddingTop: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  orderMetric: {
    flex: 1,
  },
  orderMetricLabel: {
    color: colors.inkFaint,
    fontSize: 11,
    fontWeight: '600',
  },
  orderMetricValue: {
    marginTop: 2,
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  orderMetricDanger: {
    color: colors.danger,
  },
  cancelledSummary: {
    marginTop: 11,
    paddingTop: 11,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  cancelledSummaryCopy: {
    flex: 1,
  },
  cancelledSummaryTitle: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  cancelledSummaryMeta: {
    marginTop: 3,
    color: colors.inkFaint,
    fontSize: 11.5,
    lineHeight: 16,
  },
  cancelledSummaryDetail: {
    marginTop: 2,
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  tableCard: {
    marginTop: 11,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.surfaceMuted,
  },
  tableHeaderText: {
    color: colors.inkFaint,
    fontSize: 11,
    fontWeight: '700',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: colors.surface,
  },
  colOrder: {
    flex: 1.6,
    minWidth: 0,
  },
  colSite: {
    flex: 1.25,
    minWidth: 0,
  },
  colDate: {
    flex: 1,
    minWidth: 0,
  },
  colReceived: {
    flex: 1.35,
    minWidth: 0,
  },
  colDamaged: {
    flex: 0.7,
    minWidth: 0,
  },
  colStatus: {
    flex: 0.95,
    minWidth: 0,
  },
  colChevron: {
    width: 18,
    alignItems: 'flex-end',
  },
  tableOrderNumber: {
    color: colors.ink,
    fontSize: 13.5,
    fontWeight: '700',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
  tableOrderSupplier: {
    marginTop: 2,
    color: colors.inkFaint,
    fontSize: 11,
  },
  tableCellText: {
    color: colors.inkSoft,
    fontSize: 12,
  },
  tableReceivedValue: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  tableReceivedValueMuted: {
    color: colors.inkFaint,
  },
  tableReceivedTotal: {
    color: colors.inkFaint,
    fontSize: 11,
    fontWeight: '600',
  },
  miniTrack: {
    width: '100%',
    maxWidth: 100,
    height: 4,
    marginTop: 4,
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  miniReceived: {
    height: '100%',
    backgroundColor: colors.forest,
  },
  miniDamaged: {
    height: '100%',
    backgroundColor: colors.danger,
  },
  tableDamagedValue: {
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  tableDamagedValueActive: {
    color: colors.danger,
  },
  detailPanel: {
    marginTop: 8,
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
  },
  detailPanelWide: {
    marginTop: 0,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 0,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    borderRadius: 0,
  },
  cancelBanner: {
    marginBottom: 10,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.sm,
  },
  cancelBannerCopy: {
    flex: 1,
  },
  cancelBannerTitle: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '700',
  },
  cancelBannerMeta: {
    marginTop: 2,
    color: colors.inkFaint,
    fontSize: 11.5,
    lineHeight: 16,
  },
  detailHeader: {
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  detailTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailTitle: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '700',
  },
  detailCount: {
    color: colors.inkFaint,
    fontSize: 11,
  },
  lineRow: {
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  lineRowLast: {
    borderBottomWidth: 0,
  },
  lineCopy: {
    flex: 1,
  },
  lineDescription: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  lineMeta: {
    marginTop: 2,
    color: colors.inkFaint,
    fontSize: 12,
    lineHeight: 17,
  },
  lineRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  lineReceived: {
    color: colors.forest,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  lineOrdered: {
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: '600',
  },
  damagePill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.pill,
  },
  damagePillText: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: '700',
  },
  detailNote: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailNoteText: {
    flex: 1,
    color: colors.inkFaint,
    fontSize: 11.5,
    lineHeight: 16,
  },
  skeletonWrap: {
    marginTop: 22,
    gap: 9,
  },
  skeletonLabel: {
    color: colors.inkFaint,
    fontSize: 11,
    fontWeight: '600',
  },
  skeletonCard: {
    padding: 15,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    gap: 10,
  },
  skeletonTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  skeletonTitle: {
    width: '45%',
    height: 16,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 6,
  },
  skeletonPill: {
    width: 64,
    height: 22,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
  },
  skeletonMeta: {
    width: '70%',
    height: 11,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 6,
  },
  skeletonTrack: {
    width: '100%',
    height: 7,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
  },
  skeletonMetrics: {
    width: '85%',
    height: 12,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 6,
  },
  stateCard: {
    marginTop: 22,
    padding: 24,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
  },
  stateIcon: {
    width: 44,
    height: 44,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
  },
  stateIconDanger: {
    backgroundColor: colors.dangerSoft,
  },
  stateTitle: {
    marginTop: 10,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  stateBody: {
    maxWidth: 300,
    marginTop: 4,
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  stateButton: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: colors.sage,
    borderRadius: radii.pill,
  },
  stateButtonText: {
    color: colors.forest,
    fontSize: 11,
    fontWeight: '700',
  },
  emptyState: {
    marginTop: 11,
    padding: 24,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyBody: {
    maxWidth: 300,
    marginTop: 4,
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: colors.sage,
    borderRadius: radii.pill,
  },
  emptyButtonText: {
    color: colors.forest,
    fontSize: 11,
    fontWeight: '700',
  },
  footnote: {
    marginTop: 18,
    color: colors.inkFaint,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  signOutRow: {
    marginTop: 18,
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
    fontSize: 12,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.88,
  },
});
