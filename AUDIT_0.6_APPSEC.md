# Revisão e AppSec · BRAIN PRO 0.6

Data da revisão inicial: 2026-07-26.

Esta auditoria acompanha cada microetapa. O foco não é apenas segurança de rede:
um simulador também precisa proteger integridade numérica, limites de memória,
ordem de eventos e a fronteira Wasm contra entradas hostis ou acidentais.

## 0.6-a · Contrato laminar

Superfície revisada:

- construção de `LaminarConfig`;
- matriz alvo × origem;
- conversão de IDs de camada;
- drives externos;
- crescimento de estado e mensagens de erro.

### Controles confirmados

- números negativos, infinitos e `NaN` são rejeitados;
- IDs fora de L1–L6 são rejeitados;
- projeções não classificadas não entram no solver;
- o estado tem tamanho fixo e não aloca durante `step`;
- a atualização do tick usa soma verificada.

### Achados

| ID | Severidade | Estado | Descrição |
| :-- | :-- | :-- | :-- |
| L06-A-01 | média | fechado | ganhos agora são limitados por `MAX_LAMINAR_GAIN`; o limite e o primeiro valor acima dele possuem testes |
| L06-A-02 | média | fechado | drives externos agora são limitados por `MAX_EXTERNAL_DRIVE`, antes de qualquer multiplicação |

Critério de fechamento: tetos nomeados, erro explícito e testes nos limites e
imediatamente acima deles.

Fechamento: `ParameterOutOfRange` distingue valores finitos excessivos de
`NaN`/infinito/negativo. Nenhum valor fora do envelope chega ao solver.

## 0.6-b · Relé talâmico e TRN

Superfície revisada:

- construção das linhas de atraso;
- ganhos do laço relé–TRN–L6;
- drives sensorial e contextual;
- estados de relé, TRN, rebote e coluna laminar;
- reinicialização dos cursores e buffers.

### Controles confirmados

- o circuito é determinístico e não usa `unsafe`;
- todos os estados dinâmicos passam por relaxação limitada a `[0,1]`;
- os atrasos são buffers privados e reinicializáveis;
- nenhum estado fisiológico é aceito diretamente da apresentação.

### Achados

| ID | Severidade | Estado | Descrição |
| :-- | :-- | :-- | :-- |
| L06-B-01 | alta | fechado | a linha de atraso é construída por contagem verificada e rejeitada acima de `MAX_CORTICOTHALAMIC_DELAY_STEPS`, sem depender da resolução de `Duration` |
| L06-B-02 | média | fechado | ganhos e drives possuem tetos públicos e são rejeitados antes das multiplicações |

Correção confirmada: a conversão de atraso não faz cast de ponto flutuante nem
aloca antes de concluir a contagem; os testes cobrem `dt` subnanosegundo, ganho
imediatamente acima do teto e drive excessivo.

## 0.6-c · ABI Wasm e Worker

Superfície revisada:

- quinze buffers de topologia recebidos pelo construtor Wasm;
- alvo de tick recebido em cada comando;
- treze buffers transferíveis do snapshot;
- hashes legado e córtico-talâmico;
- fallback diagnóstico e descarte da instância Wasm.

### Controles confirmados

- comprimentos paralelos de sinapses são comparados antes do `zip`;
- tipos de neurônio fora do contrato são rejeitados;
- o snapshot laminar tem tamanho fixo em Rust;
- cada `ArrayBuffer` transferido aparece uma única vez;
- o fallback publica zeros e informa degradação;
- o hash 0.5 permanece separado do novo hash córtico-talâmico.

### Achados

| ID | Severidade | Estado | Descrição |
| :-- | :-- | :-- | :-- |
| L06-C-01 | alta | fechado | host e construtor Wasm aplicam cotas iguais para nós, sinapses, vértices e arestas antes de construir o motor |
| L06-C-02 | alta | fechado | host e adaptador Wasm rejeitam mais de 600 ticks em um único comando |

Correção confirmada: as cotas são públicas e os testes cobrem o valor máximo, o
primeiro valor acima dele e regressão de tick. O adaptador Rust repete as
verificações mesmo quando o host TypeScript é contornado.

## 0.6-d · Aba Lâminas

Superfície revisada:

- alternância entre Visão Geral e Lâminas;
- seleção de LOD;
- leitura dos doze estados E/I e cinco escalares;
- orçamento de geometrias e vias;
- foco por teclado e preferência de movimento reduzido.

### Controles confirmados

- a geometria não escreve no snapshot nem executa equações;
- índices ausentes recebem apenas zero visual;
- há seis meshes E, seis anéis I, nove vias interestruturais e seis recorrências
  L1–L6; curvas e pulsos leem somente o snapshot;
- LOD só reduz apresentação e não altera o motor;
- painéis inativos usam `hidden`;
- o enquadramento foi verificado nas duas vistas.

### Achados

| ID | Severidade | Estado | Descrição |
| :-- | :-- | :-- | :-- |
| L06-D-01 | média | fechado | abas usam foco roving e respondem a setas, Home e End |
| L06-D-02 | baixa | fechado | parsers fechados rejeitam vistas e níveis de LOD desconhecidos |
| L06-D-03 | baixa | fechado | `rotationSpeed = 0` remove rotação e balanço ornamental da coluna |

Correção confirmada: testes cobrem entradas válidas e inválidas; a inspeção no
navegador confirmou seleção, painel ativo, métricas e foco coerentes.

## 0.6-e · Perfil, documentação e automações

Superfície revisada:

- geração remota e commit do SVG SIGNALS;
- captura do GIF e carimbo de SHA no README;
- permissões e versões das Actions;
- CSP do aplicativo Tauri;
- dependências npm e duplicações Cargo;
- nomes, versões, cronologia e referências públicas;
- inventário de arquivos versionados e metadados locais.

### Controles confirmados

- Actions de terceiros estão fixadas por SHA completo;
- workflows de escrita limitam `contents: write` ao próprio job;
- GIF é rejeitado vazio, sem assinatura ou acima de 5 MiB;
- `npm audit --omit=dev` não encontrou vulnerabilidades;
- a cronologia separa 2025 pessoal do Git iniciado em 2026-07-20;
- Kandel aparece como estudo, não como calibração;
- código e documentos versionados não citam ferramentas de autoria.

### Achados

| ID | Severidade | Estado | Descrição |
| :-- | :-- | :-- | :-- |
| L06-E-01 | alta | fechado | `foreignObject` é removido e scripts, handlers, entidades, referências externas e URLs ativas são rejeitados antes do commit |
| L06-E-02 | média | fechado | repetir o carimbo com o mesmo SHA preserva o README sem erro |
| L06-E-03 | baixa | fechado | o índice local foi regenerado somente com referências Git existentes |

Correção confirmada: o sanitizador possui testes de remoção, rejeição e
referência local permitida; o carimbo possui teste de repetição; a busca final
em arquivos e metadados não encontra resíduos de ferramentas de autoria.
