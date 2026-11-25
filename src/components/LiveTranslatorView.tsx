import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Language,
  User,
  VisionTranslationResult,
  VoiceTranslationTurn,
} from '../types';
import {
  SUPPORTED_LANGUAGES,
  getLanguageEnglishName,
  useUiTranslation,
} from '../hooks/useTranslatedContent';
import { apiFetch } from '../utils/sessionClient';
import {
  Camera,
  CameraOff,
  Mic,
  Square,
  Volume2,
  VolumeX,
  RefreshCw,
  Upload,
  Scan,
  ArrowLeftRight,
  Loader2,
  Send,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  MessageSquare,
  UtensilsCrossed,
  Signpost,
  Radio,
  Lock,
} from 'lucide-react';

interface LiveTranslatorViewProps {
  currentLang: Language;
  user?: User | null;
  onOpenSignIn?: () => void;
}

type TranslatorSubMode = 'camera' | 'voice';
type VisionMode = 'auto' | 'menu' | 'sign';
type GeminiVoiceName = 'Kore' | 'Zephyr' | 'Puck' | 'Charon' | 'Fenrir';

const GEMINI_VOICES: { id: GeminiVoiceName; label: string }[] = [
  { id: 'Kore', label: 'Kore (Warm)' },
  { id: 'Zephyr', label: 'Zephyr (Bright)' },
  { id: 'Puck', label: 'Puck (Friendly)' },
  { id: 'Charon', label: 'Charon (Deep)' },
];

const SURVIVAL_PHRASES = [
  {
    id: 'sp-bill',
    greek: 'Τον λογαριασμό, παρακαλώ.',
    phonetic: 'Ton lo-gar-yaz-MO, pa-ra-ka-LO',
    en: 'The bill, please.',
    ar: 'الحساب من فضلك.',
    el: 'Τον λογαριασμό, παρακαλώ.',
  },
  {
    id: 'sp-no-pork',
    greek: 'Έχει χοιρινό αυτό το πιάτο;',
    phonetic: 'E-hee hee-ree-NO af-TO to PYA-to?',
    en: 'Does this dish contain pork?',
    ar: 'هل يحتوي هذا الطبق على لحم خنزير؟',
    el: 'Έχει χοιρινό αυτό το πιάτο;',
  },
  {
    id: 'sp-table',
    greek: 'Ένα τραπέζι για δύο, παρακαλώ.',
    phonetic: 'E-na tra-PE-zee ya THEE-o, pa-ra-ka-LO',
    en: 'A table for two, please.',
    ar: 'طاولة لشخصين، من فضلك.',
    el: 'Ένα τραπέζι για δύο, παρακαλώ.',
  },
  {
    id: 'sp-water',
    greek: 'Ένα μεγάλο εμφιαλωμένο νερό, παρακαλώ.',
    phonetic: 'E-na me-GA-lo em-fya-lo-ME-no ne-RO',
    en: 'A large bottled water, please.',
    ar: 'زجاجة ماء كبيرة من فضلك.',
    el: 'Ένα μεγάλο εμφιαλωμένο νερό, παρακαλώ.',
  },
  {
    id: 'sp-port',
    greek: 'Πού είναι το λιμάνι ή το μετρό;',
    phonetic: 'Poo EE-ne to lee-MA-nee ee to me-TRO?',
    en: 'Where is the port or metro station?',
    ar: 'أين يقع الميناء أو محطة المترو؟',
    el: 'Πού είναι το λιμάνι ή το μετρό;',
  },
  {
    id: 'sp-thanks',
    greek: 'Ευχαριστώ πάρα πολύ! Ήταν εξαιρετικό.',
    phonetic: 'Ef-ha-ree-STO PA-ra po-LEE!',
    en: 'Thank you very much! It was delicious.',
    ar: 'شكراً جزيلاً! كان الطعام رائعاً.',
    el: 'Ευχαριστώ πάρα πολύ! Ήταν εξαιρετικό.',
  },
];

const HISTORY_STORAGE_KEY = 'aegea_translator_history_v1';

function cleanApiError(rawError: any, fallback: string): string {
  const msg = String(rawError || '').trim();
  if (!msg) return fallback;
  try {
    if (msg.startsWith('{')) {
      const parsed = JSON.parse(msg);
      const inner = parsed?.error?.message || parsed?.error;
      if (typeof inner === 'string' && inner.trim()) return inner.trim();
    }
  } catch {
    // ignore nested JSON parse errors
  }
  return msg.length > 260 ? fallback : msg;
}

async function postJsonSafe<T>(endpoint: string, bodyObj: any, fallbackMsg: string): Promise<T> {
  const payload = JSON.stringify(bodyObj);

  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 50000);
    try {
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: payload,
        signal: controller.signal,
      });

      const rawText = await res.text();
      const trimmed = rawText.trim();
      let parsedJson: any = null;
      try {
        parsedJson = trimmed && !trimmed.startsWith('<') ? JSON.parse(trimmed) : null;
      } catch {
        parsedJson = null;
      }

      const rawErr = String(parsedJson?.error || '');
      const isTransient =
        trimmed.startsWith('<') ||
        res.status === 502 ||
        res.status === 503 ||
        res.status === 504 ||
        /timed out|high demand|overloaded|cooling down/i.test(rawErr);

      if (isTransient && attempt < 2) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }

      if (!parsedJson && trimmed) {
        throw new Error(fallbackMsg);
      }

      const data = parsedJson || {};
      if (!res.ok) {
        throw new Error(cleanApiError(data?.error, fallbackMsg));
      }

      return data as T;
    } catch (err: any) {
      if (attempt < 2 && (err?.name === 'AbortError' || /failed to fetch|networkerror/i.test(String(err?.message || '')))) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      throw err;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw new Error(fallbackMsg);
}

function encodeMonoWav(samples: Float32Array, sampleRate: number): Blob {
  const dataLength = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (val) => {
        window.clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function blobToCompactAudioDataUrl(
  blob: Blob,
  fallbackMime: string
): Promise<{ dataUrl: string; mimeType: string }> {
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (AudioCtx && typeof OfflineAudioContext !== 'undefined') {
    let tempCtx: AudioContext | null = null;
    try {
      const arrayBuf = await blob.arrayBuffer();
      tempCtx = new AudioCtx();
      const decoded = await withTimeout(
        tempCtx.decodeAudioData(arrayBuf.slice(0)),
        2500,
        'decodeAudioData'
      );
      const targetRate = 16000;
      const frameCount = Math.max(1, Math.ceil(decoded.duration * targetRate));
      const offline = new OfflineAudioContext(1, frameCount, targetRate);

      // Mix all channels into mono BufferSource for reliable transcription
      const monoBuffer = offline.createBuffer(1, decoded.length, decoded.sampleRate);
      const monoOut = monoBuffer.getChannelData(0);
      const chCount = decoded.numberOfChannels;
      for (let c = 0; c < chCount; c++) {
        const chData = decoded.getChannelData(c);
        for (let i = 0; i < decoded.length; i++) {
          monoOut[i] += chData[i] / chCount;
        }
      }

      const source = offline.createBufferSource();
      source.buffer = monoBuffer;
      source.connect(offline.destination);
      source.start(0);
      const rendered = await withTimeout(offline.startRendering(), 2500, 'offlineRender');
      const wavBlob = encodeMonoWav(rendered.getChannelData(0), targetRate);
      const wavDataUrl = await readBlobAsDataUrl(wavBlob);
      if (wavDataUrl) {
        return { dataUrl: wavDataUrl, mimeType: 'audio/wav' };
      }
    } catch {
      // Fallback to raw MediaRecorder blob if decodeAudioData fails or times out
    } finally {
      if (tempCtx) {
        tempCtx.close().catch(() => {});
      }
    }
  }

  const rawDataUrl = await readBlobAsDataUrl(blob);
  return { dataUrl: rawDataUrl, mimeType: fallbackMime || 'audio/webm' };
}

async function resizeImageDataUrl(dataUrl: string, maxWidth = 1280): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export const LiveTranslatorView: React.FC<LiveTranslatorViewProps> = ({
  currentLang,
  user,
  onOpenSignIn,
}) => {
  const { t } = useUiTranslation(currentLang);
  const tr = t.translator;
  const hasTranslatorAccess = Boolean(user?.isAdmin || user?.isPremium);

  const [subMode, setSubMode] = useState<TranslatorSubMode>('camera');

  // Camera & Vision state
  const [visionMode, setVisionMode] = useState<VisionMode>('auto');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [autoScan, setAutoScan] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [previewSnapshot, setPreviewSnapshot] = useState<string | null>(null);
  const [visionResult, setVisionResult] = useState<VisionTranslationResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isScanningRef = useRef(false);

  // Voice & Conversation state
  const defaultVisitorLang =
    currentLang.trim().toLowerCase() === 'el' ? 'en' : currentLang.trim().toLowerCase() || 'en';
  const [visitorLang, setVisitorLang] = useState<string>(defaultVisitorLang);
  const [localLang, setLocalLang] = useState<string>('el');
  const [selectedVoice, setSelectedVoice] = useState<GeminiVoiceName>('Kore');
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [autoStopSilence, setAutoStopSilence] = useState(true);

  const [recordingSpeaker, setRecordingSpeaker] = useState<'visitor' | 'local' | null>(null);
  const [audioLevels, setAudioLevels] = useState<number[]>(() => new Array(14).fill(15));
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [quickTextInput, setQuickTextInput] = useState('');
  const [turns, setTurns] = useState<VoiceTranslationTurn[]>(() => {
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as VoiceTranslationTurn[]) : [];
    } catch {
      return [];
    }
  });

  // TTS audio playback state
  const [playingTtsId, setPlayingTtsId] = useState<string | null>(null);
  const [loadingTtsId, setLoadingTtsId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const audioElemRef = useRef<HTMLAudioElement | null>(null);
  const audioObjectUrlRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const meterTimerRef = useRef<number | null>(null);
  const maxRecordTimerRef = useRef<number | null>(null);

  // Keep visitor language aligned when user switches app UI language (unless set to Greek)
  useEffect(() => {
    const norm = currentLang.trim().toLowerCase();
    if (norm && norm !== 'el') {
      setVisitorLang(norm);
    }
  }, [currentLang]);

  // Persist voice conversation history
  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(turns.slice(0, 40)));
    } catch {
      // ignore quota errors
    }
  }, [turns]);

  const stopTtsPlayback = useCallback(() => {
    if (audioElemRef.current) {
      audioElemRef.current.pause();
      audioElemRef.current.src = '';
      audioElemRef.current = null;
    }
    if (audioObjectUrlRef.current) {
      URL.revokeObjectURL(audioObjectUrlRef.current);
      audioObjectUrlRef.current = null;
    }
    setPlayingTtsId(null);
  }, []);

  const playGeminiTts = useCallback(
    async (text: string, languageCode: string, itemId: string) => {
      const clean = String(text || '').trim();
      if (!clean) return;

      if (playingTtsId === itemId) {
        stopTtsPlayback();
        return;
      }

      stopTtsPlayback();
      setLoadingTtsId(itemId);
      setCameraError(null);
      setVoiceError(null);

      try {
        const data = await postJsonSafe<{ audioBase64?: string; mimeType?: string; error?: string }>(
          '/api/tts',
          {
            text: clean,
            language: getLanguageEnglishName(languageCode),
            voiceName: selectedVoice,
          },
          'Could not generate Gemini speech audio.'
        );
        if (!data?.audioBase64) {
          throw new Error(data?.error || 'Could not generate Gemini speech audio.');
        }

        const binaryStr = window.atob(data.audioBase64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const wavBlob = new Blob([bytes], { type: data.mimeType || 'audio/wav' });
        const objectUrl = URL.createObjectURL(wavBlob);
        audioObjectUrlRef.current = objectUrl;

        const audio = new Audio(objectUrl);
        audioElemRef.current = audio;
        setLoadingTtsId(null);
        setPlayingTtsId(itemId);

        audio.onended = () => {
          stopTtsPlayback();
        };
        audio.onerror = () => {
          stopTtsPlayback();
        };
        await audio.play();
      } catch (err: any) {
        setLoadingTtsId(null);
        stopTtsPlayback();
        // Graceful fallback to native phone/browser SpeechSynthesis when offline or standalone APK
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          try {
            window.speechSynthesis.cancel();
            const utter = new SpeechSynthesisUtterance(clean);
            const code = String(languageCode || 'el').toLowerCase();
            utter.lang = code.startsWith('el')
              ? 'el-GR'
              : code.startsWith('ar')
              ? 'ar-EG'
              : code.startsWith('en')
              ? 'en-US'
              : code;
            utter.rate = 0.9;
            setPlayingTtsId(itemId);
            utter.onend = () => setPlayingTtsId(null);
            utter.onerror = () => setPlayingTtsId(null);
            window.speechSynthesis.speak(utter);
            return;
          } catch {
            // Fall through to error notice if speechSynthesis is unsupported
          }
        }
        const msg = err?.message || 'Speech playback failed.';
        if (subMode === 'camera') {
          setCameraError(msg);
        } else {
          setVoiceError(msg);
        }
      }
    },
    [playingTtsId, selectedVoice, stopTtsPlayback, subMode]
  );

  const stopCamera = useCallback(() => {
    setAutoScan(false);
    setIsCameraActive(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(
    async (requestedFacing: 'environment' | 'user' = facingMode) => {
      setCameraError(null);
      setPreviewSnapshot(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(tr.cameraPermissionError);
        return;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: requestedFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        streamRef.current = stream;
        setIsCameraActive(true);
        requestAnimationFrame(() => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
          }
        });
      } catch (err) {
        console.warn('Camera start error:', err);
        setIsCameraActive(false);
        setCameraError(tr.cameraPermissionError);
      }
    },
    [facingMode, tr.cameraPermissionError]
  );

  // Stop camera if user switches away from camera sub-mode or leaves view
  useEffect(() => {
    if (subMode !== 'camera') {
      stopCamera();
    }
  }, [subMode, stopCamera]);

  const cleanupRecordingResources = useCallback(() => {
    if (meterTimerRef.current) {
      window.clearInterval(meterTimerRef.current);
      meterTimerRef.current = null;
    }
    if (maxRecordTimerRef.current) {
      window.clearTimeout(maxRecordTimerRef.current);
      maxRecordTimerRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setAudioLevels(new Array(14).fill(15));
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
      stopTtsPlayback();
      cleanupRecordingResources();
    };
  }, [stopCamera, stopTtsPlayback, cleanupRecordingResources]);

  const sendImageToVision = useCallback(
    async (imageDataUrl: string, keepLiveCamera = false) => {
      if (isScanningRef.current) return;
      isScanningRef.current = true;
      setIsScanning(true);
      setCameraError(null);
      if (!keepLiveCamera) {
        setPreviewSnapshot(imageDataUrl);
      }

      try {
        const data = await postJsonSafe<{ result?: VisionTranslationResult; error?: string }>(
          '/api/vision-translate',
          {
            imageBase64: imageDataUrl,
            mimeType: 'image/jpeg',
            targetLanguage: getLanguageEnglishName(currentLang),
            mode: visionMode,
          },
          'Could not translate the captured image.'
        );
        if (!data?.result) {
          throw new Error(data?.error || 'Could not translate the captured image.');
        }
        setVisionResult(data.result as VisionTranslationResult);
      } catch (err: any) {
        setCameraError(err?.message || 'Vision translation failed.');
      } finally {
        isScanningRef.current = false;
        setIsScanning(false);
      }
    },
    [currentLang, visionMode]
  );

  const captureFromVideoAndTranslate = useCallback(
    async (isAutoCycle = false) => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth) return;

      const maxW = 1280;
      const scale = video.videoWidth > maxW ? maxW / video.videoWidth : 1;
      const w = Math.max(1, Math.round(video.videoWidth * scale));
      const h = Math.max(1, Math.round(video.videoHeight * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      await sendImageToVision(dataUrl, isAutoCycle);
    },
    [sendImageToVision]
  );

  // Real-Time Auto-Scan interval when enabled
  useEffect(() => {
    if (!isCameraActive || !autoScan || subMode !== 'camera') return;
    const intervalId = window.setInterval(() => {
      if (!isScanningRef.current) {
        captureFromVideoAndTranslate(true);
      }
    }, 4500);
    return () => window.clearInterval(intervalId);
  }, [isCameraActive, autoScan, subMode, captureFromVideoAndTranslate]);

  const handleFlipCamera = () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    if (isCameraActive) {
      startCamera(nextFacing);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    stopCamera();
    const reader = new FileReader();
    reader.onload = async () => {
      const rawUrl = String(reader.result || '');
      if (!rawUrl) return;
      const resized = await resizeImageDataUrl(rawUrl, 1280);
      await sendImageToVision(resized, false);
    };
    reader.readAsDataURL(file);
  };

  // Voice translation submission
  const submitVoiceTranslation = useCallback(
    async (opts: {
      speaker: 'visitor' | 'local';
      sourceCode: string;
      targetCode: string;
      audioBase64?: string;
      mimeType?: string;
      text?: string;
    }) => {
      setIsProcessingVoice(true);
      setVoiceError(null);

      try {
        const data = await postJsonSafe<{
          result?: {
            transcript?: string;
            translatedText?: string;
            greekPhonetic?: string;
            culturalTip?: string;
          };
          error?: string;
        }>(
          '/api/voice-translate',
          {
            audioBase64: opts.audioBase64,
            mimeType: opts.mimeType,
            text: opts.text,
            sourceLanguage: getLanguageEnglishName(opts.sourceCode),
            targetLanguage: getLanguageEnglishName(opts.targetCode),
            uiLanguage: getLanguageEnglishName(currentLang),
          },
          'Voice translation failed.'
        );
        if (!data?.result) {
          throw new Error(data?.error || 'Voice translation failed.');
        }

        const r = data.result;
        const turnId = `turn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const newTurn: VoiceTranslationTurn = {
          id: turnId,
          speaker: opts.speaker,
          sourceLanguage: opts.sourceCode,
          targetLanguage: opts.targetCode,
          transcript: r.transcript || opts.text || '',
          translatedText: r.translatedText || '',
          greekPhonetic: r.greekPhonetic || '',
          culturalTip: r.culturalTip || '',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };

        setTurns((prev) => [newTurn, ...prev].slice(0, 40));

        if (autoSpeak && newTurn.translatedText) {
          await playGeminiTts(newTurn.translatedText, opts.targetCode, `${turnId}_tx`);
        }
      } catch (err: any) {
        setVoiceError(err?.message || 'Could not process voice translation.');
      } finally {
        setIsProcessingVoice(false);
      }
    },
    [autoSpeak, currentLang, playGeminiTts]
  );

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecordingSpeaker(null);
  }, []);

  const startRecording = useCallback(
    async (speaker: 'visitor' | 'local') => {
      if (isProcessingVoice) return;

      if (recordingSpeaker) {
        stopRecording();
        return;
      }

      stopTtsPlayback();
      setVoiceError(null);

      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        setVoiceError(tr.micPermissionError);
        return;
      }

      const sourceCode = speaker === 'visitor' ? visitorLang : localLang;
      const targetCode = speaker === 'visitor' ? localLang : visitorLang;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        micStreamRef.current = stream;

        const candidateTypes = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/mp4',
          'audio/ogg;codecs=opus',
        ];
        const supportedMime =
          candidateTypes.find((type) => MediaRecorder.isTypeSupported(type)) || '';

        const recorder = supportedMime
          ? new MediaRecorder(stream, { mimeType: supportedMime })
          : new MediaRecorder(stream);

        const audioChunks: Blob[] = [];
        const recordStartedAt = Date.now();
        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            audioChunks.push(ev.data);
          }
        };

        recorder.onstop = async () => {
          const finalMime = recorder.mimeType || supportedMime || 'audio/webm';
          const clipDurationMs = Date.now() - recordStartedAt;
          cleanupRecordingResources();
          setRecordingSpeaker(null);

          if (audioChunks.length === 0) return;
          const blob = new Blob(audioChunks, { type: finalMime });
          if (blob.size < 400 || clipDurationMs < 450) {
            setVoiceError(
              currentLang === 'ar'
                ? 'اضغط وتحدث لمدة ثانية واحدة على الأقل ثم أوقف التسجيل.'
                : 'Please speak for at least one second before stopping.'
            );
            return;
          }

          setIsProcessingVoice(true);
          try {
            const { dataUrl, mimeType } = await blobToCompactAudioDataUrl(blob, finalMime);
            if (!dataUrl) {
              setIsProcessingVoice(false);
              setVoiceError('Could not read recorded audio data. Please try again.');
              return;
            }
            await submitVoiceTranslation({
              speaker,
              sourceCode,
              targetCode,
              audioBase64: dataUrl,
              mimeType,
            });
          } catch (stopErr: any) {
            setIsProcessingVoice(false);
            setVoiceError(cleanApiError(stopErr?.message, 'Could not process voice recording. Please try again.'));
          }
        };

        mediaRecorderRef.current = recorder;
        recorder.start(250);
        setRecordingSpeaker(speaker);

        // Live microphone meter + optional RMS silence auto-stop
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          ctx.resume().catch(() => {});
          audioCtxRef.current = ctx;
          const src = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          src.connect(analyser);

          const freqData = new Uint8Array(analyser.frequencyBinCount);
          const timeData = new Uint8Array(analyser.fftSize);
          const startedAt = Date.now();
          let speechDetected = false;
          let silentSince: number | null = null;

          meterTimerRef.current = window.setInterval(() => {
            analyser.getByteFrequencyData(freqData);
            const bars = Array.from({ length: 14 }, (_, idx) => {
              const sample = freqData[idx * 2] || 0;
              return Math.max(12, Math.min(100, Math.round((sample / 255) * 100)));
            });
            setAudioLevels(bars);

            if (autoStopSilence) {
              analyser.getByteTimeDomainData(timeData);
              let sumSq = 0;
              for (let i = 0; i < timeData.length; i++) {
                const v = (timeData[i] - 128) / 128;
                sumSq += v * v;
              }
              const rms = Math.sqrt(sumSq / timeData.length);
              const elapsed = Date.now() - startedAt;

              if (rms > 0.032) {
                speechDetected = true;
                silentSince = null;
              } else if (speechDetected && elapsed > 800) {
                if (!silentSince) {
                  silentSince = Date.now();
                } else if (Date.now() - silentSince >= 1650) {
                  if (recorder.state !== 'inactive') {
                    recorder.stop();
                  }
                }
              }
            }
          }, 80);
        }

        // Hard cap single turn at 25 seconds for snappy latency
        maxRecordTimerRef.current = window.setTimeout(() => {
          if (recorder.state !== 'inactive') {
            recorder.stop();
          }
        }, 25000);
      } catch (err) {
        console.warn('Microphone access error:', err);
        cleanupRecordingResources();
        setRecordingSpeaker(null);
        setVoiceError(tr.micPermissionError);
      }
    },
    [
      isProcessingVoice,
      recordingSpeaker,
      stopRecording,
      stopTtsPlayback,
      tr.micPermissionError,
      visitorLang,
      localLang,
      cleanupRecordingResources,
      submitVoiceTranslation,
      autoStopSilence,
      currentLang,
    ]
  );

  const handleQuickTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = quickTextInput.trim();
    if (!cleaned || isProcessingVoice) return;
    setQuickTextInput('');
    await submitVoiceTranslation({
      speaker: 'visitor',
      sourceCode: visitorLang,
      targetCode: localLang,
      text: cleaned,
    });
  };

  const handleSwapLanguages = () => {
    const prevVisitor = visitorLang;
    setVisitorLang(localLang);
    setLocalLang(prevVisitor);
  };

  const handleCopyText = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
    } catch {
      // ignore clipboard errors
    }
  };

  const visitorLangLabel =
    SUPPORTED_LANGUAGES.find((l) => l.code === visitorLang)?.nativeName ||
    getLanguageEnglishName(visitorLang);
  const localLangLabel =
    SUPPORTED_LANGUAGES.find((l) => l.code === localLang)?.nativeName ||
    getLanguageEnglishName(localLang);

  return (
    <div className="space-y-8 pb-16">
      {!hasTranslatorAccess && (
        <div className="p-4 sm:px-6 rounded-2xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs sm:text-sm font-bold text-[#082F5E] dark:text-white">
                {user && !user.isGuest ? t.auth.pendingApprovalTitle : t.auth.notSignedIn}
              </p>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {user && !user.isGuest ? t.auth.pendingApprovalDesc : t.auth.signInPrompt}
              </p>
            </div>
          </div>
          {onOpenSignIn && (
            <button
              type="button"
              onClick={onOpenSignIn}
              className="px-4 py-2 rounded-xl bg-[#0D5EAF] hover:bg-[#0A4A8B] text-white text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
            >
              {user && !user.isGuest ? t.auth.subscribeWhatsappBtn : t.auth.signInWithGoogle}
            </button>
          )}
        </div>
      )}

      {/* Header & Workspace Mode Switch */}
      <section className="bg-white dark:bg-[#0B1D36] rounded-2xl border border-slate-200 dark:border-[#163256] overflow-hidden">
        <div className="aegean-meander-border w-full" />
        <div className="p-6 sm:p-8 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="text-xs font-bold text-[#0D5EAF] dark:text-sky-400">
              {tr.kicker}
            </div>
            <h1
              className="font-editorial text-2xl sm:text-4xl font-bold text-[#082F5E] dark:text-white leading-tight"
              style={{ textWrap: 'balance' }}
            >
              {tr.title}
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              {tr.subtitle}
            </p>
          </div>

          {/* Primary Segmented Control: Camera vs Voice */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 p-1.5 bg-slate-100 dark:bg-[#061325] rounded-xl shrink-0 border border-slate-200 dark:border-[#163256]">
            <button
              type="button"
              onClick={() => setSubMode('camera')}
              className={`min-h-[44px] px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                subMode === 'camera'
                  ? 'bg-[#0D5EAF] text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-[#082F5E] dark:hover:text-white'
              }`}
            >
              <Camera className="w-4 h-4 shrink-0" />
              <span>{tr.cameraTab}</span>
            </button>

            <button
              type="button"
              onClick={() => setSubMode('voice')}
              className={`min-h-[44px] px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                subMode === 'voice'
                  ? 'bg-[#0D5EAF] text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-[#082F5E] dark:hover:text-white'
              }`}
            >
              <Mic className="w-4 h-4 shrink-0" />
              <span>{tr.voiceTab}</span>
            </button>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* CAMERA VISION TRANSLATOR (MENUS, SIGNS & NOTICES)                    */}
      {/* ==================================================================== */}
      {subMode === 'camera' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left/Top Column: Live Camera Viewfinder & Controls */}
          <section className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
            {/* Scan Context Presets */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              {(
                [
                  { id: 'auto', label: tr.modeAuto, Icon: Scan },
                  { id: 'menu', label: tr.modeMenu, Icon: UtensilsCrossed },
                  { id: 'sign', label: tr.modeSign, Icon: Signpost },
                ] as const
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setVisionMode(id)}
                  className={`flex-1 min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                    visionMode === id
                      ? 'bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {/* Camera Stage */}
            <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center">
              {isCameraActive ? (
                <>
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className="w-full h-full object-cover"
                  />
                  {/* Viewfinder alignment corner guides */}
                  <div className="pointer-events-none absolute inset-4 border border-white/25 rounded-lg" />
                  {autoScan && (
                    <div className="absolute top-3 start-3 px-2.5 py-1 rounded-lg bg-black/70 text-white text-xs font-semibold flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{tr.autoScanActive}</span>
                    </div>
                  )}
                </>
              ) : previewSnapshot ? (
                <img
                  src={previewSnapshot}
                  alt="Captured menu or sign"
                  className="w-full h-full object-contain bg-slate-950"
                />
              ) : (
                <div className="p-6 text-center space-y-3 max-w-sm">
                  <div className="w-12 h-12 rounded-xl bg-slate-800 text-sky-400 flex items-center justify-center mx-auto">
                    <Camera className="w-6 h-6" />
                  </div>
                  <h2 className="text-sm sm:text-base font-bold text-white">
                    {tr.cameraPlaceholderTitle}
                  </h2>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {tr.cameraPlaceholderDesc}
                  </p>
                </div>
              )}

              {isScanning && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 text-white p-4 text-center">
                  <Loader2 className="w-7 h-7 animate-spin text-sky-400" />
                  <span className="text-xs sm:text-sm font-semibold">{tr.scanningNotice}</span>
                </div>
              )}
            </div>

            {cameraError && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-200">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                <span>{cameraError}</span>
              </div>
            )}

            {/* Primary Camera Controls (thumb-friendly >=44px) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {!isCameraActive ? (
                <button
                  type="button"
                  onClick={() => startCamera(facingMode)}
                  className="min-h-[48px] px-4 py-2.5 bg-sky-700 hover:bg-sky-800 text-white rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 whitespace-nowrap transition-colors cursor-pointer"
                >
                  <Camera className="w-4 h-4 shrink-0" />
                  <span>{tr.startCamera}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => captureFromVideoAndTranslate(false)}
                  disabled={isScanning}
                  className="min-h-[48px] px-4 py-2.5 bg-sky-700 hover:bg-sky-800 disabled:opacity-60 text-white rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 whitespace-nowrap transition-colors cursor-pointer"
                >
                  {isScanning ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : (
                    <Scan className="w-4 h-4 shrink-0" />
                  )}
                  <span>{tr.captureTranslate}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isScanning}
                className="min-h-[48px] px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 whitespace-nowrap transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4 shrink-0" />
                <span>{tr.uploadPhoto}</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            {isCameraActive && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer min-h-[40px]">
                  <input
                    type="checkbox"
                    checked={autoScan}
                    onChange={(e) => setAutoScan(e.target.checked)}
                    className="w-4 h-4 rounded accent-sky-700 cursor-pointer"
                  />
                  <span>{tr.autoScanLabel}</span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleFlipCamera}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{tr.switchCamera}</span>
                  </button>

                  <button
                    type="button"
                    onClick={stopCamera}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-1.5 cursor-pointer"
                  >
                    <CameraOff className="w-3.5 h-3.5" />
                    <span>{tr.stopCamera}</span>
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Right/Bottom Column: Structured Vision Translation Results */}
          <section className="lg:col-span-7 space-y-5">
            {visionResult ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-6">
                {/* Summary Header */}
                <div className="space-y-3 pb-5 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      <span className="text-sky-700 dark:text-sky-400">{tr.visionResultsTitle}</span>
                      <span aria-hidden="true">·</span>
                      <span>{visionResult.detectedLanguage}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {visionResult.items.length} {tr.itemsDetectedLabel}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        playGeminiTts(visionResult.summaryTranslation, currentLang, 'vision-summary')
                      }
                      className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-sky-50 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 text-sky-800 dark:text-sky-300 text-xs font-semibold flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer"
                    >
                      {loadingTtsId === 'vision-summary' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : playingTtsId === 'vision-summary' ? (
                        <VolumeX className="w-3.5 h-3.5" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {playingTtsId === 'vision-summary'
                          ? tr.speakingLabel
                          : tr.speakTranslatedBtn}
                      </span>
                    </button>
                  </div>

                  <h2 className="font-editorial text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                    {visionResult.headline}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {visionResult.summaryTranslation}
                  </p>
                </div>

                {/* Helpful Reply Phrase in Greek */}
                {visionResult.replyPhraseGreek && (
                  <div className="p-4 sm:p-5 rounded-xl bg-sky-50/70 dark:bg-slate-800/70 border border-sky-200 dark:border-slate-700 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-sky-800 dark:text-sky-300">
                        {tr.replyCardTitle}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          playGeminiTts(visionResult.replyPhraseGreek, 'el', 'vision-reply-el')
                        }
                        className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
                      >
                        {loadingTtsId === 'vision-reply-el' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : playingTtsId === 'vision-reply-el' ? (
                          <VolumeX className="w-3.5 h-3.5" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                        <span>{tr.speakGreekBtn}</span>
                      </button>
                    </div>
                    <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white" dir="ltr">
                      {visionResult.replyPhraseGreek}
                    </p>
                    {visionResult.replyPhrasePhonetic && (
                      <p className="text-xs font-medium text-sky-700 dark:text-sky-400" dir="ltr">
                        {visionResult.replyPhrasePhonetic}
                      </p>
                    )}
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                      {visionResult.replyPhraseTranslation}
                    </p>
                  </div>
                )}

                {/* Decoded Menu Items / Sign Lines */}
                {visionResult.items.length > 0 && (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {visionResult.items.map((item, idx) => {
                      const greekPlayId = `vision-item-el-${idx}`;
                      const txPlayId = `vision-item-tx-${idx}`;
                      return (
                        <div key={idx} className="py-4 first:pt-0 last:pb-0 space-y-2">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline gap-2">
                                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                                  {item.translatedText}
                                </h3>
                                {item.priceOrDetail && (
                                  <span className="text-xs font-bold text-sky-700 dark:text-sky-400 tabular-nums">
                                    · {item.priceOrDetail}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400" dir="ltr">
                                {item.originalText}
                                {item.phoneticGreek ? ` · (${item.phoneticGreek})` : ''}
                              </p>
                              {item.dietaryOrWarning && (
                                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                                  {item.dietaryOrWarning}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => playGeminiTts(item.originalText, 'el', greekPlayId)}
                                className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                                title={tr.speakGreekBtn}
                              >
                                {loadingTtsId === greekPlayId ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-700 dark:text-sky-400" />
                                ) : playingTtsId === greekPlayId ? (
                                  <VolumeX className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400" />
                                ) : (
                                  <Volume2 className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400" />
                                )}
                                <span>EL</span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  playGeminiTts(item.translatedText, currentLang, txPlayId)
                                }
                                className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                                title={tr.speakTranslatedBtn}
                              >
                                {loadingTtsId === txPlayId ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-700 dark:text-sky-400" />
                                ) : playingTtsId === txPlayId ? (
                                  <VolumeX className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400" />
                                ) : (
                                  <Volume2 className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400" />
                                )}
                                <span>{tr.speakTranslatedBtn}</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 sm:p-10 text-center space-y-3">
                <div className="w-12 h-12 rounded-xl bg-sky-50 dark:bg-slate-800 text-sky-700 dark:text-sky-400 flex items-center justify-center mx-auto">
                  <Scan className="w-6 h-6" />
                </div>
                <h2 className="font-editorial text-xl font-bold text-slate-900 dark:text-white">
                  {tr.cameraPlaceholderTitle}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 max-w-lg mx-auto leading-relaxed">
                  {tr.cameraPlaceholderDesc}
                </p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ==================================================================== */}
      {/* REAL-TIME VOICE & TWO-WAY CONVERSATION TRANSLATOR                    */}
      {/* ==================================================================== */}
      {subMode === 'voice' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Live Voice Controls, Quick Input & Survival Phrasebook */}
          <section className="lg:col-span-5 space-y-5">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
              {/* Language Pair Selector */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <div className="space-y-1.5 min-w-0">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block truncate">
                    {tr.visitorLangLabel}
                  </label>
                  <select
                    value={visitorLang}
                    onChange={(e) => setVisitorLang(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-600"
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.nativeName}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleSwapLanguages}
                  title={tr.swapLanguages}
                  aria-label={tr.swapLanguages}
                  className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-sky-700 dark:text-sky-400 transition-colors cursor-pointer"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                </button>

                <div className="space-y-1.5 min-w-0">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block truncate">
                    {tr.localLangLabel}
                  </label>
                  <select
                    value={localLang}
                    onChange={(e) => setLocalLang(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-600"
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.nativeName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Audio Visualizer Bar (shown cleanly while recording) */}
              {recordingSpeaker && (
                <div className="p-4 rounded-xl bg-sky-50 dark:bg-slate-800/80 border border-sky-200 dark:border-slate-700 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-sky-800 dark:text-sky-300">
                    <span>{tr.recordingActiveLabel}</span>
                    <span>
                      {recordingSpeaker === 'visitor' ? visitorLangLabel : localLangLabel}
                    </span>
                  </div>
                  <div className="h-10 flex items-center justify-center gap-1.5" aria-hidden="true">
                    {audioLevels.map((lvl, i) => (
                      <div
                        key={i}
                        className="w-1.5 rounded-full bg-sky-700 dark:bg-sky-400 transition-transform duration-75"
                        style={{ height: '100%', transform: `scaleY(${Math.max(0.15, lvl / 100)})` }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {isProcessingVoice && (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  <Loader2 className="w-4 h-4 animate-spin text-sky-700 dark:text-sky-400 shrink-0" />
                  <span>{tr.processingVoiceLabel}</span>
                </div>
              )}

              {voiceError && (
                <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-200">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                  <span>{voiceError}</span>
                </div>
              )}

              {/* Primary Two-Way Push/Tap Mic Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => startRecording('visitor')}
                  disabled={isProcessingVoice || recordingSpeaker === 'local'}
                  className={`min-h-[56px] px-4 py-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 ${
                    recordingSpeaker === 'visitor'
                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                      : 'bg-sky-700 hover:bg-sky-800 text-white'
                  }`}
                >
                  {recordingSpeaker === 'visitor' ? (
                    <Square className="w-4 h-4 fill-white shrink-0" />
                  ) : (
                    <Mic className="w-4 h-4 shrink-0" />
                  )}
                  <span className="truncate">
                    {recordingSpeaker === 'visitor'
                      ? tr.recordingActiveLabel
                      : `${tr.speakVisitorBtn} (${visitorLangLabel})`}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => startRecording('local')}
                  disabled={isProcessingVoice || recordingSpeaker === 'visitor'}
                  className={`min-h-[56px] px-4 py-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 ${
                    recordingSpeaker === 'local'
                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                      : 'bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white border border-slate-700'
                  }`}
                >
                  {recordingSpeaker === 'local' ? (
                    <Square className="w-4 h-4 fill-white shrink-0" />
                  ) : (
                    <Mic className="w-4 h-4 shrink-0" />
                  )}
                  <span className="truncate">
                    {recordingSpeaker === 'local'
                      ? tr.recordingActiveLabel
                      : `${tr.speakLocalBtn} (${localLangLabel})`}
                  </span>
                </button>
              </div>

              {/* Voice Settings: Auto-Speak, Silence Auto-Send & Gemini Voice Selector */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoSpeak}
                      onChange={(e) => setAutoSpeak(e.target.checked)}
                      className="w-4 h-4 rounded accent-sky-700 cursor-pointer"
                    />
                    <span>{tr.autoSpeakToggle}</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoStopSilence}
                      onChange={(e) => setAutoStopSilence(e.target.checked)}
                      className="w-4 h-4 rounded accent-sky-700 cursor-pointer"
                    />
                    <span>{tr.autoStopSilenceToggle}</span>
                  </label>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <label
                    htmlFor="gemini-voice-select"
                    className="text-xs font-semibold text-slate-600 dark:text-slate-400"
                  >
                    {tr.voiceStyleLabel}
                  </label>
                  <select
                    id="gemini-voice-select"
                    value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value as GeminiVoiceName)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-600"
                  >
                    {GEMINI_VOICES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick Typed Translation Fallback */}
              <form
                onSubmit={handleQuickTextSubmit}
                className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2"
              >
                <input
                  type="text"
                  value={quickTextInput}
                  onChange={(e) => setQuickTextInput(e.target.value)}
                  placeholder={tr.quickTextPlaceholder}
                  className="flex-1 min-w-0 min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
                <button
                  type="submit"
                  disabled={!quickTextInput.trim() || isProcessingVoice}
                  className="min-h-[44px] px-4 py-2 bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{tr.translateSpeakBtn}</span>
                </button>
              </form>
            </div>

            {/* Instant Survival Greek Phrasebook (1-Tap Gemini TTS) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-3">
              <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                {tr.survivalPhrasesTitle}
              </h2>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {SURVIVAL_PHRASES.map((phrase) => {
                  const localizedMeaning =
                    currentLang.toLowerCase() === 'ar'
                      ? phrase.ar
                      : currentLang.toLowerCase() === 'el'
                      ? phrase.el
                      : phrase.en;
                  return (
                    <div
                      key={phrase.id}
                      className="py-3 first:pt-1 last:pb-0 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                          {localizedMeaning}
                        </p>
                        <p className="text-xs font-medium text-sky-700 dark:text-sky-400" dir="ltr">
                          {phrase.greek}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400" dir="ltr">
                          {phrase.phonetic}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => playGeminiTts(phrase.greek, 'el', phrase.id)}
                        className="min-h-[40px] min-w-[40px] px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 text-sky-700 dark:text-sky-400 text-xs font-semibold flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                        title={tr.speakGreekBtn}
                      >
                        {loadingTtsId === phrase.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : playingTtsId === phrase.id ? (
                          <VolumeX className="w-3.5 h-3.5" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                        <span>EL</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Right Column: Live Two-Way Conversation Transcript Feed */}
          <section className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-sky-700 dark:text-sky-400" />
                <h2 className="font-editorial text-xl font-bold text-slate-900 dark:text-white">
                  {tr.voiceTab}
                </h2>
              </div>

              {turns.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTurns([])}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{tr.clearHistory}</span>
                </button>
              )}
            </div>

            {turns.length === 0 ? (
              <div className="py-12 px-4 text-center space-y-3">
                <div className="w-12 h-12 rounded-xl bg-sky-50 dark:bg-slate-800 text-sky-700 dark:text-sky-400 flex items-center justify-center mx-auto">
                  <Mic className="w-6 h-6" />
                </div>
                <h3 className="font-editorial text-lg font-bold text-slate-900 dark:text-white">
                  {tr.emptyConversationTitle}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
                  {tr.emptyConversationDesc}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {turns.map((turn) => {
                  const ttsTxId = `${turn.id}_tx`;
                  const ttsOrigId = `${turn.id}_orig`;
                  const isVisitorTurn = turn.speaker === 'visitor';
                  return (
                    <article
                      key={turn.id}
                      className={`p-4 sm:p-5 rounded-xl border space-y-3 ${
                        isVisitorTurn
                          ? 'bg-sky-50/50 dark:bg-slate-800/60 border-sky-200 dark:border-slate-700'
                          : 'bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-2 font-semibold">
                          <span className="text-sky-700 dark:text-sky-400">
                            {isVisitorTurn ? visitorLangLabel : localLangLabel}
                          </span>
                          <span aria-hidden="true">→</span>
                          <span>
                            {isVisitorTurn ? localLangLabel : visitorLangLabel}
                          </span>
                        </div>
                        <span className="tabular-nums">{turn.timestamp}</span>
                      </div>

                      {/* Original Spoken Phrase */}
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                          {turn.transcript}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            playGeminiTts(turn.transcript, turn.sourceLanguage, ttsOrigId)
                          }
                          className="min-h-[36px] min-w-[36px] p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 shrink-0 cursor-pointer"
                          title={tr.speakTranslatedBtn}
                        >
                          {loadingTtsId === ttsOrigId ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : playingTtsId === ttsOrigId ? (
                            <VolumeX className="w-4 h-4 text-sky-700 dark:text-sky-400" />
                          ) : (
                            <Volume2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      {/* Translated Output */}
                      <div className="pt-2.5 border-t border-slate-200/70 dark:border-slate-700 space-y-1.5">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug">
                            {turn.translatedText}
                          </p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleCopyText(turn.translatedText, turn.id)}
                              className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 cursor-pointer"
                            >
                              {copiedId === turn.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                              <span>{copiedId === turn.id ? tr.copiedText : tr.copyText}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                playGeminiTts(turn.translatedText, turn.targetLanguage, ttsTxId)
                              }
                              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                            >
                              {loadingTtsId === ttsTxId ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : playingTtsId === ttsTxId ? (
                                <VolumeX className="w-3.5 h-3.5" />
                              ) : (
                                <Volume2 className="w-3.5 h-3.5" />
                              )}
                              <span>
                                {playingTtsId === ttsTxId ? tr.speakingLabel : tr.speakTranslatedBtn}
                              </span>
                            </button>
                          </div>
                        </div>

                        {turn.greekPhonetic && (
                          <p className="text-xs font-medium text-sky-700 dark:text-sky-400" dir="ltr">
                            {turn.greekPhonetic}
                          </p>
                        )}
                        {turn.culturalTip && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {turn.culturalTip}
                          </p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
