# Comandos de desenvolvimento do Pokemon RPG.
#
# O Makefile chama os executaveis JavaScript diretamente para evitar as
# diferencas de resolucao dos scripts `npm run` entre Linux e Windows.

NODE ?= node
NPM ?= npm
MOCHA := $(NODE) node_modules/mocha/bin/mocha.js
TSC := $(NODE) node_modules/typescript/bin/tsc
RPG_TIMEOUT ?= 20000
MOCHA_RPG := $(MOCHA) --no-config --no-package --timeout $(RPG_TIMEOUT)

.DEFAULT_GOAL := help

.PHONY: help install build typecheck lint-rpg rpg db-up db-down db-import db-status \
	test-rpg test-rpg-server test-rpg-sim test-rpg-core test-rpg-battle \
	test-rpg-nursery test-rpg-shop test-rpg-inventory test-rpg-team \
	test-rpg-fossil test-rpg-world test-rpg-ui

help:
	@echo.
	@echo ================================================================
	@echo                         POKEMON RPG
	@echo ================================================================
	@echo.
	@echo Uso: make COMANDO
	@echo Exemplo: make test-rpg-battle
	@echo.
	@echo PRIMEIROS PASSOS
	@echo   install              Instala as dependencias do projeto
	@echo   rpg                  Compila e inicia o servidor e a interface RPG
	@echo   db-up                Inicia o MySQL local do RPG
	@echo   db-down              Encerra o MySQL local sem apagar os dados
	@echo   db-import            Importa os arquivos JSON atuais para o MySQL
	@echo   db-status            Mostra a saude do MySQL local
	@echo.
	@echo COMPILACAO E VALIDACAO
	@echo   build                Compila o projeto
	@echo   typecheck            Verifica os tipos TypeScript
	@echo   lint-rpg             Verifica apenas os arquivos do RPG
	@echo   test-rpg             Compila e executa todos os testes RPG
	@echo.
	@echo TESTES POR CAMADA
	@echo   test-rpg-server      Camada de servidor
	@echo   test-rpg-sim         Simulador e regras de batalha
	@echo   test-rpg-core        Integracao principal, HTTP e recursos base
	@echo.
	@echo TESTES POR FUNCIONALIDADE
	@echo   test-rpg-battle      Batalhas, selecao, audio e encontros selvagens
	@echo   test-rpg-nursery     Bercario, reproducao e incubacao
	@echo   test-rpg-shop        Loja e transacoes comerciais
	@echo   test-rpg-inventory   Bag, itens equipados, icones e TMs
	@echo   test-rpg-team        Team Builder e Box
	@echo   test-rpg-fossil      Itens e laboratorio de fosseis
	@echo   test-rpg-world       Centro Pokemon, campanha e mundo
	@echo   test-rpg-ui          Interfaces web do RPG
	@echo.
	@echo OPCOES AVANCADAS
	@echo   NODE=caminho         Define o executavel do Node.js
	@echo   NPM=caminho          Define o executavel do npm
	@echo   RPG_TIMEOUT=20000    Altera o limite dos testes em milissegundos
	@echo.
	@echo Exemplo com opcoes:
	@echo   make test-rpg-battle RPG_TIMEOUT=20000
	@echo ================================================================

install:
	$(NPM) ci

build:
	$(NODE) build

typecheck:
	$(TSC) --pretty

lint-rpg:
	$(NPM) run lint:rpg

rpg: build
	$(NODE) server/rpg-showdown/start.js

db-up:
	$(NPM) run db:rpg:up

db-down:
	$(NPM) run db:rpg:down

db-import:
	$(NPM) run db:rpg:import

db-status:
	$(NPM) run db:rpg:status

test-rpg: build
	$(MOCHA_RPG) "test/server/rpg-*.js"
	$(MOCHA_RPG) "test/sim/rpg-*.js"

test-rpg-server: build
	$(MOCHA_RPG) "test/server/rpg-*.js"

test-rpg-sim: build
	$(MOCHA_RPG) "test/sim/rpg-*.js"

test-rpg-core: build
	$(MOCHA_RPG) test/server/rpg-showdown.js test/server/rpg-showdown-http.js test/server/rpg-showdown-avatars.js test/server/rpg-ability-descriptions.js test/server/rpg-animation-vendor.js test/server/rpg-shiny-sprites.js test/sim/rpg-showdown.js test/sim/rpg-showdown-effects.js

test-rpg-battle: build
	$(MOCHA_RPG) "test/server/rpg-battle-*.js" test/server/rpg-entry-hazards.js test/server/rpg-wild-held-items.js test/server/rpg-wild-moves.js

test-rpg-nursery: build
	$(MOCHA_RPG) "test/server/rpg-nursery*.js" test/server/rpg-incubation.js test/sim/rpg-breeding.js

test-rpg-shop: build
	$(MOCHA_RPG) "test/server/rpg-shop-*.js"

test-rpg-inventory: build
	$(MOCHA_RPG) "test/server/rpg-bag-*.js" test/server/rpg-held-items.js test/server/rpg-item-icons.js test/server/rpg-tms.js

test-rpg-team: build
	$(MOCHA_RPG) "test/server/rpg-team-builder-*.js" test/server/rpg-box-management.js

test-rpg-fossil: build
	$(MOCHA_RPG) "test/server/rpg-fossil-*.js"

test-rpg-world: build
	$(MOCHA_RPG) test/server/rpg-campaign-time-ui.js test/server/rpg-entry-hazards.js test/server/rpg-pokemon-center-ui.js test/server/rpg-wild-held-items.js test/server/rpg-wild-moves.js

test-rpg-ui: build
	$(MOCHA_RPG) "test/server/rpg-*-ui.js" test/server/rpg-battle-audio.js test/server/rpg-item-icons.js test/server/rpg-shiny-sprites.js
