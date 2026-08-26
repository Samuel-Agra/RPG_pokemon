# Testes do RPG

No Windows, execute a partir da raiz do projeto:

```sh
make test-rpg
```

O comando compila o projeto e executa todos os arquivos que correspondam a:

```text
test/**/rpg-*.js
```

Todo novo teste do módulo RPG deve usar o prefixo `rpg-` no nome do arquivo. Assim ele entra automaticamente no comando, sem alterar manualmente o `package.json`.

Exemplos:

- `test/server/rpg-bag-management.js`
- `test/server/rpg-box-management.js`
- `test/sim/rpg-showdown.js`

## Categorias

Use `make help` para consultar todos os comandos. Os principais grupos sao:

```sh
make test-rpg-core
make test-rpg-battle
make test-rpg-nursery
make test-rpg-shop
make test-rpg-inventory
make test-rpg-team
make test-rpg-fossil
make test-rpg-world
make test-rpg-ui
make test-rpg-server
make test-rpg-sim
```

Para iniciar o servidor RPG:

```sh
make rpg
```

Os alvos chamam Node, TypeScript e Mocha diretamente. `node` e `make` precisam
estar disponiveis no `PATH`. Depois de clonar ou migrar o projeto, use
`make install` uma vez para instalar as dependencias.
