import type { Battle } from "../../../battle";
import type { Pokemon } from "../../../pokemon";
import type { RPGCaptureResult, RPGCapturedPokemon } from "../../state";

import { PersistenceSystem } from "../persistence";
import {
	type RPGGen9BallCalculation, type RPGGen9BallContext, RPGGen9PokeballCalculator,
} from "./pokeball";
import { RPGBattleRulesSystem } from "./rules";

export type RPGCaptureBallContext = Pick<
	RPGGen9BallContext,
	'alreadyCaught' | 'isNight' | 'isCave' | 'isInWater' | 'isUltraBeast' | 'evolvesWithMoonStone'
>;

export interface RPGCaptureOptions {
	captorSide: SideID;
	catchRate?: number;
	ball?: string;
	/** Sobrescrita externa mantida para compatibilidade; sem ela, usa o calculador da gera��o 9. */
	ballModifier?: number;
	ballContext?: RPGCaptureBallContext;
	capturePower?: number;
	guaranteed?: boolean;
}

interface CaptureCalculation {
	modifiedCatchRate: number;
	shakeThreshold: number;
	probability: number;
}

interface ResolvedBall {
	ball: string;
	modifier: number;
	catchRate: number;
	guaranteed: boolean;
	source: 'generation-9' | 'external';
	calculation?: RPGGen9BallCalculation;
}

interface BallResolutionFailure {
	reason: NonNullable<RPGCaptureResult['reason']>;
	calculation?: RPGGen9BallCalculation;
}

interface StoredCapture {
	result: RPGCaptureResult;
}

export class CaptureSystem {
	private static readonly captures = new WeakMap<Battle, StoredCapture>();
	private static readonly capturedPokemon = new WeakSet<Pokemon>();

	static isAllowed(battle: Battle): boolean {
		return RPGBattleRulesSystem.canCapture(battle);
	}

	static attempt(target: Pokemon, options: RPGCaptureOptions): RPGCaptureResult {
		const battle = target.battle;
		const invalidReason = this.getInvalidReason(target, options.captorSide);
		if (invalidReason) return this.failure(target, options, invalidReason);

		const catchRate = options.catchRate ?? target.rpg.captureRate;
		if (catchRate === undefined || !Number.isFinite(catchRate)) {
			return this.failure(target, options, 'missing-catch-rate');
		}
		const resolvedBall = this.resolveBall(target, options, catchRate);
		if ('reason' in resolvedBall) {
			return this.failure(target, options, resolvedBall.reason, resolvedBall.calculation, catchRate);
		}
		const calculation = resolvedBall.guaranteed ? {
			modifiedCatchRate: 255, shakeThreshold: 65536, probability: 1,
		} : this.calculate(
			target.maxhp,
			target.hp,
			resolvedBall.catchRate,
			resolvedBall.modifier,
			this.getStatusModifier(target.status),
			options.capturePower ?? 1
		);

		let shakes = 0;
		if (calculation.probability >= 1) {
			shakes = 4;
		} else {
			while (shakes < 4 && battle.random(65536) < calculation.shakeThreshold) shakes++;
		}
		const success = shakes === 4;
		const result: RPGCaptureResult = {
			allowed: true,
			success,
			continued: !success,
			ball: resolvedBall.ball,
			catchRate: battle.clampIntRange(catchRate, 0, 255),
			adjustedCatchRate: resolvedBall.catchRate,
			ballModifier: resolvedBall.modifier,
			ballModifierSource: resolvedBall.source,
			ballCalculation: resolvedBall.calculation ? structuredClone(resolvedBall.calculation) : undefined,
			statusModifier: this.getStatusModifier(target.status),
			modifiedCatchRate: calculation.modifiedCatchRate,
			shakeThreshold: calculation.shakeThreshold,
			shakes,
			probability: calculation.probability,
			target: { side: target.side.id, position: target.position },
		};
		if (!success) return result;

		PersistenceSystem.save(target);
		result.pokemon = this.getCapturedPokemon(target);
		result.pokemon.rpg.captureBall = resolvedBall.ball;
		const remainingOpponents = target.side.pokemon.some(pokemon =>
			pokemon !== target && pokemon.hp > 0 && !pokemon.fainted && !pokemon.faintQueued
		);
		result.continued = remainingOpponents;
		this.captures.set(battle, { result: structuredClone(result) });
		if (remainingOpponents) {
			this.capturedPokemon.add(target);
			target.faint();
		} else {
			battle.win(options.captorSide);
		}
		return structuredClone(result);
	}

	static calculate(
		maxHP: number,
		currentHP: number,
		catchRate: number,
		ballModifier = 1,
		statusModifier = 1,
		capturePower = 1
	): CaptureCalculation {
		const maximum = Math.max(1, Math.trunc(maxHP));
		const current = Math.max(0, Math.min(maximum, Math.trunc(currentHP)));
		const rate = Math.max(0, Math.min(255, Math.trunc(catchRate)));
		const base = (3 * maximum - 2 * current) * rate / (3 * maximum);
		const modifiedCatchRate = Math.max(0, Math.floor(
			base * this.safeModifier(ballModifier) * this.safeModifier(statusModifier) *
			this.safeModifier(capturePower)
		));
		if (modifiedCatchRate >= 255) {
			return { modifiedCatchRate, shakeThreshold: 65536, probability: 1 };
		}
		if (modifiedCatchRate <= 0) {
			return { modifiedCatchRate: 0, shakeThreshold: 0, probability: 0 };
		}
		const shakeThreshold = Math.floor(65536 / (255 / modifiedCatchRate) ** (3 / 16));
		return {
			modifiedCatchRate,
			shakeThreshold,
			probability: (shakeThreshold / 65536) ** 4,
		};
	}

	static getResult(battle: Battle): RPGCaptureResult | undefined {
		const stored = this.captures.get(battle);
		return stored ? structuredClone(stored.result) : undefined;
	}

	static wasCaptured(pokemon: Pokemon): boolean {
		return this.capturedPokemon.has(pokemon);
	}

	static clear(battle: Battle): void {
		this.captures.delete(battle);
	}

	private static resolveBall(
		target: Pokemon,
		options: RPGCaptureOptions,
		catchRate: number
	): ResolvedBall | BallResolutionFailure {
		const battle = target.battle;
		const ball = options.ball || 'pokeball';
		if (options.ballModifier !== undefined) {
			return {
				ball,
				modifier: this.safeModifier(options.ballModifier),
				catchRate: battle.clampIntRange(catchRate, 0, 255),
				guaranteed: options.guaranteed === true || battle.toID(ball) === 'masterball',
				source: 'external',
			};
		}

		const captor = battle.sides.find(side => side.id === options.captorSide);
		const user = captor?.active.find(pokemon => pokemon);
		const calculation = RPGGen9PokeballCalculator.calculate(ball, {
			catchRate,
			turnNumber: Math.max(1, battle.turn),
			targetLevel: target.level,
			userLevel: user?.level,
			targetSpecies: target.species.name,
			userSpecies: user?.species.name,
			targetGender: target.gender,
			userGender: user?.gender,
			targetTypes: target.getTypes(),
			targetBaseSpeed: target.species.baseStats.spe,
			targetWeightKg: target.species.weightkg,
			targetStatus: target.status,
			targetAbility: target.getAbility().id,
			...options.ballContext,
			guaranteedCapture: options.guaranteed === true,
		});
		if (!calculation.usable) {
			return {
				reason: calculation.reason === 'not-throwable' ? 'ball-not-throwable' : 'unknown-ball',
				calculation,
			};
		}
		if (!calculation.complete) return { reason: 'missing-ball-context', calculation };
		return {
			ball: calculation.ball,
			modifier: calculation.ballModifier,
			catchRate: calculation.adjustedCatchRate ?? battle.clampIntRange(catchRate, 0, 255),
			guaranteed: calculation.guaranteed,
			source: 'generation-9',
			calculation,
		};
	}

	private static getInvalidReason(target: Pokemon, captorSide: SideID): RPGCaptureResult['reason'] | undefined {
		const state = target.battle.rpg;
		if (!state || state.battleType !== 'wild') return 'not-wild-battle';
		if (!this.isAllowed(target.battle)) return 'capture-disabled';
		if (target.side.id !== (state.wildSide || 'p2')) return 'not-wild-target';
		if (target.side.id === captorSide) return 'own-pokemon';
		if (target.fainted || target.hp <= 0) return 'target-fainted';
		if (target.battle.ended) return 'battle-ended';
		return undefined;
	}

	private static failure(
		target: Pokemon,
		options: RPGCaptureOptions,
		reason: RPGCaptureResult['reason'],
		ballCalculation?: RPGGen9BallCalculation,
		catchRate = 0
	): RPGCaptureResult {
		return {
			allowed: false, success: false, continued: !target.battle.ended, reason,
			ball: ballCalculation?.ball || options.ball || 'pokeball',
			catchRate: target.battle.clampIntRange(catchRate, 0, 255),
			adjustedCatchRate: ballCalculation?.adjustedCatchRate,
			ballModifier: ballCalculation?.ballModifier ?? this.safeModifier(options.ballModifier),
			ballModifierSource: ballCalculation ? 'generation-9' :
			options.ballModifier !== undefined ? 'external' : undefined,
			ballCalculation: ballCalculation ? structuredClone(ballCalculation) : undefined,
			statusModifier: 1,
			modifiedCatchRate: 0, shakeThreshold: 0, shakes: 0, probability: 0,
			target: { side: target.side.id, position: target.position },
		};
	}

	private static getStatusModifier(status: string): number {
		if (status === 'slp' || status === 'frz') return 2.5;
		if (status === 'par' || status === 'brn' || status === 'psn' || status === 'tox') return 1.5;
		return 1;
	}

	private static safeModifier(value: number | undefined): number {
		return value === undefined || !Number.isFinite(value) ? 1 : Math.max(0, value);
	}

	private static getCapturedPokemon(target: Pokemon): RPGCapturedPokemon {
		return {
			name: target.name,
			species: target.species.name,
			level: target.level,
			gender: target.gender,
			shiny: !!target.set.shiny,
			item: target.item,
			ability: target.getAbility().id,
			nature: target.set.nature,
			moves: target.baseMoveSlots.map(slot => slot.id),
			evs: { ...target.set.evs },
			ivs: { ...target.set.ivs },
			rpg: structuredClone(target.rpg),
		};
	}
}
