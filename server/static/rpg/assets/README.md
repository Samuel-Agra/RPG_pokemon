# Assets do RPG

## Áudio original

`audio/*.wav` contém efeitos procedurais originais gerados por `tools/generate-rpg-audio.py`.
Eles não copiam melodias, gravações, cries ou efeitos extraídos dos jogos ou do Pokémon Showdown.
Os efeitos de evento são curtos; os arquivos de clima e terreno são ambientes discretos em repetição.

Esta pasta aceita somente recursos que tenham uma origem e uma classificacao registradas.

- `hud/battle-effects.png`: arte original criada para o HUD do RPG.
- `item-icons/*.png`: sprites originais de medicamentos, vitaminas, TMs e tesouros ausentes no Showdown, criados para o RPG com auxílio de geração de imagens e sem copiar arquivos dos jogos.
- `bags/*.png`: seis sprites originais dos níveis da Bag, criados para o RPG com auxílio de geração de imagens e sem copiar modelos oficiais.
- `external-assets.json`: inventario das dependencias visuais externas e do codigo visual de terceiros.

Sprites oficiais extraidos de jogos nao devem ser adicionados aqui. Recursos externos temporarios devem passar por `asset-config.js` e `asset-provider.js`, sem download automatico, copia em cache permanente ou inclusao no build.

Antes de adicionar um novo arquivo, registre:

1. quem criou o recurso;
2. onde foi obtido;
3. qual licenca ou autorizacao permite o uso;
4. se pode ser modificado e redistribuido;
5. qual alternativa original substitui o recurso se ele precisar ser removido.
