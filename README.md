# gemit-cli

CLI para sugerir mensagens de commit e nomes de branch com IA.

## Instalação

```bash
npm install -g @ericknovaes56/gemit-cli
```

## Configuração

```bash
gemit init
```

Opcional (somente no projeto atual):

```bash
gemit init --local
```

## Uso

```bash
gemit                # sugere commit (padrão)
gemit commit         # sugere commit
gemit branch "texto" # sugere branch
gemit pr             # gera título + descrição de PR
gemit log            # resume o trabalho do branch
gemit changelog      # gera changelog em changelogs/nome-data.md
gemit doctor         # verifica configuração
gemit -v             # versão
```

## Provedores suportados

- `google`
- `openai`
- `anthropic`
