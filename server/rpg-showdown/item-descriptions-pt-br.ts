import { Dex } from '../../sim/dex';
import { toID } from '../../sim/dex-data';

const DIRECT: Readonly<Record<string, string>> = {
	abilityshield: 'Impede que a Ability do portador seja alterada, suprimida ou ignorada por qualquer efeito.',
	absorbbulb: 'Ao ser atingido por um golpe Water, aumenta o Sp. Atk do portador em 1 estágio e é consumido.',
	adamantcrystal: 'Quando equipado em Dialga, aumenta em 20% o poder dos golpes Steel e Dragon.',
	adamantorb: 'Quando equipado em Dialga, aumenta em 20% o poder dos golpes Steel e Dragon.',
	adrenalineorb: 'Quando o portador é afetado por Intimidate, aumenta sua Speed em 1 estágio e é consumido.',
	airballoon: 'Concede imunidade a golpes Ground até o portador ser atingido, quando o item estoura.',
	assaultvest: 'Multiplica o Sp. Def por 1,5, mas permite selecionar apenas golpes que causam dano.',
	bigroot: 'Aumenta em 30% o HP recuperado por golpes de drenagem, Aqua Ring, Ingrain, Leech Seed e Strength Sap.',
	bindingband: 'Faz golpes de aprisionamento parcial causarem 1/6 do HP máximo por turno em vez de 1/8.',
	blacksludge: 'Ao final do turno, recupera 1/16 do HP máximo se o portador for Poison; caso contrário, perde 1/8.',
	blunderpolicy: 'Quando um golpe falha por Accuracy, aumenta a Speed do portador em 2 estágios e é consumido.',
	boosterenergy: 'Ativa Protosynthesis ou Quark Drive e é consumida.',
	brightpowder: 'Multiplica por 0,9 a Accuracy dos golpes usados contra o portador.',
	cellbattery: 'Ao ser atingido por um golpe Electric, aumenta o Attack do portador em 1 estágio e é consumido.',
	choiceband: 'Multiplica o Attack por 1,5, mas restringe o portador ao primeiro golpe que executar.',
	choicescarf: 'Multiplica a Speed por 1,5, mas restringe o portador ao primeiro golpe que executar.',
	choicespecs: 'Multiplica o Sp. Atk por 1,5, mas restringe o portador ao primeiro golpe que executar.',
	clearamulet: 'Impede que outros Pokémon reduzam os estágios dos atributos do portador.',
	cornerstonemask: 'Aumenta em 20% o poder dos golpes de Ogerpon-Cornerstone e permite ativar Embody Aspect ao Terastallizar.',
	covertcloak: 'Protege o portador dos efeitos secundários dos golpes usados por outros Pokémon.',
	ejectbutton: 'Se o portador sobreviver a um golpe, troca imediatamente por um aliado escolhido e o item é consumido.',
	ejectpack: 'Quando algum estágio de atributo do portador é reduzido, troca por um aliado escolhido e o item é consumido.',
	destinyknot: 'Na procriação, faz o filhote herdar os seis IVs deste progenitor.',
	eviolite: 'Se a espécie do portador ainda puder evoluir, multiplica Defense e Sp. Def por 1,5.',
	expertbelt: 'Aumenta em 20% o dano de golpes superefetivos usados pelo portador.',
	flameorb: 'Ao final de cada turno, tenta causar Burn no portador.',
	floatstone: 'Reduz pela metade o peso do portador.',
	focusband: 'Concede 10% de chance de sobreviver com 1 HP a um golpe que causaria nocaute.',
	focussash: 'Com o HP cheio, permite sobreviver com 1 HP a um golpe que causaria nocaute e é consumido.',
	gripclaw: 'Faz os golpes de aprisionamento parcial do portador durarem sempre 7 turnos.',
	griseouscore: 'Quando equipado em Giratina, aumenta em 20% o poder dos golpes Ghost e Dragon.',
	griseousorb: 'Quando equipado em Giratina, aumenta em 20% o poder dos golpes Ghost e Dragon.',
	hearthflamemask: 'Aumenta em 20% o poder dos golpes de Ogerpon-Hearthflame e permite ativar Embody Aspect ao Terastallizar.',
	heavydutyboots: 'Ao entrar em campo, protege o portador dos entry hazards presentes no seu lado.',
	ironball: 'Mantém o portador no chão e reduz sua Speed pela metade; Pokémon Flying passam a receber dano Ground neutro.',
	kingsrock: 'Golpes sem chance própria de Flinch recebem 10% de chance de causar Flinch.',
	laggingtail: 'Faz o portador agir por último dentro da sua faixa de Priority.',
	leftovers: 'Ao final de cada turno, recupera 1/16 do HP máximo do portador.',
	lifeorb: 'Aumenta o dano dos golpes em 30%, mas remove 1/10 do HP máximo após atacar.',
	lightball: 'Quando equipado em Pikachu, dobra seu Attack e Sp. Atk.',
	lightclay: 'Faz Aurora Veil, Light Screen e Reflect criados pelo portador durarem 8 turnos em vez de 5.',
	loadeddice: 'Faz golpes que atingem de 2 a 5 vezes acertarem 4 ou 5 vezes e melhora outros golpes de múltiplos acertos.',
	luminousmoss: 'Ao ser atingido por um golpe Water, aumenta o Sp. Def do portador em 1 estágio e é consumido.',
	lustrousglobe: 'Quando equipado em Palkia, aumenta em 20% o poder dos golpes Water e Dragon.',
	lustrousorb: 'Quando equipado em Palkia, aumenta em 20% o poder dos golpes Water e Dragon.',
	mentalherb: 'Cura Attract, Disable, Encore, Heal Block, Taunt e Torment e é consumida.',
	metalcoat: 'Aumenta em 20% o poder dos golpes Steel usados pelo portador.',
	metronome: 'Aumenta gradualmente o dano de um golpe usado em turnos consecutivos, chegando ao máximo de 2 vezes após 5 turnos.',
	mirrorherb: 'Copia os aumentos de estágios de atributos de um oponente e é consumida.',
	muscleband: 'Aumenta em 10% o poder dos golpes Physical usados pelo portador.',
	powerherb: 'Permite concluir imediatamente a preparação de golpes de dois turnos, exceto Sky Drop, e é consumida.',
	powerweight: 'Na procriação, garante que o filhote herde o IV de HP deste progenitor.',
	powerbracer: 'Na procriação, garante que o filhote herde o IV de Attack deste progenitor.',
	powerbelt: 'Na procriação, garante que o filhote herde o IV de Defense deste progenitor.',
	powerlens: 'Na procriação, garante que o filhote herde o IV de Sp. Attack deste progenitor.',
	powerband: 'Na procriação, garante que o filhote herde o IV de Sp. Defense deste progenitor.',
	poweranklet: 'Na procriação, garante que o filhote herde o IV de Speed deste progenitor.',
	protectivepads: 'Protege os golpes do portador de efeitos adversos causados por contato, exceto Pickpocket.',
	punchingglove: 'Aumenta em 10% o poder de golpes de soco e faz com que eles não realizem contato.',
	quickclaw: 'A cada turno, concede 20% de chance de agir primeiro dentro da sua faixa de Priority.',
	razorclaw: 'Aumenta em 1 estágio a taxa de Critical Hit do portador.',
	razorfang: 'Golpes sem chance própria de Flinch recebem 10% de chance de causar Flinch.',
	redcard: 'Se o portador sobreviver a um golpe, força o atacante a trocar por um aliado aleatório e é consumido.',
	ringtarget: 'Remove as imunidades do portador que sejam concedidas exclusivamente por sua tipagem.',
	rockyhelmet: 'Quando o portador é atingido por um golpe de contato, o atacante perde 1/6 do HP máximo.',
	roomservice: 'Quando Trick Room está ativo, reduz a Speed do portador em 1 estágio e é consumido.',
	rustedshield: 'Quando equipado em Zamazenta, altera sua forma para Crowned Shield.',
	rustedsword: 'Quando equipado em Zacian, altera sua forma para Crowned Sword.',
	safetygoggles: 'Concede imunidade a golpes de pó e a danos de Sandstorm ou Hail.',
	scopelens: 'Aumenta em 1 estágio a taxa de Critical Hit do portador.',
	shedshell: 'Impede que efeitos bloqueiem a escolha de trocar o portador.',
	shellbell: 'Após atacar, recupera HP igual a 1/8 do dano causado aos outros Pokémon.',
	snowball: 'Ao ser atingido por um golpe Ice, aumenta o Attack do portador em 1 estágio e é consumido.',
	souldew: 'Quando equipado em Latias ou Latios, aumenta em 20% o poder dos golpes Dragon e Psychic.',
	stickybarb: 'Remove 1/8 do HP máximo do portador por turno e pode ser transferido a quem fizer contato.',
	terrainextender: 'Faz Electric, Grassy, Misty ou Psychic Terrain criado pelo portador durar 8 turnos em vez de 5.',
	throatspray: 'Após o portador usar um golpe baseado em som, aumenta seu Sp. Atk em 1 estágio e é consumido.',
	toxicorb: 'Ao final de cada turno, tenta causar Badly Poison no portador.',
	utilityumbrella: 'Faz o portador ignorar a maioria dos efeitos de chuva e sol, inclusive sobre sua Ability.',
	weaknesspolicy: 'Ao receber um golpe superefetivo, aumenta Attack e Sp. Atk em 2 estágios e é consumida.',
	wellspringmask: 'Aumenta em 20% o poder dos golpes de Ogerpon-Wellspring e permite ativar Embody Aspect ao Terastallizar.',
	whiteherb: 'Restaura para 0 todos os estágios de atributos reduzidos e é consumida.',
	widelens: 'Multiplica por 1,1 a Accuracy dos golpes usados pelo portador.',
	wiseglasses: 'Aumenta em 10% o poder dos golpes Special usados pelo portador.',
	zoomlens: 'Multiplica por 1,2 a Accuracy dos golpes se o portador agir depois do alvo.',
	berryjuice: 'Quando o HP cai para metade ou menos, recupera 20 HP e é consumido.',
	blueorb: 'Quando equipado em Kyogre, ativa sua Primal Reversion durante a batalha.',
	deepseascale: 'Quando equipado em Clamperl, dobra seu Sp. Def.',
	deepseatooth: 'Quando equipado em Clamperl, dobra seu Sp. Atk.',
	fullincense: 'Faz o portador agir por último dentro da sua faixa de Priority.',
	laxincense: 'Multiplica por 0,9 a Accuracy dos golpes usados contra o portador.',
	leek: 'Quando equipado em Farfetch’d ou Sirfetch’d, aumenta em 2 estágios sua taxa de Critical Hit.',
	luckypunch: 'Quando equipado em Chansey, aumenta em 2 estágios sua taxa de Critical Hit.',
	mail: 'Não pode ser dado ou removido de um Pokémon, exceto por Covet, Knock Off ou Thief.',
	metalpowder: 'Quando equipado em Ditto ainda não transformado, dobra sua Defense.',
	quickpowder: 'Quando equipado em Ditto ainda não transformado, dobra sua Speed.',
	redorb: 'Quando equipado em Groudon, ativa sua Primal Reversion durante a batalha.',
	stick: 'Quando equipado em Farfetch’d, aumenta em 2 estágios sua taxa de Critical Hit.',
	thickclub: 'Quando equipado em Cubone ou Marowak, dobra seu Attack.',
	berserkgene: 'Na geração 2, ao entrar em campo, aumenta o Attack em 2 estágios, causa Confusion e é consumido.',
	pinkbow: 'Na geração 2, aumenta em 10% o poder dos golpes Normal usados pelo portador.',
	polkadotbow: 'Na geração 2, aumenta em 10% o poder dos golpes Normal usados pelo portador.',
	normalgem: 'Aumenta em 30% o primeiro golpe Normal bem-sucedido do portador e é consumida.',
};

const TYPE_BOOSTS: Readonly<Record<string, string>> = {
	blackbelt: 'Fighting', blackglasses: 'Dark', charcoal: 'Fire', dragonfang: 'Dragon',
	fairyfeather: 'Fairy', hardstone: 'Rock', magnet: 'Electric', miracleseed: 'Grass',
	mysticwater: 'Water', nevermeltice: 'Ice', poisonbarb: 'Poison', sharpbeak: 'Flying',
	silkscarf: 'Normal', silverpowder: 'Bug', softsand: 'Ground', spelltag: 'Ghost',
	twistedspoon: 'Psychic', oddincense: 'Psychic', rockincense: 'Rock', roseincense: 'Grass',
	seaincense: 'Water', waveincense: 'Water',
};

const PLATES: Readonly<Record<string, string>> = {
	dracoplate: 'Dragon', dreadplate: 'Dark', earthplate: 'Ground', fistplate: 'Fighting',
	flameplate: 'Fire', icicleplate: 'Ice', insectplate: 'Bug', ironplate: 'Steel',
	meadowplate: 'Grass', mindplate: 'Psychic', pixieplate: 'Fairy', skyplate: 'Flying',
	splashplate: 'Water', spookyplate: 'Ghost', stoneplate: 'Rock', toxicplate: 'Poison',
	zapplate: 'Electric',
};

const WEATHER_ROCKS: Readonly<Record<string, string>> = {
	damprock: 'Rain Dance', heatrock: 'Sunny Day', icyrock: 'Snowscape', smoothrock: 'Sandstorm',
};

const TERRAIN_SEEDS: Readonly<Record<string, { terrain: string, stat: string }>> = {
	electricseed: { terrain: 'Electric Terrain', stat: 'Defense' },
	grassyseed: { terrain: 'Grassy Terrain', stat: 'Defense' },
	mistyseed: { terrain: 'Misty Terrain', stat: 'Sp. Def' },
	psychicseed: { terrain: 'Psychic Terrain', stat: 'Sp. Def' },
};

const STATUS_BERRIES: Readonly<Record<string, string>> = {
	aspearberry: 'Freeze', cheriberry: 'Paralysis', chestoberry: 'Sleep', pechaberry: 'Poison',
	persimberry: 'Confusion', rawstberry: 'Burn',
};

const PINCH_HEAL_BERRIES: Readonly<Record<string, string>> = {
	aguavberry: 'Sp. Def', figyberry: 'Attack', iapapaberry: 'Defense',
	magoberry: 'Speed', wikiberry: 'Sp. Atk',
};

const RESIST_BERRIES: Readonly<Record<string, string>> = {
	babiriberry: 'Steel', chartiberry: 'Rock', chilanberry: 'Normal', chopleberry: 'Fighting',
	cobaberry: 'Flying', colburberry: 'Dark', habanberry: 'Dragon', kasibberry: 'Ghost',
	kebiaberry: 'Poison', occaberry: 'Fire', passhoberry: 'Water', payapaberry: 'Psychic',
	rindoberry: 'Grass', roseliberry: 'Fairy', shucaberry: 'Ground', tangaberry: 'Bug',
	wacanberry: 'Electric', yacheberry: 'Ice',
};

const PINCH_STAT_BERRIES: Readonly<Record<string, string>> = {
	apicotberry: 'Sp. Def', ganlonberry: 'Defense', liechiberry: 'Attack',
	petayaberry: 'Sp. Atk', salacberry: 'Speed',
};

const OTHER_BERRIES: Readonly<Record<string, string>> = {
	leppaberry: 'Quando o primeiro golpe do portador chega a 0 PP, recupera 10 PP desse golpe e é consumida.',
	lumberry: 'Cura qualquer status não volátil ou Confusion do portador e é consumida.',
	oranberry: 'Quando o HP cai para metade ou menos, recupera 10 HP e é consumida.',
	sitrusberry: 'Quando o HP cai para metade ou menos, recupera 1/4 do HP máximo e é consumida.',
	custapberry: 'Com 1/4 ou menos do HP máximo, faz o portador agir primeiro na sua faixa de Priority e é consumida.',
	keeberry: 'Ao ser atingido por um golpe Physical, aumenta a Defense em 1 estágio e é consumida.',
	lansatberry: 'Com 1/4 ou menos do HP máximo, aplica o efeito de Focus Energy e é consumida.',
	marangaberry: 'Ao ser atingido por um golpe Special, aumenta o Sp. Def em 1 estágio e é consumida.',
	micleberry: 'Com 1/4 ou menos do HP máximo, multiplica por 1,2 a Accuracy do próximo golpe e é consumida.',
	starfberry: 'Com 1/4 ou menos do HP máximo, aumenta um atributo aleatório em 2 estágios, exceto Accuracy e Evasion, e é consumida.',
	enigmaberry: 'Após receber um golpe superefetivo, recupera 1/4 do HP máximo e é consumida.',
	jabocaberry: 'Ao receber um golpe Physical, remove 1/8 do HP máximo do atacante e é consumida.',
	rowapberry: 'Ao receber um golpe Special, remove 1/8 do HP máximo do atacante e é consumida.',
};

function megaName(name: string): string {
	const match = /^(.*)-Mega(?:-(X|Y))?$/.exec(name);
	return match ? `Mega ${match[1]}${match[2] ? ` ${match[2]}` : ''}` : name;
}

export function getRPGHeldItemDescriptionPTBR(itemId: string): string | null {
	const id = toID(itemId);
	if (DIRECT[id]) return DIRECT[id];
	if (TYPE_BOOSTS[id]) return `Aumenta em 20% o poder dos golpes ${TYPE_BOOSTS[id]} usados pelo portador.`;
	if (PLATES[id]) return `Aumenta em 20% o poder dos golpes ${PLATES[id]} e faz Judgment se tornar ${PLATES[id]}.`;
	if (WEATHER_ROCKS[id]) return `Faz ${WEATHER_ROCKS[id]} criado pelo portador durar 8 turnos em vez de 5.`;
	if (TERRAIN_SEEDS[id]) {
		const seed = TERRAIN_SEEDS[id];
		return `Sob ${seed.terrain}, aumenta ${seed.stat} em 1 estágio e é consumida.`;
	}
	if (STATUS_BERRIES[id]) return `Cura ${STATUS_BERRIES[id]} do portador e é consumida.`;
	if (PINCH_HEAL_BERRIES[id]) {
		return `Com 1/4 ou menos do HP máximo, recupera 1/3 do HP máximo; causa Confusion se a Nature reduzir ${PINCH_HEAL_BERRIES[id]}. É consumida.`;
	}
	if (RESIST_BERRIES[id]) {
		const qualifier = id === 'chilanberry' ? '' : 'superefetivo ';
		return `Reduz pela metade o dano de um golpe ${RESIST_BERRIES[id]} ${qualifier}e é consumida.`;
	}
	if (PINCH_STAT_BERRIES[id]) {
		return `Com 1/4 ou menos do HP máximo, aumenta ${PINCH_STAT_BERRIES[id]} em 1 estágio e é consumida.`;
	}
	if (OTHER_BERRIES[id]) return OTHER_BERRIES[id];
	const item = Dex.mod('gen9').items.get(id);
	if (item.megaStone && typeof item.megaStone === 'object') {
		const evolution = Object.entries(item.megaStone as Record<string, string>)[0];
		if (evolution) return `Permite que ${evolution[0]} Mega Evolua para ${megaName(evolution[1])} durante a batalha.`;
	}
	return null;
}
