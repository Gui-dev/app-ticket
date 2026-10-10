import {
  Baby,
  Drama,
  Guitar,
  LayoutGrid,
  type LucideIcon,
  Mic,
  PartyPopper,
  Theater,
  Trophy,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  shows: Guitar,
  esportes: Trophy,
  teatro: Theater,
  festivais: PartyPopper,
  comedy: Mic,
  infantil: Baby,
  danca: Drama,
};

export function categoryIcon(slug: string): LucideIcon {
  return ICONS[slug] ?? LayoutGrid;
}
