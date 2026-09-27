/** Cenas sociais e cooperação Pokémon fora de batalha; a narrativa continua sob arbitragem do Mestre. */
import { rollRPGTrainerSkillCheck, rpgOpposedCheck } from './trainer-checks';
import type { RPGTrainerSheet } from './trainer-sheet';
import type { RPGPokemonState } from '../../sim/rpg-showdown/state';

export type RPGSocialApproach = 'persuasao' | 'enganacao' | 'intimidacao' | 'intuicao' |
	'investigacao' | 'atuacao';
export interface RPGSocialScene {
	approach: RPGSocialApproach;
	/** Nenhuma rolagem força um Player ou supera impossibilidades narrativas. */
	targetIsPlayer?: boolean; plausible: boolean; uncertain: boolean;
	dc?: number; opposedTotal?: number;
	bonus?: number;
	/** Deve ser verdadeiro apenas se a interação ainda não usou Sem Ressentimentos. */
	reformulateAfterFailure?: boolean;
}
export function resolveRPGSocialScene(sheet: RPGTrainerSheet, scene: RPGSocialScene,
	random: () => number = Math.random) {
	if (!['persuasao', 'enganacao', 'intimidacao', 'intuicao', 'investigacao', 'atuacao'].includes(scene.approach) ||
		typeof scene.plausible !== 'boolean' || typeof scene.uncertain !== 'boolean') throw new Error('Cena social inválida');
	if (scene.targetIsPlayer) return { result: 'player-choice' as const, check: null };
	if (!scene.plausible) return { result: 'impossible' as const, check: null };
	if (!scene.uncertain) return { result: 'narrated' as const, check: null };
	if ((scene.dc === undefined) === (scene.opposedTotal === undefined)) {
		throw new Error('Defina exatamente uma CD ou oposição para a cena');
	}
	const dc = scene.dc ?? scene.opposedTotal!;
	if (!Number.isSafeInteger(dc) || dc < 0 || dc > 1000) throw new Error('CD social inválida');
	const check = rollRPGTrainerSkillCheck(sheet, scene.approach, undefined,
		{ dc, bonus: scene.bonus || 0 }, random);
	let success = scene.opposedTotal === undefined ? check.success :
		rpgOpposedCheck(check.total, scene.opposedTotal) === 'first';
	let finalCheck = check;
	if (!success && scene.reformulateAfterFailure && ['persuasao', 'enganacao'].includes(scene.approach) &&
		sheet.talents.class.includes('encantador:sem-ressentimentos')) {
		finalCheck = rollRPGTrainerSkillCheck(sheet, scene.approach, undefined,
			{ dc, bonus: scene.bonus || 0 }, random);
		success = scene.opposedTotal === undefined ? finalCheck.success :
			rpgOpposedCheck(finalCheck.total, scene.opposedTotal) === 'first';
	}
	return { result: success ? 'favorable' as const : 'resisted' as const,
		check: finalCheck, firstCheck: check, reformulationUsed: finalCheck !== check };
}

export function approachRPGWildPokemon(sheet: RPGTrainerSheet, input: {
	nonHostile: boolean, alreadyConfronted: boolean, dc: number,
}, random: () => number = Math.random) {
	if (!Number.isSafeInteger(input.dc) || input.dc < 0 || input.dc > 30) throw new Error('CD de aproximação inválida');
	const eligible = input.nonHostile && !input.alreadyConfronted;
	const bonus = eligible && sheet.talents.general.includes('afinidade-pokemon') ? 2 : 0;
	return rollRPGTrainerSkillCheck(sheet, 'empatia-pokemon', undefined, { dc: input.dc, bonus }, random);
}

export interface RPGPokemonCooperation {
	available: boolean; willing: boolean; understands: boolean; anatomySuitable: boolean;
	physicallyCapable: boolean; safe: boolean; complexTask?: boolean;
}
/** Não cria amizade, cura, obediência ou bônus ao desempenho em combate. */
export function assessRPGPokemonCooperation(input: RPGPokemonCooperation) {
	for (const value of [input.available, input.willing, input.understands,
		input.anatomySuitable, input.physicallyCapable, input.safe]) {
		if (typeof value !== 'boolean') throw new Error('Avaliação do Pokémon inválida');
	}
	const reasons = [
		!input.available && 'Pokémon indisponível nesta cena',
		!input.willing && 'Pokémon não está disposto',
		!input.understands && 'Instrução não compreendida',
		!input.anatomySuitable && 'Anatomia inadequada',
		!input.physicallyCapable && 'Capacidade insuficiente',
		!input.safe && 'Tarefa insegura',
	].filter(Boolean) as string[];
	return { possible: reasons.length === 0, reasons,
		needsTrainerAction: reasons.length === 0 && !!input.complexTask };
}

/** Uso narrativo exige o golpe conhecido e PP; devolve cópia para persistência atômica pelo serviço. */
export function useRPGPokemonMoveOutsideBattle(pokemon: RPGPokemonState,
	knownMoveIds: readonly string[], moveId: string, declaredEffect: string,
	options: { inBattle?: boolean, available?: boolean, effectApproved?: boolean } = {}) {
	if (options.inBattle) throw new Error('Golpes em batalha pertencem ao simulador Pokémon');
	if (options.available === false) throw new Error('Pokémon não está presente');
	if (!Array.isArray(knownMoveIds) || !knownMoveIds.includes(moveId) ||
		typeof declaredEffect !== 'string' || !declaredEffect.trim() || declaredEffect.length > 500) {
		throw new Error('Golpe ou efeito narrativo inválido');
	}
	if (!options.effectApproved) throw new Error('O efeito fora de batalha exige aprovação do Mestre');
	const index = knownMoveIds.indexOf(moveId);
	if (!pokemon.pp || !Number.isSafeInteger(pokemon.pp[index]) || pokemon.pp[index] <= 0) {
		throw new Error('Golpe sem PP disponível');
	}
	const next = structuredClone(pokemon);
	next.pp![index]--;
	return { pokemon: next, ppSpent: 1, effect: declaredEffect.trim() };
}
