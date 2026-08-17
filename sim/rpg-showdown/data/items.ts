import type { RPGItemDefinition, RPGItemPrice } from "../systems/inventory/item-registry";
import { RPG_GEN9_TECHNICAL_MACHINES } from "./tms";
export { RPG_GEN9_TM_CATALOG } from "./tms";

const pokeballs: RPGItemDefinition[] = [
	['beastball', 'Beast Ball'], ['cherishball', 'Cherish Ball'], ['diveball', 'Dive Ball'],
	['dreamball', 'Dream Ball'], ['duskball', 'Dusk Ball'], ['fastball', 'Fast Ball'],
	['friendball', 'Friend Ball'], ['greatball', 'Great Ball'], ['healball', 'Heal Ball'],
	['heavyball', 'Heavy Ball'], ['levelball', 'Level Ball'], ['loveball', 'Love Ball'],
	['lureball', 'Lure Ball'], ['luxuryball', 'Luxury Ball'], ['masterball', 'Master Ball'],
	['moonball', 'Moon Ball'], ['nestball', 'Nest Ball'], ['netball', 'Net Ball'],
	['parkball', 'Park Ball'], ['pokeball', 'Poke Ball'], ['premierball', 'Premier Ball'],
	['quickball', 'Quick Ball'], ['repeatball', 'Repeat Ball'], ['safariball', 'Safari Ball'],
	['sportball', 'Sport Ball'], ['strangeball', 'Strange Ball'], ['timerball', 'Timer Ball'],
	['ultraball', 'Ultra Ball'],
].map(([id, name]) => ({
	id,
	name,
	category: 'ball',
	stackLimit: 99,
	usableInBattle: !['parkball', 'strangeball'].includes(id),
	consumedOnUse: true,
	source: 'showdown',
	effect: { type: 'capture' },
}));

const recoveryItems: RPGItemDefinition[] = [
	{
		id: 'potion', name: 'Potion', category: 'healing', stackLimit: 99,
		usableInBattle: true, consumedOnUse: true, source: 'rpg',
		effect: { type: 'heal-hp', amount: 20 },
	},
	{
		id: 'superpotion', name: 'Super Potion', category: 'healing', stackLimit: 99,
		usableInBattle: true, consumedOnUse: true, source: 'rpg',
		effect: { type: 'heal-hp', amount: 60 },
	},
	{
		id: 'hyperpotion', name: 'Hyper Potion', category: 'healing', stackLimit: 99,
		usableInBattle: true, consumedOnUse: true, source: 'rpg',
		effect: { type: 'heal-hp', amount: 120 },
	},
	{
		id: 'maxpotion', name: 'Max Potion', category: 'healing', stackLimit: 99,
		usableInBattle: true, consumedOnUse: true, source: 'rpg',
		effect: { type: 'heal-hp', full: true },
	},

	{
		id: 'fullrestore', name: 'Full Restore', category: 'healing', stackLimit: 99,
		usableInBattle: true, consumedOnUse: true, source: 'rpg',
		effect: { type: 'heal-hp', full: true, cureStatus: true },
	},
	{
		id: 'antidote', name: 'Antidote', category: 'status', stackLimit: 99,
		usableInBattle: true, consumedOnUse: true, source: 'rpg',
		effect: { type: 'cure-status', statuses: ['psn', 'tox'] },
	},
	{
		id: 'burnheal', name: 'Burn Heal', category: 'status', stackLimit: 99,
		usableInBattle: true, consumedOnUse: true, source: 'rpg',
		effect: { type: 'cure-status', statuses: ['brn'] },
	},
	{
		id: 'iceheal', name: 'Ice Heal', category: 'status', stackLimit: 99,
		usableInBattle: true, consumedOnUse: true, source: 'rpg',
		effect: { type: 'cure-status', statuses: ['frz'] },
	},
	{
		id: 'awakening', name: 'Awakening', category: 'status', stackLimit: 99,
		usableInBattle: true, consumedOnUse: true, source: 'rpg',
		effect: { type: 'cure-status', statuses: ['slp'] },
	},
	{
		id: 'paralyzeheal', name: 'Paralyze Heal', category: 'status', stackLimit: 99,
		usableInBattle: true, consumedOnUse: true, source: 'rpg',
		effect: { type: 'cure-status', statuses: ['par'] },
	},
	{
		id: 'fullheal', name: 'Full Heal', category: 'status', stackLimit: 99,
		usableInBattle: true, consumedOnUse: true, source: 'rpg',
		effect: { type: 'cure-status' },
	},
	{
		id: 'ether', name: 'Ether', category: 'pp', stackLimit: 99,
		usableInBattle: true, consumedOnUse: true, source: 'rpg',
		effect: { type: 'restore-pp', amount: 10 },
	},
	{
		id: 'maxether', name: 'Max Ether', category: 'pp', stackLimit: 99,
		usableInBattle: true, consumedOnUse: true, source: 'rpg',
		effect: { type: 'restore-pp', full: true },
	},
	{
		id: 'elixir', name: 'Elixir', category: 'pp', stackLimit: 99,
		usableInBattle: true, consumedOnUse: true, source: 'rpg',
		effect: { type: 'restore-pp', amount: 10, allMoves: true },
	},
	{
		id: 'maxelixir', name: 'Max Elixir', category: 'pp', stackLimit: 99,
		usableInBattle: true, consumedOnUse: true, source: 'rpg',
		effect: { type: 'restore-pp', full: true, allMoves: true },
	},

	{
		id: 'revive', name: 'Revive', category: 'revive', stackLimit: 99,
		usableInBattle: false, consumedOnUse: true, source: 'rpg',
		effect: { type: 'revive', hpFraction: 0.5 },
	},
	{
		id: 'maxrevive', name: 'Max Revive', category: 'revive', stackLimit: 99,
		usableInBattle: false, consumedOnUse: true, source: 'rpg',
		effect: { type: 'revive', hpFraction: 1 },
	},
	{
		id: 'revivalherb', name: 'Revival Herb', category: 'revive', stackLimit: 99,
		usableInBattle: false, consumedOnUse: true, source: 'rpg',
		effect: { type: 'revive', hpFraction: 1, friendshipChange: -15 },
	},
	{
		id: 'sacredash', name: 'Sacred Ash', category: 'revive', stackLimit: 99,
		usableInBattle: false, consumedOnUse: true, source: 'rpg',
		effect: { type: 'revive-party', hpFraction: 1 },
	},
];

const ivVitaminItems: RPGItemDefinition[] = [
	['hpup', 'HP Up', 'hp'],
	['protein', 'Protein', 'atk'],
	['iron', 'Iron', 'def'],
	['calcium', 'Calcium', 'spa'],
	['zinc', 'Zinc', 'spd'],
	['carbos', 'Carbos', 'spe'],
].map(([id, name, stat]) => ({
	id, name, category: 'healing', stackLimit: 99,
	usableInBattle: false, consumedOnUse: true, source: 'showdown',
	effect: { type: 'raise-iv', stat, amount: 2 }, tags: ['vitamin', 'iv'],
}));

const evolutionItems: RPGItemDefinition[] = [
	['thunderstone', 'Thunder Stone'], ['firestone', 'Fire Stone'],
	['waterstone', 'Water Stone'], ['leafstone', 'Leaf Stone'],
	['moonstone', 'Moon Stone'], ['sunstone', 'Sun Stone'],
	['shinystone', 'Shiny Stone'], ['duskstone', 'Dusk Stone'],
	['dawnstone', 'Dawn Stone'], ['icestone', 'Ice Stone'],
	['auspiciousarmor', 'Auspicious Armor'], ['maliciousarmor', 'Malicious Armor'],
	['galaricacuff', 'Galarica Cuff'], ['galaricawreath', 'Galarica Wreath'],
	['tartapple', 'Tart Apple'], ['sweetapple', 'Sweet Apple'],
	['syrupyapple', 'Syrupy Apple'], ['crackedpot', 'Cracked Pot'],
	['chippedpot', 'Chipped Pot'], ['unremarkableteacup', 'Unremarkable Teacup'],
	['masterpieceteacup', 'Masterpiece Teacup'], ['metalalloy', 'Metal Alloy'],
	['blackaugurite', 'Black Augurite'],
].map(([id, name]) => ({
	id, name, category: 'evolution', stackLimit: 99,
	usableInBattle: false, consumedOnUse: true, source: 'showdown',
	effect: { type: 'evolve' },
}));
const heldItemId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '');
const generalHeldItemNames = `
Ability Shield
Absorb Bulb
Adamant Crystal
Adamant Orb
Adrenaline Orb
Air Balloon
Assault Vest
Big Root
Binding Band
Black Belt
Black Glasses
Black Sludge
Blunder Policy
Booster Energy
Bright Powder
Cell Battery
Charcoal
Choice Band
Choice Scarf
Choice Specs
Clear Amulet
Cornerstone Mask
Covert Cloak
Damp Rock
Draco Plate
Dragon Fang
Dread Plate
Earth Plate
Eject Button
Eject Pack
Electric Seed
Eviolite
Expert Belt
Fairy Feather
Fist Plate
Flame Orb
Flame Plate
Float Stone
Focus Band
Focus Sash
Grassy Seed
Grip Claw
Griseous Core
Griseous Orb
Hard Stone
Hearthflame Mask
Heat Rock
Heavy-Duty Boots
Icicle Plate
Icy Rock
Insect Plate
Iron Ball
Iron Plate
King's Rock
Lagging Tail
Leftovers
Life Orb
Light Ball
Light Clay
Loaded Dice
Luminous Moss
Lustrous Globe
Lustrous Orb
Magnet
Meadow Plate
Mental Herb
Metal Coat
Metronome
Mind Plate
Miracle Seed
Mirror Herb
Misty Seed
Muscle Band
Mystic Water
Never-Melt Ice
Pixie Plate
Poison Barb
Power Herb
Protective Pads
Psychic Seed
Punching Glove
Quick Claw
Razor Claw
Razor Fang
Red Card
Ring Target
Rocky Helmet
Room Service
Rusted Shield
Rusted Sword
Safety Goggles
Scope Lens
Sharp Beak
Shed Shell
Shell Bell
Silk Scarf
Silver Powder
Sky Plate
Smooth Rock
Snowball
Soft Sand
Soul Dew
Spell Tag
Splash Plate
Spooky Plate
Sticky Barb
Stone Plate
Terrain Extender
Throat Spray
Toxic Orb
Toxic Plate
Twisted Spoon
Utility Umbrella
Weakness Policy
Wellspring Mask
White Herb
Wide Lens
Wise Glasses
Zap Plate
Zoom Lens
`.trim().split('\n');

const currentBerryNames = `
Aguav Berry
Aspear Berry
Cheri Berry
Chesto Berry
Figy Berry
Iapapa Berry
Leppa Berry
Lum Berry
Mago Berry
Oran Berry
Pecha Berry
Persim Berry
Rawst Berry
Sitrus Berry
Wiki Berry
Babiri Berry
Charti Berry
Chilan Berry
Chople Berry
Coba Berry
Colbur Berry
Haban Berry
Kasib Berry
Kebia Berry
Occa Berry
Passho Berry
Payapa Berry
Rindo Berry
Roseli Berry
Shuca Berry
Tanga Berry
Wacan Berry
Yache Berry
Apicot Berry
Custap Berry
Ganlon Berry
Kee Berry
Lansat Berry
Liechi Berry
Maranga Berry
Micle Berry
Petaya Berry
Salac Berry
Starf Berry
Enigma Berry
Jaboca Berry
Rowap Berry
`.trim().split('\n');

const megaStoneNames = `
Abomasite
Absolite
Aerodactylite
Aggronite
Alakazite
Altarianite
Ampharosite
Audinite
Banettite
Beedrillite
Blastoisinite
Blazikenite
Cameruptite
Charizardite X
Charizardite Y
Diancite
Galladite
Garchompite
Gardevoirite
Gengarite
Glalitite
Gyaradosite
Heracronite
Houndoominite
Kangaskhanite
Latiasite
Latiosite
Lopunnite
Lucarionite
Manectite
Mawilite
Medichamite
Metagrossite
Mewtwonite X
Mewtwonite Y
Pidgeotite
Pinsirite
Sablenite
Salamencite
Sceptilite
Scizorite
Sharpedonite
Slowbronite
Steelixite
Swampertite
Tyranitarite
Venusaurite
`.trim().split('\n');
const legacyHeldItemNames = `
Berry Juice
Blue Orb
Deep Sea Scale
Deep Sea Tooth
Full Incense
Lax Incense
Leek
Lucky Punch
Mail
Metal Powder
Odd Incense
Quick Powder
Red Orb
Rock Incense
Rose Incense
Sea Incense
Stick
Thick Club
Wave Incense
Berserk Gene
Pink Bow
Polkadot Bow
`.trim().split('\n');
const heldItems: RPGItemDefinition[] = [
	...generalHeldItemNames.map(name => ({
		id: heldItemId(name), name, category: 'held' as const, stackLimit: 99,
		usableInBattle: false, consumedOnUse: false, source: 'showdown' as const,
		effect: { type: 'equip-held-item' }, tags: ['held'],
	})),
	...currentBerryNames.map(name => ({
		id: heldItemId(name), name, category: 'held' as const, stackLimit: 99,
		usableInBattle: false, consumedOnUse: false, source: 'showdown' as const,
		effect: { type: 'equip-held-item' }, tags: ['held', 'berry', 'consumable'],
	})),	...megaStoneNames.map(name => ({
		id: heldItemId(name), name, category: 'held' as const, stackLimit: 99,
		usableInBattle: false, consumedOnUse: false, source: 'showdown' as const,
		effect: { type: 'equip-held-item' }, tags: ['held', 'mega-stone', 'form-change'],
	})),	...legacyHeldItemNames.map(name => {
		const id = heldItemId(name);
		return {
			id, name, category: 'held' as const, stackLimit: 99,
			usableInBattle: false, consumedOnUse: false, source: 'showdown' as const,
			effect: { type: 'equip-held-item' },
			tags: [
				'held', 'legacy',
				...(['berryjuice', 'berserkgene'].includes(id) ? ['consumable'] : []),
				...(['blueorb', 'redorb'].includes(id) ? ['primal-orb', 'form-change'] : []),
			],
		};
	}),
	{
		id: 'normalgem', name: 'Normal Gem', category: 'held', stackLimit: 99,
		usableInBattle: false, consumedOnUse: false, source: 'showdown',
		effect: { type: 'equip-held-item' }, tags: ['held', 'gem', 'consumable'],
	},
];
const fossilItems: RPGItemDefinition[] = [
	['armorfossil', 'Armor Fossil', ['Shieldon']],
	['clawfossil', 'Claw Fossil', ['Anorith']],
	['coverfossil', 'Cover Fossil', ['Tirtouga']],
	['domefossil', 'Dome Fossil', ['Kabuto']],
	['helixfossil', 'Helix Fossil', ['Omanyte']],
	['jawfossil', 'Jaw Fossil', ['Tyrunt']],
	['oldamber', 'Old Amber', ['Aerodactyl']],
	['plumefossil', 'Plume Fossil', ['Archen']],
	['rootfossil', 'Root Fossil', ['Lileep']],
	['sailfossil', 'Sail Fossil', ['Amaura']],
	['skullfossil', 'Skull Fossil', ['Cranidos']],
	['fossilizedbird', 'Fossilized Bird', ['Arctozolt', 'Dracozolt']],
	['fossilizeddino', 'Fossilized Dino', ['Arctozolt', 'Arctovish']],
	['fossilizeddrake', 'Fossilized Drake', ['Dracozolt', 'Dracovish']],
	['fossilizedfish', 'Fossilized Fish', ['Arctovish', 'Dracovish']],
].map(([id, name, revives]) => ({
	id: id as string, name: name as string, category: 'custom', stackLimit: 99,
	usableInBattle: false, consumedOnUse: true, source: 'showdown',
	effect: { type: 'revive-fossil', revives }, tags: ['fossil'],
}));
const treasureItems: RPGItemDefinition[] = [
	['tinymushroom', 'Tiny Mushroom', 'Um pequeno cogumelo valioso, destinado à venda.'],
	['bigmushroom', 'Big Mushroom', 'Um cogumelo grande e valioso, destinado à venda.'],
	['balmmushroom', 'Balm Mushroom', 'Um cogumelo raro e muito valioso, destinado à venda.'],
	['pearl', 'Pearl', 'Uma pequena pérola destinada à venda.'],
	['bigpearl', 'Big Pearl', 'Uma grande pérola destinada à venda.'],
	['pearlstring', 'Pearl String', 'Um cordão de pérolas muito valioso, destinado à venda.'],
	['stardust', 'Stardust', 'Poeira brilhante destinada à venda.'],
	['starpiece', 'Star Piece', 'Um fragmento de gema avermelhada destinado à venda.'],
	['cometshard', 'Comet Shard', 'Um fragmento de cometa muito valioso, destinado à venda.'],
	['nugget', 'Nugget', 'Uma pepita de ouro puro destinada à venda.'],
	['bignugget', 'Big Nugget', 'Uma grande pepita de ouro puro destinada à venda.'],
	['rarebone', 'Rare Bone', 'Um osso raro de grande valor, destinado à venda.'],
	['prettyfeather', 'Pretty Feather', 'Uma pena bonita sem efeito prático, destinada à venda.'],
	['tinybambooshoot', 'Tiny Bamboo Shoot', 'Um pequeno broto de bambu destinado à venda.'],
	['bigbambooshoot', 'Big Bamboo Shoot', 'Um grande broto de bambu destinado à venda.'],
].map(([id, name, description]) => ({
	id, name, category: 'custom', stackLimit: 99,
	usableInBattle: false, consumedOnUse: false, source: 'showdown',
	effect: { type: 'treasure', description }, tags: ['treasure', 'sell-only'],
}));
const irrelevantRareItems: RPGItemDefinition[] = [
	['bottlecap', 'Bottle Cap', 'Item raro sem função mecânica neste RPG; pode ser vendido.'],
	['goldbottlecap', 'Gold Bottle Cap', 'Item muito raro sem função mecânica neste RPG; pode ser vendido.'],
	['abilitycapsule', 'Ability Capsule', 'Item raro sem função mecânica neste RPG; pode ser vendido.'],
	['abilitypatch', 'Ability Patch', 'Item muito raro sem função mecânica neste RPG; pode ser vendido.'],
].map(([id, name, description]) => ({
	id, name, category: 'custom', stackLimit: 99,
	usableInBattle: false, consumedOnUse: false, source: 'showdown',
	effect: { type: 'treasure', description }, tags: ['treasure', 'rare', 'rpg-irrelevant', 'sell-only'],
}));
const gen9Price = (buy?: number, sell?: number): RPGItemPrice => ({
	currency: 'pokedollar',
	source: 'gen9-sv',
	reference: 'gen9-sv',
	...(buy === undefined ? {} : { buy }),
	...(sell === undefined ? {} : { sell }),
});

const RPG_GEN9_HELD_ITEM_PRICES: Readonly<Record<string, RPGItemPrice>> = Object.freeze({
	abilityshield: gen9Price(20000, 5000),
	absorbbulb: gen9Price(5000, 1250),
	adrenalineorb: gen9Price(5000, 1250),
	airballoon: gen9Price(15000, 3750),
	assaultvest: gen9Price(50000, 12500),
	bigroot: gen9Price(10000, 2500),
	bindingband: gen9Price(20000, 5000),
	blackbelt: gen9Price(3000, 750),
	blackglasses: gen9Price(3000, 750),
	blacksludge: gen9Price(10000, 2500),
	blunderpolicy: gen9Price(30000, 7500),
	brightpowder: gen9Price(30000, 7500),
	cellbattery: gen9Price(5000, 1250),
	charcoal: gen9Price(3000, 750),
	choiceband: gen9Price(100000, 25000),
	choicescarf: gen9Price(100000, 25000),
	choicespecs: gen9Price(100000, 25000),
	clearamulet: gen9Price(30000, 7500),
	covertcloak: gen9Price(20000, 5000),
	damprock: gen9Price(8000, 2000),
	dragonfang: gen9Price(3000, 750),
	ejectbutton: gen9Price(30000, 7500),
	ejectpack: gen9Price(30000, 7500),
	electricseed: gen9Price(20000, 5000),
	eviolite: gen9Price(50000, 12500),
	expertbelt: gen9Price(30000, 7500),
	flameorb: gen9Price(15000, 3750),
	focusband: gen9Price(10000, 2500),
	focussash: gen9Price(50000, 12500),
	grassyseed: gen9Price(20000, 5000),
	gripclaw: gen9Price(10000, 2500),
	hardstone: gen9Price(3000, 750),
	heatrock: gen9Price(8000, 2000),
	heavydutyboots: gen9Price(20000, 5000),
	icyrock: gen9Price(8000, 2000),
	ironball: gen9Price(20000, 5000),
	kingsrock: gen9Price(10000, 2500),
	laggingtail: gen9Price(20000, 5000),
	leftovers: gen9Price(20000, 5000),
	lifeorb: gen9Price(50000, 12500),
	lightclay: gen9Price(20000, 5000),
	loadeddice: gen9Price(20000, 5000),
	luminousmoss: gen9Price(5000, 1250),
	magnet: gen9Price(3000, 750),
	mentalherb: gen9Price(10000, 2500),
	metalcoat: gen9Price(3000, 750),
	metronome: gen9Price(15000, 3750),
	miracleseed: gen9Price(3000, 750),
	mirrorherb: gen9Price(30000, 7500),
	mistyseed: gen9Price(20000, 5000),
	muscleband: gen9Price(8000, 2000),
	mysticwater: gen9Price(3000, 750),
	nevermeltice: gen9Price(3000, 750),
	normalgem: gen9Price(15000, 3750),
	poisonbarb: gen9Price(3000, 750),
	powerherb: gen9Price(30000, 7500),
	protectivepads: gen9Price(15000, 3750),
	psychicseed: gen9Price(20000, 5000),
	punchingglove: gen9Price(15000, 3750),
	quickclaw: gen9Price(8000, 2000),
	razorclaw: gen9Price(15000, 3750),
	redcard: gen9Price(30000, 7500),
	ringtarget: gen9Price(10000, 2500),
	rockyhelmet: gen9Price(50000, 12500),
	roomservice: gen9Price(20000, 5000),
	safetygoggles: gen9Price(20000, 5000),
	scopelens: gen9Price(15000, 3750),
	sharpbeak: gen9Price(3000, 750),
	shedshell: gen9Price(20000, 5000),
	shellbell: gen9Price(20000, 5000),
	silkscarf: gen9Price(3000, 750),
	silverpowder: gen9Price(3000, 750),
	smoothrock: gen9Price(8000, 2000),
	snowball: gen9Price(5000, 1250),
	softsand: gen9Price(3000, 750),
	spelltag: gen9Price(3000, 750),
	stickybarb: gen9Price(10000, 2500),
	terrainextender: gen9Price(15000, 3750),
	throatspray: gen9Price(20000, 5000),
	toxicorb: gen9Price(15000, 3750),
	twistedspoon: gen9Price(3000, 750),
	utilityumbrella: gen9Price(15000, 3750),
	weaknesspolicy: gen9Price(50000, 12500),
	whiteherb: gen9Price(20000, 5000),
	widelens: gen9Price(20000, 5000),
	wiseglasses: gen9Price(8000, 2000),
	zoomlens: gen9Price(10000, 2500),
});
/**
 * Pre?os fixos em Pok?dollars usados em Scarlet/Violet.
 * Itens sem pre?o fixo oficial n?o aparecem nesta tabela e, por padr?o, n?o s?o negoci?veis.
 */
export const RPG_GEN9_ITEM_PRICES: Readonly<Record<string, RPGItemPrice>> = Object.freeze({
	pokeball: gen9Price(200, 50),
	greatball: gen9Price(600, 150),
	ultraball: gen9Price(800, 200),
	healball: gen9Price(300, 75),
	netball: gen9Price(1000, 250),
	repeatball: gen9Price(1000, 250),
	nestball: gen9Price(1000, 250),
	diveball: gen9Price(1000, 250),
	quickball: gen9Price(1000, 250),
	duskball: gen9Price(1000, 250),
	timerball: gen9Price(1000, 250),
	luxuryball: gen9Price(3000, 750),
	potion: gen9Price(200, 50),
	superpotion: gen9Price(700, 175),
	hyperpotion: gen9Price(1500, 375),
	maxpotion: gen9Price(2500, 625),
	fullrestore: gen9Price(3000, 750),
	antidote: gen9Price(200, 50),
	burnheal: gen9Price(200, 50),
	iceheal: gen9Price(200, 50),
	awakening: gen9Price(200, 50),
	paralyzeheal: gen9Price(200, 50),
	fullheal: gen9Price(400, 100),
	hpup: gen9Price(1500, 375),
	protein: gen9Price(1500, 375),
	iron: gen9Price(1500, 375),
	calcium: gen9Price(1500, 375),
	zinc: gen9Price(1500, 375),
	carbos: gen9Price(1500, 375),
	revive: gen9Price(2000, 500),
	revivalherb: gen9Price(2800, 700),
	maxrevive: gen9Price(undefined, 1000),
	ether: gen9Price(undefined, 300),
	maxether: gen9Price(undefined, 500),
	elixir: gen9Price(undefined, 750),
	maxelixir: gen9Price(undefined, 1000),
	tinymushroom: gen9Price(undefined, 250),
	bigmushroom: gen9Price(undefined, 2500),
	balmmushroom: gen9Price(undefined, 7500),
	pearl: gen9Price(undefined, 1000),
	bigpearl: gen9Price(undefined, 4000),
	pearlstring: gen9Price(undefined, 10000),
	stardust: gen9Price(undefined, 1500),
	starpiece: gen9Price(undefined, 6000),
	cometshard: gen9Price(undefined, 12500),
	nugget: gen9Price(undefined, 5000),
	bignugget: gen9Price(undefined, 20000),
	rarebone: gen9Price(undefined, 2500),
	prettyfeather: gen9Price(undefined, 500),
	tinybambooshoot: gen9Price(undefined, 375),
	bigbambooshoot: gen9Price(undefined, 1500),
	bottlecap: gen9Price(undefined, 5000),
	goldbottlecap: gen9Price(undefined, 50000),
	abilitycapsule: gen9Price(undefined, 25000),
	abilitypatch: gen9Price(undefined, 125000),
	thunderstone: gen9Price(3000, 750),
	firestone: gen9Price(3000, 750),
	waterstone: gen9Price(3000, 750),
	leafstone: gen9Price(3000, 750),
	moonstone: gen9Price(3000, 750),
	sunstone: gen9Price(3000, 750),
	shinystone: gen9Price(3000, 750),
	duskstone: gen9Price(3000, 750),
	dawnstone: gen9Price(3000, 750),
	icestone: gen9Price(3000, 750),
	...RPG_GEN9_HELD_ITEM_PRICES,
});

const legacyPrice = (
	reference: string, buy?: number, sell?: number
): RPGItemPrice => ({
	currency: 'pokedollar',
	source: 'legacy-game',
	reference,
	...(buy === undefined ? {} : { buy }),
	...(sell === undefined ? {} : { sell }),
});

const balancedPrice = (buy: number, sell: number): RPGItemPrice => ({
	currency: 'pokedollar',
	source: 'rpg',
	reference: 'rpg-balance-v1',
	buy,
	sell,
});

const questHeldPrice = (sell: number): RPGItemPrice => ({
	currency: 'pokedollar', source: 'rpg', reference: 'rpg-quest-only-v1', sell,
});

const damageReductionBerryIds = new Set([
	'babiriberry', 'chartiberry', 'chilanberry', 'chopleberry', 'cobaberry', 'colburberry',
	'habanberry', 'kasibberry', 'kebiaberry', 'occaberry', 'passhoberry', 'payapaberry',
	'rindoberry', 'roseliberry', 'shucaberry', 'tangaberry', 'wacanberry', 'yacheberry',
]);
const rareBerryIds = new Set([
	'apicotberry', 'custapberry', 'ganlonberry', 'keeberry', 'lansatberry', 'liechiberry',
	'marangaberry', 'micleberry', 'petayaberry', 'salacberry', 'starfberry',
	'enigmaberry', 'jabocaberry', 'rowapberry',
]);
const questOnlyHeldItemIds = new Set([
	'adamantcrystal', 'adamantorb', 'cornerstonemask', 'griseouscore', 'griseousorb',
	'hearthflamemask', 'lustrousglobe', 'lustrousorb', 'rustedshield', 'rustedsword',
	'souldew', 'wellspringmask', 'blueorb', 'redorb',
	...megaStoneNames.map(heldItemId),
]);

export const RPG_HELD_ITEM_BALANCED_PRICES: Readonly<Record<string, RPGItemPrice>> = Object.freeze({
	...Object.fromEntries(generalHeldItemNames.map(name => [heldItemId(name), balancedPrice(10000, 2500)])),
	...Object.fromEntries(legacyHeldItemNames.map(name => [heldItemId(name), balancedPrice(10000, 2500)])),
	...Object.fromEntries(currentBerryNames.map(name => {
		const id = heldItemId(name);
		return [id, rareBerryIds.has(id) ? balancedPrice(5000, 1250) :
			damageReductionBerryIds.has(id) ? balancedPrice(1000, 250) : balancedPrice(500, 125)];
	})),
	boosterenergy: balancedPrice(50000, 12500),
	berryjuice: balancedPrice(1000, 250),
	mail: balancedPrice(500, 125),
	berserkgene: balancedPrice(20000, 5000),
	pinkbow: balancedPrice(3000, 750),
	polkadotbow: balancedPrice(3000, 750),
	...Object.fromEntries([...questOnlyHeldItemIds].map(id => [id, questHeldPrice(25000)])),
});
/** Valores fixos usados por jogos anteriores quando Scarlet/Violet n?o oferece pre?o equivalente. */
export const RPG_LEGACY_ITEM_PRICES: Readonly<Record<string, RPGItemPrice>> = Object.freeze({
	armorfossil: legacyPrice('gen8-bdsp', undefined, 500),
	clawfossil: legacyPrice('gen8-bdsp', undefined, 500),
	coverfossil: legacyPrice('gen7-usum', undefined, 3500),
	domefossil: legacyPrice('gen8-bdsp', undefined, 500),
	helixfossil: legacyPrice('gen8-bdsp', undefined, 500),
	jawfossil: legacyPrice('gen9-za', undefined, 5000),
	oldamber: legacyPrice('gen9-za', undefined, 7500),
	plumefossil: legacyPrice('gen7-usum', undefined, 3500),
	rootfossil: legacyPrice('gen8-bdsp', undefined, 500),
	sailfossil: legacyPrice('gen9-za', undefined, 5000),
	skullfossil: legacyPrice('gen8-bdsp', undefined, 500),
	fossilizedbird: legacyPrice('gen8-swsh', undefined, 2500),
	fossilizeddino: legacyPrice('gen8-swsh', undefined, 2500),
	fossilizeddrake: legacyPrice('gen8-swsh', undefined, 2500),
	fossilizedfish: legacyPrice('gen8-swsh', undefined, 2500),
	beastball: legacyPrice('gen7-usum', 1000),
	premierball: legacyPrice('gen6-xy', 200, 100),
	fastball: legacyPrice('gen6-oras', undefined, 150),
	friendball: legacyPrice('gen6-oras', undefined, 150),
	heavyball: legacyPrice('gen6-oras', undefined, 150),
	levelball: legacyPrice('gen6-oras', undefined, 150),
	loveball: legacyPrice('gen6-oras', undefined, 150),
	lureball: legacyPrice('gen6-oras', undefined, 150),
	moonball: legacyPrice('gen6-oras', undefined, 150),
	sportball: legacyPrice('gen8-swsh', undefined, 150),
	sacredash: legacyPrice('gen7-usum', undefined, 25000),
});

/**
 * Valores do RPG para itens ?teis sem compra fixa adequada.
 * O pre?o de venda segue 25% da compra para manter a propor??o econ?mica moderna.
 */
export const RPG_BALANCED_ITEM_PRICES: Readonly<Record<string, RPGItemPrice>> = Object.freeze({
	masterball: balancedPrice(1000000, 250000),
	dreamball: balancedPrice(20000, 5000),
	safariball: balancedPrice(25000, 6250),
	fastball: balancedPrice(15000, 3750),
	friendball: balancedPrice(15000, 3750),
	heavyball: balancedPrice(15000, 3750),
	levelball: balancedPrice(15000, 3750),
	loveball: balancedPrice(15000, 3750),
	lureball: balancedPrice(15000, 3750),
	moonball: balancedPrice(15000, 3750),
	sportball: balancedPrice(25000, 6250),
	maxrevive: balancedPrice(4000, 1000),
	ether: balancedPrice(1200, 300),
	maxether: balancedPrice(2000, 500),
	elixir: balancedPrice(3000, 750),
	maxelixir: balancedPrice(4000, 1000),
	sacredash: balancedPrice(100000, 25000),
});

export const RPG_DEFAULT_ITEM_PRICES: Readonly<Record<string, RPGItemPrice>> = Object.freeze({
	...RPG_LEGACY_ITEM_PRICES,
	...RPG_HELD_ITEM_BALANCED_PRICES,
	...RPG_GEN9_ITEM_PRICES,
	...RPG_BALANCED_ITEM_PRICES,
});

/** Cadastro inicial. O servidor RPG pode criar outro registro e acrescentar itens personalizados. */
export const RPG_DEFAULT_ITEMS: readonly RPGItemDefinition[] = Object.freeze([
	...pokeballs,
	...recoveryItems,
	...ivVitaminItems,
	...evolutionItems,
	...heldItems,
	...fossilItems,
	...treasureItems,
	...irrelevantRareItems,
	...RPG_GEN9_TECHNICAL_MACHINES,
].map(item => ({ ...item, price: RPG_DEFAULT_ITEM_PRICES[item.id] })));
