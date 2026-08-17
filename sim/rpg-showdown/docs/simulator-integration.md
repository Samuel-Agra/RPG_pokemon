# Pontos de integracao com o simulador

As regras de negocio do RPG nao ficam no nucleo do Showdown. Os arquivos abaixo expoem somente campos ou hooks estreitos:

- `sim/teams.ts`: entrada opcional `PokemonSet.rpg`;
- `sim/pokemon.ts`: estado RPG por instancia, inicializacao selvagem e notificacao de desmaio;
- `sim/side.ts`: notificacao de Pokemon criado;
- `sim/battle-actions.ts`: notificacoes de entrada, saida e transformacao Mega/Ultra;
- `sim/battle.ts`: estado opcional da batalha e uma notificacao final `onBattleEnd`;
- `server/tournaments/index.ts`: ponte entre o bracket nativo, jogadores e NPCs do RPG.

Responsabilidade dos hooks:

- `RPGManager.onPokemonSetInitialized`: EV selvagem e nivel de lendario antes do calculo final de atributos;
- `RPGManager.onPokemonCreated`: migracao e carga inicial do estado persistente;
- `RPGManager.onSwitchIn/onSwitchOut`: participacao e ciclo do estado persistente;
- `RPGManager.onPokemonFainted`: derrotas, amizade e participacao na experiencia;
- `RPGManager.onMegaEvolution`: registro de mudanca temporaria de forma;
- `RPGManager.onBattleEnd`: campo, progressao, persistencia, resultado estruturado e regressao visual.

Nenhum modulo RPG interpreta o log textual para descobrir o resultado. Captura, fuga, cura, revive, recompensas, estado final dos Pokemon e estado do campo sao devolvidos por contratos estruturados.
