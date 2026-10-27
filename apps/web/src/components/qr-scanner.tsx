'use client';

import { useEffect, useRef } from 'react';

export interface QrScannerProps {
  onCode: (code: string) => void;
  onCameraError: () => void;
  decode: (imageData: ImageData) => string | null;
}

function QrScanner({ onCode, onCameraError, decode }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onCodeRef = useRef(onCode);
  const decodeRef = useRef(decode);
  const onCameraErrorRef = useRef(onCameraError);
  onCodeRef.current = onCode;
  decodeRef.current = decode;
  onCameraErrorRef.current = onCameraError;

  useEffect(() => {
    const videoElement = videoRef.current;
    const canvasElement = canvasRef.current;
    if (!videoElement || !canvasElement) return undefined;

    let cancelled = false;
    let failed = false;
    let running = false;
    let frameId: number | null = null;
    let stream: MediaStream | null = null;

    function tick() {
      const canvasNow = canvasRef.current;
      const videoNow = videoRef.current;
      if (cancelled || !running || !canvasNow || !videoNow) {
        frameId = null;
        return;
      }
      const context = canvasNow.getContext('2d');
      if (context === null) {
        frameId = window.requestAnimationFrame(tick);
        return;
      }
      if (videoNow.videoWidth > 0 && videoNow.videoHeight > 0) {
        context.drawImage(videoNow, 0, 0, canvasNow.width, canvasNow.height);
        const frame = context.getImageData(
          0,
          0,
          canvasNow.width,
          canvasNow.height,
        );
        const code = decodeRef.current(frame);
        if (code !== null) onCodeRef.current(code);
      }
      frameId = window.requestAnimationFrame(tick);
    }

    function handlePlaying() {
      if (running || cancelled || failed) return;
      running = true;
      tick();
    }

    videoElement.addEventListener('playing', handlePlaying);

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      failed = true;
      onCameraErrorRef.current();
      return () => {
        cancelled = true;
        videoElement.removeEventListener('playing', handlePlaying);
        if (frameId !== null) window.cancelAnimationFrame(frameId);
      };
    }

    mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((granted) => {
        if (cancelled) {
          granted.getTracks().forEach((track) => {
            track.stop();
          });
          return;
        }
        stream = granted;
        videoElement.srcObject = granted;
      })
      .catch(() => {
        if (cancelled) return;
        failed = true;
        onCameraErrorRef.current();
      });

    return () => {
      cancelled = true;
      videoElement.removeEventListener('playing', handlePlaying);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      stream?.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, []);

  return (
    <>
      <video
        ref={videoRef}
        playsInline
        muted
        className="w-full max-w-md rounded-lg bg-black"
      />
      <canvas ref={canvasRef} width={640} height={480} className="hidden" />
    </>
  );
}

export { QrScanner };
