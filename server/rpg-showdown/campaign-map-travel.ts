/** Planejamento da viagem do grupo no mapa. A velocidade é sustentada, nunca a Speed de combate. */
export type MapTravelEnvironment = 'land' | 'water' | 'air';
export type MapTravelTerrain = 'road' | 'uneven' | 'difficult' | 'very-difficult' | 'off-road';
export type MapTravelWeather = 'normal' | 'adverse' | 'storm';
export type MapTravelPace = 'careful' | 'normal' | 'fast';
export interface MapTravelAssignment { characterId: string; kind: 'foot' | 'vehicle' | 'pokemon'; resourceId?: string }
export interface MapTravelPlan {
	environment: MapTravelEnvironment; terrain: MapTravelTerrain; weather: MapTravelWeather;
	pace: MapTravelPace; assignments: MapTravelAssignment[];
	leaderId?: string;
	activeTalents?: string[];
	traction?: Record<string, string>;
	mountsApproved?: boolean;
	/** O clima só se soma ao terreno quando representar um obstáculo independente. */
	independentWeatherHazard?: boolean;
}
export interface MapTravelResource {
	id: string; ownerCharacterId: string; name: string; kind: 'vehicle' | 'pokemon';
	vehicleId?: string; seats: number; environments: MapTravelEnvironment[];
}
export interface MapTravelParticipant {
	id: string; name: string; footSpeed?: number; classId?: string; proficiency?: number;
	talents?: string[]; encumbrance?: string;
}
export const MAP_TRAVEL_OPTIONAL_TALENTS = [
	'atleta:ritmo-de-viagem', 'explorador:marcha-calculada', 'explorador:rota-de-retorno',
	'explorador:guia-de-montaria', 'abridor-de-caminhos',
] as const;
export type MapTravelOptionalTalent = typeof MAP_TRAVEL_OPTIONAL_TALENTS[number];
const terrainFactor: Record<MapTravelTerrain, number> = {
	road: 1, uneven: 0.75, difficult: 0.5, 'very-difficult': 0.25, 'off-road': 1,
};
const weatherFactor: Record<MapTravelWeather, number> = { normal: 1, adverse: 0.75, storm: 0.5 };
const paceFactor: Record<MapTravelPace, number> = { careful: 0.75, normal: 1, fast: 1.25 };
const vehicleSpeed: Record<string, { road: number, offRoad: number, limit: number }> = {
	'motocicleta': { road: 60, offRoad: 15, limit: 80 },
	'carro': { road: 75, offRoad: 7.5, limit: 100 },
	'jipe': { road: 60, offRoad: 30, limit: 80 },
	'carroca-leve': { road: 5, offRoad: 0, limit: 5 },
	'carroca-viagem': { road: 5, offRoad: 0, limit: 5 },
};
function vehicleBlockedOnTerrain(vehicleId: string, terrain: MapTravelTerrain): boolean {
	if (terrain === 'very-difficult') return true;
	if (terrain === 'difficult') return ['carro', 'carroca-viagem'].includes(vehicleId);
	if (terrain === 'off-road') return !['motocicleta', 'jipe'].includes(vehicleId);
	return false;
}

export function mapTravelPlanSpeed(plan: MapTravelPlan, participants: MapTravelParticipant[],
	resources: MapTravelResource[], distanceKm = Infinity): number {
	if (!['land', 'water', 'air'].includes(plan.environment) || !(plan.terrain in terrainFactor) ||
		!(plan.weather in weatherFactor) || !(plan.pace in paceFactor) || !Array.isArray(plan.assignments)) {
		throw new Error('Condições de viagem inválidas');
	}
	if (plan.environment !== 'land' && plan.terrain !== 'road') {
		throw new Error('Terreno terrestre não se aplica à travessia por água ou ar');
	}
	if (!participants.length || plan.assignments.length !== participants.length) {
		throw new Error('Distribua todos os membros do grupo antes de viajar');
	}
	const participantIds = new Set(participants.map(person => person.id));
	const leader = plan.leaderId ? participants.find(person => person.id === plan.leaderId) : undefined;
	if (plan.leaderId && !leader) throw new Error('Líder da viagem inválido');
	const activeTalents = plan.activeTalents || [];
	if (!Array.isArray(activeTalents) || new Set(activeTalents).size !== activeTalents.length ||
		activeTalents.some(id => !MAP_TRAVEL_OPTIONAL_TALENTS.includes(id as MapTravelOptionalTalent) ||
			!leader?.talents?.includes(id))) throw new Error('Talento de viagem indisponível para o líder');
	if (activeTalents.includes('explorador:marcha-calculada') &&
		activeTalents.includes('explorador:rota-de-retorno')) {
		throw new Error('Marcha Calculada e Rota de Retorno não se acumulam');
	}
	const hasApex = leader?.talents?.includes('explorador:senhor-das-rotas') || false;
	if (hasApex && activeTalents.some(id => ['explorador:marcha-calculada',
		'explorador:rota-de-retorno'].includes(id))) {
		throw new Error('Senhor das Rotas substitui Marcha Calculada e Rota de Retorno');
	}
	if (activeTalents.includes('atleta:ritmo-de-viagem') && leader?.encumbrance !== 'normal') {
		throw new Error('Ritmo de Viagem exige que o Atleta não esteja sobrecarregado');
	}
	if (activeTalents.includes('atleta:ritmo-de-viagem') &&
		!plan.assignments.some(entry => entry.characterId === leader?.id && entry.kind === 'foot')) {
		throw new Error('Ritmo de Viagem exige que o Atleta lidere a pé');
	}
	const assigned = new Set<string>();
	const seats = new Map<string, number>();
	const speeds: { speed: number, limit?: number, powered: boolean, mount: boolean }[] = [];
	const usedTraction = new Set<string>();
	const footTravelers = plan.assignments.filter(entry => entry.kind === 'foot')
		.map(entry => participants.find(person => person.id === entry.characterId)!).filter(Boolean);
	const athleteBeneficiaries = new Set(footTravelers.filter(person => person.encumbrance === 'normal')
		.sort((left, right) => (left.footSpeed ?? 4) - (right.footSpeed ?? 4))
		.slice(0, (leader?.proficiency || 0) + 1).map(person => person.id));
	if (leader && footTravelers.some(person => person.id === leader.id) &&
		!athleteBeneficiaries.has(leader.id) && activeTalents.includes('atleta:ritmo-de-viagem')) {
		athleteBeneficiaries.delete([...athleteBeneficiaries].at(-1)!);
		athleteBeneficiaries.add(leader.id);
	}
	const naturalDifficult = plan.environment === 'land' && plan.terrain === 'difficult';
	const leaderExplorer = leader?.classId === 'explorador';
	const terrainFor = (person: MapTravelParticipant, powered: boolean) => {
		if (plan.terrain === 'off-road') return powered ? 1 : 0.5;
		if (naturalDifficult && !powered && (hasApex || leaderExplorer ||
			person.classId === 'explorador')) return 1;
		if (naturalDifficult && !powered && activeTalents.includes('abridor-de-caminhos')) return 0.75;
		return terrainFactor[plan.terrain];
	};
	const leaderMarch = activeTalents.includes('explorador:marcha-calculada');
	const leaderGuide = activeTalents.includes('explorador:guia-de-montaria');
	const returnRoute = activeTalents.includes('explorador:rota-de-retorno');
	for (const assignment of plan.assignments) {
		if (!participantIds.has(assignment.characterId) || assigned.has(assignment.characterId)) {
			throw new Error('Distribuição do grupo inválida');
		}
		assigned.add(assignment.characterId);
		if (assignment.kind === 'foot') {
			if (plan.environment !== 'land' || assignment.resourceId) throw new Error('A pé só é possível em terra');
			const traveler = participants.find(person => person.id === assignment.characterId)!;
			const athlete = activeTalents.includes('atleta:ritmo-de-viagem') &&
				athleteBeneficiaries.has(traveler.id) ? 1.25 : 1;
			speeds.push({ speed: (traveler.footSpeed ?? 4) * terrainFor(traveler, false) * athlete,
				powered: false, mount: false });
			continue;
		}
		const resource = resources.find(entry => entry.id === assignment.resourceId && entry.kind === assignment.kind);
		if (!resource || !resource.environments.includes(plan.environment)) {
			throw new Error('Transporte indisponível para este percurso');
		}
		const occupied = (seats.get(resource.id) || 0) + 1;
		if (occupied > resource.seats) throw new Error(`Vagas insuficientes em ${resource.name}`);
		seats.set(resource.id, occupied);
		if (assignment.kind === 'pokemon') {
			const traveler = participants.find(person => person.id === assignment.characterId)!;
			speeds.push({ speed: (plan.environment === 'land' ? 6 : plan.environment === 'water' ? 5 : 12) *
				terrainFor(traveler, false), powered: false, mount: true });
		} else {
			const vehicle = vehicleSpeed[resource.vehicleId || ''];
			if (!vehicle) throw new Error('Veículo sem velocidade de viagem definida');
			if (vehicleBlockedOnTerrain(resource.vehicleId || '', plan.terrain)) {
				throw new Error(`${resource.name} não atravessa este terreno`);
			}
			if (resource.vehicleId?.startsWith('carroca')) {
				const pokemonId = plan.traction?.[resource.id];
				const puller = resources.find(entry => entry.id === pokemonId && entry.kind === 'pokemon' &&
					entry.environments.includes('land'));
				if (!puller || (occupied === 1 && usedTraction.has(pokemonId))) {
					throw new Error('Escolha um Pokémon apto para puxar cada carroça');
				}
				if (occupied === 1) usedTraction.add(pokemonId);
			}
			const traveler = participants.find(person => person.id === assignment.characterId)!;
			const powered = !resource.vehicleId?.startsWith('carroca');
			const base = plan.terrain === 'off-road' ? vehicle.offRoad * (powered ? 1 : 0.5) :
				vehicle.road * terrainFor(traveler, powered);
			speeds.push({ speed: base, limit: vehicle.limit, powered, mount: !powered });
		}
	}
	for (const pokemonId of usedTraction) {
		if (seats.has(pokemonId)) throw new Error('Um Pokémon não pode puxar carroça e servir de montaria ao mesmo tempo');
	}
	if ((usedTraction.size || plan.assignments.some(entry => entry.kind === 'pokemon')) &&
		plan.mountsApproved !== true) {
		throw new Error('Confirme que os Pokémon escolhidos são aptos para a viagem');
	}
	const climate = plan.independentWeatherHazard === false ? 1 : weatherFactor[plan.weather];
	const baseSpeed = Math.min(...speeds.map(entry => Math.min(entry.speed * climate * paceFactor[plan.pace],
		entry.limit || Infinity)));
	if (leaderMarch && distanceKm / baseSpeed < 4) {
		throw new Error('Marcha Calculada exige uma viagem de pelo menos quatro horas');
	}
	if (leaderMarch && !speeds.some(entry => !entry.powered)) {
		throw new Error('Marcha Calculada não acelera veículos automotores');
	}
	if (leaderGuide && !speeds.some(entry => entry.mount)) {
		throw new Error('Guia de Montaria exige Pokémon de montaria ou tração no grupo');
	}
	const groupSpeed = Math.min(...speeds.map(entry => {
		const leadership = entry.powered ? 1 : hasApex ? 1 / 0.75 : leaderMarch ? 1.2 : 1;
		const guide = entry.mount && leaderGuide ? 1.2 : 1;
		return Math.min(entry.speed * Math.max(leadership, guide) * climate * paceFactor[plan.pace],
			entry.limit || Infinity);
	}));
	// Uma vaga isolada não acelera a viagem do grupo: sem transporte para todos,
	// o tempo nunca fica menor do que se todos precisassem caminhar juntos.
	const mixedWithWalkers = plan.environment === 'land' && footTravelers.length > 0 &&
		plan.assignments.some(entry => entry.kind !== 'foot');
	const walkingGroupSpeed = mixedWithWalkers ? Math.min(...participants.map(person => {
		const athlete = activeTalents.includes('atleta:ritmo-de-viagem') &&
			athleteBeneficiaries.has(person.id) ? 1.25 : 1;
		const leadership = hasApex ? 1 / 0.75 : leaderMarch ? 1.2 : 1;
		return (person.footSpeed ?? 4) * terrainFor(person, false) * athlete * leadership *
			climate * paceFactor[plan.pace];
	})) : Infinity;
	const effectiveSpeed = Math.min(groupSpeed, walkingGroupSpeed);
	return returnRoute ? effectiveSpeed / 0.8 : effectiveSpeed;
}

export function mapTravelDistanceKm(route: { x: number, y: number }[]): number {
	return route.slice(1).reduce((sum, point, index) =>
		sum + Math.hypot(point.x - route[index].x, point.y - route[index].y) * 2, 0);
}

export function mapTravelSuggestedHours(route: { x: number, y: number }[], speed: number): number {
	if (!Number.isFinite(speed) || speed <= 0) throw new Error('Não há passagem para o grupo');
	return Math.max(0.25, Math.ceil(mapTravelDistanceKm(route) / speed * 4) / 4);
}
