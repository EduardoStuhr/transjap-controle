# Transjap Sistema - iOS, TestFlight e App Store

Este projeto ja esta preparado para iPhone, iPad, TestFlight e App Store usando Capacitor 8.

## Dados do app

- Nome: Transjap Sistema
- Bundle ID: `br.com.transjap.manager`
- Dominio principal: `https://sistema-transjap.com.br`
- Plataforma minima: iOS 15.0
- Categoria App Store: Business
- App icon fonte: `public/logoapp.png`
- Projeto Xcode: `ios/App/App.xcodeproj`
- Team ID placeholder: `XXXXXXXXXX`

## O que foi configurado

- Plataforma iOS em `ios/`
- `@capacitor/ios` instalado
- App abre direto em `https://sistema-transjap.com.br`
- Cleartext/HTTP bloqueado
- ATS com excecao apenas para `sistema-transjap.com.br` via HTTPS/TLS
- `WKAppBoundDomains` e `limitsNavigationsToAppBoundDomains`
- Associated Domains para Universal Links
- Cookies persistentes via `WKWebsiteDataStore` padrao do WKWebView
- Splash screen e AppIcon iOS gerados a partir do logo oficial
- Privacy manifest em `ios/App/App/PrivacyInfo.xcprivacy`
- Camera usage string para scanner QR/barcode web
- Pull to refresh nativo
- Swipe back/forward no WKWebView
- Tela offline local com reconexao automatica
- PWA manifest, apple touch icon e icons 192/512
- Build number automatico por timestamp

## Instalar Xcode no Mac

1. Use macOS atualizado.
2. Instale Xcode pela Mac App Store.
3. Abra o Xcode uma vez para aceitar licencas e instalar componentes.
4. Rode no Terminal:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
xcodebuild -version
```

App Store Connect aceita uploads de iOS com Xcode suportado pela Apple. Em 2026, use Xcode 16 ou superior para builds iOS destinados a distribuicao.

Referencias Apple:
- Upload de builds: https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/
- Screenshot specs: https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications
- Privacy manifest: https://developer.apple.com/documentation/bundleresources/privacy-manifest-files

## Abrir no Mac

No Mac, dentro da raiz do projeto:

```bash
npm ci
export APPLE_TEAM_ID=SEU_TEAM_ID
npm run ios:sync
npm run ios:open
```

No Xcode:

1. Selecione o target `App`.
2. Em Signing & Capabilities, escolha seu Team real.
3. Confirme Bundle Identifier: `br.com.transjap.manager`.
4. Confirme Deployment Target: `15.0`.
5. Confirme Capabilities: Associated Domains.
6. Troque `XXXXXXXXXX` pelo Team ID real se o script ainda nao tiver feito isso.

## Certificado e provisioning profile

Para assinatura automatica:

1. Entre em https://developer.apple.com/account.
2. Confirme que a conta esta no Apple Developer Program.
3. Em Certificates, Identifiers & Profiles, crie ou confirme:
   - App ID: `br.com.transjap.manager`
   - Capability: Associated Domains
4. No Xcode, marque Automatically manage signing.
5. Selecione o Team correto.
6. O Xcode cria/atualiza o provisioning profile automaticamente.

Para assinatura manual:

1. Crie um certificado Apple Distribution.
2. Crie um App Store provisioning profile para `br.com.transjap.manager`.
3. Baixe e instale no Mac.
4. No Xcode, desative Automatically manage signing e selecione profile/certificado.

## Universal Links

O app ja declara:

```text
applinks:sistema-transjap.com.br
```

O dominio precisa servir este arquivo, sem redirect e com HTTPS:

```text
https://sistema-transjap.com.br/.well-known/apple-app-site-association
```

Exemplo, substituindo `SEU_TEAM_ID` pelo Team ID real:

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "SEU_TEAM_ID.br.com.transjap.manager",
        "paths": ["/*"]
      }
    ]
  }
}
```

Cloudflare deve entregar `application/json` ou `application/pkcs7-mime` e nao deve bloquear o Apple bot.

## Gerar build e IPA

Com signing configurado no Mac:

```bash
export APPLE_TEAM_ID=SEU_TEAM_ID
npm run ios:sync
npm run ios:build
npm run ios:archive
```

O IPA exportado ficara em:

```text
build/ios/ipa/Transjap Sistema.ipa
```

Se o nome final variar por configuracao do Xcode, procure em:

```text
build/ios/ipa/
```

## Enviar para TestFlight

Opcao Xcode:

1. Xcode > Product > Archive.
2. Organizer abre automaticamente.
3. Selecione o archive.
4. Clique Distribute App.
5. Escolha App Store Connect.
6. Escolha Upload.
7. Envie e aguarde processamento.

Opcao Transporter:

1. Instale Transporter pela Mac App Store.
2. Abra o IPA em `build/ios/ipa/`.
3. Faca login com conta Apple Developer.
4. Clique Deliver.

Depois em App Store Connect:

1. Apps > Transjap Sistema > TestFlight.
2. Aguarde processamento do build.
3. Preencha beta app review info se usar teste externo.
4. Adicione testers internos ou externos.

## Publicar na App Store

1. App Store Connect > Apps > Novo App.
2. Nome: Transjap Sistema.
3. Bundle ID: `br.com.transjap.manager`.
4. SKU sugerido: `transjap-manager-ios`.
5. Categoria primaria: Business.
6. Preencha App Privacy conforme uso real do sistema web.
7. Selecione o build processado.
8. Adicione screenshots.
9. Preencha descricao, keywords, suporte e politica de privacidade.
10. Envie para App Review.

## Metadata base

Nome:

```text
Transjap Sistema
```

Subtitulo:

```text
Gestao operacional TransJap
```

Descricao curta:

```text
Aplicativo interno para gestao operacional, manutencao, estoque, calendario e indicadores da frota TransJap.
```

Keywords:

```text
transjap,gestao,frota,manutencao,estoque,operacional,logistica
```

Categoria:

```text
Business
```

Export compliance:

```text
Uses Non-Exempt Encryption: No
```

## Screenshots necessarias

Apple permite de 1 a 10 screenshots por tamanho. Como o app suporta iPhone e iPad, envie pelo menos:

- iPhone 6.9": `1260 x 2736`, `1290 x 2796` ou `1320 x 2868` portrait.
- iPad 13": `2064 x 2752` ou `2048 x 2732` portrait.

Tambem e recomendavel incluir:

- iPhone 6.5": `1284 x 2778` ou `1242 x 2688`.
- iPhone 6.1": `1170 x 2532`, `1125 x 2436` ou `1080 x 2340`.
- iPad 11": `1488 x 2266`, `1668 x 2420`, `1668 x 2388` ou `1640 x 2360`.

Use telas reais do app: login, dashboard, estoque, manutencao, calendario e relatorios.

## Scripts disponiveis

```bash
npm run ios:assets
npm run ios:version
npm run ios:sync
npm run ios:open
npm run ios:build
npm run ios:archive
```

Variaveis opcionais:

```bash
export APPLE_TEAM_ID=SEU_TEAM_ID
export IOS_VERSION=1.0.0
export IOS_BUILD_NUMBER=100
```

Sem `IOS_BUILD_NUMBER`, o projeto usa timestamp automatico.

## Checklist final App Store

- Apple Developer Program ativo.
- Bundle ID criado: `br.com.transjap.manager`.
- Associated Domains habilitado no App ID.
- `apple-app-site-association` publicado no dominio.
- Team ID real configurado no Xcode ou via `APPLE_TEAM_ID`.
- `npm run ios:sync` executado no Mac.
- Archive gerado em Release.
- IPA exportado em `build/ios/ipa/`.
- Build enviado para App Store Connect.
- TestFlight validado em iPhone e iPad reais.
- App Privacy preenchido conforme dados coletados pelo sistema web.
- Politica de privacidade publicada.
- Screenshots iPhone 6.9" e iPad 13" enviados.
- Descricao, keywords, categoria Business e suporte preenchidos.
