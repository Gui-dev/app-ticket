export interface CategoryFixture {
  slug: string;
  name: string;
}

export interface VenueFixture {
  slug: string;
  name: string;
  city: string;
  state: string;
}

export interface EventFixture {
  slug: string;
  title: string;
  description: string;
  categorySlug: string;
  venueSlug: string;
  startsAt: string;
  priceFromCents: number;
  imageUrl: string | null;
  badgeLabel: string | null;
  featured: boolean;
  isHot: boolean;
}

export const categoryFixtures: CategoryFixture[] = [
  { slug: 'shows', name: 'Shows' },
  { slug: 'esportes', name: 'Esportes' },
  { slug: 'teatro', name: 'Teatro' },
  { slug: 'festivais', name: 'Festivais' },
  { slug: 'comedy', name: 'Comédia' },
  { slug: 'infantil', name: 'Infantil' },
  { slug: 'danca', name: 'Dança' },
];

export const venueFixtures: VenueFixture[] = [
  {
    slug: 'teatro-renault',
    name: 'Teatro Renault',
    city: 'São Paulo',
    state: 'SP',
  },
  {
    slug: 'allianz-parque',
    name: 'Allianz Parque',
    city: 'São Paulo',
    state: 'SP',
  },
  {
    slug: 'parque-olimpico',
    name: 'Parque Olímpico',
    city: 'São Paulo',
    state: 'SP',
  },
  {
    slug: 'espaco-unimed',
    name: 'Espaço Unimed',
    city: 'São Paulo',
    state: 'SP',
  },
  { slug: 'vivo-rio', name: 'Vivo Rio', city: 'Rio de Janeiro', state: 'RJ' },
];

export const eventFixtures: EventFixture[] = [
  {
    slug: 'o-fantasma-da-opera',
    title: 'O Fantasma da Ópera',
    description:
      'O musical internacional mais famoso do mundo encanta o público brasileiro. Uma noite de clássicos inesquecíveis no palco do Teatro Renault.',
    categorySlug: 'shows',
    venueSlug: 'teatro-renault',
    startsAt: '2026-10-22T20:00:00-03:00',
    priceFromCents: 12000,
    imageUrl: null,
    badgeLabel: 'Espetáculo Internacional',
    featured: true,
    isHot: true,
  },
  {
    slug: 'derby-capital',
    title: 'Derby Capital',
    description:
      'O clássico mais aguardado do futebol brasileiro volta a reunir rivais no Allianz Parque. Torcida única, emoção do início ao fim.',
    categorySlug: 'esportes',
    venueSlug: 'allianz-parque',
    startsAt: '2026-10-25T16:00:00-03:00',
    priceFromCents: 25000,
    imageUrl: null,
    badgeLabel: 'Últimos ingressos',
    featured: false,
    isHot: true,
  },
  {
    slug: 'corpo-em-movimento',
    title: 'Corpo em Movimento',
    description:
      'Uma companhia de dança contemporânea apresenta coreografias que desafiam os limites do corpo. Experiência sensorial para toda a família.',
    categorySlug: 'danca',
    venueSlug: 'espaco-unimed',
    startsAt: '2026-10-30T19:30:00-03:00',
    priceFromCents: 15000,
    imageUrl: null,
    badgeLabel: null,
    featured: false,
    isHot: false,
  },
  {
    slug: 'standup-noite-de-verdades',
    title: 'Stand-up: Noite de Verdades',
    description:
      'Os comediantes mais afiados do país se juntam para uma noite de piadas sem filtro. Chegue cedo e prepare a barriga para rir.',
    categorySlug: 'comedy',
    venueSlug: 'espaco-unimed',
    startsAt: '2026-11-05T21:00:00-03:00',
    priceFromCents: 9000,
    imageUrl: null,
    badgeLabel: 'Estreia',
    featured: false,
    isHot: true,
  },
  {
    slug: 'corrida-de-rua-sp',
    title: 'Corrida de Rua SP',
    description:
      'A maior corrida de rua de São Paulo retorna com 10km e 5km pelas avenidas da cidade. Corra, compartilhe e comemore a chegada.',
    categorySlug: 'esportes',
    venueSlug: 'parque-olimpico',
    startsAt: '2026-11-08T07:00:00-03:00',
    priceFromCents: 5000,
    imageUrl: null,
    badgeLabel: null,
    featured: false,
    isHot: false,
  },
  {
    slug: 'pequeno-principe-musical',
    title: 'O Pequeno Príncipe: O Musical',
    description:
      'A clássica história de Saint-Exupéry ganha vida em canto, luz e encenação. Um espetáculo afetivo para crianças e adultos.',
    categorySlug: 'infantil',
    venueSlug: 'teatro-renault',
    startsAt: '2026-11-15T15:00:00-03:00',
    priceFromCents: 7000,
    imageUrl: null,
    badgeLabel: null,
    featured: false,
    isHot: false,
  },
  {
    slug: 'neon-lights-world-tour',
    title: 'Neon Lights World Tour',
    description:
      'A turnê mundial que bateu recordes de público chega ao Brasil com show audiovisual completo. Uma noite elétrica no Espaço Unimed.',
    categorySlug: 'shows',
    venueSlug: 'espaco-unimed',
    startsAt: '2026-11-18T20:00:00-03:00',
    priceFromCents: 18000,
    imageUrl: null,
    badgeLabel: 'Esgotando Lote',
    featured: true,
    isHot: true,
  },
  {
    slug: 'sertaneja-rio',
    title: 'Sertaneja Rio',
    description:
      'Os maiores nomes do sertanejo se juntam para um show único às margens do Rio. Entretenimento garantido para a galera.',
    categorySlug: 'shows',
    venueSlug: 'vivo-rio',
    startsAt: '2026-11-28T22:00:00-03:00',
    priceFromCents: 22000,
    imageUrl: null,
    badgeLabel: null,
    featured: false,
    isHot: true,
  },
  {
    slug: 'cyberpunk-electronic-festival',
    title: 'Cyberpunk Electronic Festival',
    description:
      'Três dias de música eletrônica, arte digital e cenografia futurista no Parque Olímpico. O maior festival techno do país.',
    categorySlug: 'festivais',
    venueSlug: 'parque-olimpico',
    startsAt: '2026-12-05T14:00:00-03:00',
    priceFromCents: 29000,
    imageUrl: null,
    badgeLabel: 'Festival 3 Dias',
    featured: true,
    isHot: true,
  },
  {
    slug: 'melhor-de-standup-grand-finale',
    title: 'Melhor de Stand-up: Grand Finale',
    description:
      'A grande final do festival de comédia reúne os finalistas em disputa pelo prêmio principal. Riso garantido até a última piada.',
    categorySlug: 'comedy',
    venueSlug: 'espaco-unimed',
    startsAt: '2026-12-12T21:00:00-03:00',
    priceFromCents: 11000,
    imageUrl: null,
    badgeLabel: null,
    featured: false,
    isHot: false,
  },
  {
    slug: 'a-hora-e-a-vez',
    title: 'A Hora é a Vez',
    description:
      'Uma comédia dramática sobre escolhas, tempo e segredos de família. Texto premiado em cartaz no Teatro Renault.',
    categorySlug: 'teatro',
    venueSlug: 'teatro-renault',
    startsAt: '2026-12-18T20:00:00-03:00',
    priceFromCents: 14000,
    imageUrl: null,
    badgeLabel: null,
    featured: false,
    isHot: false,
  },
  {
    slug: 'festival-de-verao',
    title: 'Festival de Verão',
    description:
      'O festival que celebra o verão carioca com atrações nacionais e internacionais no Vivo Rio. Sol, música e mar.',
    categorySlug: 'festivais',
    venueSlug: 'vivo-rio',
    startsAt: '2027-01-16T14:00:00-03:00',
    priceFromCents: 32000,
    imageUrl: null,
    badgeLabel: null,
    featured: false,
    isHot: false,
  },
];
