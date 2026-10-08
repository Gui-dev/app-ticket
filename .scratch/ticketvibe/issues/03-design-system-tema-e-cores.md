# 03: Design system: tema e cores do TICKETVIBE

**What to build:** Os primitivos de UI já nascem com o visual final dos mockups: um desenvolvedor abre o Storybook e vê botões, badges, chips de categoria, cards de evento e inputs de busca com a paleta, tipografia e formas do TICKETVIBE (fundo escuro, verde neon de ação, roxo de superfície), prontos para serem consumidos pela home e pelas demais páginas.

**Blocked by:** 01 (Base do monorepo + ambiente local)

**Status:** done

- [x] Tokens de cor extraídos dos mockups (fundo, superfícies, verde de ação, roxo, bordas, estados hover/focus) definidos como variáveis Tailwind/Shadcn
- [x] Tipografia, raios de borda e sombras definidos como tokens coerentes com os mockups
- [x] Primitivos documentados no Storybook com stories: botão (primário/secundário/ghost), badge, chip de categoria selecionado/não selecionado, card de evento, input de busca, cabeçalho (logo, busca, localização, ações)
- [x] Tema escuro aplicado como padrão do `apps/web`
- [x] Storybook renderiza sem dado externo e é executável por comando documentado
