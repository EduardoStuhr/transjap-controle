# Transjap Sistema Android

Aplicativo Android Capacitor para abrir `https://sistema-transjap.com.br` com package ID `br.com.transjap.manager`.

## Requisitos locais

1. Instale o Android Studio.
2. Instale Android SDK 36 pelo SDK Manager.
3. Configure `JAVA_HOME` para o JDK do Android Studio, normalmente `C:\Program Files\Android\Android Studio\jbr`.
4. Configure `ANDROID_HOME` para o SDK, normalmente `C:\Users\<usuario>\AppData\Local\Android\Sdk`.

## Abrir no Android Studio

1. Rode `npm run cap:prepare`.
2. Rode `npm run android:open`.
3. No Android Studio, aguarde o Gradle sincronizar.
4. Selecione um dispositivo Android 10+ ou emulador e execute `app`.

## Gerar APK

1. Confirme que o Android Studio está instalado com Android SDK e JDK configurados.
2. Rode `npm run cap:prepare`.
3. Rode `npm run android:apk`.
4. O APK release fica em `android/app/build/outputs/apk/release/`.

## Gerar AAB

1. Rode `npm run cap:prepare`.
2. Rode `npm run android:aab`.
3. O bundle para Google Play fica em `android/app/build/outputs/bundle/release/app-release.aab`.

## Assinatura release

Crie um keystore fora do Git:

```powershell
keytool -genkeypair -v -keystore transjap-manager-release.jks -alias transjap-manager -keyalg RSA -keysize 2048 -validity 10000
```

Copie `android/keystore.properties.example` para `android/keystore.properties` e preencha as senhas reais. O arquivo `keystore.properties` e o `.jks` não devem entrar no Git.

Depois rode:

```powershell
npm run android:aab
```

Também é possível assinar pelo Android Studio em `Build > Generate Signed Bundle / APK`, escolher `Android App Bundle`, selecionar o keystore e gerar o `.aab` assinado.

## Publicar na Play Store

1. Crie o app no Play Console como `Transjap Sistema`.
2. Use o package ID `br.com.transjap.manager`.
3. Envie o `.aab` assinado.
4. Preencha ficha da loja, classificação indicativa, segurança de dados e política de privacidade.
5. Use canal de teste interno antes da produção.

## Deep links

O manifesto Android já aceita links `https://sistema-transjap.com.br`. Para Android App Links verificados, publique um `assetlinks.json` em:

`https://sistema-transjap.com.br/.well-known/assetlinks.json`

O SHA-256 definitivo vem do certificado de assinatura usado na Play Store.
