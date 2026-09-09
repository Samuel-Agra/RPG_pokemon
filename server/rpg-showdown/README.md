# Login do RPG Showdown

Este modulo controla identidades, personagens e sessoes do RPG. Ele não reutiliza conta, senha, cookie, login nem nivel de permissao do Pokemon Showdown.

## Configuração

O codigo local do Mestre fica no arquivo privado `config/config.js`:

```js
exports.rpgmastercode = '14081998';
exports.rpgcharacterfile = 'config/rpg-characters.json';
exports.rpgbattlefile = 'config/rpg-battle-sessions.json';
exports.rpgshopfile = 'config/rpg-shops.json';
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

## Lojas

A página central de comércio possui sete especialidades: Poké Mart, Equipamentos, Evolução, TMs,
Mega Pedras, Fazenda e Brechó. Os itens de procriação continuam exclusivos do Berçário.

Cada estabelecimento possui catálogo próprio persistido em `config/rpg-shops.json`. O estoque é
global e compartilhado por todos os Players. Compra e venda são configuradas separadamente, com
preços independentes, e um produto pode ficar disponível, visível bloqueado ou oculto.

O Mestre configura item, estoque, preços, aceitação e visibilidade. O Player usa abas independentes
de compra e venda, pesquisa, filtros, detalhes, quantidades e carrinho. Dinheiro, Bag e estoque são
validados juntos antes da gravação; revisões impedem que duas sessões gastem o mesmo estoque.

Rotas HTTP:

| Método e rota | Operação |
| --- | --- |
| `GET /api/rpg/shops` | lista os sete estabelecimentos |
| `GET /api/rpg/shops/:id` | abre catálogo, estoque e inventário permitido |
| `POST /api/rpg/shops/:id/trade` | executa um carrinho de compra ou venda |
| `POST /api/rpg/shops/:id/master-offer` | Mestre configura uma oferta |

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

O catalogo independente de avatares do RPG fica em `server/static/rpg/avatars.json`.
Ele armazena os identificadores e nomes utilizados pela interface; as imagens continuam
externas e passam pelo provedor configuravel.

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

Depois que uma conta global seleciona uma mesa, o mesmo token da versao 2 tambem autentica as rotas
do mundo RPG em `/api/rpg/*`. Cada requisicao resolve novamente a mesa ativa e usa repositorios,
sessoes de batalha, concursos e dados de campanha isolados por `table_id`. Proprietarios e Mestres
entram com acesso de Mestre; Players usam somente o personagem vinculado a sua conta naquela mesa;
espectadores podem consultar apenas atividades que ja estejam em andamento. Trocar a mesa ativa muda
o mundo atendido pela requisicao seguinte sem reutilizar personagens ou estado da mesa anterior.

Operacoes compostas das contas e mesas usam uma unica unidade de trabalho. Criacao de conta com
codigos de recuperacao, criacao de mesa com proprietario e auditoria, entrada por convite, alteracao
ou remocao de membros, recuperacao de senha e revogacao coletiva de sessoes sao enviadas ao MySQL
em uma unica transacao. Uma falha executa `ROLLBACK`; no repositorio em memoria, o estado anterior
tambem e restaurado, impedindo entidades parciais durante testes ou inicializacao sem banco.

As tentativas de login sao agrupadas por uma chave irreversivel da conta, alem da origem da
tentativa. Quando uma recuperacao de senha e concluida, todos os bloqueios associados aquela conta
sao removidos dentro da mesma transacao; a nova senha pode ser usada imediatamente em qualquer
origem sem esperar o prazo normal do limitador.

As rotas de contas e mesas tambem usam um bloqueio consultivo nomeado do MySQL. O bloqueio existe
no banco, portanto coordena processos e maquinas diferentes que atendam a mesma instalacao. Dentro
dele, o servidor recarrega o estado global confirmado antes de validar e executar a requisicao; a
segunda instancia nunca consome um convite ou codigo de recuperacao a partir de um snapshot antigo.
O bloqueio e liberado em `finally`, inclusive quando validacao, operacao ou persistencia falham.

As contas globais e mesas da versao 2 usam um espaco de rotas separado durante a migracao:

| Metodo e rota | Operacao |
| --- | --- |
| `POST /api/rpg/v2/accounts` | cria uma conta global |
| `POST /api/rpg/v2/session` | autentica uma conta global |
| `GET /api/rpg/v2/session` | restaura a sessao e retorna a conta publica |
| `DELETE /api/rpg/v2/session` | encerra a sessao global |
| `GET /api/rpg/v2/sessions` | lista as sessoes ativas da conta sem expor tokens |
| `DELETE /api/rpg/v2/sessions/:id` | revoga uma sessao especifica da conta |
| `DELETE /api/rpg/v2/sessions` | encerra todas as sessoes da conta |
| `GET /api/rpg/v2/tables` | lista as mesas das quais a conta participa |
| `POST /api/rpg/v2/tables` | cria uma mesa e torna a conta sua proprietaria |
| `DELETE /api/rpg/v2/tables/:id` | arquiva uma mesa como seu proprietario |
| `POST /api/rpg/v2/tables/:id/invites` | cria um convite para a mesa |
| `GET /api/rpg/v2/tables/:id/invites` | lista convites sem expor seus codigos ou hashes |
| `DELETE /api/rpg/v2/tables/:id/invites/:inviteId` | revoga um convite |
| `POST /api/rpg/v2/invites/join` | ingressa em uma mesa usando um convite |
| `POST /api/rpg/v2/tables/:id/select` | define a mesa ativa da sessao |
| `POST /api/rpg/v2/tables/deselect` | encerra o contexto da mesa sem remover a associacao |
| `GET /api/rpg/v2/tables/:id/permissions` | retorna as permissoes padrao efetivas do cargo atual |
| `GET /api/rpg/v2/tables/:id/members` | lista membros e perfis publicos da mesa |
| `PATCH /api/rpg/v2/tables/:id/members/:accountId` | promove ou rebaixa um membro |
| `DELETE /api/rpg/v2/tables/:id/members/:accountId` | remove um membro |
| `POST /api/rpg/v2/tables/:id/members/:accountId/block` | bloqueia um membro |
| `DELETE /api/rpg/v2/tables/:id/membership` | sai voluntariamente da mesa |

Senhas e tokens nunca sao persistidos em texto puro. O codigo do convite aparece somente na
resposta de criacao; seu hash interno nao faz parte do contrato HTTP.

Ao selecionar uma mesa, a sessao publica passa a expor `activeTableId`, `membershipId` e `role`.
O contexto RPG derivado registra tambem a conta, a mesa, a associacao e o personagem selecionado,
quando houver. Esses valores sao resolvidos no servidor a partir do token: toda rota do mundo valida
a associacao ativa e executa sobre o servico e a persistencia isolados da mesa, sem aceitar o escopo
informado pelo navegador como fonte de autoridade.

As permissoes da versao 2 sao calculadas pelo cargo. O proprietario tem acesso integral; Mestres
administram as atividades da campanha e membros comuns; Players participam e assistem; espectadores
apenas acompanham atividades e a lista de membros. Excecoes individuais permanecem reservadas para
uma etapa futura e ainda nao alteram esses padroes.

Na primeira inicializacao apos a migracao 003, a campanha da versao 1 recebe uma mesa deterministica.
Cada personagem legado recebe `account_id` e `table_id`, reutiliza sua credencial scrypt em uma conta
global e entra nessa mesa como Player. Batalhas, concursos, torneios, lojas, NPCs, documentos, combos,
itens personalizados e configuracoes antigas recebem o mesmo `table_id`. O processo e transacional e
idempotente. As contas demonstrativas `teste` e `teste2` nao sao mais criadas automaticamente; o seed
so e executado quando `rpgseedtestaccount: true` for definido explicitamente.

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
