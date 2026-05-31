# Testes manuais de visibilidade de tarefas

Regra definida para este modulo: admin nao ve todas as tarefas por padrao. Admin so acessa tarefa como participante, igual aos demais usuarios. O bypass global de admin esta desligado no codigo (`ADMIN_CAN_VIEW_ALL_TASKS = false`).

## Cenario A: Eduardo cria tarefa para Luiz

1. Entrar como Eduardo.
2. Criar tarefa com destinatario Luiz.
3. Confirmar que Eduardo ve a tarefa em `Agenda > Todas`.
4. Entrar como Luiz.
5. Confirmar que Luiz ve a tarefa em `Agenda > Todas` e nos filtros aplicaveis.
6. Entrar como Davi.
7. Confirmar que Davi nao ve a tarefa em `Todas`, `Em andamento`, `Nao visualizado`, `Aguardando aprovacao`, `Aguardando pecas`, `Concluido` ou `Atrasado`.

## Cenario B: Luiz responde tarefa criada por Eduardo

1. Entrar como Luiz.
2. Abrir a tarefa criada por Eduardo e enviar uma resposta.
3. Confirmar no debug ou no banco que `createdBy`/`created_by` continua Eduardo.
4. Confirmar que o autor da resposta e Luiz.
5. Entrar como Eduardo e confirmar que a tarefa continua visivel.
6. Entrar como Luiz e confirmar que a tarefa continua visivel.
7. Entrar como Davi e confirmar que a tarefa continua invisivel.

## Cenario C: Luiz cria tarefa para Eduardo

1. Entrar como Luiz.
2. Criar tarefa com destinatario Eduardo.
3. Confirmar que Luiz ve a tarefa.
4. Entrar como Eduardo e confirmar que Eduardo ve a tarefa.
5. Entrar como Davi e confirmar que Davi nao ve a tarefa.

## Cenario D: debug no console

1. No navegador, executar:

```js
localStorage.setItem("debugTasksVisibility", "1");
```

2. Recarregar a Agenda.
3. Conferir no console uma tabela com `taskId`, `title`, `createdBy`, `createdById`, `assignedTo`, `recipientId`, `sharedWith`, `currentUserId`, `currentUserRole` e `visibleReason`.
4. Para desligar:

```js
localStorage.removeItem("debugTasksVisibility");
```
