'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('RPG trainer sheet read-only frontend', () => {
	const root = path.resolve(__dirname, '../../server/static/rpg');
	const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
	const app = fs.readFileSync(path.join(root, 'rpg.js'), 'utf8');
	const page = fs.readFileSync(path.join(root, 'trainer-sheet-ui.js'), 'utf8');
	const style = fs.readFileSync(path.join(root, 'trainer-sheet.css'), 'utf8');
	const http = fs.readFileSync(path.resolve(root, '../../rpg-showdown/http.ts'), 'utf8');
	it('offers Mil Faces only with the selected Charisma skill attribute', () => {
		assert(page.includes('attributeOptions.includes(talent.requiredAttribute)'));
		assert(page.includes('talent.requiredAttribute === selectedAttribute'));
		assert(http.includes('skillAttribute);'));
	});
	it('keeps Comforting Art activation visible and renews it after short rests', () => {
		assert(page.includes("!readOnly && id === 'artista:arte-reconfortante'"));
		assert(page.includes("'/trainer/talents/comforting-art'"));
		const service = fs.readFileSync(path.resolve(root, '../../rpg-showdown/index.ts'), 'utf8');
		assert(service.includes('rpgTrainerSurvival(source).lastShortRest?.completedAt ?? -1'));
		assert(!service.includes('Arte Reconfortante exige um descanso curto de uma hora no relógio da campanha'));
	});
	it('offers two Knowledge choices and marks half-proficiency on the right half of each skill', () => {
		assert(page.includes("chosen.id === 'conhecimento-diversificado'"));
		assert(page.includes("entry.halfProficiency ? ' half-proficiency'"));
		assert(page.includes('option.disabled = !!first.value && unavailable.includes(option.value)'));
		assert(style.includes('linear-gradient(to right, #f1f4f9 50%, #e4edf9 50%)'));
	});
	it('offers Observation Learning on untrained skill rolls, including trained-only skills', () => {
		assert(page.includes('entry.observationEligible'));
		assert(page.includes("talent.id !== 'aprendizado-por-observacao' || kind === 'skill' && !trained"));
		assert(http.includes('temporarilyTrained: observedSkill'));
	});
	it('shows the fixed Practical Competence attribute beside the normal skill attribute', () => {
		assert(page.includes("selection.id === 'competencia-pratica' && selection.skill && selection.variant"));
		assert(page.includes('entry.trained, entry.attributes || []'));
		assert(page.includes("chosen.id !== 'competencia-pratica' ||"));
	});
	it('offers help from the skill roll popover and routes it through the shared chat', () => {
		assert(page.includes("'trainer-sheet-roll-choice', 'Ajuda'"));
		assert(page.includes("api('/trainer/help-roll'"));
		assert(page.includes('characterId, skill: id, mode: \'normal\''));
		assert(!page.includes('trainer-sheet-help-list'));
		assert(http.includes("'/api/rpg/trainer/help-roll'"));
		assert(http.includes('consumeTrainerHelp(token, skill!)'));
		assert(http.includes('Ajuda de ${help.helperName}'));
	});

	it('has an original transparent PNG emblem for every trainer class and shows it on the class cards', () => {
		const rules = fs.readFileSync(path.resolve(root, '../../rpg-showdown/trainer-creation.ts'), 'utf8');
		const classIds = [...rules.matchAll(/\brule\('([^']+)'/g)].map(match => match[1]).sort();
		const spriteDirectory = path.join(root, 'assets/trainer-classes');
		const spriteIds = fs.readdirSync(spriteDirectory).filter(name => name.endsWith('.png'))
			.map(name => name.slice(0, -4)).sort();
		assert.equal(classIds.length, 20);
		assert.deepEqual(spriteIds, classIds);
		for (const id of classIds) {
			const sprite = fs.readFileSync(path.join(spriteDirectory, id + '.png'));
			assert.equal(sprite.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
			assert.equal(sprite[25], 6, `${id} precisa preservar transparência RGBA`);
		}
		assert(page.includes("'./assets/trainer-classes/' + encodeURIComponent(rule.id) + '.png'"));
		assert(page.includes("const classGrid = el('div', 'trainer-sheet-class-grid')"));
		assert(page.includes("const card = el('button', 'trainer-sheet-class-card')"));
		assert(page.includes("card.append(sprite, el('span', '', rule.name))"));
		assert(page.includes('classSelect.value = rule.id'));
		assert(page.includes("choice.setAttribute('aria-pressed', String(selected))"));
		assert(style.includes('grid-template-columns: repeat(4, minmax(0, 1fr))'));
		assert(page.includes('const classConfirmed = state.step > 2'));
		assert(page.includes("classGrid.classList.toggle('confirmed', classConfirmed)"));
		assert(page.includes('for (const card of classGrid.children) card.disabled = classConfirmed'));
		assert(style.includes('.trainer-sheet-class-grid.confirmed > .trainer-sheet-class-card:not(.selected)'));
		assert(page.includes("state.step === 2 ? 'Confirmar classe' : 'Continuar'"));
		for (const id of classIds) {
			assert(page.includes(`${id.includes('-') ? `'${id}'` : id}: [`), `${id} precisa de descrição`);
		}
		assert(page.includes("const classInfo = el('aside', 'trainer-sheet-class-info hidden')"));
		assert(page.includes("el('h4', '', 'Pontos fortes')"));
		assert(page.includes('updateClassInfo(rule)'));
		assert(page.includes("document.addEventListener('pointerdown', dismissClassInfo)"));
		assert(style.includes('left: calc(100% + 16px)'));
	});

	it('loads the sheet view in both navigation modes and keeps character selection to the Master', () => {
		assert(html.includes('trainer-sheet-ui.js'));
		assert(html.includes('trainer-sheet.css'));
		assert(app.includes("['trainer-sheet', 'Fichas']"));
		assert(app.includes("['trainer-sheet', 'Ficha']"));
		assert(app.includes('RPGTrainerSheetUI.render({ api, state, master: true, characters })'));
		assert(app.includes('RPGTrainerSheetUI.render({ api, state, master: false, character })'));
		assert(page.includes('if (master) {'));
		assert(page.includes("api('/trainer/sheet' + query)"));
		assert(!page.includes("api('/trainer/equipment' + query)"));
	});

	it('separates earned XP from level confirmation and presents available talents beside acquired ones', () => {
		assert(page.includes("api('/trainer/level-up', { method: 'POST'"));
		assert(page.includes("section('Pode escolher agora'"));
		assert(page.includes("section('Talentos'"));
		assert(page.includes("api('/trainer/talents', { method: 'POST'"));
		assert(page.includes("act(grant, '/trainer/rewards/master'"));
		assert(page.includes("act(up, '/trainer/level/master'"));
		assert(style.includes('.trainer-sheet-level-button'));
		assert(!page.includes("section('Próximo nível'"));
		assert(page.includes("'trainer-sheet-level-button', 'Atualizar'"));
		assert(page.includes('!progression?.canLevelUp'));
		assert(!page.includes('preview.remainingHours'));
	});

	it('keeps the skill attribute selector in the roll-mode column beside situational talents', () => {
		assert(page.includes('choices.append(attributeChoice)'));
		assert(!page.includes('panel.append(attributeChoice)'));
	});

	it('renders separate cards for each trainer statistic group', () => {
		assert(page.includes("el('div', 'trainer-sheet-top-grid')"));
		assert(page.includes("section('Atributos', 'trainer-sheet-panel trainer-sheet-attribute-section')"));
		assert(page.includes("section('PV', 'trainer-sheet-panel trainer-sheet-primary-stat')"));
		assert(page.includes("section('Defesa', 'trainer-sheet-panel trainer-sheet-primary-stat')"));
		assert(page.includes("section('Resistências', 'trainer-sheet-panel trainer-sheet-resistance-panel')"));
		assert(page.includes("section('Ataques', 'trainer-sheet-panel trainer-sheet-attacks')"));
		assert(page.includes("section('Perícias', 'trainer-sheet-panel trainer-sheet-skills-panel')"));
		assert(page.includes("section('Talentos', 'trainer-sheet-panel trainer-sheet-talents')"));
		assert(page.includes('`${baseName} (${detail})`'));
		assert(page.includes("entry.trained && (chosen.id !== 'foco-em-pericia' || !entry.focused)"));
		assert(page.includes("section('Domínios', 'trainer-sheet-panel trainer-sheet-domains')"));
		assert(page.includes("section('Condições e ferimentos', 'trainer-sheet-panel trainer-sheet-conditions')"));
		assert(page.includes('rightStats.append(conditions)'));
		assert(style.includes('.trainer-sheet-right-stats > .trainer-sheet-conditions { width: 274px; min-height: 270px; }'));
		assert(style.includes('gap: 12px; padding: 9px 12px; }'));
		assert(!page.includes("section('Equipamento', 'trainer-sheet-panel')"));
		assert(page.includes("['Classe', className], ['Nível', sheet.level]"));
		assert(page.includes("const details = el('span', 'trainer-sheet-heading-details')"));
		assert(page.includes('title.append(details)'));
		assert(page.includes("const sprite = el('img', 'trainer-sheet-heading-sprite')"));
		assert(page.includes("encodeURIComponent(sheet.classId) + '.png'"));
		assert(page.includes('title.append(spriteFrame)'));
		assert(style.includes('.trainer-sheet-heading-sprite-frame { position: relative; display: block; flex: 0 0 84px;'));
		assert(style.includes('width: 106px; height: 106px; transform: translate(-50%, -50%);'));
		const backgroundDirectory = path.join(root, 'assets/trainer-class-backgrounds');
		const backgroundIds = fs.readdirSync(backgroundDirectory).filter(name => name.endsWith('.png'))
			.map(name => name.slice(0, -4)).sort();
		const classIds = fs.readdirSync(path.join(root, 'assets/trainer-classes'))
			.filter(name => name.endsWith('.png')).map(name => name.slice(0, -4)).sort();
		assert.deepEqual(backgroundIds, classIds);
		assert(page.includes('trainer-class-backgrounds/${encodeURIComponent(sheet.classId)}.png'));
		assert(style.includes('.dashboard-heading:has(#dashboard-title.trainer-sheet-heading-summary)'));
		assert(style.includes('background-image: var(--trainer-class-art);'));
		assert(style.includes('.trainer-sheet-heading-details { display: flex;'));
		assert(!style.includes('linear-gradient(90deg, #fffffff2'));
		assert(style.includes('background-size: cover;'));
		assert(page.includes("['XP / próximo nível'"));
		assert(page.includes('sheet.experience + progression.xpToNextLevel'));
		assert(page.includes('updateTrainerHeading(progression.sheet, progression, rules, masterSummary)'));
		assert(page.includes('updateTrainerHeading(progression.sheet, progression, null, masterSummary)'));
		assert(page.includes("masterSummary = el('div', 'trainer-sheet-master-summary hidden')"));
		assert(page.includes('root.append(masterSummary)'));
		assert(!app.includes("state.dashboardView === 'trainer-sheet' ? 'Ficha do treinador'"));
		assert(!page.includes('trainer-sheet-summary-item'));
		assert(page.includes("el('strong', 'trainer-sheet-attribute-modifier', signed("));
		assert(page.includes("el('small', 'trainer-sheet-attribute-value', value)"));
		assert(page.includes('knowledgeSections.append(talentSection, domainSection)'));
		assert(page.includes('mainStats.append(attributes, primaryStats, knowledgeSections)'));
		assert(style.includes("grid-template-areas: 'attributes stats' 'knowledge knowledge'"));
		assert(style.includes('grid-template-columns: minmax(0, 1fr) 210px;'));
		assert(page.includes('rules?.classFeatures?.[sheet.classId]'));
		assert(page.includes('[...classTalents, ...apexTalents, ...generalTalents]'));
		assert(!page.includes('trainer-sheet-talent-group'));
		assert(style.includes('.trainer-sheet-attributes { display: grid; grid-template-columns: max-content'));
		assert(style.includes('.trainer-sheet-attribute-name { font-size: 12px; font-weight: 800; white-space: nowrap; }'));
		assert(page.includes('attributeLayout.append(mainStats, skills)'));
		assert(!style.includes('.trainer-sheet-skills-panel { grid-area: skills; }'));
		assert(style.includes('.trainer-sheet-top-grid { display: grid;'));
		assert(style.includes('.trainer-sheet-skills-panel { min-width: 0;'));
		assert(style.includes('.trainer-sheet-primary-values { display: flex; flex-wrap: wrap;'));
		assert(style.includes('.trainer-sheet-primary-values > :nth-child(2) { width: 95px; }'));
		assert(style.includes('.trainer-sheet-primary-values > :nth-child(4) { width: 145px;'));
		assert(style.includes('.trainer-sheet-primary-values > :nth-child(4) h2 { white-space: nowrap; }'));
		assert(style.includes('align-items: flex-start; gap: 12px; }'));
		assert(page.includes("section('Iniciativa', 'trainer-sheet-panel trainer-sheet-primary-stat trainer-sheet-initiative')"));
		assert(page.includes("section('Deslocamento', 'trainer-sheet-panel trainer-sheet-primary-stat')"));
		assert(page.includes("section('Dados de Vida', 'trainer-sheet-panel trainer-sheet-primary-stat')"));
		assert(page.includes("section('Teste de morte', 'trainer-sheet-panel trainer-sheet-death-saves')"));
		assert(style.includes('.trainer-sheet-death-saves h2 { font-size: 13px; white-space: nowrap; }'));
		assert(page.includes('sheet.survival?.deathSaves'));
		assert(page.includes('rules?.classes?.[sheet.classId]?.hitDie'));
		assert(style.includes('.trainer-sheet-secondary-vitals { display: flex; flex-wrap: wrap;'));
		assert(style.includes('.trainer-sheet-left-stats, .trainer-sheet-right-stats { display: flex; flex-direction: column;'));
		assert(style.includes('.trainer-sheet-secondary-vitals > :last-child { width: 131px; padding: 10px; }'));
		assert(style.includes('.trainer-sheet-secondary-vitals > :first-child strong { display: grid; place-items: center;'));
		assert(page.includes('progression.derived.movementMeters'));
		assert(page.includes('primaryValues.append(hp, defense, initiative, movement)'));
		assert(page.includes("el('span', '', 'Percepção passiva')"));
		assert(page.includes('skillList.append(passivePerception)'));
		assert(page.includes("section('Proficiência', 'trainer-sheet-panel trainer-sheet-primary-stat trainer-sheet-proficiency')"));
		assert(page.includes('progression.proficiency ?? (sheet.level <= 4 ? 2 : sheet.level <= 8 ? 3 : 4)'));
		assert(style.includes('.trainer-sheet-proficiency { display: flex; align-items: center; justify-content: space-between;'));
		assert(style.includes('.trainer-sheet-proficiency strong { font-size: 16px; line-height: 1; }'));
		assert(page.includes('leftStats.append(proficiency)'));
		assert(page.includes('resistances.append(resistanceList); leftStats.append(resistances)'));
		assert(page.includes('attacks.append(attackValues); leftStats.append(attacks)'));
		assert(style.includes('.trainer-sheet-attacks .trainer-sheet-vitals > button { display: grid; grid-template-columns:'));
		assert(!page.includes("'Não treinada'"));
		assert(!page.includes("'Exige treinamento'"));
		assert(style.includes('.trainer-sheet-panel { min-width: 0; padding: 16px;'));
		assert(page.includes("'historia-personagens-historicos': 'História e Personagens Históricos'"));
		assert(style.includes('.trainer-sheet-list.trainer-sheet-skills, .trainer-sheet-list.trainer-sheet-resistances {'));
		assert(style.includes('max-height: none; overflow: visible;'));
		assert(!page.includes("entry.trained ? 'Treinada' : 'Não treinada'"));
		assert(!page.includes('Bônus base dos ataques humanos'));
		assert(!page.includes("'Pontos de vida'"));
	});

	it('renders all requested read-only sections and synchronizes only its content', () => {
		for (const section of ['Atributos', 'Perícias', 'Resistências', 'Talentos',
			'Condições e ferimentos']) assert(page.includes(section));
		assert(page.includes("window.addEventListener('rpg:realtime-sync', sync)"));
		assert(page.includes('nextSignature !== signature'));
		assert(!page.includes('innerHTML'));
		assert(page.includes("if (progression.sheet?.status !== 'complete')"));
		assert(page.includes("api('/trainer/creation')"));
		assert(page.includes("api('/trainer/roll', { method: 'POST' })"));
		assert(page.includes('trainerAttributeRollView(rollProgress)'));
		assert(page.includes("roll.textContent = result.valid === false ? 'Rolar nova série'"));
		assert(page.includes('dice[position].textContent = String(result.dice[position])'));
		assert(style.includes('.trainer-sheet-roll-scores'));
		assert(page.includes('trainerAttributeAssignment(values'));
		assert(page.includes("chip.classList.toggle('used', used.has(index))"));
		assert(page.includes('option.disabled = [...assignments].some('));
		assert(page.includes("button.textContent = slot === undefined ? '' : String(values[slot])"));
		assert(style.includes('.trainer-sheet-attribute-choice { width: 48px; height: 48px;'));
		assert(style.includes('grid-template-columns: repeat(6, minmax(94px, 1fr))'));
		assert(page.includes("api('/trainer/creation', { method: 'POST', body: payload })"));
		assert(page.includes("state.session?.role === 'player' && !state.tableReadOnly"));
		assert(page.includes('for (const entry of progression.skills || [])'));
		assert(page.includes("new Set(['conhecimento', 'pilotagem', 'oficio'])"));
		assert(page.includes("entry.id.startsWith(family + ':')"));
		assert(page.includes('showSkillPopover(button, SKILLS[family], entries, readOnly ? null : rollSkill)'));
		assert(style.includes('.trainer-sheet-skills .trainer-sheet-list-row { align-items: center; padding: 5px 8px;'));
		assert(style.includes('.trainer-sheet-skills .trainer-sheet-list-row.focused { background: #a8c9f4; }'));
		assert(style.includes('.trainer-sheet-skill-popover .trainer-sheet-list-row.focused { background: #a8c9f4; }'));
		assert(page.includes('for (const entry of progression.resistances || [])'));
		assert(page.includes('progression.derived?.defense'));
		assert(page.includes('progression.attacks?.melee'));
		assert(page.includes('progression.attacks?.ranged'));
	});

	it('guides newly created characters through server-backed sheet creation steps', () => {
		assert(html.includes('id="trainer-creation-screen"'));
		assert(html.includes('id="cancel-trainer-creation"'));
		assert(html.includes('id="character-trainer-creation"'));
		assert(app.includes("show('trainer-creation')"));
		assert(app.includes("$('#cancel-trainer-creation').addEventListener('click', leaveTrainerCreation)"));
		assert(app.includes("if (visibleScreen === 'trainer-creation-screen')"));
		assert(app.includes('window.RPGTrainerSheetUI.mountCreationWizard(wizard, api'));
		assert(app.includes('window.RPGTrainerSheetUI?.backCreationWizard?.()'));
		assert(page.includes("['Método', 'Atributos', 'Classe', 'Perícias', 'Equipamento', 'Revisão']"));
		assert(page.includes("api('/trainer/roll', { method: 'POST' })"));
		assert(page.includes("api('/trainer/creation', { method: 'POST', body: payload })"));
		assert(page.includes("const creation = await api('/trainer/creation')"));
		assert(page.includes('showError(target, message); state.step = target'));
		assert(page.includes('skillDomainOptions(creation.skillDomains, \'conhecimento\')'));
		assert(page.includes('skillPicker(rule.excluded, creation.skillDomains, previous[index],'));
		assert(page.includes('syncSkillAvailability(fixed, skillControls)'));
		assert(page.includes('option.disabled = branches ? branches.every(id => taken.has(option.value + \':\' + id))'));
		assert(page.includes("option.disabled = taken.has(category.value + ':' + option.value)"));
		assert(page.includes("option.disabled = taken.has('pilotagem:' + option.value)"));
		assert(page.includes("fixedKnowledge.addEventListener('change', refreshSkillAvailability)"));
		assert(page.includes("const domain = select([['', 'Escolha uma área']]"));
		assert(page.includes("skillDomainOptions(domains, 'pilotagem')"));
		assert(!page.includes("fixedKnowledge.type = 'text'"));
		const service = fs.readFileSync(path.resolve(root, '../../rpg-showdown/index.ts'), 'utf8');
		assert(service.includes('skillDomains: { conhecimento: [...RPG_KNOWLEDGE_DOMAINS]'));
		assert(style.includes('.trainer-sheet-wizard-progress li.active'));
		assert(page.includes("block.classList.toggle('hidden', index > state.step)"));
		assert(page.includes("block.classList.toggle('done', index < state.step)"));
		assert(style.includes('.trainer-sheet-wizard-step.active'));
	});

	it('uses the same creation wizard for a pending sheet opened from the normal page', () => {
		assert(page.includes('renderCreationWizard(root, creation, api, load, onComplete, state)'));
		assert(page.includes('renderCreationWizard(content, creation, api, refreshCreation, refreshCreation,'));
		assert(page.includes('creationState, true)'));
		assert(page.includes("inPage ? ' trainer-sheet-inpage-wizard' : ''"));
		assert(style.includes('.trainer-sheet-inpage-wizard { width: min(760px, 100%);'));
		assert(!page.includes('function renderCreation('));
	});

	it('rolls attributes, resistances, attacks and skills on the server and posts to the table chat', () => {
		assert(page.includes("['advantage', 'Vantagem'], ['normal', 'Normal'], ['disadvantage', 'Desvantagem']"));
		assert(page.includes('api(`/trainer/${kind}-roll`, { method: \'POST\''));
		assert(page.includes("showRollPopover(tile, name, 'attribute', id, character.id, api,"));
		assert(page.includes("'resistance', entry.id, character.id, api"));
		assert(page.includes("el(readOnly ? 'div' : 'button', 'trainer-sheet-attribute')"));
		assert(http.includes("'/api/rpg/trainer/attribute-roll', '/api/rpg/trainer/resistance-roll'"));
		assert(http.includes('this.login.getCharacter(token, characterId)'));
		assert(http.includes("if (session.mode !== 'player')"));
		assert(http.includes("session.role === 'master' && (!session.viewAsCharacterId"));
		assert(page.includes('state.tableReadOnly || master'));
		assert(http.includes('rollRPGTrainerAttributeCheck(character.trainerSheet!'));
		assert(http.includes('rollRPGTrainerResistance(character.trainerSheet!'));
		assert(http.includes('persistence.createTableChatMessage('));
		assert(http.includes("mode === 'advantage' ? 'Vantagem' : 'Desvantagem'"));
		assert(http.includes('1ª rolagem: ${result.dice[0]}\\n2ª rolagem: ${result.dice[1]}'));
		assert(http.includes('`${helpLine}${talentLines}${floorLine}${rolls}${rollName}: 1d20 tirou `'));
		assert(http.includes('rollRPGTrainerSkillCheck(character.trainerSheet!'));
		assert(http.includes('rpgTrainerAttackBonus(character.trainerSheet!'));
		assert(page.includes("'skill', entry.id, character.id, api"));
		assert(page.includes("'attack', id, character.id, api"));
		assert(page.includes('entry.bonus != null'));
		assert(page.includes("kind === 'skill' && attributeOptions.length > 1"));
		assert(http.includes('rpgTrainerSkillAttributes(character.trainerSheet!, skill!).includes(skillAttribute)'));
		assert(style.includes('.trainer-sheet-attribute-popover { position: fixed;'));
	});

	it('enables the death save only while the own trainer is dying at zero HP', () => {
		assert(page.includes('sheet.hitPoints.current === 0'));
		assert(page.includes("(sheet.survival?.lifeState || 'dying') === 'dying'"));
		assert(page.includes("api('/trainer/death-save', { method: 'POST', body: { requestId } })"));
		assert(http.includes("url.pathname === '/api/rpg/trainer/death-save'"));
		assert(http.includes('this.login.rollOwnTrainerDeathSave(token, this.string(body.requestId))'));
	});

	it('shows complete talent descriptions without overflowing the sheet', () => {
		assert(page.includes("['Sucess', deathSaveValues.successes]"));
		assert(page.includes('rules?.classFeatures?.[sheet.classId]'));
		assert(page.includes('description: definition?.text'));
		assert(page.includes("el('button', 'trainer-sheet-talent-row', name)"));
		assert(page.includes('showTalentPopover(button, name, description)'));
		assert(page.includes('renderTrainerDescription(description'));
		assert(page.includes("new DOMParser().parseFromString(block, 'text/html')"));
		assert(page.includes('renderTrainerDescription(chosen?.text ||'));
		assert(style.includes('.trainer-sheet-description-table-wrap { max-width: 100%; overflow-x: auto;'));
		assert(page.includes("event.key === 'Escape'"));
		assert(style.includes('.trainer-sheet-talent-popover { position: fixed;'));
		assert(style.includes('max-height: min(70vh, 560px); overflow-y: auto;'));
	});

	it('shows acquired kit, weapon and shield domains between talents and skills with descriptions', () => {
		assert(page.includes('new Set(sheet.proficiencies || [])'));
		assert(page.includes("'kit-medico': ['Kit Médico'"));
		assert(page.includes("'armas-ranged-exoticas': ['Armas Ranged Exóticas'"));
		assert(page.includes("escudos: ['Escudos'"));
		assert(page.includes('showTalentPopover(button, name, description)'));
		assert(page.includes("domainList.append(empty('Nenhum domínio adquirido.'))"));
		assert(style.includes('grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px;'));
		assert(style.includes('.trainer-sheet-domain-list { display: grid; grid-template-columns: minmax(0, 1fr); gap: 5px; }'));
		assert(style.includes('.trainer-sheet-knowledge-sections { grid-area: knowledge; display: grid; width: 100%; min-width: 0;'));
	});

	it('rolls initiative from the trainer sheet without changing its stat-card layout', () => {
		assert(page.includes("section('Iniciativa', 'trainer-sheet-panel trainer-sheet-primary-stat trainer-sheet-initiative')"));
		assert(page.includes("showRollPopover(roll, 'Iniciativa', 'initiative', '', character.id, api,"));
		assert(http.includes("'/api/rpg/trainer/initiative-roll'"));
		assert(http.includes('rollRPGTrainerInitiative(character.trainerSheet!'));
		assert(style.includes('.trainer-sheet-initiative-roll { position: absolute; inset: 0;'));
	});

	it('offers owned situational talents beside roll modes and sends their selection to the server', () => {
		assert(page.includes('progression.rollTalents'));
		assert(page.includes("el('div', 'trainer-sheet-roll-talents')"));
		assert(page.includes("item.setAttribute('aria-pressed', 'true')"));
		assert(!page.includes("input.type = 'checkbox'"));
		assert(page.includes('talents: [...selectedTalents]'));
		assert(http.includes('rpgResolveTrainerRollTalents(character.trainerSheet!'));
		assert(page.includes('/trainer/ally-roll-talents'));
		assert(http.includes('rpgTrainerRollBonusTerms('));
		assert(http.includes("talentEffects.chosen.map(talent => talent.name).join('\\n')"));
		assert(style.includes('.trainer-sheet-roll-content { display: flex;'));
		assert(style.includes(".trainer-sheet-roll-talent[aria-pressed='true'] { border-color: #e6ad22;"));
	});
	it('keeps the roll panel open while scrolling its situational talents', () => {
		assert(page.includes("function scroll(event) { if (!panel.contains(event.target)) close(); }"));
		assert(page.includes("window.addEventListener('scroll', scroll, true)"));
		assert(page.includes("window.removeEventListener('scroll', scroll, true)"));
		assert(style.includes('overflow-y: auto; overscroll-behavior: contain;'));
	});
	it('offers a server-backed Use action for Second Wind in its talent description', () => {
		assert(page.includes("['segundo-folego', 'sortudo', 'determinado', 'esforco-heroico'].includes(id)"));
		assert(page.includes("'/trainer/talents/use'"));
		assert(page.includes("'Usado neste descanso'"));
	});
	it('offers Lucky and Determined rerolls only while the last test remains eligible', () => {
		assert(page.includes("['segundo-folego', 'sortudo', 'determinado', 'esforco-heroico']"));
		assert(page.includes('progression.rerollAvailability?.[id]'));
		assert(page.includes("'/trainer/talents/reroll'"));
		assert(!page.includes('trainer-sheet-talent-confirm'));
		assert(!page.includes('failureConfirmed'));
	});
	it('prepares shared archives by proficiency slot, Knowledge area and recipient', () => {
		assert(page.includes("id === 'arqueologo:acervo-compartilhado'"));
		assert(page.includes("'/trainer/talents/shared-archive'"));
		assert(page.includes('progression.archiveRecipients'));
		assert(page.includes("sheet.skills?.trained || []"));
		assert(page.includes('Referências preparadas'));
	});
});
