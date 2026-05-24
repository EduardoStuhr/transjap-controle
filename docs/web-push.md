# Notificacoes Web Push

O sistema registra subscriptions por usuario em `push_subscriptions` e envia notificacoes de
novas tarefas apenas aos destinatarios selecionados. O envio roda no Cloudflare Worker usando
Web Crypto e nao grava a chave privada no frontend ou no repositorio.

## Configuracao VAPID

1. Gere um par de chaves localmente:

   ```bash
   npm run vapid:generate
   ```

2. Cadastre os tres valores como secrets no Worker:

   ```bash
   npx wrangler secret put VAPID_PUBLIC_KEY
   npx wrangler secret put VAPID_PRIVATE_KEY
   npx wrangler secret put VAPID_SUBJECT
   ```

   Em `VAPID_SUBJECT`, use um contato valido, por exemplo
   `mailto:suporte@sistema-transjap.com.br`.

3. Aplique a migracao do D1 ao publicar uma instalacao existente:

   ```bash
   npm run db:migrate:remote
   ```

   A API tambem cria a tabela automaticamente caso a migracao ainda nao tenha sido aplicada.

## Desenvolvimento Local

No arquivo local `.dev.vars`, que nao deve ser versionado, configure:

```dotenv
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:suporte@sistema-transjap.com.br
```

Notificacoes exigem contexto seguro. `localhost` e HTTPS sao aceitos por Chrome e Edge.

## Teste Manual

1. Entre como o usuario destinatario, acesse `Perfil` e ative `Notificacoes do Windows`.
2. Permita notificacoes quando o navegador solicitar.
3. Em outro usuario, crie uma tarefa enviada ao usuario inscrito.
4. Confirme que o Windows exibe `Nova tarefa recebida`.
5. Clique na notificacao e confirme a abertura de `https://sistema-transjap.com.br/agenda`.

Se o remetente tambem estiver selecionado como destinatario, ele tambem recebe a notificacao.
