import type { Move } from '../../sim/dex-moves';
import type { RPGMoveEffect } from './battle-move-analysis';

const SPECIAL_DESCRIPTIONS: Record<string, string> = {
	throatchop: 'Causa dano e, por 2 turnos, impede o alvo de usar golpes baseados em som.',
	solarbeam: 'Carrega energia no primeiro turno e ataca no segundo. Sob sol forte, ataca imediatamente. O poder é reduzido pela metade sob chuva, areia ou neve.',
	roost: 'Recupera metade do HP máximo. Até o final do turno, o usuário perde temporariamente o tipo Flying.',
	protect: 'Protege o usuário da maioria dos golpes naquele turno. Usos consecutivos aumentam a chance de falha.',
	detect: 'Protege o usuário da maioria dos golpes naquele turno. Usos consecutivos aumentam a chance de falha.',
	substitute: 'Consome 1/4 do HP máximo para criar um Substitute que recebe dano e bloqueia diversos efeitos no lugar do usuário.',
	rest: 'Restaura todo o HP e remove o status atual, mas faz o usuário dormir por 2 turnos.',
	leechseed: 'Planta sementes no alvo. Ao final de cada turno, retira 1/8 do HP máximo dele e recupera a mesma quantidade para o lado do usuário.',
	stealthrock: 'Espalha pedras no lado adversário. Pokémon que entrarem em campo sofrem dano de acordo com sua fraqueza ou resistência a Rock.',
	spikes: 'Espalha armadilhas no chão do lado adversário. Pokémon no chão sofrem dano ao entrar; até 3 camadas podem ser acumuladas.',
	toxicspikes: 'Espalha armadilhas venenosas no lado adversário. Pokémon no chão são envenenados ao entrar; 2 camadas causam envenenamento grave.',
	stickyweb: 'Espalha uma teia no lado adversário que reduz a Speed dos Pokémon no chão quando entram em campo.',
	rapidspin: 'Causa dano, aumenta a Speed do usuário em 1 estágio e remove efeitos de aprisionamento e armadilhas do seu lado.',
	defog: 'Reduz a Evasion do alvo em 1 estágio e remove barreiras, terrains e armadilhas dos dois lados do campo.',
	trickroom: 'Durante 5 turnos, Pokémon mais lentos agem antes dos mais rápidos dentro da mesma faixa de prioridade.',
	tailwind: 'Durante 4 turnos, dobra a Speed dos Pokémon do lado do usuário.',
	trick: 'Troca o item do usuário com o item do alvo. Falha quando a troca não é permitida.',
	switcheroo: 'Troca o item do usuário com o item do alvo. Falha quando a troca não é permitida.',
	bellydrum: 'Consome metade do HP máximo do usuário e eleva seu Attack ao estágio máximo.',
	batonpass: 'Troca o usuário e transfere ao substituto suas alterações de atributos e diversas condições temporárias.',
	endeavor: 'Reduz o HP do alvo até ficar igual ao HP atual do usuário. Falha se o alvo já possuir HP igual ou menor.',
	facade: 'O poder dobra quando o usuário está queimado, paralisado ou envenenado. Burn não reduz o dano deste golpe.',
	falseswipe: 'Causa dano, mas nunca reduz o alvo abaixo de 1 HP.',
};

export function getRPGMoveDescriptionPTBR(move: Move, effects: RPGMoveEffect[]): string {
	const special = SPECIAL_DESCRIPTIONS[move.id];
	if (special) return special;
	const sentences: string[] = [];
	if (move.ohko) {
		sentences.push('Se acertar, faz o alvo desmaiar imediatamente.');
	} else if (move.category !== 'Status') {
		sentences.push('Causa dano ao alvo.');
	}
	if (move.basePowerCallback || move.damageCallback || move.damage || move.ohko) sentences.push('O poder varia de acordo com as condições específicas do golpe.');
	if (typeof move.multihit === 'number') {
		sentences.push(`Atinge ${move.multihit} vezes.`);
	} else if (Array.isArray(move.multihit)) {
		sentences.push(`Atinge de ${move.multihit[0]} a ${move.multihit[1]} vezes.`);
	}
	if ((move.critRatio || 0) > 1) sentences.push('Possui uma chance maior de causar acerto crítico.');
	if (move.willCrit) sentences.push('Sempre causa acerto crítico quando o golpe é bem-sucedido.');
	if (move.priority > 0) sentences.push(`Possui prioridade +${move.priority}.`);
	if (move.priority < 0) sentences.push(`Possui prioridade ${move.priority}.`);
	if (move.flags['charge']) sentences.push('Normalmente exige um turno de preparação antes de atacar.');
	if (move.flags['recharge']) sentences.push('Após um uso bem-sucedido, o usuário precisa recarregar no turno seguinte.');
	if (move.breaksProtect) sentences.push('Atravessa Protect e efeitos equivalentes.');
	for (const effect of effects) {
		const chance = effect.chance !== null && effect.chance < 100 ?
			`Possui ${effect.chance}% de chance de causar ${effect.name}. ` : '';
		const description = effect.description.trim();
		const sentence = `${chance}${description}`.trim();
		if (sentence && !sentences.includes(sentence)) sentences.push(sentence);
	}
	if (!sentences.length) sentences.push(`Executa o efeito específico de ${move.name}.`);
	return sentences.join(' ');
}