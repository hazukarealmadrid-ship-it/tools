import { buildDubbedAudioTrackV2, videoTimeToAudioTime, type SyncCheckpoint } from "./DubbingAudioEngine";
import { VIETNAM_VOICE_PROFILES, type VoiceConfig } from './VietnamVoiceOptimizationEngine';
import { exportVideo, drawVideoFrame } from "./VideoExportEngine";
import { getActiveSubtitle, getActiveSubtitleByAudioTime } from "./SubtitleRenderer";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useRef, useEffect } from 'react';
import { AITextDetectionEngine } from './AITextDetectionEngine';
import {
  Sparkles,
  CloudUpload,
  FileVideo,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  MonitorPlay,
  Droplet,
  Type,
  ZoomIn,
  FlipHorizontal,
  Volume2,
  Maximize,
  Pen,
  Eye,
  RotateCcw,
  RotateCw,
  Loader2,
  Download,
  X,
  Film,
  Scan,
  Wand2,
  Sliders,
  ShieldAlert,
  AlignCenter
} from 'lucide-react';

export default function App() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [subtitles, setSubtitles] = useState<Array<{start: number, end: number, text: string}>>([]);
  const [currentSubtitle, setCurrentSubtitle] = useState('');

  const [activePanel, setActivePanel] = useState<'blur' | 'text' | 'logo' | 'zoom' | 'mirror' | 'volume' | null>(null);

  const [blurIntensity, setBlurIntensity] = useState(15);
  const [blurBox, setBlurBox] = useState({ x: 0, y: 83, w: 100, h: 14 });
  const [fontSize, setFontSize] = useState(24);
  const [strokeWidth, setStrokeWidth] = useState(25);
  const [textX, setTextX] = useState(50);
  const [textY, setTextY] = useState(85);
  const [logoScale, setLogoScale] = useState(25);
  const [logoX, setLogoX] = useState(50);
  const [logoY, setLogoY] = useState(50);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [isMirrored, setIsMirrored] = useState(false);
  const [volume, setVolume] = useState(0);

  const [isTextAutoCentered, setIsTextAutoCentered] = useState(true);

  const [isEditing, setIsEditing] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [showGuideH, setShowGuideH] = useState(false);
  const [showGuideV, setShowGuideV] = useState(false);
  const [showBgBar, setShowBgBar] = useState(false);

  // Thuật toán Tự động Nhận diện & Che mờ Phụ đề Tiếng Trung (Chinese Hardcoded Subtitle Auto-Blur)
  const [autoChineseSubBlur, setAutoChineseSubBlur] = useState(true);
  const [fullWidthSpan, setFullWidthSpan] = useState(true);
  const [isScanningSub, setIsScanningSub] = useState(false);
  const [isForceScanning, setIsForceScanning] = useState(false);
  const [scanStatusMsg, setScanStatusMsg] = useState('');

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatusText, setExportStatusText] = useState('');
  
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [videoPlaybackRate, setVideoPlaybackRate] = useState(1);
  // SYNC-FIX: RC#3 — State to store actual segment positions in the dubbed audio track
  const [dubAudioPositions, setDubAudioPositions] = useState<number[]>([]);
  const abortExportRef = useRef(false);

  // CapCut / TikTok TTS AI Voiceover States
  const [voiceProfile, setVoiceProfile] = useState<VoiceConfig>(VIETNAM_VOICE_PROFILES.vn_female_neutral);
  const [isAiVoiceActive, setIsAiVoiceActive] = useState(true);
  const [sessionId, setSessionId] = useState('3805a2f884764f5cd3d5393136d15802');
  const [loadingSegmentIndex, setLoadingSegmentIndex] = useState<number | null>(null);
  const [isGeneratingAudioTimeline, setIsGeneratingAudioTimeline] = useState(false);
  const [audioTimelineProgress, setAudioTimelineProgress] = useState('');
  const [showPythonModal, setShowPythonModal] = useState(false);

  const [syncCheckpoints, setSyncCheckpoints] = useState<SyncCheckpoint[]>([]);

  // SYNC-FIX: Reset dubAudioPositions & syncCheckpoints when dubbing is toggled off or new files are loaded
  useEffect(() => {
    if (!isAiVoiceActive) {
      setDubAudioPositions([]);
      setSyncCheckpoints([]);
    }
  }, [isAiVoiceActive]);

  useEffect(() => {
    setDubAudioPositions([]);
    setSyncCheckpoints([]);
  }, [videoFile, subtitleFile]);

  const videoRef = useRef<HTMLInputElement>(null);
  const subtitleRef = useRef<HTMLInputElement>(null);
  const subtitleOverlayRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const blurBoxRef = useRef<HTMLDivElement>(null);
  const videoElementRef = useRef<HTMLVideoElement>(null);
  const audioElementRef = useRef<HTMLAudioElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const logoImgRef = useRef<HTMLDivElement>(null);
  
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const isDragging = useRef<'none' | 'blur' | 'logo' | 'blur-resize' | 'logo-resize'>('none');
  const dragStart = useRef({ x: 0, y: 0, elX: 0, elY: 0, startW: 0, startH: 0 });
  const fullWidthSpanRef = useRef(fullWidthSpan);

  // PERF: Add realtime drag refs to decouple mousemove from React state updates | Fix: RC#5
  const blurBoxDragRef = useRef(blurBox);
  const logoPosDragRef = useRef({ x: logoX, y: logoY });
  const logoScaleDragRef = useRef(logoScale);
  const guidesDragRef = useRef({ h: false, v: false });

  // Sync refs when state changes outside drag
  useEffect(() => {
    blurBoxDragRef.current = blurBox;
  }, [blurBox]);

  useEffect(() => {
    logoPosDragRef.current = { x: logoX, y: logoY };
  }, [logoX, logoY]);

  useEffect(() => {
    logoScaleDragRef.current = logoScale;
  }, [logoScale]);

  const logoImageRef = useRef<HTMLImageElement | null>(null);
  const rectWidthRef = useRef<number>(1280);
  const audioCacheRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    fullWidthSpanRef.current = fullWidthSpan;
  }, [fullWidthSpan]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const target = isDragging.current;
      if (target === 'none' || !containerRef.current) return;
      
      const containerRect = containerRef.current.getBoundingClientRect();
      const SNAP_TOLERANCE = 8;
      const centerX = containerRect.width / 2;
      const centerY = containerRect.height / 2;
      let snappedV = false;
      let snappedH = false;
      
      if (target === 'blur-resize' && blurBoxRef.current) {
        let newW = dragStart.current.startW + (e.clientX - dragStart.current.x);
        let newH = dragStart.current.startH + (e.clientY - dragStart.current.y);

        if (newW < 20) newW = 20;
        if (newH < 20) newH = 20;

        const currentX = dragStart.current.elX;
        const currentY = dragStart.current.elY;

        if (Math.abs(currentX + newW / 2 - centerX) < SNAP_TOLERANCE) {
          newW = (centerX - currentX) * 2;
          snappedV = true;
        }

        if (Math.abs(currentY + newH / 2 - centerY) < SNAP_TOLERANCE) {
          newH = (centerY - currentY) * 2;
          snappedH = true;
        }

        if (currentX + newW > containerRect.width) newW = containerRect.width - currentX;
        if (currentY + newH > containerRect.height) newH = containerRect.height - currentY;

        const heightPercent = (newH / containerRect.height) * 100;

        // PERF: Update refs and DOM style directly instead of setState during mousemove | Fix: RC#5
        blurBoxDragRef.current = { ...blurBoxDragRef.current, w: 100, h: heightPercent, x: 0 };
        guidesDragRef.current = { h: snappedH, v: snappedV };
        if (blurBoxRef.current) {
          blurBoxRef.current.style.height = `${heightPercent}%`;
        }
        return;
      }

      if (target === 'logo-resize' && logoImgRef.current) {
        let newW = dragStart.current.startW + (e.clientX - dragStart.current.x);
        if (newW < 20) newW = 20;

        const maxW = containerRect.width;
        if (newW > maxW) newW = maxW;

        const widthPercent = (newW / containerRect.width) * 100;

        // PERF: Update ref and DOM style directly without setState | Fix: RC#5
        logoScaleDragRef.current = widthPercent;
        if (logoImgRef.current) {
          logoImgRef.current.style.width = `${widthPercent}%`;
        }
        return;
      }

      let newX = dragStart.current.elX + (e.clientX - dragStart.current.x);
      let newY = dragStart.current.elY + (e.clientY - dragStart.current.y);

      const elW = target === 'blur' ? (blurBoxRef.current?.offsetWidth || 0) : (logoImgRef.current?.getBoundingClientRect().width || 0);
      const elH = target === 'blur' ? (blurBoxRef.current?.offsetHeight || 0) : (logoImgRef.current?.getBoundingClientRect().height || 0);

      let itemCenterX = target === 'blur' ? newX + elW / 2 : newX;
      let itemCenterY = target === 'blur' ? newY + elH / 2 : newY;

      if (Math.abs(itemCenterX - centerX) < SNAP_TOLERANCE) {
        itemCenterX = centerX;
        snappedV = true;
      }
      
      if (Math.abs(itemCenterY - centerY) < SNAP_TOLERANCE) {
        itemCenterY = centerY;
        snappedH = true;
      }

      if (target === 'blur') {
        newX = itemCenterX - elW / 2;
        newY = itemCenterY - elH / 2;
        if (newX < 0) newX = 0;
        if (newY < 0) newY = 0;
        if (newX + elW > containerRect.width) newX = containerRect.width - elW;
        if (newY + elH > containerRect.height) newY = containerRect.height - elH;
      } else {
        newX = itemCenterX;
        newY = itemCenterY;
        if (newX - elW / 2 < 0) newX = elW / 2;
        if (newY - elH / 2 < 0) newY = elH / 2;
        if (newX + elW / 2 > containerRect.width) newX = containerRect.width - elW / 2;
        if (newY + elH / 2 > containerRect.height) newY = containerRect.height - elH / 2;
      }

      const leftPercent = (newX / containerRect.width) * 100;
      const topPercent = (newY / containerRect.height) * 100;

      // PERF: Update refs and DOM styles directly without setState during mousemove | Fix: RC#5
      guidesDragRef.current = { h: snappedH, v: snappedV };
      if (target === 'blur') {
        blurBoxDragRef.current = { ...blurBoxDragRef.current, x: 0, y: topPercent, w: 100 };
        if (blurBoxRef.current) {
          blurBoxRef.current.style.top = `${topPercent}%`;
        }
      } else {
        logoPosDragRef.current = { x: leftPercent, y: topPercent };
        if (logoImgRef.current) {
          logoImgRef.current.style.left = `${leftPercent}%`;
          logoImgRef.current.style.top = `${topPercent}%`;
        }
      }
    };

    const handleMouseUp = () => {
      if (isDragging.current !== 'none') {
        // PERF: Batch commit ref state updates once on mouseUp | Fix: RC#5
        setBlurBox({ ...blurBoxDragRef.current });
        setLogoX(logoPosDragRef.current.x);
        setLogoY(logoPosDragRef.current.y);
        setLogoScale(logoScaleDragRef.current);
        setShowGuideV(guidesDragRef.current.v);
        setShowGuideH(guidesDragRef.current.h);
        isDragging.current = 'none';
      }
      setShowGuideV(false);
      setShowGuideH(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement | HTMLImageElement>, target: 'blur' | 'logo') => {
    if (!isEditing) return;

    if (target === 'blur' && blurBoxRef.current) {
      if ((e.target as HTMLElement).closest('.resize-handle')) {
        isDragging.current = 'blur-resize';
        const containerRect = containerRef.current?.getBoundingClientRect();
        dragStart.current = {
          x: e.clientX,
          y: e.clientY,
          elX: (blurBox.x / 100) * (containerRect?.width || 0),
          elY: (blurBox.y / 100) * (containerRect?.height || 0),
          startW: blurBoxRef.current.offsetWidth,
          startH: blurBoxRef.current.offsetHeight
        };
        return;
      }
    }
    
    if (target === 'logo' && logoImgRef.current) {
      if ((e.target as HTMLElement).closest('.logo-resize-handle')) {
        isDragging.current = 'logo-resize';
        dragStart.current = {
          x: e.clientX,
          y: e.clientY,
          elX: 0,
          elY: 0,
          startW: logoImgRef.current.offsetWidth,
          startH: logoImgRef.current.offsetHeight
        };
        return;
      }
    }
    
    isDragging.current = target;
    
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    
    const currentXPercent = target === 'blur' ? blurBox.x : logoX;
    const currentYPercent = target === 'blur' ? blurBox.y : logoY;

    const boxLeftPx = (currentXPercent / 100) * containerRect.width;
    const boxTopPx = (currentYPercent / 100) * containerRect.height;

    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      elX: boxLeftPx,
      elY: boxTopPx,
      startW: 0,
      startH: 0
    };
  };

  const handleAlignLogo = (position: 'top-left' | 'top-right') => {
    const halfW = logoScale / 2;
    let halfH = 5; // Default fallback half height %

    let aspect = 0.5; // Default fallback aspect ratio (1:2)
    const imgEl = logoImgRef.current?.querySelector('img') as HTMLImageElement | null;
    if (imgEl && imgEl.naturalWidth && imgEl.naturalHeight) {
      aspect = imgEl.naturalHeight / imgEl.naturalWidth;
    }

    let videoW = 1280;
    let videoH = 720;
    if (videoElementRef.current && videoElementRef.current.videoWidth && videoElementRef.current.videoHeight) {
      videoW = videoElementRef.current.videoWidth;
      videoH = videoElementRef.current.videoHeight;
    } else if (containerRef.current && containerRef.current.clientWidth && containerRef.current.clientHeight) {
      videoW = containerRef.current.clientWidth;
      videoH = containerRef.current.clientHeight;
    }

    const logoWInPx = (logoScale / 100) * videoW;
    const logoHInPx = logoWInPx * aspect;
    halfH = ((logoHInPx / videoH) * 100) / 2;

    const targetX = position === 'top-left' ? halfW : (100 - halfW);

    setLogoX(Number(targetX.toFixed(1)));
    setLogoY(Number(halfH.toFixed(1)));
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        toolbarRef.current && !toolbarRef.current.contains(target) &&
        containerRef.current && !containerRef.current.contains(target)
      ) {
        setActivePanel(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (videoFile) {
      const url = URL.createObjectURL(videoFile);
      setVideoUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setVideoUrl(null);
    }
  }, [videoFile]);

  const timeToSeconds = (timeString: string) => {
    if (!timeString) return 0;
    const [hours, minutes, seconds] = timeString.split(':');
    const [sec, ms] = seconds.split(',');
    return parseInt(hours, 10) * 3600 + parseInt(minutes, 10) * 60 + parseInt(sec, 10) + parseInt(ms, 10) / 1000;
  };

  const parseSRT = (srtText: string) => {
    const srtArray: Array<{start: number, end: number, text: string}> = [];
    const blocks = srtText.trim().replace(/\r\n/g, '\n').split(/\n\s*\n/);
    const timeRegex = /(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/;

    blocks.forEach(block => {
      const lines = block.split('\n');
      let timeLineIdx = -1;
      
      for (let i = 0; i < lines.length; i++) {
        if (timeRegex.test(lines[i])) {
          timeLineIdx = i;
          break;
        }
      }

      if (timeLineIdx !== -1) {
        const match = lines[timeLineIdx].match(timeRegex);
        if (match) {
          const start = timeToSeconds(match[1]);
          const end = timeToSeconds(match[2]);
          const text = lines.slice(timeLineIdx + 1).join('\n');
          srtArray.push({ start, end, text });
        }
      }
    });
    console.log("Danh sách sub đã parse:", srtArray);
    return srtArray;
  };

  const DEFAULT_SAMPLE_SUBS = [
    { start: 1.2, end: 4.5, text: "Xin chào các bạn, chúc mọi người ngày mới tốt lành!" },
    { start: 5.0, end: 9.2, text: "Hôm nay chúng ta cùng trải nghiệm Lồng tiếng AI bằng giọng Cô gái hoạt ngôn CapCut." },
    { start: 10.0, end: 14.5, text: "Hệ thống tự động căn chỉnh âm thanh khớp thời gian phụ đề SRT sắc nét." }
  ];

  useEffect(() => {
    if (subtitleFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const parsed = parseSRT(text);
        setSubtitles(parsed.length > 0 ? parsed : DEFAULT_SAMPLE_SUBS);
      };
      reader.readAsText(subtitleFile);
    } else {
      setSubtitles(DEFAULT_SAMPLE_SUBS);
    }
  }, [subtitleFile]);

  const formatMsToTimestamp = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const millis = Math.floor(ms % 1000);
    
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const pad3 = (n: number) => String(n).padStart(3, '0');
    return `${pad2(hrs)}:${pad2(mins)}:${pad2(secs)},${pad3(millis)}`;
  };

  const handlePreviewSegment = async (text: string, index: number) => {
    setLoadingSegmentIndex(index);
    let played = false;

    const cacheKey = `google_tts:${voiceProfile.name}:${text.trim()}`;
    if (audioCacheRef.current.has(cacheKey)) {
      const cachedUrl = audioCacheRef.current.get(cacheKey)!;
      try {
        const audioPlayer = new Audio(cachedUrl);
        audioPlayer.onended = () => setLoadingSegmentIndex(null);
        audioPlayer.onerror = () => setLoadingSegmentIndex(null);
        await audioPlayer.play();
        return;
      } catch (err) {
        // If playing cached fail, fallback to fetch
      }
    }

    try {
      const response = await fetch('/api/tts/google/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voiceProfile
        })
      });

      const data = await response.json();
      if (data && data.audioBase64) {
        try {
          const binaryStr = atob(data.audioBase64);
          const len = binaryStr.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: 'audio/mp3' });
          const audioUrl = URL.createObjectURL(blob);
          audioCacheRef.current.set(cacheKey, audioUrl);

          const audioPlayer = new Audio(audioUrl);

          audioPlayer.onended = () => {
            setLoadingSegmentIndex(null);
          };
          audioPlayer.onerror = () => {
            console.warn("Audio element error during playback");
            setLoadingSegmentIndex(null);
          };

          await audioPlayer.play();
          played = true;
        } catch (playErr) {
          console.warn("Audio element playback rejected/failed, using SpeechSynthesis fallback:", playErr);
        }
      }
    } catch (error: any) {
      console.error("Lỗi kết nối Google TTS endpoint:", error);
    }

    // Client-side Web Speech API Fallback if remote audio failed or got blocked
    if (!played) {
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = 'vi-VN';
          utterance.rate = 1.0;
          
          const voices = window.speechSynthesis.getVoices();
          const matchedVoice = voices.find(v => v.lang.toLowerCase().includes(utterance.lang.toLowerCase()));
          if (matchedVoice) utterance.voice = matchedVoice;

          utterance.onend = () => setLoadingSegmentIndex(null);
          utterance.onerror = () => setLoadingSegmentIndex(null);

          window.speechSynthesis.speak(utterance);
          played = true;
        } catch (synthErr) {
          console.error("SpeechSynthesis error:", synthErr);
          setLoadingSegmentIndex(null);
        }
      } else {
        setLoadingSegmentIndex(null);
      }
    }
  };

  const audioBufferToWav = async (buffer: AudioBuffer): Promise<Blob> => {
    return new Promise((resolve) => {
      const numOfChan = buffer.numberOfChannels;
      const length = buffer.length * numOfChan * 2 + 44;
      const bufferArr = new ArrayBuffer(length);
      const out = new DataView(bufferArr);
      let channels: Float32Array[] = [];
      let sampleRate = buffer.sampleRate;
      let offset = 0;
      let pos = 0;

      function setUint16(data: number) {
        out.setUint16(pos, data, true);
        pos += 2;
      }

      function setUint32(data: number) {
        out.setUint32(pos, data, true);
        pos += 4;
      }

      setUint32(0x46464952); // "RIFF"
      setUint32(length - 8);
      setUint32(0x45564157); // "WAVE"

      setUint32(0x20746d66); // "fmt "
      setUint32(16);
      setUint16(1);
      setUint16(numOfChan);
      setUint32(sampleRate);
      setUint32(sampleRate * 2 * numOfChan);
      setUint16(numOfChan * 2);
      setUint16(16);

      setUint32(0x61746164); // "data"
      setUint32(length - pos - 4);

      for (let i = 0; i < buffer.numberOfChannels; i++) {
        channels.push(buffer.getChannelData(i));
      }

      const CHUNK_SIZE = Math.max(100000, Math.floor(buffer.length / 20));

      const processChunk = () => {
        const end = Math.min(offset + CHUNK_SIZE, buffer.length);
        while (offset < end) {
          for (let i = 0; i < numOfChan; i++) {
            let sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = sample < 0 ? sample * 32768 : sample * 32767;
            out.setInt16(pos, sample, true);
            pos += 2;
          }
          offset++;
        }
        
        if (offset < buffer.length) {
          setAudioTimelineProgress(`95% Đang mã hóa WAV (${Math.round((offset / buffer.length) * 100)}%)...`);
          setTimeout(processChunk, 0); // Yield to event loop
        } else {
          resolve(new Blob([bufferArr], { type: 'audio/wav' }));
        }
      };
      
      processChunk();
    });
  };

  const handleGenerateAudioTimeline = async () => {
    if (subtitles.length === 0) {
      alert("Không tìm thấy phân đoạn phụ đề để tạo timeline!");
      return;
    }
    const video = videoElementRef.current;
    if (!video || !video.duration) {
      alert("Vui lòng nạp video trước khi tạo lồng tiếng!");
      return;
    }

    setIsGeneratingAudioTimeline(true);
    setAudioTimelineProgress("0% Khởi tạo Audio Engine...");

    try {
      const { finalBuffer, videoPlaybackRate: computedRate, finalAudioPositions, syncCheckpoints } = await buildDubbedAudioTrackV2(
        subtitles,
        video.duration,
        voiceProfile,
        audioCacheRef,
        (msg) => setAudioTimelineProgress(msg),
        sessionId
      );

      setAudioTimelineProgress("95% Đang mã hoá WAV...");
      const wavBlob = await audioBufferToWav(finalBuffer);
      const url = URL.createObjectURL(wavBlob);

      setGeneratedAudioUrl(url);
      setVideoPlaybackRate(computedRate);
      // SYNC-FIX: Save tracked audio segment positions & checkpoints for audio-driven sync
      setDubAudioPositions(finalAudioPositions);
      setSyncCheckpoints(syncCheckpoints);

      setAudioTimelineProgress("100% Đã hoàn thành! Đã ghép âm thanh vào Video Preview.");
    } catch (err: any) {
      console.error("Lỗi xuất timeline audio:", err);
      alert("Lỗi xuất timeline audio: " + err.message);
    } finally {
      setIsGeneratingAudioTimeline(false);
      setAudioTimelineProgress("");
    }
  };

  useEffect(() => {
    if (logoFile) {
      const url = URL.createObjectURL(logoFile);
      setLogoUrl(url);
      setLogoScale(25);
      setLogoX(50);
      setLogoY(50);
      return () => URL.revokeObjectURL(url);
    } else {
      setLogoUrl(null);
    }
  }, [logoFile]);

  // Preload and cache logo image in ref to eliminate allocation overhead during 60fps render loop
  useEffect(() => {
    if (logoUrl) {
      const img = new Image();
      img.onload = () => {
        logoImageRef.current = img;
      };
      img.src = logoUrl;
    } else {
      logoImageRef.current = null;
    }
  }, [logoUrl]);

  useEffect(() => {
    if (videoElementRef.current) {
      if (generatedAudioUrl) {
        videoElementRef.current.volume = 0;
      } else {
        videoElementRef.current.volume = Math.max(0, Math.min(1, (volume + 50) / 100));
      }
    }
    if (audioElementRef.current) {
      audioElementRef.current.volume = Math.max(0, Math.min(1, (volume + 50) / 100));
    }
  }, [volume, generatedAudioUrl]);

  useEffect(() => {
    if (videoElementRef.current) {
      videoElementRef.current.playbackRate = generatedAudioUrl ? videoPlaybackRate : 1;
    }
  }, [generatedAudioUrl, videoPlaybackRate]);

  // 3. Xử lý sự kiện Fullscreen Change, Window Resize & Responsive Percentage Engine Loop
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    const video = videoElementRef.current;
    if (!canvas || !video) return;

    let animationFrameId: number;

    // Đồng bộ kích thước pixel thực tế của Canvas theo độ phân giải gốc của Video VÀ mật độ điểm ảnh DPR
    const syncCanvasDimensions = () => {
      if (previewCanvasRef.current && videoElementRef.current) {
        const v = videoElementRef.current;
        const c = previewCanvasRef.current;
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const rect = c.getBoundingClientRect();
        if (rect.width > 0) {
          rectWidthRef.current = rect.width;
        }

        const nativeW = v.videoWidth || 1280;
        const nativeH = v.videoHeight || 720;

        let targetW = nativeW;
        let targetH = nativeH;

        if (rect.width > 0 && rect.height > 0) {
          targetW = Math.max(nativeW, Math.round(rect.width * dpr));
          targetH = Math.max(nativeH, Math.round(rect.height * dpr));
        }

        if (c.width !== targetW || c.height !== targetH) {
          c.width = targetW;
          c.height = targetH;
        }
      }
    };

    syncCanvasDimensions();

    const handleResizeAndFullscreen = () => {
      syncCanvasDimensions();
      requestAnimationFrame(syncCanvasDimensions);
    };

    const fullscreenEvents = [
      'fullscreenchange',
      'webkitfullscreenchange',
      'mozfullscreenchange',
      'MSFullscreenChange'
    ];

    fullscreenEvents.forEach(evt => document.addEventListener(evt, handleResizeAndFullscreen));
    window.addEventListener('resize', handleResizeAndFullscreen);

    let resizeObserver: ResizeObserver | null = null;
    if (containerRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => handleResizeAndFullscreen());
      resizeObserver.observe(containerRef.current);
    }

    // High performance render loop (Zero DOM queries / allocations per frame)
    const renderPreview = () => {
      const vw = canvas.width;
      const vh = canvas.height;

      if (vw === 0 || vh === 0) {
        animationFrameId = requestAnimationFrame(renderPreview);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animationFrameId = requestAnimationFrame(renderPreview);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const avgScale = rectWidthRef.current > 0 ? (vw / rectWidthRef.current) : 1;

      drawVideoFrame({
        ctx,
        renderVideo: video,
        currentTime: video.currentTime,
        videoWidth: vw,
        videoHeight: vh,
        zoomLevel,
        isMirrored,
        blurIntensity,
        blurBox: blurBoxDragRef.current,
        showBgBar,
        logoImg: (logoImageRef.current && logoImageRef.current.complete) ? logoImageRef.current : null,
        logoX: logoPosDragRef.current.x,
        logoY: logoPosDragRef.current.y,
        logoScale: logoScaleDragRef.current,
        subtitles,
        isTextAutoCentered,
        textX,
        textY,
        fontSize,
        strokeWidth,
        scaleFactor: avgScale,
        isDubbingActive: isAiVoiceActive && generatedAudioUrl !== null && dubAudioPositions.length === subtitles.length && audioElementRef.current !== null,
        dubAudioPositions,
        audioCurrentTime: audioElementRef.current?.currentTime,
        syncCheckpoints,
        videoPlaybackRate
      });

      animationFrameId = requestAnimationFrame(renderPreview);
    };

    animationFrameId = requestAnimationFrame(renderPreview);

    return () => {
      cancelAnimationFrame(animationFrameId);
      fullscreenEvents.forEach(evt => document.removeEventListener(evt, handleResizeAndFullscreen));
      window.removeEventListener('resize', handleResizeAndFullscreen);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [videoUrl, blurIntensity, blurBox, fullWidthSpan, autoChineseSubBlur, zoomLevel, isMirrored, subtitles, isTextAutoCentered, textX, textY, fontSize, strokeWidth, logoUrl, logoX, logoY, logoScale, showBgBar]);

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.target as HTMLVideoElement;
    const currentTime = video.currentTime;
    
    const activeSub = subtitles.find(sub => currentTime >= sub.start && currentTime <= sub.end);
    const subText = activeSub ? activeSub.text : '';
    setCurrentSubtitle(prev => prev === subText ? prev : subText);

    if (video.duration) {
      const newProg = Math.round((currentTime / video.duration) * 1000) / 10;
      setVideoProgress(prev => Math.abs(prev - newProg) >= 0.2 ? newProg : prev);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (videoElementRef.current) {
      const newProgress = parseFloat(e.target.value);
      setVideoProgress(newProgress);
      const newTime = (newProgress / 100) * videoElementRef.current.duration;
      videoElementRef.current.currentTime = newTime;
    }
  };

  const togglePlayPause = () => {
    if (videoElementRef.current) {
      if (videoElementRef.current.paused) {
        videoElementRef.current.play();
      } else {
        videoElementRef.current.pause();
      }
    }
  };

  const skipBackward = () => {
    if (videoElementRef.current) {
      videoElementRef.current.currentTime -= 5;
    }
  };

  const skipForward = () => {
    if (videoElementRef.current) {
      videoElementRef.current.currentTime += 5;
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          skipBackward();
          break;
        case 'ArrowRight':
          e.preventDefault();
          skipForward();
          break;
        case ' ':
          e.preventDefault();
          togglePlayPause();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleFullscreen = () => {
    if (containerRef.current) {
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen().catch(err => {
          console.error(`Error attempting to enable fullscreen: ${err.message}`);
        });
      } else {
        document.exitFullscreen();
      }
    }
  };

  const handleFileChange = (setter: React.Dispatch<React.SetStateAction<File | null>>) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setter(e.target.files[0]);
      if (setter === setVideoFile) {
        setGeneratedAudioUrl(null);
      }
    }
  };

  // Tự động Nhận diện và Che mờ phụ đề bằng Gemini API
  const detectAndFitChineseSubtitles = async () => {
    if (!videoElementRef.current || !containerRef.current) {
      alert('Vui lòng chọn video trước ở mục 1!');
      return;
    }
    
    setIsScanningSub(true);

    try {
      setScanStatusMsg('📸 Bước 1/3: Chụp ảnh frame hiện tại từ video (Snapshot)...');
      await new Promise(r => setTimeout(r, 200));

      setScanStatusMsg('🤖 Bước 2/3: Gửi payload ảnh đến Gemini API (mô hình gemini-3.6-flash, vùng 80%-100%)...');
      
      const videoEl = videoElementRef.current;
      const result = await AITextDetectionEngine.detectChineseSubtitleBoxWithGemini(
        videoEl,
        previewCanvasRef.current
      );

      // 1. Lưu tọa độ vừa nhận từ Gemini vào state (Làm mờ tràn 100% toàn chiều ngang màn hình)
      setBlurBox({
        x: 0,
        y: result.y,
        w: 100,
        h: result.height
      });
      setFullWidthSpan(true);

      // 2. Kích hoạt ngay lập tức hiệu ứng làm mờ (blur(16px)) đúng vào vùng tọa độ vừa nhận
      setBlurIntensity(16);

      setScanStatusMsg(result.statusMessage);
    } catch (e: any) {
      console.warn('Lỗi nhận diện phụ đề qua Gemini API:', e);
      setBlurBox({ x: 0, y: 83, w: 100, h: 14 });
      setBlurIntensity(16);
      setScanStatusMsg('🛡️ Đã kích hoạt vùng che mờ mặc định an toàn (Y: 83%, Cao: 14%, Blur: 16px).');
    } finally {
      setIsScanningSub(false);
    }
  };

  const forceScanChineseSubtitles = async () => {
    if (!videoElementRef.current || !containerRef.current) {
      alert('Vui lòng chọn video trước ở mục 1!');
      return;
    }
    
    setIsForceScanning(true);
    setScanStatusMsg('⚡ Đang thực hiện Gemini AI Deep Scan...');

    try {
      const videoEl = videoElementRef.current;
      const result = await AITextDetectionEngine.detectChineseSubtitleBoxWithGemini(
        videoEl,
        previewCanvasRef.current
      );

      setBlurBox({
        x: 0,
        y: result.y,
        w: 100,
        h: result.height
      });
      setFullWidthSpan(true);

      setBlurIntensity(16);
      setScanStatusMsg(`⚡ Gemini AI Deep Scan hoàn tất: Y=${result.y}%, Cao=${result.height}% (Đã làm mờ 16px)`);
    } catch (e) {
      console.warn('Lỗi quét phụ đề:', e);
      setScanStatusMsg('❌ Lỗi khi thực hiện quét Gemini AI.');
    } finally {
      setIsForceScanning(false);
    }
  };

  const handleProcess = async () => {
    if (!videoFile || !videoUrl) {
      alert('Vui lòng chọn video gốc ở mục 1!');
      return;
    }

    setIsExporting(true);
    setExportProgress(0);
    setExportStatusText('Đang khởi tạo trình xuất video...');
    abortExportRef.current = false;

    try {
      await exportVideo(
        {
          videoFile,
          videoUrl,
          generatedAudioUrl,
          videoPlaybackRate,
          zoomLevel,
          isMirrored,
          blurIntensity,
          blurBox,
          showBgBar,
          logoUrl,
          logoX,
          logoY,
          logoScale,
          subtitles,
          isTextAutoCentered,
          textX,
          textY,
          fontSize,
          strokeWidth,
          volume,
          containerWidth: containerRef.current?.clientWidth || 800,
          syncCheckpoints,
          dubAudioPositions,
          isAborted: () => abortExportRef.current
        },
        (prog, msg) => {
          setExportProgress(prog);
          if (msg) setExportStatusText(msg);
        }
      );
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Lỗi khi xuất video:', error);
      alert('Đã xảy ra lỗi trong quá trình xuất video: ' + (error?.message || error));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 font-sans p-4 md:p-8 flex flex-col items-center">
      <div className="w-full max-w-5xl flex flex-col gap-10 mt-4">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-zinc-800 pb-6 gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              AI VIDEO PROCESSOR
            </h1>
          </div>
        </div>

        {/* Khối 1: NẠP TỆP ĐẦU VÀO */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="text-emerald-400 flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
              <CloudUpload size={20} />
              1. Nạp tệp đầu vào
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* File Input: Video */}
            <input 
              type="file" 
              accept=".mp4,.webm" 
              className="hidden" 
              ref={videoRef} 
              onChange={handleFileChange(setVideoFile)} 
            />
            <div 
              onClick={() => videoRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-6 flex flex-col gap-4 cursor-pointer transition-all ${
                videoFile ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-900'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className={`flex items-center gap-2 font-semibold ${videoFile ? 'text-emerald-400' : 'text-zinc-100'}`}>
                  <FileVideo size={20} />
                  Video gốc
                </div>
                {videoFile && <CheckCircle2 size={18} className="text-emerald-500" />}
              </div>
              <div className="text-sm">
                {videoFile ? (
                  <span className="text-emerald-300 break-all">{videoFile.name}</span>
                ) : (
                  <span className="text-zinc-500 font-medium">Chọn file .mp4, .webm</span>
                )}
              </div>
            </div>

            {/* File Input: Subtitle */}
            <input 
              type="file" 
              accept=".srt" 
              className="hidden" 
              ref={subtitleRef} 
              onChange={handleFileChange(setSubtitleFile)} 
            />
            <div 
              onClick={() => subtitleRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-6 flex flex-col gap-4 cursor-pointer transition-all ${
                subtitleFile ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-900'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className={`flex items-center gap-2 font-semibold ${subtitleFile ? 'text-emerald-400' : 'text-zinc-100'}`}>
                  <FileText size={20} />
                  Phụ đề SRT
                </div>
                {subtitleFile && <CheckCircle2 size={18} className="text-emerald-500" />}
              </div>
              <div className="text-sm">
                {subtitleFile ? (
                  <span className="text-emerald-300 break-all">{subtitleFile.name}</span>
                ) : (
                  <span className="text-zinc-500 font-medium">Chọn file .srt</span>
                )}
              </div>
            </div>

            {/* File Input: Logo */}
            <input 
              type="file" 
              accept=".png" 
              className="hidden" 
              ref={logoRef} 
              onChange={handleFileChange(setLogoFile)} 
            />
            <div 
              onClick={() => logoRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-6 flex flex-col gap-4 cursor-pointer transition-all ${
                logoFile ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-900'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className={`flex items-center gap-2 font-semibold ${logoFile ? 'text-emerald-400' : 'text-zinc-100'}`}>
                  <ImageIcon size={20} />
                  Logo kênh
                </div>
                {logoFile && <CheckCircle2 size={18} className="text-emerald-500" />}
              </div>
              <div className="text-sm">
                {logoFile ? (
                  <span className="text-emerald-300 break-all">{logoFile.name}</span>
                ) : (
                  <span className="text-zinc-500 font-medium">Chọn file .png</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Khối 2: PREVIEW VIDEO */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="text-emerald-400 flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
              <MonitorPlay size={20} />
              2. Preview Video
            </h2>
          </div>

          <div className="flex flex-col gap-4">
            {/* 16:9 Video Box */}
            <div 
              id="video-preview-container"
              ref={containerRef}
              onDoubleClick={handleFullscreen}
              className={`relative w-full aspect-video border border-zinc-800 bg-zinc-900 rounded-xl overflow-hidden flex items-center justify-center ${isEditing ? 'is-editing' : ''}`}
            >
              {!videoUrl ? (
                <p className="text-zinc-500 font-medium">
                  Chưa có Video. Vui lòng chọn file video ở mục 1.
                </p>
              ) : (
                <>
                  <video 
                    ref={videoElementRef}
                    src={videoUrl} 
                    className="hidden"
                    preload="auto"
                    playsInline
                    onTimeUpdate={handleTimeUpdate}
                    onPlay={() => { if (audioElementRef.current) audioElementRef.current.play(); }}
                    onPause={() => { if (audioElementRef.current) audioElementRef.current.pause(); }}
                    onSeeked={(e) => { 
                      if (audioElementRef.current) {
                        const targetAudioTime = generatedAudioUrl 
                          ? videoTimeToAudioTime(e.currentTarget.currentTime, syncCheckpoints, videoPlaybackRate) 
                          : e.currentTarget.currentTime;
                        audioElementRef.current.currentTime = targetAudioTime;
                      } 
                    }}
                    onWaiting={() => { if (audioElementRef.current) audioElementRef.current.pause(); }}
                    onPlaying={() => { if (audioElementRef.current) audioElementRef.current.play(); }}
                    onLoadedMetadata={(e) => {
                      if (previewCanvasRef.current) {
                        previewCanvasRef.current.width = e.currentTarget.videoWidth || 1280;
                        previewCanvasRef.current.height = e.currentTarget.videoHeight || 720;
                      }
                      e.currentTarget.currentTime = 0.001;
                      setBlurBox(prev => prev.h > 0 ? prev : { x: 0, y: 83, w: 100, h: 14 });
                    }}
                  />
                  {generatedAudioUrl && (
                    <audio 
                      ref={audioElementRef} 
                      src={generatedAudioUrl} 
                      preload="auto"
                      onLoadedMetadata={(e) => {
                         if (videoElementRef.current) {
                           const targetAudioTime = generatedAudioUrl 
                             ? videoTimeToAudioTime(videoElementRef.current.currentTime, syncCheckpoints, videoPlaybackRate) 
                             : videoElementRef.current.currentTime;
                           e.currentTarget.currentTime = targetAudioTime;
                         }
                      }}
                    />
                  )}
                  
                  <canvas 
                    ref={previewCanvasRef}
                    className="w-full h-full object-contain cursor-pointer absolute inset-0 z-10 pointer-events-auto"
                    onClick={togglePlayPause}
                  />

                  {/* Alignment Guides */}
                  {isEditing && (
                    <>
                      <div className={`alignment-guide-h ${showGuideH ? 'show-guide' : ''}`}></div>
                      <div className={`alignment-guide-v ${showGuideV ? 'show-guide' : ''}`}></div>
                    </>
                  )}

                  {/* Floating Controls */}
                  <div className="floating-controls absolute top-4 right-4 z-50 flex gap-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setIsEditing(!isEditing); }}
                      className={`p-2 rounded-lg backdrop-blur-md bg-black/40 border transition-colors ${isEditing ? 'border-emerald-500 text-emerald-400' : 'border-zinc-700 text-zinc-300 hover:text-emerald-400'}`}
                      title="Chế độ chỉnh sửa (Edit Mode)"
                    >
                      <Pen size={18} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setShowTimeline(!showTimeline); }}
                      className={`p-2 rounded-lg backdrop-blur-md bg-black/40 border transition-colors ${showTimeline ? 'border-emerald-500 text-emerald-400' : 'border-zinc-700 text-zinc-300 hover:text-emerald-400'}`}
                      title="Ẩn/Hiện thanh tua video"
                    >
                      <Eye size={18} />
                    </button>
                  </div>

                  {(activePanel === 'blur' || blurIntensity > 0) && (
                    <div
                      id="blur-box"
                      ref={blurBoxRef}
                      onMouseDown={(e) => handleMouseDown(e, 'blur')}
                      onWheel={(e) => {
                        e.preventDefault();
                        if (e.deltaY < 0) {
                          setBlurIntensity(prev => Math.min(50, prev + 1));
                        } else {
                          setBlurIntensity(prev => Math.max(0, prev - 1));
                        }
                      }}
                      style={{
                        position: 'absolute',
                        left: '0%',
                        top: `${blurBox.y}%`,
                        width: '100%',
                        height: `${blurBox.h}%`,
                        maxWidth: '100%',
                        maxHeight: `calc(100% - ${blurBox.y}%)`,
                        zIndex: 15,
                        boxSizing: 'border-box',
                        border: isEditing ? '2px dashed rgba(16, 185, 129, 0.8)' : 'none',
                        cursor: isEditing ? 'ns-resize' : 'default'
                      }}
                    >
                      {isEditing && (
                        <div className="resize-handle">
                          <div className="w-2 h-2 border-b-2 border-r-2 border-emerald-500 pointer-events-none"></div>
                        </div>
                      )}
                    </div>
                  )}

                  {logoUrl && (
                    <div
                      id="logo-overlay-container"
                      ref={logoImgRef}
                      onMouseDown={(e) => handleMouseDown(e, 'logo')}
                      style={{
                        position: 'absolute',
                        left: `${logoX}%`,
                        top: `${logoY}%`,
                        width: `${logoScale}%`,
                        maxWidth: '100%',
                        transform: 'translate(-50%, -50%)',
                        zIndex: 20,
                        border: isEditing ? '1px dashed rgba(16, 185, 129, 0.5)' : 'none',
                        cursor: isEditing ? 'move' : 'default'
                      }}
                    >
                      <img 
                        id="logo-overlay"
                        src={logoUrl}
                        alt="Logo"
                        draggable="false"
                        className="w-full h-auto block pointer-events-none opacity-0"
                      />
                      {isEditing && (
                        <div className="resize-handle logo-resize-handle">
                          <div className="w-2 h-2 border-b-2 border-r-2 border-emerald-500 pointer-events-none"></div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* DOM Subtitles removed - rendered on Canvas instead */}

                  {/* Custom Seekbar & Playback Controls */}
                  {showTimeline && (
                    <div className="video-playback-controls absolute bottom-0 left-0 w-full z-50 flex items-center gap-4 px-4 pb-3 pt-6 bg-gradient-to-t from-black/80 to-transparent">
                      <button
                        id="btn-rewind"
                        onClick={(e) => { e.stopPropagation(); skipBackward(); }}
                        className="p-1.5 rounded-full text-zinc-300 hover:text-emerald-400 hover:bg-white/10 transition-colors flex items-center justify-center relative"
                        title="Tua lại 5s (Arrow Left)"
                      >
                        <RotateCcw size={20} />
                        <span className="text-[9px] absolute font-bold leading-none" style={{ marginTop: '2px' }}>5</span>
                      </button>
                      
                      <input 
                        type="range" 
                        id="custom-seekbar"
                        className="flex-1 cursor-pointer"
                        min="0"
                        max="100"
                        step="0.1"
                        value={videoProgress}
                        onChange={handleSeek}
                        onMouseDown={(e) => e.stopPropagation()}
                      />

                      <button
                        id="btn-forward"
                        onClick={(e) => { e.stopPropagation(); skipForward(); }}
                        className="p-1.5 rounded-full text-zinc-300 hover:text-emerald-400 hover:bg-white/10 transition-colors flex items-center justify-center relative"
                        title="Tua tới 5s (Arrow Right)"
                      >
                        <RotateCw size={20} />
                        <span className="text-[9px] absolute font-bold leading-none" style={{ marginTop: '2px' }}>5</span>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Toolbar */}
            <div className="flex flex-col gap-4 items-center" ref={toolbarRef}>
              <div className="inline-flex items-center gap-2 p-1.5 border border-zinc-800 bg-zinc-900 rounded-lg shadow-sm">
                <button onClick={() => setActivePanel(activePanel === 'blur' ? null : 'blur')} title="Làm mờ" className={`p-2.5 rounded transition-colors ${activePanel === 'blur' ? 'bg-emerald-500/10 text-emerald-400' : 'hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400'}`}>
                  <Droplet size={20} />
                </button>
                <button onClick={() => setActivePanel(activePanel === 'text' ? null : 'text')} title="Văn bản" className={`p-2.5 rounded transition-colors ${activePanel === 'text' ? 'bg-emerald-500/10 text-emerald-400' : 'hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400'}`}>
                  <Type size={20} />
                </button>
                <button onClick={() => setActivePanel(activePanel === 'logo' ? null : 'logo')} title="Logo" className={`p-2.5 rounded transition-colors ${activePanel === 'logo' ? 'bg-emerald-500/10 text-emerald-400' : 'hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400'}`}>
                  <ImageIcon size={20} />
                </button>
                <div className="w-px h-6 bg-zinc-700 mx-1"></div>
                <button onClick={() => setActivePanel(activePanel === 'zoom' ? null : 'zoom')} title="Thu phóng" className={`p-2.5 rounded transition-colors ${activePanel === 'zoom' ? 'bg-emerald-500/10 text-emerald-400' : 'hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400'}`}>
                  <ZoomIn size={20} />
                </button>
                <button onClick={() => setActivePanel(activePanel === 'mirror' ? null : 'mirror')} title="Đảo ngược" className={`p-2.5 rounded transition-colors ${activePanel === 'mirror' ? 'bg-emerald-500/10 text-emerald-400' : 'hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400'}`}>
                  <FlipHorizontal size={20} />
                </button>
                <button onClick={() => setActivePanel(activePanel === 'volume' ? null : 'volume')} title="Âm lượng" className={`p-2.5 rounded transition-colors ${activePanel === 'volume' ? 'bg-emerald-500/10 text-emerald-400' : 'hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400'}`}>
                  <Volume2 size={20} />
                </button>
                <div className="w-px h-6 bg-zinc-700 mx-1"></div>
                <button onClick={handleFullscreen} title="Toàn màn hình" className="p-2.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 transition-colors">
                  <Maximize size={20} />
                </button>
              </div>

              {/* Settings Panels */}
              {activePanel === 'blur' && (
                <div className="w-full max-w-lg p-5 border border-zinc-800 bg-zinc-900 rounded-xl flex flex-col gap-5 animate-in fade-in slide-in-from-top-2 shadow-xl">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                      <Droplet size={18} />
                      <span>Che Phụ đề Tiếng Trung (Blur Box Parameters)</span>
                    </div>
                  </div>

                  {/* Intensity Slider */}
                  <div className="flex flex-col gap-2 bg-zinc-950 p-3.5 border border-zinc-800/80 rounded-lg">
                    <div className="flex justify-between items-center text-xs font-semibold text-zinc-300">
                      <span>Độ mờ khối (Blur Intensity)</span>
                      <div className="flex items-center gap-2">
                        <input 
                          type="number" 
                          min="0" 
                          max="50" 
                          value={blurIntensity} 
                          onChange={e => setBlurIntensity(Math.min(50, Math.max(0, parseInt(e.target.value) || 0)))}
                          className="w-16 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-center text-emerald-400 font-bold text-xs outline-none focus:border-emerald-500"
                        />
                        <span className="text-zinc-500 text-[11px]">px</span>
                      </div>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="50" 
                      value={blurIntensity} 
                      onChange={e => setBlurIntensity(Number(e.target.value))} 
                      className="accent-emerald-500 w-full cursor-pointer h-1.5 bg-zinc-800 rounded-lg" 
                    />
                  </div>

                  {/* AI Auto-Blur Scan Buttons */}
                  <div className="flex flex-col">
                    <button
                      onClick={detectAndFitChineseSubtitles}
                      onDoubleClick={forceScanChineseSubtitles}
                      title="Bấm để quét tự động. Nhấp đúp để ép quét sâu (Force Scan)."
                      disabled={isScanningSub || isForceScanning}
                      className="w-full py-2.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-xs shadow-sm"
                    >
                      {(isScanningSub || isForceScanning) ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Đang xử lý tọa độ...</span>
                        </>
                      ) : (
                        <>
                          <Scan size={16} />
                          <span>Tự động Nhận diện (AI)</span>
                        </>
                      )}
                    </button>

                    <div className={`transition-all duration-500 overflow-hidden ${scanStatusMsg ? 'max-h-20 opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0'}`}>
                      {scanStatusMsg && (
                        <div className="p-2.5 bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 rounded-lg text-[11px] leading-relaxed shadow-inner">
                          {scanStatusMsg}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Full Width Info Card */}
                  <div className="flex items-center justify-between bg-zinc-950 p-3.5 border border-emerald-500/30 rounded-lg">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        Chiều ngang: Toàn màn hình (100% Full Width)
                      </span>
                      <span className="text-[11px] text-zinc-400">Khối mờ phủ toàn bộ chiều ngang video để che triệt để phụ đề</span>
                    </div>
                  </div>

                  {/* Coordinate Controls: Focus on Y Position & Height H */}
                  <div className="flex flex-col gap-3 bg-zinc-950 p-4 border border-zinc-800 rounded-lg">
                    <div className="flex justify-between items-center text-xs font-bold text-zinc-300 border-b border-zinc-800/80 pb-2">
                      <span>Điều chỉnh Vị trí & Chiều cao Vùng Che Mờ (%)</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      {/* Y Parameter */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center text-zinc-300 font-semibold">
                          <span>Vị trí Y (% từ trên xuống)</span>
                          <input 
                            type="number" 
                            step="0.5"
                            value={blurBox.y} 
                            onChange={e => setBlurBox(p => ({ ...p, y: parseFloat(e.target.value) || 0 }))} 
                            className="w-16 px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-right text-emerald-400 outline-none focus:border-emerald-500 font-mono font-bold"
                          />
                        </div>
                        <input 
                          type="range" 
                          min="0" 
                          max="100" 
                          step="0.5" 
                          value={blurBox.y} 
                          onChange={e => setBlurBox(p => ({ ...p, y: parseFloat(e.target.value) || 0 }))} 
                          className="accent-emerald-500 w-full cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                        />
                      </div>

                      {/* H Parameter */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center text-zinc-400 font-medium">
                          <span>Chiều cao H (%)</span>
                          <input 
                            type="number" 
                            step="0.5"
                            value={blurBox.h} 
                            onChange={e => setBlurBox(p => ({ ...p, h: parseFloat(e.target.value) || 0 }))} 
                            className="w-16 px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-right text-zinc-200 outline-none focus:border-emerald-500 font-mono"
                          />
                        </div>
                        <input 
                          type="range" 
                          min="1" 
                          max="50" 
                          step="0.5" 
                          value={blurBox.h} 
                          onChange={e => setBlurBox(p => ({ ...p, h: parseFloat(e.target.value) || 0 }))} 
                          className="accent-emerald-500 w-full cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activePanel === 'text' && (
                <div className="w-full max-w-lg p-5 border border-zinc-800 bg-zinc-900 rounded-xl flex flex-col gap-5 animate-in fade-in slide-in-from-top-2 shadow-xl">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                      <Type size={18} />
                      <span>Thông số Phụ đề (CapCut Font & Stroke)</span>
                    </div>
                  </div>

                  <div className="flex justify-start">
                    <button
                      id="btn-center-text-blur"
                      onClick={() => {
                        const nextState = !isTextAutoCentered;
                        setIsTextAutoCentered(nextState);
                        if (nextState) {
                          // 1. Tính toán giá trị phần trăm (%) thời gian thực
                          // 2. Cập nhật DOM / Slider Elements
                          setTextX(50);
                          setTextY(Number((blurBox.y + blurBox.h / 2).toFixed(1)));
                        }
                      }}
                      className={`py-2 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors text-xs ${
                        isTextAutoCentered 
                          ? 'bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)]' 
                          : 'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700'
                      }`}
                    >
                      <AlignCenter size={16} />
                      <span>Căn giữa chữ vào vùng mờ</span>
                    </button>
                  </div>

                  {/* Dual Slider & Numeric Controls for Text Parameters */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    {/* Cỡ chữ */}
                    <div className="flex flex-col gap-1.5 bg-zinc-950 p-3 border border-zinc-800/80 rounded-lg">
                      <div className="flex justify-between items-center text-zinc-300 font-medium">
                        <span>Cỡ chữ (Font Size)</span>
                        <div className="flex items-center gap-1">
                          <input 
                            type="number" 
                            min="1" 
                            max="200" 
                            value={fontSize} 
                            onChange={e => setFontSize(Math.min(200, Math.max(1, parseInt(e.target.value) || 1)))} 
                            className="w-14 px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-right text-emerald-400 font-bold font-mono outline-none focus:border-emerald-500" 
                          />
                          <span className="text-zinc-500 text-[10px]">px</span>
                        </div>
                      </div>
                      <input 
                        type="range" 
                        min="1" 
                        max="200" 
                        value={fontSize} 
                        onChange={e => setFontSize(Number(e.target.value))} 
                        className="accent-emerald-500 w-full cursor-pointer h-1.5 bg-zinc-800 rounded-lg" 
                      />
                    </div>

                    {/* Độ dày viền */}
                    <div className="flex flex-col gap-1.5 bg-zinc-950 p-3 border border-zinc-800/80 rounded-lg">
                      <div className="flex justify-between items-center text-zinc-300 font-medium">
                        <span>Độ dày Viền đen</span>
                        <div className="flex items-center gap-1">
                          <input 
                            type="number" 
                            min="1" 
                            max="100" 
                            value={strokeWidth} 
                            onChange={e => setStrokeWidth(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))} 
                            className="w-14 px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-right text-emerald-400 font-bold font-mono outline-none focus:border-emerald-500" 
                          />
                          <span className="text-zinc-500 text-[10px]">pt</span>
                        </div>
                      </div>
                      <input 
                        type="range" 
                        min="1" 
                        max="100" 
                        value={strokeWidth} 
                        onChange={e => setStrokeWidth(Number(e.target.value))} 
                        className="accent-emerald-500 w-full cursor-pointer h-1.5 bg-zinc-800 rounded-lg" 
                      />
                    </div>

                    {/* Tọa độ X */}
                    <div className="flex flex-col gap-1.5 bg-zinc-950 p-3 border border-zinc-800/80 rounded-lg">
                      <div className="flex justify-between items-center text-zinc-300 font-medium">
                        <span>Vị trí X (% ngang)</span>
                        <input 
                          type="number" 
                          step="0.5" 
                          value={textX} 
                          onChange={e => {
                            setTextX(e.target.value === '' ? 0 : parseFloat(e.target.value));
                            // 3. Ràng buộc Trạng thái (Two-way Data Binding)
                            setIsTextAutoCentered(false);
                          }} 
                          className="w-14 px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-right text-zinc-200 font-mono outline-none focus:border-emerald-500" 
                        />
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        step="0.5" 
                        value={textX} 
                        onChange={e => {
                          setTextX(parseFloat(e.target.value));
                          setIsTextAutoCentered(false);
                        }} 
                        className="accent-emerald-500 w-full cursor-pointer h-1.5 bg-zinc-800 rounded-lg" 
                      />
                    </div>

                    {/* Tọa độ Y */}
                    <div className="flex flex-col gap-1.5 bg-zinc-950 p-3 border border-zinc-800/80 rounded-lg">
                      <div className="flex justify-between items-center text-zinc-300 font-medium">
                        <span>Vị trí Y (% dọc)</span>
                        <input 
                          type="number" 
                          step="0.5" 
                          value={textY} 
                          onChange={e => {
                            setTextY(e.target.value === '' ? 0 : parseFloat(e.target.value));
                            // 3. Ràng buộc Trạng thái (Two-way Data Binding)
                            setIsTextAutoCentered(false);
                          }} 
                          className="w-14 px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-right text-zinc-200 font-mono outline-none focus:border-emerald-500" 
                        />
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        step="0.5" 
                        value={textY} 
                        onChange={e => {
                          setTextY(parseFloat(e.target.value));
                          setIsTextAutoCentered(false);
                        }} 
                        className="accent-emerald-500 w-full cursor-pointer h-1.5 bg-zinc-800 rounded-lg" 
                      />
                    </div>
                  </div>

                  {/* Live Rendered Text Preview */}
                  <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg flex flex-col items-center justify-center min-h-[85px] gap-1 relative overflow-hidden">
                    <div
                      style={{
                        whiteSpace: 'nowrap',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: showBgBar ? '4px 20px' : '0px',
                        background: showBgBar 
                          ? 'linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.65) 12%, rgba(0,0,0,0.65) 88%, rgba(0,0,0,0) 100%)' 
                          : 'transparent',
                        borderRadius: '4px',
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className="opacity-0 select-none pointer-events-none"
                        style={{
                          fontFamily: 'Bangers, cursive, sans-serif',
                          fontSize: `${Math.min(36, Math.max(16, fontSize * 0.75))}px`,
                          fontWeight: 'bold',
                          letterSpacing: '1px',
                          whiteSpace: 'nowrap',
                          lineHeight: 1.15,
                          padding: `0 ${(strokeWidth * 0.05 + 6).toFixed(2)}px`,
                          display: 'inline-block',
                        }}
                      >
                        VĂN BẢN MẪU CapCut
                      </span>

                      <svg
                        className="absolute inset-0 w-full h-full overflow-visible select-none pointer-events-none block"
                        style={{ overflow: 'visible' }}
                      >
                        <text
                          x="50%"
                          y="50%"
                          dominantBaseline="central"
                          textAnchor="middle"
                          fill="#FFFFFF"
                          stroke="#000000"
                          strokeWidth={Number((strokeWidth * 0.12 * (Math.min(36, Math.max(16, fontSize * 0.75)) / 24)).toFixed(2))}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          paintOrder="stroke fill"
                          style={{
                            fontFamily: 'Bangers, cursive, sans-serif',
                            fontSize: `${Math.min(36, Math.max(16, fontSize * 0.75))}px`,
                            fontWeight: 'bold',
                            letterSpacing: '1px',
                          }}
                        >
                          VĂN BẢN MẪU CapCut
                        </text>
                      </svg>
                    </div>
                  </div>
                </div>
              )}

              {activePanel === 'logo' && (
                <div className="w-full max-w-lg p-5 border border-zinc-800 bg-zinc-900 rounded-xl flex flex-col gap-5 animate-in fade-in slide-in-from-top-2 shadow-xl">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                      <ImageIcon size={18} />
                      <span>Thông số Logo (Scale & Positioning)</span>
                    </div>
                    <div className="flex gap-1.5 text-[11px]">
                      <button 
                        type="button"
                        onClick={() => handleAlignLogo('top-left')}
                        className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 active:bg-emerald-600 text-zinc-300 hover:text-white rounded font-medium transition-colors cursor-pointer text-xs"
                        title="Góc Trái-Trên (Sát mép trên cùng góc trái)"
                      >
                        Góc Trái-Trên
                      </button>
                      <button 
                        type="button"
                        onClick={() => handleAlignLogo('top-right')}
                        className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 active:bg-emerald-600 text-zinc-300 hover:text-white rounded font-medium transition-colors cursor-pointer text-xs"
                        title="Góc Phải-Trên (Sát mép trên cùng góc phải)"
                      >
                        Góc Phải-Trên
                      </button>
                    </div>
                  </div>

                  {/* Dual Slider & Numeric Controls for Logo Parameters */}
                  <div className="flex flex-col gap-3">
                    {/* Scale */}
                    <div className="flex flex-col gap-1.5 bg-zinc-950 p-3 border border-zinc-800/80 rounded-lg text-xs">
                      <div className="flex justify-between items-center text-zinc-300 font-medium">
                        <span>Thu phóng Logo (Scale %)</span>
                        <div className="flex items-center gap-1">
                          <input 
                            type="number" 
                            min="10" 
                            max="300" 
                            value={logoScale} 
                            onChange={e => setLogoScale(Math.min(300, Math.max(10, parseInt(e.target.value) || 10)))} 
                            className="w-16 px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-right text-emerald-400 font-bold font-mono outline-none focus:border-emerald-500" 
                          />
                          <span className="text-zinc-500 text-[10px]">%</span>
                        </div>
                      </div>
                      <input 
                        type="range" 
                        min="10" 
                        max="300" 
                        value={logoScale} 
                        onChange={e => setLogoScale(Number(e.target.value))} 
                        className="accent-emerald-500 w-full cursor-pointer h-1.5 bg-zinc-800 rounded-lg" 
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {/* Tọa độ X */}
                      <div className="flex flex-col gap-1.5 bg-zinc-950 p-3 border border-zinc-800/80 rounded-lg">
                        <div className="flex justify-between items-center text-zinc-300 font-medium">
                          <span>Vị trí X (% ngang)</span>
                          <input 
                            type="number" 
                            step="0.5" 
                            value={logoX} 
                            onChange={e => setLogoX(e.target.value === '' ? 0 : parseFloat(e.target.value))} 
                            className="w-16 px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-right text-zinc-200 font-mono outline-none focus:border-emerald-500" 
                          />
                        </div>
                        <input 
                          type="range" 
                          min="0" 
                          max="100" 
                          step="0.5" 
                          value={logoX} 
                          onChange={e => setLogoX(parseFloat(e.target.value))} 
                          className="accent-emerald-500 w-full cursor-pointer h-1.5 bg-zinc-800 rounded-lg" 
                        />
                      </div>

                      {/* Tọa độ Y */}
                      <div className="flex flex-col gap-1.5 bg-zinc-950 p-3 border border-zinc-800/80 rounded-lg">
                        <div className="flex justify-between items-center text-zinc-300 font-medium">
                          <span>Vị trí Y (% dọc)</span>
                          <input 
                            type="number" 
                            step="0.5" 
                            value={logoY} 
                            onChange={e => setLogoY(e.target.value === '' ? 0 : parseFloat(e.target.value))} 
                            className="w-16 px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-right text-zinc-200 font-mono outline-none focus:border-emerald-500" 
                          />
                        </div>
                        <input 
                          type="range" 
                          min="0" 
                          max="100" 
                          step="0.5" 
                          value={logoY} 
                          onChange={e => setLogoY(parseFloat(e.target.value))} 
                          className="accent-emerald-500 w-full cursor-pointer h-1.5 bg-zinc-800 rounded-lg" 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activePanel === 'zoom' && (
                <div className="w-full max-w-lg p-5 border border-zinc-800 bg-zinc-900 rounded-xl flex flex-col gap-4 animate-in fade-in slide-in-from-top-2">
                  <label className="flex flex-col gap-3 text-sm font-medium text-zinc-300">
                    <div className="flex justify-between">
                      <span>Thu phóng (Zoom)</span>
                      <span className="text-emerald-400">{zoomLevel}%</span>
                    </div>
                    <input type="range" min="90" max="110" value={zoomLevel} onChange={e => setZoomLevel(Number(e.target.value))} className="accent-emerald-500 w-full" />
                  </label>
                </div>
              )}

              {activePanel === 'mirror' && (
                <div className="w-full max-w-lg p-5 border border-zinc-800 bg-zinc-900 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                  <span className="text-sm font-medium text-zinc-300">Đảo ngược video theo chiều ngang (Mirror)</span>
                  <button 
                    onClick={() => setIsMirrored(!isMirrored)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-900 ${isMirrored ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                  >
                    <span className="sr-only">Toggle mirror</span>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isMirrored ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              )}

              {activePanel === 'volume' && (
                <div className="w-full max-w-lg p-5 border border-zinc-800 bg-zinc-900 rounded-xl flex flex-col gap-4 animate-in fade-in slide-in-from-top-2">
                  <label className="flex flex-col gap-3 text-sm font-medium text-zinc-300">
                    <div className="flex justify-between">
                      <span>Âm lượng (Volume)</span>
                      <span className="text-emerald-400">{volume > 0 ? '+' : ''}{volume}%</span>
                    </div>
                    <input type="range" min="-50" max="50" value={volume} onChange={e => setVolume(Number(e.target.value))} className="accent-emerald-500 w-full" />
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Khối 3: LỒNG TIẾNG AI CAPCUT & PHỤ ĐỀ SRT */}
        <div className="flex flex-col gap-4 bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 shadow-xl">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <h2 className="text-emerald-400 text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                3. Lồng Tiếng AI CapCut & Phụ Đề
              </h2>
              <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-[11px] font-medium ml-2">
                ⚡ SRT 0.5x
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerateAudioTimeline}
                disabled={isGeneratingAudioTimeline || subtitles.length === 0}
                className="px-3.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
                title="Xuất file âm thanh timeline hoàn chỉnh khớp thời gian phụ đề"
              >
                {isGeneratingAudioTimeline ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>{audioTimelineProgress || "Đang tổng hợp..."}</span>
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    <span>Tạo & Xuất MP3 Khớp Video ({subtitles.length} câu)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between bg-zinc-950 p-3 rounded-lg border border-zinc-800">
            <span className="text-xs text-zinc-400 font-medium">Chọn giọng đọc AI:</span>
            <select 
              value={Object.keys(VIETNAM_VOICE_PROFILES).find(
                k => VIETNAM_VOICE_PROFILES[k].name === voiceProfile.name
              )}
              onChange={(e) => setVoiceProfile(VIETNAM_VOICE_PROFILES[e.target.value])}
              className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="vn_female_neutral">Cô gái hoạt ngôn (chuẩn)</option>
              <option value="vn_female_bright">Cô gái hoạt ngôn (vui vẻ)</option>
              <option value="vn_female_professional">Cô gái hoạt ngôn (chuyên nghiệp)</option>
            </select>
          </div>

          {/* Danh sách Subtitle hiển thị chế độ nghe thử từng câu */}
          <div className="srt-preview-container" style={{ marginTop: '10px', background: '#121214', border: '1px solid #27272a', borderRadius: '6px', maxHeight: '250px', overflowY: 'auto', padding: '8px' }}>
            {subtitles.length === 0 ? (
              <div className="p-4 text-center text-zinc-500 text-xs">
                Chưa có phân đoạn phụ đề. Vui lòng nạp tệp .srt ở mục 1.
              </div>
            ) : (
              subtitles.map((sub, idx) => (
                <div 
                  key={idx} 
                  className="srt-item hover:bg-zinc-900/80 transition-colors" 
                  data-index={idx + 1} 
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderBottom: '1px solid #1f1f23', fontSize: '13px', color: '#d4d4d8' }}
                >
                  <div 
                    style={{ display: 'flex', gap: '10px', alignItems: 'center', cursor: 'pointer', flex: 1, minWidth: 0 }}
                    onClick={() => {
                      if (videoElementRef.current) {
                        videoElementRef.current.currentTime = sub.start;
                        videoElementRef.current.play();
                      }
                    }}
                    title="Bấm để nhảy video tới thời điểm này"
                  >
                    <span style={{ color: '#71717a', fontSize: '11px', fontFamily: 'monospace', flexShrink: 0 }}>
                      {formatMsToTimestamp(sub.start * 1000)} --&gt; {formatMsToTimestamp(sub.end * 1000)}
                    </span>
                    <span className="srt-text truncate" style={{ color: '#d4d4d8' }}>{sub.text}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Action Button */}
        <button 
          id="process-btn"
          onClick={handleProcess}
          disabled={isExporting}
          className={`w-full mt-4 py-4 font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(16,185,129,0.2)] ${
            isExporting 
              ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed border border-zinc-700 shadow-none' 
              : 'bg-emerald-500 hover:bg-emerald-400 text-emerald-950 hover:shadow-[0_0_25px_rgba(16,185,129,0.4)]'
          }`}
        >
          {isExporting ? (
            <>
              <Loader2 className="animate-spin" size={22} />
              ĐANG XỬ LÝ & XUẤT VIDEO ({exportProgress}%)
            </>
          ) : (
            <>
              <Film size={22} />
              BẮT ĐẦU XỬ LÝ
            </>
          )}
        </button>

      </div>

      {/* Processing & Exporting Modal Overlay */}
      {isExporting && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl flex flex-col gap-6 relative">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-3 text-emerald-400 font-bold text-lg">
                <Loader2 className="animate-spin" size={24} />
                <span>Đang xử lý Video</span>
              </div>
              <button 
                onClick={() => { abortExportRef.current = true; }} 
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                title="Hủy tiến trình"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center text-sm font-semibold">
                <span className="text-zinc-300">{exportStatusText || 'Đang render khung hình...'}</span>
                <span className="text-emerald-400 font-bold text-base">{exportProgress}%</span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-zinc-950 rounded-full h-3 overflow-hidden border border-zinc-800 p-0.5">
                <div 
                  className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-full rounded-full transition-all duration-150 ease-out"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            </div>

            <div className="p-4 bg-zinc-950/80 border border-zinc-800/80 rounded-xl text-xs text-zinc-400 flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-zinc-300 font-medium">
                <Download size={14} className="text-emerald-400" />
                <span>Tự động tải về khi hoàn tất</span>
              </div>
              <p className="text-zinc-500 leading-relaxed">
                Hệ thống đang lồng ghép toàn bộ các lớp (Phụ đề Bangers, Khối Blur, Logo & Đảo chiều video). Vui lòng giữ trình duyệt mở.
              </p>
            </div>

            <button
              onClick={() => { abortExportRef.current = true; }}
              className="w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-sm font-medium rounded-xl transition-colors border border-zinc-700"
            >
              Hủy tiến trình xuất file
            </button>
          </div>
        </div>
      )}

      {/* Modal Script Python & Hướng Dẫn Máy Tính */}
      {showPythonModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-zinc-800 bg-zinc-950/60">
              <div className="flex items-center gap-2">
                <span className="text-xl">🐍</span>
                <h3 className="text-emerald-400 font-bold text-base">Script Python Tự Động Lồng Tiếng CapCut (vn_003) & Sync Video</h3>
              </div>
              <button 
                onClick={() => setShowPythonModal(false)}
                className="text-zinc-400 hover:text-white text-lg font-bold p-1 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs text-zinc-300 leading-relaxed">
              <div className="p-3 bg-emerald-950/30 border border-emerald-500/20 rounded-xl text-emerald-300">
                📌 <strong>Quy trình xử lý tự động:</strong>
                <ol className="list-decimal pl-5 mt-1 space-y-1 text-[11px]">
                  <li>Tự động scale thời gian tệp SRT về <strong>0.5x</strong> (kéo giãn mốc thời gian gấp đôi).</li>
                  <li>Gọi API CapCut lồng tiếng giọng <strong>Cô gái hoạt ngôn (vn_003)</strong> với Session ID <code>3805a2f884764f5cd3d5393136d15802</code>.</li>
                  <li>Tăng tốc file MP3 tổng kết hợp lên <strong>1.9x</strong> để giữ nhịp phim chậm vừa phải.</li>
                  <li>Căn chỉnh toàn bộ Video & Phụ đề SRT khớp chính xác tuyệt đối với file MP3 đã xử lý.</li>
                </ol>
              </div>

              <div>
                <h4 className="text-sm font-bold text-white mb-2">1. Cài đặt thư viện yêu cầu trên Máy tính (CMD / Terminal)</h4>
                <pre className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-emerald-400 font-mono text-[11px] overflow-x-auto select-all">
                  pip install capcut-tts-api pydub moviepy tqdm
                </pre>
                <p className="mt-1 text-[11px] text-zinc-400">* Lưu ý: Bạn cần cài đặt FFmpeg trên máy tính và thêm vào PATH để <code>pydub</code> & <code>moviepy</code> hoạt động mượt mà.</p>
              </div>

              <div>
                <h4 className="text-sm font-bold text-white mb-2">2. Mã nguồn Python Tối Ưu Đa Luồng & Tốc Độ Cao (main.py)</h4>
                <pre className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 font-mono text-[11px] overflow-x-auto select-all whitespace-pre">
{`import os
import re
import gc
from concurrent.futures import ThreadPoolExecutor, as_completed
from pydub import AudioSegment
from pydub.effects import speedup
from capcut_tts_api import CapCutClient
import moviepy.editor as mp
from tqdm import tqdm

SESSION_ID = "3805a2f884764f5cd3d5393136d15802"
VOICE_TYPE = "vn_003"  # Cô gái hoạt ngôn
SRT_PATH = "subtitle.srt"
VIDEO_PATH = "input_video.mp4"
FINAL_AUDIO_MP3 = "final_audio_1.9x.mp3"
FINAL_VIDEO_OUTPUT = "final_output_synced.mp4"
MAX_WORKERS = 8  # Đa luồng tải song song 8 câu cùng lúc

# 1. Phân Tích & Scale SRT 0.5x
def parse_and_scale_srt(srt_file, scale_factor=0.5):
    with open(srt_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    pattern = re.compile(
        r'(\\d+)\\n(\\d{2}):(\\d{2}):(\\d{2})[,.](\\d{3})\\s*-->\\s*(\\d{2}):(\\d{2}):(\\d{2})[,.](\\d{3})\\n(.*?)(?=\\n\\n|\\Z)',
        re.DOTALL
    )
    
    subtitles = []
    for match in pattern.findall(content):
        start_ms = ((int(match[1])*3600 + int(match[2])*60 + int(match[3]))*1000 + int(match[4])) / scale_factor
        end_ms = ((int(match[5])*3600 + int(match[6])*60 + int(match[7]))*1000 + int(match[8])) / scale_factor
        text = match[9].replace('\\n', ' ').strip()
        subtitles.append({"start": int(start_ms), "end": int(end_ms), "text": text})
    return subtitles

# 2. Hàm Tải TTS Từng Câu (Dành cho Đa Luồng)
def fetch_tts_segment(idx, text, client):
    try:
        res = client.generate_speech(texts=text, voice=VOICE_TYPE, rate="1.0", wait=True)
        audio_file = res.get('filename') or res.get('file_path') or f'temp_{idx}.mp3'
        if os.path.exists(audio_file):
            seg = AudioSegment.from_file(audio_file)
            try:
                os.remove(audio_file)
            except Exception:
                pass
            return idx, seg
    except Exception as e:
        print(f"\\n⚠️ Lỗi tải TTS câu {idx+1}: {e}")
    return idx, None

# 3. Luồng Xử Lý Chính
def main():
    os.environ["CAPCUT_SESSION_ID"] = SESSION_ID
    client = CapCutClient()
    
    print("📜 Đang đọc và scale tệp SRT về 0.5x...")
    subs = parse_and_scale_srt(SRT_PATH, scale_factor=0.5)
    total_subs = len(subs)
    print(f"✅ Đã tải {total_subs} câu phụ đề.")

    # Tải TTS đa luồng song song
    audio_results = [None] * total_subs
    print(f"🚀 Bắt đầu gọi CapCut TTS Đa Luồng ({MAX_WORKERS} workers) cho giọng Cô gái hoạt ngôn (vn_003)...")
    
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(fetch_tts_segment, idx, sub["text"], client): idx 
            for idx, sub in enumerate(subs)
        }
        
        for future in tqdm(as_completed(futures), total=total_subs, desc="🎙️ Tiến trình CapCut TTS"):
            idx, seg = future.result()
            audio_results[idx] = seg

    # Ghép nối file âm thanh tối ưu bộ nhớ
    print("🧩 Đang ghép nối âm thanh timeline...")
    master_audio = AudioSegment.empty()
    current_pos = 0

    for idx, sub in enumerate(subs):
        start_ms = sub["start"]
        seg = audio_results[idx]
        
        if start_ms > current_pos:
            master_audio += AudioSegment.silent(duration=(start_ms - current_pos))
            current_pos = start_ms
            
        if seg is not None:
            master_audio += seg
            current_pos += len(seg)

    # Giải phóng danh sách tạm để giải phóng RAM lập tức
    del audio_results
    gc.collect()

    # Tăng tốc file MP3 tổng lên 1.9x
    print("⚡ Đang tăng tốc file âm thanh tổng lên 1.9x...")
    final_audio_1_9x = speedup(master_audio, playback_speed=1.9)
    final_audio_1_9x.export(FINAL_AUDIO_MP3, format="mp3")
    print(f"🎉 Xuất thành công file audio: {FINAL_AUDIO_MP3}")

    # Đồng bộ Video & Ghép Audio
    if os.path.exists(VIDEO_PATH):
        print("🎬 Đang đồng bộ video với audio 1.9x (MoviePy)...")
        video = mp.VideoFileClip(VIDEO_PATH)
        audio = mp.AudioFileClip(FINAL_AUDIO_MP3)
        
        video_speed_factor = video.duration / audio.duration
        final_video = video.fx(mp.vfx.speedx, video_speed_factor).set_audio(audio)
        
        final_video.write_videofile(
            FINAL_VIDEO_OUTPUT, 
            codec="libx264", 
            audio_codec="aac",
            preset="fast",
            threads=4
        )
        print(f"✨ HOÀN TẤT VÀ XUẤT VIDEO ĐỒNG BỘ: {FINAL_VIDEO_OUTPUT}")

if __name__ == '__main__':
    main()`}
                </pre>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-950/60 flex justify-end">
              <button
                onClick={() => setShowPythonModal(false)}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold rounded-xl transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
