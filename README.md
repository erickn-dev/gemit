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
gemit doctor         # verifica configuração
gemit -v             # versão
```

## Provedores suportados

- `google`
- `openai`
- `anthropic`
