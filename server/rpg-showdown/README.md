# Login do RPG Showdown

Este modulo controla identidades, personagens e sessoes do RPG. Ele não reutiliza conta, senha, cookie, login nem nivel de permissao do Pokemon Showdown.

## Configuração

O codigo local do Mestre fica no arquivo privado `config/config.js`:

```js
exports.rpgmastercode = '14081998';
exports.rpgcharacterfile = 'config/rpg-characters.json';
exports.rpgbattlefile = 'config/rpg-battle-sessions.json';
```

Troque o valor antes de expor o servidor. `config/config-example.js` documenta a mesma chave.
Personagens e sessões de batalha usam arquivos JSON separados e gravação atômica. Se o processo
for interrompido durante uma batalha, a preparação volta ao estado `ready` no próximo início e
qualquer aposta ainda reservada é reembolsada antes de permitir uma nova tentativa.

## Inicio rapido no IntelliJ

Abra a pasta do projeto no IntelliJ, use o terminal configurado para WSL e execute:

```sh
npm run rpg
```

A interface fica em `http://127.0.0.1:8000/rpg/`. Para usar outra porta:

```sh
npm run rpg -- 8010
```

Encerre com `Ctrl+C`. O atalho inicia o servidor interno necessario para simulacao e
persistencia, mas apresenta diretamente a entrada do RPG. As protecoes normais do
Showdown permanecem habilitadas.

## Identidades

- Mestre: entra com o codigo configurado e nao precisa de conta.
- Player: escolhe um personagem da campanha e informa a senha RPG desse personagem.
- Showdown: permanece um sistema de contas completamente separado.

A lista publica de selecao retorna somente:

```ts
{
  id: string;
  characterName: string;
  playerName: string;
  avatar: string;
}
```

Ela nao revela dinheiro, equipe, Bag, Box ou credenciais.

## Criação de personagem

`createCharacter()` recebe:

```ts
{
  characterName: string;
  playerName: string;
  avatar: string;
  password: string;
  initialMoney: number;
  starter: {
    species: string;
    nickname?: string;
    gender: "M" | "F" | "N";
    level?: number;
  };
}
```

A tela futura deve pedir senha e confirmação de senha. A confirmação existe apenas no frontend; o backend recebe uma unica senha depois que os dois campos coincidirem.

O inicial usa dados da geracao 9:

- nivel 5 por padrao;
- ate quatro golpes aprendidos por nivel;
- habilidade, natureza, IVs e shiny aleatorios;
- exatamente 508 EVs aleatórios, em blocos de 4 e com limite de 252;
- amizade inicial 50;
- uma equipe com o inicial;
- Box `small`, com 10 espacos;
- Bag `starter`.

A senha e armazenada como hash `scrypt` com salt aleatorio. Senha em texto puro nao e persistida.

## Sessoes

Metodos principais:

| Operacao | Resultado |
| --- | --- |
| `loginMaster(code)` | sessao Mestre |
| `loginPlayer(characterId, password)` | sessao Player presa ao personagem |
| `getSession(token)` | sessao valida atual |
| `logout(token)` | invalida a sessao |
| `viewAsPlayer(token, characterId)` | restringe temporariamente o Mestre |
| `exitPlayerView(token)` | restaura o modo Mestre |
| `createCharacterDeletionChallenge(token)` | cria uma confirmacao temporaria com palavra Pokemon |
| `deleteViewedCharacter(token, challengeId, confirmation)` | exclui o Player visualizado e invalida suas sessoes |

A duracao padrao e 24 horas. O servidor guarda somente o hash do token.

No armazenamento local do navegador devem ficar apenas o token e dados publicos da sessao. Nunca salvar senha do Player ou codigo do Mestre.

Um Player nao troca de personagem dentro da mesma sessao. Para isso, deve sair e voltar a tela inicial.

## Permissoes

O Mestre pode listar e editar todos os personagens, equipes, Boxes, Bags e dinheiro; iniciar e observar batalhas; controlar selvagens e NPCs; e visualizar como Player.

O Player pode ler somente seu personagem, equipe, Box, Bag e dinheiro, alem de iniciar suas batalhas. O identificador do dono e verificado em cada operacao protegida.

Quando o Mestre usa `viewAsPlayer`, a sessao continua tendo papel `master`, mas opera em modo `player` e recebe exatamente o escopo do personagem selecionado.

## Preparacao de batalha

A preparacao usa uma `Battle Session` versionada e separada da sala do Showdown. O fluxo de estados e:

```text
draft -> inviting -> ready -> started
                   -> declined
draft/inviting/ready/declined -> cancelled
```

Somente o Mestre em modo Mestre pode criar, editar, enviar convites, cancelar e iniciar.
Cada Player ve apenas sessoes nas quais seu personagem participa e pode responder somente
ao proprio convite. Qualquer edicao posterior do Mestre volta a sessao para `draft` e
limpa as respostas anteriores.

A configuracao registra:

- formato `singles`, `doubles`, `multi`, `triples`, `raid` ou `boss`;
- participantes dos times A e B: Player, NPC, selvagem, chefe ou horda;
- limite de 1 a 6 Pokemon por participante e selecao da equipe persistente;
- clima e terreno temporarios ou permanentes;
- turno inicial, dia/noite, caverna e agua;
- fuga, experiencia, trocas, itens e escolha de Pokemon pelo Player.

Ao iniciar, o backend retorna um `RPGBattleLaunchRequest` estruturado. Ele traduz as
opcoes para `RPGBattleState` do simulador e para o contexto do calculador de Pokebolas.
A criacao efetiva da sala do Showdown sera conectada a esse pedido na proxima etapa.

Rotas HTTP:

| Metodo e rota | Operacao |
| --- | --- |
| `GET /api/rpg/battle-sessions` | lista as sessoes permitidas |
| `POST /api/rpg/battle-sessions` | Mestre cria um rascunho |
| `GET /api/rpg/battle-sessions/:id` | abre uma sessao permitida |
| `PATCH /api/rpg/battle-sessions/:id` | Mestre configura a sessao |
| `DELETE /api/rpg/battle-sessions/:id` | Mestre cancela a sessao |
| `POST /api/rpg/battle-sessions/:id/invite` | Mestre envia os convites |
| `POST /api/rpg/battle-sessions/:id/response` | Player aceita ou recusa |
| POST /api/rpg/battle-sessions/:id/selection | Player salva a selecao permitida antes de responder |
| `POST /api/rpg/battle-sessions/:id/start` | Mestre gera o pedido de inicio |

## Persistencia

`RPGMemoryCharacterRepository` e a implementacao inicial para testes e desenvolvimento. Os dados somem ao reiniciar o processo.

`RPGCharacterRepository` define a fronteira que devera ser implementada pelo banco externo:

```ts
create(record): void;
get(id): record | undefined;
delete(id): boolean;
set(record): void;
list(): record[];
```

Credenciais, estado do personagem e sessoes possuem versoes proprias. O adaptador de banco deve preservar essas versoes e fazer gravacoes atomicas.

## Frontend

A interface local fica em `/rpg/` e usa HTML, CSS e JavaScript. Recursos visuais externos da compatibilidade V1 passam por um provedor configuravel e nao sao copiados para a pasta de assets. A interface segue o visual do Showdown e inclui:

- escolha entre Mestre e Player;
- codigo do Mestre com campo retratil;
- selecao de personagem com senha retratil;
- criacao de personagem com seletores visuais retrateis para avatar e Pokemon inicial;
- referencias externas temporarias para sprites de treinadores e Pokemon servidos pelo Showdown;
- catalogo pesquisavel com a versao individual mais recente por treinador ou classe;
- restauracao da sessao local;
- painel do Mestre;
- painel do Player;
- exclusao permanente do Player visualizado, protegida por palavra de confirmacao;
- modo `Visualizar como Player`;
- preparacao visual de batalhas pelo Mestre, com participantes, selecao, ambiente e regras;
- convites de batalha para Players, com aceite, recusa e selecao de Pokemon quando permitida;
- logout e retorno a tela inicial.

O catalogo de avatares do RPG fica em `server/static/rpg/avatars.json`. Ele armazena apenas
identificadores e nomes obtidos das listas de `server/chat-commands/avatars.tsx`; as imagens
continuam externas e passam pelo provedor configuravel. O gerador agrupa versoes de geracao,
roupa e genero da mesma classe, escolhe a ultima versao registrada, remove sprites com duas ou
mais pessoas e remove avatares que existem somente no catalogo antigo sem versao atualizada.
As variacoes tematicas `miku-*` permanecem separadas.
Para atualizar o arquivo depois de mudancas no Showdown:

```sh
node server/rpg-showdown/scripts/generate-avatar-catalog.js
```

A camada HTTP fica em `http.ts`:

| Metodo e rota | Operacao |
| --- | --- |
| `GET /api/rpg/characters` | lista publica para selecao |
| `POST /api/rpg/characters` | cria personagem |
| `POST /api/rpg/session/master` | login do Mestre |
| `POST /api/rpg/session/player` | login do Player |
| `GET /api/rpg/session` | restaura sessao |
| `DELETE /api/rpg/session` | logout |
| `POST /api/rpg/session/view-as` | Mestre visualiza Player |
| `POST /api/rpg/character/delete-challenge` | gera confirmacao temporaria para excluir o Player visualizado |
| `DELETE /api/rpg/character` | confirma e exclui o Player visualizado |
| `DELETE /api/rpg/session/view-as` | sai da visualizacao |
| `GET /api/rpg/character` | estado permitido do personagem |
| `GET /api/rpg/characters/all` | painel completo do Mestre |

A exclusao exige que a sessao do Mestre esteja em `Visualizar como Player`. Cada clique gera
uma palavra relacionada a Pokemon diferente da anterior, valida por dois minutos. A confirmacao
e verificada no servidor; quando aceita, as sessoes daquele Player sao invalidadas e qualque
Mestre que o esteja visualizando retorna ao modo Mestre.

Rotas protegidas usam `Authorization: Bearer <token>`. Respostas nao podem ser armazenadas em cache.

Erros de autenticacao de Player usam a mesma mensagem para personagem inexistente e senha incorreta, evitando revelar quais personagens possuem credencial.

## Formatos na preparacao visual

- Singles: 1 contra 1 ativo.
- Doubles: 2 contra 2 ativos.
- Multi: 2 treinadores contra 2, com 1 Pokemon ativo por treinador; todos contra todos corresponde ao Free-For-All.
- Triples: 3 contra 3 ativos.
- Raid: todos os Players da equipe A, com 1 Pokemon ativo por participante, contra 1 alvo da equipe B.
- Boss: encontro selvagem limitado a lendarios e pseudolendarios elegiveis; nivel entre 1 e 999.
  Goodra, Goodra-Hisui, Garchomp, Hydreigon, Dragapult e Archaludon permanecem pseudolendarios,
  mas nao podem ser selecionados como Boss.
- Horda: uma fila da mesma especie, com o numero simultaneo de ativos definido pelo formato.
- Selvagens, Bosses e membros de hordas sem natureza informada recebem uma natureza aleatoria da geracao 9; uma natureza explicita e preservada.

Players escolhem quais Pokemon levar dentro do limite definido pelo Mestre. Raid e a excecao:
todos os Players e ate os seis Pokemon de cada equipe sao selecionados automaticamente.

A sessao pronta nao e marcada como iniciada enquanto nao existir uma sala real. A ligacao entre
sessao RPG, conexoes dos Players e RoomBattle e o proximo adaptador necessario.
