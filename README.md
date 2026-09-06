# Pokémon RPG

Sistema web para organizar e jogar campanhas de RPG Pokémon. O projeto reúne em uma única interface a administração da campanha, personagens, equipes, Box, Pokédex, lojas, Centro Pokémon, berçário, concursos, batalhas e torneios.

O servidor possui dois perfis de acesso:

- **Mestre:** configura a campanha, cria NPCs, organiza batalhas, concursos e torneios e administra os jogadores.
- **Jogador:** controla seu personagem, seus Pokémon, inventário, equipes e participa das atividades abertas pelo Mestre.

## Requisitos

- [Node.js](https://nodejs.org/) 16 ou superior (uma versão LTS atual é recomendada).
- npm.
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) com Docker Compose, para executar o MySQL de forma simples.
- Git, para baixar e atualizar o projeto.

## Configuração inicial

Clone o repositório e instale as dependências:

```bash
git clone <URL-DO-REPOSITORIO>
cd RPG_pokemon
npm ci
```

Crie o arquivo de configuração do banco a partir do exemplo:

**Windows (PowerShell):**

```powershell
Copy-Item .env.mysql.example .env.mysql
```

**Linux/macOS:**

```bash
cp .env.mysql.example .env.mysql
```

Abra `.env.mysql` e substitua as senhas de exemplo. O arquivo contém o banco, usuário e senha utilizados pelo MySQL:

```dotenv
MYSQL_DATABASE=pokemon_rpg
MYSQL_USER=pokemon_rpg
MYSQL_PASSWORD=escolha-uma-senha
MYSQL_ROOT_PASSWORD=escolha-outra-senha
```

Essas credenciais e os dados dos jogadores são locais e não devem ser enviados ao Git.

Depois, prepare a configuração do servidor caso ainda não exista:

**Windows (PowerShell):**

```powershell
Copy-Item config/config-example.js config/config.js
```

**Linux/macOS:**

```bash
cp config/config-example.js config/config.js
```

Em `config/config.js`, altere obrigatoriamente `rpgmastercode`. Esse é o código usado para entrar como Mestre:

```js
exports.rpgmastercode = 'coloque-um-codigo-seguro-aqui';
```

Não publique seu `config/config.js` nem compartilhe o código do Mestre.

## Banco de dados

Com o Docker Desktop aberto, inicie o MySQL:

```bash
npm run db:rpg:up
```

O esquema inicial é aplicado automaticamente na primeira criação do contêiner. Para conferir o estado do banco:

```bash
npm run db:rpg:status
```

Para encerrar o MySQL sem apagar os dados:

```bash
npm run db:rpg:down
```

O volume `pokemon-rpg-mysql-data` preserva personagens e campanhas entre reinicializações. Não remova esse volume se quiser manter os dados.

## Executando o RPG

Com o MySQL ativo, inicie o servidor:

```bash
npm start
```

Abra no navegador:

```text
http://127.0.0.1:8000/rpg/
```

Para usar outra porta:

```bash
npm start -- 8080
```

Nesse exemplo, o endereço passa a ser `http://127.0.0.1:8080/rpg/`.

### Jogando pela rede local

O servidor escuta em `0.0.0.0` por padrão. Outros dispositivos na mesma rede podem acessar pelo IPv4 do computador que está executando o RPG:

```text
http://IP-DO-COMPUTADOR:8000/rpg/
```

No Windows, use `ipconfig` para encontrar o endereço IPv4. Talvez seja necessário autorizar o Node.js no Firewall do Windows. Não encaminhe a porta para a internet sem configurar HTTPS, senhas seguras, firewall e uma estratégia de backup.

## Como iniciar uma campanha

1. Inicie o MySQL e o servidor RPG.
2. Entre como Mestre usando o código definido em `rpgmastercode`.
3. Configure o nome, a data e as permissões da campanha.
4. Crie ou libere os personagens dos jogadores.
5. Os jogadores entram com o personagem e a senha correspondentes.
6. O Mestre pode preparar NPCs, encontros, batalhas, concursos e torneios pela própria interface.

Durante o jogo, os participantes podem administrar equipe, Box, Bag, Pokédex, banco, itens e demais atividades liberadas pelo Mestre. Batalhas e concursos iniciados aparecem para os participantes e, quando permitido, para espectadores.

## Recursos principais

- Personagens de jogadores e biblioteca de NPCs organizável em pastas.
- Equipes predefinidas, Team Builder, evolução e Box.
- Pokédex por região, formas alternativas e progresso individual.
- Bag, itens equipáveis, lojas, Pokécoin e banco.
- Centro Pokémon, berçário, ovos, treinamento e paleontologia.
- Batalhas individuais e multijogador, condições iniciais e espectadores.
- Concursos solo, em dupla ou trio, com categorias, animações e pontuação.
- Torneios de batalha e concurso com chaveamento e disputa pelo terceiro lugar.
- Relógio da campanha, eventos dependentes do tempo e anotações do Mestre.

## Verificação do projeto

Para executar lint, verificação TypeScript e todos os testes do RPG:

```bash
npm run full-test
```

Também estão disponíveis:

```bash
npm run lint:rpg
npm run tsc
npm run test:rpg
```

## Dados, recursos e licenças

Os dados persistentes do RPG ficam no MySQL. Arquivos como `package.json`, `package-lock.json` e `tsconfig.json` configuram o projeto e não armazenam progresso dos jogadores.

Consulte [RPG-CREDITS-AND-LICENSES.md](RPG-CREDITS-AND-LICENSES.md) para os créditos e licenças dos recursos utilizados e [RPG-ASSET-POLICY.md](RPG-ASSET-POLICY.md) antes de adicionar novos sprites, imagens ou áudios.

Pokémon e seus elementos relacionados pertencem aos respectivos titulares. Este é um projeto de fã e não possui afiliação oficial com Nintendo, Game Freak ou The Pokémon Company.
