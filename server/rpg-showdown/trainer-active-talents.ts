import { rpgTrainerModifier } from './trainer-creation';
import { rpgTrainerHeal, rpgTrainerSurvival } from './trainer-survival';
import type { RPGTrainerChatRoll, RPGTrainerSheet } from './trainer-sheet';

/** Ativa efeitos voluntários que mudam a ficha humana, sem afetar Pokémon. */
export function rpgUseTrainerSheetTalent(sheet: RPGTrainerSheet, talentId: string,
	random: () => number = Math.random) {
	if (talentId !== 'segundo-folego') throw new Error('Talento sem ativação direta na ficha');
	if (sheet.status !== 'complete' || !sheet.attributes || !sheet.talents.general.includes(talentId)) {
		throw new Error('Este treinador não possui o talento');
	}
	if (rpgTrainerSurvival(sheet).lifeState !== 'conscious' || sheet.hitPoints.current === 0) {
		throw new Error('Segundo Fôlego exige que o treinador esteja consciente');
	}
	if (sheet.hitPoints.current === sheet.hitPoints.maximum) throw new Error('Os PV já estão completos');
	const cycle = sheet.talentRestCycle || 0;
	if (sheet.talentUses?.[talentId] === cycle) {
		throw new Error('Segundo Fôlego já foi usado antes do próximo descanso longo');
	}
	const die = Math.floor(random() * 6) + 1;
	const amount = Math.max(1, die + rpgTrainerModifier(sheet.attributes.constitution));
	const healed = rpgTrainerHeal(sheet, amount);
	healed.talentUses = { ...healed.talentUses, [talentId]: cycle };
	return { sheet: healed, die, recovered: healed.hitPoints.current! - sheet.hitPoints.current! };
}

export function rpgTrainerRerollCandidate(sheet: RPGTrainerSheet | undefined,
	talentId: 'sortudo' | 'determinado' | 'esforco-heroico', accountId: string | undefined,
	campaignTime: string, now: number): RPGTrainerChatRoll | null {
	const roll = talentId === 'sortudo' ? sheet?.lastChatRolls?.any :
		talentId === 'determinado' ? sheet?.lastChatRolls?.resistance : sheet?.lastChatRolls?.skill;
	return roll && roll.authorAccountId === accountId && !roll.rerolled &&
		roll.campaignTime === campaignTime && roll.createdAt + 48 * 60 * 60 * 1000 > now ? roll : null;
}

/** O teste de perícia já foi resolvido; o talento apenas converte a falha registrada. */
export function rpgTrainerHeroicMessage(original: string, exhaustion: number) {
	return `${original}\n---\nEsforço Heroico\nFalha convertida em sucesso.\nExaustão: ${exhaustion}`;
}

/** Repete o d20 com o mesmo modo e os mesmos modificadores do teste original. */
export function rpgTrainerRerollMessage(original: string, roll: RPGTrainerChatRoll,
	talentId: 'sortudo' | 'determinado', random: () => number) {
	if (![1, 2].includes(roll.diceCount) || !['normal', 'advantage', 'disadvantage'].includes(roll.mode)) {
		throw new Error('Dados originais inválidos');
	}
	const dice = Array.from({ length: roll.diceCount }, () => Math.floor(random() * 20) + 1);
	const natural = roll.mode === 'advantage' ? Math.max(...dice) :
		roll.mode === 'disadvantage' ? Math.min(...dice) : dice[0];
	const naturalFloor = roll.naturalFloorSource === 'Ápice — Lenda dos Palcos' && roll.label !== 'Atuação' ?
		0 : roll.naturalFloor || 0;
	const effectiveNatural = Math.max(natural, naturalFloor);
	const total = effectiveNatural + roll.bonus;
	const rollLines = dice.length === 2 ?
		`${roll.mode === 'advantage' ? 'Vantagem' : 'Desvantagem'}\n` +
		`1ª rolagem: ${dice[0]}\n2ª rolagem: ${dice[1]}\n` : '';
	const label = talentId === 'sortudo' ? 'Sortudo' : 'Determinado';
	const bonusText = roll.bonusTerms || (roll.bonus < 0 ? `- ${Math.abs(roll.bonus)}` : `+ ${roll.bonus}`);
	const floorLine = effectiveNatural > natural ?
		`${roll.naturalFloorSource || (roll.naturalFloor === 10 ? 'Voz das Eras' : 'Memória Acadêmica')}: ` +
		`${natural} no dado vale ${effectiveNatural}.\n` : '';
	const message = `${original}\n---\n${label}\n${floorLine}${rollLines}${roll.label}: 1d20 tirou ` +
		`${effectiveNatural} ${bonusText} = ${total}`;
	return { message, dice, natural, total };
}
