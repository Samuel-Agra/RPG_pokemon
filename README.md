# Pokémon RPG

Sistema web para organizar e jogar campanhas de RPG Pokémon. O projeto reúne em uma única interface a administração da campanha, personagens, equipes, Box, Pokédex, lojas, Centro Pokémon, berçário, concursos, batalhas e torneios. A versão 3 acrescenta uma ficha humana para os treinadores, separada das regras de combate dos Pokémon.

O servidor possui dois perfis de acesso:

- **Mestre:** configura a campanha, cria NPCs, organiza batalhas, concursos e torneios e administra os jogadores.
- **Jogador:** controla seu personagem, seus Pokémon, inventário, equipes e participa das atividades abertas pelo Mestre.

## Estado da versão 2

A versão 2 do sistema de contas e mesas está concluída. Ela separa a conta global dos personagens e permite que a mesma conta crie ou participe de diferentes campanhas, sempre com isolamento dos dados por mesa.

O escopo entregue inclui:

- Cadastro, login, logout, sessões conectadas e recuperação por códigos de uso único.
- Perfil público identificado pelo `@`, avatar por link, apresentação e cor personalizada.
- Criação, edição, descoberta, arquivamento, restauração, backup e exclusão de mesas.
- Convites por código ou direcionados a contas, solicitações de entrada e bloqueio de membros.
- Papéis de Proprietário, Mestre auxiliar e Player, com permissões validadas no backend.
- Um personagem por conta em cada mesa, criado no primeiro acesso como Player.
- Chat, presença, notificações da conta e registros isolados por mesa.
- Persistência MySQL transacional e proteção contra mistura de dados entre campanhas.

Não existe papel de Espectador: somente membros da mesa podem acessá-la e acompanhar suas atividades. Hospedagem pública, recuperação por e-mail, a terceira área de comunicação e suporte a outros sistemas de RPG permanecem fora do escopo desta versão. A entrada automática em uma mesa única não será implementada.

## Estado da versão 3

A versão 3 está em desenvolvimento. O backend e as principais telas da ficha do treinador já estão integrados à mesa:

- Criação da ficha em etapas, com valores base ou primeira série válida de rolagens, classe, perícias e equipamento inicial. O jogador escolhe o método; o servidor valida as escolhas.
- Vinte classes, talentos gerais, talentos de classe e ápices, com pré-requisitos e escolhas de progressão. XP, recompensas e alterações de nível têm origem registrada. A atualização da ficha ocorre após a condição de descanso exigida pelas regras.
- Atributos, perícias, resistências, Defesa, iniciativa, PV, condições e rolagens humanas, com resultado no chat da mesa. O Mestre pode consultar e arbitrar as fichas dos jogadores.
- Equipamentos da versão 3 na Bag, incluindo peso, espaços, pilhas, itens equipados, kits, cargas e licenças. Banco e inventários compartilhados aparecem na interface de inventário.
- Fichas simplificadas de NPCs e rolagens dos NPCs em cena.
- Mapa múndi com locais da campanha, posição compartilhada do grupo e planejamento de viagem conduzido pelo Mestre. A duração é sugerida segundo rota e distribuição de meios de transporte.
- Regras humanas de sobrevivência, descanso e atividades de campanha no backend. Captura e efeitos moderados de concursos usam apenas os pontos de integração permitidos para treinadores.

As regras humanas não aumentam dano, precisão, atributos, PP nem outros cálculos dos golpes dos Pokémon em batalha. A interface das atividades de campanha e o acabamento de todos os fluxos autenticados continuam em desenvolvimento.

## Requisitos

- [Node.js](https://nodejs.org/) 16 ou superior (uma versão LTS atual é recomendada).
- npm.
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) com Docker Compose, para executar o MySQL de forma simples.
- Git, para baixar e atualizar o projeto.
- Opcional: `make`, para utilizar os atalhos definidos no `Makefile`.

## Configuração inicial

Clone o repositório e instale as dependências:

```bash
git clone <URL-DO-REPOSITORIO>
cd RPG_pokemon
npm ci
```

Ou, se o comando `make` estiver instalado:

```bash
make install
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

Com `make`, o comando equivalente é:

```bash
make db-up
```

O esquema inicial é aplicado automaticamente na primeira criação do contêiner. Para conferir o estado do banco:

```bash
npm run db:rpg:status
```

Ou:

```bash
make db-status
```

Para encerrar o MySQL sem apagar os dados:

```bash
npm run db:rpg:down
```

Ou:

```bash
make db-down
```

O volume `pokemon-rpg-mysql-data` preserva personagens e campanhas entre reinicializações. Não remova esse volume se quiser manter os dados.

## Executando o RPG

Com o MySQL ativo, inicie o servidor:

```bash
npm start
```

O atalho equivalente compila e inicia o RPG:

```bash
make rpg
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
2. Crie uma conta global ou entre em uma conta existente.
3. Crie uma mesa ou aceite um convite para uma campanha.
4. O proprietário configura a mesa, seus Mestres auxiliares e as permissões da campanha.
5. Ao entrar como Player sem personagem, crie o personagem da mesa. A ficha do treinador pode ser concluída no fluxo seguinte ou posteriormente pela página da ficha.
6. O Mestre pode preparar NPCs, encontros, batalhas, concursos e torneios pela própria interface.

Durante o jogo, os participantes podem administrar equipe, Box, Bag, Pokédex, banco, itens e demais atividades liberadas pelo Mestre. Batalhas e concursos iniciados podem ser assistidos pelos próprios membros da mesa.

## Recursos principais

- Contas independentes das campanhas, com cadastro, sessões por inatividade e recuperação por códigos de uso único.
- Perfil, segurança, sessões conectadas e renovação dos códigos de recuperação na própria interface.
- Personagens de jogadores e biblioteca de NPCs organizável em pastas.
- Equipes predefinidas, Team Builder, evolução e Box.
- Pokédex por região, formas alternativas e progresso individual.
- Bag, itens equipáveis, peso e capacidade de carga, lojas, Pokécoin, banco e inventários compartilhados.
- Centro Pokémon, berçário, ovos, treinamento e paleontologia.
- Batalhas individuais e multijogador, condições iniciais e acompanhamento pelos membros da mesa.
- Concursos solo, em dupla ou trio, com categorias, animações e pontuação.
- Torneios de batalha e concurso com chaveamento e disputa pelo terceiro lugar.
- Ficha humana do treinador, progressão, talentos, condições e descansos.
- Mapa múndi, viagem em grupo, relógio da campanha, eventos dependentes do tempo e anotações do Mestre.

## Verificação do projeto

Para executar lint, build, testes do servidor e simulador e verificação TypeScript:

```bash
npm test
```

O comando equivalente para a revisão completa é:

```bash
npm run full-test
```

Pelo `Makefile`, execute a suíte do RPG com:

```bash
make test-rpg
```

Também estão disponíveis:

```bash
npm run lint:rpg
npm run tsc
npm run test:rpg
```

Os principais comandos equivalentes do `Makefile` são:

```bash
make build
make typecheck
make lint-rpg
make test-rpg
```

Também existem testes separados por área:

```bash
make test-rpg-battle
make test-rpg-nursery
make test-rpg-shop
make test-rpg-inventory
make test-rpg-team
make test-rpg-fossil
make test-rpg-world
make test-rpg-ui
```

Use `make help` para visualizar todos os atalhos disponíveis. No Windows, `make` não acompanha o PowerShell por padrão; ele pode ser usado pelo Git Bash, WSL ou por uma instalação própria do GNU Make. Os comandos `npm` continuam funcionando sem `make`.

## Dados, recursos e licenças

Os dados persistentes do RPG ficam no MySQL. Arquivos como `package.json`, `package-lock.json` e `tsconfig.json` configuram o projeto e não armazenam progresso dos jogadores.

Consulte [RPG-CREDITS-AND-LICENSES.md](RPG-CREDITS-AND-LICENSES.md) para os créditos e licenças dos recursos utilizados e [RPG-ASSET-POLICY.md](RPG-ASSET-POLICY.md) antes de adicionar novos sprites, imagens ou áudios.

Pokémon e seus elementos relacionados pertencem aos respectivos titulares. Este é um projeto de fã e não possui afiliação oficial com Nintendo, Game Freak ou The Pokémon Company.
