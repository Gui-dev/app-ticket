import { act, renderHook } from '@testing-library/react';
import type {
  SeatAvailabilityMessage,
  SeatmapDto,
  SeatStatusChange,
} from '@ticketvibe/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applySeatStatuses,
  seatAvailabilityWsUrl,
  useSeatAvailability,
} from './use-seat-availability';

const EVENT_SLUG = 'o-fantasma-da-opera';

const seatmapFixture: SeatmapDto = {
  eventSlug: EVENT_SLUG,
  sectors: [
    {
      slug: 'plateia',
      name: 'Plateia',
      priceFromCents: 12000,
      rows: [
        {
          label: 'A',
          seats: [
            { label: '1', status: 'available' },
            { label: '2', status: 'available' },
          ],
        },
        {
          label: 'B',
          seats: [{ label: '1', status: 'available' }],
        },
      ],
    },
    {
      slug: 'balcao',
      name: 'Balcão',
      priceFromCents: 19000,
      rows: [
        {
          label: 'A',
          seats: [{ label: '1', status: 'available' }],
        },
      ],
    },
  ],
};

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  url: string;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close() {}

  openOnServer() {
    this.onopen?.(new Event('open'));
  }

  messageOnServer(data: unknown) {
    this.onmessage?.(
      new MessageEvent('message', { data: JSON.stringify(data) }),
    );
  }

  rawMessageOnServer(data: string) {
    this.onmessage?.(new MessageEvent('message', { data }));
  }

  closeOnServer(code: number) {
    this.onclose?.(new CloseEvent('close', { code, wasClean: true }));
  }
}

function stubWebSocket() {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
}

function lastSocket() {
  const socket = FakeWebSocket.instances.at(-1);
  if (!socket) throw new Error('nenhum socket criado');
  return socket;
}

describe('applySeatStatuses', () => {
  it('aplica a troca de status à cadeira certa', () => {
    const changes: SeatStatusChange[] = [
      {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '2',
        status: 'occupied',
      },
    ];

    const result = applySeatStatuses(seatmapFixture, changes);

    const plateia = result.sectors.find((sector) => sector.slug === 'plateia');
    expect(plateia?.rows[0]?.seats[1]?.status).toBe('occupied');
    expect(plateia?.rows[0]?.seats[0]?.status).toBe('available');
    expect(plateia?.rows[1]?.seats[0]?.status).toBe('available');
    expect(result.sectors[1]?.rows[0]?.seats[0]?.status).toBe('available');
    expect(result.eventSlug).toBe(seatmapFixture.eventSlug);
  });

  it('aplica várias trocas na mesma passagem', () => {
    const changes: SeatStatusChange[] = [
      {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '1',
        status: 'unavailable',
      },
      {
        sectorSlug: 'balcao',
        rowLabel: 'A',
        seatLabel: '1',
        status: 'occupied',
      },
    ];

    const result = applySeatStatuses(seatmapFixture, changes);

    expect(result.sectors[0]?.rows[0]?.seats[0]?.status).toBe('unavailable');
    expect(result.sectors[1]?.rows[0]?.seats[0]?.status).toBe('occupied');
  });

  it('devolve o mapa inalterado quando a identidade é desconhecida', () => {
    const changes: SeatStatusChange[] = [
      {
        sectorSlug: 'setor-fantasma',
        rowLabel: 'A',
        seatLabel: '1',
        status: 'occupied',
      },
      {
        sectorSlug: 'plateia',
        rowLabel: 'Z',
        seatLabel: '1',
        status: 'occupied',
      },
      {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '99',
        status: 'occupied',
      },
    ];

    expect(applySeatStatuses(seatmapFixture, changes)).toEqual(seatmapFixture);
  });
});

describe('seatAvailabilityWsUrl', () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

  afterEach(() => {
    if (originalApiUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_URL;
    } else {
      process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    }
  });

  it('deriva ws:// do http:// configurado', () => {
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001';

    expect(seatAvailabilityWsUrl(EVENT_SLUG)).toBe(
      `ws://localhost:3001/events/${EVENT_SLUG}/seat-availability`,
    );
  });

  it('deriva wss:// do https:// configurado', () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';

    expect(seatAvailabilityWsUrl(EVENT_SLUG)).toBe(
      `wss://api.example.com/events/${EVENT_SLUG}/seat-availability`,
    );
  });

  it('queda para localhost:3001 sem a variável de ambiente', () => {
    delete process.env.NEXT_PUBLIC_API_URL;

    expect(seatAvailabilityWsUrl(EVENT_SLUG)).toBe(
      `ws://localhost:3001/events/${EVENT_SLUG}/seat-availability`,
    );
  });
});

describe('useSeatAvailability', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_API_URL;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('abre a conexão com a URL certa e entrega mensagens válidas ao onMessage', () => {
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001';
    stubWebSocket();

    const messages: SeatAvailabilityMessage[] = [];
    const { result } = renderHook(() =>
      useSeatAvailability({
        eventSlug: EVENT_SLUG,
        onMessage: (m) => messages.push(m),
      }),
    );

    expect(result.current).toBe(false);
    expect(lastSocket().url).toBe(
      `ws://localhost:3001/events/${EVENT_SLUG}/seat-availability`,
    );

    act(() => {
      lastSocket().openOnServer();
    });
    expect(result.current).toBe(true);

    act(() => {
      lastSocket().messageOnServer({
        type: 'connected',
        eventSlug: EVENT_SLUG,
      });
    });
    expect(messages).toEqual([{ type: 'connected', eventSlug: EVENT_SLUG }]);

    act(() => {
      lastSocket().messageOnServer({
        type: 'seat_status_changed',
        eventSlug: EVENT_SLUG,
        changes: [
          {
            sectorSlug: 'plateia',
            rowLabel: 'A',
            seatLabel: '1',
            status: 'occupied',
          },
        ],
      });
    });
    expect(messages).toHaveLength(2);
    expect(messages[1]?.type).toBe('seat_status_changed');
  });

  it('ignora mensagens inválidas sem derrubar a conexão', () => {
    stubWebSocket();

    const onMessage = vi.fn();
    const { result } = renderHook(() =>
      useSeatAvailability({ eventSlug: EVENT_SLUG, onMessage }),
    );

    act(() => {
      lastSocket().openOnServer();
    });

    act(() => {
      lastSocket().rawMessageOnServer('isto não é json');
    });
    act(() => {
      lastSocket().messageOnServer({ type: 'surpresa' });
    });
    act(() => {
      lastSocket().messageOnServer({
        type: 'seat_status_changed',
        changes: [{ sem: 'status' }],
      });
    });

    expect(onMessage).not.toHaveBeenCalled();
    expect(result.current).toBe(true);
  });

  it('reconecta com backoff e volta a open mais tarde após fechar fora do 4004', async () => {
    stubWebSocket();
    vi.useFakeTimers();

    const { result } = renderHook(() =>
      useSeatAvailability({ eventSlug: EVENT_SLUG, onMessage: () => {} }),
    );

    act(() => {
      lastSocket().openOnServer();
    });
    expect(result.current).toBe(true);
    expect(FakeWebSocket.instances).toHaveLength(1);

    act(() => {
      lastSocket().closeOnServer(1000);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(FakeWebSocket.instances).toHaveLength(2);

    act(() => {
      lastSocket().openOnServer();
    });
    expect(result.current).toBe(true);

    act(() => {
      lastSocket().closeOnServer(1006);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(FakeWebSocket.instances).toHaveLength(3);
  });

  it('não reconecta quando o servidor fecha com o código 4004', async () => {
    stubWebSocket();
    vi.useFakeTimers();

    const { result } = renderHook(() =>
      useSeatAvailability({ eventSlug: EVENT_SLUG, onMessage: () => {} }),
    );

    act(() => {
      lastSocket().openOnServer();
    });
    act(() => {
      lastSocket().closeOnServer(4004);
    });
    expect(result.current).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    act(() => {
      lastSocket().openOnServer();
    });
    act(() => {
      lastSocket().closeOnServer(4004);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(result.current).toBe(false);
  });

  it('devolve false e não lança quando o WebSocket não existe no ambiente', () => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', undefined);

    const { result } = renderHook(() =>
      useSeatAvailability({ eventSlug: EVENT_SLUG, onMessage: () => {} }),
    );

    expect(result.current).toBe(false);
    expect(FakeWebSocket.instances).toHaveLength(0);
  });
});
