# Reconciliação · o que este conjunto documental errou e o que foi corrigido

**Data:** 22 de agosto de 2026
**Motivo:** os documentos deste diretório foram escritos em 21 de agosto de 2026 sem conhecimento de que o programa **já existe, com código, em outros dois repositórios**. Parte do que foi planejado aqui já está construído; parte contradiz convenções vigentes.
**Regra que este arquivo aplica:** documentação que descreve um sistema inexistente é pior do que documentação ausente.

## 1 · O que existe de fato

| Repositório | Papel | Estado verificado |
| :-- | :-- | :-- |
| motor | 54 crates em cinco camadas, 3 aplicações, orquestrador, 20 documentos numerados, 11 decisões arquiteturais registradas, roteiro de 50 fases | código real, workspace ativo |
| laboratório | 7 frentes nomeadas, RFCs, matriz de soluções com 21 problemas, protocolo de pesquisa, protótipos | pesquisa madura; um protótipo iniciado |
| BRAIN PRO (este repositório) | ciência determinística, pilha web promovida | intocado |

## 2 · Os erros

| # | Erro | Onde | Correção |
| :-- | :-- | :-- | :-- |
| E-01 | inventou 84 crates com prefixo `um_*` | catálogo | catálogo reescrito com o inventário real |
| E-02 | violou a convenção de nomes vigente: bibliotecas genéricas recebem nome próprio feminino, e o prefixo `unrail_` pertence às crates internas do motor | todos os documentos | catálogo e este arquivo corrigidos; os demais aguardam passagem — ver §4 |
| E-03 | propôs criar um workspace `engine/` dentro deste repositório | arquitetura, roadmap | o motor já tem repositório próprio; nada de motor entra aqui |
| E-04 | propôs um roteiro U0–U9 paralelo | roadmap | o motor já tem roteiro de 50 fases; o que falta é um roteiro **de integração**, não de motor |
| E-05 | tratou o primeiro runner nativo como novidade a criar | fatia vertical 0 | a aplicação de runtime já existe; o que não existe é a camada `neuro_*` |
| E-06 | apresentou como planejamento aquilo que já é diretiva oficial: renderização por `draw_indirect`, tabela hash perfeita para reflexão, arquétipos densos | teardown, fatia 0 | registrado como confirmação, não como proposta |

## 3 · O que continua válido

Nem tudo caiu. O que sobreviveu ao contato com a realidade:

| Item | Onde | Por que continua valendo |
| :-- | :-- | :-- |
| disciplina de sigilo do vocabulário | léxico | este repositório é público; a regra vale aqui, e só aqui |
| a regra “nenhum tipo emprestado na API pública” | escada de dependências | **confirmada em campo**: tipos de uma biblioteca de álgebra de terceiros alcançam a fachada pública do motor pela cadeia de reexportações, e a linha de base que deveria detectar isso registra apenas globos não expandidos |
| herança de proveniência, orçamento e determinismo do BRAIN PRO | arquitetura | continua sendo o diferencial que o motor genérico não tem |
| a lista do que falta para um simulador cirúrgico | catálogo §5 | nenhuma das nove capacidades existe no inventário atual |
| o mapeamento dos cinco passos da proposta gráfica | fatia vertical 0 | válido como especificação de produto, inválido como plano de motor |

## 4 · Passagem pendente

Os documentos abaixo ainda contêm nomenclatura `um_*` e devem ser lidos com esta
correção em mente até receberem a passagem:

| Documento | O que muda | Prioridade |
| :-- | :-- | :-- |
| [arquitetura](UNRAIL_ARCHITECTURE.md) | anéis → as cinco camadas reais; remover a proposta de workspace local; manter as regras de fronteira | alta |
| [roadmap](UNRAIL_ROADMAP.md) | U0–U9 → roteiro de integração `neuro_*` sobre o motor existente | alta |
| [fatia vertical 0](UNRAIL_SLICE_0.md) | reescrever sobre as crates reais; virar especificação da camada de produto | média |
| [escada de dependências](UNRAIL_DEPENDENCY_LADDER.md) | os empréstimos reais são os do motor, não os que imaginei | média |
| [desmontagem](UNRAIL_REFERENCE_TEARDOWN.md) | conteúdo analítico continua válido; ajustar as colunas de destino | baixa |
| [léxico](UNRAIL_GLOSSARY.md) | trocar a tabela de termos `um_*` pelos nomes reais | baixa |

## 5 · O achado que a reconciliação produziu

O único item deste conjunto que já se pagou: a regra de que **nenhum tipo
emprestado atravessa a fachada pública**. Aplicada ao motor real, ela revelou
que a linha de base de API pública registra os treze módulos do núcleo como
globos não expandidos — o que torna o portão de compatibilidade incapaz de
detectar mudança de assinatura dentro de qualquer crate do núcleo.

A descrição completa, com evidência por arquivo e linha, está registrada no
laboratório, na parte de rastreabilidade do livro de rascunhos.

Achado errado no plano, certo no diagnóstico. É o resultado que justifica ter
escrito o conjunto, e o motivo pelo qual ele é corrigido em vez de apagado.
