export interface RPGBattleScene {
	id: string;
	name: string;
	group: 'current' | 'classic' | 'competitive';
	imagePath: string;
	isCave: boolean;
	isInWater: boolean;
}

const current = (
	id: string, name: string, options: Partial<Pick<RPGBattleScene, 'isCave' | 'isInWater'>> = {}
): RPGBattleScene => ({
	id, name, group: 'current', imagePath: `sprites/gen6bgs/bg-${id}.jpg`,
	isCave: false, isInWater: false, ...options,
});

const classic = (
	id: string, file: string, name: string,
	options: Partial<Pick<RPGBattleScene, 'isCave' | 'isInWater'>> = {}
): RPGBattleScene => ({
	id, name, group: 'classic', imagePath: `fx/${file}`,
	isCave: false, isInWater: false, ...options,
});

const competitive = (id: string, file: string, name: string): RPGBattleScene => ({
	id, name, group: 'competitive', imagePath: `fx/${file}`, isCave: false, isInWater: false,
});

/** Official battle backdrops exposed by the Pokemon Showdown client. */
export const RPG_BATTLE_SCENES: readonly RPGBattleScene[] = [
	current('meadow', 'Prado'),
	current('aquacordetown', 'Vila Aquacorde', { isInWater: true }),
	current('beach', 'Praia'),
	current('city', 'Cidade'),
	current('dampcave', 'Caverna úmida', { isCave: true }),
	current('darkbeach', 'Praia noturna'),
	current('darkcity', 'Cidade noturna'),
	current('darkmeadow', 'Prado noturno'),
	current('deepsea', 'Mar profundo', { isInWater: true }),
	current('desert', 'Deserto'),
	current('earthycave', 'Caverna terrosa', { isCave: true }),
	current('elite4drake', 'Elite dos Quatro — Drake'),
	current('forest', 'Floresta'),
	current('icecave', 'Caverna de gelo', { isCave: true }),
	current('leaderwallace', 'Ginásio de Wallace', { isInWater: true }),
	current('library', 'Biblioteca'),
	current('orasdesert', 'Deserto de Hoenn'),
	current('orassea', 'Mar de Hoenn', { isInWater: true }),
	current('skypillar', 'Pilar Celeste'),

	classic('classic-beach', 'bg-beach.png', 'Praia clássica'),
	classic('classic-beachshore', 'bg-beachshore.png', 'Beira-mar clássica', { isInWater: true }),
	classic('classic-city', 'bg-city.png', 'Cidade clássica'),
	classic('classic-dampcave', 'bg-dampcave.png', 'Caverna úmida clássica', { isCave: true }),
	classic('classic-deepsea', 'bg-deepsea.png', 'Mar profundo clássico', { isInWater: true }),
	classic('classic-desert', 'bg-desert.png', 'Deserto clássico'),
	classic('classic-earthycave', 'bg-earthycave.png', 'Caverna terrosa clássica', { isCave: true }),
	classic('classic-forest', 'bg-forest.png', 'Floresta clássica'),
	classic('gen1', 'bg-gen1.png', 'Arena da Geração 1'),
	classic('gen2', 'bg-gen2.png', 'Arena da Geração 2'),
	classic('gen3-arena', 'bg-gen3-arena.png', 'Arena da Geração 3'),
	classic('gen3-cave', 'bg-gen3-cave.png', 'Caverna da Geração 3', { isCave: true }),
	classic('gen3-forest', 'bg-gen3-forest.png', 'Floresta da Geração 3'),
	classic('gen3-ocean', 'bg-gen3-ocean.png', 'Oceano da Geração 3', { isInWater: true }),
	classic('gen3-sand', 'bg-gen3-sand.png', 'Areia da Geração 3'),
	classic('gen3', 'bg-gen3.png', 'Campo da Geração 3'),
	classic('gen4-cave', 'bg-gen4-cave.png', 'Caverna da Geração 4', { isCave: true }),
	classic('gen4-indoors', 'bg-gen4-indoors.png', 'Interior da Geração 4'),
	classic('gen4-snow', 'bg-gen4-snow.png', 'Neve da Geração 4'),
	classic('gen4-water', 'bg-gen4-water.png', 'Água da Geração 4', { isInWater: true }),
	classic('gen4', 'bg-gen4.png', 'Campo da Geração 4'),
	classic('classic-icecave', 'bg-icecave.png', 'Caverna de gelo clássica', { isCave: true }),
	classic('classic-meadow', 'bg-meadow.png', 'Prado clássico'),
	classic('mountain', 'bg-mountain.png', 'Montanha'),
	classic('river', 'bg-river.png', 'Rio', { isInWater: true }),
	classic('route', 'bg-route.png', 'Rota'),
	classic('space', 'bg-space.jpg', 'Espaço'),
	classic('thunderplains', 'bg-thunderplains.png', 'Planícies do trovão'),
	classic('volcanocave', 'bg-volcanocave.png', 'Caverna vulcânica', { isCave: true }),

	competitive('gen1-spl', 'bg-gen1-spl.png', 'SPL — Geração 1'),
	competitive('gen2-spl', 'bg-gen2-spl.png', 'SPL — Geração 2'),
	competitive('gen3-spl', 'bg-gen3-spl.png', 'SPL — Geração 3'),
	competitive('gen4-spl', 'bg-gen4-spl.png', 'SPL — Geração 4'),
	competitive('spl', 'bg-spl.png', 'Smogon Premier League'),
	competitive('npa', 'bg-npa.png', 'National Pokémon Association'),
	competitive('scl', 'bg-scl.png', 'Smogon Champions League'),
	competitive('wcop', 'bg-wcop.png', 'World Cup of Pokémon'),
];

const SCENES_BY_ID = new Map(RPG_BATTLE_SCENES.map(scene => [scene.id, scene]));

export function getRPGBattleScene(id: string): RPGBattleScene | undefined {
	return SCENES_BY_ID.get(id);
}

export function getRPGBattleSceneCatalog(): RPGBattleScene[] {
	return RPG_BATTLE_SCENES.map(scene => ({ ...scene }));
}
