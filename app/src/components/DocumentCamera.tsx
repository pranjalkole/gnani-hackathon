import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScanStatePanel } from '@/components/ScanStatePanel';
import { getOcrAvailability, recognizeText, type OcrAvailability } from '@/lib/ocr';
import { colors, radii } from '@/theme';

type OcrStatus = 'checking' | OcrAvailability;

type DocumentCameraProps = {
  onExtracted: (result: { uri: string; lines: string[] }) => void;
  onCancel: () => void;
  instruction?: string;
  readingLabel?: string;
  unavailableBody?: string;
};

export function DocumentCamera({
  onExtracted,
  onCancel,
  instruction = 'Fill the frame with the page',
  readingLabel = 'Reading the page…',
  unavailableBody,
}: DocumentCameraProps) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [availability, setAvailability] = useState<OcrStatus>('checking');
  const [cameraReady, setCameraReady] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void getOcrAvailability()
      .then((result) => {
        if (active) {
          setAvailability(result);
        }
      })
      .catch(() => {
        if (active) {
          setAvailability('missing-native-module');
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const handleCapture = async () => {
    if (availability !== 'ready' || !cameraRef.current || !cameraReady || isBusy) {
      return;
    }

    setIsBusy(true);
    setScanError(null);

    try {
      const picture = await cameraRef.current.takePictureAsync({ quality: 0.8 });

      if (!picture) {
        throw new Error('The camera did not return an image.');
      }

      const lines = await recognizeText(picture.uri);

      setIsBusy(false);
      onExtracted({ uri: picture.uri, lines });
    } catch {
      setIsBusy(false);
      setScanError('Could not read this page. Hold the note flat, fill the frame, and try again.');
    }
  };

  const handlePermissionAction = async () => {
    if (permission && !permission.canAskAgain) {
      await Linking.openSettings();
      return;
    }

    await requestPermission();
  };

  if (availability === 'checking') {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={colors.forest} />
        <Text style={styles.loadingText}>Checking device support…</Text>
      </View>
    );
  }

  if (availability === 'missing-native-module' || availability === 'unsupported') {
    const isMissing = availability === 'missing-native-module';

    return (
      <ScanStatePanel
        icon={isMissing ? 'construct-outline' : 'phone-portrait-outline'}
        title={isMissing ? 'Scanner unavailable' : 'Device not supported'}
        body={
          unavailableBody ??
          (isMissing
            ? "Text recognition isn't available in this version of the app. Try again on a supported Android or iOS device."
            : "On-device text recognition isn't available on this device.")
        }
        footnote="Recognition runs entirely on the device with Google ML Kit on Android and Apple Vision on iOS."
        actionLabel="Back to dashboard"
        onAction={onCancel}
      />
    );
  }

  if (!permission) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={colors.forest} />
        <Text style={styles.loadingText}>Checking camera access…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <ScanStatePanel
        icon="camera-outline"
        title="Camera access needed"
        body="Crewline uses the camera only to capture the document you want to scan. Photos are processed on this device and never uploaded."
        actionLabel={permission.canAskAgain ? 'Allow camera access' : 'Open settings'}
        onAction={() => void handlePermissionAction()}
      />
    );
  }

  return (
    <View style={styles.cameraStage}>
      <View style={styles.cameraFrame}>
        <CameraView
          ref={cameraRef}
          facing="back"
          mode="picture"
          enableTorch={torchOn}
          style={StyleSheet.absoluteFill}
          onCameraReady={() => setCameraReady(true)}
        />

        <View pointerEvents="none" style={styles.frameOverlay}>
          <View style={[styles.corner, styles.cornerTopLeft]} />
          <View style={[styles.corner, styles.cornerTopRight]} />
          <View style={[styles.corner, styles.cornerBottomLeft]} />
          <View style={[styles.corner, styles.cornerBottomRight]} />

          <View style={styles.cameraHint}>
            <Ionicons name="scan-outline" size={14} color={colors.white} />
            <Text style={styles.cameraHintText}>{instruction}</Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={torchOn ? 'Turn off torch' : 'Turn on torch'}
          accessibilityState={{ selected: torchOn }}
          onPress={() => setTorchOn((current) => !current)}
          style={({ pressed }) => [
            styles.torchButton,
            torchOn && styles.torchButtonOn,
            pressed && styles.torchButtonPressed,
          ]}
        >
          <Ionicons
            name={torchOn ? 'flash' : 'flash-outline'}
            size={20}
            color={colors.white}
          />
        </Pressable>

        {isBusy ? (
          <View style={styles.busyOverlay}>
            <View style={styles.busyPanel}>
              <ActivityIndicator color={colors.white} />
              <Text style={styles.busyText}>{readingLabel}</Text>
              <Text style={styles.busySubtext}>Reading on this device</Text>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.captureBlock}>
        {scanError ? (
          <View style={styles.scanError}>
            <Ionicons name="alert-circle-outline" size={17} color={colors.danger} />
            <Text style={styles.scanErrorText}>{scanError}</Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Capture document"
          accessibilityState={{ disabled: !cameraReady || isBusy }}
          disabled={!cameraReady || isBusy}
          onPress={() => void handleCapture()}
          style={({ pressed }) => [
            styles.shutter,
            (!cameraReady || isBusy) && styles.buttonDisabled,
            pressed && styles.shutterPressed,
          ]}
        >
          <View style={styles.shutterInner}>
            {isBusy ? <ActivityIndicator size="small" color={colors.white} /> : null}
          </View>
        </Pressable>

        <Text style={styles.captureHint}>Hold steady · tap to capture</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingBottom: 60,
  },
  loadingText: {
    color: colors.inkSoft,
    fontSize: 13,
    fontWeight: '600',
  },
  cameraStage: {
    flex: 1,
  },
  cameraFrame: {
    flex: 1,
    minHeight: 260,
    overflow: 'hidden',
    backgroundColor: colors.cameraBackground,
    borderRadius: radii.lg,
  },
  torchButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cameraOverlay,
    borderRadius: radii.pill,
  },
  torchButtonOn: {
    backgroundColor: colors.accent,
  },
  torchButtonPressed: {
    opacity: 0.8,
  },
  frameOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: colors.accent,
  },
  cornerTopLeft: {
    top: 16,
    left: 16,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 10,
  },
  cornerTopRight: {
    top: 16,
    right: 16,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 10,
  },
  cornerBottomLeft: {
    bottom: 16,
    left: 16,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 10,
  },
  cornerBottomRight: {
    bottom: 16,
    right: 16,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 10,
  },
  cameraHint: {
    position: 'absolute',
    top: 18,
    alignSelf: 'center',
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 12,
    backgroundColor: colors.cameraOverlay,
    borderRadius: radii.pill,
  },
  cameraHintText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
  busyOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cameraOverlayStrong,
  },
  busyPanel: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
    paddingHorizontal: 26,
    backgroundColor: colors.cameraOverlay,
    borderRadius: radii.md,
  },
  busyText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  busySubtext: {
    color: colors.onForestMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  scanError: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.sm,
  },
  scanErrorText: {
    flex: 1,
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18,
  },
  captureBlock: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 10,
    gap: 12,
  },
  shutter: {
    width: 74,
    height: 74,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.sage,
    borderRadius: radii.pill,
    shadowColor: colors.forest,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 4,
  },
  shutterPressed: {
    transform: [{ scale: 0.96 }],
  },
  shutterInner: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.forest,
    borderRadius: radii.pill,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  captureHint: {
    color: colors.inkFaint,
    fontSize: 11,
    fontWeight: '600',
  },
});
