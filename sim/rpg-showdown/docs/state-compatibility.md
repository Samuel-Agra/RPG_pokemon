# Compatibilidade do estado RPG

A versao atual do estado de Pokemon/batalha e `2`. A menor versao legivel e `1`; um objeto sem `version` e interpretado como versao `1`.

Regras de compatibilidade:

1. entradas sao clonadas e nunca migradas no proprio objeto recebido;
2. versao `1` e migrada explicitamente para versao `2`;
3. versao `2` e aceita sem alteracao alem da copia defensiva;
4. versoes zero, negativas, fracionarias ou futuras sao rejeitadas;
5. JSON malformado, arrays, valores primitivos e null sao rejeitados;
6. serializacao sempre grava a versao atual.

`RPGStateCodec.serializePokemon` e `serializeBattle` sao os metodos preferidos. O `serialize` generico permanece para consumidores antigos. `RPG_STATE_COMPATIBILITY` informa a versao atual, a menor legivel e a versao atribuida a estados sem numero.

Uma mudanca incompativel deve:

1. incrementar `RPG_STATE_VERSION`;
2. manter a versao anterior como legivel;
3. adicionar uma migracao sequencial;
4. adicionar testes de round-trip e rejeicao de versao futura;
5. atualizar este documento e o contrato externo.

A retomada ocorre entre batalhas, nao a partir de um snapshot interno de turno. O servidor externo persiste `RPGBattleResult.pokemon[].state` e envia esses estados ao criar a proxima batalha. Bag, Box, inventario, loja e torneio possuem constantes de versao independentes porque sao armazenados separadamente.
