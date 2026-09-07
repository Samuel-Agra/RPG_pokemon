# Persistência MySQL do RPG

O servidor RPG usa o MySQL automaticamente quando encontra o arquivo
`.env.mysql` ou as variáveis `RPG_MYSQL_*`. Sem essa configuração, o modo de
arquivos continua disponível para testes e compatibilidade.

## Primeiro uso local

1. Copie `.env.mysql.example` para `.env.mysql` e defina senhas locais.
2. Execute `npm run db:rpg:up`.
3. Inicie uma vez com `npm run rpg` para aplicar todas as migrações do esquema.
4. Somente se ainda houver dados JSON antigos, encerre o servidor e execute uma
   única vez `npm run db:rpg:import`.
5. Inicie normalmente com `npm run rpg`.

O importador registra a migração no banco e ignora novas execuções. Isso
evita que arquivos antigos sobrescrevam dados atuais. Uma reimportação
intencional exige executar diretamente `import-json.js --force` e deve ser feita
somente depois de um backup.

Os dados trazidos da versão 1 são colocados na `Mesa principal`. Todas as tabelas
de conteúdo usam `table_id` obrigatório e chave primária composta pela mesa, de
modo que personagens, batalhas, concursos e demais registros com o mesmo ID
possam coexistir em mesas diferentes sem mistura ou sobrescrita.

## Segurança das contas

Ao criar uma conta pela API da versão 2, o servidor entrega dez códigos de
recuperação uma única vez. Guarde-os fora do projeto: o MySQL armazena somente o
hash de cada código. Um código usado é invalidado, a troca de senha revoga todas
as sessões abertas e uma nova geração invalida os códigos anteriores.

O login limita tentativas por combinação de usuário e origem em uma janela de
15 minutos. Após cinco falhas, novas tentativas ficam bloqueadas por 15 minutos.
Ações administrativas de mesas — criação, convites, alteração de função,
remoção e bloqueio de membros — são registradas em um histórico imutável por
mesa, visível somente para quem possui permissão de administração de membros.

Os dados do contêiner ficam no volume Docker `pokemon-rpg-mysql-data`. O volume,
as senhas de `.env.mysql` e os registros criados durante o jogo não fazem parte
do Git. O repositório guarda apenas o esquema, o código e o arquivo de exemplo.

## IntelliJ IDEA / DataGrip

Crie uma fonte de dados MySQL usando `127.0.0.1:3306`, o banco e o usuário
definidos em `.env.mysql`. Isso permite consultar e administrar o mesmo banco
iniciado pelo Docker sem executar um segundo servidor MySQL.
