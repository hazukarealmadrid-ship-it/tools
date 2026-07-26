/**
 * GAME CHANGER: Direct Video Frame Extraction
 * Bypass HTML <video> element entirely
 * Use WebCodecs VideoDecoder for hardware-accelerated frame extraction
 */

import { Muxer, ArrayBufferTarget } from 'webm-muxer';
import * as MP4Box from 'mp4box';

export interface DecodedFrame {
  frame: VideoFrame;
  timestamp: number;
}

declare global {
  interface Window {
    MP4Box: any;
  }
}

export class DirectVideoDecoder {
  private videoDecoder: VideoDecoder | null = null;
  private videoFile: ArrayBuffer | null = null;
  private videoTrack: any = null;  // MP4Box track info
  private frames: Map<number, VideoFrame> = new Map();
  private frameQueue: DecodedFrame[] = [];
  private decodedCount = 0;
  private totalFrames = 0;
  private onFrameCallback?: (frame: VideoFrame, timestamp: number) => void;

  static async getVideoFps(file: File): Promise<number> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const mp4boxClient = (MP4Box && (MP4Box as any).createFile) ? MP4Box : (window as any).MP4Box;
      if (!mp4boxClient || !mp4boxClient.createFile) {
        return 30; // Fallback
      }
      const mp4box = mp4boxClient.createFile();
      (arrayBuffer as any).fileStart = 0;
      mp4box.appendBuffer(arrayBuffer);
      mp4box.flush();
      
      const videoTracks = mp4box.getTracksByKind ? mp4box.getTracksByKind('video') : (mp4box.videoTracks || []);
      if (!videoTracks.length) return 30;
      
      const track = videoTracks[0];
      const timescale = track.timescale || 1000;
      const timeperframe = track.samples?.[0]?.duration || track.movie_duration || 40;
      
      const fps = timescale / timeperframe;
      return isNaN(fps) || fps <= 0 || !isFinite(fps) ? 30 : Math.round(fps * 100) / 100;
    } catch (err) {
      console.warn("Failed to extract fps:", err);
      return 30;
    }
  }

  /**
   * ⚡ BREAKTHROUGH: Skip seeking entirely
   * Decode ALL frames sequentially in hardware, store in memory cache
   */
  async initializeDecoder(file: File, onProgress?: (progress: number) => void) {
    // 1️⃣ Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    this.videoFile = arrayBuffer;

    // 2️⃣ Parse video codec from MP4Box
    const mp4box = await this.parseMP4Header(arrayBuffer);
    if (!mp4box) throw new Error('Cannot parse video file');

    // 3️⃣ Extract video track info
    const videoInfo = this.getVideoTrackInfo(mp4box);
    if (!videoInfo) throw new Error('No video track found');

    // 4️⃣ Create VideoDecoder with correct codec
    const codecString = this.generateCodecString(videoInfo);
    this.videoDecoder = new VideoDecoder({
      output: (frame) => {
        if (this.onFrameCallback) {
          this.onFrameCallback(frame, frame.timestamp);
        } else {
          this.frameQueue.push({
            frame,
            timestamp: frame.timestamp
          });
        }
        this.decodedCount++;
        if (onProgress) {
          onProgress(Math.round((this.decodedCount / this.totalFrames) * 100));
        }
      },
      error: (err) => console.error('VideoDecoder error:', err)
    });

    this.videoDecoder.configure({
      codec: codecString,
      codedWidth: videoInfo.width,
      codedHeight: videoInfo.height,
      description: videoInfo.description
    });

    this.totalFrames = Math.ceil(
      (videoInfo.duration / 1000) * (videoInfo.timescale / videoInfo.timeperframe)
    );

    return {
      width: videoInfo.width,
      height: videoInfo.height,
      duration: videoInfo.duration / 1000,
      fps: videoInfo.timescale / videoInfo.timeperframe
    };
  }

  /**
   * ⚡ STREAMING DIRECT DECODE: Process frames immediately instead of buffering in RAM
   */
  async decodeStreaming(
    onFrame: (frame: VideoFrame, timestamp: number) => void,
    encoderQueueCheck: () => Promise<void>
  ) {
    if (!this.videoDecoder || !this.videoFile) {
      throw new Error('Decoder not initialized');
    }

    this.onFrameCallback = onFrame;

    // Extract video samples from MP4 file
    const videoSamples = await this.extractVideoSamples(this.videoFile);

    // Feed chunks to decoder with backpressure
    for (const chunk of videoSamples) {
      // Backpressure: don't push more if decoder queue is full
      while (this.videoDecoder.decodeQueueSize > 15) {
        await new Promise(r => setTimeout(r, 10));
      }
      
      // External backpressure (Encoder)
      await encoderQueueCheck();

      const encodedChunk = new EncodedVideoChunk({
        type: chunk.is_sync ? 'key' : 'delta',
        timestamp: chunk.cts,
        duration: chunk.duration,
        data: chunk.data
      });

      this.videoDecoder.decode(encodedChunk);
    }

    await this.videoDecoder.flush();
  }

  /**
   * ⚡ DIRECT DECODE: Feed encoded video chunks directly to VideoDecoder
   * NO SEEKING, NO DOM MANIPULATION
   */
  async decodeAllFrames() {
    if (!this.videoDecoder || !this.videoFile) {
      throw new Error('Decoder not initialized');
    }

    // Extract video samples from MP4 file
    const videoSamples = await this.extractVideoSamples(this.videoFile);

    // Feed ALL chunks to decoder at once (hardware accelerated)
    for (const chunk of videoSamples) {
      const encodedChunk = new EncodedVideoChunk({
        type: chunk.is_sync ? 'key' : 'delta',
        timestamp: chunk.cts,
        duration: chunk.duration,
        data: chunk.data
      });

      this.videoDecoder.decode(encodedChunk);
    }

    await this.videoDecoder.flush();

    // Return all frames in order
    return Array.from(this.frameQueue);
  }

  /**
   * Get specific frame by index (from cache)
   */
  getFrame(frameIndex: number): VideoFrame | null {
    if (frameIndex >= 0 && frameIndex < this.frameQueue.length) {
      return this.frameQueue[frameIndex].frame;
    }
    return null;
  }

  private async parseMP4Header(arrayBuffer: ArrayBuffer) {
    const mp4boxClient = (MP4Box && (MP4Box as any).createFile) ? MP4Box : (window as any).MP4Box;
    if (!mp4boxClient || !mp4boxClient.createFile) {
      throw new Error('MP4Box library is not available');
    }
    const mp4box = mp4boxClient.createFile();
    (arrayBuffer as any).fileStart = 0;
    mp4box.appendBuffer(arrayBuffer);
    mp4box.flush();
    return mp4box;
  }

  private getVideoTrackInfo(mp4box: any) {
    const videoTracks = mp4box.getTracksByKind ? mp4box.getTracksByKind('video') : (mp4box.videoTracks || []);
    if (!videoTracks.length) return null;

    const track = videoTracks[0];
    const trackBox = mp4box.getTrackBox ? mp4box.getTrackBox(track.id) : null;
    const sampleEntry = trackBox?.mdia?.minf?.stbl?.stsd?.entries?.[0] || track;

    return {
      id: track.id,
      width: sampleEntry.width || track.track_width || 1920,
      height: sampleEntry.height || track.track_height || 1080,
      duration: track.duration,
      timescale: track.timescale || 1000,
      timeperframe: track.samples?.[0]?.duration || track.movie_duration || 40,
      codec: sampleEntry.type || track.codec?.split('.')[0] || 'avc1',
      description: sampleEntry.avcC || sampleEntry.hvcC || sampleEntry.vpcC
    };
  }

  private generateCodecString(videoInfo: any): string {
    if (videoInfo.codec === 'avc1') {
      // H.264
      const avcC = videoInfo.description;
      if (avcC && avcC.avcProfileIndication !== undefined) {
        return `avc1.${avcC.avcProfileIndication.toString(16).padStart(2, '0')}${avcC.profileCompatibility.toString(16).padStart(2, '0')}${avcC.avcLevelIndication.toString(16).padStart(2, '0')}`;
      }
      return 'avc1.42E01E'; // Default fallback H.264 Main profile
    } else if (videoInfo.codec === 'hev1' || videoInfo.codec === 'hvc1') {
      // H.265
      return 'hev1.1.6.L120.B0';  // Fallback
    } else if (videoInfo.codec === 'vp09') {
      // VP9
      return 'vp09.00.10.08';
    }
    return 'avc1.42E01E';
  }

  private async extractVideoSamples(arrayBuffer: ArrayBuffer) {
    const mp4boxClient = (MP4Box && (MP4Box as any).createFile) ? MP4Box : (window as any).MP4Box;
    const mp4box = mp4boxClient.createFile();
    (arrayBuffer as any).fileStart = 0;
    mp4box.appendBuffer(arrayBuffer);
    mp4box.flush();

    const videoTracks = mp4box.getTracksByKind ? mp4box.getTracksByKind('video') : (mp4box.videoTracks || []);
    if (!videoTracks.length) throw new Error('No video track');

    const track = videoTracks[0];
    const samples = mp4box.getSamples ? mp4box.getSamples(track.id) : (track.samples || []);

    return samples.map((sample: any) => ({
      data: sample.data,
      cts: sample.cts,
      duration: sample.duration,
      is_sync: sample.is_sync,
      size: sample.size
    }));
  }

  close() {
    if (this.videoDecoder) {
      this.videoDecoder.close();
    }
    this.frames.clear();
    this.frameQueue = [];
  }
}
