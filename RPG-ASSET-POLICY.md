# Politica de recursos visuais do RPG

## Objetivo

Manter o codigo do RPG auditavel e permitir que recursos externos sejam substituidos sem reescrever a interface.

## Classificacoes aceitas

1. **Original do projeto**: criado especificamente para o RPG e sem copia de arte oficial.
2. **Terceiro com licenca**: acompanhado de autoria, origem, licenca e limites de modificacao.
3. **Referencia externa temporaria**: URL configuravel, sem arquivo copiado para o repositorio.
4. **Local nao distribuido**: recurso usado apenas pelo responsavel pela campanha e excluido da distribuicao publica.

## Regras

- Nao adicionar sprites, audio, cenarios ou efeitos extraidos de jogos oficiais ao repositorio.
- Credito nao substitui licenca ou autorizacao.
- A AGPL do RPG nao cobre marcas, personagens ou artes de terceiros.
- Nao baixar recursos externos durante build, instalacao ou inicializacao.
- Nao criar proxy, espelho ou cache permanente de recursos externos.
- Toda URL externa deve passar pelo provedor central em `server/static/rpg/asset-provider.js`.
- Toda dependencia visual deve constar em `server/static/rpg/assets/external-assets.json`.
- Musicas de batalha seguem a mesma regra: sao carregadas pelo provedor externo e nao sao copiadas para o repositorio.
- Recursos de artistas da comunidade exigem verificacao individual; a presenca no Showdown nao significa permissao para editar ou redistribuir.

## Compatibilidade temporaria da V1

A V1 ainda pode carregar recursos diretamente do host publico do Pokemon Showdown. Essa compatibilidade:

- pode ser desligada em `server/static/rpg/asset-config.js`;
- nao armazena os arquivos no repositorio;
- nao representa autorizacao, afiliacao ou transferencia de licenca;
- deve ser substituida gradualmente por recursos originais ou expressamente licenciados.

## Revisao de novos pedidos

Antes de implementar um novo recurso visual ou copiar codigo externo:

1. identificar a origem e os titulares;
2. verificar a licenca e as condicoes de uso;
3. avaliar se o pedido exige copia ou adaptacao substancial;
4. apresentar uma alternativa original ou licenciada;
5. alertar o responsavel pelo projeto e pedir confirmacao quando houver risco relevante.

## Aviso

Este documento organiza as decisoes do projeto e nao constitui parecer juridico.
