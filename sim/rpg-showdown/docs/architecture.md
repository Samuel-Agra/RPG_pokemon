# Arquitetura do RPG Showdown

O modulo esta organizado por responsabilidade:

- `data/`: dados estaticos de experiencia da geracao 9 e itens do RPG;
- `events/`: adaptadores pequenos chamados pelo `RPGManager`;
- `integration/`: contratos para o servidor RPG externo;
- `systems/battle/`: regras que exigem uma batalha ativa do Showdown;
- `systems/inventory/`: Bag, Box, transacoes, cadastro/uso de itens e loja;
- `systems/`: servicos entre dominios que ainda nao justificam outra pasta;
- `state.ts`: contratos publicos de estado e resultado;
- `manager.ts`: apenas coordenacao do ciclo de vida;
- `logger.ts`: diagnostico opt-in;
- `index.ts`: barrel publico estavel.

Uma nova pasta deve ser criada quando pelo menos dois modulos coesos compartilham um dominio. Isso evita pastas com um unico arquivo e mantem imports previsiveis. Regras de negocio permanecem em `sim/rpg-showdown/`; arquivos do simulador contem apenas hooks de ciclo de vida.

Consumidores devem importar por `sim/rpg-showdown/index.ts`, e nao por caminhos internos. Assim, pastas internas podem ser reorganizadas sem mudar a API publica. `dist/` e gerado por `npm run build` e nunca deve ser tratado como codigo-fonte.
