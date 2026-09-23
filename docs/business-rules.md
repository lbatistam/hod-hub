# Regras de negócio

## Estados operacionais

| Estado | Significado |
| --- | --- |
| Agendada | Consultoria futura ou ainda não iniciada |
| Acontecendo | Horário atual dentro da janela da consultoria |
| Compareceu | Presença marcada explicitamente |
| No-show | Ausência, recusa ou estado equivalente definido pela operação |
| Cancelada | Evento encerrado sem continuidade operacional |

## Confirmação

Confirmação e presença são dimensões diferentes. Um lead confirmado não é automaticamente contado como comparecimento. Confirmação pendente também não define no-show antes da reunião.

## Histórico e reagendamento

Reagendamento é uma classificação histórica. O registro anterior permanece disponível e o novo evento entra no fluxo. Isso evita que uma alteração de data apague a trajetória do lead.

## Over

Over é uma categoria operacional independente. Não deve ser tratado como closer nem contaminar rankings e taxas dos closers.

## Qualificados no dia

Representa leads cuja qualificação/agendamento foi criado no dia analisado. A data de criação e a data da reunião são campos separados.

## Eventos recusados

Quando a fonte indica recusa do evento, o sistema pode classificá-lo como no-show e apresentar o nome riscado. A interpretação ocorre na API para permanecer consistente em todas as telas.

## Tempo

Todas as comparações operacionais usam `America/Sao_Paulo`. Datas de criação, datas da reunião e horário atual não devem ser concatenados ou tratados como o mesmo valor.

