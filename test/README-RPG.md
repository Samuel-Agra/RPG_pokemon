# Testes do RPG

No terminal do IntelliJ, execute a partir da raiz do projeto:

```sh
npm run test:rpg
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