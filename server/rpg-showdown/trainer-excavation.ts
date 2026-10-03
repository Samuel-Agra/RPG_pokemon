import { rollRPGTrainerSkillCheck, type RPGTrainerAttribute } from './trainer-checks';
import type { RPGTrainerSheet } from './trainer-sheet';

/** Resolve apenas o achado e sua proteção; a duração continua sob arbitragem do Mestre. */
export function resolveRPGMasterExcavation(worker: RPGTrainerSheet, coordinator: RPGTrainerSheet,
	input: { skill: string, attribute?: RPGTrainerAttribute, dc: number }, random: () => number = Math.random) {
	if (coordinator.status !== 'complete' || coordinator.talents.apex !== 'arqueologo:mestre-da-escavacao') {
		throw new Error('Coordenador não possui Mestre da Escavação');
	}
	if (worker.status !== 'complete' || !/^(conhecimento|oficio):[a-z0-9-]+$|^investigacao$/.test(input.skill)) {
		throw new Error('Perícia de escavação inválida');
	}
	const check = rollRPGTrainerSkillCheck(worker, input.skill, input.attribute,
		{ dc: input.dc, bonus: 4 }, random);
	// O mesmo limite protege o coordenador quando ele próprio realiza o teste e qualquer aliado que o execute.
	return { check, coordinatorBonus: 4, protectedFind: check.success || check.total >= input.dc - 4,
		stabilizedForTransport: check.success };
}
