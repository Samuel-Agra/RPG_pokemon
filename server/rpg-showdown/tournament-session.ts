/**
 * Orquestra torneios de batalha e concurso.
 *
 * Persiste inscrições e chaveamento, encaminha partidas que exigem jogo real e
 * resolve automaticamente apenas confrontos entre NPCs. O elenco inscrito limita
 * quais Pokémon podem ser escolhidos em cada etapa.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { toID } from '../../sim/dex-data';
import { RPGTournamentSystem, type RPGTournamentParticipant as CoreParticipant } from '../../sim/rpg-showdown/systems/tournament';

export type RPGTournamentActivity = 'battle' | 'contest';
export type RPGTournamentStatus = 'draft' | 'active' | 'ended' | 'cancelled';
export interface RPGTournamentParticipant extends CoreParticipant {
	characterId?: string; avatar?: string; source: 'player' | 'temporary' | 'registered';
	pokemon?: unknown[];
	rosterPokemonIds?: string[];
}
export interface RPGTournamentMatch {
	id: string; round: number; position: number; participant1Id: string; participant2Id: string;
	participant1Ids?: string[]; participant2Ids?: string[];
	placement?: 'third-place';
	status: 'ready' | 'playing' | 'ended'; winnerId?: string; loserId?: string;
	automatic: boolean; resolution?: 'weighted-random' | 'registered-priority' | 'played'; linkedSessionId?: string;
}
export interface RPGTournament {
	version: 1; id: string; name: string; activity: RPGTournamentActivity; status: RPGTournamentStatus;
	bracketSize: 4 | 8 | 16 | 32 | 64; format: string; participants: RPGTournamentParticipant[];
	conditions: Record<string, unknown>; matches: RPGTournamentMatch[]; currentRound: number;
	teams?: string[][];
	createdAt: number; updatedAt: number; championId?: string; thirdPlaceId?: string;
}

export class RPGTournamentSessionService {
	private tournaments = new Map<string, RPGTournament>();
	constructor(readonly filePath = resolve('config/rpg-tournaments.json'), private readonly random = Math.random,
		initial: RPGTournament[] | null = null, private readonly changed?: (tournament: RPGTournament) => void) {
		if (initial) {
			for (const tournament of initial) this.tournaments.set(toID(tournament.id), structuredClone(tournament));
			return;
		}
		if (!existsSync(filePath)) return;
		const stored = JSON.parse(readFileSync(filePath, 'utf8')) as { version?: number, tournaments?: RPGTournament[] };
		if (stored.version !== 1 || !Array.isArray(stored.tournaments)) throw new Error('Invalid RPG tournament persistence file');
		for (const tournament of stored.tournaments) this.tournaments.set(toID(tournament.id), structuredClone(tournament));
	}
	list() { return [...this.tournaments.values()].map(value => structuredClone(value)); }
	get(id: string) { const value = this.tournaments.get(toID(id)); if (!value) throw new Error('Torneio não encontrado'); return structuredClone(value); }
	create(input: Omit<RPGTournament, 'version' | 'id' | 'status' | 'matches' | 'currentRound' | 'createdAt' | 'updatedAt' | 'championId'>) {
		if (!['battle', 'contest'].includes(input.activity)) throw new Error('Tipo de torneio inválido');
		if (![4, 8, 16, 32, 64].includes(input.bracketSize)) throw new Error('Tamanho de chave inválido');
		const teamSize = input.format === 'multi' ? 2 : 1;
		if (!Array.isArray(input.participants) || input.participants.length !== input.bracketSize * teamSize) throw new Error('Preencha todas as vagas da chave');
		const participants = input.participants.map(entry => this.normalize(entry));
		if (new Set(participants.map(entry => entry.id)).size !== participants.length) throw new Error('Participante duplicado no torneio');
		const now = Date.now(); const id = toID(input.name) + '-' + now.toString(36);
		const teams = Array.from({ length: input.bracketSize }, (_, index) => participants.slice(index * teamSize, index * teamSize + teamSize).map(entry => entry.id));
		const tournament: RPGTournament = { ...structuredClone(input), participants, teams, version: 1, id, status: 'draft', matches: [], currentRound: 0, createdAt: now, updatedAt: now };
		this.tournaments.set(toID(id), tournament); this.persist(); return structuredClone(tournament);
	}
	start(id: string) {
		const tournament = this.require(id); if (tournament.status !== 'draft') throw new Error('O torneio já foi iniciado');
		const pokemonLimit = Math.max(1, Math.min(6, Number(tournament.conditions.pokemonLimit) || 1));
		if (tournament.participants.some(entry => entry.type === 'player' && entry.rosterPokemonIds?.length !== pokemonLimit)) throw new Error('Todos os Players precisam inscrever seus Pokémon antes do início');
		// In Multi, the addition order defines each partnership. Only the complete
		// teams are drawn into bracket positions; partners are never separated.
		const teamSize = tournament.format === 'multi' ? 2 : 1;
		const registeredTeams = tournament.teams?.length ? tournament.teams : Array.from(
			{ length: tournament.bracketSize },
			(_, index) => tournament.participants.slice(index * teamSize, index * teamSize + teamSize).map(entry => entry.id)
		);
		const randomized = registeredTeams.map(team => [...team]);
		for (let index = randomized.length - 1; index > 0; index--) {
			const target = Math.floor(this.random() * (index + 1));
			[randomized[index], randomized[target]] = [randomized[target], randomized[index]];
		}
		tournament.teams = randomized;
		tournament.status = 'active'; tournament.currentRound = 1; this.createRound(tournament, tournament.teams);
		this.resolveAutomatic(tournament); this.save(tournament); return structuredClone(tournament);
	}
	setRoster(id: string, characterId: string, pokemonIds: string[]) {
		const tournament = this.require(id); if (tournament.status !== 'draft') throw new Error('As inscrições deste torneio estão encerradas');
		const participant = tournament.participants.find(entry => entry.type === 'player' && entry.characterId === toID(characterId));
		if (!participant) throw new Error('Player não participa deste torneio');
		const pokemonLimit = Math.max(1, Math.min(6, Number(tournament.conditions.pokemonLimit) || 1));
		const normalized = pokemonIds.map(id => String(id || '').trim()).filter(Boolean);
		if (normalized.length !== pokemonLimit || new Set(normalized).size !== normalized.length) throw new Error(`Escolha exatamente ${pokemonLimit} Pokémon`);
		participant.rosterPokemonIds = normalized; this.save(tournament); return structuredClone(tournament);
	}
	report(id: string, matchId: string, winnerId: string) {
		const tournament = this.require(id); const match = tournament.matches.find(entry => entry.id === matchId);
		if (!match || match.status === 'ended') throw new Error('Confronto indisponível');
		const normalizedWinner = toID(winnerId); const sideA = match.participant1Ids || [match.participant1Id]; const sideB = match.participant2Ids || [match.participant2Id];
		if (![...sideA, ...sideB].includes(normalizedWinner)) throw new Error('Vencedor não pertence ao confronto');
		this.finishMatch(match, sideA.includes(normalizedWinner) ? match.participant1Id : match.participant2Id, 'played'); this.advance(tournament); this.save(tournament); return structuredClone(tournament);
	}
	link(id: string, matchId: string, sessionId: string) {
		const tournament = this.require(id); const match = tournament.matches.find(entry => entry.id === matchId);
		if (!match || match.status !== 'ready' || match.automatic) throw new Error('Confronto não pode ser iniciado');
		match.status = 'playing'; match.linkedSessionId = sessionId; this.save(tournament); return structuredClone(tournament);
	}
	linked(activity: RPGTournamentActivity, sessionId: string) {
		for (const tournament of this.tournaments.values()) { const match = tournament.matches.find(entry => entry.linkedSessionId === sessionId && entry.status === 'playing'); if (match && tournament.activity === activity) return { tournament: structuredClone(tournament), match: structuredClone(match) }; }
		return null;
	}
	repairOrphanedMatches(battleSessionIds: ReadonlySet<string>, contestSessionIds: ReadonlySet<string>) {
		let changed = false;
		for (const tournament of this.tournaments.values()) {
			if (tournament.status !== 'active') continue;
			let tournamentChanged = false;
			const existing = tournament.activity === 'battle' ? battleSessionIds : contestSessionIds;
			for (const match of tournament.matches) {
				if (match.status !== 'playing' || !match.linkedSessionId || existing.has(match.linkedSessionId)) continue;
				match.status = 'ready'; delete match.linkedSessionId; changed = true; tournamentChanged = true;
			}
			if (tournamentChanged) tournament.updatedAt = Date.now();
		}
		if (changed) this.persist();
	}
	cancel(id: string) { const tournament = this.require(id); if (tournament.status !== 'draft') throw new Error('Somente torneios que ainda não começaram podem ser cancelados'); tournament.status = 'cancelled'; this.save(tournament); return structuredClone(tournament); }
	private normalize(entry: RPGTournamentParticipant): RPGTournamentParticipant {
		const source = entry.source; if (!['player', 'temporary', 'registered'].includes(source)) throw new Error('Origem de participante inválida');
		const core = RPGTournamentSystem.normalizeParticipant({ ...entry, type: source === 'player' ? 'player' : 'npc', npcClass: source === 'registered' ? 'special' : source === 'temporary' ? 'generic' : undefined });
		return { ...structuredClone(entry), ...core, characterId: entry.characterId ? toID(entry.characterId) : undefined, source };
	}
	private createRound(tournament: RPGTournament, teams: string[][]) { for (let index = 0; index < teams.length; index += 2) { const sideA = teams[index]; const sideB = teams[index + 1]; const p1 = this.participant(tournament, sideA[0]); const p2 = this.participant(tournament, sideB[0]); const automatic = [...sideA, ...sideB].every(id => this.participant(tournament, id).type === 'npc'); tournament.matches.push({ id: `${tournament.id}-r${tournament.currentRound}-m${index / 2 + 1}`, round: tournament.currentRound, position: index / 2, participant1Id: p1.id, participant2Id: p2.id, participant1Ids: sideA, participant2Ids: sideB, status: 'ready', automatic }); } }
	private createThirdPlaceMatch(tournament: RPGTournament, teams: string[][]) { const sideA = teams[0]; const sideB = teams[1]; const p1 = this.participant(tournament, sideA[0]); const p2 = this.participant(tournament, sideB[0]); const automatic = [...sideA, ...sideB].every(id => this.participant(tournament, id).type === 'npc'); tournament.matches.push({ id: `${tournament.id}-third-place`, round: tournament.currentRound, position: 1, placement: 'third-place', participant1Id: p1.id, participant2Id: p2.id, participant1Ids: sideA, participant2Ids: sideB, status: 'ready', automatic }); }
	private resolveAutomatic(tournament: RPGTournament) { for (const match of tournament.matches.filter(entry => entry.round === tournament.currentRound && entry.status === 'ready' && entry.automatic)) { const representative = (ids: string[], captain: string) => { const members = ids.map(id => this.participant(tournament, id)); return { id: captain, name: members.map(entry => entry.name).join(' + '), type: 'npc' as const, npcClass: (members.some(entry => entry.npcClass === 'special') ? 'special' : 'generic') as 'special' | 'generic', strength: members.reduce((sum, entry) => sum + (entry.strength || 1), 0) }; }; const p1 = representative(match.participant1Ids || [match.participant1Id], match.participant1Id); const p2 = representative(match.participant2Ids || [match.participant2Id], match.participant2Id); const result = RPGTournamentSystem.resolveNPCMatch(match.id, p1, p2, this.random); this.finishMatch(match, result.winnerId, result.resolution === 'special-priority' ? 'registered-priority' : 'weighted-random'); } this.advance(tournament); }
	private advance(tournament: RPGTournament) { const round = tournament.matches.filter(entry => entry.round === tournament.currentRound); if (!round.length || round.some(entry => entry.status !== 'ended')) return; const totalRounds = Math.log2(tournament.bracketSize); if (tournament.currentRound === totalRounds) { const final = round.find(entry => !entry.placement); const thirdPlace = round.find(entry => entry.placement === 'third-place'); tournament.status = 'ended'; tournament.championId = final?.winnerId; tournament.thirdPlaceId = thirdPlace?.winnerId; return; } const winners = round.map(entry => entry.winnerId === entry.participant1Id ? (entry.participant1Ids || [entry.participant1Id]) : (entry.participant2Ids || [entry.participant2Id])); const semifinalLosers = tournament.currentRound === totalRounds - 1 ? round.map(entry => entry.winnerId === entry.participant1Id ? (entry.participant2Ids || [entry.participant2Id]) : (entry.participant1Ids || [entry.participant1Id])) : null; tournament.currentRound++; this.createRound(tournament, winners); if (semifinalLosers) this.createThirdPlaceMatch(tournament, semifinalLosers); this.resolveAutomatic(tournament); }
	private finishMatch(match: RPGTournamentMatch, winnerId: string, resolution: RPGTournamentMatch['resolution']) { match.status = 'ended'; match.winnerId = winnerId; match.loserId = winnerId === match.participant1Id ? match.participant2Id : match.participant1Id; match.resolution = resolution; }
	private participant(tournament: RPGTournament, id: string) { const value = tournament.participants.find(entry => entry.id === toID(id)); if (!value) throw new Error('Participante do torneio não encontrado'); return value; }
	private require(id: string) { const value = this.tournaments.get(toID(id)); if (!value) throw new Error('Torneio não encontrado'); return value; }
	private save(tournament: RPGTournament) { tournament.updatedAt = Date.now(); this.tournaments.set(toID(tournament.id), tournament); this.persist(); }
	private persist() {
		if (this.changed) {
			for (const tournament of this.tournaments.values()) this.changed(structuredClone(tournament));
			return;
		}
		mkdirSync(dirname(this.filePath), { recursive: true }); const temporary = this.filePath + '.tmp'; writeFileSync(temporary, JSON.stringify({ version: 1, tournaments: [...this.tournaments.values()] }, null, '\t') + '\n'); renameSync(temporary, this.filePath);
	}
}
