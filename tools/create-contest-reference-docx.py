from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

from docx import Document
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / 'docs' / '.contest-reference-work' / 'catalog.json'
OUTPUT_PATH = ROOT / 'docs' / 'Sistema_de_Concursos_Pokemon_Regras_Moves_e_Combos.docx'

BLUE = '2E5B88'
DARK = '18324A'
MUTED = '5C6B78'
LIGHT = 'E8EEF5'
LIGHTER = 'F5F7FA'
WHITE = 'FFFFFF'
RED = '9B1C1C'

CATEGORY = {
    'beauty': 'Beleza', 'cute': 'Fofura', 'cool': 'Estilo',
    'smart': 'Inteligência', 'tough': 'Força',
}
BATTLE_CATEGORY = {'Physical': 'Físico', 'Special': 'Especial', 'Status': 'Status'}
ITEM_EXCLUSION = {
    'berry': 'Berry', 'breeding': 'item de procriação', 'not-equippable': 'não equipável',
    'not-useful': 'sem utilidade visual', 'unclassified': 'não classificado', None: 'elegível',
}


def set_font(run, name='Calibri', size=None, color=None, bold=None, italic=None):
    run.font.name = name
    run._element.get_or_add_rPr().rFonts.set(qn('w:ascii'), name)
    run._element.get_or_add_rPr().rFonts.set(qn('w:hAnsi'), name)
    if size is not None:
        run.font.size = Pt(size)
    if color:
        run.font.color.rgb = RGBColor.from_string(color)
    if bold is not None:
        run.bold = bold
    if italic is not None:
        run.italic = italic


def shade(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn('w:shd'))
    if shd is None:
        shd = OxmlElement('w:shd')
        tc_pr.append(shd)
    shd.set(qn('w:fill'), fill)


def set_cell_margins(cell, top=80, start=120, bottom=80, end=120):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in('w:tcMar')
    if tc_mar is None:
        tc_mar = OxmlElement('w:tcMar')
        tc_pr.append(tc_mar)
    for edge, value in [('top', top), ('start', start), ('bottom', bottom), ('end', end)]:
        node = tc_mar.find(qn(f'w:{edge}'))
        if node is None:
            node = OxmlElement(f'w:{edge}')
            tc_mar.append(node)
        node.set(qn('w:w'), str(value))
        node.set(qn('w:type'), 'dxa')


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    header = OxmlElement('w:tblHeader')
    header.set(qn('w:val'), 'true')
    tr_pr.append(header)


def set_table_geometry(table, widths_dxa, indent=120):
    table.autofit = False
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    tbl_pr = table._tbl.tblPr
    tbl_w = tbl_pr.first_child_found_in('w:tblW')
    if tbl_w is None:
        tbl_w = OxmlElement('w:tblW')
        tbl_pr.append(tbl_w)
    tbl_w.set(qn('w:w'), str(sum(widths_dxa)))
    tbl_w.set(qn('w:type'), 'dxa')
    tbl_ind = tbl_pr.first_child_found_in('w:tblInd')
    if tbl_ind is None:
        tbl_ind = OxmlElement('w:tblInd')
        tbl_pr.append(tbl_ind)
    tbl_ind.set(qn('w:w'), str(indent))
    tbl_ind.set(qn('w:type'), 'dxa')
    grid = table._tbl.tblGrid
    for child in list(grid):
        grid.remove(child)
    for width in widths_dxa:
        col = OxmlElement('w:gridCol')
        col.set(qn('w:w'), str(width))
        grid.append(col)
    for row in table.rows:
        for index, cell in enumerate(row.cells):
            width = widths_dxa[min(index, len(widths_dxa) - 1)]
            tc_w = cell._tc.get_or_add_tcPr().first_child_found_in('w:tcW')
            if tc_w is None:
                tc_w = OxmlElement('w:tcW')
                cell._tc.get_or_add_tcPr().append(tc_w)
            tc_w.set(qn('w:w'), str(width))
            tc_w.set(qn('w:type'), 'dxa')
            set_cell_margins(cell)


def add_page_field(paragraph):
    paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = paragraph.add_run('Página ')
    set_font(run, size=8, color=MUTED)
    fld_begin = OxmlElement('w:fldChar')
    fld_begin.set(qn('w:fldCharType'), 'begin')
    instr = OxmlElement('w:instrText')
    instr.set(qn('xml:space'), 'preserve')
    instr.text = ' PAGE '
    fld_end = OxmlElement('w:fldChar')
    fld_end.set(qn('w:fldCharType'), 'end')
    run._r.extend([fld_begin, instr, fld_end])


def setup_section(section, landscape=False):
    if landscape:
        section.orientation = WD_ORIENT.LANDSCAPE
        section.page_width = Inches(11)
        section.page_height = Inches(8.5)
        section.top_margin = Inches(.45)
        section.bottom_margin = Inches(.45)
        section.left_margin = Inches(.45)
        section.right_margin = Inches(.45)
    else:
        section.page_width = Inches(8.5)
        section.page_height = Inches(11)
        section.top_margin = Inches(.75)
        section.bottom_margin = Inches(.7)
        section.left_margin = Inches(.8)
        section.right_margin = Inches(.8)
    section.header_distance = Inches(.35)
    section.footer_distance = Inches(.35)
    header = section.header
    p = header.paragraphs[0]
    p.text = 'SISTEMA DE CONCURSOS POKÉMON  |  REFERÊNCIA TÉCNICA'
    set_font(p.runs[0], size=8, color=MUTED, bold=True)
    add_page_field(section.footer.paragraphs[0])


def add_heading(doc, text, level=1):
    return doc.add_paragraph(text, style=f'Heading {level}')


def add_bullets(doc, items):
    for item in items:
        p = doc.add_paragraph(style='List Bullet')
        p.add_run(item)


def add_numbered(doc, items):
    for item in items:
        p = doc.add_paragraph(style='List Number')
        p.add_run(item)


def add_callout(doc, title, text, color=BLUE):
    table = doc.add_table(rows=1, cols=1)
    set_table_geometry(table, [9360])
    cell = table.cell(0, 0)
    shade(cell, LIGHTER)
    p = cell.paragraphs[0]
    r = p.add_run(f'{title}: ')
    set_font(r, bold=True, color=color)
    p.add_run(text)
    set_repeat_table_header(table.rows[0])
    doc.add_paragraph().paragraph_format.space_after = Pt(0)


def add_rule_table(doc, rows):
    table = doc.add_table(rows=1, cols=2)
    table.style = 'Table Grid'
    table.rows[0].cells[0].text = 'Regra'
    table.rows[0].cells[1].text = 'Aplicação atual'
    for cell in table.rows[0].cells:
        shade(cell, LIGHT)
        for run in cell.paragraphs[0].runs:
            set_font(run, bold=True, color=DARK)
    for label, detail in rows:
        cells = table.add_row().cells
        cells[0].text = label
        cells[1].text = detail
        cells[0].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        cells[1].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    set_repeat_table_header(table.rows[0])
    set_table_geometry(table, [2700, 6660])
    return table


def style_document(doc):
    styles = doc.styles
    normal = styles['Normal']
    normal.font.name = 'Calibri'
    normal._element.rPr.rFonts.set(qn('w:ascii'), 'Calibri')
    normal._element.rPr.rFonts.set(qn('w:hAnsi'), 'Calibri')
    normal.font.size = Pt(10.5)
    normal.paragraph_format.space_before = Pt(0)
    normal.paragraph_format.space_after = Pt(5)
    normal.paragraph_format.line_spacing = 1.18
    heading_tokens = {
        1: (16, 18, 10, BLUE),
        2: (13, 14, 7, BLUE),
        3: (12, 10, 5, DARK),
    }
    for level, (size, before, after, color) in heading_tokens.items():
        style = styles[f'Heading {level}']
        style.font.name = 'Calibri'
        style._element.rPr.rFonts.set(qn('w:ascii'), 'Calibri')
        style._element.rPr.rFonts.set(qn('w:hAnsi'), 'Calibri')
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor.from_string(color)
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True
    for name in ['List Bullet', 'List Number']:
        style = styles[name]
        style.font.name = 'Calibri'
        style.font.size = Pt(10.5)
        style.paragraph_format.left_indent = Inches(.375)
        style.paragraph_format.first_line_indent = Inches(-.188)
        style.paragraph_format.space_after = Pt(4)
        style.paragraph_format.line_spacing = 1.18


def build_document(data):
    doc = Document()
    style_document(doc)
    setup_section(doc.sections[0], landscape=False)

    # Editorial-cover-inspired first page, kept compact for a technical reference.
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(72)
    p.paragraph_format.space_after = Pt(10)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run('GUIA DE REFERÊNCIA')
    set_font(r, size=10, bold=True, color=BLUE)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(8)
    r = p.add_run('Sistema de Concursos Pokémon')
    set_font(r, size=27, bold=True, color=DARK)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(28)
    r = p.add_run('Regras completas, catálogo de moves e combos implementados')
    set_font(r, size=13, color=MUTED)
    add_callout(doc, 'Escopo desta edição',
                f"Documento gerado do código atual do projeto. Contém {len(data['moves'])} moves, "
                f"{len(data['combos'])} combos e as regras funcionais e mecânicas vigentes.")
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(80)
    r = p.add_run('Atualizado em 29 de agosto de 2026')
    set_font(r, size=10, color=MUTED, italic=True)
    doc.add_page_break()

    add_heading(doc, 'Como consultar este documento', 1)
    add_bullets(doc, [
        'As regras são descritas conforme o comportamento atualmente implementado no servidor e na interface.',
        'Os nomes próprios de moves e os tipos Pokémon permanecem na nomenclatura consolidada; explicações e regras estão em português.',
        'No catálogo, “Pontos” é a pontuação-base do move no concurso, antes de combos, cenário, itens, julgamento e penalidades.',
        'Tags são marcadores visuais e interpretativos usados para continuidade, sinergias, finale, cenário e descoberta de interações.',
        '“Altera palco” indica que o move pode criar clima, terreno ou uma transformação visual temporária.',
    ])
    add_heading(doc, 'Sumário', 1)
    add_numbered(doc, [
        'Estrutura e preparação do concurso', 'Participação, convites e Pokémon', 'Execução das apresentações',
        'Cálculo da pontuação', 'Palco, cenário e transformações', 'Itens equipados e Mega Evolução',
        'Julgamento, reação do público e resultados', 'NPCs temporários', 'Combos implementados',
        'Relações visuais entre tags', 'Catálogo completo de moves',
    ])

    add_heading(doc, '1. Estrutura e preparação do concurso', 1)
    add_rule_table(doc, [
        ('Formato disponível', 'Solo. Duo e trio não estão habilitados nesta implementação.'),
        ('Participantes', 'Mínimo de 2 e máximo de 10 participantes, entre Players e NPCs.'),
        ('Categorias', 'Beleza, Fofura, Estilo, Inteligência e Força.'),
        ('Ranks', 'Normal, Great, Super, Hyper e Master.'),
        ('Rodadas', 'Duas rodadas completas. Todos apresentam a primeira rodada; depois todos apresentam a segunda.'),
        ('Sequência', 'A ordem de apresentação é definida aleatoriamente pelo sistema ao iniciar.'),
        ('Moves por rodada', 'Exatamente três moves, escolhidos um por vez durante a apresentação.'),
        ('Cenários disponíveis', 'Salão clássico, porto ao pôr do sol, arena neon, clareira encantada, praça de festival e mirante nevado.'),
        ('Exclusividade', 'Somente um concurso pode permanecer ativo ao mesmo tempo.'),
        ('Cancelamento', 'Permitido antes do início; após iniciar, finalizar ou cancelar, não pode ser cancelado novamente.'),
    ])

    add_heading(doc, '2. Participação, convites e Pokémon', 1)
    add_bullets(doc, [
        'O Mestre cria o concurso, escolhe formato, categoria, rank, cenário e participantes, e então envia os convites.',
        'Cada Player escolhe exatamente um Pokémon da própria equipe antes de aceitar. A seleção é confirmada junto com o aceite; não existe uma etapa separada de “Salvar seleção”.',
        'Pokémon desmaiado (HP igual ou menor que zero) não pode ser inscrito e precisa ser revivido antes.',
        'Pokémon indisponível por outra regra do RPG também não pode ser selecionado.',
        'HP e status existentes acompanham o Pokémon para a apresentação. Confusão não faz parte do modelo atual do concurso.',
        'Habilidade, XP, natureza e amizade não acrescentam pontos diretamente no cálculo atual; a habilidade não é selecionada no editor de NPC temporário do concurso.',
        'Se qualquer convidado recusar, a sessão passa ao estado recusado e pode ser editada novamente pelo Mestre.',
        'Um mesmo Player não pode participar duas vezes do mesmo concurso.',
        'Todo NPC precisa ter exatamente um Pokémon configurado, com pelo menos um e no máximo quatro moves.',
        'O participante que abandonar é desclassificado e não pode retornar ao concurso.',
    ])

    add_heading(doc, '3. Execução das apresentações', 1)
    add_bullets(doc, [
        'Cada participante realiza três moves na primeira rodada e três na segunda rodada.',
        'As escolhas não são secretas: a apresentação e os moves realizados ficam visíveis aos demais participantes.',
        'Players controlam o próprio Pokémon; o Mestre controla os NPCs e registra o julgamento ao término de cada apresentação.',
        'Os moves do Pokémon podem ser alterados antes de ele usar o primeiro move do concurso, inclusive por TM. Após o primeiro move, a lista fica congelada até o fim.',
        'Clima, terreno e transformações criadas por um participante valem apenas para a rodada dele. A base definida pelo cenário permanece.',
        'A sequência dos três moves importa: relações entre o primeiro e o segundo, entre o segundo e o terceiro e a preparação do finale são calculadas separadamente.',
        'A Mega Evolução, quando permitida pelo item equipado, acontece junto com um move, não consome turno e não reduz os três moves disponíveis.',
        'Durante a apresentação de um NPC, o Mestre pode desclassificar somente aquele NPC. Os demais participantes continuam normalmente.',
        'Se as desistências deixarem apenas um participante ativo, o concurso termina imediatamente com a vitória dele. Esse encerramento antecipado não concede ganho de Performance.',
    ])

    add_heading(doc, '4. Cálculo da pontuação', 1)
    add_callout(doc, 'Fórmula da rodada',
                'Pontuação mecânica + interpretação do Mestre + correção mecânica + penalidade por cópia. '
                'A repetição dentro da rodada é aplicada sobre o total mecânico, inclusive bônus de item; na segunda rodada também entram criatividade e repetição entre rodadas.')
    add_heading(doc, '4.1 Pontuação mecânica dos moves', 2)
    add_rule_table(doc, [
        ('Pontos-base', 'Soma dos pontos-base dos três moves. Cada move varia de -4 a 8 pontos.'),
        ('Continuidade', '2 pontos se os moves 1→2 compartilham tag ou relação; 2 para 2→3; +1 se ambos os pares possuem relação. Máximo: 5.'),
        ('Sinergia de tags', '1 por tag visual compartilhada única e 2 por relação visual descoberta. Máximo: 6.'),
        ('Finale', 'Avalia quantas ligações o terceiro move possui com a preparação anterior e acrescenta destaque para tags grand, explosion ou dance. Máximo: 4.'),
        ('Combo especial', 'Reconhece sequência exata de três moves cadastrada. Usa o maior bônus encontrado. Máximo: 6.'),
        ('Pontuação de combo', 'Continuidade + sinergia + finale + combo especial, limitada a 15.'),
        ('Interação com palco', 'Cada move pode gerar até 5 pontos por relações com o ambiente; a soma da rodada é limitada a 5.'),
        ('Afinidade com cenário', 'Cada move recebe 1 quando alguma tag combina diretamente com as tags-base do cenário. Máximo da rodada: 3.'),
        ('Item comum', 'Bônus de 1 a 3 somente quando a categoria do item coincide com a categoria do concurso e a condição do item foi cumprida.'),
        ('Item de Teralização', '+5 quando pelo menos dois dos três moves usados na rodada possuem o mesmo tipo indicado pelo item. Não possui efeito em combate.'),
    ])
    add_heading(doc, '4.2 Repetição dentro da mesma rodada', 2)
    add_rule_table(doc, [
        ('Três moves diferentes', 'Sem penalidade de repetição.'),
        ('Um move usado duas vezes', 'Redução de 40% do total mecânico da rodada.'),
        ('Um move usado três vezes', 'Redução de 100%; a pontuação mecânica da rodada torna-se zero.'),
    ])
    add_heading(doc, '4.3 Criatividade e repetição na segunda rodada', 2)
    add_rule_table(doc, [
        ('Bônus por novidade', '+4 se a segunda rodada não repetir os três moves da primeira; zero quando repete todos.'),
        ('Originalidade', '4 pontos com 0 repetidos; 3 com 1; 2 com 2; 1 quando os três reaparecem em outra ordem; 0 para sequência idêntica.'),
        ('Interações inventivas', '2 pontos por interação descoberta, até 4.'),
        ('Sequência idêntica', 'Penalidade de 100% sobre o total após os bônus de criatividade.'),
        ('Mesmo conjunto, outra ordem', 'Penalidade de 50%.'),
        ('Dois ou mais repetidos e dois nas mesmas posições', 'Penalidade de 25%.'),
        ('Dois ou mais repetidos em outras posições', 'Penalidade de 15%.'),
    ])

    add_heading(doc, '5. Palco, cenário e transformações', 1)
    add_bullets(doc, [
        'O cenário define uma camada-base permanente com tags, clima e terreno opcionais.',
        'Moves podem criar clima temporário (sun, rain, sand ou snow), terreno temporário (electric, grassy, psychic ou misty) e elementos visuais no palco.',
        'A transformação é aplicada no instante em que o move é usado e pode afetar os moves seguintes daquela rodada.',
        'Ao mudar de participante ou de rodada, efeitos temporários são descartados; a camada-base do cenário é recriada.',
        'Se um participante combina com o cenário nas duas rodadas, recebe 2 pontos adicionais de coerência de cenário no resultado final.',
        'Além de clima e Terrain, Surf, Earthquake, Rock Slide, Blizzard, Leaf Storm, Smokescreen, Mist, Haze, Whirlpool e Fire Spin deixam transformações temporárias no palco.',
        'Spikes, Toxic Spikes, Stealth Rock, Sticky Web e Sandsear Storm também deixam elementos temporários concretos, como espinhos, veneno, rochas, teias e areia aquecida.',
        'Defog remove clima, Terrain e elementos temporários criados pelo participante na rodada, mas preserva integralmente a camada-base do cenário.',
    ])
    add_rule_table(doc, [
        ('Spikes', 'Espinhos metálicos e superfície cortante.'),
        ('Toxic Spikes', 'Espinhos venenosos e palco contaminado.'),
        ('Stealth Rock', 'Rochas, detritos e pedras suspensas.'),
        ('Sticky Web', 'Teias e fios aderentes espalhados pelo palco.'),
        ('Sandsear Storm', 'Vento, areia aquecida e vórtice de areia.'),
        ('Defog', 'Limpa as transformações temporárias e deixa o ar do palco nítido.'),
    ])

    add_heading(doc, '6. Itens equipados e Mega Evolução', 1)
    eligible = [item for item in data['items'] if item['canScore']]
    excluded = [item for item in data['items'] if not item['canScore']]
    category_counts = Counter(
        'Teralização' if item.get('scoringMode') == 'tera-matching-moves' else
        CATEGORY.get(item['category'], item['category'])
        for item in eligible
    )
    point_counts = Counter(item['points'] for item in eligible)
    exclusion_counts = Counter(ITEM_EXCLUSION.get(item['exclusionReason'], item['exclusionReason']) for item in excluded)
    add_bullets(doc, [
        'A classificação considera a aparência e o potencial visual/interpretativo do item, não o efeito que ele possui em batalha.',
        'Berries, itens de procriação, itens não equipáveis e itens classificados como sem utilidade visual não pontuam e não aparecem no seletor do NPC de concurso.',
        'Itens elegíveis são distribuídos entre Beleza, Fofura, Estilo, Inteligência e Força e valem 1, 2 ou 3 pontos.',
        'O simples fato de estar equipado concede o bônus, desde que a categoria coincida com o concurso.',
        'Todas as Mega Stones contam como uma única unidade de balanceamento, pertencem a Força, valem 2 pontos e só pontuam se a Mega Evolução for ativada.',
        'Itens de Teralização são exclusivos de concursos. Cada um representa um tipo e concede 5 pontos quando pelo menos dois dos três moves da rodada correspondem a esse tipo.',
        f"Catálogo atual: {len(eligible)} itens elegíveis e {len(excluded)} não elegíveis.",
        'Elegíveis por categoria: ' + '; '.join(f'{name}: {count}' for name, count in sorted(category_counts.items())),
        'Elegíveis por valor: ' + '; '.join(f'{points} ponto(s): {count}' for points, count in sorted(point_counts.items())),
        'Exclusões: ' + '; '.join(f'{reason}: {count}' for reason, count in sorted(exclusion_counts.items())),
    ])

    add_heading(doc, '7. Julgamento, reação do público e resultados', 1)
    add_heading(doc, '7.1 Critérios do Mestre', 2)
    add_rule_table(doc, [
        ('Composição visual', 'Aparência, harmonia e resultado visual conjunto de Treinador, Pokémon e apresentação.'),
        ('Continuidade da sequência', 'Como os três moves se conectam e formam uma apresentação coerente.'),
        ('Uso do palco e do cenário', 'Aproveitamento, transformação e integração com o ambiente.'),
        ('Sincronia entre Treinador e Pokémon', 'Coordenação interpretativa da dupla durante a apresentação.'),
        ('Interpretação e encerramento', 'Expressividade e qualidade do estado final da rodada, incluindo o finale.'),
    ])
    add_bullets(doc, [
        'Cada critério recebe nota inteira de -1 a 5 ao final da rodada de cada participante.',
        'A soma bruta dos cinco critérios pode variar de -5 a 25. Se for negativa, entra diretamente; caso contrário, é convertida proporcionalmente para uma escala de 0 a 10.',
        'O Mestre pode aplicar correção mecânica inteira de -10 a +10; qualquer valor diferente de zero exige justificativa.',
        'A penalidade por cópia pode ser 0, -3, -6, -10, -15 ou -20; qualquer penalidade exige justificativa.',
        'Comentários e justificativas aceitam até 500 caracteres.',
    ])
    add_heading(doc, '7.2 Reação do público', 2)
    add_rule_table(doc, [
        ('Menos de 12', 'Nível 1 — silêncio ou desconforto.'),
        ('12 a 21,9', 'Nível 2 — aplausos discretos.'),
        ('22 a 32,9', 'Nível 3 — público animado.'),
        ('33 a 42,9', 'Nível 4 — grande entusiasmo.'),
        ('43 a 52,9', 'Nível 5 — público em êxtase.'),
        ('53 ou mais', 'Nível 6 — reação histórica.'),
    ])
    add_bullets(doc, [
        'Comentários automáticos destacam combo reconhecido, transformação relevante do palco e bom uso do cenário; o comentário do Mestre também pode ser exibido.',
        'A reação e os comentários são visíveis aos Players. Durante o concurso, as notas detalhadas e a pontuação mecânica permanecem restritas ao Mestre.',
        'Na tela final, os Players recebem colocação, nota final, participantes e Pokémon, reação do público e destaques, mas não recebem a decomposição das notas e dos cálculos.',
    ])
    add_heading(doc, '7.3 Classificação e Performance', 2)
    add_bullets(doc, [
        'Total final = totais julgados das duas rodadas + 2 de coerência de cenário (quando aplicável) + bônus de Performance.',
        'Empates conservam a mesma colocação.',
        'Em um encerramento normal, todo participante não desclassificado ganha 2 pontos de Performance; o 1º recebe +5, o 2º +3 e o 3º +2.',
        'Performance varia de 0 a 100 e concede bônus igual ao valor inteiro de Performance dividido por 5, limitado a 20.',
        'Performance pertence à parceria Pokémon–Treinador. Ao mudar de treinador, é tratada como zero para a nova parceria.',
        'Desclassificados não recebem colocação, total nem ganho de Performance.',
        'Quando o concurso termina antecipadamente porque restou somente um participante ativo, nenhum participante recebe ganho de Performance.',
    ])

    add_heading(doc, '8. NPCs temporários', 1)
    add_bullets(doc, [
        'O Mestre pode criar manualmente um NPC temporário escolhendo sprite de treinador, nome, Pokémon, gênero compatível, level, HP, status, item e até quatro moves legais.',
        'O seletor de moves reúne level-up, TM, Egg Move e moves herdados de evoluções anteriores sem separar a forma de aquisição.',
        'NPC aleatório usa automaticamente a categoria e o rank escolhidos no concurso.',
        'Ranks de NPC aleatório: Normal level 20; Great 35; Super 50; Hyper 70; Master 90.',
        'Ranks superiores escolhem moves e itens progressivamente mais adequados à categoria, aumentando o potencial de pontuação sem garantir um resultado fixo.',
        'NPCs são controlados pelo Mestre durante a apresentação.',
    ])

    add_heading(doc, '9. Ciclo de vida e atualização', 1)
    add_bullets(doc, [
        'Convites, respostas, seleções e mudanças pré-concurso são atualizados automaticamente sem recarregar a página, sem piscar e sem deslocar a rolagem.',
        'Durante a apresentação, o estado só é redesenhado quando o conteúdo realmente muda, preservando seletores e notas em edição.',
        'Ao finalizar, o resultado permanece disponível na tela até o usuário encerrar.',
        'A música de fundo toca durante a apresentação e é encerrada ao abrir o resultado pós-concurso.',
        'As animações dos moves seguem a ordem dos eventos; o nome do move aparece em tipografia expressiva e os efeitos sonoros correspondem aos usados no combate.',
        'As reações do público possuem seis intensidades progressivas, com animação e áudio correspondentes.',
        'Memórias de concursos encerrados expiram após uma hora; no máximo 50 runtimes encerrados são mantidos simultaneamente.',
        'A sessão persistente registra início, término e cancelamento separadamente.',
    ])

    add_heading(doc, '10. Combos implementados', 1)
    add_callout(doc, 'Regra de reconhecimento',
                'Um combo exige a sequência exata dos três moves. Se mais de um combo coincidir, usa-se o maior bônus, limitado a 6. '
                'Combos-padrão não podem ser excluídos; o Mestre pode cadastrar combos próprios com bônus inteiro entre 1 e 6.')
    combo_table = doc.add_table(rows=1, cols=5)
    combo_table.style = 'Table Grid'
    headers = ['Combo', 'Move 1', 'Move 2', 'Move 3', 'Bônus']
    for cell, value in zip(combo_table.rows[0].cells, headers):
        cell.text = value
        shade(cell, LIGHT)
        for run in cell.paragraphs[0].runs:
            set_font(run, bold=True, color=DARK)
    move_names = {move['moveId']: move['name'] for move in data['moves']}
    for combo in data['combos']:
        cells = combo_table.add_row().cells
        values = [combo['name'], *(move_names.get(move, move) for move in combo['sequence']), f"+{combo['bonus']}"]
        for cell, value in zip(cells, values):
            cell.text = str(value)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    set_repeat_table_header(combo_table.rows[0])
    set_table_geometry(combo_table, [2340, 1800, 1800, 1800, 1620])
    custom_count = sum(1 for combo in data['combos'] if combo.get('source') == 'master')
    doc.add_paragraph(f"Combos listados: {len(data['combos'])} ({len(data['combos']) - custom_count} padrão e {custom_count} criados pelo Mestre).")

    add_heading(doc, '11. Relações visuais entre tags', 1)
    relations = [
        ('rain + fire', 'steam'), ('rain + light', 'rainbow'), ('water + ice', 'frozen-water'),
        ('water + light', 'reflection'), ('water + electric', 'charged-water'), ('water + plant', 'growth'),
        ('fire + light', 'brilliance'), ('fire + smoke', 'ember-cloud'), ('fire + wind', 'firestorm'),
        ('sun + plant', 'bloom'), ('sun + light', 'radiance'), ('snow + light', 'aurora'),
        ('ice + light', 'crystal'), ('ice + rock', 'sculpture'), ('sand + wind', 'sand-dance'),
        ('rock + psychic', 'levitation'), ('metal + electric', 'sparks'), ('metal + light', 'reflection'),
        ('mist + moon', 'mystic-moon'), ('mist + light', 'diffused-light'), ('shadow + light', 'contrast'),
        ('flower + dance', 'flower-dance'), ('sound + dance', 'musical-dance'), ('sound + wave', 'resonance'),
        ('healing + light', 'renewal'), ('ground + plant', 'new-growth'), ('smoke + light', 'spotlight'),
        ('spikes + psychic', 'espinhos metálicos levitando'),
        ('toxic-stage + light', 'brilho sobre o veneno'),
        ('floating-rocks + wind', 'rochas girando pelo palco'),
        ('web + wind', 'teias suspensas no ar'),
        ('heated-sand + fire', 'areia incandescente'),
        ('clear-air + light', 'palco iluminado com nitidez'),
    ]
    relation_table = doc.add_table(rows=1, cols=2)
    relation_table.style = 'Table Grid'
    relation_table.rows[0].cells[0].text = 'Tags combinadas'
    relation_table.rows[0].cells[1].text = 'Interação descoberta'
    for cell in relation_table.rows[0].cells:
        shade(cell, LIGHT)
        for run in cell.paragraphs[0].runs:
            set_font(run, bold=True, color=DARK)
    for pair, result in relations:
        cells = relation_table.add_row().cells
        cells[0].text = pair
        cells[1].text = result
    set_repeat_table_header(relation_table.rows[0])
    set_table_geometry(relation_table, [4680, 4680])

    # Landscape appendix for the full move catalog.
    section = doc.add_section(WD_SECTION.NEW_PAGE)
    setup_section(section, landscape=True)
    add_heading(doc, '12. Catálogo completo de moves', 1)
    counts = Counter(CATEGORY[move['category']] for move in data['moves'])
    score_min = min(move['baseScore'] for move in data['moves'])
    score_max = max(move['baseScore'] for move in data['moves'])
    doc.add_paragraph(
        f"{len(data['moves'])} moves oficiais disponíveis na geração 9, excluindo CAP, Custom e Future. "
        f"Faixa de pontos-base: {score_min} a {score_max}. " +
        'Distribuição: ' + '; '.join(f'{category}: {count}' for category, count in sorted(counts.items())) + '.'
    )
    add_callout(doc, 'Leitura da tabela',
                'Precisão “—” significa que o move não usa uma checagem numérica de precisão. Poder “—” indica move de Status. '
                'Penalidades atuais incluem recoil e self-ko quando aplicável.')

    widths = [1500, 720, 720, 900, 420, 520, 500, 380, 500, 3400, 3740]
    table = doc.add_table(rows=1, cols=len(widths))
    table.style = 'Table Grid'
    headers = ['Move', 'Tipo', 'Batalha', 'Concurso', 'Pts', 'Poder', 'Prec.', 'PP', 'Palco', 'Tags / penalidades', 'Descrição']
    for cell, value in zip(table.rows[0].cells, headers):
        cell.text = value
        shade(cell, BLUE)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for run in p.runs:
            set_font(run, size=7, bold=True, color=WHITE)
    set_repeat_table_header(table.rows[0])

    for index, move in enumerate(data['moves']):
        cells = table.add_row().cells
        penalties = ', '.join(move['penalties']) if move['penalties'] else 'nenhuma'
        tags_penalties = ', '.join(move['tags']) + f"\nPenalidades: {penalties}"
        values = [
            move['name'], move['type'], BATTLE_CATEGORY.get(move['battleCategory'], move['battleCategory']),
            CATEGORY[move['category']], str(move['baseScore']),
            '—' if move['basePower'] is None else str(move['basePower']),
            '—' if move['accuracy'] is None else f"{move['accuracy']}%", str(move['pp']),
            'Sim' if move['changesField'] else 'Não', tags_penalties, move['description'] or 'Sem descrição.',
        ]
        for column, (cell, value) in enumerate(zip(cells, values)):
            cell.text = str(value)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            if index % 2:
                shade(cell, LIGHTER)
            for paragraph in cell.paragraphs:
                paragraph.paragraph_format.space_before = Pt(0)
                paragraph.paragraph_format.space_after = Pt(0)
                paragraph.paragraph_format.line_spacing = 1.0
                paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT if column in [0, 9, 10] else WD_ALIGN_PARAGRAPH.CENTER
                for run in paragraph.runs:
                    set_font(run, size=6.5, color=DARK, bold=(column == 0))
    set_table_geometry(table, widths)

    # Metadata and properties.
    props = doc.core_properties
    props.title = 'Sistema de Concursos Pokémon — Regras, Moves e Combos'
    props.subject = 'Referência técnica e funcional do concurso do RPG Pokémon'
    props.author = 'Projeto RPG Pokémon'
    props.keywords = 'Pokémon, concurso, moves, combos, regras, RPG'
    props.comments = 'Gerado automaticamente a partir do catálogo e das regras implementadas no projeto.'
    return doc


def main():
    data = json.loads(DATA_PATH.read_text(encoding='utf-8'))
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    doc = build_document(data)
    doc.save(OUTPUT_PATH)
    print(f'created={OUTPUT_PATH}')
    print(f"moves={len(data['moves'])} combos={len(data['combos'])} items={len(data['items'])}")


if __name__ == '__main__':
    main()
