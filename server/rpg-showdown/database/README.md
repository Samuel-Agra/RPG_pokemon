# Persistência MySQL do RPG

O servidor RPG usa o MySQL automaticamente quando encontra o arquivo
`.env.mysql` ou as variáveis `RPG_MYSQL_*`. Sem essa configuração, o modo de
arquivos continua disponível para testes e compatibilidade.

## Primeiro uso local

1. Copie `.env.mysql.example` para `.env.mysql` e defina senhas locais.
2. Execute `npm run db:rpg:up`.
3. Execute uma única vez `npm run db:rpg:import` para migrar os JSON existentes.
4. Inicie normalmente com `npm run rpg`.

O importador registra a migração no banco e ignora novas execuções. Isso
evita que arquivos antigos sobrescrevam dados atuais. Uma reimportação
intencional exige executar diretamente `import-json.js --force` e deve ser feita
somente depois de um backup.

Os dados do contêiner ficam no volume Docker `pokemon-rpg-mysql-data`. O volume,
as senhas de `.env.mysql` e os registros criados durante o jogo não fazem parte
do Git. O repositório guarda apenas o esquema, o código e o arquivo de exemplo.

## IntelliJ IDEA / DataGrip

Crie uma fonte de dados MySQL usando `127.0.0.1:3306`, o banco e o usuário
definidos em `.env.mysql`. Isso permite consultar e administrar o mesmo banco
iniciado pelo Docker sem executar um segundo servidor MySQL.
