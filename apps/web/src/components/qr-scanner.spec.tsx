import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { QrScanner } = await import('./qr-scanner');

const CODIGO_TESTE = 'CODE-123';

type QuadroCallback = (time: number) => void;

let rafId = 0;
let rafQueue = new Map<number, QuadroCallback>();

beforeEach(() => {
  rafId = 0;
  rafQueue = new Map();
  vi.stubGlobal('requestAnimationFrame', (callback: QuadroCallback): number => {
    rafId += 1;
    rafQueue.set(rafId, callback);
    return rafId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafQueue.delete(id);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (window.navigator as { mediaDevices?: unknown }).mediaDevices;
});

function stubMediaDevices(value: unknown): void {
  Object.defineProperty(window.navigator, 'mediaDevices', {
    value,
    configurable: true,
  });
}

function makeTrack() {
  return { stop: vi.fn() };
}

function makeStream(track: { stop: () => void }) {
  return { getTracks: () => [track] };
}

function fake2dContext() {
  return {
    drawImage: vi.fn(),
    getImageData: () => ({
      data: new Uint8ClampedArray(2 * 2 * 4),
      width: 2,
      height: 2,
    }),
  };
}

function stubCanvasContext(context: unknown): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as never,
  );
}

function prepararVideo(container: HTMLElement): HTMLVideoElement {
  const video = container.querySelector('video') as HTMLVideoElement;
  Object.defineProperty(video, 'videoWidth', { value: 2, configurable: true });
  Object.defineProperty(video, 'videoHeight', { value: 2, configurable: true });
  return video;
}

function stepFrames(): void {
  const pending = [...rafQueue.values()];
  rafQueue.clear();
  pending.forEach((callback) => {
    callback(0);
  });
}

describe('QrScanner', () => {
  it('pede a câmera traseira no mount e não avisa erro com stream válido', () => {
    const track = makeTrack();
    const getUserMedia = vi.fn().mockResolvedValue(makeStream(track));
    stubMediaDevices({ getUserMedia });
    const onCameraError = vi.fn();
    const decode = vi.fn(() => null);

    render(
      <QrScanner
        onCode={vi.fn()}
        onCameraError={onCameraError}
        decode={decode}
      />,
    );

    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'environment' },
    });
    expect(onCameraError).not.toHaveBeenCalled();
  });

  it('lê o QR no laço de frames e emite o código via onCode', () => {
    stubMediaDevices({
      getUserMedia: vi.fn().mockResolvedValue(makeStream(makeTrack())),
    });
    stubCanvasContext(fake2dContext());
    const onCode = vi.fn();
    const decode = vi
      .fn()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValue(CODIGO_TESTE);

    const { container } = render(
      <QrScanner onCode={onCode} onCameraError={vi.fn()} decode={decode} />,
    );
    const video = prepararVideo(container);
    video.dispatchEvent(new Event('playing'));
    stepFrames();
    stepFrames();
    stepFrames();

    expect(onCode).toHaveBeenCalledTimes(1);
    expect(onCode).toHaveBeenCalledWith(CODIGO_TESTE);
  });

  it('não duplica o laço em um novo evento playing', () => {
    stubMediaDevices({
      getUserMedia: vi.fn().mockResolvedValue(makeStream(makeTrack())),
    });
    stubCanvasContext(fake2dContext());
    const decode = vi.fn(() => null);

    const { container } = render(
      <QrScanner onCode={vi.fn()} onCameraError={vi.fn()} decode={decode} />,
    );
    const video = prepararVideo(container);
    video.dispatchEvent(new Event('playing'));
    video.dispatchEvent(new Event('playing'));
    stepFrames();

    expect(decode).toHaveBeenCalledTimes(2);
  });

  it('para o laço e as tracks no unmount', async () => {
    const track = makeTrack();
    stubMediaDevices({
      getUserMedia: vi.fn().mockResolvedValue(makeStream(track)),
    });
    stubCanvasContext(fake2dContext());
    const decode = vi.fn(() => null);

    const { container, unmount } = render(
      <QrScanner onCode={vi.fn()} onCameraError={vi.fn()} decode={decode} />,
    );
    prepararVideo(container).dispatchEvent(new Event('playing'));
    stepFrames();

    unmount();
    await Promise.resolve();
    expect(rafQueue.size).toBe(0);
    stepFrames();
    expect(decode).toHaveBeenCalledTimes(2);
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('avisa exatamente uma vez quando a câmera está ausente e não inicia o laço', () => {
    stubMediaDevices(undefined);
    const onCameraError = vi.fn();
    const decode = vi.fn(() => null);

    const { container } = render(
      <QrScanner
        onCode={vi.fn()}
        onCameraError={onCameraError}
        decode={decode}
      />,
    );
    prepararVideo(container).dispatchEvent(new Event('playing'));
    stepFrames();
    cleanup();

    expect(onCameraError).toHaveBeenCalledTimes(1);
    expect(decode).not.toHaveBeenCalled();
  });

  it('avisa exatamente uma vez quando getUserMedia rejeita e não inicia o laço', async () => {
    stubMediaDevices({
      getUserMedia: vi.fn().mockRejectedValue(new Error('câmera negada')),
    });
    const onCameraError = vi.fn();
    const decode = vi.fn(() => null);

    const { container } = render(
      <QrScanner
        onCode={vi.fn()}
        onCameraError={onCameraError}
        decode={decode}
      />,
    );
    await vi.waitFor(() => expect(onCameraError).toHaveBeenCalledTimes(1));
    prepararVideo(container).dispatchEvent(new Event('playing'));
    stepFrames();

    expect(onCameraError).toHaveBeenCalledTimes(1);
    expect(decode).not.toHaveBeenCalled();
  });

  it('reagenda sem lançar quando o contexto 2d do canvas não existe', () => {
    stubMediaDevices({
      getUserMedia: vi.fn().mockResolvedValue(makeStream(makeTrack())),
    });
    stubCanvasContext(null);
    const decode = vi.fn(() => null);

    const { container } = render(
      <QrScanner onCode={vi.fn()} onCameraError={vi.fn()} decode={decode} />,
    );
    prepararVideo(container).dispatchEvent(new Event('playing'));
    stepFrames();
    stepFrames();

    expect(rafQueue.size).toBe(1);
    expect(decode).not.toHaveBeenCalled();
  });
});
