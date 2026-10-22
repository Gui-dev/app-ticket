import { describe, expect, it } from 'vitest';

import {
  type FanoutTarget,
  SeatAvailabilityFanout,
} from './seat-availability-fanout.js';

const MENSAGEM_FANTASMA = JSON.stringify({
  type: 'seat_status_changed',
  eventSlug: 'o-fantasma-da-opera',
  changes: [
    {
      sectorSlug: 'plateia',
      rowLabel: 'Fila A',
      seatLabel: 'Cadeira 1',
      status: 'occupied',
    },
  ],
});

function targetColetor(textosRecebidos: string[]): FanoutTarget {
  return { send: (text) => textosRecebidos.push(text) };
}

describe('SeatAvailabilityFanout', () => {
  it('distribui o delta apenas para os sockets da room do evento', () => {
    const fanout = new SeatAvailabilityFanout();
    const recebidosFantasmaA: string[] = [];
    const recebidosFantasmaB: string[] = [];
    const recebidosMiserables: string[] = [];
    fanout.register('o-fantasma-da-opera', targetColetor(recebidosFantasmaA));
    fanout.register('o-fantasma-da-opera', targetColetor(recebidosFantasmaB));
    fanout.register('les-miserables', targetColetor(recebidosMiserables));

    fanout.fanout(MENSAGEM_FANTASMA);

    expect(recebidosFantasmaA).toEqual([MENSAGEM_FANTASMA]);
    expect(recebidosFantasmaB).toEqual([MENSAGEM_FANTASMA]);
    expect(recebidosMiserables).toEqual([]);
  });

  it('descarta mensagem inválida sem quebrar', () => {
    const fanout = new SeatAvailabilityFanout();
    const recebidos: string[] = [];
    fanout.register('o-fantasma-da-opera', targetColetor(recebidos));

    fanout.fanout('nao-json');
    fanout.fanout('{"type":"desconhecido"}');

    expect(recebidos).toEqual([]);
  });

  it('remove socket morto e segue entregando', () => {
    const fanout = new SeatAvailabilityFanout();
    const recebidos: string[] = [];
    const socketMorto: FanoutTarget = {
      send: () => {
        throw new Error('socket fechado');
      },
    };
    fanout.register('o-fantasma-da-opera', socketMorto);
    fanout.register('o-fantasma-da-opera', targetColetor(recebidos));

    fanout.fanout(MENSAGEM_FANTASMA);

    expect(recebidos).toEqual([MENSAGEM_FANTASMA]);

    recebidos.length = 0;
    fanout.fanout(MENSAGEM_FANTASMA);

    expect(recebidos).toEqual([MENSAGEM_FANTASMA]);
  });
});
