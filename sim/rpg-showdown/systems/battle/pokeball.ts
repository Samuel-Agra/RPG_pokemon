export const RPG_GEN9_BALL_CALCULATOR_VERSION = 1;
const FIXED_POINT = 4096;
const ULTRA_BEAST_PENALTY = 410;

const SUPPORTED_BALLS = new Set([
	'beastball', 'cherishball', 'diveball', 'dreamball', 'duskball', 'fastball',
	'friendball', 'greatball', 'healball', 'heavyball', 'levelball', 'loveball',
	'lureball', 'luxuryball', 'masterball', 'moonball', 'nestball', 'netball',
	'parkball', 'pokeball', 'premierball', 'quickball', 'repeatball', 'safariball',
	'sportball', 'strangeball', 'timerball', 'ultraball',
]);

const ULTRA_BEASTS = new Set([
	'nihilego', 'buzzwole', 'pheromosa', 'xurkitree', 'celesteela', 'kartana',
	'guzzlord', 'poipole', 'naganadel', 'stakataka', 'blacephalon',
]);

const MOON_STONE_TARGETS = new Set([
	'nidorina', 'nidorino', 'clefairy', 'jigglypuff', 'skitty', 'munna',
]);

export type RPGGen9BallPostCaptureEffect = 'heal' | 'friendship-start' | 'friendship-growth';

export interface RPGGen9BallContext {
	catchRate?: number;
	turnNumber?: number;
	targetLevel?: number;
	userLevel?: number;
	targetSpecies?: string;
	userSpecies?: string;
	targetGender?: string;
	userGender?: string;
	targetTypes?: readonly string[];
	targetBaseSpeed?: number;
	targetWeightKg?: number;
	targetStatus?: string;
	targetAbility?: string;
	alreadyCaught?: boolean;
	isNight?: boolean;
	isCave?: boolean;
	isInWater?: boolean;
	isUltraBeast?: boolean;
	evolvesWithMoonStone?: boolean;
	guaranteedCapture?: boolean;
}

export interface RPGGen9BallCalculation {
	version: number;
	generation: 9;
	ball: string;
	usable: boolean;
	reason?: 'unknown-ball' | 'not-throwable';
	complete: boolean;
	missingContext: string[];
	fixedModifier: number;
	ballModifier: number;
	catchRateAdd: number;
	adjustedCatchRate?: number;
	guaranteed: boolean;
	conditions: string[];
	postCaptureEffects: RPGGen9BallPostCaptureEffect[];
}

export class RPGGen9PokeballCalculator {
	static calculate(ball: string, context: RPGGen9BallContext = {}): RPGGen9BallCalculation {
		const id = this.normalize(ball);
		if (!SUPPORTED_BALLS.has(id)) return this.unusable(id, 'unknown-ball');
		if (id === 'parkball' || id === 'strangeball') return this.unusable(id, 'not-throwable');

		let fixedModifier = FIXED_POINT;
		let catchRateAdd = 0;
		let guaranteed = context.guaranteedCapture === true;
		const missingContext: string[] = [];
		const conditions: string[] = [];
		const postCaptureEffects: RPGGen9BallPostCaptureEffect[] = [];
		const need = (name: string, value: unknown): boolean => {
			if (value !== undefined && value !== null) return true;
			missingContext.push(name);
			return false;
		};
		const targetSpecies = this.normalize(context.targetSpecies || '');
		const ultraBeast = context.isUltraBeast ?? (targetSpecies ? ULTRA_BEASTS.has(targetSpecies) : undefined);

		switch (id) {
		case 'greatball':
			fixedModifier = 6144;
			conditions.push('great-ball');
			break;
		case 'ultraball':
			fixedModifier = 8192;
			conditions.push('ultra-ball');
			break;
		case 'masterball':
			guaranteed = true;
			conditions.push('master-ball');
			break;
		case 'netball': {
			if (need('targetTypes', context.targetTypes)) {
				const types = context.targetTypes!.map(type => this.normalize(type));
				if (types.includes('water') || types.includes('bug')) {
					fixedModifier = 14336;
					conditions.push('water-or-bug');
				}
			}
			break;
		}
		case 'nestball':
			if (need('targetLevel', context.targetLevel)) {
				const level = this.level(context.targetLevel!);
				if (level < 30) {
					fixedModifier = Math.floor(((41 - level) * FIXED_POINT + 0.5) / 10);
					conditions.push('target-below-level-30');
				}
			}
			break;
		case 'diveball':
			if (need('isInWater', context.isInWater) && context.isInWater) {
				fixedModifier = 14336;
				conditions.push('target-in-water');
			}
			break;
		case 'repeatball':
			if (need('alreadyCaught', context.alreadyCaught) && context.alreadyCaught) {
				fixedModifier = 14336;
				conditions.push('species-already-caught');
			}
			break;
		case 'timerball':
			if (need('turnNumber', context.turnNumber)) {
				const turnsPassed = Math.max(0, Math.trunc(context.turnNumber!) - 1);
				fixedModifier = Math.min(16384, FIXED_POINT + 1229 * turnsPassed);
				if (turnsPassed) conditions.push('turns-passed');
			}
			break;
		case 'quickball':
			if (need('turnNumber', context.turnNumber) && Math.trunc(context.turnNumber!) === 1) {
				fixedModifier = 20480;
				conditions.push('first-turn');
			}
			break;
		case 'duskball': {
			const knownDark = context.isNight === true || context.isCave === true;
			if (!knownDark) {
				need('isNight', context.isNight);
				need('isCave', context.isCave);
			}
			if (knownDark) {
				fixedModifier = 12288;
				conditions.push(context.isCave ? 'cave' : 'night');
			}
			break;
		}
		case 'fastball':
			if (need('targetBaseSpeed', context.targetBaseSpeed) && context.targetBaseSpeed! >= 100) {
				fixedModifier = 16384;
				conditions.push('base-speed-at-least-100');
			}
			break;
		case 'levelball':
			if (need('targetLevel', context.targetLevel) && need('userLevel', context.userLevel)) {
				const targetLevel = this.level(context.targetLevel!);
				const userLevel = this.level(context.userLevel!);
				if (Math.floor(userLevel / 4) >= targetLevel) {
					fixedModifier = 32768;
					conditions.push('user-level-at-least-four-times-target');
				} else if (Math.floor(userLevel / 2) >= targetLevel) {
					fixedModifier = 16384;
					conditions.push('user-level-at-least-twice-target');
				} else if (userLevel > targetLevel) {
					fixedModifier = 8192;
					conditions.push('user-level-above-target');
				}
			}
			break;
		case 'loveball': {
			const hasContext = need('targetSpecies', context.targetSpecies) &&
				need('userSpecies', context.userSpecies) &&
				need('targetGender', context.targetGender) &&
				need('userGender', context.userGender);
			const targetGender = (context.targetGender || '').toUpperCase();
			const userGender = (context.userGender || '').toUpperCase();
			if (hasContext && targetSpecies === this.normalize(context.userSpecies!) &&
				(targetGender === 'M' || targetGender === 'F') &&
				(userGender === 'M' || userGender === 'F') && targetGender !== userGender) {
				fixedModifier = 32768;
				conditions.push('same-species-opposite-gender');
			}
			break;
		}
		case 'lureball':
			if (need('isInWater', context.isInWater) && context.isInWater) {
				fixedModifier = 16384;
				conditions.push('target-in-or-directly-above-water');
			}
			break;
		case 'moonball': {
			let evolves = context.evolvesWithMoonStone;
			if (evolves === undefined) {
				if (need('targetSpecies', context.targetSpecies)) evolves = MOON_STONE_TARGETS.has(targetSpecies);
			}
			if (evolves) {
				fixedModifier = 16384;
				conditions.push('moon-stone-evolution');
			}
			break;
		}
		case 'heavyball':
			if (need('targetWeightKg', context.targetWeightKg)) {
				const weight = Math.max(0, context.targetWeightKg!);
				catchRateAdd = weight >= 300 ? 30 : weight >= 200 ? 20 : weight >= 100 ? 0 : -20;
				conditions.push('weight-based-catch-rate');
			}
			break;
		case 'beastball':
			if (need('isUltraBeast', ultraBeast)) {
				fixedModifier = ultraBeast ? 20480 : ULTRA_BEAST_PENALTY;
				conditions.push(ultraBeast ? 'ultra-beast' : 'non-ultra-beast');
			}
			break;
		case 'dreamball': {
			const asleep = context.targetStatus === 'slp';
			const comatose = this.normalize(context.targetAbility || '') === 'comatose';
			if (!asleep && !comatose) {
				need('targetStatus', context.targetStatus);
				need('targetAbility', context.targetAbility);
			}
			if (asleep || comatose) {
				fixedModifier = 16384;
				conditions.push(asleep ? 'target-asleep' : 'target-comatose');
			}
			break;
		}
		case 'healball':
			postCaptureEffects.push('heal');
			break;
		case 'friendball':
			postCaptureEffects.push('friendship-start');
			break;
		case 'luxuryball':
			postCaptureEffects.push('friendship-growth');
			break;
		}

		if (id !== 'masterball' && id !== 'beastball') {
			if (need('isUltraBeast', ultraBeast) && ultraBeast) {
				fixedModifier = ULTRA_BEAST_PENALTY;
				conditions.push('non-beast-ball-ultra-beast-penalty');
			}
		}

		const adjustedCatchRate = this.adjustCatchRate(context.catchRate, catchRateAdd, id === 'heavyball');
		return {
			version: RPG_GEN9_BALL_CALCULATOR_VERSION,
			generation: 9,
			ball: id,
			usable: true,
			complete: !missingContext.length,
			missingContext: [...new Set(missingContext)],
			fixedModifier,
			ballModifier: fixedModifier / FIXED_POINT,
			catchRateAdd,
			adjustedCatchRate,
			guaranteed,
			conditions,
			postCaptureEffects,
		};
	}

	static listSupported(): string[] {
		return [...SUPPORTED_BALLS];
	}

	private static adjustCatchRate(
		catchRate: number | undefined,
		addition: number,
		heavyBall: boolean
	): number | undefined {
		if (catchRate === undefined || !Number.isFinite(catchRate)) return undefined;
		const base = Math.max(0, Math.min(255, Math.trunc(catchRate)));
		return heavyBall ? Math.max(1, base + addition) : base;
	}

	private static unusable(
		ball: string,
		reason: RPGGen9BallCalculation['reason']
	): RPGGen9BallCalculation {
		return {
			version: RPG_GEN9_BALL_CALCULATOR_VERSION,
			generation: 9,
			ball,
			usable: false,
			reason,
			complete: true,
			missingContext: [],
			fixedModifier: 0,
			ballModifier: 0,
			catchRateAdd: 0,
			guaranteed: false,
			conditions: [],
			postCaptureEffects: [],
		};
	}

	private static level(value: number): number {
		return Math.max(1, Math.min(999, Math.trunc(value)));
	}

	private static normalize(value: string): string {
		return (value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
	}
}
