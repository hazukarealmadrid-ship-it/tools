import { useState, useRef, useCallback } from 'react';
import type { ExportOptions } from '../types';
import { exportVideo } from '../VideoExportEngine';

export const useVideoExport = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatusText, setExportStatusText] = useState('');
  const abortExportRef = useRef(false);

  const startExport = useCallback(async (options: Omit<ExportOptions, 'isAborted'>) => {
    if (!options.videoFile || !options.videoUrl) {
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
          ...options,
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
  }, []);

  const cancelExport = useCallback(() => {
    abortExportRef.current = true;
  }, []);

  return {
    isExporting,
    exportProgress,
    exportStatusText,
    abortExportRef,
    startExport,
    cancelExport
  };
};
