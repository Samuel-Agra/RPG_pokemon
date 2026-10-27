'use strict';

const assert = require('assert').strict;
const { mapTravelPlanSpeed, mapTravelSuggestedHours } =
	require('../../dist/server/rpg-showdown/campaign-map-travel');

describe('RPG campaign map travel', () => {
	const participants = ['ana', 'bia', 'caio'].map(id => ({ id, name: id }));
	const resources = [
		{ id: 'moto-a', ownerCharacterId: 'ana', name: 'Moto A', kind: 'vehicle', vehicleId: 'motocicleta',
			seats: 2, environments: ['land'] },
		{ id: 'moto-b', ownerCharacterId: 'bia', name: 'Moto B', kind: 'vehicle', vehicleId: 'motocicleta',
			seats: 2, environments: ['land'] },
		{ id: 'lapras', ownerCharacterId: 'caio', name: 'Lapras', kind: 'pokemon', seats: 1,
			environments: ['land', 'water'] },
	];
	const base = { environment: 'land', terrain: 'road', weather: 'normal', pace: 'normal' };
	it('combines seats from two motorcycles and follows the slowest traveler', () => {
		const assignments = [
			{ characterId: 'ana', kind: 'vehicle', resourceId: 'moto-a' },
			{ characterId: 'bia', kind: 'vehicle', resourceId: 'moto-a' },
			{ characterId: 'caio', kind: 'vehicle', resourceId: 'moto-b' },
		];
		assert.equal(mapTravelPlanSpeed({ ...base, assignments }, participants, resources), 60);
		assert.equal(mapTravelPlanSpeed({ ...base, pace: 'fast', assignments }, participants, resources), 75);
		assert.equal(mapTravelPlanSpeed({ ...base, assignments: [...assignments.slice(0, 2),
			{ characterId: 'caio', kind: 'foot' }] }, participants, resources), 4);
		assert.equal(mapTravelPlanSpeed({ ...base, assignments: [...assignments.slice(0, 2),
			{ characterId: 'caio', kind: 'foot' }] },
		participants.map(person => person.id === 'caio' ? { ...person, footSpeed: 8 / 3 } : person), resources), 8 / 3);
		const motorcycleAndWalkers = [
			{ characterId: 'ana', kind: 'vehicle', resourceId: 'moto-a' },
			{ characterId: 'bia', kind: 'foot' },
			{ characterId: 'caio', kind: 'foot' },
		];
		const slowMotorcyclist = participants.map(person => person.id === 'ana' ?
			{ ...person, footSpeed: 8 / 3 } : person);
		assert.equal(mapTravelPlanSpeed({ ...base, assignments: motorcycleAndWalkers },
			slowMotorcyclist, resources), 8 / 3);
		assert.equal(mapTravelPlanSpeed({ ...base, assignments }, slowMotorcyclist, resources), 60);
		assert.equal(mapTravelSuggestedHours([{ x: 0, y: 0 }, { x: 3, y: 0 }], 4), 1.5);
	});
	it('requires a seat for every member across water and rejects oversubscribed vehicles', () => {
		assert.throws(() => mapTravelPlanSpeed({ ...base, environment: 'water', assignments: [
			{ characterId: 'ana', kind: 'foot' }, { characterId: 'bia', kind: 'foot' },
			{ characterId: 'caio', kind: 'pokemon', resourceId: 'lapras' },
		] }, participants, resources), /A pé/);
		assert.throws(() => mapTravelPlanSpeed({ ...base, assignments: participants.map(person =>
			({ characterId: person.id, kind: 'vehicle', resourceId: 'moto-a' })) }, participants, resources), /Vagas/);
	});
	it('applies terrain and separate weather to speed', () => {
		const assignments = participants.map(person => ({ characterId: person.id, kind: 'foot' }));
		assert.equal(mapTravelPlanSpeed({ ...base, terrain: 'difficult', weather: 'adverse',
			assignments }, participants, resources), 1.5);
		assert.equal(mapTravelPlanSpeed({ ...base, terrain: 'difficult', weather: 'adverse',
			independentWeatherHazard: false, assignments }, participants, resources), 2);
	});
	it('requires a distinct Pokémon to pull a cart', () => {
		const cart = { id: 'cart', ownerCharacterId: 'ana', name: 'Carroça', kind: 'vehicle',
			vehicleId: 'carroca-viagem', seats: 2, environments: ['land'] };
		const assignments = [
			{ characterId: 'ana', kind: 'vehicle', resourceId: 'cart' },
			{ characterId: 'bia', kind: 'vehicle', resourceId: 'cart' },
			{ characterId: 'caio', kind: 'foot' },
		];
		assert.throws(() => mapTravelPlanSpeed({ ...base, assignments }, participants,
			[...resources, cart]), /Pokémon apto/);
		assert.equal(mapTravelPlanSpeed({ ...base, assignments, mountsApproved: true,
			traction: { cart: 'lapras' } }, participants, [...resources, cart]), 4);
		assert.throws(() => mapTravelPlanSpeed({ ...base, assignments,
			traction: { cart: 'lapras' } }, participants, [...resources, cart]), /Confirme/);
	});
	it('keeps hard terrain limits while leaving difficult passages to the Master', () => {
		const vehicles = [
			{ id: 'car', vehicleId: 'carro' },
			{ id: 'jeep', vehicleId: 'jipe' },
			{ id: 'light-cart', vehicleId: 'carroca-leve' },
			{ id: 'travel-cart', vehicleId: 'carroca-viagem' },
		].map(entry => ({ ...entry, ownerCharacterId: 'ana', name: entry.id,
			kind: 'vehicle', seats: 3, environments: ['land'] }));
		const allIn = id => participants.map(person =>
			({ characterId: person.id, kind: 'vehicle', resourceId: id }));
		assert.equal(mapTravelPlanSpeed({ ...base, terrain: 'uneven', assignments: allIn('car') },
			participants, vehicles), 75 * 0.75);
		for (const id of ['car', 'travel-cart']) {
			assert.throws(() => mapTravelPlanSpeed({ ...base, terrain: 'difficult',
				assignments: allIn(id) }, participants, vehicles), /não atravessa/);
		}
		assert.equal(mapTravelPlanSpeed({ ...base, terrain: 'difficult',
			assignments: allIn('jeep') }, participants, vehicles), 30);
		assert.equal(mapTravelPlanSpeed({ ...base, terrain: 'difficult',
			assignments: allIn('light-cart'), traction: { 'light-cart': 'lapras' },
			mountsApproved: true },
		participants, [...vehicles, resources[2]]), 2.5);
		assert.equal(mapTravelPlanSpeed({ ...base, terrain: 'difficult',
			assignments: allIn('moto-a') }, participants,
		[{ ...resources[0], seats: 3 }]), 30);
		assert.throws(() => mapTravelPlanSpeed({ ...base, terrain: 'very-difficult',
			assignments: allIn('jeep') }, participants, vehicles), /não atravessa/);
		assert.throws(() => mapTravelPlanSpeed({ ...base, terrain: 'off-road',
			assignments: allIn('car') }, participants, vehicles), /não atravessa/);
		assert.equal(mapTravelPlanSpeed({ ...base, terrain: 'off-road',
			assignments: allIn('jeep') }, participants, vehicles), 30);
	});
	it('activates travel talents only for an eligible leader and applies innate explorer benefits', () => {
		const walking = participants.map(person => ({ characterId: person.id, kind: 'foot' }));
		const explorer = participants.map(person => person.id === 'ana' ? { ...person, classId: 'explorador',
			talents: ['explorador:marcha-calculada', 'explorador:rota-de-retorno',
				'explorador:senhor-das-rotas'] } : person);
		assert.equal(mapTravelPlanSpeed({ ...base, terrain: 'difficult', leaderId: 'ana',
			assignments: walking }, explorer, resources), 4 / 0.75);
		assert.throws(() => mapTravelPlanSpeed({ ...base, leaderId: 'ana',
			activeTalents: ['explorador:marcha-calculada'], assignments: walking }, explorer, resources, 30),
		/substitui/);
		const regular = explorer.map(person => person.id === 'ana' ? { ...person,
			talents: ['explorador:marcha-calculada', 'explorador:rota-de-retorno'] } : person);
		assert.equal(mapTravelPlanSpeed({ ...base, leaderId: 'ana',
			activeTalents: ['explorador:marcha-calculada'], assignments: walking }, regular, resources, 30), 4.8);
		assert.throws(() => mapTravelPlanSpeed({ ...base, leaderId: 'ana',
			activeTalents: ['explorador:marcha-calculada'], assignments: walking }, regular, resources, 6),
		/quatro horas/);
		assert.equal(mapTravelPlanSpeed({ ...base, leaderId: 'ana',
			activeTalents: ['explorador:rota-de-retorno'], assignments: walking }, regular, resources), 5);
	});
	it('limits the Athlete travel pace to eligible walkers', () => {
		const group = participants.map(person => person.id === 'ana' ? { ...person, classId: 'atleta',
			proficiency: 2, encumbrance: 'normal', talents: ['atleta:ritmo-de-viagem'] } :
			{ ...person, encumbrance: 'normal' });
		const walking = participants.map(person => ({ characterId: person.id, kind: 'foot' }));
		assert.equal(mapTravelPlanSpeed({ ...base, leaderId: 'ana',
			activeTalents: ['atleta:ritmo-de-viagem'], assignments: walking }, group, resources), 5);
		assert.equal(mapTravelPlanSpeed({ ...base, leaderId: 'ana', assignments: walking }, group, resources), 4);
		assert.throws(() => mapTravelPlanSpeed({ ...base, leaderId: 'ana',
			activeTalents: ['explorador:marcha-calculada'], assignments: walking }, group, resources, 30),
		/indisponível/);
	});
	it('requires navigation success and a mount for situational guide talents', () => {
		const group = participants.map(person => person.id === 'ana' ? { ...person,
			talents: ['abridor-de-caminhos', 'explorador:guia-de-montaria'] } : person);
		const walking = participants.map(person => ({ characterId: person.id, kind: 'foot' }));
		assert.equal(mapTravelPlanSpeed({ ...base, terrain: 'difficult', leaderId: 'ana',
			activeTalents: ['abridor-de-caminhos'], assignments: walking }, group, resources), 3);
		assert.throws(() => mapTravelPlanSpeed({ ...base, leaderId: 'ana',
			activeTalents: ['explorador:guia-de-montaria'], assignments: walking }, group, resources),
		/exige Pokémon/);
	});
});
