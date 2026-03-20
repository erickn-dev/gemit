# gemit-cli

CLI para sugerir mensagens de commit e nomes de branch com IA.

## Site

[Acesse o site do Gemit](https://erickn-dev.github.io/gemit-site/)

## Instalação

```bash
npm i -g gemit-cli
```

## Configuração

```bash
gemit init
```

## Uso

```bash
gemit                # sugere commit usando arquivos staged
gemit commit --all   # git add . + fluxo de commit em 4 passos
gemit commit --check # roda lint/test (se existirem) antes do commit
gemit add --all      # equivalente a git add . + sugestão de commit
gemit branch "texto" # sugere branch
gemit pr             # gera título + descrição de PR
gemit log            # resume o trabalho do branch
gemit changelog      # gera changelog em changelogs/nome-data.md
gemit changelog -c 10 # usa apenas os 10 commits mais recentes
gemit doctor         # verifica configuração
gemit -v             # versão
```

## Atualização automática

Ao executar comandos de uso diário, o `gemit` verifica periodicamente se existe versão nova e tenta atualizar via npm global.

Para desativar:

```bash
GEMIT_DISABLE_AUTO_UPDATE=1 gemit commit
$env:GEMIT_DISABLE_AUTO_UPDATE="1"; gemit commit # PowerShell
```

## Provedores suportados

- `google`
- `openai`
- `anthropic`
