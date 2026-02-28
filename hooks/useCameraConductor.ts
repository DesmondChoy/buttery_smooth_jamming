import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { type CameraDirectivePayload } from '@/lib/types';

interface UseCameraConductorOptions {
  enabled: boolean;
  canSendDirectives: boolean;
  isJamming: boolean;
  onVisionPayload: (payload: CameraDirectivePayload) => void;
}

interface UseCameraConductorReturn {
  isReady: boolean;
  isStreaming: boolean;
  lastSampleAtMs: number | null;
  error: string | null;
}

type FaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type FaceDetection = {
  box?: FaceBox;
};

type FaceDetectorLike = {
  detect: (input: HTMLVideoElement) => Promise<FaceDetection[]>;
};

type FaceDetectorCtor = new (options: {
  fastMode: boolean;
  maxDetectedFaces: number;
}) => FaceDetectorLike;

interface WindowWithFaceDetector extends Window {
  FaceDetector?: FaceDetectorCtor;
}

type FaceFrameState = {
  present: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  motion: number;
  areaRatio: number;
  stability: number;
};

const DEFAULT_SAMPLE_INTERVAL_MS = 400;
const DEFAULT_COOLDOWN_MS = 1200;
const ANALYSIS_CANVAS_WIDTH = 160;
const ANALYSIS_CANVAS_HEIGHT = 120;
const MOTION_EVENT_THRESHOLD = 0.01;
const FACE_EVENT_THRESHOLD = 0.03;
const FACE_DETECT_INTERVAL_MS = 600;
const MAX_SAMPLE_INTERVAL_MS = 10_000;
const MAX_DIMENSION = 480;
const MIN_DELTA_FOR_MOTION = 0.02;
const MOTION_STABLE_FRAME_COUNT = 3;
const MOTION_HOLD_DURATION_MS = 280;

function toClampedDecimal(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function createFrameCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function extractFaceState(
  rawDetections: unknown,
  videoWidth: number,
  videoHeight: number,
  previousBox: FaceBox | null
): FaceFrameState | null {
  if (!Array.isArray(rawDetections) || rawDetections.length === 0) {
    return null;
  }

  const first = rawDetections[0];
  if (!first || typeof first !== 'object') {
    return null;
  }

  const rawBox = (first as { box?: unknown }).box;
  if (!rawBox || typeof rawBox !== 'object') return null;

  const box = rawBox as FaceBox;
  if (
    typeof box.x !== 'number' || typeof box.y !== 'number' ||
    typeof box.width !== 'number' || typeof box.height !== 'number'
  ) {
    return null;
  }

  const safeVideoArea = Math.max(1, videoWidth * videoHeight);
  const currentArea = Math.max(0, box.width * box.height);
  const areaRatio = Math.max(0, Math.min(1, currentArea / safeVideoArea));

  const diagonal = Math.sqrt(videoWidth * videoWidth + videoHeight * videoHeight) || 1;
  const prev = previousBox;
  const travel = prev
    ? Math.sqrt(
      Math.pow(box.x - prev.x, 2)
      + Math.pow(box.y - prev.y, 2)
    ) / diagonal
    : 0;
  const previousArea = prev ? Math.max(0, prev.width * prev.height) : 0;
  const areaShift = previousArea > 0
    ? Math.abs(currentArea - previousArea) / Math.max(1, previousArea)
    : 0;
  const stability = 1 - Math.min(1, travel + areaShift * 0.5);

  const safeVideoWidth = Math.max(1, videoWidth);
  const safeVideoHeight = Math.max(1, videoHeight);

  return {
    present: true,
    x: toClampedDecimal(box.x / safeVideoWidth),
    y: toClampedDecimal(box.y / safeVideoHeight),
    width: toClampedDecimal(box.width / safeVideoWidth),
    height: toClampedDecimal(box.height / safeVideoHeight),
    motion: Math.max(0, Math.min(1, travel)),
    areaRatio: toClampedDecimal(areaRatio),
    stability: Math.max(0, Math.min(1, stability)),
  };
}

export function useCameraConductor(
  options: UseCameraConductorOptions
): UseCameraConductorReturn {
  const {
    enabled,
    canSendDirectives,
    isJamming,
    onVisionPayload,
  } = options;

  const [isReady, setIsReady] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSampleAtMs, setLastSampleAtMs] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastAnalyzedRef = useRef<number>(0);
  const lastSentAtRef = useRef<number>(0);
  const previousFrameRef = useRef<Uint8ClampedArray | null>(null);
  const faceDetectorRef = useRef<FaceDetectorLike | null>(null);
  const faceDetectDueMsRef = useRef<number>(0);
  const faceDetectInFlightRef = useRef<boolean>(false);
  const faceStateRef = useRef<FaceFrameState | null>(null);
  const lastFaceBoxRef = useRef<FaceBox | null>(null);
  const triggerFrameCountRef = useRef<number>(0);
  const triggerStartMsRef = useRef<number>(0);
  const triggerEmittedRef = useRef<boolean>(false);
  const captureStateRef = useRef({
    enabled: false,
    isJamming: false,
    canSendDirectives: false,
  });

  useEffect(() => {
    captureStateRef.current = {
      enabled,
      isJamming,
      canSendDirectives,
    };
  }, [enabled, isJamming, canSendDirectives]);

  const destroy = useCallback(() => {
    setIsReady(false);
    setIsStreaming(false);
    setError(null);
    setLastSampleAtMs(null);

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.onloadedmetadata = null;
      videoRef.current.onended = null;
      videoRef.current = null;
    }

    canvasRef.current = null;
    ctxRef.current = null;
    previousFrameRef.current = null;
    faceStateRef.current = null;
    lastFaceBoxRef.current = null;
    faceDetectorRef.current = null;
    lastAnalyzedRef.current = 0;
    lastSentAtRef.current = 0;
    triggerFrameCountRef.current = 0;
    triggerStartMsRef.current = 0;
    triggerEmittedRef.current = false;
    faceDetectDueMsRef.current = 0;
    faceDetectInFlightRef.current = false;
  }, []);

  const buildVisionPayload = useCallback((args: {
    width: number;
    height: number;
    motionScore: number;
    isStale: boolean;
    left: number;
    right: number;
    top: number;
    bottom: number;
    centroidX: number;
    centroidY: number;
    maxDelta: number;
    motionIntervalMs: number;
    face?: FaceFrameState | null;
  }): CameraDirectivePayload => {
    const sampleAt = Date.now();
    const width = args.width || ANALYSIS_CANVAS_WIDTH;
    const height = args.height || ANALYSIS_CANVAS_HEIGHT;

    return {
      sample: {
        capturedAtMs: sampleAt,
        sampleIntervalMs: args.motionIntervalMs,
        frameWidth: width,
        frameHeight: height,
        isStale: args.isStale,
        motion: {
          score: toClampedDecimal(args.motionScore),
          left: toClampedDecimal(args.left),
          right: toClampedDecimal(args.right),
          top: toClampedDecimal(args.top),
          bottom: toClampedDecimal(args.bottom),
          centroidX: toClampedDecimal(args.centroidX),
          centroidY: toClampedDecimal(args.centroidY),
          maxDelta: toClampedDecimal(args.maxDelta),
        },
        ...(args.face
          ? {
            face: {
              present: Boolean(args.face.present),
              box: {
                x: toClampedDecimal(args.face.x),
                y: toClampedDecimal(args.face.y),
                width: toClampedDecimal(args.face.width),
                height: toClampedDecimal(args.face.height),
              },
              motion: toClampedDecimal(args.face.motion),
              areaRatio: toClampedDecimal(args.face.areaRatio),
              stability: toClampedDecimal(args.face.stability),
            },
          }
          : {
            face: {
              present: false,
              motion: 0,
              areaRatio: 0,
              stability: 1,
            },
          }),
      },
    };
  }, []);

  const detectFace = useCallback((video: HTMLVideoElement, frameWidth: number, frameHeight: number) => {
    const FaceDetectorCtor = (window as WindowWithFaceDetector).FaceDetector;
    if (!FaceDetectorCtor) {
      faceStateRef.current = null;
      lastFaceBoxRef.current = null;
      return;
    }

    if (!faceDetectorRef.current) {
      try {
        faceDetectorRef.current = new FaceDetectorCtor({
          fastMode: true,
          maxDetectedFaces: 1,
        });
      } catch {
        faceStateRef.current = null;
        lastFaceBoxRef.current = null;
        return;
      }
    }

    if (!faceDetectorRef.current) return;
    faceDetectInFlightRef.current = true;

    faceDetectorRef.current.detect(video)
      .then((rawDetections) => {
        const latestFace = extractFaceState(rawDetections, frameWidth, frameHeight, lastFaceBoxRef.current);
        faceStateRef.current = latestFace;
        if (latestFace) {
          const normalizedToVideoWidth = Math.max(1, frameWidth);
          const normalizedToVideoHeight = Math.max(1, frameHeight);
          lastFaceBoxRef.current = {
            x: latestFace.x * normalizedToVideoWidth,
            y: latestFace.y * normalizedToVideoHeight,
            width: latestFace.width * normalizedToVideoWidth,
            height: latestFace.height * normalizedToVideoHeight,
          };
        } else {
          lastFaceBoxRef.current = null;
        }
      })
      .catch(() => {
        faceStateRef.current = null;
        lastFaceBoxRef.current = null;
      })
      .finally(() => {
        faceDetectInFlightRef.current = false;
      });
  }, []);

  const analyzeFrame = useCallback(function analyzeFrame(nowMs: number): void {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const { enabled: activeEnabled, isJamming: activeIsJamming, canSendDirectives: activeCanSendDirectives } = captureStateRef.current;
    const canCapture = activeEnabled && activeIsJamming && activeCanSendDirectives;

    if (!canCapture || !video || !canvas || !ctx || !video.videoWidth || !video.videoHeight) {
      if (!canCapture) {
        return;
      }
      rafRef.current = requestAnimationFrame(analyzeFrame);
      return;
    }

    const rawSampleMs = nowMs - lastAnalyzedRef.current;
    const isStaleSample = rawSampleMs > MAX_SAMPLE_INTERVAL_MS;
    const sampleMs = Math.min(rawSampleMs, MAX_SAMPLE_INTERVAL_MS);
    if (sampleMs < DEFAULT_SAMPLE_INTERVAL_MS) {
      rafRef.current = requestAnimationFrame(analyzeFrame);
      return;
    }
    lastAnalyzedRef.current = nowMs;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const currentFrame = imageData.data;
    const previousFrame = previousFrameRef.current;

    let payload: CameraDirectivePayload;
    let shouldDispatch = false;

    if (!previousFrame || previousFrame.length !== currentFrame.length) {
      previousFrameRef.current = new Uint8ClampedArray(currentFrame);
      rafRef.current = requestAnimationFrame(analyzeFrame);
      return;
    }

    const pixelCount = currentFrame.length / 4;
    let motionScore = 0;
    let left = 0;
    let right = 0;
    let top = 0;
    let bottom = 0;
    let centroidXSum = 0;
    let centroidYSum = 0;
    let centroidWeight = 0;
    let maxDelta = 0;
    let changedPixelCount = 0;

    for (let i = 0; i < currentFrame.length; i += 4) {
      const idx = i / 4;
      const x = idx % canvas.width;
      const y = Math.floor(idx / canvas.width);

      const currentGray = (
        currentFrame[i] * 0.299 +
        currentFrame[i + 1] * 0.587 +
        currentFrame[i + 2] * 0.114
      ) / 255;
      const previousGray = (
        previousFrame[i] * 0.299 +
        previousFrame[i + 1] * 0.587 +
        previousFrame[i + 2] * 0.114
      ) / 255;

      const delta = Math.abs(currentGray - previousGray);
      if (delta < MIN_DELTA_FOR_MOTION) continue;

      changedPixelCount += 1;
      motionScore += delta;
      maxDelta = Math.max(maxDelta, delta);

      if (x < canvas.width / 2) {
        left += 1;
      } else {
        right += 1;
      }

      if (y < canvas.height / 2) {
        top += 1;
      } else {
        bottom += 1;
      }

      centroidXSum += (x / canvas.width) * delta;
      centroidYSum += (y / canvas.height) * delta;
      centroidWeight += delta;
    }

    previousFrameRef.current = new Uint8ClampedArray(currentFrame);

    const changedRegionCount = changedPixelCount || 1;
    if (changedPixelCount > 0) {
      const normalized = centroidWeight > 0
        ? { x: centroidXSum / centroidWeight, y: centroidYSum / centroidWeight }
        : { x: 0.5, y: 0.5 };

      const currentFace = faceStateRef.current;

      const triggerForMovement = (motionScore / pixelCount) >= MOTION_EVENT_THRESHOLD;
      const triggerForFace = currentFace?.present === true && currentFace.motion >= FACE_EVENT_THRESHOLD;

      const triggerActive = triggerForMovement || triggerForFace;
      if (triggerActive) {
        if (triggerFrameCountRef.current === 0) {
          triggerStartMsRef.current = nowMs;
        }
        triggerFrameCountRef.current = Math.min(
          MOTION_STABLE_FRAME_COUNT,
          triggerFrameCountRef.current + 1
        );

        const holdWindowMs = nowMs - triggerStartMsRef.current;
        if (
          !triggerEmittedRef.current
          && triggerFrameCountRef.current >= MOTION_STABLE_FRAME_COUNT
          && holdWindowMs >= MOTION_HOLD_DURATION_MS
          && nowMs - lastSentAtRef.current >= DEFAULT_COOLDOWN_MS
        ) {
          shouldDispatch = true;
        }
      } else {
        triggerFrameCountRef.current = 0;
        triggerStartMsRef.current = 0;
        triggerEmittedRef.current = false;
      }

      payload = buildVisionPayload({
        width: canvas.width,
        height: canvas.height,
        motionScore: motionScore / pixelCount,
        isStale: isStaleSample,
        left: changedRegionCount > 0 ? left / changedRegionCount : 0.25,
        right: changedRegionCount > 0 ? right / changedRegionCount : 0.25,
        top: changedRegionCount > 0 ? top / changedRegionCount : 0.25,
        bottom: changedRegionCount > 0 ? bottom / changedRegionCount : 0.25,
        centroidX: normalized.x,
        centroidY: normalized.y,
        maxDelta: toClampedDecimal(maxDelta),
        motionIntervalMs: sampleMs,
        face: currentFace,
      });
    } else {
      payload = buildVisionPayload({
        width: canvas.width,
        height: canvas.height,
        motionScore: 0,
        isStale: isStaleSample,
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        centroidX: 0.5,
        centroidY: 0.5,
        maxDelta: 0,
        motionIntervalMs: sampleMs,
        face: null,
      });
    }

    if (isJamming && canSendDirectives && shouldDispatch) {
      lastSentAtRef.current = nowMs;
      setLastSampleAtMs(Date.now());
      triggerEmittedRef.current = true;
      onVisionPayload(payload);
    }

    if (nowMs >= faceDetectDueMsRef.current && !faceDetectInFlightRef.current && canCapture) {
      faceDetectDueMsRef.current = nowMs + FACE_DETECT_INTERVAL_MS;
      detectFace(video, video.videoWidth, video.videoHeight);
    }

    rafRef.current = requestAnimationFrame(analyzeFrame);
  }, [
    buildVisionPayload,
    canSendDirectives,
    isJamming,
    detectFace,
    onVisionPayload,
  ]);

  useEffect(() => {
    if (!enabled || !isJamming || !canSendDirectives) {
      destroy();
      return;
    }

    let isActive = true;
    const isCaptureSessionAlive = (): boolean => (
      isActive
      && enabled
      && isJamming
      && videoRef.current !== null
    );

    setError(null);
    setIsReady(false);
    setIsStreaming(false);
    previousFrameRef.current = null;
    lastSentAtRef.current = 0;
    lastAnalyzedRef.current = 0;
    lastFaceBoxRef.current = null;
    faceStateRef.current = null;

    const video = document.createElement('video');
    const canvas = createFrameCanvas(
      ANALYSIS_CANVAS_WIDTH,
      ANALYSIS_CANVAS_HEIGHT
    );
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) {
      setError('Failed to initialize camera analysis canvas.');
      destroy();
      return;
    }

    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    videoRef.current = video;
    canvasRef.current = canvas;
    ctxRef.current = ctx;

    const constraints: MediaStreamConstraints = {
      video: {
        width: { ideal: MAX_DIMENSION },
        height: { ideal: 360 },
        frameRate: { ideal: 24 },
        facingMode: 'user',
      },
      audio: false,
    };

    const onStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!isCaptureSessionAlive()) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        video.srcObject = stream;

        const startAnalyzing = () => {
          if (!isCaptureSessionAlive()) return;
          setIsReady(true);
          setIsStreaming(true);
          lastAnalyzedRef.current = performance.now();
          rafRef.current = requestAnimationFrame(analyzeFrame);
        };

        video.onloadedmetadata = () => {
          void video.play().catch(() => {});
          startAnalyzing();
        };
        video.onended = () => {
          destroy();
        };
      } catch (err) {
        if (!isCaptureSessionAlive()) return;
        const message = err instanceof Error ? err.message : 'Camera access denied.';
        setError(message);
        setIsReady(false);
        setIsStreaming(false);
      }
    };

    void onStream();

    return () => {
      isActive = false;
      destroy();
    };
  }, [
    analyzeFrame,
    destroy,
    enabled,
    canSendDirectives,
    isJamming,
  ]);

  return {
    isReady,
    isStreaming,
    lastSampleAtMs,
    error,
  };
}
