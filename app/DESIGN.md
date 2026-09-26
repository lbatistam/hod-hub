# Neutral Modern

O HOD Hub usa uma interface calma, funcional, orientada à operação e sem ornamentos. O conteúdo tem prioridade sobre o chrome.

## Cores

- Fundo: `#FAFAFA`
- Texto: `#111111`
- Destaque: `#2F6FEB`, reservado para ação primária, seleção atual e um elemento principal por tela
- Texto secundário: `#6B6B6B`
- Borda: `#E5E5E5`
- Superfície: `#FFFFFF`
- Sucesso: `#17A34A`
- Atenção: `#EAB308`
- Erro: `#DC2626`

Não usar gradientes. Não inventar cores fora dessa paleta. Fundos não usam preto ou branco puros.

## Tipografia

- Inter, `-apple-system`, `system-ui`, `sans-serif`
- Peso 600 em títulos e 400 no corpo
- Escala: 12, 14, 16, 20, 24, 32, 48 e 64 px
- Altura de linha 1.5 no corpo e 1.2 em títulos
- No máximo três tamanhos de texto por tela

## Componentes

- Botões: raio de 8 px, 10 px vertical e 16 px horizontal
- Cartões: superfície branca, borda de 1 px, raio de 12 px, 20 px internos e sem sombra
- Campos: borda de 1 px, raio de 8 px e foco azul-cobalto
- Links: azul-cobalto, sublinhado apenas ao passar o cursor
- Controles equivalentes devem compartilhar geometria, estados e comportamento em todas as páginas

## Layout

- Desktop: grade de 12 colunas, largura máxima de 1200 px e gutters de 24 px
- Tablet: 8 colunas e gutters de 16 px
- Celular: 4 colunas e gutters de 12 px
- Espaço em branco é o separador principal
- Apenas dois níveis de profundidade: plano e elevado; elevação apenas em menus, modais e elementos flutuantes

## Direção

- Ao decidir entre adicionar e remover, remover
- Navegação lateral compacta por ícones, com item ativo tratado como segmento independente
- Marca escrita somente como `HOD Hub`, acompanhada por um ícone `H` simples
- Movimento comunica estado e feedback; nunca é decoração
- Respeitar `prefers-reduced-motion`
