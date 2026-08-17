export interface RPGStatusPresentation {
	id: string;
	name: string;
	description: string;
	negative: true;
}

const STATUS_NAMES: Record<string, string> = {
	brn: 'Burn',
	par: 'Paralysis',
	slp: 'Sleep',
	frz: 'Freeze',
	psn: 'Poison',
	tox: 'Badly Poisoned',
};

export function getRPGStatusPresentation(status: string, generation = 9): RPGStatusPresentation | null {
	const id = status.toLowerCase();
	const name = STATUS_NAMES[id];
	if (!name) return null;
	let description = '';
	switch (id) {
	case 'brn':
		description = `Ao final de cada turno, perde ${generation >= 7 ? '1/16' : '1/8'} do HP máximo. ` +
			'O dano dos golpes físicos é reduzido pela metade, salvo exceções como Guts.';
		break;
	case 'par':
		description = `A Velocidade é reduzida para ${generation >= 7 ? 'metade' : '1/4'} e há 25% de chance ` +
			'de não conseguir agir no turno.';
		break;
	case 'slp':
		description = generation >= 5 ?
			'Impede o uso da maioria dos golpes por 1 a 3 turnos. Golpes utilizáveis durante o sono continuam disponíveis.' :
			'Impede o uso da maioria dos golpes enquanto durar. Golpes utilizáveis durante o sono continuam disponíveis.';
		break;
	case 'frz':
		description = 'Normalmente impede a ação. A cada tentativa há 20% de chance de descongelar; ' +
			'golpes de fogo e alguns golpes específicos também podem descongelar.';
		break;
	case 'psn':
		description = 'Ao final de cada turno, perde 1/8 do HP máximo.';
		break;
	case 'tox':
		description = 'O dano começa em 1/16 do HP máximo e aumenta em mais 1/16 a cada turno em campo.';
		break;
	}
	return { id, name, description, negative: true };
}