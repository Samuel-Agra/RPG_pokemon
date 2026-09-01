# Creditos e licencas do RPG Showdown

## Projeto RPG

A interface e as integracoes proprias do RPG Showdown sao disponibilizadas sob a GNU Affero General Public License v3.0. O texto completo esta em LICENSE-AGPL-3.0.txt.

O repositorio original do servidor Pokemon Showdown continua sujeito a sua licenca MIT e aos avisos existentes no codigo-fonte. Arquivos de terceiros preservam suas licencas e cabecalhos originais.

## Pokemon Showdown

Este projeto utiliza o simulador e componentes visuais do [Pokemon Showdown](https://pokemonshowdown.com/), mantido pela Smogon e por seus colaboradores. Agradecimentos especiais a Guangcong Luo (Zarel), aos mantenedores e a todos os contribuidores do simulador e do cliente.

As coreografias oficiais importadas nesta integracao vieram de smogon/pokemon-showdown-client, revisao $commit:

- attle-animations.js: motor de animacao de batalha, cabecalho MIT;
- attle-animations-moves.js: catalogo de animacoes de golpes, cabecalho CC0-1.0.

Os arquivos sao mantidos sem remocao de autoria ou licenca em server/static/rpg/vendor/showdown/. Os efeitos graficos sao carregados do servidor publico do Pokemon Showdown e seguem os avisos de licenca documentados no proprio motor, incluindo as excecoes indicadas para icicle.png, lightning.png, one.png e imagens de rochas.

Pokemon e os nomes/personagens relacionados pertencem a Nintendo, Creatures Inc. e GAME FREAK. Este projeto nao declara afiliacao nem endosso dessas empresas ou da Smogon.

## Recursos visuais

O repositorio do RPG nao deve incluir sprites, audio, cenarios ou efeitos extraidos de jogos oficiais. A compatibilidade visual da V1 ainda referencia recursos no host publico do Pokemon Showdown por meio de um provedor configuravel. Esses arquivos nao sao incorporados ao build nem recebem a licenca AGPL do projeto.

As referencias externas sao temporarias, podem ser desativadas em server/static/rpg/asset-config.js e nao representam autorizacao, afiliacao ou transferencia de licenca. O inventario atual fica em server/static/rpg/assets/external-assets.json e as regras de inclusao em RPG-ASSET-POLICY.md.

O sprite sheet server/static/rpg/assets/hud/battle-effects.png e um recurso original criado para o HUD do RPG com auxilio de geracao de imagens. O conjunto em server/static/rpg/assets/item-icons/ contem 19 sprites originais de medicamentos e itens de recuperacao, tambem criado para o RPG com auxilio de geracao de imagens, sem incorporar arquivos oficiais. O simbolo de Mega Evolucao e carregado, quando permitido pela configuracao, de https://play.pokemonshowdown.com/sprites/misc/mega.png. O arquivo nao e incorporado ao repositorio; quando a referencia externa esta desativada ou falha, a interface usa um fallback original desenhado em CSS.

### Insignias de Liga Pokemon

O arquivo `server/static/rpg/assets/badges-kanto-unova.png` utiliza recriacoes vetoriais de insignias do projeto [pokemon-badges](https://github.com/SteGriff/pokemon-badges), de Stephen Griffiths, Copyright (c) 2011.

O material original e disponibilizado sob a [Creative Commons Attribution 3.0 Unported (CC BY 3.0)](https://creativecommons.org/licenses/by/3.0/). As imagens foram redimensionadas e reunidas em um sprite sheet para uso neste projeto. O aviso especifico tambem e preservado em `server/static/rpg/assets/badges-kanto-unova-LICENSE.txt`.

As 24 interpretacoes visuais das insignias de Kalos, Galar e Paldea foram criadas especificamente para este RPG com geracao de imagens da OpenAI/Codex. Elas seguem os temas de cada ginasio e o estilo visual adotado pelas insignias existentes, sem reutilizar artes oficiais da Nintendo, Game Freak ou The Pokemon Company.

Os desenhos e marcas relacionados a Pokemon continuam sendo propriedade de Nintendo, Creatures Inc., GAME FREAK e de seus respectivos titulares. A atribuicao ao autor das recriacoes nao implica afiliacao ou endosso dessas empresas.

## Auxilio de desenvolvimento

O desenvolvimento, a organizacao, os testes e a documentacao desta adaptacao receberam auxilio do OpenAI Codex. O Codex foi utilizado como ferramenta de assistencia; as decisoes e a direcao do RPG pertencem ao autor do projeto.

## Fontes

- https://github.com/smogon/pokemon-showdown
- https://github.com/smogon/pokemon-showdown-client
- https://github.com/SteGriff/pokemon-badges
- https://creativecommons.org/licenses/by/3.0/
- https://www.gnu.org/licenses/agpl-3.0.html
