/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Ultra-Fast High Performance Web Video Processing Engine
 * OPTIMIZATION: Resource cleanup + Font loading async + Memory management
 */

import { Muxer, ArrayBufferTarget } from 'webm-muxer';
import { getActiveSubtitle, getActiveSubtitleByAudioTime } from './SubtitleRenderer';
import { SyncCheckpoint, videoTimeToAudioTime } from './DubbingAudioEngine';

export interface ExportOptions {
  videoFile: File;
  videoUrl: string;
  generatedAudioUrl: string | null;
  videoPlaybackRate: number;
  zoomLevel: number;
  isMirrored: boolean;
  blurIntensity: number;
  blurBox: { x: number; y: number; w: number; h: number };
  showBgBar: boolean;
  logoUrl: string | null;
  logoX: number;
  logoY: number;
  logoScale: number;
  subtitles: Array<{ start: number; end: number; text: string }>;
  isTextAutoCentered: boolean;
  textX: number;
  textY: number;
  fontSize: number;
  strokeWidth: number;
  volume: number;
  containerWidth?: number;
  syncCheckpoints?: SyncCheckpoint[];
  dubAudioPositions?: number[];
  onProgress?: (progress: number, statusText?: string) => void;
  onStatusText?: (text: string) => void;
  isAborted?: () => boolean;
}

export interface ExportResult {
  blob: Blob;
  url: string;
  fileName: string;
  engine: 'webcodecs' | 'mediarecorder';
}

export type VideoExportOptions = ExportOptions;

export interface GraphicsFrameParams {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  renderVideo: HTMLVideoElement;
  currentTime: number;
  videoWidth: number;
  videoHeight: number;
  zoomLevel: number;
  isMirrored: boolean;
  blurIntensity: number;
  blurBox: { x: number; y: number; w: number; h: number };
  showBgBar: boolean;
  logoImg: HTMLImageElement | ImageBitmap | null;
  logoX: number;
  logoY: number;
  logoScale: number;
  subtitles: Array<{ start: number; end: number; text: string }>;
  isTextAutoCentered: boolean;
  textX: number;
  textY: number;
  fontSize: number;
  strokeWidth: number;
  scaleFactor: number;
  syncCheckpoints?: SyncCheckpoint[];
  dubAudioPositions?: number[];
  videoPlaybackRate?: number;
  isDubbingActive?: boolean;
  audioCurrentTime?: number;
  activeSubtitleTextOverride?: string | null;
}

/**
 * Render frame graphics layers (Video zoom/mirror, blur box, logo, subtitles)
 * Shared function for both Live Preview and Video Export
 */
export function drawGraphicsFrame(params: GraphicsFrameParams): void {
  const {
    ctx,
    renderVideo,
    currentTime,
    videoWidth,
    videoHeight,
    zoomLevel,
    isMirrored,
    blurIntensity,
    blurBox,
    showBgBar,
    logoImg,
    logoX,
    logoY,
    logoScale,
    subtitles,
    isTextAutoCentered,
    textX,
    textY,
    fontSize,
    strokeWidth,
    scaleFactor,
    syncCheckpoints,
    dubAudioPositions,
    videoPlaybackRate,
    isDubbingActive,
    audioCurrentTime,
    activeSubtitleTextOverride
  } = params;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, videoWidth, videoHeight);

  // A. Base Video (Zoom & Mirror)
  ctx.save();
  ctx.translate(videoWidth / 2, videoHeight / 2);
  const zoomFactor = zoomLevel / 100;
  const mirrorFactor = isMirrored ? -1 : 1;
  ctx.scale(zoomFactor * mirrorFactor, zoomFactor);
  if (renderVideo.readyState >= 2) {
    ctx.drawImage(renderVideo, -videoWidth / 2, -videoHeight / 2, videoWidth, videoHeight);
  }
  ctx.restore();

  // B. Blur Box
  if (blurIntensity > 0 && blurBox.h > 0) {
    const bx = 0;
    const by = Math.max(0, (blurBox.y / 100) * videoHeight);
    const bw = videoWidth;
    const bh = Math.min(videoHeight - by, (blurBox.h / 100) * videoHeight);

    if (bw > 0 && bh > 0) {
      const blurPx = Math.max(1, Math.round(blurIntensity * scaleFactor));
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx, by, bw, bh);
      ctx.clip();

      const bgOpacity = showBgBar ? 0.85 : 0.45;
      ctx.fillStyle = `rgba(0, 0, 0, ${bgOpacity})`;
      ctx.fillRect(bx, by, bw, bh);

      if (renderVideo.readyState >= 2) {
        ctx.save();
        ctx.filter = `blur(${blurPx}px)`;
        const pad = Math.max(16, blurPx * 2);
        ctx.translate(videoWidth / 2, videoHeight / 2);
        ctx.scale(zoomFactor * mirrorFactor, zoomFactor);
        ctx.drawImage(renderVideo, -videoWidth / 2 - pad / 2, -videoHeight / 2 - pad / 2, videoWidth + pad, videoHeight + pad);
        ctx.restore();
      }

      ctx.restore();
    }
  }

  // C. Logo Overlay
  if (logoImg) {
    const lx = (logoX / 100) * videoWidth;
    const ly = (logoY / 100) * videoHeight;
    const lw = (logoScale / 100) * videoWidth;
    const naturalWidth = 'naturalWidth' in logoImg ? logoImg.naturalWidth : logoImg.width;
    const naturalHeight = 'naturalHeight' in logoImg ? logoImg.naturalHeight : logoImg.height;
    const lh = (naturalHeight / (naturalWidth || 1)) * lw;

    ctx.drawImage(logoImg as CanvasImageSource, lx - lw / 2, ly - lh / 2, lw, lh);
  }

  // D. Subtitle Resolution
  let activeSubtitleText: string | null = null;
  if (activeSubtitleTextOverride !== undefined) {
    activeSubtitleText = activeSubtitleTextOverride;
  } else if (
    isDubbingActive &&
    dubAudioPositions &&
    dubAudioPositions.length === subtitles.length &&
    audioCurrentTime !== undefined
  ) {
    activeSubtitleText = getActiveSubtitleByAudioTime(subtitles, dubAudioPositions, audioCurrentTime);
  } else if (
    syncCheckpoints &&
    syncCheckpoints.length > 0
  ) {
    const audioTime = videoTimeToAudioTime(currentTime, syncCheckpoints, videoPlaybackRate || 1);
    const audioPositions = (dubAudioPositions && dubAudioPositions.length === subtitles.length)
      ? dubAudioPositions
      : syncCheckpoints.map(c => c.audioTime);
    activeSubtitleText = getActiveSubtitleByAudioTime(subtitles, audioPositions, audioTime);
  } else {
    activeSubtitleText = getActiveSubtitle(subtitles, currentTime);
  }

  if (activeSubtitleText) {
    const textStr = activeSubtitleText.replace(/\n/g, ' ');
    const renderBlurY = (blurBox.y / 100) * videoHeight;
    const renderBlurH = (blurBox.h / 100) * videoHeight;

    let tx: number, ty: number;
    if (isTextAutoCentered) {
      tx = videoWidth / 2;
      ty = renderBlurY + (renderBlurH / 2);
    } else {
      tx = (textX / 100) * videoWidth;
      ty = (textY / 100) * videoHeight;
    }

    const fontSizePercent = (fontSize / 720) * 100;
    let canvasFontSize = (fontSizePercent / 100) * videoHeight;

    const strokeWidthPercent = (strokeWidth / 720) * 100;
    const canvasStrokeWidth = (strokeWidthPercent / 100) * videoHeight * 0.12 * (fontSize / 24);

    ctx.save();
    ctx.font = `bold ${canvasFontSize}px "Bangers", cursive, sans-serif`;
    
    let actualTextWidth = ctx.measureText(textStr).width;

    if (isTextAutoCentered) {
      const maxAllowedWidth = videoWidth * 0.9;
      if (actualTextWidth > maxAllowedWidth) {
        const sf = maxAllowedWidth / actualTextWidth;
        canvasFontSize = Math.floor(canvasFontSize * sf);
        ctx.font = `bold ${canvasFontSize}px "Bangers", cursive, sans-serif`;
        actualTextWidth = ctx.measureText(textStr).width;
      }
    }

    if (showBgBar) {
      const paddingX = (18 / 720) * videoHeight;
      const paddingY = (4 / 720) * videoHeight;
      const barWidth = actualTextWidth + paddingX * 2;
      const barHeight = canvasFontSize + paddingY * 2;
      
      const gradient = ctx.createLinearGradient(tx - barWidth/2, ty, tx + barWidth/2, ty);
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(0.12, 'rgba(0,0,0,0.65)');
      gradient.addColorStop(0.88, 'rgba(0,0,0,0.65)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(tx - barWidth/2, ty - barHeight/2, barWidth, barHeight);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2, canvasStrokeWidth);
    if ('letterSpacing' in ctx) {
      (ctx as unknown as { letterSpacing: string }).letterSpacing = '1px';
    }
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = '#FFFFFF';

    ctx.strokeText(textStr, tx, ty);
    ctx.fillText(textStr, tx, ty);
    ctx.restore();
  }
}

export const drawVideoFrame = drawGraphicsFrame;

/**
 * Fast video frame seek helper
 */
function seekVideoTo(video: HTMLVideoElement, targetTime: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - targetTime) < 0.001) {
      resolve();
      return;
    }
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = targetTime;
  });
}

/**
 * Throttled progress report helper (100ms intervals to prevent excessive React re-renders)
 */
function createThrottledProgressReporter(
  onProgress?: (progress: number, statusText?: string) => void,
  onStatusText?: (text: string) => void
) {
  let lastTime = 0;
  return (pct: number, statusText?: string) => {
    const now = Date.now();
    if (statusText && onStatusText) {
      onStatusText(statusText);
    }
    if (onProgress && (now - lastTime >= 100 || pct >= 100)) {
      lastTime = now;
      onProgress(pct, statusText);
    }
  };
}

/**
 * Download Blob utility
 */
function triggerDownload(blob: Blob, fileName: string): string {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return url;
}

/**
 * OPTIMIZATION #1: Proper DOM cleanup with removeEventListeners (Fix: RC#11)
 */
function cleanupVideoElement(video: HTMLVideoElement): void {
  try {
    video.pause();
    video.src = '';
    video.load(); // Force cleanup
    if (video.parentNode) {
      video.parentNode.removeChild(video);
    }
  } catch (e) {
    console.warn('Cleanup video element error:', e);
  }
}

/**
 * OPTIMIZATION #2: Async font loading without blocking (Fix: RC#12)
 */
async function loadFontsNonBlocking(): Promise<void> {
  try {
    // Race condition: resolve even if fonts fail to load
    await Promise.race([
      document.fonts.ready,
      new Promise(resolve => setTimeout(resolve, 1000)) // 1s timeout
    ]);
  } catch (e) {
    console.warn('Font loading timeout:', e);
  }
}

/**
 * WebCodecs Non-Realtime GPU Accelerated Video Export Engine
 */
async function exportWithWebCodecs(options: ExportOptions): Promise<ExportResult> {
  const {
    videoFile,
    videoUrl,
    generatedAudioUrl,
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
    containerWidth = 800,
    onProgress,
    onStatusText,
    isAborted = () => false
  } = options;

  const reportProgress = createThrottledProgressReporter(onProgress, onStatusText);
  reportProgress(0, '⚡ Khởi tạo WebCodecs GPU Acceleration Engine...');

  // OPTIMIZATION #1: Improved DOM cleanup
  const renderVideo = document.createElement('video');
  renderVideo.style.position = 'fixed';
  renderVideo.style.left = '-9999px';
  renderVideo.style.top = '-9999px';
  renderVideo.style.width = '1px';
  renderVideo.style.height = '1px';
  renderVideo.style.opacity = '0.01';
  renderVideo.muted = true;
  renderVideo.playsInline = true;
  document.body.appendChild(renderVideo);

  const cleanup = () => {
    try {
      cleanupVideoElement(renderVideo);
    } catch (e) {
      console.warn('Cleanup error:', e);
    }
  };

  renderVideo.src = videoUrl;
  renderVideo.crossOrigin = 'anonymous';

  if (renderVideo.readyState < 1) {
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      renderVideo.onloadedmetadata = finish;
      renderVideo.onerror = finish;
      setTimeout(finish, 4000);
    });
  }

  const videoWidth = renderVideo.videoWidth || 1280;
  const videoHeight = renderVideo.videoHeight || 720;
  const duration = renderVideo.duration;

  if (!duration || isNaN(duration)) {
    cleanup();
    throw new Error('Không thể xác định thời lượng video.');
  }

  // Preload Logo (with compression)
  let logoImg: ImageBitmap | HTMLImageElement | null = null;
  if (logoUrl) {
    try {
      const res = await fetch(logoUrl);
      const blob = await res.blob();
      logoImg = await createImageBitmap(blob);
    } catch (e) {
      console.warn('Logo load error:', e);
      logoImg = null;
    }
  }

  // OPTIMIZATION #2: Non-blocking font load
  await loadFontsNonBlocking();

  const scaleFactor = videoWidth / containerWidth;

  // Prepare Dubbed Audio Buffer using AudioContext
  let audioCtx: AudioContext | null = null;
  let audioBuffer: AudioBuffer | null = null;
  try {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({ sampleRate: 48000 });
    const targetAudioUrl = generatedAudioUrl || videoUrl;
    const res = await fetch(targetAudioUrl);
    const arrayBuffer = await res.arrayBuffer();
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } catch (e) {
    console.warn('Cảnh báo giải mã audio:', e);
  }

  const fps = 30;
  const totalFrames = Math.ceil(duration * fps);

  // Configure webm-muxer
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: 'V_VP9',
      width: videoWidth,
      height: videoHeight,
      frameRate: fps
    },
    audio: (audioBuffer && typeof AudioEncoder !== 'undefined') ? {
      codec: 'A_OPUS',
      numberOfChannels: Math.min(2, audioBuffer.numberOfChannels),
      sampleRate: 48000
    } : undefined
  });

  // Configure VideoEncoder
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error('VideoEncoder error:', e)
  });

  videoEncoder.configure({
    codec: 'vp09.00.10.08',
    width: videoWidth,
    height: videoHeight,
    bitrate: 10_000_000,
    framerate: fps
  });

  // Encode Dubbed Audio in Background
  if (audioBuffer && typeof AudioEncoder !== 'undefined') {
    try {
      const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => console.error('AudioEncoder error:', e)
      });

      const numChannels = Math.min(2, audioBuffer.numberOfChannels);
      audioEncoder.configure({
        codec: 'opus',
        numberOfChannels: numChannels,
        sampleRate: 48000,
        bitrate: 128000
      });

      const sampleRate = 48000;
      const chunkSize = 960;
      const totalSamples = audioBuffer.length;
      const volumeGain = Math.max(0, Math.min(2, (volume + 50) / 100));

      for (let offset = 0; offset < totalSamples; offset += chunkSize) {
        if (isAborted()) break;
        const frameCount = Math.min(chunkSize, totalSamples - offset);
        const planarData = new Float32Array(frameCount * numChannels);

        for (let ch = 0; ch < numChannels; ch++) {
          const channelData = audioBuffer.getChannelData(ch % audioBuffer.numberOfChannels);
          const sliced = channelData.subarray(offset, offset + frameCount);
          for (let s = 0; s < sliced.length; s++) {
            planarData[ch * frameCount + s] = sliced[s] * volumeGain;
          }
        }

        const audioData = new AudioData({
          format: 'f32-planar',
          sampleRate: sampleRate,
          numberOfFrames: frameCount,
          numberOfChannels: numChannels,
          timestamp: Math.round((offset / sampleRate) * 1_000_000),
          data: planarData
        });

        audioEncoder.encode(audioData);
        audioData.close();
      }

      await audioEncoder.flush();
    } catch (e) {
      console.warn('Encode Audio Skipped:', e);
    }
  }

  const canvas = new OffscreenCanvas(videoWidth, videoHeight);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;

  reportProgress(5, '🚀 Đang render video siêu tốc bằng GPU Acceleration...');

  for (let i = 0; i < totalFrames; i++) {
    if (isAborted()) {
      cleanup();
      if (audioCtx) audioCtx.close().catch(() => {});
      throw new Error('Xuất video bị hủy.');
    }

    const currentTime = i / fps;
    await seekVideoTo(renderVideo, currentTime);

    drawGraphicsFrame({
      ctx,
      renderVideo,
      currentTime,
      videoWidth,
      videoHeight,
      zoomLevel,
      isMirrored,
      blurIntensity,
      blurBox,
      showBgBar,
      logoImg,
      logoX,
      logoY,
      logoScale,
      subtitles,
      isTextAutoCentered,
      textX,
      textY,
      fontSize,
      strokeWidth,
      scaleFactor,
      syncCheckpoints: options.syncCheckpoints,
      dubAudioPositions: options.dubAudioPositions,
      videoPlaybackRate: options.videoPlaybackRate
    });

    const timestampUs = Math.round((i / fps) * 1_000_000);
    const videoFrame = new VideoFrame(canvas as unknown as CanvasImageSource, { timestamp: timestampUs });

    videoEncoder.encode(videoFrame, { keyFrame: i % (fps * 2) === 0 });
    videoFrame.close();

    const prog = Math.min(100, Math.round(((i + 1) / totalFrames) * 100));
    reportProgress(prog, `Đang render GPU... (${prog}%)`);
  }

  await videoEncoder.flush();
  muxer.finalize();

  const { buffer } = muxer.target;
  const blob = new Blob([buffer], { type: 'video/webm' });

  const originalName = videoFile.name.substring(0, videoFile.name.lastIndexOf('.')) || 'video';
  const fileName = `capcut_processed_${originalName}_${Date.now()}.webm`;
  const url = triggerDownload(blob, fileName);

  cleanup();
  if (audioCtx) audioCtx.close().catch(() => {});

  return {
    blob,
    url,
    fileName,
    engine: 'webcodecs'
  };
}

/**
 * Fallback MediaRecorder Accelerated Video Export Engine
 */
async function exportWithMediaRecorder(options: ExportOptions): Promise<ExportResult> {
  const {
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
    containerWidth = 800,
    onProgress,
    onStatusText,
    isAborted = () => false
  } = options;

  const reportProgress = createThrottledProgressReporter(onProgress, onStatusText);
  reportProgress(0, 'Khởi tạo MediaRecorder High Quality Fallback...');

  let audioCtx: AudioContext | null = null;
  try {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
  } catch (e) {
    console.warn('AudioContext error:', e);
  }

  // OPTIMIZATION #1: Improved DOM cleanup
  const renderVideo = document.createElement('video');
  renderVideo.style.position = 'fixed';
  renderVideo.style.left = '-9999px';
  renderVideo.style.top = '-9999px';
  renderVideo.style.width = '1px';
  renderVideo.style.height = '1px';
  renderVideo.style.opacity = '0.01';
  renderVideo.muted = true;
  renderVideo.playsInline = true;
  document.body.appendChild(renderVideo);

  let renderAudio: HTMLAudioElement | null = null;
  if (generatedAudioUrl) {
    renderAudio = document.createElement('audio');
    renderAudio.src = generatedAudioUrl;
    renderAudio.crossOrigin = 'anonymous';
    document.body.appendChild(renderAudio);
  }

  const cleanup = () => {
    try {
      cleanupVideoElement(renderVideo);
      if (renderAudio) {
        renderAudio.pause();
        renderAudio.src = '';
        if (renderAudio.parentNode) renderAudio.parentNode.removeChild(renderAudio);
      }
    } catch (e) {
      console.warn('Cleanup error:', e);
    }
    if (audioCtx && audioCtx.state !== 'closed') {
      audioCtx.close().catch(() => {});
    }
  };

  try {
    renderVideo.src = videoUrl;
    renderVideo.crossOrigin = 'anonymous';
    renderVideo.playbackRate = generatedAudioUrl ? videoPlaybackRate : 1;

    if (renderVideo.readyState < 1) {
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        renderVideo.onloadedmetadata = finish;
        renderVideo.onerror = finish;
        setTimeout(finish, 4000);
      });
    }

    const videoWidth = renderVideo.videoWidth || 1280;
    const videoHeight = renderVideo.videoHeight || 720;
    const duration = renderVideo.duration;

    if (!duration || isNaN(duration)) {
      cleanup();
      throw new Error('Không thể xác định thời lượng video.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoWidth;
    canvas.height = videoHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      cleanup();
      throw new Error('Trình duyệt không hỗ trợ Canvas 2D Context.');
    }

    let logoImg: HTMLImageElement | null = null;
    if (logoUrl) {
      try {
        logoImg = new Image();
        logoImg.src = logoUrl;
        await new Promise<void>((resolve) => {
          logoImg!.onload = () => resolve();
          logoImg!.onerror = () => resolve();
          setTimeout(resolve, 2000);
        });
      } catch (e) {
        console.warn('Logo load error:', e);
        logoImg = null;
      }
    }

    // OPTIMIZATION #2: Non-blocking font load
    await loadFontsNonBlocking();

    const scaleFactor = videoWidth / containerWidth;

    let audioDestination: MediaStreamAudioDestinationNode | null = null;
    if (audioCtx) {
      try {
        audioDestination = audioCtx.createMediaStreamDestination();
        const audioSource = audioCtx.createMediaElementSource(renderVideo);
        const gainNode = audioCtx.createGain();
        const gainVal = Math.max(0, Math.min(2, (volume + 50) / 100));
        gainNode.gain.value = renderAudio ? 0 : gainVal;
        audioSource.connect(gainNode).connect(audioDestination);

        if (renderAudio) {
          const generatedAudioSource = audioCtx.createMediaElementSource(renderAudio);
          generatedAudioSource.connect(audioDestination);
        }
      } catch (e) {
        console.warn('Lỗi kết nối Web Audio:', e);
      }
    }

    // Capture Canvas stream at 60fps for maximum smoothness
    const canvasStream = canvas.captureStream(60);
    let combinedStream = canvasStream;

    if (audioDestination && audioDestination.stream.getAudioTracks().length > 0) {
      combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        audioDestination.stream.getAudioTracks()[0]
      ]);
    }

    const mimeTypes = [
      'video/webm;codecs=vp9,opus',
      'video/mp4;codecs=h264,aac',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4'
    ];
    let selectedMimeType = '';
    for (const type of mimeTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        selectedMimeType = type;
        break;
      }
    }

    const recordedChunks: Blob[] = [];
    let mediaRecorder: MediaRecorder;
    try {
      mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: selectedMimeType || undefined,
        videoBitsPerSecond: 12_000_000
      });
    } catch {
      mediaRecorder = new MediaRecorder(combinedStream);
    }

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) recordedChunks.push(event.data);
    };

    mediaRecorder.start(100);
    renderVideo.currentTime = 0;
    if (renderAudio) renderAudio.currentTime = 0;

    try {
      await renderVideo.play();
      if (renderAudio) await renderAudio.play();
    } catch (e) {
      console.warn('Play video render warning:', e);
    }

    return new Promise<ExportResult>((resolve, reject) => {
      const renderLoop = () => {
        if (isAborted()) {
          if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
          cleanup();
          reject(new Error('Xuất video bị hủy.'));
          return;
        }

        const currTime = renderVideo.currentTime;
        drawGraphicsFrame({
          ctx,
          renderVideo,
          currentTime: currTime,
          videoWidth,
          videoHeight,
          zoomLevel,
          isMirrored,
          blurIntensity,
          blurBox,
          showBgBar,
          logoImg,
          logoX,
          logoY,
          logoScale,
          subtitles,
          isTextAutoCentered,
          textX,
          textY,
          fontSize,
          strokeWidth,
          scaleFactor,
          syncCheckpoints: options.syncCheckpoints,
          dubAudioPositions: options.dubAudioPositions,
          videoPlaybackRate: options.videoPlaybackRate
        });

        const prog = Math.min(100, Math.round((currTime / duration) * 100));
        reportProgress(prog, `Đang render MediaRecorder... (${prog}%)`);

        if (renderVideo.ended || currTime >= duration - 0.05) {
          renderVideo.pause();
          reportProgress(100, 'Đang hoàn tất đóng gói file...');
          setTimeout(() => {
            if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
          }, 200);
        } else {
          requestAnimationFrame(renderLoop);
        }
      };

      mediaRecorder.onstop = () => {
        if (isAborted()) {
          cleanup();
          reject(new Error('Xuất video bị hủy.'));
          return;
        }
        const blob = new Blob(recordedChunks, { type: selectedMimeType || 'video/webm' });
        const originalName = videoFile.name.substring(0, videoFile.name.lastIndexOf('.')) || 'video';
        const isMp4 = selectedMimeType.includes('mp4');
        const ext = isMp4 ? 'mp4' : 'webm';
        const fileName = `capcut_processed_${originalName}_${Date.now()}.${ext}`;
        const url = triggerDownload(blob, fileName);

        cleanup();
        resolve({
          blob,
          url,
          fileName,
          engine: 'mediarecorder'
        });
      };

      requestAnimationFrame(renderLoop);
    });
  } catch (err) {
    cleanup();
    throw err;
  }
}

/**
 * Main export function required by the specifications
 */
export async function exportVideo(
  options: ExportOptions,
  onProgress?: (progress: number, statusText?: string) => void
): Promise<ExportResult> {
  const mergedOptions: ExportOptions = {
    ...options,
    onProgress: onProgress || options.onProgress
  };

  const useWebCodecs = typeof VideoEncoder !== 'undefined' &&
                       typeof VideoDecoder !== 'undefined' &&
                       typeof OffscreenCanvas !== 'undefined';

  if (useWebCodecs) {
    try {
      return await exportWithWebCodecs(mergedOptions);
    } catch (e) {
      console.warn('WebCodecs failed, fallback to MediaRecorder:', e);
    }
  }

  return await exportWithMediaRecorder(mergedOptions);
}

/**
 * Backwards compatibility export function
 */
export async function processAndExportVideo(options: ExportOptions): Promise<ExportResult> {
  return exportVideo(options);
}
