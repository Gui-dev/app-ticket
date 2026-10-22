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
  return {
    send: (text) => textosRecebidos.push(text),
    ping: () => {},
    terminate: () => {},
  };
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
      ping: () => {},
      terminate: () => {},
    };
    fanout.register('o-fantasma-da-opera', socketMorto);
    fanout.register('o-fantasma-da-opera', targetColetor(recebidos));

    fanout.fanout(MENSAGEM_FANTASMA);

    expect(recebidos).toEqual([MENSAGEM_FANTASMA]);

    recebidos.length = 0;
    fanout.fanout(MENSAGEM_FANTASMA);

    expect(recebidos).toEqual([MENSAGEM_FANTASMA]);
  });

  it('faz ping nos vivos e encerra quem não respondeu desde o ping anterior', () => {
    const fanout = new SeatAvailabilityFanout();
    const pings: string[] = [];
    const terminados: string[] = [];
    const vivo: FanoutTarget = {
      send: () => {},
      ping: () => pings.push('vivo'),
      terminate: () => terminados.push('vivo'),
    };
    const morto: FanoutTarget = {
      send: () => {},
      ping: () => pings.push('morto'),
      terminate: () => terminados.push('morto'),
    };
    fanout.register('o-fantasma-da-opera', vivo);
    fanout.register('o-fantasma-da-opera', morto);

    fanout.sweep();
    expect(pings).toEqual(['vivo', 'morto']);
    expect(terminados).toEqual([]);

    fanout.markAlive(vivo);

    const recebidos: string[] = [];
    vivo.send = (text) => recebidos.push(text);
    morto.send = () => recebidos.push('morto-não-deveria');
    fanout.sweep();
    expect(terminados).toEqual(['morto']);
    expect(pings).toEqual(['vivo', 'morto', 'vivo']);

    fanout.fanout(MENSAGEM_FANTASMA);
    expect(recebidos).toEqual([MENSAGEM_FANTASMA]);
  });

  it('encerra todos os sockets restantes e limpa as rooms', () => {
    const fanout = new SeatAvailabilityFanout();
    const recebidosFantasmaA: string[] = [];
    const recebidosFantasmaB: string[] = [];
    const recebidosMiserables: string[] = [];
    fanout.register('o-fantasma-da-opera', {
      send: (text) => recebidosFantasmaA.push(text),
      ping: () => {},
      terminate: () => recebidosFantasmaA.push('terminado'),
    });
    fanout.register('o-fantasma-da-opera', {
      send: (text) => recebidosFantasmaB.push(text),
      ping: () => {},
      terminate: () => recebidosFantasmaB.push('terminado'),
    });
    fanout.register('les-miserables', {
      send: (text) => recebidosMiserables.push(text),
      ping: () => {},
      terminate: () => recebidosMiserables.push('terminado'),
    });

    fanout.terminateAll();

    expect(recebidosFantasmaA).toEqual(['terminado']);
    expect(recebidosFantasmaB).toEqual(['terminado']);
    expect(recebidosMiserables).toEqual(['terminado']);

    fanout.fanout(MENSAGEM_FANTASMA);
    expect(recebidosFantasmaA).toEqual(['terminado']);
    expect(recebidosFantasmaB).toEqual(['terminado']);
  });
});
